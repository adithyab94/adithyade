'use strict';
// Advanced B: the deep RL workhorses. PPO, SAC/MPO, model-based.

const ADVB = (() => {
  const randn = () => {
    let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const gpdf = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));

  // ------------------------------------------------ 7 · PPO on a 1-D Gaussian policy
  const ppo = {
    C: 2, W: 0.45,                       // reward bump centre and width
    f(a) { return Math.exp(-0.5 * ((a - this.C) / this.W) ** 2); },
    J(p) { const s2 = p.s * p.s + this.W * this.W; return this.W / Math.sqrt(s2) * Math.exp(-((p.m - this.C) ** 2) / (2 * s2)); },
    kl(o, n) { return Math.log(n.s / o.s) + (o.s * o.s + (o.m - n.m) ** 2) / (2 * n.s * n.s) - 0.5; },   // KL(old || new)
    // One PPO iteration: collect N samples from p, then K epochs of full-batch ascent on the surrogate.
    iterate(p, { N = 32, K = 20, lr = 0.08, eps = 0.2, clip = true, noise = 0.25, ent = 0 } = {}) {
      const A = [], act = [];
      for (let i = 0; i < N; i++) { const a = p.m + p.s * randn(); act.push(a); A.push(this.f(a) + noise * randn()); }
      const mean = A.reduce((x, y) => x + y, 0) / N, sd = Math.sqrt(A.reduce((x, y) => x + (y - mean) ** 2, 0) / N) || 1;
      const adv = A.map((x) => (x - mean) / sd);                      // normalised advantages
      const old = { m: p.m, s: p.s }, q = { m: p.m, s: p.s }, trace = [];
      for (let k = 0; k < K; k++) {
        let gm = 0, gl = 0, inside = 0;
        for (let i = 0; i < N; i++) {
          const r = gpdf(act[i], q.m, q.s) / gpdf(act[i], old.m, old.s);
          const off = clip && ((adv[i] > 0 && r > 1 + eps) || (adv[i] < 0 && r < 1 - eps));
          if (off) continue;                                          // the clipped branch has zero gradient
          inside++;
          const z = (act[i] - q.m) / q.s;
          gm += r * adv[i] * z / q.s;                                 // ∂(r·A)/∂μ  = r·A·∇μ log π
          gl += r * adv[i] * (z * z - 1);                             // ∂(r·A)/∂logσ
        }
        gl += ent * N;                                                // entropy bonus: ∂H/∂logσ = 1
        q.m += lr * gm / N;
        q.s = Math.max(1e-3, q.s * Math.exp(Math.max(-1, Math.min(1, lr * gl / N))));
        trace.push({ kl: this.kl(old, q), J: this.J(q), inside: inside / N });
      }
      return { p: q, act, adv, trace };
    },
  };

  // ------------------------------------------------ 7 · GAE on a corridor with noisy rewards
  // A robot walks L steps down a corridor; each step pays 0.1 + σ·ξ. The critic is lazy: V̂ = (1 − err)·V.
  // Everything is deterministic except the reward noise, so bias and variance have closed forms.
  const gae = {
    L: 60, R: 0.1,
    V(g, s) { return this.R * (1 - Math.pow(g, this.L - s)) / (1 - g); },
    curve(g, err, sig, lams = Array.from({ length: 51 }, (_, i) => i / 50)) {
      const Vh = (s) => (s >= this.L ? 0 : (1 - err) * this.V(g, s));
      const trueQ = this.V(g, 0);
      return lams.map((l) => {
        let est = Vh(0), w = 1, var_ = 0;
        for (let k = 0; k < this.L; k++) {
          est += w * (this.R + g * Vh(k + 1) - Vh(k));            // E[δ_k] weighted by (γλ)^k
          var_ += w * w * sig * sig;
          w *= g * l;
        }
        const bias2 = (est - trueQ) ** 2;
        return { l, bias2, vr: var_, mse: bias2 + var_ };
      });
    },
  };

  // ------------------------------------------------ 8 · soft policies, MPO, twin Q
  const soft = {
    A0: -3, A1: 3, NA: 241,
    grid() { return Array.from({ length: this.NA }, (_, i) => this.A0 + (this.A1 - this.A0) * i / (this.NA - 1)); },
    Q(a) { return 1.0 * Math.exp(-0.5 * ((a - 1.6) / 0.18) ** 2) + 0.75 * Math.exp(-0.5 * ((a + 1.0) / 0.8) ** 2); },
    boltz(alpha) {
      const as = this.grid(), q = as.map((a) => this.Q(a)), m = Math.max(...q), da = (this.A1 - this.A0) / (this.NA - 1);
      const e = q.map((v) => Math.exp((v - m) / alpha)), Z = e.reduce((x, y) => x + y, 0) * da;
      const p = e.map((v) => v / Z);
      const H = -p.reduce((s, v) => s + (v > 0 ? v * Math.log(v) : 0), 0) * da;
      const EQ = p.reduce((s, v, i) => s + v * q[i], 0) * da;
      return { as, p, H, EQ };
    },
    // MPO E-step on the action grid: q ∝ π_old · exp(Q/η) with KL(q‖π_old) = ε; M-step: Gaussian fit to q.
    mpoStep(pol, eps) {
      const as = this.grid(), da = (this.A1 - this.A0) / (this.NA - 1);
      const po = as.map((a) => gpdf(a, pol.m, pol.s) * da), Q = as.map((a) => this.Q(a));
      const tilt = (eta) => {
        const w = po.map((p, i) => p * Math.exp(Q[i] / eta)), Z = w.reduce((x, y) => x + y, 0);
        const q = w.map((v) => v / Z);
        const kl = q.reduce((s, v, i) => s + (v > 1e-300 && po[i] > 1e-300 ? v * Math.log(v / po[i]) : 0), 0);
        return { q, kl };
      };
      let lo = -6, hi = 4;                                            // bisection on log η
      for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; tilt(Math.exp(mid)).kl > eps ? (lo = mid) : (hi = mid); }
      const eta = Math.exp(hi), { q, kl } = tilt(eta);
      const m = q.reduce((s, v, i) => s + v * as[i], 0);
      const s = Math.sqrt(Math.max(1e-4, q.reduce((acc, v, i) => acc + v * (as[i] - m) ** 2, 0)));
      return { eta, kl, q: q.map((v) => v / da), next: { m, s } };
    },
    // E[max over K noisy estimates] vs E[min of two independent maxima] when every true Q is 0
    overestimate(K, sigma, trials = 3000) {
      let single = 0, twin = 0;
      const hs = [], ht = [];
      for (let t = 0; t < trials; t++) {
        let m1 = -Infinity, m2 = -Infinity, arg = 0;
        const q2 = [];
        for (let k = 0; k < K; k++) { const a = sigma * randn(), b = sigma * randn(); if (a > m1) { m1 = a; arg = k; } q2.push(b); m2 = Math.max(m2, b); }
        const tw = Math.min(m1, q2[arg]);                             // clipped double Q: min of the two critics at the chosen action
        single += m1; twin += tw; hs.push(m1); ht.push(tw);
      }
      return { single: single / trials, twin: twin / trials, hs, ht };
    },
  };

  // ------------------------------------------------ 9 · MPC with a learned model
  const mbrl = {
    SIZE: 10, NB: 20, START: [1.2, 5], GOAL: [8.8, 5], STEP: 0.5,
    WALL: [3, 7],
    wallHit(x0, y0, x1, y1) {                                       // wall: x = 5, 3 ≤ y ≤ 7
      if ((x0 - 5) * (x1 - 5) > 0 || x0 === x1) return false;
      const t = (5 - x0) / (x1 - x0), y = y0 + t * (y1 - y0);
      return y >= this.WALL[0] && y <= this.WALL[1];
    },
    real(s, a) {
      const nx = Math.max(0, Math.min(this.SIZE, s[0] + a[0])), ny = Math.max(0, Math.min(this.SIZE, s[1] + a[1]));
      return this.wallHit(s[0], s[1], nx, ny) ? [s[0], s[1]] : [nx, ny];
    },
    bin(s) { const n = this.NB, k = this.SIZE / n; return Math.min(n - 1, Math.floor(s[1] / k)) * n + Math.min(n - 1, Math.floor(s[0] / k)); },
    // The learned model is an obstacle map: cells where a move was seen to stop dead. Unknown cells: assume free.
    model() { return { wall: new Uint8Array(this.NB * this.NB), seen: new Uint8Array(this.NB * this.NB) }; },
    target(s, a) { return [Math.max(0, Math.min(this.SIZE, s[0] + a[0])), Math.max(0, Math.min(this.SIZE, s[1] + a[1]))]; },
    learn(M, s, a, s2) {
      M.seen[this.bin(s)] = 1; M.seen[this.bin(s2)] = 1;
      const t = this.target(s, a), want = Math.hypot(t[0] - s[0], t[1] - s[1]);
      if (want > 0.05 && Math.hypot(s2[0] - s[0], s2[1] - s[1]) < 1e-9) M.wall[this.bin(t)] = 1;
    },
    predict(M, s, a) {
      const t = this.target(s, a);
      return M.wall[this.bin(t)] ? s : t;
    },
    explore(M, n = 250) {
      let s = this.START.slice();
      for (let i = 0; i < n; i++) {
        const a = [this.STEP * (Math.random() * 2 - 1), this.STEP * (Math.random() * 2 - 1)];
        const s2 = this.real(s, a); this.learn(M, s, a, s2); s = s2;
        if (s[0] > 4) s = this.START.slice();                       // the random data stays on the start side of the room
      }
    },
    // CEM over action sequences, scored in the model
    plan(M, s, { H = 14, pop = 160, elite = 16, iters = 4, pen = 0 } = {}) {
      let mu = Array.from({ length: H }, () => [0, 0]), sd = Array.from({ length: H }, () => [this.STEP, this.STEP]);
      let best = null;
      for (let it = 0; it < iters; it++) {
        const cands = [];
        for (let c = 0; c < pop; c++) {
          const seq = mu.map((m, t) => [0, 1].map((j) => Math.max(-this.STEP, Math.min(this.STEP, m[j] + sd[t][j] * randn()))));
          let x = s.slice(), score = 0;
          const path = [x];
          for (let t = 0; t < H; t++) {
            x = this.predict(M, x, seq[t]); path.push(x);
            score -= Math.hypot(x[0] - this.GOAL[0], x[1] - this.GOAL[1]);
            if (pen && !M.seen[this.bin(x)]) score -= pen;
          }
          cands.push({ seq, score, path });
        }
        cands.sort((a, b) => b.score - a.score);
        const el = cands.slice(0, elite);
        if (!best || el[0].score > best.score) best = el[0];
        mu = mu.map((_, t) => [0, 1].map((j) => el.reduce((acc, e) => acc + e.seq[t][j], 0) / elite));
        sd = sd.map((_, t) => [0, 1].map((j) => Math.sqrt(el.reduce((acc, e) => acc + (e.seq[t][j] - mu[t][j]) ** 2, 0) / elite) + 0.02));
      }
      return best;
    },
  };

  return { gpdf, ppo, gae, soft, mbrl };
})();

