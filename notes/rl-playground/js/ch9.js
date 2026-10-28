'use strict';

// ================= 1000-state random walk with linear function approximation =================
(() => {
  const cv = RL.$('#fa-plot');
  if (!cv) return;
  const NS = 1000, JUMP = 100;
  let trueV = null;

  function computeTrue() {
    let v = new Float64Array(NS + 2);
    for (let it = 0; it < 200000; it++) {
      const pre = new Float64Array(NS + 1);
      for (let s = 1; s <= NS; s++) pre[s] = pre[s - 1] + v[s];
      const nv = new Float64Array(NS + 2);
      let d = 0;
      for (let s = 1; s <= NS; s++) {
        const lo = Math.max(1, s - JUMP), hi = Math.min(NS, s + JUMP);
        const leftOut = JUMP - (s - lo), rightOut = JUMP - (hi - s);
        const sumLeft = pre[s - 1] - pre[lo - 1], sumRight = pre[hi] - pre[s];
        nv[s] = (sumLeft + sumRight - leftOut + rightOut) / (2 * JUMP);
        d = Math.max(d, Math.abs(nv[s] - v[s]));
      }
      v = nv;
      if (d < 1e-10) break;
    }
    return v;
  }

  // Features: returns {idx:Int32Array, val:Float64Array}
  let feat, nFeat, w, visits, episodes = 0, rmsHist = [];
  function buildFeatures() {
    const type = RL.$('#fa-type').value, k = +RL.$('#fa-k').value;
    const cache = [];
    if (type === 'agg') {
      nFeat = k;
      const size = NS / k;
      for (let s = 1; s <= NS; s++) cache[s] = { idx: Int32Array.of(Math.min(k - 1, Math.floor((s - 1) / size))), val: Float64Array.of(1) };
    } else if (type === 'poly' || type === 'fourier') {
      nFeat = k + 1;
      for (let s = 1; s <= NS; s++) {
        const x = (s - 1) / (NS - 1);
        const val = new Float64Array(k + 1), idx = new Int32Array(k + 1);
        for (let i = 0; i <= k; i++) { idx[i] = i; val[i] = type === 'poly' ? Math.pow(x, i) : Math.cos(i * Math.PI * x); }
        cache[s] = { idx, val };
      }
    } else {
      const T = k, width = 200, per = Math.floor(NS / width) + 1, off = 4;
      nFeat = T * per;
      for (let s = 1; s <= NS; s++) {
        const idx = new Int32Array(T);
        for (let t = 0; t < T; t++) idx[t] = t * per + Math.floor((s - 1 + t * off) / width);
        cache[s] = { idx, val: new Float64Array(T).fill(1) };
      }
    }
    feat = cache;
    w = new Float64Array(nFeat);
    visits = new Float64Array(NS + 1);
    episodes = 0; rmsHist = [];
  }
  const vhat = (s) => { const f = feat[s]; let v = 0; for (let i = 0; i < f.idx.length; i++) v += w[f.idx[i]] * f.val[i]; return v; };
  function grad(s, scale) { const f = feat[s]; for (let i = 0; i < f.idx.length; i++) w[f.idx[i]] += scale * f.val[i]; }

  function episode(alpha, method) {
    let s = 500;
    const states = [];
    for (;;) {
      visits[s]++;
      const k = 1 + RL.randint(JUMP);
      let s2 = Math.random() < 0.5 ? s - k : s + k;
      let r = 0, done = false;
      if (s2 < 1) { r = -1; done = true; } else if (s2 > NS) { r = 1; done = true; }
      if (method === 'td') {
        const target = r + (done ? 0 : vhat(s2));
        grad(s, alpha * (target - vhat(s)));
      } else states.push(s);
      if (done) {
        if (method === 'mc') states.forEach((x) => grad(x, alpha * (r - vhat(x))));
        return;
      }
      s = s2;
    }
  }
  function rmsVE() {
    let tot = 0, se = 0;
    for (let s = 1; s <= NS; s++) tot += visits[s];
    if (!tot) return NaN;
    for (let s = 1; s <= NS; s++) se += (visits[s] / tot) * (vhat(s) - trueV[s]) ** 2;
    return Math.sqrt(se);
  }

  const alphaEl = RL.$('#fa-alpha');
  const getLogA = RL.range('fa-alpha', null, (v) => Math.pow(10, v).toExponential(1));
  const DEFAULT_ALPHA = {
    mc: { agg: -3.3, poly: -4, fourier: -4, tile: -5 },
    td: { agg: -2, poly: -2.5, fourier: -3, tile: -4 },
  };
  const KRANGE = { agg: [2, 100, 10, 'groups'], poly: [1, 20, 5, 'order n'], fourier: [1, 20, 5, 'order n'], tile: [1, 50, 50, 'tilings'] };
  function onTypeChange() {
    const t = RL.$('#fa-type').value, [mn, mx, def, lbl] = KRANGE[t];
    const kEl = RL.$('#fa-k');
    kEl.min = mn; kEl.max = mx; kEl.value = def; kEl.dispatchEvent(new Event('input'));
    RL.$('#fa-k-lbl').textContent = lbl;
    resetAlpha();
    resetAll();
  }
  function resetAlpha() {
    alphaEl.value = DEFAULT_ALPHA[RL.$('#fa-method').value][RL.$('#fa-type').value];
    alphaEl.dispatchEvent(new Event('input'));
  }
  RL.range('fa-k', null, (v) => String(v));
  function resetAll() { buildFeatures(); draw(); }

  function draw() {
    if (!trueV) return;
    const est = [], tru = [];
    for (let s = 1; s <= NS; s++) { est.push([s, vhat(s)]); tru.push([s, trueV[s]]); }
    const bins = [];
    for (let s = 1; s <= NS; s += 10) { let m = 0; for (let k = 0; k < 10; k++) m += visits[s + k] || 0; bins.push(m); }
    const mx = Math.max(...bins);
    const bars = mx ? bins.map((m, i) => ({ x: 1 + i * 10, w: 10, y: -1 + 0.6 * m / mx, base: -1, color: 'rgba(139,92,246,0.35)' })) : [];
    RL.lineChart(cv, [
      { data: tru, color: '#a8701a', label: 'true v_π', width: 2, dash: [6, 4] },
      { data: est, color: '#3e6fb0', label: 'approximate v̂(s, w)', width: 2.2 },
    ], { xMin: 1, xMax: NS, yMin: -1, yMax: 1, xLabel: 'state  (purple bars = on-policy distribution μ)', yLabel: 'value', bars });
    const r = rmsVE();
    RL.$('#fa-ep').textContent = episodes.toLocaleString();
    RL.$('#fa-rms').textContent = Number.isFinite(r) ? r.toFixed(4) : '—';
    RL.$('#fa-nf').textContent = nFeat;
    RL.lineChart(RL.$('#fa-rmschart'), [{ data: rmsHist, color: '#c4673f' }], { xLabel: 'episodes', yLabel: '√VE (μ-weighted)', yMin: 0, legend: false });
    // basis functions preview
    const fc = RL.$('#fa-basis');
    const show = Math.min(nFeat, 8);
    const pick = Array.from({ length: show }, (_, i) => Math.round(i * (nFeat - 1) / Math.max(1, show - 1)));
    const series = pick.map((j, i) => {
      const d = [];
      for (let s = 1; s <= NS; s += 4) { const f = feat[s]; let v = 0; for (let q = 0; q < f.idx.length; q++) if (f.idx[q] === j) v = f.val[q]; d.push([s, v]); }
      return { data: d, color: RL.COLORS[i % RL.COLORS.length], width: 1.5 };
    });
    RL.lineChart(fc, series, { xMin: 1, xMax: NS, yMin: RL.$('#fa-type').value === 'fourier' ? -1.05 : -0.05, yMax: 1.05, legend: false, xLabel: 'state', yLabel: 'xᵢ(s)', title: `${show} of ${nFeat} feature functions` });
  }

  let busy = false;
  RL.$$('#fa-btns button[data-n]').forEach((b) => b.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    const n = +b.dataset.n, method = RL.$('#fa-method').value, alpha = Math.pow(10, getLogA());
    RL.chunked(n, 50, () => {
      episode(alpha, method); episodes++;
      if (episodes % 50 === 0) rmsHist.push([episodes, rmsVE()]);
    }, draw, () => { busy = false; draw(); });
  }));
  RL.$('#fa-type').addEventListener('change', onTypeChange);
  RL.$('#fa-k').addEventListener('change', resetAll);
  RL.$('#fa-method').addEventListener('change', () => { resetAlpha(); resetAll(); });
  RL.$('#fa-reset').addEventListener('click', resetAll);
  RL.onVisible(cv, () => { trueV = computeTrue(); onTypeChange(); });
})();

