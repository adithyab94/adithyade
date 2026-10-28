'use strict';
// Advanced A: fundamentals with a robot in the loop.

const ADV_C = {
  ink: '#232220', muted: '#6f6e66', blue: '#3e6fb0', terra: '#c4673f', green: '#2f7d5f', red: '#b8452f',
  amber: '#a8701a', purple: '#6b4fa8', line: 'rgba(35,34,32,0.12)', faint: 'rgba(35,34,32,0.05)', card: '#fbfcf8',
  font: '12px Switzer, system-ui, sans-serif', mono: '11px "Fragment Mono", ui-monospace, monospace',
};

// Gaussian sample without RL so the cores can run in node.
function advRandn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------- simulation cores
const ADVA = {
  // 4 · three Q-learners on a 9×9 room with a wall
  shaping: {
    N: 9, START: [0, 8], GOAL: [8, 0], CAP: 150,
    wall(x, y) { return x === 4 && y >= 2; },
    // walking distance to the goal around the wall (BFS), the natural potential
    D: null,
    dist(x, y) {
      if (!this.D) {
        this.D = new Array(81).fill(Infinity); this.D[8] = 0;
        const q = [[8, 0]];
        while (q.length) {
          const [cx, cy] = q.shift();
          for (let a = 0; a < 4; a++) {
            const [nx, ny] = this.move(cx, cy, a);
            if (this.D[ny * 9 + nx] === Infinity) { this.D[ny * 9 + nx] = this.D[cy * 9 + cx] + 1; q.push([nx, ny]); }
          }
        }
        this.DM = Math.max(...this.D.filter(Number.isFinite));
      }
      return this.D[y * 9 + x];
    },
    make(kind) { return { kind, Q: new Float64Array(81 * 4), steps: [] }; },
    move(x, y, a) {
      const nx = x + [0, 1, 0, -1][a], ny = y + [-1, 0, 1, 0][a];
      if (nx < 0 || ny < 0 || nx > 8 || ny > 8 || this.wall(nx, ny)) return [x, y];
      return [nx, ny];
    },
    reward(kind, x, y, nx, ny, done, b, g) {
      const DM = this.DM || (this.dist(0, 0), this.DM);
      if (kind === 'sparse') return done ? 1 : 0;
      if (kind === 'bonus') return done ? 1 : b * (1 - this.dist(nx, ny) / DM);
      const phi = (px, py, end) => (end ? 0 : Math.pow(g, this.dist(px, py)));   // Φ = γ^d, and 0 at the terminal goal
      return (done ? 1 : 0) + g * phi(nx, ny, done) - phi(x, y, false);
    },
    greedy(Q, s) {
      let best = -Infinity, idx = 0, ties = 0;
      for (let a = 0; a < 4; a++) {
        const v = Q[s * 4 + a];
        if (v > best + 1e-12) { best = v; idx = a; ties = 1; } else if (Math.abs(v - best) <= 1e-12 && Math.random() * ++ties < 1) idx = a;
      }
      return idx;
    },
    episode(ag, b, g, alpha = 0.5, eps = 0.1) {
      let [x, y] = this.START, t = 0;
      for (; t < this.CAP; t++) {
        const s = y * 9 + x;
        const a = Math.random() < eps ? Math.floor(Math.random() * 4) : this.greedy(ag.Q, s);
        const [nx, ny] = this.move(x, y, a);
        const done = nx === this.GOAL[0] && ny === this.GOAL[1];
        const r = this.reward(ag.kind, x, y, nx, ny, done, b, g);
        const s2 = ny * 9 + nx;
        let m = -Infinity;
        for (let k = 0; k < 4; k++) m = Math.max(m, ag.Q[s2 * 4 + k]);
        const target = done ? r : r + g * m;          // a timeout is not terminal: keep bootstrapping
        ag.Q[s * 4 + a] += alpha * (target - ag.Q[s * 4 + a]);
        x = nx; y = ny;
        if (done) { ag.steps.push(t + 1); return; }
      }
      ag.steps.push(this.CAP);
    },
    path(ag, max = 60) {
      let [x, y] = this.START;
      const p = [[x, y]], seen = new Set();
      for (let t = 0; t < max; t++) {
        const s = y * 9 + x;
        let best = -Infinity, a = 0;
        for (let k = 0; k < 4; k++) if (ag.Q[s * 4 + k] > best) { best = ag.Q[s * 4 + k]; a = k; }
        const key = s * 4 + a;
        if (seen.has(key)) return { p, loop: true };
        seen.add(key);
        [x, y] = this.move(x, y, a);
        p.push([x, y]);
        if (x === this.GOAL[0] && y === this.GOAL[1]) return { p, loop: false, done: true };
      }
      return { p, loop: true };
    },
  },

  // 5 · PD joint with mass and sensing delay
  s2r: {
    EFFW: 0.00005, DT: 0.01, T: 200, B: 0.5, UMAX: 20,
    KP: Array.from({ length: 14 }, (_, i) => 2 * Math.pow(200, i / 13)),      // 2 … 400
    KD: Array.from({ length: 14 }, (_, i) => 0.2 * Math.pow(200, i / 13)),    // 0.2 … 40
    MASS: [0.3, 3], DELAY: [0, 10],                                            // kg, steps of 10 ms
    run(kp, kd, m, d, trace) {
      const { DT, T, B, UMAX } = this;
      let q = 0, v = 0, cost = 0, eff = 0, maxq = 0, tail = 0;
      const hq = new Array(d + 1).fill(0), hv = new Array(d + 1).fill(0);
      for (let t = 0; t < T; t++) {
        hq.push(q); hv.push(v);
        const qd = hq.shift(), vd = hv.shift();
        let u = kp * (1 - qd) - kd * vd;
        u = Math.max(-UMAX, Math.min(UMAX, u));
        v += DT * (u - B * v) / m;
        q += DT * v;
        if (trace) trace.push(q);
        if (!Number.isFinite(q) || Math.abs(q) > 3) return { cost: 6, fail: true, err: 9, os: 9 };
        cost += (q - 1) * (q - 1); eff += u * u; maxq = Math.max(maxq, q);
        if (t >= T - 50) tail += Math.abs(q - 1);
      }
      return { cost: cost / T + this.EFFW * eff / T, fail: false, err: tail / 50, os: maxq - 1 };
    },
    grade(r) { return r.fail || r.err > 0.15 ? 0 : r.err < 0.03 && r.os < 0.2 ? 2 : 1; },
    box(nom, w) {
      const k = Math.exp(1.2 * w);
      return {
        m0: Math.max(this.MASS[0], nom.m / k), m1: Math.min(this.MASS[1], nom.m * k),
        d0: Math.max(0, nom.d - 8 * w), d1: Math.min(this.DELAY[1], nom.d + 8 * w),
      };
    },
    train(nom, w) {
      const bx = this.box(nom, w), S = w > 0 ? 4 : 1, pts = [];
      for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
        const fi = S === 1 ? 0.5 : i / (S - 1), fj = S === 1 ? 0.5 : j / (S - 1);
        pts.push([bx.m0 * Math.pow(bx.m1 / bx.m0, fi), Math.round(bx.d0 + (bx.d1 - bx.d0) * fj)]);
      }
      let best = { c: Infinity };
      for (const kp of this.KP) for (const kd of this.KD) {
        let c = 0;
        for (const [m, d] of pts) c += this.run(kp, kd, m, d).cost;
        if (c < best.c) best = { c, kp, kd };
      }
      return best;
    },
  },

  // 6 · lane keeping: expert, lookup-table clone, DAgger
  bc: {
    S: 80, DS: 0.1, NB: 12, YR: 1, PR: 0.6,
    kappa(s) { return 0.18 * Math.sin(2 * Math.PI * s / 25) + 0.1 * Math.sin(2 * Math.PI * s / 9 + 1); },
    expert(y, p, s) { return this.kappa(s) - 1.2 * y - 2.0 * p; },
    cell(y, p) {
      const i = Math.max(0, Math.min(this.NB - 1, Math.floor((y + this.YR) / (2 * this.YR) * this.NB)));
      const j = Math.max(0, Math.min(this.NB - 1, Math.floor((p + this.PR) / (2 * this.PR) * this.NB)));
      return j * this.NB + i;
    },
    table() { return { sum: new Float64Array(this.NB * this.NB), n: new Uint32Array(this.NB * this.NB), size: 0 }; },
    add(tab, y, p, s) { const c = this.cell(y, p); tab.sum[c] += this.expert(y, p, s) - this.kappa(s); tab.n[c]++; tab.size++; },
    clone(tab, y, p, s) { const c = this.cell(y, p); return this.kappa(s) + (tab.n[c] ? tab.sum[c] / tab.n[c] : 0); },
    // policy(y, p, s) -> steering; inject: noise added to the executed action only
    rollout(policy, noise, inject = 0, label) {
      let y = 0, p = 0;
      const tr = [];
      const n = Math.round(this.S / this.DS);
      for (let k = 0; k < n; k++) {
        const s = k * this.DS;
        if (label) label(y, p, s);
        const u = policy(y, p, s) + inject * advRandn();
        p += (u - this.kappa(s)) * this.DS + noise * Math.sqrt(this.DS) * advRandn();
        y += Math.sin(p) * this.DS;
        tr.push([s, y, p]);
        if (Math.abs(y) > 1) return { tr, crash: true, dist: s };
      }
      return { tr, crash: false, dist: this.S };
    },
  },
};

