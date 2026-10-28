'use strict';

// ================= k-armed bandit: you vs the agent =================
(() => {
  const K = 10, BUDGET = 50;
  const row = RL.$('#bandit-row');
  if (!row) return;
  let q, you, agent, cfg, revealed, yourCurve, agentCurve;

  const methodSel = RL.$('#bandit-method');
  const getEps = RL.range('bandit-eps', null, (v) => v.toFixed(2));

  function newAgent(c) {
    return { Q: new Array(K).fill(c.method === 'opt' ? 5 : 0), N: new Array(K).fill(0), t: 0, total: 0 };
  }
  function selectAction(ag, c) {
    if (c.method === 'ucb') {
      for (let a = 0; a < K; a++) if (ag.N[a] === 0) return a;
      const u = ag.Q.map((v, a) => v + c.c * Math.sqrt(Math.log(ag.t + 1) / ag.N[a]));
      return RL.argmaxRandom(u);
    }
    if (Math.random() < c.eps) return RL.randint(K);
    return RL.argmaxRandom(ag.Q);
  }
  function learn(ag, a, r, c) {
    ag.N[a]++; ag.t++; ag.total += r;
    const step = c.alpha ? c.alpha : 1 / ag.N[a];
    ag.Q[a] += step * (r - ag.Q[a]);
  }
  function currentCfg() {
    const m = methodSel.value;
    if (m === 'ucb') return { method: 'ucb', c: 2 };
    if (m === 'opt') return { method: 'opt', eps: 0, alpha: 0.1 };
    return { method: 'eps', eps: getEps() };
  }

  function reset() {
    q = Array.from({ length: K }, () => RL.randn());
    cfg = currentCfg();
    you = { N: new Array(K).fill(0), S: new Array(K).fill(0), total: 0, t: 0 };
    agent = newAgent(cfg);
    revealed = false; yourCurve = [0]; agentCurve = [0];
    render();
    RL.$('#bandit-log').textContent = 'Pick a machine! You both get the same 10 machines and 50 pulls each.';
  }

  function render() {
    row.innerHTML = '';
    const best = q.indexOf(Math.max(...q));
    for (let a = 0; a < K; a++) {
      const d = document.createElement('div');
      d.className = 'arm' + (revealed && a === best ? ' best' : '');
      const avg = you.N[a] ? (you.S[a] / you.N[a]).toFixed(2) : '–';
      d.innerHTML = `<span class="agentdot" id="adot${a}"></span><div class="slot">🎰</div><div class="nm">arm ${a + 1}</div>
        <div class="avg">${avg}</div><div class="cnt">you ×${you.N[a]} · bot ×${agent.N[a]}</div>
        <div class="true">${revealed ? 'q*=' + q[a].toFixed(2) : ''}</div>`;
      d.addEventListener('click', () => pull(a, d));
      row.appendChild(d);
    }
    RL.$('#b-you-total').textContent = you.total.toFixed(1);
    RL.$('#b-you-n').textContent = `${you.t}/${BUDGET}`;
    RL.$('#b-ag-total').textContent = agent.total.toFixed(1);
    RL.$('#b-ag-best').textContent = revealed ? `arm ${best + 1}` : '???';
    RL.lineChart(RL.$('#bandit-race'), [
      { data: yourCurve, color: '#3e6fb0', label: 'you' },
      { data: agentCurve, color: '#c4673f', label: `bot (${methodSel.options[methodSel.selectedIndex].text})` },
    ], { xLabel: 'pull', yLabel: 'cumulative reward', xMin: 0, xMax: BUDGET });
  }

  function pull(a, elm) {
    if (you.t >= BUDGET) return;
    const r = q[a] + RL.randn();
    you.N[a]++; you.S[a] += r; you.total += r; you.t++;
    const aa = selectAction(agent, cfg);
    const ra = q[aa] + RL.randn();
    learn(agent, aa, ra, cfg);
    yourCurve.push(you.total); agentCurve.push(agent.total);
    if (you.t >= BUDGET) revealed = true;
    render();
    const el2 = row.children[a];
    el2.classList.add(r >= 0 ? 'flash-pos' : 'flash-neg');
    row.children[aa].querySelector('.agentdot').classList.add('on');
    const verdict = you.t >= BUDGET
      ? (you.total > agent.total ? ' 🏆 You beat the bot!' : ' 🤖 The bot wins this round.') + ' True values revealed.'
      : '';
    RL.$('#bandit-log').innerHTML = `You pulled arm ${a + 1} → <b style="color:${r >= 0 ? '#2f7d5f' : '#b8452f'}">${r.toFixed(2)}</b>. Bot pulled arm ${aa + 1} → ${ra.toFixed(2)}.${verdict}`;
  }

  RL.$('#bandit-new').addEventListener('click', reset);
  RL.$('#bandit-reveal').addEventListener('click', () => { revealed = true; render(); });
  methodSel.addEventListener('change', reset);
  RL.$('#bandit-eps').addEventListener('change', reset);
  reset();

  // ---- 10-armed testbed experiment (Fig 2.2 style) ----
  RL.$('#bx-run').addEventListener('click', () => {
    const runs = +RL.$('#bx-runs').value, T = 1000;
    const configs = [
      { label: 'greedy ε=0', method: 'eps', eps: 0, color: '#2f7d5f' },
      { label: 'ε=0.01', method: 'eps', eps: 0.01, color: '#c4673f' },
      { label: 'ε=0.1', method: 'eps', eps: 0.1, color: '#3e6fb0' },
      { label: 'UCB c=2', method: 'ucb', c: 2, color: '#a8701a' },
      { label: 'optimistic Q₀=5', method: 'opt', eps: 0, alpha: 0.1, color: '#6b4fa8' },
    ];
    const R = configs.map(() => new Float64Array(T));
    const O = configs.map(() => new Float64Array(T));
    RL.$('#bx-status').textContent = 'running…';
    RL.chunked(runs, 10, () => {
      const qs = Array.from({ length: K }, () => RL.randn());
      const best = qs.indexOf(Math.max(...qs));
      configs.forEach((c, ci) => {
        const ag = newAgent(c);
        for (let t = 0; t < T; t++) {
          const a = selectAction(ag, c);
          const r = qs[a] + RL.randn();
          learn(ag, a, r, c);
          R[ci][t] += r; if (a === best) O[ci][t] += 1;
        }
      });
    }, (i) => { RL.$('#bx-status').textContent = `run ${i}/${runs}`; }, () => {
      RL.$('#bx-status').textContent = `done — averaged over ${runs} random bandit problems`;
      RL.lineChart(RL.$('#bx-reward'), configs.map((c, ci) => ({ data: RL.smooth([...R[ci]].map((v) => v / runs), 5), color: c.color, label: c.label, width: 1.6 })), { xLabel: 'steps', yLabel: 'average reward', yMin: 0 });
      RL.lineChart(RL.$('#bx-opt'), configs.map((c, ci) => ({ data: RL.smooth([...O[ci]].map((v) => 100 * v / runs), 5), color: c.color, label: c.label, width: 1.6 })), { xLabel: 'steps', yLabel: '% optimal action', yMin: 0, yMax: 100 });
    });
  });
  RL.lineChart(RL.$('#bx-reward'), [], { xLabel: 'steps', yLabel: 'average reward', xMax: 1000, yMin: 0, yMax: 1.6 });
  RL.lineChart(RL.$('#bx-opt'), [], { xLabel: 'steps', yLabel: '% optimal action', xMax: 1000, yMin: 0, yMax: 100 });
})();

