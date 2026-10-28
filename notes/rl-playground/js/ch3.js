'use strict';

// ================= Discounted return calculator =================
(() => {
  const wrap = RL.$('#ret-chips');
  if (!wrap) return;
  const CYCLE = [0, 1, -1, 5, 10, -5];
  const R = [0, 0, 1, 0, -1, 0, 0, 5, 0, 0, 0, 10];
  const getG = RL.range('ret-gamma', render, (v) => v.toFixed(2));

  function render() {
    const g = getG();
    const G = new Array(R.length + 1).fill(0);
    for (let t = R.length - 1; t >= 0; t--) G[t] = R[t] + g * G[t + 1];
    wrap.innerHTML = '';
    R.forEach((r, i) => {
      const d = document.createElement('div');
      d.className = 'rchip';
      d.style.background = RL.diverge(r, 10);
      d.innerHTML = `<small>R<sub>${i + 1}</sub></small>${r > 0 ? '+' : ''}${r}<span class="g">G<sub>${i}</sub>=${G[i].toFixed(2)}</span>`;
      d.title = 'click to change reward';
      d.addEventListener('click', () => { R[i] = CYCLE[(CYCLE.indexOf(R[i]) + 1) % CYCLE.length]; render(); });
      wrap.appendChild(d);
    });
    RL.$('#ret-G').textContent = G[0].toFixed(3);
    RL.$('#ret-horizon').textContent = g < 1 ? (1 / (1 - g)).toFixed(1) + ' steps' : '∞';
    const contrib = R.map((r, k) => Math.pow(g, k) * r);
    const ymax = Math.max(1, ...contrib.map(Math.abs));
    RL.lineChart(RL.$('#ret-chart'), [
      { data: R.map((_, k) => [k + 0.5, Math.pow(g, k) * ymax]), color: 'rgba(251,191,36,0.7)', dash: [5, 4], label: `γᵏ (scaled)` },
    ], {
      xMin: 0, xMax: R.length, yMin: -ymax, yMax: ymax, xLabel: 'k (steps into the future)', yLabel: 'γᵏ · R',
      bars: contrib.map((c, k) => ({ x: k + 0.15, w: 0.7, y: c, color: c >= 0 ? 'rgba(52,211,153,0.8)' : 'rgba(248,113,113,0.8)' })),
      hlines: [{ y: 0, color: 'rgba(35,34,32,0.3)', dash: [] }],
    });
  }
  render();
})();

