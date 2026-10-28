// Peg-in-hole: scripted Cartesian impedance controller + learned residual, on MuJoCo WASM.
// A line-for-line port of notes-build/franka/env.py. Runs in the browser and in node (for checks).

export class PegSim {
  constructor(mujoco, mjb, residual) {
    this.mj = mujoco;
    const vfs = new mujoco.MjVFS();
    vfs.addBuffer('peg.mjb', mjb);
    this.m = mujoco.MjModel.mj_loadModel('peg.mjb', vfs);
    vfs.delete();
    this.d = new mujoco.MjData(this.m);
    this.R = residual;
    this.c = residual.cfg;
    this.qPost = residual.q_posture;
    const SITE = mujoco.mjtObj.mjOBJ_SITE.value;
    this.tip = mujoco.mj_name2id(this.m, SITE, 'tip');
    this.ft = mujoco.mj_name2id(this.m, SITE, 'ft');
    this.top = mujoco.mj_name2id(this.m, SITE, 'hole_top');
    this.nv = this.m.nv;
    this.jpB = new mujoco.DoubleBuffer(3 * this.nv);
    this.jrB = new mujoco.DoubleBuffer(3 * this.nv);
    mujoco.mj_forward(this.m, this.d);
    const sx = this.d.site_xpos;
    this.hole = [sx[3 * this.top], sx[3 * this.top + 1], sx[3 * this.top + 2]];
    this.qStart = null;
    this.lo = this.m.actuator_ctrlrange;
  }

