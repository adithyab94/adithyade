'use strict';
// Advanced F: deployment. Safety and constraints, and running policies on edge hardware.

const ADVF = (() => {
  // small seeded RNG so the "trained" network is the same for every reader
  const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const randnFrom = (r) => () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const randn = randnFrom(Math.random);

  // ------------------------------------------------ 21 · constrained RL with a Lagrange multiplier
  // Policy parameter θ = how aggressively the robot moves. Reward J_r = θ − 0.1θ², cost J_c = 0.05θ² (e.g. expected contact force).
  const lag = {
    Jr(t) { return t - 0.1 * t * t; }, Jc(t) { return 0.05 * t * t; },
    run({ d, lrT = 0.05, lrL = 0.5, iters = 300, fixed = null }) {
      let t = 0.5, l = 0;
      const tr = [];
      for (let i = 0; i < iters; i++) {
        const lam = fixed ?? l;
        t += lrT * ((1 - 0.2 * t) - lam * 0.1 * t);                  // ∇θ [J_r − λ (J_c − d)]
        if (fixed === null) l = Math.max(0, l + lrL * (this.Jc(t) - d));   // dual ascent on λ
        tr.push([i, t, lam, this.Jc(t), this.Jr(t)]);
      }
      return tr;
    },
  };

  // ------------------------------------------------ 21 · control barrier function safety filter
  // Single-integrator robot ẋ = u. Safe set h(x) = ‖x − c‖² − r² ≥ 0. Filter: min ‖u − u_RL‖² s.t. ∇h·u + α h ≥ 0.
  const cbf = {
    C: [0, 0], R: 0.8, START: [-2.2, 0.15], GOAL: [2.2, -0.1], DT: 0.02,
    filter(x, u, alpha) {
      const dx = x[0] - this.C[0], dy = x[1] - this.C[1], h = dx * dx + dy * dy - this.R * this.R;
      const a = [2 * dx, 2 * dy], s = a[0] * u[0] + a[1] * u[1] + alpha * h;
      if (s >= 0) return { u, active: false, h };
      const k = -s / (a[0] * a[0] + a[1] * a[1]);                     // closed-form projection onto the half-space
      return { u: [u[0] + k * a[0], u[1] + k * a[1]], active: true, h };
    },
    run({ on, alpha, noise = 0.25, seed = 1 }) {
      const n = randnFrom(rng(seed));
      let x = this.START.slice(), minH = Infinity, hit = false, steps = 0;
      const tr = [x.slice()];
      for (let i = 0; i < 600; i++) {
        const g = [this.GOAL[0] - x[0], this.GOAL[1] - x[1]], dist = Math.hypot(g[0], g[1]);
        if (dist < 0.05) break;
        const sp = Math.min(1.2, 2 * dist);                            // the "RL policy": straight at the goal, plus exploration noise
        let u = [sp * g[0] / dist + noise * n(), sp * g[1] / dist + noise * n()];
        if (on) u = this.filter(x, u, alpha).u;
        x = [x[0] + this.DT * u[0], x[1] + this.DT * u[1]];
        const h = (x[0] - this.C[0]) ** 2 + (x[1] - this.C[1]) ** 2 - this.R * this.R;
        minH = Math.min(minH, h); if (h < 0) hit = true;
        tr.push(x.slice()); steps++;
      }
      return { tr, minDist: Math.sqrt(Math.max(0, minH + this.R * this.R)) - this.R, hit, steps };
    },
  };

  // ------------------------------------------------ 22 · control-loop timing budget
  // Each stage: [name, mean ms, jitter (lognormal σ)]. A loop iteration misses its deadline if the sum exceeds the period.
  const loop = {
    stages: [
      ['read sensors (EtherCAT)', 0.5, 0.15], ['state estimation', 0.4, 0.2], ['normalise + policy MLP', 0.15, 0.3],
      ['write targets', 0.3, 0.15], ['VLA (camera → targets)', 45, 0.25],
    ],
    sample(mean, sig) { return mean * Math.exp(sig * randn() - 0.5 * sig * sig); },
    // asyncVLA: the VLA runs in its own process and the control loop just reads its latest targets
    run({ hz, asyncVLA, cpuLoad = 0, n = 4000 }) {
      const period = 1000 / hz, times = [];
      let miss = 0;
      for (let i = 0; i < n; i++) {
        let t = 0;
        this.stages.forEach(([name, m, s], k) => {
          if (k === 4 && asyncVLA) return;
          t += this.sample(m * (1 + cpuLoad), s * (1 + cpuLoad));
        });
        if (Math.random() < 0.002 * (1 + 4 * cpuLoad)) t += 3 + 10 * Math.random();   // the occasional OS hiccup
        times.push(t); if (t > period) miss++;
      }
      return { times, miss: miss / n, period };
    },
  };

  // ------------------------------------------------ 22 · quantising a small balance policy
  // A random-feature MLP 2 → 16 → 1 (tanh), fitted by least squares to the capture-point balance controller,
  // then run in closed loop on the linear inverted pendulum with pushes. Weights quantised symmetric per tensor.
  const quant = {
    G: 9.81, Z: 0.9, F: 0.1, DT: 0.002, T: 6, H: 16, WS: 1.2, SX: 0.05, SV: 0.15,
    teacher(x, v) { const w = Math.sqrt(this.G / this.Z), xi = x + v / w; return Math.max(-this.F, Math.min(this.F, xi + 1.5 * xi)) / this.F; },
    train() {
      const r = rng(7), n = randnFrom(r);
      const W1 = Array.from({ length: this.H }, () => [this.WS * n(), this.WS * n()]), b1 = Array.from({ length: this.H }, () => 0.8 * n());
      const feats = (x, v) => W1.map((w, i) => Math.tanh(w[0] * x / this.SX + w[1] * v / this.SV + b1[i]));
      const A = Array.from({ length: this.H }, () => new Array(this.H).fill(0)), y = new Array(this.H).fill(0);
      for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) {
        const x = -0.3 + 0.6 * i / 40, v = -1 + 2 * j / 40, f = feats(x, v), t = this.teacher(x, v);
        for (let a = 0; a < this.H; a++) { y[a] += f[a] * t; for (let b = 0; b < this.H; b++) A[a][b] += f[a] * f[b]; }
      }
      for (let a = 0; a < this.H; a++) A[a][a] += 1e-3;
      return { W1, b1, w2: solve(A, y) };
    },
    quantize(net, bits) {
      if (bits >= 32) return net;
      const q = (arr) => { const m = Math.max(...arr.map(Math.abs)), s = m / (2 ** (bits - 1) - 1); return arr.map((x) => s * Math.round(x / s)); };
      const flat = q(net.W1.flat());
      return { W1: net.W1.map((_, i) => [flat[2 * i], flat[2 * i + 1]]), b1: q(net.b1), w2: q(net.w2) };
    },
    act(net, x, v, norm) {
      const [sx, sv] = norm;
      const h = net.W1.map((w, i) => Math.tanh(w[0] * x / sx + w[1] * v / sv + net.b1[i]));
      return Math.max(-1, Math.min(1, h.reduce((s, hi, i) => s + hi * net.w2[i], 0))) * this.F;
    },
    run(net, { norm = [this.SX, this.SV], hz = 50 } = {}) {
      const w = Math.sqrt(this.G / this.Z), every = Math.round(1 / (hz * this.DT)), n = Math.round(this.T / this.DT);
      let x = 0, v = 0, p = 0, fell = -1, err = 0;
      const tr = [];
      for (let i = 0; i < n; i++) {
        const t = i * this.DT;
        if ([1, 2.5, 4].some((tp) => Math.abs(t - tp) < this.DT / 2)) v += 0.18 * (t === 2.5 ? -1 : 1);   // pushes
        if (i % every === 0) p = this.act(net, x, v, norm);
        v += this.DT * w * w * (x - p); x += this.DT * v;
        if (Math.abs(x) > 0.35 && fell < 0) fell = t;
        err += Math.abs(x);
        if (i % 10 === 0) tr.push([t, x]);
        if (fell >= 0 && t > fell + 0.3) break;
      }
      return { tr, fell, err: err / n };
    },
  };

  function solve(A, y) {
    const n = y.length, M = A.map((r, i) => [...r, y[i]]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }

  return { lag, cbf, loop, quant };
})();