// ================= Gridworld Bellman explorer (Example 3.5 / Fig 3.2) =================
(() => {
  const cv = RL.$('#bell-grid');
  if (!cv) return;
  const N = 5, S = N * N;
  const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1], ANAME = ['↑ north', '→ east', '↓ south', '← west'];
  const A = 1, Ap = 21, B = 3, Bp = 13;
  let mode = 'pi', sel = 7, vPi, vStar;
  const getGamma = RL.range('bell-gamma', solve, (v) => v.toFixed(2));
  const getRA = RL.range('bell-ra', solve, (v) => '+' + v);
  const getRB = RL.range('bell-rb', solve, (v) => '+' + v);

  function step(s, a) {
    if (s === A) return [Ap, getRA()];
    if (s === B) return [Bp, getRB()];
    const r = Math.floor(s / N) + DR[a], c = (s % N) + DC[a];
    if (r < 0 || r >= N || c < 0 || c >= N) return [s, -1];
    return [r * N + c, 0];
  }
  function solve() {
    const g = getGamma();
    vPi = new Float64Array(S); vStar = new Float64Array(S);
    for (let it = 0; it < 5000; it++) {
      let d = 0;
      for (let s = 0; s < S; s++) {
        let v = 0, m = -Infinity;
        for (let a = 0; a < 4; a++) {
          const [s2, r] = step(s, a);
          v += 0.25 * (r + g * vPi[s2]);
          m = Math.max(m, r + g * vStar[s2]);
        }
        d = Math.max(d, Math.abs(v - vPi[s]), Math.abs(m - vStar[s]));
        vPi[s] = v; vStar[s] = m;
      }
      if (d < 1e-10) break;
    }
    draw(); explain();
  }
  function qOf(s, V) {
    const g = getGamma();
    return [0, 1, 2, 3].map((a) => { const [s2, r] = step(s, a); return { a, s2, r, q: r + g * V[s2] }; });
  }
  function draw() {
    cv.dataset.h = cv.clientWidth || 420;
    const { ctx, w } = RL.fit(cv);
    const cs = w / N;
    const V = mode === 'pi' ? vPi : vStar;
    const maxAbs = Math.max(...V.map(Math.abs));
    const qs = qOf(sel, V);
    const nbrs = new Set(qs.map((x) => x.s2));
    for (let s = 0; s < S; s++) {
      const x = (s % N) * cs, y = Math.floor(s / N) * cs;
      ctx.fillStyle = RL.diverge(V[s], maxAbs);
      ctx.fillRect(x + 2, y + 2, cs - 4, cs - 4);
      if (nbrs.has(s) && s !== sel) { ctx.strokeStyle = '#3e6fb0'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(x + 4, y + 4, cs - 8, cs - 8); ctx.setLineDash([]); }
      if (s === sel) { ctx.strokeStyle = '#a8701a'; ctx.lineWidth = 3; ctx.strokeRect(x + 3, y + 3, cs - 6, cs - 6); }
      ctx.fillStyle = '#232220'; ctx.font = `700 ${cs * 0.2}px Inter, system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(V[s].toFixed(1), x + cs / 2, y + cs / 2);
      const lab = { [A]: 'A', [Ap]: "A'", [B]: 'B', [Bp]: "B'" }[s];
      if (lab) { ctx.font = `700 ${cs * 0.15}px Inter, system-ui, sans-serif`; ctx.fillStyle = '#a8701a'; ctx.fillText(lab, x + cs * 0.18, y + cs * 0.18); }
      if (mode === 'star') {
        const q = qOf(s, vStar), m = Math.max(...q.map((z) => z.q));
        q.forEach((z) => { if (m - z.q < 1e-6) RL.arrow(ctx, x + cs / 2 + DC[z.a] * cs * 0.18, y + cs / 2 + DR[z.a] * cs * 0.18, DC[z.a], DR[z.a], cs * 0.16, 'rgba(35,34,32,0.85)', 2); });
      }
    }
    // teleport arcs
    ctx.strokeStyle = 'rgba(251,191,36,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    [[A, Ap], [B, Bp]].forEach(([s1, s2]) => {
      const x1 = (s1 % N + 0.5) * cs, y1 = (Math.floor(s1 / N) + 0.75) * cs, x2 = (s2 % N + 0.5) * cs, y2 = (Math.floor(s2 / N) + 0.25) * cs;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(x1 + cs * 0.55, (y1 + y2) / 2, x2, y2); ctx.stroke();
    });
    ctx.setLineDash([]);
  }
  function explain() {
    const g = getGamma();
    const V = mode === 'pi' ? vPi : vStar;
    const qs = qOf(sel, V);
    const r = Math.floor(sel / N), c = sel % N;
    let html = `<span class="hl">state (${r},${c})</span>  γ = ${g.toFixed(2)}\n\n`;
    if (mode === 'pi') {
      html += `v<sub>π</sub>(s) = Σ<sub>a</sub> π(a|s) [ r + γ v<sub>π</sub>(s') ]     (π = uniform random)\n\n`;
      qs.forEach((x) => { html += `  ${ANAME[x.a].padEnd(8)}  ¼ × ( <span class="${x.r < 0 ? 'r' : x.r > 0 ? 'g' : ''}">${x.r >= 0 ? '+' : ''}${x.r}</span> + ${g.toFixed(2)} × <span class="c">${V[x.s2].toFixed(2)}</span> ) = ${(0.25 * x.q).toFixed(3)}\n`; });
      const sum = qs.reduce((a, x) => a + 0.25 * x.q, 0);
      html += `\n  sum = <span class="hl">${sum.toFixed(3)}</span>   ✓ matches v<sub>π</sub>(s) = ${V[sel].toFixed(3)}`;
    } else {
      html += `v<sub>*</sub>(s) = max<sub>a</sub> [ r + γ v<sub>*</sub>(s') ]\n\n`;
      const m = Math.max(...qs.map((x) => x.q));
      qs.forEach((x) => { const b = m - x.q < 1e-6; html += `  ${b ? '<span class="hl">' : ''}${ANAME[x.a].padEnd(8)}  ${x.r >= 0 ? '+' : ''}${x.r} + ${g.toFixed(2)} × ${V[x.s2].toFixed(2)} = ${x.q.toFixed(3)}${b ? '  ← max</span>' : ''}\n`; });
      html += `\n  max = <span class="hl">${m.toFixed(3)}</span>   ✓ matches v<sub>*</sub>(s) = ${V[sel].toFixed(3)}`;
    }
    if (sel === A || sel === B) html += `\n\n  <span class="g">Every action from ${sel === A ? 'A teleports to A\'' : 'B teleports to B\''} with reward +${sel === A ? getRA() : getRB()}.</span>`;
    RL.$('#bell-explain').innerHTML = html;
  }
  cv.addEventListener('click', (e) => {
    const rect = cv.getBoundingClientRect();
    const cs = rect.width / N;
    sel = Math.floor((e.clientY - rect.top) / cs) * N + Math.floor((e.clientX - rect.left) / cs);
    draw(); explain();
  });
  RL.$$('#bell-mode button').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    RL.$$('#bell-mode button').forEach((x) => x.classList.toggle('sel', x === b));
    draw(); explain();
  }));
  window.addEventListener('resize', draw);
  solve();
})();