  // ---------------------------------------------------- controller
  torque(xd) {
    const { mj, m, d, c, nv } = this;
    mj.mj_jacSite(m, d, this.jpB, this.jrB, this.tip);
    const jp = this.jpB.GetView(), jr = this.jrB.GetView();
    const sx = d.site_xpos, sm = d.site_xmat, qv = d.qvel, qp = d.qpos, bias = d.qfrc_bias;
    const x = [sx[3 * this.tip], sx[3 * this.tip + 1], sx[3 * this.tip + 2]];
    const R = Array.from(sm.subarray(9 * this.tip, 9 * this.tip + 9));     // row-major 3×3
    const v = [0, 0, 0], w = [0, 0, 0];
    for (let i = 0; i < 3; i++) for (let j = 0; j < nv; j++) { v[i] += jp[i * nv + j] * qv[j]; w[i] += jr[i * nv + j] * qv[j]; }
    const K = [c.kxy, c.kxy, c.kz];
    const F = K.map((k, i) => k * (xd[i] - x[i]) - 2 * c.zeta * Math.sqrt(k * c.mass) * v[i]);
    // orientation error towards tool-z-down: er = ½ Σ R[:,i] × Rd[:,i], with Rd = diag(1, −1, −1)
    const Rd = [[1, 0, 0], [0, -1, 0], [0, 0, -1]];
    const er = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const a = [R[i], R[3 + i], R[6 + i]], b = [Rd[0][i], Rd[1][i], Rd[2][i]];
      er[0] += 0.5 * (a[1] * b[2] - a[2] * b[1]); er[1] += 0.5 * (a[2] * b[0] - a[0] * b[2]); er[2] += 0.5 * (a[0] * b[1] - a[1] * b[0]);
    }
    const M = er.map((e, i) => c.kr * e - c.dr * w[i]);
    // J (6×nv), damped pseudo-inverse via (J Jᵀ + λI)⁻¹, null-space posture torque
    const J = [];
    for (let i = 0; i < 3; i++) J.push(Array.from(jp.subarray(i * nv, i * nv + nv)));
    for (let i = 0; i < 3; i++) J.push(Array.from(jr.subarray(i * nv, i * nv + nv)));
    const A = J.map((ri) => J.map((rj) => ri.reduce((s, x2, k) => s + x2 * rj[k], 0)));
    for (let i = 0; i < 6; i++) A[i][i] += 1e-4;
    const Ainv = inv6(A);
    const t0 = Array.from({ length: nv }, (_, j) => c.kn * (this.qPost[j] - qp[j]) - c.dn * qv[j]);
    const Jt0 = J.map((r) => r.reduce((s, x2, k) => s + x2 * t0[k], 0));          // J t0 (6)
    const y = Ainv.map((r) => r.reduce((s, x2, k) => s + x2 * Jt0[k], 0));       // (J Jᵀ)⁻¹ J t0
    const FM = [...F, ...M], tau = new Array(nv);
    for (let j = 0; j < nv; j++) {
      let s = bias[j] + t0[j];
      for (let i = 0; i < 6; i++) s += J[i][j] * (FM[i] - y[i]);                   // Jᵀ F + (I − Jᵀ J⁺ᵀ) t0
      tau[j] = Math.min(this.lo[2 * j + 1], Math.max(this.lo[2 * j], s));
    }
    return tau;
  }

  step(xd) {
    const tau = this.torque(xd), ctrl = this.d.ctrl;
    for (let j = 0; j < tau.length; j++) ctrl[j] = tau[j];
    this.mj.mj_step(this.m, this.d);
  }

  // ---------------------------------------------------- episode
  reset(err) {
    const { mj, m, d, c } = this;
    if (!this.qStart) {
      mj.mj_resetData(m, d); d.qpos.set(this.qPost);
      for (let i = 0; i < 1500; i++) this.step([this.hole[0], this.hole[1], this.hole[2] + c.above]);
      this.qStart = Float64Array.from(d.qpos);
    }
    mj.mj_resetData(m, d); d.qpos.set(this.qStart); mj.mj_forward(m, d);
    this.belief = [this.hole[0] + err[0], this.hole[1] + err[1]];
    this.off = [0, 0]; this.vel = [0, 0]; this.t = 0; this.i = 0;
    for (let i = 0; i < 300; i++) this.step([this.belief[0], this.belief[1], this.hole[2] + c.above]);
  }

  obs() {
    const d = this.d, R = d.site_xmat.subarray(9 * this.ft, 9 * this.ft + 9), s = d.sensordata;
    const rot = (a) => [0, 1, 2].map((i) => R[3 * i] * a[0] + R[3 * i + 1] * a[1] + R[3 * i + 2] * a[2]);
    const f = rot([s[0], s[1], s[2]]), tq = rot([s[3], s[4], s[5]]);
    const fz = Math.max(Math.abs(f[2]), 1);
    return [tq[0] / fz / 0.01, tq[1] / fz / 0.01, f[2] / 10, this.off[0] / this.c.dmax, this.off[1] / this.c.dmax];
  }

  policy(o) {
    let x = o;
    for (const L of this.R.layers) x = L.W.map((row, i) => Math.tanh(row.reduce((s, w, k) => s + w * x[k], L.b[i])));
    return x;
  }

  target() {
    const c = this.c, z = Math.max(this.hole[2] + c.above - c.vz * this.t, this.hole[2] - c.below);
    return [this.belief[0] + this.off[0], this.belief[1] + this.off[1], z];
  }

  // one physics step of the episode; useResidual toggles the learned correction
  tick(useResidual) {
    const c = this.c, dt = this.m.opt.timestep;
    if (useResidual && this.i % c.policy_every === 0) this.vel = this.policy(this.obs()).map((v) => Math.max(-1, Math.min(1, v)) * c.vmax);
    if (!useResidual) this.vel = [0, 0];
    this.off = this.off.map((o, k) => Math.max(-c.dmax, Math.min(c.dmax, o + this.vel[k] * dt)));
    this.step(this.target());
    this.t += dt; this.i++;
  }

  depth() { return this.hole[2] - this.d.site_xpos[3 * this.tip + 2]; }
  done() { return this.t >= this.c.T; }
}

// Gauss–Jordan inverse of a small dense matrix
function inv6(A) {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let p = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[p][col])) p = r;
    [M[col], M[p]] = [M[p], M[col]];
    const piv = M[col][col];
    for (let k = 0; k < 2 * n; k++) M[col][k] /= piv;
    for (let r = 0; r < n; r++) if (r !== col) { const f = M[r][col]; if (f) for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[col][k]; }
  }
  return M.map((r) => r.slice(n));
}
