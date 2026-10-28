'use strict';

// ================= Softmax policy & the log-likelihood trick =================
(() => {
  const host = RL.$('#sm-rows');
  if (!host) return;
  const names = ['🍕 pizza', '🍣 sushi', '🌮 tacos', '🥗 salad'];
  const h = [0.5, 0, -0.5, 1];
  const getTau = RL.range('sm-tau', render, (v) => v.toFixed(2));
  const getAlpha = RL.range('sm-alpha', null, (v) => v.toFixed(2));
  const probs = () => { const t = getTau(); const m = Math.max(...h); const e = h.map((x) => Math.exp((x - m) / t)); const z = e.reduce((a, b) => a + b, 0); return e.map((x) => x / z); };
  function reinforce(a, R) {
    const p = probs(), al = getAlpha();
    for (let b = 0; b < h.length; b++) h[b] += al * R * ((b === a ? 1 : 0) - p[b]);
    render();
    RL.$('#sm-log').innerHTML = `θ ← θ + α·R·∇ln π(${names[a]}) &nbsp;with R = ${R > 0 ? '+1' : '−1'}: ${names[a]} ${R > 0 ? '↑' : '↓'}, all other preferences moved ${R > 0 ? 'down' : 'up'} in proportion to their probability.`;
  }
  function render() {
    const p = probs();
    host.innerHTML = '';
    h.forEach((x, a) => {
      const row = document.createElement('div');
      row.className = 'sm-row';
      row.innerHTML = `<span>${names[a]}</span><div class="sm-bar"><div style="width:${(100 * p[a]).toFixed(1)}%"></div></div><span class="mono">${(100 * p[a]).toFixed(1)}%</span>
        <span><button class="ghost" title="reward +1">👍</button><button class="ghost" title="reward −1">👎</button></span>`;
      const [up, dn] = row.querySelectorAll('button');
      up.addEventListener('click', () => reinforce(a, 1));
      dn.addEventListener('click', () => reinforce(a, -1));
      host.appendChild(row);
    });
    RL.$('#sm-h').textContent = h.map((x) => x.toFixed(2)).join(', ');
  }
  RL.$('#sm-sample').addEventListener('click', () => {
    const p = probs(); let u = Math.random(), a = 0;
    while (u > p[a] && a < p.length - 1) { u -= p[a]; a++; }
    RL.$('#sm-log').innerHTML = `Sampled <b>${names[a]}</b> (p = ${(100 * p[a]).toFixed(1)}%). Did you like it? Use 👍 / 👎.`;
  });
  RL.$('#sm-reset').addEventListener('click', () => { h.splice(0, 4, 0.5, 0, -0.5, 1); render(); });
  render();
})();