if (typeof module !== 'undefined') { module.exports = ADVB; }

// ---------------------------------------------------------------- widgets
if (typeof document !== 'undefined') (() => {
  const C = ADV_C;
  const lbl = (ctx, txt, x, y, o = {}) => {
    ctx.font = o.font || C.font; ctx.fillStyle = o.color || C.muted;
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
    ctx.fillText(txt, x, y);
  };
  // a 1-D function plot over the action axis
  function actionAxes(cv, X0, X1, ymax, o = {}) {
    const { ctx, w, h } = RL.fit(cv);
    const pad = { l: 14, r: 14, t: 16, b: 24 };
    const sx = (x) => pad.l + (x - X0) / (X1 - X0) * (w - pad.l - pad.r);
    const sy = (y) => h - pad.b - y / ymax * (h - pad.t - pad.b);
    ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(pad.l, sy(0)); ctx.lineTo(w - pad.r, sy(0)); ctx.stroke();
    for (let x = Math.ceil(X0); x <= X1; x++) lbl(ctx, String(x), sx(x), h - 6, { align: 'center', font: C.mono });
    if (o.label) lbl(ctx, o.label, w - pad.r, pad.t, { align: 'right', font: C.mono });
    const curve = (g, color, { fill, dash, width = 2 } = {}) => {
      ctx.beginPath();
      for (let i = 0; i <= 300; i++) { const x = X0 + i / 300 * (X1 - X0), y = Math.min(g(x), ymax * 1.2); i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y)); }
      if (fill) { ctx.lineTo(sx(X1), sy(0)); ctx.lineTo(sx(X0), sy(0)); ctx.fillStyle = fill; ctx.fill(); }
      if (color) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]); }
    };
    return { ctx, w, h, sx, sy, curve, pad };
  }

  // ============================================================ 7a · PPO clipped vs unclipped
  (() => {
    const cv = document.getElementById('ppo-pol');
    if (!cv) return;
    const P = ADVB.ppo;
    const K = RL.range('ppo-k', null, (v) => v.toFixed(0));
    const E = RL.range('ppo-eps', null, (v) => v.toFixed(2));
    let ag, busy = false;
    const reset = () => {
      ag = [{ name: 'clipped', color: C.blue, clip: true }, { name: 'unclipped', color: C.terra, clip: false }]
        .map((a) => ({ ...a, p: { m: 0, s: 1 }, J: [P.J({ m: 0, s: 1 })], KL: [], last: null }));
      draw();
    };
    function step() {
      ag.forEach((a) => {
        const r = P.iterate(a.p, { K: K(), eps: E(), clip: a.clip, ent: 0.01 });
        a.KL.push(Math.max(1e-4, r.trace[r.trace.length - 1].kl)); a.p = r.p; a.J.push(P.J(a.p)); a.last = r;
      });
    }
    function draw() {
      const ymax = Math.max(1.1, ...ag.map((a) => Math.min(3, ADVB.gpdf(a.p.m, a.p.m, a.p.s))));
      const { ctx, sx, sy, curve } = actionAxes(cv, -3, 5, ymax * 1.05, { label: 'action a' });
      curve((x) => P.f(x), C.amber, { dash: [3, 3] });
      lbl(ctx, 'reward', sx(P.C + 0.5), sy(P.f(P.C + 0.5)) - 4, { color: C.amber });
      ag.forEach((a) => {
        curve((x) => ADVB.gpdf(x, a.p.m, a.p.s), a.color);
        if (a.last && a.clip) a.last.act.forEach((x, i) => {
          ctx.strokeStyle = a.last.adv[i] > 0 ? C.green : 'rgba(35,34,32,0.3)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(sx(x), sy(0)); ctx.lineTo(sx(x), sy(0) + 7); ctx.stroke();
        });
      });
      ag.forEach((a, i) => lbl(ctx, `${a.name}  μ=${a.p.m.toFixed(2)}  σ=${a.p.s.toFixed(3)}`, 18, 18 + i * 16, { color: a.color, font: C.mono }));
      RL.lineChart(RL.$('#ppo-j'), ag.map((a) => ({ data: a.J, color: a.color, label: a.name })),
        { xLabel: 'PPO iteration', yLabel: 'true return J(π)', yMin: 0, yMax: 1, xMin: 0, xMax: Math.max(10, ag[0].J.length - 1) });
      RL.lineChart(RL.$('#ppo-kl'), ag.map((a) => ({ data: a.KL, x0: 1, color: a.color, label: a.name, dots: a.KL.length < 3, r: 4 })),
        { xLabel: 'PPO iteration', yLabel: 'KL(old ‖ new) per update', logY: true, yMin: 1e-3, yMax: Math.max(10, ...ag.flatMap((a) => a.KL)), xMin: 0, xMax: Math.max(10, ag[0].J.length - 1) });
    }
    RL.$('#ppo-one').addEventListener('click', () => { step(); draw(); });
    RL.$('#ppo-ten').addEventListener('click', () => {
      if (busy) return; busy = true;
      RL.chunked(10, 1, step, draw, () => { busy = false; draw(); });
    });
    RL.$('#ppo-reset').addEventListener('click', reset);
    addEventListener('resize', draw);
    reset();
  })();

  // ============================================================ 7b · GAE λ
  (() => {
    const cv = document.getElementById('gae-curve');
    if (!cv) return;
    const G = ADVB.gae;
    const lam = RL.range('gae-l', () => draw(), (v) => v.toFixed(2));
    const gam = RL.range('gae-g', () => draw(), (v) => v.toFixed(3));
    const err = RL.range('gae-e', () => draw(), (v) => v.toFixed(2));
    const sig = RL.range('gae-s', () => draw(), (v) => v.toFixed(2));
    function draw() {
      const c = G.curve(gam(), err(), sig()), l = lam(), g = gam();
      const best = c.reduce((a, b) => (b.mse < a.mse ? b : a));
      const at = G.curve(g, err(), sig(), [l])[0];
      const top = Math.max(0.05, Math.min(Math.max(...c.map((x) => x.mse)), 6 * Math.max(...c.slice(0, 46).map((x) => x.mse))));
      RL.lineChart(cv, [
        { data: c.map((x) => [x.l, x.bias2]), color: C.terra, label: 'bias²' },
        { data: c.map((x) => [x.l, x.vr]), color: C.blue, label: 'variance' },
        { data: c.map((x) => [x.l, x.mse]), color: C.ink, label: 'MSE', width: 2.5 },
      ], { xLabel: 'λ', yMin: 0, yMax: top * 1.05, xMin: 0, xMax: 1, vlines: [{ x: l, color: C.muted }],
        points: [{ x: best.l, y: best.mse, color: C.green, label: 'best', r: 5 }] });
      const wts = Array.from({ length: G.L }, (_, k) => Math.pow(g * l, k));
      RL.lineChart(RL.$('#gae-w'), [{ data: [] }], { xLabel: 'lag l (steps ahead)', yLabel: 'weight (γλ)^l', yMin: 0, yMax: 1.05, xMin: 0, xMax: G.L, legend: false,
        bars: wts.map((v, k) => ({ x: k, y: v, w: 0.8, color: 'rgba(107,79,168,0.6)' })) });
      RL.$('#gae-best').textContent = best.l.toFixed(2);
      RL.$('#gae-h').textContent = g * l >= 0.9999 ? '∞' : (1 / (1 - g * l)).toFixed(1) + ' steps';
      RL.$('#gae-mse').textContent = at.mse.toFixed(3);
    }
    addEventListener('resize', draw);
    RL.onVisible(cv, draw);
  })();

  // ============================================================ 8a · SAC temperature
  (() => {
    const cv = document.getElementById('sac-c');
    if (!cv) return;
    const S = ADVB.soft, inp = document.getElementById('sac-a');
    const la = RL.range('sac-a', () => draw(), (v) => v.toFixed(2));
    const tgt = RL.range('sac-t', () => draw(), (v) => v.toFixed(2));
    let raf = 0;
    function draw() {
      const alpha = Math.pow(10, la()), b = S.boltz(alpha);
      const ymax = Math.max(1.2, Math.min(4, Math.max(...b.p))) * 1.05;
      const { ctx, sx, sy, curve } = actionAxes(cv, S.A0, S.A1, ymax, { label: 'action a' });
      ctx.beginPath(); b.as.forEach((a, i) => (i ? ctx.lineTo(sx(a), sy(Math.min(b.p[i], ymax))) : ctx.moveTo(sx(a), sy(b.p[i]))));
      ctx.lineTo(sx(S.A1), sy(0)); ctx.lineTo(sx(S.A0), sy(0)); ctx.fillStyle = 'rgba(62,111,176,0.25)'; ctx.fill();
      curve((a) => S.Q(a), C.ink, { width: 2 });
      lbl(ctx, 'Q(a)', sx(-1), sy(S.Q(-1)) - 8, { align: 'center', color: C.ink });
      lbl(ctx, 'π(a) ∝ exp(Q/α)', 18, 20, { color: C.blue });
      const da = (S.A1 - S.A0) / (S.NA - 1), mass = b.p.reduce((s, v, i) => s + (b.as[i] > 1.1 && b.as[i] < 2.1 ? v : 0), 0) * da;
      RL.$('#sac-av').textContent = alpha.toFixed(3);
      RL.$('#sac-h').textContent = b.H.toFixed(2) + ' (target ' + tgt().toFixed(2) + ')';
      RL.$('#sac-q').textContent = b.EQ.toFixed(3);
      RL.$('#sac-m').textContent = (100 * mass).toFixed(0) + '%';
      return b.H;
    }
    RL.$('#sac-auto').addEventListener('click', () => {
      cancelAnimationFrame(raf);
      let n = 0;
      const tick = () => {
        const H = S.boltz(Math.pow(10, la())).H, g = H - tgt();
        inp.value = RL.clamp(la() - 0.04 * g, -2, 0.3); inp.dispatchEvent(new Event('input'));
        if (Math.abs(g) > 0.01 && ++n < 400) raf = requestAnimationFrame(tick);
      };
      tick();
    });
    addEventListener('resize', draw);
    RL.onVisible(cv, draw);
  })();

  // ============================================================ 8b · MPO steps
  (() => {
    const cv = document.getElementById('mpo-c');
    if (!cv) return;
    const S = ADVB.soft;
    const eps = RL.range('mpo-e', null, (v) => v.toFixed(2));
    const m0 = RL.range('mpo-m', () => reset(), (v) => v.toFixed(2));
    let pol, prev, q, eta, n;
    const EQ = (p) => S.grid().reduce((s, a) => s + ADVB.gpdf(a, p.m, p.s) * S.Q(a), 0) * (S.A1 - S.A0) / (S.NA - 1);
    function reset() { pol = { m: m0(), s: 0.6 }; prev = null; q = null; eta = null; n = 0; draw(); }
    function draw() {
      const ymax = Math.max(1.2, Math.min(4, ADVB.gpdf(0, 0, pol.s), q ? Math.max(...q) : 0)) * 1.05;
      const { ctx, sx, sy, curve } = actionAxes(cv, S.A0, S.A1, ymax, { label: 'action a' });
      if (q) {
        const as = S.grid();
        ctx.beginPath(); as.forEach((a, i) => (i ? ctx.lineTo(sx(a), sy(Math.min(q[i], ymax))) : ctx.moveTo(sx(a), sy(q[i]))));
        ctx.lineTo(sx(S.A1), sy(0)); ctx.lineTo(sx(S.A0), sy(0)); ctx.fillStyle = 'rgba(168,112,26,0.22)'; ctx.fill();
      }
      curve((a) => S.Q(a), C.ink, { width: 1.5, dash: [4, 3] });
      if (prev) curve((a) => ADVB.gpdf(a, prev.m, prev.s), 'rgba(35,34,32,0.45)');
      curve((a) => ADVB.gpdf(a, pol.m, pol.s), C.blue, { width: 2.5 });
      lbl(ctx, 'Q(a) dashed · old π grey · E-step q shaded · new π blue', 18, 20, { font: C.mono });
      RL.$('#mpo-eta').textContent = eta ? eta.toFixed(3) : '—';
      RL.$('#mpo-ms').textContent = `${pol.m.toFixed(2)}, ${pol.s.toFixed(2)}`;
      RL.$('#mpo-q').textContent = EQ(pol).toFixed(3);
      RL.$('#mpo-n').textContent = n;
    }
    RL.$('#mpo-step').addEventListener('click', () => {
      const r = S.mpoStep(pol, eps());
      prev = pol; pol = r.next; q = r.q; eta = r.eta; n++; draw();
    });
    RL.$('#mpo-reset').addEventListener('click', reset);
    addEventListener('resize', draw);
    RL.onVisible(cv, reset);
  })();

  // ============================================================ 8c · twin critics
  (() => {
    const cv = document.getElementById('tq-c');
    if (!cv) return;
    const K = RL.range('tq-k', () => draw(), (v) => v.toFixed(0));
    const sg = RL.range('tq-s', () => draw(), (v) => v.toFixed(2));
    function draw() {
      const o = ADVB.soft.overestimate(K(), sg(), 4000), s = sg();
      const X0 = -3 * s, X1 = 4 * s, NB = 50, bw = (X1 - X0) / NB;
      const hist = (arr) => { const h = new Array(NB).fill(0); arr.forEach((v) => { const i = Math.floor((v - X0) / bw); if (i >= 0 && i < NB) h[i]++; }); return h.map((c) => c / arr.length / bw); };
      const hs = hist(o.hs), ht = hist(o.ht), top = Math.max(...hs, ...ht) * 1.1;
      RL.lineChart(cv, [{ data: [], color: C.terra, label: 'max of one critic' }, { data: [], color: C.blue, label: 'min of twin critics' }], {
        xLabel: 'Bellman target estimate (true value 0)', yMin: 0, yMax: top, xMin: X0, xMax: X1,
        bars: [...hs.map((v, i) => ({ x: X0 + i * bw, y: v, w: bw, color: 'rgba(196,103,63,0.45)' })), ...ht.map((v, i) => ({ x: X0 + i * bw, y: v, w: bw, color: 'rgba(62,111,176,0.40)' }))],
        vlines: [{ x: 0, color: C.ink, dash: [] }, { x: o.single, color: C.terra }, { x: o.twin, color: C.blue }],
      });
      RL.$('#tq-a').textContent = (o.single >= 0 ? '+' : '') + o.single.toFixed(2);
      RL.$('#tq-b').textContent = (o.twin >= 0 ? '+' : '') + o.twin.toFixed(2);
      RL.$('#tq-c2').textContent = 'up to +' + (o.single / 0.01).toFixed(0);
    }
    addEventListener('resize', draw);
    RL.onVisible(cv, draw);
  })();

  // ============================================================ 9 · MPC with a learned model
  (() => {
    const cv = document.getElementById('mb-c');
    if (!cv) return;
    const M = ADVB.mbrl;
    const H = RL.range('mb-h', null, (v) => v.toFixed(0));
    let mod, s, path, plan, t, timer = 0, status;
    const setStatus = (x) => { status = x; RL.$('#mb-s').textContent = x; };
    function reset() {
      clearInterval(timer); timer = 0;
      mod = M.model(); M.explore(mod); s = M.START.slice(); path = [s]; plan = null; t = 0; setStatus('ready'); draw();
    }
    function draw() {
      const { ctx, w, h } = RL.fit(cv);
      const side = Math.min(w - 20, h - 20), x0 = (w - side) / 2, y0 = (h - side) / 2, k = side / M.SIZE, cell = side / M.NB;
      const P = (p) => [x0 + p[0] * k, y0 + (M.SIZE - p[1]) * k];
      for (let b = 0; b < M.NB * M.NB; b++) {
        const cx = b % M.NB, cy = Math.floor(b / M.NB);
        ctx.fillStyle = mod.wall[b] ? 'rgba(35,34,32,0.75)' : mod.seen[b] ? 'rgba(62,111,176,0.13)' : 'rgba(35,34,32,0.03)';
        ctx.fillRect(x0 + cx * cell, y0 + (M.NB - 1 - cy) * cell, cell, cell);
      }
      ctx.strokeStyle = C.line; ctx.strokeRect(x0, y0, side, side);
      ctx.strokeStyle = C.red; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(...P([5, M.WALL[0]])); ctx.lineTo(...P([5, M.WALL[1]])); ctx.stroke(); ctx.setLineDash([]);
      lbl(ctx, 'real wall', ...P([5.15, M.WALL[1] + 0.25]), { color: C.red, font: C.mono });
      lbl(ctx, 'model knows: blue = visited, dark = wall', x0 + 6, y0 + side - 8, { font: C.mono });
      if (plan) {
        ctx.strokeStyle = C.purple; ctx.lineWidth = 1.5; ctx.setLineDash([2, 4]); ctx.beginPath();
        plan.path.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p)))); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath();
      path.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p)))); ctx.stroke();
      ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(...P(M.GOAL), 8, 0, 7); ctx.fill();
      lbl(ctx, 'goal', P(M.GOAL)[0], P(M.GOAL)[1] - 13, { align: 'center', color: C.amber });
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(...P(s), 6, 0, 7); ctx.fill();
      RL.$('#mb-t').textContent = t;
      RL.$('#mb-w').textContent = mod.wall.reduce((a, b) => a + b, 0);
    }
    function tick() {
      plan = M.plan(mod, s, { H: H() });
      const a = plan.seq[0], s2 = M.real(s, a);
      if (RL.$('#mb-learn').checked) M.learn(mod, s, a, s2);
      s = s2; path.push(s); t++;
      if (Math.hypot(s[0] - M.GOAL[0], s[1] - M.GOAL[1]) < 0.5) { clearInterval(timer); timer = 0; setStatus('reached the goal ✓'); }
      else if (t >= 120) { clearInterval(timer); timer = 0; setStatus('gave up after 120'); }
      else setStatus(path.length > 12 && Math.hypot(s[0] - path[path.length - 12][0], s[1] - path[path.length - 12][1]) < 0.4 ? 'stuck…' : 'driving');
      draw();
    }
    RL.$('#mb-go').addEventListener('click', () => {
      if (timer) return;
      if (status !== 'ready') { s = M.START.slice(); path = [s]; t = 0; }
      timer = setInterval(tick, 70);
    });
    RL.$('#mb-reset').addEventListener('click', reset);
    addEventListener('resize', draw);
    reset();
  })();
})();

