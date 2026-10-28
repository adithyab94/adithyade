'use strict';
// Advanced E: imitation meets RL. The Franka widget (topic 17) is an ES module, franka/peg.js.

const ADVE = (() => {
  const randn = () => {
    let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // ------------------------------------------------ 18 · offline RL: Q off the data
  // One state, a 1-D action. True Q is a bump. The logged data only covers actions near 0.
  const off = {
    A0: -3, A1: 3, NG: 121, DEG: 6,
    Q(a) { return Math.exp(-((a - 0.45) ** 2) / 0.6); },
    data(n = 36, noise = 0.12) {
      return Array.from({ length: n }, () => { const a = Math.max(-1.4, Math.min(1.4, 0.55 * randn())); return [a, this.Q(a) + noise * randn()]; });
    },
    phi(a) { const x = a / 3; return Array.from({ length: this.DEG + 1 }, (_, k) => x ** k); },
    grid() { return Array.from({ length: this.NG }, (_, i) => this.A0 + (this.A1 - this.A0) * i / (this.NG - 1)); },
    // minimise Σ(Q(aᵢ) − yᵢ)²/n + λ|c|² + α·( log Σ_a exp Q(a) − mean Q(aᵢ) )   (α = 0: plain regression; α > 0: CQL)
    fit(D, alpha, iters = 4000) {
      const P = D.map(([a]) => this.phi(a)), G = this.grid().map((a) => this.phi(a)), K = this.DEG + 1;
      let c = new Array(K).fill(0);
      const dot = (f) => f.reduce((s, v, k) => s + v * c[k], 0);
      for (let it = 0; it < iters; it++) {
        const g = new Array(K).fill(0);
        P.forEach((f, i) => { const e = dot(f) - D[i][1]; for (let k = 0; k < K; k++) g[k] += 2 * e * f[k] / D.length; });
        for (let k = 0; k < K; k++) g[k] += 2e-4 * c[k];
        if (alpha > 0) {
          const q = G.map(dot), m = Math.max(...q), e = q.map((v) => Math.exp(v - m)), Z = e.reduce((a, b) => a + b, 0);
          G.forEach((f, j) => { for (let k = 0; k < K; k++) g[k] += alpha * (e[j] / Z) * f[k]; });
          P.forEach((f) => { for (let k = 0; k < K; k++) g[k] -= alpha * f[k] / D.length; });
        }
        const lr = 0.5;
        for (let k = 0; k < K; k++) c[k] -= lr * g[k];
      }
      return (a) => this.phi(a).reduce((s, v, k) => s + v * c[k], 0);
    },
    // IQL-style: V = τ-expectile of Q over the logged actions; AWR picks a data action weighted by exp(β(Q − V))
    iql(D, Qf, tau = 0.8, beta = 5) {
      const q = D.map(([a]) => Qf(a));
      let v = q.reduce((a, b) => a + b, 0) / q.length;
      for (let it = 0; it < 200; it++) { const g = q.reduce((s, x) => s + (x > v ? tau : 1 - tau) * (x - v), 0); v += 0.5 * g / q.length; }
      const w = q.map((x) => Math.exp(beta * (x - v))), W = w.reduce((a, b) => a + b, 0);
      return { v, a: D.reduce((s, [a], i) => s + w[i] * a, 0) / W };
    },
  };

  // ------------------------------------------------ 19 · advantage-conditioned policies (RECAP-style)
  // 2-D action (grasp offset). Demos come from a careful and a sloppy mode; success depends on the action.
  const recap = {
    N: 60, R: 1.6,
    succ(a) { return 0.95 * Math.exp(-((a[0] - 0.35) ** 2 + (a[1] - 0.2) ** 2) / 0.12); },
    demos(n = 300) {
      return Array.from({ length: n }, () => {
        const careful = Math.random() < 0.35;
        const a = careful ? [0.35 + 0.18 * randn(), 0.2 + 0.18 * randn()] : [-0.35 + 0.35 * randn(), -0.15 + 0.35 * randn()];
        return { a, y: Math.random() < this.succ(a) ? 1 : 0 };
      });
    },
    // on a grid: BC density p(a) (KDE), learned success p(I=1 | a) (kernel regression), and the guided policy p(a)·p(I|a)^w
    policies(D, w, h = 0.16) {
      const n = this.N, out = { bc: [], guided: [] }, k = (a, b) => Math.exp(-((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) / (2 * h * h));
      let zb = 0, zg = 0, sb = 0, sg = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = [-this.R + 2 * this.R * (i + 0.5) / n, -this.R + 2 * this.R * (j + 0.5) / n];
        let p = 0, num = 0;
        for (const d of D) { const kk = k(a, d.a); p += kk; num += kk * d.y; }
        const ps = p > 1e-9 ? num / p : 0, pg = p * Math.pow(Math.max(ps, 1e-6), w);
        out.bc.push(p); out.guided.push(pg);
        zb += p; zg += pg; sb += p * this.succ(a); sg += pg * this.succ(a);
      }
      return { ...out, sBC: sb / zb, sG: sg / zg };
    },
  };

  // ------------------------------------------------ 19 · DPPO: policy gradient through a denoising chain
  // K denoising steps a^{k−1} = a^k + (θ_k0 + θ_k1 a^k) + σ ξ, started from a^K ~ N(0, 1). Pretrained to mimic demos around 0.
  const dppo = {
    K: 6, SIG: 0.18, GOAL: 1.3,
    r(a) { return Math.exp(-((a - this.GOAL) ** 2) / 0.08); },
    init() { return Array.from({ length: this.K }, () => [0, -0.25]); },     // each step shrinks toward 0: "BC-pretrained"
    sample(th, n) {
      const chains = [];
      for (let i = 0; i < n; i++) {
        let a = randn(); const c = [a];
        for (let k = 0; k < this.K; k++) { a = a + th[k][0] + th[k][1] * a + this.SIG * randn(); c.push(a); }
        chains.push(c);
      }
      return chains;
    },
    step(th, { n = 256, lr = 0.02 } = {}) {
      const ch = this.sample(th, n), R = ch.map((c) => this.r(c[this.K]));
      const m = R.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(R.reduce((a, b) => a + (b - m) ** 2, 0) / n) || 1;
      const g = th.map(() => [0, 0]);
      ch.forEach((c, i) => {
        const A = (R[i] - m) / sd;
        for (let k = 0; k < this.K; k++) {                 // ∇ log N(a^{k−1}; a^k + μ_k, σ²) for every denoising step
          const e = (c[k + 1] - c[k] - th[k][0] - th[k][1] * c[k]) / (this.SIG * this.SIG);
          g[k][0] += A * e; g[k][1] += A * e * c[k];
        }
      });
      th.forEach((t, k) => { t[0] += lr * g[k][0] / n * this.SIG * this.SIG; t[1] += lr * g[k][1] / n * this.SIG * this.SIG; });
      return m;
    },
  };

  // ------------------------------------------------ 20 · real-world RL: demos, interventions, update-to-data ratio
  const real = {
    W: 8, H: 8, CAP: 60, STEP_S: 0.5,
    walls: new Set(['2,1', '2,2', '2,3', '2,4', '2,5', '5,2', '5,3', '5,4', '5,5', '5,6', '3,5', '4,5']),
    START: [0, 7], GOAL: [7, 0],
    ok(x, y) { return x >= 0 && y >= 0 && x < 8 && y < 8 && !this.walls.has(x + ',' + y); },
    move([x, y], a) {
      if (Math.random() < 0.1) a = Math.floor(Math.random() * 4);        // 10% slip
      const nx = x + [0, 1, 0, -1][a], ny = y + [-1, 0, 1, 0][a];
      return this.ok(nx, ny) ? [nx, ny] : [x, y];
    },
    dist() {
      if (this._d) return this._d;
      const d = {}, q = [this.GOAL]; d[this.GOAL.join()] = 0;
      while (q.length) { const [x, y] = q.shift(); for (let a = 0; a < 4; a++) { const nx = x + [0, 1, 0, -1][a], ny = y + [-1, 0, 1, 0][a]; if (this.ok(nx, ny) && d[nx + ',' + ny] === undefined) { d[nx + ',' + ny] = d[x + ',' + y] + 1; q.push([nx, ny]); } } }
      return (this._d = d);
    },
    expert(s) {
      const d = this.dist(); let best = 0, bv = Infinity;
      for (let a = 0; a < 4; a++) { const nx = s[0] + [0, 1, 0, -1][a], ny = s[1] + [-1, 0, 1, 0][a]; const v = this.ok(nx, ny) ? d[nx + ',' + ny] : Infinity; if (v < bv) { bv = v; best = a; } }
      return best;
    },
    // off-policy Q-learning from a replay buffer; demos (if any) are sampled 50/50 with online data, as in RLPD
    run({ demos = 0, interventions = false, utd = 2, reset = 20, minutes = 60 }) {
      const Q = new Float64Array(64 * 4), on = [], dm = [], curve = [];
      const idx = (s) => s[1] * 8 + s[0];
      const push = (buf, s, a, r, s2, done) => buf.push([idx(s), a, r, idx(s2), done]);
      for (let e = 0; e < demos; e++) {                // teleoperated demos (cost robot time too)
        let s = this.START.slice();
        for (let t = 0; t < this.CAP; t++) { const a = this.expert(s), s2 = this.move(s, a), done = s2[0] === 7 && s2[1] === 0; push(dm, s, a, done ? 1 : 0, s2, done); s = s2; if (done) break; }
      }
      let clock = demos * (12 * this.STEP_S + reset), human = 0;
      const update = () => {
        const useDemo = dm.length && Math.random() < 0.5, buf = useDemo ? dm : on;
        if (!buf.length) return;
        const [s, a, r, s2, done] = buf[Math.floor(Math.random() * buf.length)];
        let m = -Infinity; for (let k = 0; k < 4; k++) m = Math.max(m, Q[s2 * 4 + k]);
        Q[s * 4 + a] += 0.3 * ((done ? r : r + 0.95 * m) - Q[s * 4 + a]);
      };
      const greedy = (s) => { let b = 0; for (let k = 1; k < 4; k++) if (Q[idx(s) * 4 + k] > Q[idx(s) * 4 + b]) b = k; return b; };
      const evalSucc = () => { let ok = 0; for (let e = 0; e < 20; e++) { let s = this.START.slice(); for (let t = 0; t < this.CAP; t++) { s = this.move(s, greedy(s)); if (s[0] === 7 && s[1] === 0) { ok++; break; } } } return ok / 20; };
      let nextEval = 0;
      while (clock < minutes * 60) {
        let s = this.START.slice(), stuck = 0, takeover = 0, best = this.dist()[s.join()];
        for (let t = 0; t < this.CAP; t++) {
          let a;
          if (takeover > 0) { a = this.expert(s); takeover--; human++; }
          else a = Math.random() < 0.2 ? Math.floor(Math.random() * 4) : greedy(s);
          const s2 = this.move(s, a), done = s2[0] === 7 && s2[1] === 0;
          push(on, s, a, done ? 1 : 0, s2, done);
          for (let u = 0; u < utd; u++) update();
          clock += this.STEP_S; s = s2;
          const d = this.dist()[s.join()];
          if (d < best) { best = d; stuck = 0; } else stuck++;
          if (interventions && stuck >= 8 && takeover === 0) { takeover = 4; stuck = 0; }
          if (done) break;
        }
        clock += reset;
        if (clock / 60 >= nextEval) { curve.push([clock / 60, evalSucc()]); nextEval += 2; }
      }
      return { curve, human };
    },
  };

  return { randn, off, recap, dppo, real };
})();

if (typeof module !== 'undefined') { module.exports = ADVE; }

// ---------------------------------------------------------------- widgets
if (typeof document !== 'undefined') (() => {
  const C = ADV_C;
  const lbl = (ctx, txt, x, y, o = {}) => {
    ctx.font = o.font || C.font; ctx.fillStyle = o.color || C.muted;
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
    ctx.fillText(txt, x, y);
  };

  // ============================================================ 18 · offline Q
  (() => {
    const cv = document.getElementById('of-c');
    if (!cv) return;
    const O = ADVE.off;
    let D = O.data(), plain = O.fit(D, 0), cqlA = -1, cql = null;
    const al = RL.range('of-a', () => draw(), (v) => v.toFixed(2));
    const tau = RL.range('of-t', () => draw(), (v) => v.toFixed(2));
    const argmax = (f) => O.grid().reduce((b, a) => (f(a) > f(b) ? a : b), O.A0);
    function draw() {
      if (cqlA !== al()) { cql = O.fit(D, al()); cqlA = al(); }
      const G = O.grid(), iq = O.iql(D, plain, tau());
      const ap = argmax(plain), ac = argmax(cql);
      const clip = (v) => Math.max(-1.5, Math.min(2.5, v));
      RL.lineChart(cv, [
        { data: G.map((a) => [a, O.Q(a)]), color: C.muted, dash: [4, 4], label: 'true Q', width: 1.5 },
        { data: G.map((a) => [a, clip(plain(a))]), color: C.terra, label: 'plain fit' },
        { data: G.map((a) => [a, clip(cql(a))]), color: C.blue, label: 'CQL' },
        { data: D, color: 'rgba(35,34,32,0.55)', dots: true, r: 3 },
      ], { xLabel: 'action a', yLabel: 'Q', xMin: O.A0, xMax: O.A1, yMin: -1.5, yMax: 2.5,
        points: [{ x: ap, y: -1.3, color: C.terra, r: 6 }, { x: ac, y: -1.3, color: C.blue, r: 6 }, { x: iq.a, y: -1.3, color: C.green, r: 6, label: 'IQL', below: false }],
        vlines: [{ x: ap, color: C.terra }, { x: ac, color: C.blue }] });
      const fmt = (a) => `${O.Q(a).toFixed(2)} (a = ${a.toFixed(2)})`;
      RL.$('#of-p').textContent = fmt(ap); RL.$('#of-q').textContent = fmt(ac); RL.$('#of-i').textContent = fmt(iq.a);
    }
    RL.$('#of-new').addEventListener('click', () => { D = O.data(); plain = O.fit(D, 0); cqlA = -1; draw(); });
    addEventListener('resize', draw);
    RL.onVisible(cv, draw);
  })();

  // ============================================================ 19a · advantage conditioning
  (() => {
    const cb = document.getElementById('rc-bc');
    if (!cb) return;
    const R = ADVE.recap;
    let D = R.demos();
    const w = RL.range('rc-w', () => draw(), (v) => v.toFixed(1));
    function heat(cv, vals, title) {
      const { ctx, w: W, h } = RL.fit(cv), side = Math.min(W - 20, h - 40), x0 = (W - side) / 2, y0 = 24, n = R.N, c = side / n;
      const m = Math.max(...vals);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        ctx.fillStyle = `rgba(62,111,176,${(0.9 * vals[j * n + i] / m).toFixed(3)})`;
        ctx.fillRect(x0 + i * c, y0 + (n - 1 - j) * c, c + 0.5, c + 0.5);
      }
      const P = (a) => [x0 + (a[0] + R.R) / (2 * R.R) * side, y0 + (1 - (a[1] + R.R) / (2 * R.R)) * side];
      D.forEach((d) => { const [x, y] = P(d.a); ctx.fillStyle = d.y ? 'rgba(47,125,95,0.6)' : 'rgba(184,69,47,0.35)'; ctx.fillRect(x - 1, y - 1, 2, 2); });
      const [gx, gy] = P([0.35, 0.2]); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(gx, gy, 0.35 / (2 * R.R) * side, 0, 7); ctx.stroke();
      ctx.strokeStyle = C.line; ctx.strokeRect(x0, y0, side, side);
      lbl(ctx, title, x0, 15, { color: C.ink });
    }
    function draw() {
      const p = R.policies(D, w());
      heat(cb, p.bc, 'behaviour cloning (green = success, red = fail)');
      heat(RL.$('#rc-g'), p.guided, `guided, w = ${w().toFixed(1)} (circle = where grasps work)`);
      RL.$('#rc-sb').textContent = (100 * p.sBC).toFixed(0) + '%';
      RL.$('#rc-sg').textContent = (100 * p.sG).toFixed(0) + '%';
    }
    RL.$('#rc-new').addEventListener('click', () => { D = R.demos(); draw(); });
    addEventListener('resize', draw);
    RL.onVisible(cb, draw);
  })();

  // ============================================================ 19b · DPPO
  (() => {
    const cv = document.getElementById('dp-chain');
    if (!cv) return;
    const P = ADVE.dppo;
    let th = P.init(), curve = [], timer = 0;
    function draw() {
      const ch = P.sample(th, 120), { ctx, w, h } = RL.fit(cv);
      const pad = { l: 40, r: 60, t: 14, b: 26 }, X = (k) => pad.l + k / P.K * (w - pad.l - pad.r), Y = (a) => pad.t + (1 - (a + 2.5) / 5) * (h - pad.t - pad.b);
      ctx.strokeStyle = C.line; [-2, -1, 0, 1, 2].forEach((a) => { ctx.beginPath(); ctx.moveTo(pad.l, Y(a)); ctx.lineTo(w - pad.r, Y(a)); ctx.stroke(); lbl(ctx, String(a), pad.l - 6, Y(a), { align: 'right', base: 'middle', font: C.mono }); });
      ctx.fillStyle = 'rgba(168,112,26,0.18)'; ctx.fillRect(w - pad.r, Y(P.GOAL + 0.3), pad.r - 6, Y(P.GOAL - 0.3) - Y(P.GOAL + 0.3));
      lbl(ctx, 'reward', w - pad.r + 4, Y(P.GOAL) + 4, { color: C.amber });
      ch.forEach((c) => {
        ctx.strokeStyle = P.r(c[P.K]) > 0.3 ? 'rgba(47,125,95,0.45)' : 'rgba(62,111,176,0.22)'; ctx.lineWidth = 1;
        ctx.beginPath(); c.forEach((a, k) => (k ? ctx.lineTo(X(k), Y(a)) : ctx.moveTo(X(k), Y(a)))); ctx.stroke();
      });
      lbl(ctx, 'noise a^K', X(0), h - 6, { align: 'center', font: C.mono }); lbl(ctx, 'action a^0', X(P.K), h - 6, { align: 'center', font: C.mono });
      RL.lineChart(RL.$('#dp-r'), [{ data: curve, color: C.green, label: 'mean reward' }], { xLabel: 'PPO update', yMin: 0, yMax: 1, xMin: 0, xMax: Math.max(20, curve.length) });
    }
    RL.$('#dp-run').addEventListener('click', () => {
      if (timer) return;
      let n = 0;
      timer = setInterval(() => { for (let k = 0; k < 4; k++) curve.push(P.step(th, { lr: 0.3 })); draw(); if ((n += 4) >= 200) { clearInterval(timer); timer = 0; } }, 30);
    });
    RL.$('#dp-reset').addEventListener('click', () => { clearInterval(timer); timer = 0; th = P.init(); curve = []; draw(); });
    addEventListener('resize', draw);
    RL.onVisible(cv, draw);
  })();

  // ============================================================ 20 · real-world RL bench
  (() => {
    const cv = document.getElementById('rw-c');
    if (!cv) return;
    const L = ADVE.real, COLS = [C.ink, C.terra, C.blue, C.green, C.purple, C.amber];
    const dm = RL.range('rw-d', null, (v) => v.toFixed(0));
    const ut = RL.range('rw-u', null, (v) => v.toFixed(0));
    const rs = RL.range('rw-r', null, (v) => v.toFixed(0));
    let runs = [];
    function draw() {
      RL.lineChart(cv, runs.map((r, i) => ({ data: r.curve, color: COLS[i % COLS.length], label: r.name })),
        { xLabel: 'robot wall-clock time (min)', yLabel: 'success rate', yMin: 0, yMax: 1.05, xMin: 0, xMax: 30 });
    }
    RL.$('#rw-run').addEventListener('click', () => {
      const cfg = { demos: dm(), utd: ut(), reset: rs(), interventions: RL.$('#rw-i').checked, minutes: 30 };
      const seeds = [0, 1, 2].map(() => L.run(cfg));
      const curve = seeds[0].curve.map(([t], i) => [t, seeds.reduce((s, o) => s + (o.curve[i] ? o.curve[i][1] : o.curve[o.curve.length - 1][1]), 0) / 3]);
      const name = `${cfg.demos} demos · UTD ${cfg.utd} · reset ${cfg.reset}s${cfg.interventions ? ' · interventions' : ''}`;
      runs.push({ curve, name }); if (runs.length > 6) runs.shift();
      draw();
    });
    RL.$('#rw-clear').addEventListener('click', () => { runs = []; draw(); });
    addEventListener('resize', draw);
    RL.onVisible(cv, draw);
  })();
})();