if (typeof module !== 'undefined') { module.exports = ADVA; }

// ---------------------------------------------------------------- widgets
if (typeof document !== 'undefined') (() => {
  const C = ADV_C;
  const lbl = (ctx, txt, x, y, o = {}) => {
    ctx.font = o.font || C.font; ctx.fillStyle = o.color || C.muted;
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
    ctx.fillText(txt, x, y);
  };

  // ============================================================ 1 · advantage meter
  (() => {
    const cv = document.getElementById('adv-canvas');
    if (!cv) return;
    const NAMES = ['wait', 'grasp', 'push', 'lift', 'nudge'];
    const Q0 = [2.0, 3.2, 0.5, 2.6, 1.2];
    let Q = Q0.slice();
    const YMIN = -3, YMAX = 9;
    let geo = null, drag = -1;
    const tau = RL.range('adv-tau', draw, (v) => v.toFixed(2));

    function policy() {
      const t = tau(), m = Math.max(...Q);
      const e = Q.map((q) => Math.exp((q - m) / t)), z = e.reduce((a, b) => a + b, 0);
      return e.map((x) => x / z);
    }
    function draw() {
      const { ctx, w, h } = RL.fit(cv);
      const pad = { l: 40, r: 12, t: 18, b: 58 };
      const sy = (v) => pad.t + (YMAX - v) / (YMAX - YMIN) * (h - pad.t - pad.b);
      const colW = (w - pad.l - pad.r) / Q.length;
      geo = { pad, colW, h, toV: (py) => YMAX - (py - pad.t) / (h - pad.t - pad.b) * (YMAX - YMIN) };
      ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      for (let v = YMIN; v <= YMAX; v += 3) {
        ctx.beginPath(); ctx.moveTo(pad.l, sy(v)); ctx.lineTo(w - pad.r, sy(v)); ctx.stroke();
        lbl(ctx, String(v), pad.l - 8, sy(v), { align: 'right', base: 'middle' });
      }
      const pi = policy();
      const V = pi.reduce((s, p, i) => s + p * Q[i], 0);
      Q.forEach((q, i) => {
        const x0 = pad.l + i * colW + colW * 0.22, bw = colW * 0.56;
        ctx.fillStyle = 'rgba(62,111,176,0.22)';
        ctx.fillRect(x0, Math.min(sy(q), sy(0)), bw, Math.abs(sy(q) - sy(0)));
        ctx.fillStyle = C.blue; ctx.fillRect(x0, sy(q) - 2, bw, 4);
        lbl(ctx, 'Q ' + q.toFixed(1), x0 + bw / 2, sy(q) - 8, { align: 'center', color: C.blue });
        const A = q - V, cx = x0 + bw / 2;
        if (Math.abs(A) > 0.05) RL.arrow(ctx, cx, sy(V), 0, Math.sign(-A), Math.abs(sy(q) - sy(V)) - 4, A > 0 ? C.green : C.red, 2);
        lbl(ctx, (A >= 0 ? 'A +' : 'A −') + Math.abs(A).toFixed(2), cx, h - pad.b + 34, { align: 'center', color: A >= 0 ? C.green : C.red, font: C.mono });
        lbl(ctx, NAMES[i], cx, h - pad.b + 16, { align: 'center', color: C.ink });
        ctx.fillStyle = 'rgba(35,34,32,0.14)'; ctx.fillRect(x0, h - 12, bw, 6);
        ctx.fillStyle = C.ink; ctx.fillRect(x0, h - 12, bw * pi[i], 6);
        lbl(ctx, 'π ' + pi[i].toFixed(2), x0 + bw + 4, h - 7, { font: C.mono, base: 'middle' });
      });
      ctx.strokeStyle = C.ink; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(pad.l, sy(V)); ctx.lineTo(w - pad.r, sy(V)); ctx.stroke(); ctx.setLineDash([]);
      lbl(ctx, 'V', w - pad.r - 4, sy(V) - 5, { align: 'right', color: C.ink });
      const sumA = pi.reduce((s, p, i) => s + p * (Q[i] - V), 0);
      RL.$('#adv-v').textContent = V.toFixed(2);
      RL.$('#adv-max').textContent = Math.max(...Q).toFixed(2);
      RL.$('#adv-sum').textContent = Math.abs(sumA) < 5e-4 ? '0.000' : sumA.toFixed(3);
    }
    const pick = (e) => {
      const r = cv.getBoundingClientRect();
      return { i: Math.floor((e.clientX - r.left - geo.pad.l) / geo.colW), v: geo.toV(e.clientY - r.top) };
    };
    cv.addEventListener('pointerdown', (e) => {
      const { i, v } = pick(e);
      if (i < 0 || i >= Q.length) return;
      drag = i; cv.setPointerCapture(e.pointerId);
      Q[i] = RL.clamp(Math.round(v * 10) / 10, YMIN, YMAX); draw();
    });
    cv.addEventListener('pointermove', (e) => { if (drag < 0) return; Q[drag] = RL.clamp(Math.round(pick(e).v * 10) / 10, YMIN, YMAX); draw(); });
    const stop = () => { drag = -1; };
    cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
    const shift = (d) => { if (Math.max(...Q) + d > YMAX || Math.min(...Q) + d < YMIN) return; Q = Q.map((q) => q + d); draw(); };
    RL.$('#adv-shift').addEventListener('click', () => shift(1));
    RL.$('#adv-shiftdown').addEventListener('click', () => shift(-1));
    RL.$('#adv-reset').addEventListener('click', () => { Q = Q0.slice(); draw(); });
    addEventListener('resize', draw);
    RL.onVisible(cv, draw);
  })();

  // ============================================================ 2 · importance sampling
  (() => {
    const cv = document.getElementById('is-canvas');
    if (!cv) return;
    const N = 300, C0 = 1.5, W = 0.5;
    let A = [];
    const resample = () => { A = Array.from({ length: N }, advRandn); draw(); };
    const pdf = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
    const f = (a) => Math.exp(-0.5 * ((a - C0) / W) ** 2);
    const mu = RL.range('is-mu', () => draw(), (v) => v.toFixed(2));
    const sig = RL.range('is-sig', () => draw(), (v) => v.toFixed(2));
    const eps = RL.range('is-eps', () => draw(), (v) => v.toFixed(2));

    function draw() {
      const { ctx, w, h } = RL.fit(cv);
      const m = mu(), s = sig(), e = eps();
      const pad = { l: 14, r: 14, t: 14 }, top = h * 0.58, base = h - 22;
      const X0 = -4, X1 = 4, sx = (x) => pad.l + (x - X0) / (X1 - X0) * (w - pad.l - pad.r);
      const ymax = Math.max(0.45, 1 / (s * Math.sqrt(2 * Math.PI))) * 1.08;
      const sy = (y) => top - y / ymax * (top - pad.t);
      // band where the ratio is inside the clip
      ctx.fillStyle = 'rgba(47,125,95,0.10)';
      for (let px = pad.l; px < w - pad.r; px++) {
        const x = X0 + (px - pad.l) / (w - pad.l - pad.r) * (X1 - X0);
        const r = pdf(x, m, s) / pdf(x, 0, 1);
        if (r >= 1 - e && r <= 1 + e) ctx.fillRect(px, pad.t, 1, base - pad.t);
      }
      const curve = (g, color, fill, dash) => {
        ctx.beginPath();
        for (let px = 0; px <= 200; px++) { const x = X0 + px / 200 * (X1 - X0); const y = g(x); px ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y)); }
        if (fill) { ctx.lineTo(sx(X1), sy(0)); ctx.lineTo(sx(X0), sy(0)); ctx.fillStyle = fill; ctx.fill(); }
        else { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]); }
      };
      curve((x) => pdf(x, 0, 1), null, 'rgba(35,34,32,0.12)');
      curve((x) => f(x) * 0.4, C.amber, null, [3, 3]);
      curve((x) => pdf(x, m, s), C.blue);
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(pad.l, top); ctx.lineTo(w - pad.r, top); ctx.moveTo(pad.l, base); ctx.lineTo(w - pad.r, base); ctx.stroke();
      // samples with their weights
      const r = A.map((a) => pdf(a, m, s) / pdf(a, 0, 1));
      const rmax = Math.max(1, ...r);
      let inside = 0;
      A.forEach((a, i) => {
        const ok = r[i] >= 1 - e && r[i] <= 1 + e; if (ok) inside++;
        const hh = 3 + (base - top - 10) * r[i] / rmax;
        ctx.strokeStyle = ok ? C.green : r[i] > 1 + e ? C.terra : 'rgba(35,34,32,0.35)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(sx(a), base); ctx.lineTo(sx(a), base - hh); ctx.stroke();
      });
      lbl(ctx, 'π_old', sx(-1.6), sy(pdf(-1.6, 0, 1)) - 6, { align: 'right' });
      lbl(ctx, 'π_new', sx(m + s * 0.9), sy(pdf(m + s * 0.9, m, s)) - 6, { color: C.blue });
      lbl(ctx, 'reward', sx(C0 + 0.6), sy(0.4 * f(C0 + 0.6)) - 4, { color: C.amber });
      lbl(ctx, 'weight r = π_new / π_old  (max ' + rmax.toFixed(1) + ')', pad.l, top + 14, { font: C.mono });
      [-4, -2, 0, 2, 4].forEach((x) => lbl(ctx, String(x), sx(x), h - 6, { align: 'center', font: C.mono }));
      const sw = r.reduce((a, b) => a + b, 0), sw2 = r.reduce((a, b) => a + b * b, 0);
      const est = A.reduce((acc, a, i) => acc + r[i] * f(a), 0) / N;
      const tru = W / Math.sqrt(s * s + W * W) * Math.exp(-((m - C0) ** 2) / (2 * (s * s + W * W)));
      RL.$('#is-ess').textContent = (100 * sw * sw / sw2 / N).toFixed(0) + '%';
      RL.$('#is-true').textContent = tru.toFixed(3);
      RL.$('#is-est').textContent = est.toFixed(3);
      RL.$('#is-in').textContent = (100 * inside / N).toFixed(0) + '%';
    }
    RL.$('#is-resample').addEventListener('click', resample);
    addEventListener('resize', draw);
    A = Array.from({ length: N }, advRandn);
    RL.onVisible(cv, draw);
  })();

  // ============================================================ 3 · exploration noise
  (() => {
    const cv = document.getElementById('ex-canvas');
    if (!cv) return;
    const T = 600, K = 0.03, G = 20;
    const KINDS = [['white Gaussian', C.terra], ['Ornstein–Uhlenbeck', C.blue], ['smoothed (EMA)', C.green]];
    let st, raf = 0;
    const sig = RL.range('ex-sig', () => { if (!raf) reset(); }, (v) => v.toFixed(2));
    const rho = RL.range('ex-corr', () => { if (!raf) reset(); }, (v) => v.toFixed(2));
    function reset() {
      cancelAnimationFrame(raf); raf = 0;
      st = KINDS.map(() => ({ p: [0, 0], a: [0, 0], trail: [[0, 0]], cells: new Set([G * G / 2 + G / 2]), rate: 0, t: 0 }));
      draw();
    }
    function step() {
      const s = sig(), r = rho();
      st.forEach((o, k) => {
        const xi = [advRandn(), advRandn()];
        const prev = o.a.slice();
        if (k === 0) o.a = [s * xi[0], s * xi[1]];
        else if (k === 1) o.a = o.a.map((v, i) => r * v + Math.sqrt(1 - r * r) * s * xi[i]);
        else o.a = o.a.map((v, i) => r * v + (1 - r) * s * xi[i]);
        o.rate += (o.a[0] - prev[0]) ** 2 + (o.a[1] - prev[1]) ** 2;
        o.p = o.p.map((v, i) => RL.clamp(v + K * o.a[i], -1, 1));
        o.trail.push(o.p.slice()); o.t++;
        o.cells.add(Math.min(G - 1, Math.floor((o.p[1] + 1) / 2 * G)) * G + Math.min(G - 1, Math.floor((o.p[0] + 1) / 2 * G)));
      });
    }
    function draw() {
      const narrow = cv.clientWidth < 560;
      cv.dataset.h = narrow ? Math.round(cv.clientWidth / 3 + 62) : 300;
      const { ctx, w, h } = RL.fit(cv);
      const pw = w / 3, side = Math.min(pw - (narrow ? 10 : 24), h - 70);
      const names = narrow ? ['white', 'OU', 'smoothed'] : KINDS.map((k) => k[0]);
      st.forEach((o, k) => {
        const cx = pw * k + pw / 2, x0 = cx - side / 2, y0 = 26;
        const px = (v) => x0 + (v[0] + 1) / 2 * side, py = (v) => y0 + (1 - (v[1] + 1) / 2) * side;
        ctx.fillStyle = C.faint; ctx.fillRect(x0, y0, side, side);
        ctx.fillStyle = 'rgba(35,34,32,0.07)';
        o.cells.forEach((c) => ctx.fillRect(x0 + (c % G) / G * side, y0 + (G - 1 - Math.floor(c / G)) / G * side, side / G, side / G));
        ctx.strokeStyle = C.line; ctx.strokeRect(x0, y0, side, side);
        ctx.strokeStyle = KINDS[k][1]; ctx.lineWidth = 1.2; ctx.beginPath();
        o.trail.forEach((v, i) => (i ? ctx.lineTo(px(v), py(v)) : ctx.moveTo(px(v), py(v)))); ctx.stroke();
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(px(o.p), py(o.p), 4.5, 0, 7); ctx.fill();
        lbl(ctx, names[k], cx, 16, { align: 'center', color: KINDS[k][1] });
        lbl(ctx, (narrow ? 'cov ' : 'covered ') + (100 * o.cells.size / (G * G)).toFixed(0) + '%', cx, y0 + side + 18, { align: 'center', font: C.mono, color: C.ink });
        lbl(ctx, (narrow ? 'rate ' : 'action rate ') + (o.t ? o.rate / o.t : 0).toFixed(2), cx, y0 + side + 34, { align: 'center', font: C.mono });
      });
    }
    function loop() {
      for (let i = 0; i < 6; i++) step();
      draw();
      raf = st[0].t < T ? requestAnimationFrame(loop) : 0;
    }
    RL.$('#ex-run').addEventListener('click', () => { reset(); raf = requestAnimationFrame(loop); });
    RL.$('#ex-reset').addEventListener('click', reset);
    addEventListener('resize', draw);
    reset();
  })();

  // ============================================================ 4 · reward shaping
  (() => {
    const cv = document.getElementById('rs-curve'), cm = document.getElementById('rs-maps');
    if (!cv) return;
    const S = ADVA.shaping;
    const KINDS = [['sparse', 'sparse', C.muted], ['bonus', 'closeness bonus', C.terra], ['potential', 'potential-based', C.green]];
    let ags, busy = false;
    const b = RL.range('rs-b', null, (v) => v.toFixed(2));
    const g = RL.range('rs-g', null, (v) => v.toFixed(2));
    const reset = () => { ags = KINDS.map(([k]) => S.make(k)); draw(); };
    function draw() {
      RL.lineChart(cv, ags.map((a, i) => ({ data: RL.smooth(a.steps, 10), x0: 1, color: KINDS[i][2], label: KINDS[i][1] })),
        { xLabel: 'episode', yLabel: 'steps to goal (150 = never)', yMin: 0, yMax: 150, xMin: 1, xMax: Math.max(10, ags[0].steps.length) });
      const { ctx, w, h } = RL.fit(cm);
      const pw = w / 3, cell = Math.min((pw - 14) / 9, (h - 40) / 9);
      ags.forEach((ag, k) => {
        const x0 = pw * k + (pw - cell * 9) / 2, y0 = 22;
        for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
          ctx.fillStyle = S.wall(x, y) ? 'rgba(35,34,32,0.55)' : (x + y) % 2 ? 'rgba(35,34,32,0.04)' : 'rgba(35,34,32,0.08)';
          ctx.fillRect(x0 + x * cell, y0 + y * cell, cell, cell);
        }
        ctx.fillStyle = C.amber; ctx.fillRect(x0 + 8 * cell + 2, y0 + 2, cell - 4, cell - 4);
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(x0 + cell / 2, y0 + 8.5 * cell, cell * 0.25, 0, 7); ctx.fill();
        lbl(ctx, KINDS[k][1], x0 + cell * 4.5, 14, { align: 'center', color: KINDS[k][2] });
        if (!ag.steps.length) return;
        const { p, loop, done } = S.path(ag);
        ctx.strokeStyle = KINDS[k][2]; ctx.lineWidth = 2.5; ctx.beginPath();
        p.forEach(([x, y], i) => { const X = x0 + (x + 0.5) * cell, Y = y0 + (y + 0.5) * cell; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
        ctx.stroke();
        lbl(ctx, done ? `goal in ${p.length - 1}` : loop ? 'camps ↻' : 'wanders', x0 + cell * 4.5, y0 + 9 * cell + 15,
          { align: 'center', font: C.mono, color: done ? C.ink : C.red });
      });
    }
    RL.$('#rs-run').addEventListener('click', () => {
      if (busy) return; busy = true;
      RL.chunked(300, 10, () => ags.forEach((a) => S.episode(a, b(), g())), () => draw(), () => { busy = false; draw(); });
    });
    RL.$('#rs-reset').addEventListener('click', () => { if (!busy) reset(); });
    addEventListener('resize', draw);
    reset();
  })();

  // ============================================================ 5 · sim-to-real
  (() => {
    const cmap = document.getElementById('s2r-map'), cstep = document.getElementById('s2r-step');
    if (!cmap) return;
    const S = ADVA.s2r, NM = 16, ND = 11;
    let nom = { m: 0.8, d: 0 }, real = { m: 1.8, d: 6 }, pol = null, revealed = false, grid = null, lastW = 0, realTr = null;
    const width = RL.range('s2r-w', null, (v) => v.toFixed(2));
    const mAt = (i) => S.MASS[0] * Math.pow(S.MASS[1] / S.MASS[0], i / (NM - 1));
    const log = (html) => { RL.$('#s2r-log').innerHTML = html; };

    function train() {
      lastW = width();
      pol = S.train(nom, lastW);
      grid = [];
      for (let j = 0; j < ND; j++) for (let i = 0; i < NM; i++) grid.push(S.grade(S.run(pol.kp, pol.kd, mAt(i), j)));
      const ok = grid.filter((g) => g === 2).length;
      log(`Trained on ${lastW ? 'a randomised box' : 'the nominal simulator only'} → <span class="hl">Kp = ${pol.kp.toFixed(1)}, Kd = ${pol.kd.toFixed(2)}</span>. Settles cleanly on ${Math.round(100 * ok / grid.length)}% of all possible robots.`);
      draw();
    }
    function draw() {
      // map
      let { ctx, w, h } = RL.fit(cmap);
      const pad = { l: 62, r: 10, t: 12, b: 34 }, cw = (w - pad.l - pad.r) / NM, ch = (h - pad.t - pad.b) / ND;
      const col = ['rgba(184,69,47,0.55)', 'rgba(168,112,26,0.4)', 'rgba(47,125,95,0.5)'];
      const lx = (m) => pad.l + Math.log(m / S.MASS[0]) / Math.log(S.MASS[1] / S.MASS[0]) * (NM - 1) * cw + cw / 2;
      const ly = (d) => pad.t + (ND - 1 - d) * ch + ch / 2;
      for (let j = 0; j < ND; j++) for (let i = 0; i < NM; i++) {
        ctx.fillStyle = grid ? col[grid[j * NM + i]] : C.faint;
        ctx.fillRect(pad.l + i * cw + 1, pad.t + (ND - 1 - j) * ch + 1, cw - 2, ch - 2);
      }
      [0.3, 1, 3].forEach((m) => lbl(ctx, m + ' kg', lx(m), h - pad.b + 14, { align: 'center', font: C.mono }));
      lbl(ctx, 'joint mass', (pad.l + w) / 2, h - 4, { align: 'center' });
      [0, 50, 100].forEach((d) => lbl(ctx, d + 'ms', pad.l - 6, ly(d / 10), { align: 'right', base: 'middle', font: C.mono }));
      ctx.save(); ctx.translate(9, (pad.t + h - pad.b) / 2); ctx.rotate(-Math.PI / 2); lbl(ctx, 'sensing delay', 0, 0, { align: 'center', base: 'middle' }); ctx.restore();
      const bx = S.box(nom, lastW);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
      ctx.strokeRect(lx(bx.m0) - cw / 2, ly(bx.d1) - ch / 2, lx(bx.m1) - lx(bx.m0) + cw, ly(bx.d0) - ly(bx.d1) + ch); ctx.setLineDash([]);
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(lx(nom.m), ly(nom.d), 4, 0, 7); ctx.fill();
      lbl(ctx, 'sim', lx(nom.m) + 7, ly(nom.d) - 6, { color: C.ink, font: C.mono });
      if (revealed) {
        ctx.fillStyle = C.purple; ctx.font = '18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('★', lx(real.m), ly(real.d)); lbl(ctx, 'real', lx(real.m) + 9, ly(real.d) + 12, { color: C.purple, font: C.mono });
      }
      // step response
      const simT = [], realT = (revealed && realTr) || [];
      if (pol) S.run(pol.kp, pol.kd, nom.m, nom.d, simT);
      const ser = [{ data: simT.map((q, t) => [t * 10, q]), color: C.ink, label: 'in sim', width: 2 }];
      if (realT.length) ser.push({ data: realT.map((q, t) => [t * 10, q]), color: C.purple, label: 'on the real robot', width: 2 });
      RL.lineChart(cstep, ser, { xLabel: 'time (ms)', yLabel: 'joint angle (target 1)', yMin: -0.5, yMax: 2.5, xMin: 0, xMax: 2000, hlines: [{ y: 1, color: C.muted }] });
    }
    RL.$('#s2r-train').addEventListener('click', () => { revealed = false; train(); });
    RL.$('#s2r-deploy').addEventListener('click', () => {
      if (!pol) train();
      const tr = [], r = S.run(pol.kp, pol.kd, real.m, real.d, tr), gr = S.grade(r);
      revealed = true; realTr = tr;
      const verdict = gr === 2 ? '<span class="g">it works</span>. The real robot was inside what training covered.'
        : gr === 1 ? '<span class="hl">it gets there, sloppily</span>: slow, or it never quite settles.'
          : '<span class="r">it shakes itself apart</span>. The gains that were perfect in sim are unstable with this much mass and delay.';
      log(`Real robot: mass ${real.m.toFixed(2)} kg, delay ${real.d * 10} ms. Result: ${verdict}`);
      draw();
    });
    RL.$('#s2r-sysid').addEventListener('click', () => {
      const est = { m: RL.clamp(real.m * (1 + 0.12 * advRandn()), S.MASS[0], S.MASS[1]), d: RL.clamp(real.d + Math.round(advRandn()), 0, 10) };
      log(`System ID on a logged step response: the sim's mass ${nom.m.toFixed(2)} → <span class="c">${est.m.toFixed(2)} kg</span>, delay ${nom.d * 10} → <span class="c">${est.d * 10} ms</span>. Not exact, so keep a little randomisation, then train again.`);
      nom = est; revealed = false; draw();
    });
    RL.$('#s2r-new').addEventListener('click', () => {
      real = { m: Math.exp(Math.log(0.5) + Math.random() * Math.log(5.4)), d: 2 + Math.floor(Math.random() * 8) };
      nom = { m: 0.8, d: 0 }; revealed = false; pol = null; grid = null;
      log('A new robot arrived, with unknown mass and delay. The simulator is back to its default guess.');
      draw();
    });
    addEventListener('resize', () => draw());
    RL.onVisible(cmap, () => { if (!pol) train(); });
  })();

  // ============================================================ 6 · BC and DAgger
  (() => {
    const croad = document.getElementById('bc-road'), ccov = document.getElementById('bc-cover');
    if (!croad) return;
    const B = ADVA.bc, NOISE = 0.12, INJECT = 0.5;
    let tab, demos, laps, iters;
    // road centre line
    const n = Math.round(B.S / B.DS), cl = [[0, 0, 0]];
    for (let k = 1; k <= n; k++) {
      const [x, y, th] = cl[k - 1];
      const t2 = th + B.kappa((k - 1) * B.DS) * B.DS;
      cl.push([x + Math.cos(t2) * B.DS, y + Math.sin(t2) * B.DS, t2]);
    }
    const world = (s, off) => {
      const k = Math.min(n, Math.max(0, Math.round(s / B.DS))), [x, y, th] = cl[k];
      return [x - Math.sin(th) * off, y + Math.cos(th) * off];
    };
    const reset = () => { tab = B.table(); demos = []; laps = []; iters = 0; stats(); draw(); };
    function stats() {
      RL.$('#bc-n').textContent = tab.size;
      RL.$('#bc-it').textContent = iters;
      RL.$('#bc-ok').textContent = laps.length ? laps.filter((l) => !l.crash).length : '—';
      RL.$('#bc-dist').textContent = laps.length ? (laps.reduce((s, l) => s + l.dist, 0) / laps.length / B.S * 100).toFixed(0) + '% of lap' : '—';
    }
    function draw() {
      let { ctx, w, h } = RL.fit(croad);
      const xs = cl.map((p) => p[0]), ys = cl.map((p) => p[1]);
      const mx = [Math.min(...xs) - 2, Math.max(...xs) + 2], my = [Math.min(...ys) - 2, Math.max(...ys) + 2];
      const sc = Math.min((w - 16) / (mx[1] - mx[0]), (h - 16) / (my[1] - my[0]));
      const ox = (w - sc * (mx[1] - mx[0])) / 2, oy = (h - sc * (my[1] - my[0])) / 2;
      const P = ([x, y]) => [ox + (x - mx[0]) * sc, h - oy - (y - my[0]) * sc];
      const path = (pts, color, lw, dash) => {
        ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash || []); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
        pts.forEach((p, i) => { const [X, Y] = P(p); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke(); ctx.setLineDash([]);
      };
      path(cl, 'rgba(35,34,32,0.16)', 2 * sc);
      path(cl, 'rgba(35,34,32,0.35)', 1, [4, 6]);
      demos.forEach((d) => path(d.tr.map(([s, y]) => world(s, y)), 'rgba(35,34,32,0.45)', 1.2));
      laps.forEach((l) => {
        path(l.tr.map(([s, y]) => world(s, y)), l.crash ? C.red : C.green, 1.6);
        if (l.crash) { const [X, Y] = P(world(l.dist, l.tr[l.tr.length - 1][1])); lbl(ctx, '✕', X, Y, { align: 'center', base: 'middle', color: C.red, font: '14px system-ui' }); }
      });
      const [sx0, sy0] = P(cl[0]); lbl(ctx, 'start', sx0, sy0 - 12, { align: 'center', font: C.mono });
      // coverage table
      ({ ctx, w, h } = RL.fit(ccov));
      const pad = { l: 40, r: 10, t: 10, b: 34 }, side = Math.min(w - pad.l - pad.r, h - pad.t - pad.b), cs = side / B.NB;
      const x0 = pad.l + (w - pad.l - pad.r - side) / 2;
      for (let j = 0; j < B.NB; j++) for (let i = 0; i < B.NB; i++) {
        const c = j * B.NB + i;
        ctx.fillStyle = tab.n[c] ? `rgba(62,111,176,${(0.25 + 0.5 * Math.min(1, Math.log10(1 + tab.n[c]) / 3)).toFixed(2)})` : 'rgba(35,34,32,0.04)';
        ctx.fillRect(x0 + i * cs + 0.5, pad.t + (B.NB - 1 - j) * cs + 0.5, cs - 1, cs - 1);
      }
      ctx.strokeStyle = C.line; ctx.strokeRect(x0, pad.t, side, side);
      ctx.fillStyle = 'rgba(35,34,32,0.5)';
      laps.forEach((l) => l.tr.forEach(([, y, p], k) => {
        if (k % 4) return;
        const X = x0 + (RL.clamp(y, -1, 1) + 1) / 2 * side, Y = pad.t + (1 - (RL.clamp(p, -0.6, 0.6) + 0.6) / 1.2) * side;
        ctx.fillRect(X - 1, Y - 1, 2, 2);
      }));
      lbl(ctx, 'lateral offset y  (−1 … +1, edges = off the road)', x0 + side / 2, pad.t + side + 22, { align: 'center' });
      ctx.save(); ctx.translate(14, pad.t + side / 2); ctx.rotate(-Math.PI / 2); lbl(ctx, 'heading error ψ', 0, 0, { align: 'center', base: 'middle' }); ctx.restore();
    }
    const evaluate = () => { laps = Array.from({ length: 10 }, () => B.rollout((y, p, s) => B.clone(tab, y, p, s), NOISE)); };
    RL.$('#bc-demo').addEventListener('click', () => {
      const inj = RL.$('#bc-noise').checked ? INJECT : 0;
      for (let i = 0; i < 3; i++) demos.push(B.rollout((y, p, s) => B.expert(y, p, s), NOISE * 0.4, inj, (y, p, s) => B.add(tab, y, p, s)));
      laps = []; stats(); draw();
    });
    RL.$('#bc-drive').addEventListener('click', () => { if (!tab.size) RL.$('#bc-demo').click(); evaluate(); stats(); draw(); });
    RL.$('#bc-dagger').addEventListener('click', () => {
      if (!tab.size) RL.$('#bc-demo').click();
      for (let i = 0; i < 5; i++) B.rollout((y, p, s) => B.clone(tab, y, p, s), NOISE, 0, (y, p, s) => B.add(tab, y, p, s));
      iters++; evaluate(); stats(); draw();
    });
    RL.$('#bc-reset').addEventListener('click', reset);
    addEventListener('resize', draw);
    reset();
  })();
})();