// ================= Mountain Car with tile-coded semi-gradient Sarsa =================
(() => {
  const cv = RL.$('#mc-car');
  if (!cv) return;
  const XMIN = -1.2, XMAX = 0.5, VMIN = -0.07, VMAX = 0.07;
  const T = 8, G = 8, PER = G + 1;
  const NW = T * PER * PER * 3;
  let w, x, v, steps, epLens, running = false, raf, trail = [];
  const getLogA = RL.range('mc-alpha', null, (val) => `${Math.pow(2, val).toFixed(3)}/8`);
  const getSpeed = RL.range('mc-speed', null, (val) => `${Math.round(Math.pow(10, val))} steps/frame`);

  function tiles(px, pv, a, out) {
    const fx = (px - XMIN) / (XMAX - XMIN) * G, fv = (pv - VMIN) / (VMAX - VMIN) * G;
    for (let t = 0; t < T; t++) {
      const ox = ((t * 1) % T) / T, ov = ((t * 3) % T) / T;
      const ix = Math.min(PER - 1, Math.floor(fx + ox)), iv = Math.min(PER - 1, Math.floor(fv + ov));
      out[t] = ((t * PER + ix) * PER + iv) * 3 + a;
    }
    return out;
  }
  const buf = new Int32Array(T);
  function q(px, pv, a) { tiles(px, pv, a, buf); let s = 0; for (let t = 0; t < T; t++) s += w[buf[t]]; return s; }
  function greedy(px, pv) { return RL.argmaxRandom([q(px, pv, 0), q(px, pv, 1), q(px, pv, 2)]); }
  function physics(px, pv, a) {
    let nv = RL.clamp(pv + 0.001 * (a - 1) - 0.0025 * Math.cos(3 * px), VMIN, VMAX);
    let nx = RL.clamp(px + nv, XMIN, XMAX);
    if (nx === XMIN) nv = 0;
    return [nx, nv];
  }
  function reset() { w = new Float64Array(NW); epLens = []; startEp(); drawAll(); }
  function startEp() { x = -0.6 + Math.random() * 0.2; v = 0; steps = 0; act = greedy(x, v); trail = []; }
  let act = 1;
  const idxA = new Int32Array(T), idxB = new Int32Array(T);
  function step() {
    const alpha = Math.pow(2, getLogA()) / T;
    const [nx, nv] = physics(x, v, act);
    tiles(x, v, act, idxA);
    let qsa = 0; for (let t = 0; t < T; t++) qsa += w[idxA[t]];
    steps++;
    if (nx >= XMAX || steps >= 5000) {
      const target = -1;
      for (let t = 0; t < T; t++) w[idxA[t]] += alpha * (target - qsa);
      epLens.push(steps);
      startEp();
      return true;
    }
    const a2 = greedy(nx, nv);
    tiles(nx, nv, a2, idxB);
    let q2 = 0; for (let t = 0; t < T; t++) q2 += w[idxB[t]];
    const delta = -1 + q2 - qsa;
    for (let t = 0; t < T; t++) w[idxA[t]] += alpha * delta;
    x = nx; v = nv; act = a2;
    trail.push([x, v]); if (trail.length > 400) trail.shift();
    return false;
  }

  function drawCar() {
    const { ctx, w: W, h: H } = RL.fit(cv);
    const sx = (px) => 20 + (px - XMIN) / (XMAX - XMIN) * (W - 40);
    const sy = (px) => H - 30 - (Math.sin(3 * px) + 1) / 2 * (H - 80);
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#0f1736'); grd.addColorStop(1, '#f2f6ea');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    ctx.beginPath(); ctx.moveTo(sx(XMIN), H);
    for (let px = XMIN; px <= XMAX + 1e-9; px += 0.01) ctx.lineTo(sx(px), sy(px));
    ctx.lineTo(sx(XMAX), H); ctx.closePath();
    const hg = ctx.createLinearGradient(0, H * 0.3, 0, H);
    hg.addColorStop(0, '#4338ca'); hg.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = hg; ctx.fill();
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2; ctx.stroke();
    const fx = sx(XMAX) - 4, fy = sy(XMAX);
    ctx.strokeStyle = '#232220'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 34); ctx.stroke();
    ctx.fillStyle = '#a8701a'; ctx.beginPath(); ctx.moveTo(fx, fy - 34); ctx.lineTo(fx - 18, fy - 28); ctx.lineTo(fx, fy - 22); ctx.fill();
    const cx = sx(x), cy = sy(x);
    const slope = Math.atan2(sy(x + 0.01) - sy(x - 0.01), sx(x + 0.01) - sx(x - 0.01));
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(slope);
    ctx.fillStyle = '#c4673f'; ctx.shadowColor = '#c4673f'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-20, -22, 40, 16, 5) : ctx.rect(-20, -22, 40, 16); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#6e4a12'; ctx.fillRect(4, -30, 12, 9);
    ctx.fillStyle = '#111'; [-12, 12].forEach((wx) => { ctx.beginPath(); ctx.arc(wx, -5, 5, 0, 7); ctx.fill(); });
    const thrust = act - 1;
    if (thrust) { ctx.fillStyle = '#3e6fb0'; ctx.beginPath(); ctx.moveTo(-thrust * 22, -14); ctx.lineTo(-thrust * 36, -18); ctx.lineTo(-thrust * 36, -10); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = '#3d3c39'; ctx.font = '12px JetBrains Mono, monospace'; ctx.textAlign = 'left';
    ctx.fillText(`episode ${epLens.length + 1}  step ${steps}  x=${x.toFixed(3)}  ẋ=${v.toFixed(4)}  action=${['◀ reverse', '· coast', 'forward ▶'][act]}`, 12, 18);
  }
  function drawCost() {
    const c = RL.$('#mc-cost');
    const { ctx, w: W, h: H } = RL.fit(c);
    const n = 50, cw = (W - 50) / n, ch = (H - 34) / n;
    const vals = new Float64Array(n * n);
    let mx = 1e-9;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const px = XMIN + (i + 0.5) / n * (XMAX - XMIN), pv = VMIN + (j + 0.5) / n * (VMAX - VMIN);
      const cost = -Math.max(q(px, pv, 0), q(px, pv, 1), q(px, pv, 2));
      vals[i * n + j] = cost; mx = Math.max(mx, cost);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = RL.seq(1 - vals[i * n + j] / mx);
      ctx.fillRect(40 + i * cw, 6 + (n - 1 - j) * ch, cw + 0.5, ch + 0.5);
    }
    ctx.strokeStyle = 'rgba(35,34,32,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath();
    trail.forEach(([px, pv], k) => { const X = 40 + (px - XMIN) / (XMAX - XMIN) * n * cw, Y = 6 + (1 - (pv - VMIN) / (VMAX - VMIN)) * n * ch; k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.stroke();
    ctx.fillStyle = '#6f6e66'; ctx.font = '11px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('position →', 40 + n * cw / 2, H - 10);
    ctx.save(); ctx.translate(14, 6 + n * ch / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('velocity →', 0, 0); ctx.restore();
    ctx.fillStyle = 'rgba(7,11,24,0.8)'; ctx.fillRect(42, 8, 150, 18);
    ctx.fillStyle = '#232220'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(`max cost-to-go ≈ ${mx.toFixed(0)}`, 48, 17);
  }
  let lastCost = 0;
  function drawAll(force = true) {
    drawCar();
    const now = performance.now();
    if (force || now - lastCost > 250) { drawCost(); lastCost = now; RL.lineChart(RL.$('#mc-steps'), [{ data: epLens, x0: 1, color: '#3e6fb0' }], { xLabel: 'episode', yLabel: 'steps to goal', yMin: 0, logY: false, legend: false }); }
    RL.$('#mc-ep').textContent = epLens.length;
    RL.$('#mc-last').textContent = epLens.length ? epLens[epLens.length - 1] : '—';
  }
  function loop() {
    if (!running) return;
    const n = Math.round(Math.pow(10, getSpeed()));
    for (let i = 0; i < n; i++) step();
    drawAll(false);
    raf = requestAnimationFrame(loop);
  }
  RL.$('#mc-run').addEventListener('click', () => {
    running = !running;
    RL.$('#mc-run').textContent = running ? '⏸ Pause' : '▶ Run';
    if (running) loop(); else cancelAnimationFrame(raf);
  });
  RL.$('#mc-fast').addEventListener('click', () => {
    const target = epLens.length + 50;
    RL.$('#mc-fast').disabled = true;
    const tick = () => {
      const t0 = performance.now();
      while (epLens.length < target && performance.now() - t0 < 30) step();
      drawAll(true);
      if (epLens.length < target) setTimeout(tick, 0); else RL.$('#mc-fast').disabled = false;
    };
    tick();
  });
  RL.$('#mc-reset').addEventListener('click', reset);
  window.addEventListener('resize', () => drawAll(true));
  reset();
})();