if (typeof window !== 'undefined') window.ADV_QUIZ = Object.assign(window.ADV_QUIZ || {}, {
  advE: [
    { q: 'In residual RL the executed action is…', o: ['Only the learned policy\'s action', 'The base controller\'s action plus a learned, usually bounded, correction', 'The average of several policies', 'The base action, with RL tuning its gains'], a: 1, why: 'a = a_base(s) + a_res(s). RL only learns what the base gets wrong.' },
    { q: 'A flat peg rests half over a hole. What tells the wrist which way the hole is?', o: ['The vertical force', 'The torque, i.e. the centre of pressure τ/F_z, which sits on the side still touching the surface', 'The joint velocities', 'Nothing: it must search blindly'], a: 1, why: 'The table only pushes up where the peg overlaps it, so the lever arm points away from the hole.' },
    { q: 'What goes wrong when plain Q-learning is trained on a fixed dataset?', o: ['It learns too slowly', 'The max in the target picks actions absent from the data, whose Q-values are unchecked extrapolations, and nothing ever corrects them', 'It forgets the data', 'It needs a model'], a: 1, why: 'Online, optimism gets tested; offline it compounds. CQL penalises it, IQL avoids querying it.' },
    { q: 'IQL avoids out-of-distribution actions by…', o: ['Clipping Q', 'Fitting V as an expectile of Q over dataset actions only, and extracting the policy with advantage-weighted regression', 'Using a bigger network', 'Adding noise'], a: 1, why: 'Q is never evaluated at actions outside the data.' },
    { q: 'RLPD\'s main ingredients are…', o: ['A world model and planning', 'Off-policy SAC with 50/50 offline/online batches, LayerNorm critics, an ensemble and a high update-to-data ratio', 'PPO with demos', 'Behaviour cloning only'], a: 1, why: 'Simple, stable, and sample-efficient enough for real hardware.' },
    { q: 'Advantage-conditioned policies (as in RECAP) improve on behaviour cloning by…', o: ['Discarding all failed data', 'Learning which actions had positive advantage and, at deployment, asking for that label with a guidance weight', 'Running PPO on the whole VLA', 'Collecting more demos'], a: 1, why: 'π_w ∝ π · p(I = 1 | a)^w: the bad data still teaches the policy what not to do.' },
    { q: 'Which change most directly cuts robot wall-clock time in real-world RL?', o: ['A bigger network', 'Automatic resets, more gradient steps per robot step, demos and interventions', 'A lower discount factor', 'On-policy learning'], a: 1, why: 'Robot time is the scarce resource; everything else is spent to save it.' },
  ],
});