// ================= Tic-tac-toe value-function learner (Section 1.5) =================
(() => {
  const boardEl = RL.$('#ttt');
  if (!boardEl) return;
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const V = new Map();
  const hist = { win: [], draw: [], loss: [] };
  let gamesTrained = 0;

  function winner(b) {
    for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    return b.includes(0) ? 0 : 3;
  }
  function winLine(b) {
    for (const L of LINES) if (b[L[0]] && b[L[0]] === b[L[1]] && b[L[0]] === b[L[2]]) return L;
    return null;
  }
  function val(b) {
    const k = b.join('');
    let v = V.get(k);
    if (v === undefined) {
      const w = winner(b);
      v = w === 1 ? 1 : w === 2 ? 0 : w === 3 ? 0.5 : 0.5;
      V.set(k, v);
    }
    return v;
  }
  const empties = (b) => b.reduce((acc, v, i) => (v === 0 ? (acc.push(i), acc) : acc), []);

  function agentChoose(b, eps) {
    const moves = empties(b);
    if (Math.random() < eps) return { move: moves[RL.randint(moves.length)], explored: true };
    const vals = moves.map((m) => { b[m] = 1; const v = val(b); b[m] = 0; return v; });
    return { move: moves[RL.argmaxRandom(vals)], explored: false };
  }
  function opponentMove(b, kind) {
    const moves = empties(b);
    if (kind === 'smart') {
      for (const who of [2, 1]) {
        for (const m of moves) { b[m] = who; const w = winner(b); b[m] = 0; if (w === who) return m; }
      }
      if (b[4] === 0 && Math.random() < 0.5) return 4;
    }
    return moves[RL.randint(moves.length)];
  }

  function update(prevKey, target, alpha) {
    const old = V.get(prevKey);
    V.set(prevKey, old + alpha * (target - old));
  }

  function playTrainingGame(alpha, eps, opp) {
    const b = new Array(9).fill(0);
    let prev = null;
    for (;;) {
      const { move, explored } = agentChoose(b, eps);
      b[move] = 1;
      const v = val(b);
      if (prev !== null && !explored) update(prev, v, alpha);
      prev = b.join('');
      const w = winner(b);
      if (w) return w;
      b[opponentMove(b, opp)] = 2;
      const w2 = winner(b);
      if (w2 === 2) { update(prev, 0, alpha); return 2; }
      if (w2 === 3) { update(prev, 0.5, alpha); return 3; }
    }
  }

  const getAlpha = RL.range('ttt-alpha', null, (v) => v.toFixed(2));
  const getEps = RL.range('ttt-eps', null, (v) => v.toFixed(2));

  function drawHist() {
    RL.lineChart(RL.$('#ttt-chart'), [
      { data: hist.win, color: '#2f7d5f', label: 'win %', dx: 500, x0: 500 },
      { data: hist.draw, color: '#a8701a', label: 'draw %', dx: 500, x0: 500 },
      { data: hist.loss, color: '#b8452f', label: 'loss %', dx: 500, x0: 500 },
    ], { xLabel: 'training games', yLabel: '% of last 500 games', yMin: 0, yMax: 100, xMin: 0 });
    RL.$('#ttt-states').textContent = V.size.toLocaleString();
    RL.$('#ttt-games').textContent = gamesTrained.toLocaleString();
  }

  function train(n) {
    const opp = RL.$('#ttt-opp').value;
    const btns = RL.$$('#ttt-train-controls button');
    btns.forEach((b) => (b.disabled = true));
    let w = 0, d = 0, l = 0;
    RL.chunked(n, 500, () => {
      const r = playTrainingGame(getAlpha(), getEps(), opp);
      if (r === 1) w++; else if (r === 2) l++; else d++;
      gamesTrained++;
      if (gamesTrained % 500 === 0) {
        hist.win.push(100 * w / 500); hist.draw.push(100 * d / 500); hist.loss.push(100 * l / 500);
        w = d = l = 0;
      }
    }, drawHist, () => { btns.forEach((b) => (b.disabled = false)); drawHist(); });
  }
  RL.$$('#ttt-train-controls button[data-n]').forEach((b) => b.addEventListener('click', () => train(+b.dataset.n)));
  RL.$('#ttt-reset').addEventListener('click', () => {
    V.clear(); gamesTrained = 0; hist.win = []; hist.draw = []; hist.loss = []; drawHist(); newGame();
  });

  // ---- play vs human ----
  let board, prevKey, over, score = { you: 0, bot: 0, draw: 0 };
  const cells = [];
  for (let i = 0; i < 9; i++) {
    const c = document.createElement('div');
    c.className = 'cell';
    c.addEventListener('click', () => humanMove(i));
    boardEl.appendChild(c);
    cells.push(c);
  }
  function renderBoard(thoughts) {
    const wl = winLine(board) || [];
    board.forEach((v, i) => {
      const c = cells[i];
      c.className = 'cell' + (v === 1 ? ' x' : v === 2 ? ' o' : '') + (wl.includes(i) ? ' win' : '');
      c.innerHTML = v === 1 ? '✕' : v === 2 ? '◯' : '';
      if (!v && thoughts && thoughts[i] !== undefined) {
        const p = thoughts[i];
        c.innerHTML = `<span class="vv" style="color:${RL.seq(p)}">${(100 * p).toFixed(0)}%</span>`;
        c.style.background = `rgba(139,92,246,${0.08 + 0.35 * p})`;
      } else c.style.background = '';
    });
    RL.$('#ttt-score').textContent = `You ${score.you} · Bot ${score.bot} · Draw ${score.draw}`;
  }
  function thoughtsFor(b) {
    const t = {};
    empties(b).forEach((m) => { b[m] = 1; t[m] = val(b); b[m] = 0; });
    return t;
  }
  function botTurn() {
    const t = thoughtsFor(board);
    renderBoard(t);
    RL.$('#ttt-msg').textContent = '🤖 Bot is thinking… (numbers = its estimated probability of winning after each move)';
    setTimeout(() => {
      const { move } = agentChoose(board, 0);
      board[move] = 1;
      const v = val(board);
      if (RL.$('#ttt-learn').checked && prevKey) update(prevKey, v, getAlpha());
      prevKey = board.join('');
      const w = winner(board);
      if (w) return finish(w);
      renderBoard();
      RL.$('#ttt-msg').textContent = 'Your move (you are ◯).';
    }, 750);
  }
  function humanMove(i) {
    if (over || board[i] !== 0 || board.filter((x) => x).length % 2 === 0) return;
    board[i] = 2;
    const w = winner(board);
    if (w === 2) { if (RL.$('#ttt-learn').checked && prevKey) update(prevKey, 0, getAlpha()); return finish(2); }
    if (w === 3) { if (RL.$('#ttt-learn').checked && prevKey) update(prevKey, 0.5, getAlpha()); return finish(3); }
    botTurn();
  }
  function finish(w) {
    over = true;
    if (w === 1) score.bot++; else if (w === 2) score.you++; else score.draw++;
    renderBoard();
    RL.$('#ttt-msg').textContent = w === 1 ? '🤖 Bot wins! Train it less if you want a chance…' : w === 2 ? '🎉 You win! The bot just learned that afterstate is bad.' : '🤝 Draw.';
  }
  function newGame() {
    board = new Array(9).fill(0); prevKey = null; over = false;
    renderBoard();
    botTurn();
  }
  RL.$('#ttt-new').addEventListener('click', newGame);
  drawHist();
  newGame();
})();

// ================= hero background: drifting value field =================
(() => {
  const c = RL.$('#hero-canvas');
  if (!c) return;
  let t = 0;
  function frame() {
    const { ctx, w, h } = RL.fit(c);
    const n = 28, cw = w / n, rows = Math.ceil(h / cw);
    for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) {
      const v = 0.5 + 0.5 * Math.sin(i * 0.35 + t) * Math.cos(j * 0.4 - t * 0.7);
      ctx.fillStyle = RL.seq(v);
      ctx.globalAlpha = 0.35 * v;
      ctx.fillRect(i * cw + 1, j * cw + 1, cw - 2, cw - 2);
    }
    ctx.globalAlpha = 1;
    t += 0.01;
    requestAnimationFrame(frame);
  }
  c.dataset.h = c.parentElement.clientHeight;
  frame();
})();
