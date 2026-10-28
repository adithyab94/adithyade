'use strict';
// Advanced D: humanoids. Motion imitation, whole-body control under a VLA, loco-manipulation.

const ADVD = (() => {
  const randn = () => {
    let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // ------------------------------------------------ 14 · DeepMimic-style tracking on a 2-D walker
  const mimic = {
    THIGH: 0.45, SHIN: 0.45, HIP_H: 0.9,
    // reference gait: hip and knee angles of both legs as a function of phase φ ∈ [0, 1)
    ref(phi) {
      const leg = (p) => [0.38 * Math.sin(2 * Math.PI * p), 0.15 + 0.55 * Math.max(0, Math.sin(2 * Math.PI * p + 1.3))];
      const [hl, kl] = leg(phi), [hr, kr] = leg(phi + 0.5);
      return [hl, kl, hr, kr];
    },
    foot(q, side) {                                     // side 0 = left, 1 = right; angles from vertical, knee bends back
      const h = q[2 * side], k = q[2 * side + 1];
      const kx = this.THIGH * Math.sin(h), ky = this.HIP_H - this.THIGH * Math.cos(h);
      return [kx, ky, kx + this.SHIN * Math.sin(h - k), ky - this.SHIN * Math.cos(h - k)];
    },
    reward(q, qr, kp, ke) {
      let ep = 0, ee = 0;
      for (let i = 0; i < 4; i++) ep += (q[i] - qr[i]) ** 2;
      for (const s of [0, 1]) { const a = this.foot(q, s), b = this.foot(qr, s); ee += (a[2] - b[2]) ** 2 + (a[3] - b[3]) ** 2; }
      const rp = Math.exp(-kp * ep), re = Math.exp(-ke * ee);
      return { rp, re, r: 0.7 * rp + 0.3 * re, ep, ee };
    },
  };

  // ------------------------------------------------ 14 · AMP: a discriminator as a style reward
  // Motion "clips" are samples in a 2-D feature space (stride length, cadence): two styles, walk and jog.
  const amp = {
    NB: 7, LO: [0, 0], HI: [2, 2],
    data(n = 400) {
      return Array.from({ length: n }, () => (Math.random() < 0.5 ? [0.55 + 0.1 * randn(), 0.6 + 0.08 * randn()] : [1.35 + 0.12 * randn(), 1.45 + 0.1 * randn()]));
    },
    feat(x) {                                           // RBF features on a grid, plus a bias
      const f = [1], n = this.NB, w = (this.HI[0] - this.LO[0]) / (n - 1);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const cx = this.LO[0] + i * w, cy = this.LO[1] + j * w;
        f.push(Math.exp(-((x[0] - cx) ** 2 + (x[1] - cy) ** 2) / (2 * (0.8 * w) ** 2)));
      }
      return f;
    },
    D(w, x) { const f = this.feat(x); return f.reduce((s, v, i) => s + v * w[i], 0); },
    style(w, x) { return Math.max(0, 1 - 0.25 * (this.D(w, x) - 1) ** 2); },   // AMP's reward from an LSGAN discriminator
    init() { return { w: new Array(this.NB * this.NB + 1).fill(0), mu: [1.0, 0.25], sd: 0.12 }; },
    // one round: a few discriminator steps (LSGAN: data → +1, policy → −1), then a policy-gradient step on the style reward
    step(st, data, { lrD = 0.05, lrP = 0.05, n = 64 } = {}) {
      const pol = Array.from({ length: n }, () => [st.mu[0] + st.sd * randn(), st.mu[1] + st.sd * randn()]);
      for (let k = 0; k < 3; k++) {
        const g = new Array(st.w.length).fill(0);
        for (let i = 0; i < n; i++) {
          const xd = data[Math.floor(Math.random() * data.length)], fd = this.feat(xd), fp = this.feat(pol[i]);
          const ed = this.D(st.w, xd) - 1, ep = this.D(st.w, pol[i]) + 1;
          for (let j = 0; j < g.length; j++) g[j] += 2 * ed * fd[j] + 2 * ep * fp[j];
        }
        for (let j = 0; j < g.length; j++) st.w[j] -= lrD * (g[j] / n + 1e-3 * st.w[j]);
      }
      const r = pol.map((x) => this.style(st.w, x)), rb = r.reduce((a, b) => a + b, 0) / n;
      const gm = [0, 0];
      pol.forEach((x, i) => { for (const j of [0, 1]) gm[j] += (r[i] - rb) * (x[j] - st.mu[j]) / (st.sd * st.sd); });
      for (const j of [0, 1]) st.mu[j] = Math.max(-0.2, Math.min(2.2, st.mu[j] + lrP * gm[j] / n));
      st.pol = pol; st.r = rb;
      return st;
    },
  };

  // ------------------------------------------------ 15 · VLA on top of a whole-body controller (LIPM balance)
  // Linear inverted pendulum: ẍ = ω² (x − p), ω = √(g/z). The controller picks the ZMP p inside the foot [−F, F].
  const wbc = {
    G: 9.81, Z: 0.9, F: 0.1, DT: 0.002, T: 8,
    target(t) { return t < 2 ? 0 : t < 4.5 ? 0.06 : t < 6.5 ? -0.05 : 0.02; },   // where the VLA wants the body (lean / reach)
    // mode 'direct': the VLA itself outputs the ZMP at its own rate. 'hier': the VLA outputs a target, the WBC balances at 50 Hz.
    run({ mode, vlaHz, vlaLat, wbcHz = 50 }) {
      const w = Math.sqrt(this.G / this.Z), n = Math.round(this.T / this.DT);
      const vEvery = Math.max(1, Math.round(1 / (vlaHz * this.DT))), lEvery = Math.max(1, Math.round(1 / (wbcHz * this.DT)));
      const lat = Math.round(vlaLat / 1000 / this.DT);
      let x = 0, v = 0, p = 0, goal = 0, fell = -1;
      const queue = [], tr = { x: [], p: [], g: [] };
      const ctrl = (xs, vs, xd) => {                     // capture-point controller: ξ = x + v/ω, drive ξ to the target
        const xi = xs + vs / w;
        return Math.max(-this.F, Math.min(this.F, xi + 1.5 * (xi - xd)));
      };
      for (let i = 0; i < n; i++) {
        const t = i * this.DT;
        if (i % vEvery === 0) {                          // the VLA looks at the (current) state and decides
          const out = mode === 'direct' ? ctrl(x, v, this.target(t)) : this.target(t);
          queue.push([i + lat, out]);
        }
        while (queue.length && queue[0][0] <= i) {
          const o = queue.shift()[1];
          if (mode === 'direct') p = o; else goal = o;
        }
        if (mode === 'hier' && i % lEvery === 0) p = ctrl(x, v, goal);
        v += this.DT * w * w * (x - p); x += this.DT * v;
        if (Math.abs(x) > 0.35 && fell < 0) fell = t;
        if (i % 10 === 0) { tr.x.push([t, x]); tr.p.push([t, p]); tr.g.push([t, this.target(t)]); }
        if (fell >= 0 && t > fell + 0.3) break;
      }
      return { tr, fell };
    },
  };

  // ------------------------------------------------ 16 · loco-manipulation: centre of mass with a load
  const carry = {
    M: 60, HALF_FOOT: 0.11,
    // body COM at hip offset h (lean), arms + box at reach d; walking acceleration a shifts the ZMP by −(z/g)·a
    state(m, d, lean, acc) {
      const xb = lean * 0.6, xc = (this.M * xb + m * d) / (this.M + m);
      const zmp = xc - (0.9 / 9.81) * acc;
      return { xc, zmp, ok: Math.abs(zmp) <= this.HALF_FOOT };
    },
    leanFor(m, d) { return -(m * d) / (this.M * 0.6); },   // the lean that puts the combined COM back over the ankle
  };

  return { randn, mimic, amp, wbc, carry };
})();

