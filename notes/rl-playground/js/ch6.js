'use strict';

// ================= Random walk: TD(0) vs constant-α MC (Example 6.2) =================
(() => {
  const cv = RL.$('#rw-walk');
  if (!cv) return;
  const TRUE = [1, 2, 3, 4, 5].map((k) => k / 6);
  let V, ep, pos = 3, trail = [], animating = false;
  const history = [];
  const getAlpha = RL.range('rw-alpha', null, (v) => v.toFixed(2));
  const methodSel = RL.$('#rw-method');

  function reset() { V = [0, 0.5, 0.5, 0.5, 0.5, 0.5, 0]; ep = 0; history.length = 0; history.push({ ep: 0, v: V.slice(1, 6) }); pos = 3; trail = []; draw(); }

  // Plays one episode, applying updates; onStep(s, s2) is called for animation.
  function runEpisode(Vv, alpha, method, record) {
    let s = 3;
    const visited = [];
    while (s !== 0 && s !== 6) {
      const s2 = s + (Math.random() < 0.5 ? -1 : 1);
      const r = s2 === 6 ? 1 : 0;
      if (method === 'td') Vv[s] += alpha * (r + Vv[s2] - Vv[s]);
      visited.push(s);
      if (record) record.push(s2);
      s = s2;
    }
    if (method === 'mc') {
      const G = s === 6 ? 1 : 0;
      visited.forEach((x) => (Vv[x] += alpha * (G - Vv[x])));
    }
    return s;
  }

  function draw() {
    const { ctx, w, h } = RL.fit(cv);
    const n = 7, gap = w / (n + 0.5), y = h / 2, r = Math.min(30, gap * 0.32);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(35,34,32,0.15)';
    ctx.beginPath(); ctx.moveTo(gap * 0.75, y); ctx.lineTo(gap * (n - 0.25), y); ctx.stroke();
    const names = ['0', 'A', 'B', 'C', 'D', 'E', '+1'];
    for (let i = 0; i < n; i++) {
      const x = gap * (i + 0.75);
      const term = i === 0 || i === 6;
      ctx.fillStyle = term ? (i === 6 ? '#065f46' : '#3f1d2e') : RL.seq(V[i]);
      ctx.beginPath(); term ? ctx.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6) : ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.fillStyle = '#232220'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${r * 0.55}px Inter, system-ui, sans-serif`; ctx.fillText(names[i], x, y);
      if (!term) {
        ctx.font = `${Math.max(10, r * 0.42)}px JetBrains Mono, monospace`; ctx.fillStyle = '#3d3c39';
        ctx.fillText(V[i].toFixed(3), x, y + r + 14);
        ctx.fillStyle = '#a8701a'; ctx.fillText(`(${TRUE[i - 1].toFixed(3)})`, x, y + r + 30);
      }
    }
    if (animating) {
      const x = gap * (pos + 0.75);
      ctx.fillStyle = '#c4673f'; ctx.shadowColor = '#c4673f'; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(x, y - r - 14, 9, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    }
    ctx.textAlign = 'left'; ctx.font = '12px Inter, system-ui, sans-serif'; ctx.fillStyle = '#6f6e66';
    ctx.fillText(`episodes: ${ep}   (yellow = true value)`, 10, 16);
    const seen = new Set();
    const snaps = history.filter((hh, i) => (i === 0 || [1, 10, 100].includes(hh.ep) || i === history.length - 1) && !seen.has(hh.ep) && seen.add(hh.ep));
    const cols = ['#64748b', '#5a8fb8', '#2f7d5f', '#c4673f', '#3e6fb0'];
    RL.lineChart(RL.$('#rw-vals'), [
      { data: TRUE.map((v, i) => [i, v]), color: '#a8701a', label: 'true', dash: [5, 4], width: 2 },
      ...snaps.map((sn, i) => ({ data: sn.v.map((v, k) => [k, v]), color: cols[i % cols.length], label: `ep ${sn.ep}`, width: 1.6 })),
    ], { xMin: -0.2, xMax: 4.2, yMin: 0, yMax: 1, xLabel: 'state (A=0 … E=4)', yLabel: 'V(s)' });
  }

  function animateEpisode() {
    if (animating) return;
    animating = true;
    const path = [];
    let s = 3;
    pos = 3;
    while (s !== 0 && s !== 6) { s += Math.random() < 0.5 ? -1 : 1; path.push(s); }
    const alpha = getAlpha(), method = methodSel.value;
    let k = 0, prev = 3;
    const visited = [3];
    const tick = () => {
      if (k >= path.length) {
        if (method === 'mc') { const G = prev === 6 ? 1 : 0; visited.slice(0, -1).forEach((x) => (V[x] += alpha * (G - V[x]))); }
        ep++; history.push({ ep, v: V.slice(1, 6) }); animating = false; draw();
        RL.$('#rw-log').innerHTML = method === 'td' ? 'TD updated each state <b>as it went</b>, using the next state\'s estimate.' : `MC waited until the end, then moved every visited state toward G = ${prev === 6 ? 1 : 0}.`;
        return;
      }
      const s2 = path[k++];
      if (method === 'td') {
        const r = s2 === 6 ? 1 : 0;
        const delta = r + V[s2] - V[prev];
        V[prev] += alpha * delta;
        RL.$('#rw-log').innerHTML = `TD error δ = R + V(${'0ABCDE+'[s2]}) − V(${'0ABCDE+'[prev]}) = <b class="mono">${delta.toFixed(3)}</b>`;
      }
      prev = s2; pos = s2; visited.push(s2);
      draw();
      setTimeout(tick, 260);
    };
    tick();
  }
  RL.$('#rw-one').addEventListener('click', animateEpisode);
  RL.$$('#rw-btns button[data-n]').forEach((b) => b.addEventListener('click', () => {
    if (animating) return;
    const n = +b.dataset.n;
    for (let i = 0; i < n; i++) { runEpisode(V, getAlpha(), methodSel.value); ep++; if ([1, 10, 100].includes(ep)) history.push({ ep, v: V.slice(1, 6) }); }
    if (history[history.length - 1].ep !== ep) history.push({ ep, v: V.slice(1, 6) });
    draw();
  }));
  RL.$('#rw-reset').addEventListener('click', reset);
  methodSel.addEventListener('change', reset);

  RL.$('#rw-curves').addEventListener('click', () => {
    const cfgs = [
      { m: 'td', a: 0.05, c: '#3e6fb0' }, { m: 'td', a: 0.1, c: '#5a8fb8' }, { m: 'td', a: 0.15, c: '#6b4fa8' },
      { m: 'mc', a: 0.01, c: '#a8701a' }, { m: 'mc', a: 0.02, c: '#f59e0b' }, { m: 'mc', a: 0.03, c: '#c4673f' }, { m: 'mc', a: 0.04, c: '#b8452f' },
    ];
    const runs = 100, E = 100;
    const series = cfgs.map((cf) => {
      const err = new Float64Array(E + 1);
      for (let r = 0; r < runs; r++) {
        const Vv = [0, 0.5, 0.5, 0.5, 0.5, 0.5, 0];
        for (let e = 0; e <= E; e++) {
          let se = 0; for (let i = 0; i < 5; i++) se += (Vv[i + 1] - TRUE[i]) ** 2;
          err[e] += Math.sqrt(se / 5);
          runEpisode(Vv, cf.a, cf.m);
        }
      }
      return { data: [...err].map((x) => x / runs), color: cf.c, label: `${cf.m.toUpperCase()} α=${cf.a}`, width: 1.7 };
    });
    RL.lineChart(RL.$('#rw-rms'), series, { xLabel: 'episodes', yLabel: 'RMS error (avg over states)', yMin: 0, yMax: 0.25 });
  });
  RL.lineChart(RL.$('#rw-rms'), [], { xLabel: 'episodes', yLabel: 'RMS error (avg over states)', yMin: 0, yMax: 0.25, xMin: 0, xMax: 100 });
  window.addEventListener('resize', () => draw());
  reset();
})();

// ================= Cliff walking & Windy gridworld: Sarsa vs Q-learning vs Expected Sarsa =================
(() => {
  const host = RL.$('#td-grids');
  if (!host) return;
  const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];
  const ENVS = {
    cliff: { R: 4, C: 12, start: [3, 0], goal: [3, 11], wind: null },
    windy: { R: 7, C: 10, start: [3, 0], goal: [3, 7], wind: [0, 0, 0, 1, 1, 1, 2, 2, 1, 0] },
  };
  const ALGOS = [
    { key: 'sarsa', name: 'Sarsa', color: '#3e6fb0' },
    { key: 'q', name: 'Q-learning', color: '#c4673f' },
    { key: 'esarsa', name: 'Expected Sarsa', color: '#a8701a' },
  ];
  let env, agents, running = false, raf = null;
  const getEps = RL.range('td-eps', null, (v) => v.toFixed(2));
  const getAlpha = RL.range('td-alpha', null, (v) => v.toFixed(2));
  const getSpeed = RL.range('td-speed', null, (v) => `${Math.round(Math.pow(10, v))} steps/frame`);

  function envStep(s, a) {
    const e = env;
    let r = Math.floor(s / e.C), c = s % e.C;
    const wind = e.wind ? e.wind[c] : 0;
    r = RL.clamp(r + DR[a] - wind, 0, e.R - 1);
    c = RL.clamp(c + DC[a], 0, e.C - 1);
    const s2 = r * e.C + c;
    if (!e.wind && r === 3 && c > 0 && c < 11) return [e.start[0] * e.C + e.start[1], -100, false];
    return [s2, -1, s2 === e.goal[0] * e.C + e.goal[1]];
  }
  function epsGreedy(Q, s, eps) {
    if (Math.random() < eps) return RL.randint(4);
    return RL.argmaxRandom(Q, s * 4, 4);
  }
  function makeAgents() {
    env = ENVS[RL.$('#td-env').value];
    const S = env.R * env.C;
    agents = ALGOS.filter((a) => RL.$('#td-show-' + a.key).checked).map((a) => ({ ...a, Q: new Float64Array(S * 4), s: null, act: null, G: 0, len: 0, returns: [], steps: 0 }));
    host.innerHTML = '';
    agents.forEach((ag) => {
      const box = document.createElement('div');
      box.innerHTML = `<div style="font-weight:700;color:${ag.color};margin:6px 0 4px">${ag.name} <span class="mono" style="color:var(--muted);font-weight:400" data-ep></span></div><canvas class="plot" data-h="${Math.round(env.R * 34)}"></canvas>`;
      host.appendChild(box);
      ag.cv = box.querySelector('canvas'); ag.lbl = box.querySelector('[data-ep]');
    });
    drawAll();
  }
  function agentStep(ag) {
    const eps = getEps(), alpha = getAlpha();
    const start = env.start[0] * env.C + env.start[1];
    if (ag.s === null) { ag.s = start; ag.act = epsGreedy(ag.Q, start, eps); ag.G = 0; ag.len = 0; }
    if (ag.act === null) ag.act = epsGreedy(ag.Q, ag.s, eps);
    const s = ag.s, a = ag.act;
    const [s2, r, done] = envStep(s, a);
    ag.G += r; ag.len++; ag.steps++;
    let target = r;
    let a2 = null;
    if (!done) {
      if (ag.key === 'sarsa') { a2 = epsGreedy(ag.Q, s2, eps); target += ag.Q[s2 * 4 + a2]; }
      else if (ag.key === 'q') target += Math.max(ag.Q[s2 * 4], ag.Q[s2 * 4 + 1], ag.Q[s2 * 4 + 2], ag.Q[s2 * 4 + 3]);
      else {
        const qs = [0, 1, 2, 3].map((k) => ag.Q[s2 * 4 + k]);
        const m = Math.max(...qs), nb = qs.filter((x) => x === m).length;
        target += qs.reduce((acc, q) => acc + q * (eps / 4 + (q === m ? (1 - eps) / nb : 0)), 0);
      }
    }
    ag.Q[s * 4 + a] += alpha * (target - ag.Q[s * 4 + a]);
    if (done || ag.len > 20000) { ag.returns.push(ag.G); ag.s = null; }
    else { ag.s = s2; ag.act = a2; }
  }
  function greedyPath(ag) {
    const start = env.start[0] * env.C + env.start[1], goal = env.goal[0] * env.C + env.goal[1];
    const path = [start], seen = new Set([start]);
    let s = start;
    for (let i = 0; i < 80 && s !== goal; i++) {
      const q = ag.Q.slice(s * 4, s * 4 + 4);
      const best = q.indexOf(Math.max(...q));
      const [s2] = envStep(s, best);
      if (seen.has(s2)) { path.push(s2); break; }
      path.push(s2); seen.add(s2); s = s2;
    }
    return path;
  }
  function drawGrid(ag) {
    const { ctx, w } = RL.fit(ag.cv);
    const cs = Math.min(w / env.C, 34);
    const ox = (w - cs * env.C) / 2;
    let qmin = 0;
    for (let s = 0; s < env.R * env.C; s++) qmin = Math.min(qmin, Math.max(ag.Q[s * 4], ag.Q[s * 4 + 1], ag.Q[s * 4 + 2], ag.Q[s * 4 + 3]));
    for (let r = 0; r < env.R; r++) for (let c = 0; c < env.C; c++) {
      const s = r * env.C + c;
      const x = ox + c * cs, y = r * cs;
      const isCliff = !env.wind && r === 3 && c > 0 && c < 11;
      const v = Math.max(ag.Q[s * 4], ag.Q[s * 4 + 1], ag.Q[s * 4 + 2], ag.Q[s * 4 + 3]);
      ctx.fillStyle = isCliff ? '#7f1d1d' : RL.seq(qmin < 0 ? 1 - v / qmin : 0.5);
      ctx.globalAlpha = isCliff ? 1 : 0.55;
      ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
      ctx.globalAlpha = 1;
      if (r === env.start[0] && c === env.start[1]) { ctx.fillStyle = '#232220'; ctx.font = `700 ${cs * 0.45}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('S', x + cs / 2, y + cs / 2); }
      if (r === env.goal[0] && c === env.goal[1]) { ctx.font = `${cs * 0.55}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🏁', x + cs / 2, y + cs / 2); }
    }
    if (env.wind) {
      ctx.fillStyle = '#6f6e66'; ctx.font = '10px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
      env.wind.forEach((wv, c) => { if (wv) ctx.fillText('↑'.repeat(wv), ox + (c + 0.5) * cs, 9); });
    }
    const path = greedyPath(ag);
    ctx.strokeStyle = ag.color; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath();
    path.forEach((s, i) => { const x = ox + (s % env.C + 0.5) * cs, y = (Math.floor(s / env.C) + 0.5) * cs; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    if (ag.s !== null) {
      const x = ox + (ag.s % env.C + 0.5) * cs, y = (Math.floor(ag.s / env.C) + 0.5) * cs;
      ctx.fillStyle = '#232220'; ctx.shadowColor = ag.color; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(x, y, cs * 0.22, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    }
    const last = ag.returns.slice(-10);
    ag.lbl.textContent = `episodes ${ag.returns.length} · last-10 avg return ${last.length ? (last.reduce((a, b) => a + b, 0) / last.length).toFixed(1) : '—'}`;
  }
  function drawAll() {
    agents.forEach(drawGrid);
    const isCliff = !env.wind;
    const n = Math.max(0, ...agents.map((ag) => ag.returns.length));
    const win = Math.max(10, Math.floor(n / 30));
    const every = Math.max(1, Math.floor(n / 600));
    RL.lineChart(RL.$('#td-chart'), agents.map((ag) => ({
      data: RL.smooth(ag.returns, win).map((y, i) => [i + 1, y]).filter((_, i) => i % every === 0),
      color: ag.color, label: ag.name, width: 1.8,
    })), { xLabel: 'episodes', yLabel: `sum of rewards (${win}-ep moving avg)`, yMin: isCliff ? -100 : -300, yMax: 0, xMin: 0 });
  }
  function loop() {
    if (!running) return;
    const sp = getSpeed();
    const steps = Math.round(Math.pow(10, sp));
    for (let i = 0; i < steps; i++) agents.forEach(agentStep);
    drawAll();
    raf = requestAnimationFrame(loop);
  }
  RL.$('#td-run').addEventListener('click', () => {
    running = !running;
    RL.$('#td-run').textContent = running ? '⏸ Pause' : '▶ Run';
    if (running) loop(); else cancelAnimationFrame(raf);
  });
  RL.$('#td-reset').addEventListener('click', () => { makeAgents(); });
  RL.$('#td-env').addEventListener('change', () => {
    makeAgents();
  });
  ALGOS.forEach((a) => RL.$('#td-show-' + a.key).addEventListener('change', makeAgents));
  window.addEventListener('resize', () => agents && drawAll());
  makeAgents();
})();
