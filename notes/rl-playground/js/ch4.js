'use strict';

// ================= DP Gridworld playground =================
(() => {
  const cv = RL.$('#dp-grid');
  if (!cv) return;
  const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];
  const PRESETS = {
    sutton: { R: 4, C: 4, gamma: 1, step: -1, slip: 0, goalR: 0, pitR: 0, cells: { 0: 'term', 15: 'term' } },
    maze: {
      R: 7, C: 9, gamma: 0.95, step: -0.04, slip: 0.2, goalR: 1, pitR: -1,
      cells: { 10: 'wall', 11: 'wall', 12: 'wall', 14: 'wall', 15: 'wall', 21: 'wall', 23: 'wall', 30: 'wall', 32: 'wall', 34: 'wall', 39: 'wall', 41: 'wall', 43: 'wall', 48: 'wall', 49: 'wall', 52: 'wall', 8: 'goal', 26: 'pit', 44: 'pit', 61: 'pit' },
    },
    cliff: (() => {
      const cells = { 47: 'goal' };
      for (let c = 1; c < 11; c++) cells[36 + c] = 'pit';
      return { R: 4, C: 12, gamma: 1, step: -1, slip: 0, goalR: 0, pitR: -100, cells };
    })(),
    windyish: { R: 5, C: 5, gamma: 0.9, step: 0, slip: 0.3, goalR: 1, pitR: -1, cells: { 4: 'goal', 9: 'pit', 12: 'wall', 7: 'wall' } },
  };

  let R, C, cells, V, pi, sweeps, deltas, timer = null, tool = 'wall', showQ = false;
  const params = {};
  const bind = (id, key, f) => { params[key] = RL.range(id, () => { draw(); }, f); };
  bind('dp-gamma', 'gamma', (v) => v.toFixed(2));
  bind('dp-step', 'step', (v) => v.toFixed(2));
  bind('dp-slip', 'slip', (v) => v.toFixed(2));
  bind('dp-goal', 'goalR', (v) => v.toFixed(1));
  bind('dp-pit', 'pitR', (v) => v.toFixed(1));

  function setSlider(id, v) { const el = RL.$('#' + id); el.value = v; el.dispatchEvent(new Event('input')); }
  function loadPreset(name) {
    stop();
    const p = PRESETS[name];
    V = null;
    R = p.R; C = p.C;
    cells = new Array(R * C).fill('empty');
    Object.entries(p.cells).forEach(([k, v]) => (cells[+k] = v));
    setSlider('dp-gamma', p.gamma); setSlider('dp-step', p.step); setSlider('dp-slip', p.slip);
    setSlider('dp-goal', p.goalR); setSlider('dp-pit', p.pitR);
    resetValues();
  }
  function resetValues() {
    stop();
    V = new Float64Array(R * C);
    pi = Array.from({ length: R * C }, () => [0.25, 0.25, 0.25, 0.25]);
    sweeps = 0; deltas = [];
    status('Values reset to 0, policy = uniform random.');
    draw();
  }
  const isTerm = (s) => cells[s] === 'goal' || cells[s] === 'pit' || cells[s] === 'term';
  function move(s, a) {
    const r = Math.floor(s / C) + DR[a], c = (s % C) + DC[a];
    if (r < 0 || r >= R || c < 0 || c >= C) return s;
    const s2 = r * C + c;
    return cells[s2] === 'wall' ? s : s2;
  }
  function reward(s2) {
    let r = params.step();
    if (cells[s2] === 'goal') r += params.goalR();
    if (cells[s2] === 'pit') r += params.pitR();
    return r;
  }
  function transitions(s, a) {
    const slip = params.slip();
    const out = [[move(s, a), 1 - slip]];
    if (slip > 0) { out.push([move(s, (a + 1) % 4), slip / 2]); out.push([move(s, (a + 3) % 4), slip / 2]); }
    return out;
  }
  function q(s, a, Vv = V) {
    const g = params.gamma();
    let v = 0;
    for (const [s2, p] of transitions(s, a)) v += p * (reward(s2) + g * (isTerm(s2) ? 0 : Vv[s2]));
    return v;
  }
  function evalSweep() {
    const nv = new Float64Array(V.length);
    let d = 0;
    for (let s = 0; s < V.length; s++) {
      if (isTerm(s) || cells[s] === 'wall') continue;
      let v = 0;
      for (let a = 0; a < 4; a++) if (pi[s][a] > 0) v += pi[s][a] * q(s, a);
      nv[s] = v; d = Math.max(d, Math.abs(v - V[s]));
    }
    V = nv; sweeps++; deltas.push(d);
    return d;
  }
  function viSweep() {
    const nv = new Float64Array(V.length);
    let d = 0;
    for (let s = 0; s < V.length; s++) {
      if (isTerm(s) || cells[s] === 'wall') continue;
      let m = -Infinity;
      for (let a = 0; a < 4; a++) m = Math.max(m, q(s, a));
      nv[s] = m; d = Math.max(d, Math.abs(m - V[s]));
    }
    V = nv; sweeps++; deltas.push(d);
    greedify();
    return d;
  }
  function greedify() {
    let stable = true;
    for (let s = 0; s < V.length; s++) {
      if (isTerm(s) || cells[s] === 'wall') continue;
      const qs = [0, 1, 2, 3].map((a) => q(s, a));
      const m = Math.max(...qs);
      const best = qs.map((x) => (m - x < 1e-7 ? 1 : 0));
      const n = best.reduce((a, b) => a + b, 0);
      const np = best.map((b) => b / n);
      if (np.some((p, a) => Math.abs(p - pi[s][a]) > 1e-9)) {
        const oldBestQ = pi[s].reduce((acc, p, a) => acc + p * qs[a], 0);
        if (m - oldBestQ > 1e-7) stable = false;
      }
      pi[s] = np;
    }
    return stable;
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } RL.$$('#dp-controls button').forEach((b) => (b.disabled = false)); }
  function status(t) { RL.$('#dp-status').textContent = t; }
  function animate(fn, ms) {
    stop();
    RL.$$('#dp-controls button:not(#dp-stop)').forEach((b) => (b.disabled = true));
    timer = setInterval(() => { if (fn() === false) stop(); draw(); }, ms);
  }

  RL.$('#dp-eval1').addEventListener('click', () => { const d = evalSweep(); status(`Policy evaluation sweep: max |Δv| = ${d.toExponential(2)}`); draw(); });
  RL.$('#dp-evalall').addEventListener('click', () => {
    animate(() => { const d = evalSweep(); status(`Evaluating π… sweep ${sweeps}, Δ = ${d.toExponential(2)}`); if (d < 1e-4 || sweeps > 3000) { status(`v_π converged after ${sweeps} sweeps (Δ < 1e-4).`); return false; } }, 40);
  });
  RL.$('#dp-improve').addEventListener('click', () => { const st = greedify(); status(st ? 'Policy improvement: policy is already greedy w.r.t. v — it is stable.' : 'Policy improvement: π ← greedy(v). Arrows changed!'); draw(); });
  RL.$('#dp-pi').addEventListener('click', () => {
    let phase = 'eval', iter = 0, inner = 0;
    animate(() => {
      if (phase === 'eval') {
        const d = evalSweep(); inner++;
        status(`Policy iteration #${iter + 1}: evaluating (sweep ${inner}, Δ=${d.toExponential(1)})`);
        if (d < 1e-4 || inner > 2000) phase = 'improve';
      } else {
        iter++; inner = 0;
        const st = greedify();
        if (st) { status(`✅ Policy iteration converged: ${iter} improvement steps, ${sweeps} total sweeps. π is optimal.`); return false; }
        status(`Policy iteration #${iter}: improved policy`); phase = 'eval';
      }
    }, 30);
  });
  RL.$('#dp-vi1').addEventListener('click', () => { const d = viSweep(); status(`Value iteration sweep: Δ = ${d.toExponential(2)}`); draw(); });
  RL.$('#dp-viall').addEventListener('click', () => {
    animate(() => { const d = viSweep(); status(`Value iteration sweep ${sweeps}, Δ = ${d.toExponential(2)}`); if (d < 1e-5 || sweeps > 3000) { status(`✅ Value iteration converged after ${sweeps} sweeps.`); return false; } }, 90);
  });
  RL.$('#dp-reset').addEventListener('click', resetValues);
  RL.$('#dp-stop').addEventListener('click', stop);
  RL.$('#dp-preset').addEventListener('change', (e) => loadPreset(e.target.value));
  RL.$('#dp-showq').addEventListener('change', (e) => { showQ = e.target.checked; draw(); });
  RL.$$('#dp-tools button').forEach((b) => b.addEventListener('click', () => {
    tool = b.dataset.tool;
    RL.$$('#dp-tools button').forEach((x) => x.classList.toggle('sel', x === b));
  }));

  let painting = false;
  function cellAt(e) {
    const rect = cv.getBoundingClientRect();
    const cs = rect.width / C;
    const c = Math.floor((e.clientX - rect.left) / cs), r = Math.floor((e.clientY - rect.top) / cs);
    return r >= 0 && r < R && c >= 0 && c < C ? r * C + c : -1;
  }
  function paint(e) {
    const s = cellAt(e);
    if (s < 0 || cells[s] === tool) return;
    cells[s] = tool; V[s] = 0; pi[s] = [0.25, 0.25, 0.25, 0.25];
    draw();
  }
  cv.addEventListener('mousedown', (e) => { painting = true; paint(e); });
  cv.addEventListener('mousemove', (e) => { if (painting) paint(e); });
  window.addEventListener('mouseup', () => (painting = false));

  function draw() {
    if (!V) return;
    const maxW = cv.parentElement.clientWidth;
    const cs = Math.min(76, Math.floor(maxW / C));
    cv.style.width = cs * C + 'px';
    cv.dataset.h = cs * R;
    const { ctx } = RL.fit(cv);
    let maxAbs = 1e-9;
    V.forEach((v, s) => { if (cells[s] !== 'wall') maxAbs = Math.max(maxAbs, Math.abs(v)); });
    for (let s = 0; s < R * C; s++) {
      const x = (s % C) * cs, y = Math.floor(s / C) * cs, t = cells[s];
      if (t === 'wall') { ctx.fillStyle = '#2a3150'; ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2); ctx.fillStyle = 'rgba(35,34,32,0.07)'; for (let k = 0; k < cs; k += 8) ctx.fillRect(x + k, y + 1, 2, cs - 2); continue; }
      if (t === 'goal') ctx.fillStyle = '#065f46';
      else if (t === 'pit') ctx.fillStyle = '#7f1d1d';
      else if (t === 'term') ctx.fillStyle = '#334155';
      else ctx.fillStyle = RL.diverge(V[s], maxAbs);
      ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (t === 'goal' || t === 'pit' || t === 'term') {
        ctx.font = `${cs * 0.38}px serif`; ctx.fillStyle = '#232220';
        ctx.fillText(t === 'goal' ? '🏁' : t === 'pit' ? '🔥' : '■', x + cs / 2, y + cs / 2);
        continue;
      }
      if (showQ) {
        const qs = [0, 1, 2, 3].map((a) => q(s, a));
        const qm = Math.max(...qs.map(Math.abs), 1e-9);
        const cx = x + cs / 2, cy = y + cs / 2;
        const tri = [[[x, y], [x + cs, y]], [[x + cs, y], [x + cs, y + cs]], [[x + cs, y + cs], [x, y + cs]], [[x, y + cs], [x, y]]];
        tri.forEach(([p1, p2], a) => {
          ctx.fillStyle = RL.diverge(qs[a], Math.max(qm, maxAbs));
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p1[0] + (p1[0] < cx ? 1 : -1), p1[1] + (p1[1] < cy ? 1 : -1)); ctx.lineTo(p2[0] + (p2[0] < cx ? 1 : -1), p2[1] + (p2[1] < cy ? 1 : -1)); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();
        });
        if (cs > 54) {
          ctx.font = `${cs * 0.13}px JetBrains Mono, monospace`; ctx.fillStyle = 'rgba(35,34,32,0.85)';
          [[0, -0.33], [0.33, 0], [0, 0.33], [-0.33, 0]].forEach(([dx, dy], a) => ctx.fillText(qs[a].toFixed(1), cx + dx * cs, cy + dy * cs));
        }
      } else {
        ctx.fillStyle = 'rgba(35,34,32,0.9)';
        ctx.font = `600 ${Math.max(9, cs * 0.17)}px JetBrains Mono, monospace`;
        ctx.fillText(V[s].toFixed(Math.abs(V[s]) >= 10 ? 1 : 2), x + cs / 2, y + cs * 0.8);
        for (let a = 0; a < 4; a++) {
          const p = pi[s][a];
          if (p > 0.001) RL.arrow(ctx, x + cs / 2, y + cs * 0.42, DC[a], DR[a], cs * 0.1 + cs * 0.18 * p, `rgba(35,34,32,${0.35 + 0.6 * p})`, 1.6);
        }
      }
    }
    RL.$('#dp-sweeps').textContent = sweeps;
    RL.$('#dp-delta').textContent = deltas.length ? deltas[deltas.length - 1].toExponential(1) : '—';
    if (deltas.length) RL.lineChart(RL.$('#dp-dchart'), [{ data: deltas.map((d) => Math.max(d, 1e-8)), x0: 1, color: '#3e6fb0' }], { logY: true, xLabel: 'sweep', yLabel: 'max |Δv|', legend: false });
    else RL.lineChart(RL.$('#dp-dchart'), [], { xLabel: 'sweep', yLabel: 'max |Δv|', xMin: 0, xMax: 10, yMin: 0, yMax: 1 });
  }
  window.addEventListener('resize', draw);
  loadPreset('sutton');
})();