if (typeof module !== 'undefined') { module.exports = ADVD; }

// ---------------------------------------------------------------- widgets
if (typeof document !== 'undefined') (() => {
  const C = ADV_C;
  const lbl = (ctx, txt, x, y, o = {}) => {
    ctx.font = o.font || C.font; ctx.fillStyle = o.color || C.muted;
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
    ctx.fillText(txt, x, y);
  };

  // ============================================================ 14a · be the policy
  (() => {
    const cv = document.getElementById('mm-fig');
    if (!cv) return;
    const M = ADVD.mimic;
    const ph = RL.range('mm-ph', () => draw(true), (v) => v.toFixed(2));
    const kp = RL.range('mm-kp', () => draw(true), (v) => v.toFixed(1));
    const ke = RL.range('mm-ke', () => draw(true), (v) => v.toFixed(0));
    let q = [0.5, 0.1, -0.4, 0.8], hist = [], playing = false, raf = 0, geo = null, drag = null, t = 0;
    const phInp = document.getElementById('mm-ph');
    function draw(log) {
      const { ctx, w, h } = RL.fit(cv);
      const S = (h - 30) / 1.55, ox = w / 2, oy = h - 18;
      const P = (x, y) => [ox + x * S, oy - y * S];
      geo = { P, S, ox, oy };
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(10, oy); ctx.lineTo(w - 10, oy); ctx.stroke();
      const qr = M.ref(ph());
      const body = (qq, color, lw, alpha) => {
        ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(...P(0, M.HIP_H)); ctx.lineTo(...P(0, M.HIP_H + 0.5)); ctx.stroke();
        ctx.beginPath(); ctx.arc(...P(0, M.HIP_H + 0.6), 0.09 * S, 0, 7); ctx.stroke();
        for (const s of [0, 1]) {
          const f = M.foot(qq, s);
          ctx.beginPath(); ctx.moveTo(...P(0, M.HIP_H)); ctx.lineTo(...P(f[0], f[1])); ctx.lineTo(...P(f[2], f[3])); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      };
      body(qr, C.amber, 7, 0.28);
      body(q, C.ink, 3.5, 1);
      for (const s of [0, 1]) {
        const f = M.foot(q, s);
        for (const [x, y] of [[f[0], f[1]], [f[2], f[3]]]) { ctx.fillStyle = s ? C.blue : C.terra; ctx.beginPath(); ctx.arc(...P(x, y), 6, 0, 7); ctx.fill(); }
      }
      lbl(ctx, 'ghost = reference', 12, 16, { color: C.amber, font: C.mono });
      lbl(ctx, playing ? 'PD tracker walking' : 'drag the dots', 12, 30, { font: C.mono });
      const r = M.reward(q, qr, kp(), ke());
      RL.$('#mm-rp').textContent = r.rp.toFixed(3); RL.$('#mm-re').textContent = r.re.toFixed(3); RL.$('#mm-rr').textContent = r.r.toFixed(3);
      if (log) { hist.push([t, r.rp, r.re, r.r]); if (hist.length > 400) hist.shift(); }
      RL.lineChart(RL.$('#mm-r'), [
        { data: hist.map((x) => [x[0], x[3]]), color: C.ink, label: 'r', width: 2.5 },
        { data: hist.map((x) => [x[0], x[1]]), color: C.terra, label: 'r_p' },
        { data: hist.map((x) => [x[0], x[2]]), color: C.blue, label: 'r_e' },
      ], { xLabel: 'time (s)', yMin: 0, yMax: 1.05, xMin: hist.length ? hist[0][0] : 0, xMax: Math.max(4, hist.length ? hist[hist.length - 1][0] : 4) });
    }
    const pick = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - geo.ox) / geo.S, (geo.oy - (e.clientY - r.top)) / geo.S]; };
    cv.addEventListener('pointerdown', (e) => {
      const [x, y] = pick(e); let best = null, bd = 0.08;
      for (const s of [0, 1]) { const f = M.foot(q, s); for (const [k, px, py] of [['knee', f[0], f[1]], ['foot', f[2], f[3]]]) { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = [s, k]; } } }
      if (best) { drag = best; cv.setPointerCapture(e.pointerId); playing = false; }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const [x, y] = pick(e), [s, k] = drag;
      if (k === 'knee') q[2 * s] = RL.clamp(Math.atan2(x, M.HIP_H - y), -1.2, 1.2);
      else { const f = M.foot(q, s); q[2 * s + 1] = RL.clamp(q[2 * s] - Math.atan2(x - f[0], f[1] - y), 0, 2.2); }
      t += 0.02; draw(true);
    });
    cv.addEventListener('pointerup', () => { drag = null; });
    function loop() {
      if (!playing) return;
      const dt = 1 / 60, phase = (ph() + dt * 0.9) % 1;
      phInp.value = phase.toFixed(2); RL.$('output[for="mm-ph"]').textContent = phase.toFixed(2);
      const qr = M.ref(phase);
      q = q.map((v, i) => v + dt * 7 * (qr[i] - v) + 0.004 * ADVD.randn());     // a laggy, slightly noisy PD tracker
      t += dt; draw(true);
      raf = requestAnimationFrame(loop);
    }
    RL.$('#mm-play').addEventListener('click', () => { playing = !playing; RL.$('#mm-play').textContent = playing ? '⏸ pause' : '▶ let a PD tracker walk'; if (playing) loop(); });
    RL.$('#mm-reset').addEventListener('click', () => { q = [0.5, 0.1, -0.4, 0.8]; t += 0.02; draw(true); });
    addEventListener('resize', () => draw(false));
    RL.onVisible(cv, () => draw(true));
  })();

  // ============================================================ 14b · AMP
  (() => {
    const cv = document.getElementById('amp-c');
    if (!cv) return;
    const A = ADVD.amp, data = A.data();
    let st = A.init(), timer = 0, rounds = 0;
    function draw() {
      const { ctx, w, h } = RL.fit(cv);
      const pad = { l: 48, r: 12, t: 12, b: 34 }, W = w - pad.l - pad.r, H = h - pad.t - pad.b;
      const sx = (x) => pad.l + x / 2 * W, sy = (y) => pad.t + (1 - y / 2) * H, N = 40;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const r = A.style(st.w, [(i + 0.5) / N * 2, (j + 0.5) / N * 2]);
        ctx.fillStyle = `rgba(47,125,95,${(0.55 * r).toFixed(3)})`;
        ctx.fillRect(pad.l + i / N * W, pad.t + (N - 1 - j) / N * H, W / N + 0.5, H / N + 0.5);
      }
      ctx.fillStyle = 'rgba(35,34,32,0.45)'; data.forEach(([x, y]) => ctx.fillRect(sx(x) - 1.5, sy(y) - 1.5, 3, 3));
      ctx.fillStyle = C.terra; (st.pol || []).forEach(([x, y]) => { ctx.beginPath(); ctx.arc(sx(x), sy(y), 2.6, 0, 7); ctx.fill(); });
      ctx.strokeStyle = C.terra; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(st.mu[0]), sy(st.mu[1]), 2 * st.sd / 2 * W, 0, 7); ctx.stroke();
      ctx.strokeStyle = C.line; ctx.strokeRect(pad.l, pad.t, W, H);
      lbl(ctx, 'walk', sx(0.55), sy(0.6) + 26, { align: 'center', color: C.ink });
      lbl(ctx, 'jog', sx(1.35), sy(1.45) - 20, { align: 'center', color: C.ink });
      lbl(ctx, 'stride length →', pad.l + W / 2, h - 8, { align: 'center' });
      ctx.save(); ctx.translate(14, pad.t + H / 2); ctx.rotate(-Math.PI / 2); lbl(ctx, 'cadence →', 0, 0, { align: 'center', base: 'middle' }); ctx.restore();
      lbl(ctx, `round ${rounds} · grey = mocap · orange = policy · green = style reward`, pad.l + 6, pad.t + 14, { font: C.mono });
    }
    const run = () => {
      if (timer) return;
      let n = 0;
      timer = setInterval(() => { for (let k = 0; k < 5; k++) { A.step(st, data); rounds++; } draw(); if ((n += 5) >= 300) { clearInterval(timer); timer = 0; } }, 30);
    };
    const restart = (mu) => { clearInterval(timer); timer = 0; st = A.init(); st.mu = mu; rounds = 0; draw(); };
    RL.$('#amp-run').addEventListener('click', run);
    RL.$('#amp-reset').addEventListener('click', () => restart([1.0, 0.25]));
    RL.$('#amp-far').addEventListener('click', () => restart([0.15, 1.85]));
    addEventListener('resize', draw);
    RL.onVisible(cv, draw);
  })();

  // ============================================================ 15 · VLA + WBC
  (() => {
    const cf = document.getElementById('wb-fig');
    if (!cf) return;
    const B = ADVD.wbc;
    let mode = 'direct', res = null, k0 = 0;
    const hz = RL.range('wb-hz', () => sim(), (v) => v.toFixed(0));
    const lat = RL.range('wb-lat', () => sim(), (v) => v.toFixed(0));
    RL.$$('#wb-mode button').forEach((b) => b.addEventListener('click', () => {
      RL.$$('#wb-mode button').forEach((x) => x.classList.toggle('sel', x === b)); mode = b.dataset.m; sim();
    }));
    function sim() {
      res = B.run({ mode, vlaHz: hz(), vlaLat: lat() }); k0 = performance.now();
      const err = res.tr.x.reduce((s, [, x], i) => s + Math.abs(x - res.tr.g[i][1]), 0) / res.tr.x.length;
      RL.$('#wb-res').innerHTML = res.fell >= 0 ? `<span style="color:${C.red}">fell at ${res.fell.toFixed(1)} s</span>` : `<span style="color:${C.green}">stayed up</span>`;
      RL.$('#wb-err').textContent = res.fell >= 0 ? '—' : (100 * err).toFixed(1) + ' cm';
      RL.lineChart(RL.$('#wb-plot'), [
        { data: res.tr.g, color: C.muted, dash: [5, 4], label: 'VLA target' },
        { data: res.tr.p, color: C.terra, label: 'ZMP p', width: 1.2 },
        { data: res.tr.x, color: C.ink, label: 'centre of mass x', width: 2.2 },
      ], { xLabel: 'time (s)', yLabel: 'position (m)', yMin: -0.25, yMax: 0.25, xMin: 0, xMax: B.T,
        hlines: [{ y: B.F, color: C.red, label: 'edge of foot' }, { y: -B.F, color: C.red }] });
    }
    function frame() {
      if (res) {
        const { ctx, w, h } = RL.fit(cf);
        const n = res.tr.x.length, i = Math.min(n - 1, Math.floor(((performance.now() - k0) / 1000 % (B.T + 1)) / 0.02));
        const x = res.tr.x[i][1], p = res.tr.p[i][1], g = res.tr.g[i][1];
        const S = (h - 40) / 1.1, X = (v) => w / 2 + 3 * v * S, gy = h - 20;
        ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(10, gy); ctx.lineTo(w - 10, gy); ctx.stroke();
        ctx.fillStyle = 'rgba(35,34,32,0.25)'; ctx.fillRect(X(-B.F), gy - 5, X(B.F) - X(-B.F), 5);
        ctx.strokeStyle = C.muted; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(X(g), gy); ctx.lineTo(X(g), gy - 1.05 * S); ctx.stroke(); ctx.setLineDash([]);
        const fallen = res.fell >= 0 && res.tr.x[i][0] >= res.fell;
        ctx.strokeStyle = fallen ? C.red : C.ink; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(X(p), gy - 4); ctx.lineTo(X(x), gy - B.Z * S); ctx.stroke();
        ctx.fillStyle = fallen ? C.red : C.ink; ctx.beginPath(); ctx.arc(X(x), gy - B.Z * S, 14, 0, 7); ctx.fill();
        ctx.fillStyle = C.terra; ctx.beginPath(); ctx.arc(X(p), gy - 2, 5, 0, 7); ctx.fill();
        lbl(ctx, 'horizontal ×3 · orange = ZMP · dashed = target', 12, 16, { font: C.mono });
        lbl(ctx, `t = ${res.tr.x[i][0].toFixed(1)} s`, w - 12, h - 6, { align: 'right', font: C.mono });
      }
      requestAnimationFrame(frame);
    }
    addEventListener('resize', sim);
    RL.onVisible(cf, () => { sim(); requestAnimationFrame(frame); });
  })();

  // ============================================================ 16 · carry the box
  (() => {
    const cv = document.getElementById('cb-c');
    if (!cv) return;
    const K = ADVD.carry;
    const m = RL.range('cb-m', () => draw(), (v) => v.toFixed(1));
    const d = RL.range('cb-d', () => draw(), (v) => v.toFixed(2));
    const a = RL.range('cb-a', () => draw(), (v) => v.toFixed(2));
    RL.$('#cb-bal').addEventListener('change', () => draw());
    function draw() {
      const { ctx, w, h } = RL.fit(cv);
      const lean = RL.$('#cb-bal').checked ? K.leanFor(m(), d()) : 0, st = K.state(m(), d(), lean, a());
      const S = (h - 40) / 1.75, gx = w / 2, gy = h - 22, P = (x, y) => [gx + x * S, gy - y * S];
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(10, gy); ctx.lineTo(w - 10, gy); ctx.stroke();
      ctx.fillStyle = 'rgba(35,34,32,0.3)'; ctx.fillRect(...P(-K.HALF_FOOT, 0.02), 2 * K.HALF_FOOT * S, 0.02 * S);
      const hip = [lean * 0.35, 0.9], sh = [lean * 1.0, 1.45];
      ctx.strokeStyle = st.ok ? C.ink : C.red; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(...P(-0.05, 0.02)); ctx.lineTo(...P(hip[0], hip[1])); ctx.lineTo(...P(sh[0], sh[1])); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(...P(0.05, 0.02)); ctx.lineTo(...P(hip[0], hip[1])); ctx.stroke();
      ctx.beginPath(); ctx.arc(...P(sh[0], sh[1] + 0.12), 0.08 * S, 0, 7); ctx.stroke();
      const bx = d(), by = 1.1, bs = 0.12 + 0.012 * m();
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(...P(sh[0], sh[1] - 0.05)); ctx.lineTo(...P(bx - bs / 2, by)); ctx.stroke();
      if (m() > 0) { ctx.fillStyle = 'rgba(168,112,26,0.75)'; ctx.fillRect(...P(bx - bs / 2, by + bs / 2), bs * S, bs * S); lbl(ctx, m().toFixed(0) + ' kg', ...P(bx, by + bs / 2 + 0.04), { align: 'center', color: C.amber }); }
      ctx.fillStyle = C.blue; ctx.beginPath(); ctx.arc(...P(st.xc, 1.0), 7, 0, 7); ctx.fill();
      ctx.strokeStyle = C.blue; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(...P(st.xc, 1.0)); ctx.lineTo(...P(st.xc, 0)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = st.ok ? C.green : C.red; ctx.beginPath(); ctx.moveTo(...P(st.zmp, 0.0)); ctx.lineTo(...P(st.zmp - 0.03, -0.06)); ctx.lineTo(...P(st.zmp + 0.03, -0.06)); ctx.fill();
      lbl(ctx, 'blue = combined centre of mass · triangle = ZMP · grey = foot', 12, 16, { font: C.mono });
      RL.$('#cb-x').textContent = (100 * st.xc).toFixed(1) + ' cm';
      RL.$('#cb-p').textContent = (100 * st.zmp).toFixed(1) + ' cm';
      RL.$('#cb-s').innerHTML = st.ok ? `<span style="color:${C.green}">balanced</span>` : `<span style="color:${C.red}">tipping ${st.zmp > 0 ? 'forward' : 'backward'}</span>`;
    }
    addEventListener('resize', draw);
    RL.onVisible(cv, draw);
  })();
})();