// ================= Recycling robot (Example 3.3) =================
(() => {
  const root = RL.$('#robot');
  if (!root) return;
  const ids = ['rob-alpha', 'rob-beta', 'rob-rs', 'rob-rw', 'rob-gamma'];
  const get = {};
  ids.forEach((id) => { get[id] = RL.range(id, () => solve(), (v) => (id === 'rob-rs' || id === 'rob-rw' ? v.toFixed(1) : v.toFixed(2))); });

  function solve() {
    const a = get['rob-alpha'](), b = get['rob-beta'](), rs = get['rob-rs'](), rw = get['rob-rw'](), g = get['rob-gamma']();
    let vh = 0, vl = 0, qh, ql;
    for (let i = 0; i < 20000; i++) {
      qh = { search: rs + g * (a * vh + (1 - a) * vl), wait: rw + g * vh };
      ql = { search: b * (rs + g * vl) + (1 - b) * (-3 + g * vh), wait: rw + g * vl, recharge: g * vh };
      const nh = Math.max(...Object.values(qh)), nl = Math.max(...Object.values(ql));
      const d = Math.abs(nh - vh) + Math.abs(nl - vl);
      vh = nh; vl = nl;
      if (d < 1e-10) break;
    }
    render('rob-high', 'high', qh, vh);
    render('rob-low', 'low', ql, vl);
  }
  function render(id, name, q, v) {
    const el = RL.$('#' + id);
    const vals = Object.values(q), m = Math.max(...vals), mn = Math.min(...vals, 0);
    el.innerHTML = `<h4>🔋 battery <b>${name}</b> &nbsp;<span class="mono" style="color:var(--muted)">v* = ${v.toFixed(2)}</span></h4>` +
      Object.entries(q).map(([k, x]) => {
        const pct = m - mn > 0 ? (100 * (x - mn) / (m - mn)) : 100;
        return `<div class="qrow ${m - x < 1e-9 ? 'best' : ''}"><span>${k}</span><div class="bar"><div style="width:${Math.max(4, pct)}%"></div></div><span class="mono">${x.toFixed(2)}</span></div>`;
      }).join('');
  }
  solve();
})();