if (typeof module !== 'undefined') { module.exports = ADVF; }

// ---------------------------------------------------------------- widgets
if (typeof document !== 'undefined') (() => {
  const C = ADV_C;
  const lbl = (ctx, txt, x, y, o = {}) => {
    ctx.font = o.font || C.font; ctx.fillStyle = o.color || C.muted;
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
    ctx.fillText(txt, x, y);
  };

  // ============================================================ 21a · Lagrangian
  (() => {
    const ct = document.getElementById('lg-t');
    if (!ct) return;
    const Lg = ADVF.lag;
    const d = RL.range('lg-d', () => draw(), (v) => v.toFixed(2));
    const lr = RL.range('lg-l', () => draw(), (v) => v.toFixed(2));
    const fl = RL.range('lg-fl', () => draw(), (v) => v.toFixed(1));
    RL.$('#lg-fix').addEventListener('change', () => draw());
    function draw() {
      const fixed = RL.$('#lg-fix').checked ? fl() : null, tr = Lg.run({ d: d(), lrL: lr(), fixed });
      const opt = Math.min(5, Math.sqrt(d() / 0.05));
      RL.lineChart(ct, [
        { data: tr.map((r) => [r[0], r[1]]), color: C.ink, label: 'θ', width: 2 },
        { data: tr.map((r) => [r[0], r[2]]), color: C.purple, label: 'λ', width: 1.5 },
      ], { xLabel: 'iteration', yMin: 0, yMax: Math.max(6, ...tr.map((r) => r[2])) * 1.05, xMin: 0, xMax: tr.length, hlines: [{ y: opt, color: C.muted, label: 'constrained optimum θ*' }] });
      RL.lineChart(RL.$('#lg-c'), [{ data: tr.map((r) => [r[0], r[3]]), color: C.terra, label: 'cost J_c', width: 2 }],
        { xLabel: 'iteration', yMin: 0, yMax: Math.max(1.3, 1.2 * d(), ...tr.map((r) => r[3])), xMin: 0, xMax: tr.length, hlines: [{ y: d(), color: C.red, label: 'limit d' }] });
    }
    addEventListener('resize', draw);
    RL.onVisible(ct, draw);
  })();

  // ============================================================ 21b · CBF filter
  (() => {
    const cv = document.getElementById('cbf-c');
    if (!cv) return;
    const B = ADVF.cbf;
    const al = RL.range('cbf-a', () => draw(), (v) => v.toFixed(1));
    RL.$('#cbf-on').addEventListener('change', () => draw());
    function draw() {
      const on = RL.$('#cbf-on').checked, runs = [1, 2, 3, 4].map((seed) => B.run({ on, alpha: al(), seed }));
      const { ctx, w, h } = RL.fit(cv), S = Math.min((w - 20) / 5.2, (h - 20) / 2.6), P = (x, y) => [w / 2 + x * S, h / 2 - y * S];
      ctx.fillStyle = 'rgba(184,69,47,0.14)'; ctx.beginPath(); ctx.arc(...P(B.C[0], B.C[1]), B.R * S, 0, 7); ctx.fill();
      ctx.strokeStyle = C.red; ctx.lineWidth = 1.5; ctx.stroke();
      lbl(ctx, 'obstacle', ...P(0, -0.15), { align: 'center', color: C.red });
      runs.forEach((r) => {
        ctx.strokeStyle = r.hit ? C.red : C.blue; ctx.lineWidth = 1.6; ctx.beginPath();
        r.tr.forEach(([x, y], i) => (i ? ctx.lineTo(...P(x, y)) : ctx.moveTo(...P(x, y)))); ctx.stroke();
      });
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(...P(...B.START), 6, 0, 7); ctx.fill();
      ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(...P(...B.GOAL), 8, 0, 7); ctx.fill();
      lbl(ctx, 'start', ...P(B.START[0], B.START[1] + 0.2), { align: 'center' }); lbl(ctx, 'goal', ...P(B.GOAL[0], B.GOAL[1] + 0.22), { align: 'center', color: C.amber });
      RL.$('#cbf-hit').textContent = runs.filter((r) => r.hit).length;
      const md = Math.min(...runs.map((r) => r.minDist));
      RL.$('#cbf-min').textContent = md <= 0 ? 'inside the obstacle' : (100 * md).toFixed(1) + ' cm';
      RL.$('#cbf-t').textContent = (runs.reduce((s, r) => s + r.steps, 0) / 4 * B.DT).toFixed(1) + ' s';
    }
    addEventListener('resize', draw);
    RL.onVisible(cv, draw);
  })();

  // ============================================================ 22a · loop budget
  (() => {
    const cv = document.getElementById('lp-h');
    if (!cv) return;
    const L = ADVF.loop;
    const hz = RL.range('lp-hz', () => draw(), (v) => v.toFixed(0));
    const cl = RL.range('lp-c', () => draw(), (v) => v.toFixed(2));
    RL.$('#lp-a').addEventListener('change', () => draw());
    function draw() {
      const r = L.run({ hz: hz(), asyncVLA: RL.$('#lp-a').checked, cpuLoad: cl() });
      const hi = Math.max(r.period * 1.6, 3), NB = 60, bw = hi / NB, hist = new Array(NB).fill(0);
      r.times.forEach((t) => { hist[Math.min(NB - 1, Math.floor(t / bw))]++; });
      RL.lineChart(cv, [{ data: [] }], { xLabel: 'loop time (ms)', yLabel: 'iterations', xMin: 0, xMax: hi, yMin: 1, yMax: Math.max(10, ...hist) * 1.5, logY: true, legend: false,
        bars: hist.map((c, i) => ({ x: i * bw, y: Math.max(1, c), w: bw, base: 1, color: (i + 1) * bw > r.period ? 'rgba(184,69,47,0.6)' : 'rgba(62,111,176,0.5)' })),
        vlines: [{ x: r.period, color: C.red, dash: [] }] });
      const s = r.times.slice().sort((a, b) => a - b);
      RL.$('#lp-p').textContent = r.period.toFixed(2) + ' ms';
      RL.$('#lp-m').innerHTML = `<span style="color:${r.miss > 0.001 ? C.red : C.green}">${(100 * r.miss).toFixed(2)}%</span>`;
      RL.$('#lp-q').textContent = s[Math.floor(0.999 * s.length)].toFixed(2) + ' ms';
    }
    addEventListener('resize', draw);
    RL.onVisible(cv, draw);
  })();

  // ============================================================ 22b · precision vs parity
  (() => {
    const cv = document.getElementById('qt-c');
    if (!cv) return;
    const Q = ADVF.quant, net = Q.train();
    let bits = 32, norm = 'ok';
    const tabs = (id, key, set) => RL.$$(`#${id} button`).forEach((b) => b.addEventListener('click', () => {
      RL.$$(`#${id} button`).forEach((x) => x.classList.toggle('sel', x === b)); set(b.dataset[key]); draw();
    }));
    tabs('qt-b', 'b', (v) => { bits = +v; });
    tabs('qt-n', 'n', (v) => { norm = v; });
    function draw() {
      const nm = norm === 'ok' ? [Q.SX, Q.SV] : norm === 'forgot' ? [1, 1] : [2 * Q.SX, 2 * Q.SV];
      const ref = Q.run(net), r = Q.run(Q.quantize(net, bits), { norm: nm });
      RL.lineChart(cv, [
        { data: ref.tr, color: C.muted, dash: [5, 4], label: 'FP32, correct normalisation', width: 1.5 },
        { data: r.tr, color: r.fell >= 0 ? C.red : C.blue, label: 'this configuration', width: 2.2 },
      ], { xLabel: 'time (s) · pushes at 1, 2.5 and 4 s', yLabel: 'centre of mass x (m)', yMin: -0.36, yMax: 0.36, xMin: 0, xMax: Q.T,
        hlines: [{ y: 0.35, color: C.red, label: 'fallen' }, { y: -0.35, color: C.red }], vlines: [1, 2.5, 4].map((x) => ({ x, color: 'rgba(35,34,32,0.25)' })) });
      RL.$('#qt-r').innerHTML = r.fell >= 0 ? `<span style="color:${C.red}">fell at ${r.fell.toFixed(1)} s</span>` : `<span style="color:${C.green}">stayed up</span>`;
      RL.$('#qt-e').textContent = r.fell >= 0 ? '—' : (100 * r.err).toFixed(1) + ' cm';
    }
    addEventListener('resize', draw);
    RL.onVisible(cv, draw);
  })();
})();

