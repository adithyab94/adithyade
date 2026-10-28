'use strict';
// Advanced C: the 2026 robot RL pipeline. Parallel sim, privileged training, control design, curricula.

const ADVC = (() => {
  const randn = () => {
    let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // ------------------------------------------------ 10 · throughput of CPU vs GPU simulation
  // GPU: one batched kernel per step. Fixed launch overhead, then linear in N until the device is full.
  // CPU: one env per core per step, perfectly parallel across cores.
  const sim = {
    gpu(N, { t0 = 0.004, rate = 4e5 } = {}) { return N / (t0 + N / rate); },          // env-steps per second
    cpu(N, { cores = 32, tEnv = 0.0012 } = {}) { return N / (Math.ceil(N / cores) * tEnv); },
  };

  // ------------------------------------------------ 11 · privileged teacher vs history-based student
  // A sled tracks a target speed v*. Drag c (unknown to the student) changes over time: carpet, ice, mud.
  const adapt = {
    DT: 0.02, T: 1500, VSTAR: 1.0, CNOM: 1.0, FB: 0.7,
    drag(t) { const s = t * 0.02; return s < 8 ? 1.0 : s < 15 ? 0.25 : s < 22 ? 2.2 : 1.0; },
    run(k, noise) {
      const { DT, T, VSTAR } = this, out = { c: [], est: [], err: { blind: 0, teacher: 0, student: 0 }, v: { blind: [], teacher: [], student: [] } };
      const st = { blind: 0, teacher: 0, student: 0 };
      const hist = [];                                  // (u, measured v, measured v_next) for the student
      let chat = this.CNOM, prevMeas = 0, prevU = 0;
      for (let t = 0; t < T; t++) {
        const c = this.drag(t);
        for (const who of ['blind', 'teacher', 'student']) {
          const v = st[who], cc = who === 'blind' ? this.CNOM : who === 'teacher' ? c : chat;
          const u = cc * VSTAR + this.FB * (VSTAR - v);  // feed-forward needs the drag, feedback cleans up
          st[who] = v + DT * (u - c * v);
          out.v[who].push(st[who]);
          if (t > 50) out.err[who] += (st[who] - VSTAR) ** 2;
          if (who === 'student') {
            const m = st[who] + noise * randn();
            if (t > 0) hist.push([prevU, prevMeas, m]);
            if (hist.length > k) hist.shift();
            prevMeas = m; prevU = u;
            // least squares on the window: (v' − v)/dt = u − c·v  →  c = Σ v (u − Δv/dt) / Σ v²
            let num = 0, den = 0;
            for (const [uu, vv, vn] of hist) { const y = uu - (vn - vv) / DT; num += vv * y; den += vv * vv; }
            if (den > 1e-6) chat = Math.max(0.05, Math.min(4, num / den));
          }
        }
        out.c.push(c); out.est.push(chat);
      }
      for (const w in out.err) out.err[w] = Math.sqrt(out.err[w] / (T - 50));
      return out;
    },
  };

  // ------------------------------------------------ 12 · PD position targets on one leg joint
  const pd = {
    I: 0.05, MGL: 1.2, TMAX: 12, DT: 0.001, DUR: 2,
    ref(t) { return 0.5 * Math.sin(2 * Math.PI * 1.5 * t) + 0.2 * Math.sin(2 * Math.PI * 4 * t); },
    run({ kp, kd, hz, lat, beta }) {
      const { I, MGL, TMAX, DT, DUR } = this, n = Math.round(DUR / DT), every = Math.max(1, Math.round(1 / (hz * DT))), d = Math.round(lat / 1000 / DT);
      let q = 0, w = 0, target = 0, filt = 0, sat = 0, se = 0, peak = 0, jerk = 0, lastT = 0;
      const pending = [], tr = { q: [], tgt: [], ref: [], tau: [] };
      for (let i = 0; i < n; i++) {
        const t = i * DT;
        if (i % every === 0) {                        // the policy runs: it sees the state now, its target arrives d ms later
          const a = this.ref(t + 0.5 / hz);            // an ideal policy aims at the middle of the interval it holds the target for
          filt = beta * filt + (1 - beta) * a;
          pending.push([i + d, filt]);
        }
        while (pending.length && pending[0][0] <= i) { const nt = pending.shift()[1]; jerk += (nt - lastT) ** 2; lastT = nt; target = nt; }
        let tau = kp * (target - q) - kd * w;
        if (Math.abs(tau) > TMAX) { sat++; tau = Math.sign(tau) * TMAX; }
        w += DT * (tau - MGL * Math.sin(q)) / I;
        q += DT * w;
        peak = Math.max(peak, Math.abs(tau));
        if (t > 0.25) se += (q - this.ref(t)) ** 2;
        if (i % 4 === 0) { tr.q.push([t, q]); tr.tgt.push([t, target]); tr.ref.push([t, this.ref(t)]); tr.tau.push([t, tau]); }
        if (!Number.isFinite(q) || Math.abs(q) > 20) return { tr, rmse: Infinity, sat: 1, peak: Infinity, unstable: true };
      }
      return { tr, rmse: Math.sqrt(se / (n - 250)), sat: sat / n, peak, rate: jerk, unstable: false };
    },
  };

  // ------------------------------------------------ 13 · curricula
  // One shared policy with a scalar skill s. An env at level ℓ succeeds with p = σ(k(s − ℓ)).
  // The learning signal from a batch is proportional to the success variance p(1 − p): all-fail or all-win teaches nothing.
  const curr = {
    N: 256, LMAX: 10, K: 2.2, ETA: 0.02,
    p(s, l) { return 1 / (1 + Math.exp(-this.K * (s - l))); },
    run(mode, { iters = 300 } = {}) {
      let s = 0;
      const lv = new Array(this.N).fill(0), sk = [], hist = [];
      for (let it = 0; it < iters; it++) {
        let sig = 0;
        for (let i = 0; i < this.N; i++) {
          const l = mode === 'hard' ? this.LMAX : mode === 'uniform' ? Math.random() * this.LMAX : lv[i];
          const p = this.p(s, l), win = Math.random() < p;
          sig += p * (1 - p);
          if (mode === 'auto') lv[i] = win ? Math.min(this.LMAX, lv[i] + 1) : Math.max(0, lv[i] - 1);   // terrain game: up on success, down on failure
        }
        s += this.ETA * sig / this.N * 10;
        sk.push(s);
        if (it % 10 === 0) hist.push(lv.slice());
      }
      return { sk, lv, hist };
    },
  };

  return { randn, sim, adapt, pd, curr };
})();

if (typeof module !== 'undefined') { module.exports = ADVC; }

// ---------------------------------------------------------------- widgets
if (typeof document !== 'undefined') (() => {
  const C = ADV_C;
  const lbl = (ctx, txt, x, y, o = {}) => {
    ctx.font = o.font || C.font; ctx.fillStyle = o.color || C.muted;
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
    ctx.fillText(txt, x, y);
  };
  const human = (sec) => (sec < 120 ? sec.toFixed(0) + ' s' : sec < 7200 ? (sec / 60).toFixed(0) + ' min' : (sec / 3600).toFixed(1) + ' h');
  const big = (x) => (x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? (x / 1e3).toFixed(0) + 'k' : x.toFixed(0));

  // ============================================================ 10 · parallel simulation
  (() => {
    const cf = document.getElementById('gpu-fleet');
    if (!cf) return;
    const S = ADVC.sim, STEPS = 150e6;
    const lgN = RL.range('gpu-n', () => draw(), (v) => String(2 ** v));
    const cores = RL.range('gpu-c', () => draw(), (v) => v.toFixed(0));
    let phase = 0;
    function fleet() {
      const N = 2 ** lgN(), { ctx, w, h } = RL.fit(cf);
      const shown = Math.min(N, 4096), cols = Math.ceil(Math.sqrt(shown * w / h)), rows = Math.ceil(shown / cols);
      const cw = (w - 16) / cols, ch = (h - 34) / rows, r = Math.max(0.8, Math.min(cw, ch) * 0.32);
      for (let i = 0; i < shown; i++) {
        const x = 8 + (i % cols + 0.5) * cw, y = 8 + (Math.floor(i / cols) + 0.5) * ch;
        const prog = ((phase * 0.013 + i * 0.6180339) % 1);            // each robot is somewhere in its episode
        ctx.fillStyle = prog > 0.93 ? C.terra : `rgba(47,125,95,${(0.25 + 0.6 * prog).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
      lbl(ctx, `${N} robots${N > shown ? ' (4096 drawn)' : ''} · red = resetting`, w / 2, h - 8, { align: 'center', font: C.mono });
    }
    function draw() {
      const N = 2 ** lgN(), cfg = { cores: cores() };
      const xs = Array.from({ length: 57 }, (_, i) => 2 ** (i / 4));
      RL.lineChart(RL.$('#gpu-plot'), [
        { data: xs.map((n) => [n, S.gpu(n)]), color: C.green, label: 'GPU' },
        { data: xs.map((n) => [n, S.cpu(n, cfg)]), color: C.terra, label: `CPU, ${cfg.cores} cores` },
      ], { logX: true, logY: true, xMin: 1, xMax: 16384, yMin: 100, yMax: 1e6, xLabel: 'parallel environments N', yLabel: 'env-steps per second',
        points: [{ x: N, y: S.gpu(N), color: C.green, r: 5 }, { x: N, y: S.cpu(N, cfg), color: C.terra, r: 5 }] });
      const g = S.gpu(N), c = S.cpu(N, cfg);
      RL.$('#gpu-g').textContent = big(g);
      RL.$('#gpu-cp').textContent = big(c);
      RL.$('#gpu-t').textContent = human(STEPS / g);
      RL.$('#gpu-tc').textContent = human(STEPS / c);
      fleet();
    }
    let last = 0;
    const loop = (ts) => { if (ts - last > 60) { phase++; fleet(); last = ts; } requestAnimationFrame(loop); };
    addEventListener('resize', draw);
    RL.onVisible(cf, () => { draw(); requestAnimationFrame(loop); });
  })();

  // ============================================================ 11 · teacher, student, blind
  (() => {
    const cc = document.getElementById('ad-c');
    if (!cc) return;
    const A = ADVC.adapt;
    const k = RL.range('ad-k', () => draw(), (v) => v.toFixed(0));
    const nz = RL.range('ad-n', () => draw(), (v) => v.toFixed(3));
    function draw() {
      const r = A.run(k(), nz()), xs = (arr) => arr.map((v, i) => [i * A.DT, v]);
      RL.lineChart(cc, [
        { data: xs(r.c), color: C.ink, label: 'true drag c', width: 2, step: true },
        { data: xs(r.est), color: C.blue, label: 'student ĉ', width: 1.5 },
      ], { xLabel: 'time (s)', yLabel: 'drag', yMin: 0, yMax: 3, xMin: 0, xMax: A.T * A.DT });
      RL.lineChart(RL.$('#ad-v'), [
        { data: xs(r.v.blind), color: C.terra, label: 'blind' },
        { data: xs(r.v.student), color: C.blue, label: 'student' },
        { data: xs(r.v.teacher), color: C.green, label: 'teacher' },
      ], { xLabel: 'time (s)', yLabel: 'speed (target 1)', yMin: 0.4, yMax: 1.6, xMin: 0, xMax: A.T * A.DT, hlines: [{ y: 1, color: C.muted }] });
      RL.$('#ad-et').textContent = r.err.teacher.toFixed(3);
      RL.$('#ad-es').textContent = r.err.student.toFixed(3);
      RL.$('#ad-eb').textContent = r.err.blind.toFixed(3);
    }
    RL.$('#ad-run').addEventListener('click', draw);
    addEventListener('resize', draw);
    RL.onVisible(cc, draw);
  })();

  // ============================================================ 12 · PD joint
  (() => {
    const cq = document.getElementById('pd-q');
    if (!cq) return;
    const P = ADVC.pd;
    const kp = RL.range('pd-kp', () => draw(), (v) => v.toFixed(0));
    const kd = RL.range('pd-kd', () => draw(), (v) => v.toFixed(2));
    const hz = RL.range('pd-hz', () => draw(), (v) => v.toFixed(0));
    const lat = RL.range('pd-lat', () => draw(), (v) => v.toFixed(0));
    const beta = RL.range('pd-b', () => draw(), (v) => v.toFixed(2));
    function draw() {
      const g = { kp: kp(), kd: kd(), hz: hz(), lat: lat(), beta: beta() }, r = P.run(g);
      RL.lineChart(cq, [
        { data: r.tr.ref, color: C.muted, dash: [5, 4], label: 'reference', width: 1.5 },
        { data: r.tr.tgt, color: C.purple, label: 'policy target', width: 1.2 },
        { data: r.tr.q, color: C.ink, label: 'joint q', width: 2 },
      ], { xLabel: 'time (s)', yLabel: 'angle (rad)', yMin: -1.1, yMax: 1.1, xMin: 0, xMax: P.DUR });
      RL.lineChart(RL.$('#pd-t'), [{ data: r.tr.tau, color: C.terra, label: 'torque τ' }],
        { xLabel: 'time (s)', yLabel: 'torque (N·m)', yMin: -14, yMax: 14, xMin: 0, xMax: P.DUR,
          hlines: [{ y: P.TMAX, color: C.red, label: 'limit' }, { y: -P.TMAX, color: C.red }] });
      const wn = Math.sqrt(g.kp / P.I), z = g.kd / (2 * Math.sqrt(g.kp * P.I));
      RL.$('#pd-wz').textContent = `${(wn / (2 * Math.PI)).toFixed(1)} Hz / ${z.toFixed(2)}`;
      RL.$('#pd-r').textContent = r.unstable ? 'unstable' : r.rmse.toFixed(3);
      RL.$('#pd-s').textContent = (100 * r.sat).toFixed(0) + '%';
      RL.$('#pd-j').textContent = r.unstable ? '—' : r.rate.toFixed(2);
    }
    addEventListener('resize', draw);
    RL.onVisible(cq, draw);
  })();

  // ============================================================ 13 · curricula
  (() => {
    const cs = document.getElementById('cu-sk');
    if (!cs) return;
    const U = ADVC.curr, MODES = [['hard', 'hardest level only', C.muted], ['uniform', 'uniform levels', C.terra], ['auto', 'terrain game', C.green]];
    let res = null, shown = 0, timer = 0;
    function draw() {
      RL.lineChart(cs, MODES.map(([m, name, color]) => ({ data: res ? res[m].sk.slice(0, shown) : [], color, label: name })),
        { xLabel: 'iteration', yLabel: 'policy skill s', yMin: 0, yMax: 10.5, xMin: 0, xMax: 300 });
      const { ctx, w, h } = RL.fit(RL.$('#cu-st'));
      const lv = res ? res.auto.hist[Math.min(res.auto.hist.length - 1, Math.floor(shown / 10))] : new Array(U.N).fill(0);
      const cnt = new Array(U.LMAX + 1).fill(0); lv.forEach((l) => cnt[l]++);
      const n = U.LMAX + 1, sw = (w - 30) / n, base = h - 30, stepH = (h - 80) / n;
      for (let l = 0; l < n; l++) {
        const x = 15 + l * sw, top = base - (l + 1) * stepH;
        ctx.fillStyle = 'rgba(35,34,32,0.08)'; ctx.fillRect(x, top, sw, base - top);
        ctx.strokeStyle = 'rgba(35,34,32,0.25)'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + sw, top); ctx.stroke();
        for (let j = 0; j < cnt[l]; j++) {
          const cx = x + 4 + (j % Math.max(1, Math.floor((sw - 8) / 5))) * 5, cy = top - 5 - Math.floor(j / Math.max(1, Math.floor((sw - 8) / 5))) * 5;
          ctx.fillStyle = C.green; ctx.fillRect(cx, cy, 3.5, 3.5);
        }
        lbl(ctx, String(l), x + sw / 2, base + 16, { align: 'center', font: C.mono });
      }
      lbl(ctx, 'terrain level (terrain-game robots)', w / 2, h - 2, { align: 'center' });
    }
    RL.$('#cu-run').addEventListener('click', () => {
      if (timer) return;
      res = Object.fromEntries(MODES.map(([m]) => [m, U.run(m)])); shown = 0;
      timer = setInterval(() => { shown = Math.min(300, shown + 6); draw(); if (shown >= 300) { clearInterval(timer); timer = 0; } }, 30);
    });
    RL.$('#cu-reset').addEventListener('click', () => { clearInterval(timer); timer = 0; res = null; shown = 0; draw(); });
    addEventListener('resize', draw);
    RL.onVisible(cs, draw);
  })();
})();

if (typeof window !== 'undefined') window.ADV_QUIZ = Object.assign(window.ADV_QUIZ || {}, {
  advC: [
    { q: 'Why does a GPU simulator lose to a CPU at very small numbers of environments?', o: ['GPUs are less accurate', 'Each batched step pays a fixed launch overhead that only pays off when many environments share it', 'CPUs have more memory', 'It doesn\'t'], a: 1, why: 'Throughput is N / (t₀ + N/R_max): with small N you are mostly paying t₀.' },
    { q: 'When a rollout stops because of a time limit, the value target should be…', o: ['r_t', 'r_t + γ V(s_{t+1})', '0', 'The episode return'], a: 1, why: 'The robot was interrupted, not terminated. Bootstrapping from 0 would teach the critic that the world ends every T steps.' },
    { q: 'In asymmetric actor-critic, which network gets privileged simulator state?', o: ['The actor', 'The critic, which is discarded at deployment', 'Both', 'Neither'], a: 1, why: 'The critic only exists during training, so it can use information the robot will never have.' },
    { q: 'An adaptation module estimates friction from a history window. Making the window much longer…', o: ['Always helps', 'Reduces noise but makes it slow to notice changes', 'Has no effect', 'Makes the estimate noisier'], a: 1, why: 'Noise vs lag: the best window depends on how noisy the sensors are and how fast the world changes.' },
    { q: 'Why do most legged policies output joint position targets rather than torques?', o: ['Torques are not measurable', 'A fast PD loop on the motor handles the stiff, high-rate part, so the network only needs to run at 50–100 Hz and learns more easily', 'Position control uses less power', 'Simulators cannot do torque control'], a: 1, why: 'The PD gains act as a learned-around spring and damper; ω_n = √(K_p/I), ζ = K_d/(2√(K_p I)).' },
    { q: 'Why does training only on the hardest terrain fail?', o: ['The robot overfits', 'Success probability is ≈ 0, so p(1 − p) ≈ 0 and there is no learning signal', 'The simulator is slower', 'The reward is too dense'], a: 1, why: 'Curricula keep tasks where outcomes are uncertain, near p = ½.' },
  ],
});