// ================= Short corridor with switched actions (Example 13.1) =================
(() => {
  const cv = RL.$('#pg-J');
  if (!cv) return;
  const J = (p) => (2 * p - 4) / (p * (1 - p));
  const curve = [];
  for (let p = 0.02; p <= 0.98 + 1e-9; p += 0.005) curve.push([p, J(p)]);
  let pStar = 0.5, jStar = -Infinity;
  for (let p = 0.01; p < 0.99; p += 0.0001) if (J(p) > jStar) { jStar = J(p); pStar = p; }

  let theta, wBase, wCrit, eps, rets, traj, running = false, raf;
  const getP = RL.range('pg-p', () => drawJ(), (v) => v.toFixed(2));
  const getLA = RL.range('pg-la', null, (v) => `2^${v}`);
  const getLW = RL.range('pg-lw', null, (v) => `2^${v}`);
  const getSpeed = RL.range('pg-speed', null, (v) => `${v} ep/frame`);
  const algoSel = RL.$('#pg-algo');
  const pRight = () => 1 / (1 + Math.exp(-(theta[0] - theta[1])));

  function reset() {
    theta = [0, Math.log(0.95 / 0.05)];
    wBase = 0; wCrit = [0, 0, 0]; eps = 0; rets = []; traj = [[pRight(), J(pRight())]];
    drawJ(); drawRets();
  }
  function envStep(s, right) {
    if (s === 1) return right ? 0 : 2;
    if (right) return s + 1;
    return Math.max(0, s - 1);
  }
  function runEpisode(record) {
    const algo = algoSel.value, aT = Math.pow(2, getLA()), aW = Math.pow(2, getLW());
    let s = 0, t = 0;
    const hist = [];
    while (s !== 3 && t < 1000) {
      const p = pRight();
      const right = Math.random() < p;
      const s2 = envStep(s, right);
      const gl = right ? [1 - p, p - 1] : [-p, p];
      if (algo === 'ac') {
        const vS = wCrit[s], vS2 = s2 === 3 ? 0 : wCrit[s2];
        const delta = -1 + vS2 - vS;
        wCrit[s] += aW * delta;
        theta[0] += aT * delta * gl[0]; theta[1] += aT * delta * gl[1];
      } else hist.push(gl);
      if (record) record.push(s2);
      s = s2; t++;
    }
    if (algo !== 'ac') {
      const T = hist.length;
      hist.forEach((gl, k) => {
        const G = -(T - k);
        let scale = G;
        if (algo === 'reinforce-b') { const d = G - wBase; wBase += aW * d; scale = d; }
        theta[0] += aT * scale * gl[0]; theta[1] += aT * scale * gl[1];
      });
    }
    eps++;
    rets.push(-t);
    if (eps % 5 === 0) traj.push([pRight(), J(pRight())]);
  }
  function drawJ() {
    const p = getP();
    const pr = theta ? pRight() : 0.05;
    RL.lineChart(cv, [
      { data: curve, color: '#6b4fa8', width: 2.5, label: 'J(θ) = v_π(S)' },
      { data: traj || [], color: 'rgba(244,114,182,0.55)', width: 1.5, label: 'agent & its trajectory' },
      { data: [], color: '#3e6fb0', label: 'your slider p' },
    ], {
      xMin: 0, xMax: 1, yMin: -100, yMax: 0, xLabel: 'probability of choosing RIGHT', yLabel: 'value of start state',
      points: [
        { x: 0.05, y: J(0.05), color: '#b8452f', label: 'ε-greedy left', r: 5 },
        { x: 0.95, y: J(0.95), color: '#b8452f', label: 'ε-greedy right', r: 5, align: 'right' },
        { x: pStar, y: jStar, color: '#a8701a', label: `optimum p=${pStar.toFixed(2)}, J=${jStar.toFixed(1)}`, r: 6, below: true },
        { x: p, y: J(p), color: '#3e6fb0', r: 6, ring: true },
        { x: pr, y: J(pr), color: '#c4673f', r: 7 },
      ],
    });
    RL.$('#pg-pr').textContent = pr.toFixed(3);
    RL.$('#pg-jslider').textContent = J(p).toFixed(1);
    RL.$('#pg-eps').textContent = eps || 0;
  }
  function drawRets() {
    RL.lineChart(RL.$('#pg-rets'), [
      { data: RL.smooth(rets || [], 50), x0: 1, color: '#3e6fb0', label: 'return (50-ep avg)' },
    ], { xLabel: 'episode', yLabel: 'G₀', yMin: -100, yMax: 0, hlines: [{ y: jStar, color: '#a8701a', label: 'v* ≈ −11.6' }] });
  }
  function loop() {
    if (!running) return;
    const n = getSpeed();
    for (let i = 0; i < n; i++) runEpisode();
    drawJ(); drawRets();
    raf = requestAnimationFrame(loop);
  }
  RL.$('#pg-run').addEventListener('click', () => {
    running = !running;
    RL.$('#pg-run').textContent = running ? '⏸ Pause' : '▶ Train';
    if (running) loop(); else cancelAnimationFrame(raf);
  });
  RL.$('#pg-reset').addEventListener('click', reset);
  algoSel.addEventListener('change', () => {
    const d = { reinforce: [-13, -6], 'reinforce-b': [-9, -6], ac: [-9, -4] }[algoSel.value];
    const a = RL.$('#pg-la'), b = RL.$('#pg-lw');
    a.value = d[0]; b.value = d[1];
    a.dispatchEvent(new Event('input')); b.dispatchEvent(new Event('input'));
    reset();
  });

  // corridor animation
  const cc = RL.$('#pg-corr');
  let corrPos = 0, corrBusy = false;
  function drawCorr() {
    const { ctx, w, h } = RL.fit(cc);
    const n = 4, cw = (w - 40) / n, y = 20, ch = h - 40;
    const labels = ['S', '⇄ reversed', '', 'G'];
    for (let i = 0; i < n; i++) {
      const x = 20 + i * cw;
      ctx.fillStyle = i === 3 ? '#065f46' : i === 1 ? '#3b1d4a' : '#16203f';
      ctx.fillRect(x + 3, y, cw - 6, ch);
      ctx.fillStyle = '#3d3c39'; ctx.font = '600 13px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(labels[i], x + cw / 2, y + 6);
    }
    const p = theta ? pRight() : 0.05;
    for (let i = 0; i < 3; i++) {
      const x = 20 + (i + 0.5) * cw, yy = y + ch - 16;
      RL.arrow(ctx, x, yy, 1, 0, 12 + 22 * p, `rgba(34,211,238,${0.3 + 0.7 * p})`, 3);
      RL.arrow(ctx, x, yy, -1, 0, 12 + 22 * (1 - p), `rgba(244,114,182,${0.3 + 0.7 * (1 - p)})`, 3);
    }
    const ax = 20 + (corrPos + 0.5) * cw;
    ctx.font = '28px serif'; ctx.textBaseline = 'middle'; ctx.fillText('🤖', ax, y + ch / 2);
  }
  RL.$('#pg-watch').addEventListener('click', () => {
    if (corrBusy) return;
    corrBusy = true;
    const path = [];
    let s = 0, t = 0;
    while (s !== 3 && t < 300) { s = envStep(s, Math.random() < pRight()); path.push(s); t++; }
    corrPos = 0; let k = 0;
    const tick = () => {
      if (k >= path.length) { corrBusy = false; RL.$('#pg-corr-log').textContent = `Reached G in ${path.length} steps (return ${-path.length}).`; setTimeout(() => { corrPos = 0; drawCorr(); }, 800); return; }
      corrPos = path[k++]; drawCorr();
      RL.$('#pg-corr-log').textContent = `step ${k}`;
      setTimeout(tick, 220);
    };
    tick();
  });
  window.addEventListener('resize', () => { drawJ(); drawRets(); drawCorr(); });
  reset();
  drawCorr();
  setInterval(() => { if (running && !corrBusy) drawCorr(); }, 300);
})();