if (typeof window !== 'undefined') window.ADV_QUIZ = Object.assign(window.ADV_QUIZ || {}, {
  advF: [
    { q: 'Why use a constrained MDP instead of a fixed penalty in the reward?', o: ['It trains faster', 'You specify the limit d directly; the multiplier λ adapts until the constraint holds, instead of hand-tuning a penalty that only fits one limit', 'Penalties are not allowed in RL', 'It removes the need for a reward'], a: 1, why: 'λ ← max(0, λ + η(J_c − d)) rises while the limit is violated and decays when it is satisfied.' },
    { q: 'A control-barrier-function safety filter…', o: ['Retrains the policy', 'Minimally modifies each action so that ḣ + αh ≥ 0 keeps the state inside the safe set h ≥ 0', 'Stops the robot whenever it moves', 'Only works offline'], a: 1, why: 'A small QP per step; its guarantee is only as good as its model of the dynamics and the obstacle.' },
    { q: 'For a small locomotion MLP on an embedded computer, latency usually comes from…', o: ['The matrix multiplies', 'The pipeline around it: sensor I/O, state estimation, scheduling, and occasional slow iterations', 'The activation functions', 'Python'], a: 1, why: 'The network takes microseconds; the loop is judged by its worst case.' },
    { q: 'Where does quantisation pay off in a VLA + whole-body-controller stack?', o: ['Only the whole-body controller', 'The VLA, whose huge weight matrices make it memory-bandwidth bound; the tiny controller gains nothing and sits in a feedback loop', 'Neither', 'Both equally'], a: 1, why: 'Keep the controller FP16/FP32; INT8/FP8/4-bit the large model.' },
    { q: 'A policy that balanced perfectly in simulation falls on the robot at the first push. The first thing to check is…', o: ['Bit width', 'Observation parity: normalisation statistics, units, joint order, default pose and action scale', 'The learning rate', 'The reward'], a: 1, why: 'Log real observations, replay them through the simulator policy, and compare.' },
  ],
});