if (typeof window !== "undefined") window.ADV_QUIZ = Object.assign(window.ADV_QUIZ || {}, {
  advA: [
    { q: 'Why does model-free control learn Q rather than V?', o: ['Q is smaller to store', 'Acting greedily from V needs the dynamics p(s′|s,a) for a one-step lookahead; argmax over Q does not', 'V cannot be learned with TD', 'Q has lower variance'], a: 1, why: 'argmaxₐ Q(s,a) picks an action directly. With V you must predict where each action leads.' },
    { q: 'Under the policy π, the expected advantage Σₐ π(a|s) A^π(s,a) equals…', o: ['V^π(s)', '1', '0', 'max_a Q^π(s,a) − V^π(s)'], a: 2, why: 'Σ π Q = V, so Σ π (Q − V) = V − V = 0. That zero mean is what makes it a good baseline-corrected signal.' },
    { q: 'PPO clips the ratio π_θ/π_old to [1−ε, 1+ε] because…', o: ['It makes the policy deterministic', 'Importance-weighted estimates are only reliable while the new policy stays close to the one that collected the data', 'It speeds up the simulator', 'It removes the need for a critic'], a: 1, why: 'As the policies diverge, a few samples get huge weights and the effective sample size collapses.' },
    { q: 'Potential-based shaping F = γΦ(s′) − Φ(s) cannot change the optimal policy because…', o: ['Φ must be small', 'The shaping terms telescope, shifting every return from a state by the same constant', 'It is only applied at the goal', 'γ < 1'], a: 1, why: 'Σ γᵗ F_t = γᵀΦ(s_T) − Φ(s₀), so Q′(s,a) = Q(s,a) − Φ(s) and the argmax is unchanged.' },
    { q: 'Behaviour cloning compounds errors because…', o: ['The network is too small', 'It is trained on the expert\'s state distribution but tested on its own, which drifts after each small mistake', 'The expert is noisy', 'It uses a discount factor'], a: 1, why: 'Off-distribution states have bigger errors, which push it further off. DAgger labels the states the learner actually visits.' },
    { q: 'The usual division of labour between system identification and domain randomisation is…', o: ['Use one or the other, never both', 'System ID narrows the sim-to-real gap; randomisation covers what remains', 'Randomisation first, then ID', 'ID is only for latency'], a: 1, why: 'Fit what you can measure, randomise what you can\'t, with latency high on both lists.' },
  ],
});