if (typeof window !== 'undefined') window.ADV_QUIZ = Object.assign(window.ADV_QUIZ || {}, {
  advB: [
    { q: 'In PPO with Â > 0, what is the gradient of the clipped objective once r > 1 + ε?', o: ['It doubles', 'Zero: the min picks the clipped, constant term', 'It reverses sign', 'Unchanged'], a: 1, why: 'min(rÂ, (1+ε)Â) = (1+ε)Â is constant in θ, so that sample stops pushing.' },
    { q: 'GAE with λ = 1 equals…', o: ['The one-step TD error', 'G_t − V(s_t), the Monte Carlo advantage', 'Zero', 'The Q-value'], a: 1, why: 'The TD errors telescope: Σ γˡ δ_{t+l} = G_t − V(s_t). Unbiased, but high variance.' },
    { q: 'Why is PPO the default for robot RL in GPU simulators?', o: ['It is the most sample-efficient', 'Samples are nearly free there, so its stability and simplicity matter more than sample efficiency', 'It needs no critic', 'It is off-policy'], a: 1, why: 'Thousands of parallel environments make on-policy data cheap.' },
    { q: 'The soft-optimal policy in maximum-entropy RL is…', o: ['argmax Q', 'π(a|s) ∝ exp(Q(s,a)/α)', 'uniform', 'π ∝ Q'], a: 1, why: 'A Boltzmann distribution; α trades reward against entropy.' },
    { q: 'Why do SAC and TD3 use the minimum of two critics in the target?', o: ['To halve compute', 'A max over noisy estimates is biased upwards and the bias compounds through bootstrapping; the min counteracts it', 'To make the policy deterministic', 'To regularise the actor'], a: 1, why: 'E[max Q̂] ≥ max E[Q̂]. Clipped double Q is slightly pessimistic instead.' },
    { q: 'In MPO, the E-step temperature η is…', o: ['A fixed hyperparameter', 'Solved for (via a dual) so that KL(q‖π_old) meets the bound ε', 'Always 1', 'Learned by the actor'], a: 1, why: 'The KL bound is the hyperparameter; η follows from it.' },
    { q: 'A planner with a learned model drives into a wall the model doesn\'t know about. This is…', o: ['Reward hacking', 'Model exploitation: the optimiser finds where the model is wrong in its favour', 'Catastrophic forgetting', 'Overestimation'], a: 1, why: 'Fixes: collect data where plans go, penalise model uncertainty, keep horizons short with a learned terminal value.' },
  ],
});