if (typeof window !== 'undefined') window.ADV_QUIZ = Object.assign(window.ADV_QUIZ || {}, {
  advD: [
    { q: 'Why are DeepMimic\'s reward terms exponentials of squared errors?', o: ['They are cheaper to compute', 'They are bounded in [0, 1], smooth, and still give a gradient when the error is large, if the kernel scale is chosen well', 'They make the reward sparse', 'They remove the need for a reference'], a: 1, why: 'The scale k sets how forgiving the kernel is: too large and the reward is effectively sparse.' },
    { q: 'What does reference state initialisation buy you?', o: ['Faster simulation', 'Episodes start at random points along the clip, so the policy experiences every part of the motion, not only the beginning', 'A smaller network', 'It removes early termination'], a: 1, why: 'Without it, the policy may never reach the hard middle of a long motion.' },
    { q: 'In AMP, the style reward comes from…', o: ['Joint angle errors to one clip', 'A discriminator trained to tell dataset transitions from policy transitions', 'A hand-written gait model', 'A value function'], a: 1, why: 'r_style = max(0, 1 − ¼(D(s,s′) − 1)²) with an LSGAN discriminator; no frame-by-frame tracking needed.' },
    { q: 'Why can\'t a 3 Hz VLA balance a humanoid directly?', o: ['It lacks the vision', 'Balance is unstable with a time constant around 0.3 s, so errors grow faster than a 3 Hz controller can correct them', 'It outputs text', 'It can, with enough data'], a: 1, why: 'LIPM: ẍ = ω²(x − p), ω ≈ 3.3 s⁻¹. A fast whole-body controller must close that loop.' },
    { q: 'A humanoid lifts a heavy box far in front of it. A unified whole-body policy will typically learn to…', o: ['Stand still', 'Lean the body back so the combined centre of mass stays over the feet', 'Drop the box', 'Lift the box higher'], a: 1, why: 'x_c = (M x_body + m x_load)/(M + m) must stay above the support; leaning back moves x_body.' },
  ],
});