// ================= Gambler's problem (Example 4.3) =================
(() => {
  const cv = RL.$('#gam-v');
  if (!cv) return;
  const getP = RL.range('gam-p', null, (v) => v.toFixed(2));
  function run() {
    const ph = getP();
    const V = new Float64Array(101); V[100] = 1;
    const snaps = [];
    let sweep = 0;
    for (;;) {
      let d = 0; sweep++;
      for (let s = 1; s < 100; s++) {
        let m = 0;
        for (let a = 1; a <= Math.min(s, 100 - s); a++) m = Math.max(m, ph * V[s + a] + (1 - ph) * V[s - a]);
        d = Math.max(d, Math.abs(m - V[s])); V[s] = m;
      }
      if ([1, 2, 3, 32].includes(sweep)) snaps.push({ sweep, v: [...V.slice(1, 100)] });
      if (d < 1e-12 || sweep > 5000) break;
    }
    const policy = [];
    for (let s = 1; s < 100; s++) {
      let best = -1, ba = 0;
      for (let a = 1; a <= Math.min(s, 100 - s); a++) {
        const v = ph * V[s + a] + (1 - ph) * V[s - a];
        if (v > best + 1e-9) { best = v; ba = a; }
      }
      policy.push([s, ba]);
    }
    const cols = ['#5a8fb8', '#2f7d5f', '#a8701a', '#c4673f'];
    RL.lineChart(cv, [
      ...snaps.map((sn, i) => ({ data: sn.v, x0: 1, color: cols[i], label: `sweep ${sn.sweep}`, width: 1.4 })),
      { data: [...V.slice(1, 100)], x0: 1, color: '#232220', label: `final (${sweep} sweeps)`, width: 2.2, dash: [5, 3] },
    ], { xLabel: 'capital', yLabel: 'value estimate (P[win])', yMin: 0, yMax: 1, xMin: 0, xMax: 100 });
    RL.lineChart(RL.$('#gam-pi'), [], {
      xLabel: 'capital', yLabel: 'final policy (stake)', xMin: 0, xMax: 100, yMin: 0, yMax: 52, legend: false,
      bars: policy.map(([s, a]) => ({ x: s - 0.4, w: 0.8, y: a, color: 'rgba(139,92,246,0.85)' })),
    });
  }
  RL.$('#gam-p').addEventListener('input', run);
  RL.onVisible(cv, run);
})();
