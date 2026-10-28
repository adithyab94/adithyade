'use strict';

// ================= Blackjack: MC prediction, MC control (ES), play, importance sampling =================
(() => {
  const root = RL.$('#bj');
  if (!root) return;
  RL.tabs(root);

  const draw = () => Math.min(1 + RL.randint(13), 10);
  function addCard(h, c) {
    h.sum += c;
    if (c === 1 && !h.usable && h.sum + 10 <= 21) { h.sum += 10; h.usable = true; }
    if (h.sum > 21 && h.usable) { h.sum -= 10; h.usable = false; }
    return h;
  }
  function dealerPlay(show) {
    const d = addCard(addCard({ sum: 0, usable: false }, show), draw());
    while (d.sum < 17) addCard(d, draw());
    return d.sum;
  }
  const idx = (u, sum, d) => (u ? 100 : 0) + (sum - 12) * 10 + (d - 1);

  // Plays one episode. policy(sum, dealer, usable) -> 1 hit / 0 stick.
  // Returns {G, visits: [[stateIdx, action]...]}.
  function episode(policy, start) {
    let p, show, firstAction = null;
    if (start) { p = { sum: start.sum, usable: start.usable }; show = start.dealer; firstAction = start.action; }
    else {
      p = addCard(addCard({ sum: 0, usable: false }, draw()), draw());
      show = draw();
      if (p.sum === 21) {
        const d = addCard(addCard({ sum: 0, usable: false }, show), draw());
        return { G: d.sum === 21 ? 0 : 1, visits: [] };
      }
    }
    const visits = [];
    while (p.sum < 12) addCard(p, draw());
    for (;;) {
      const s = idx(p.usable, p.sum, show);
      const a = firstAction !== null ? firstAction : policy(p.sum, show, p.usable);
      firstAction = null;
      visits.push([s, a]);
      if (a === 0) break;
      addCard(p, draw());
      if (p.sum > 21) return { G: -1, visits };
    }
    const ds = dealerPlay(show);
    return { G: ds > 21 || p.sum > ds ? 1 : p.sum === ds ? 0 : -1, visits };
  }

  // ---- heatmap ----
  function heat(cv, values, { policy = false, title = '' } = {}) {
    const { ctx, w, h } = RL.fit(cv);
    const pad = { l: 40, b: 30, t: 22, r: 8 };
    const cw = (w - pad.l - pad.r) / 10, ch = (h - pad.t - pad.b) / 10;
    ctx.font = '600 12px Inter, system-ui'; ctx.fillStyle = '#232220'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(title, pad.l, 3);
    for (let si = 0; si < 10; si++) for (let d = 0; d < 10; d++) {
      const v = values[si * 10 + d];
      const x = pad.l + d * cw, y = pad.t + (9 - si) * ch;
      if (policy) ctx.fillStyle = v === 1 ? '#c9bde3' : v === 0 ? '#335f99' : '#e8ede0';
      else ctx.fillStyle = Number.isFinite(v) ? RL.diverge(v, 1) : '#e8ede0';
      ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
      ctx.fillStyle = 'rgba(35,34,32,0.85)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${Math.min(11, cw * 0.32)}px JetBrains Mono, monospace`;
      if (policy) ctx.fillText(v === 1 ? 'H' : v === 0 ? 'S' : '', x + cw / 2, y + ch / 2);
      else if (Number.isFinite(v) && cw > 30) ctx.fillText(v.toFixed(2), x + cw / 2, y + ch / 2);
    }
    ctx.fillStyle = '#6f6e66'; ctx.font = '11px Inter, system-ui';
    for (let d = 0; d < 10; d++) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(d === 0 ? 'A' : String(d + 1), pad.l + (d + 0.5) * cw, h - pad.b + 4); }
    for (let si = 0; si < 10; si++) { ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(12 + si), pad.l - 6, pad.t + (9.5 - si) * ch); }
    ctx.textAlign = 'center'; ctx.fillText('dealer showing', pad.l + 5 * cw, h - 12);
  }

  // ---- prediction ----
  const pSum = new Float64Array(200), pCnt = new Float64Array(200);
  let pEp = 0;
  const stick20 = (sum) => (sum >= 20 ? 0 : 1);
  function drawPred() {
    const v = (u) => Array.from({ length: 100 }, (_, i) => (pCnt[u * 100 + i] ? pSum[u * 100 + i] / pCnt[u * 100 + i] : NaN));
    heat(RL.$('#bj-pred-u'), v(1), { title: 'Usable ace' });
    heat(RL.$('#bj-pred-n'), v(0), { title: 'No usable ace' });
    RL.$('#bj-pred-ep').textContent = pEp.toLocaleString();
  }
  RL.$$('#bj-pred-btns button[data-n]').forEach((b) => b.addEventListener('click', () => {
    const n = +b.dataset.n;
    RL.chunked(n, 20000, () => {
      const { G, visits } = episode(stick20);
      visits.forEach(([s]) => { pSum[s] += G; pCnt[s]++; });
      pEp++;
    }, drawPred, drawPred);
  }));
  RL.$('#bj-pred-reset').addEventListener('click', () => { pSum.fill(0); pCnt.fill(0); pEp = 0; drawPred(); });

  // ---- control (Monte Carlo ES) ----
  const Q = new Float64Array(400), N = new Float64Array(400);
  const pol = new Int8Array(200);
  let cEp = 0;
  function resetControl() { Q.fill(0); N.fill(0); for (let s = 0; s < 200; s++) pol[s] = (s % 100) >= 80 ? 0 : 1; cEp = 0; }
  resetControl();
  const greedyPol = (sum, d, u) => pol[idx(u, sum, d)];
  function drawCtrl() {
    const polArr = (u) => Array.from({ length: 100 }, (_, i) => pol[u * 100 + i]);
    const vArr = (u) => Array.from({ length: 100 }, (_, i) => { const s = u * 100 + i; return N[2 * s] + N[2 * s + 1] ? Math.max(N[2 * s] ? Q[2 * s] : -Infinity, N[2 * s + 1] ? Q[2 * s + 1] : -Infinity) : NaN; });
    heat(RL.$('#bj-c-pu'), polArr(1), { policy: true, title: 'π* — usable ace' });
    heat(RL.$('#bj-c-pn'), polArr(0), { policy: true, title: 'π* — no usable ace' });
    heat(RL.$('#bj-c-vu'), vArr(1), { title: 'v* — usable ace' });
    heat(RL.$('#bj-c-vn'), vArr(0), { title: 'v* — no usable ace' });
    RL.$('#bj-c-ep').textContent = cEp.toLocaleString();
  }
  RL.$$('#bj-ctrl-btns button[data-n]').forEach((b) => b.addEventListener('click', () => {
    const n = +b.dataset.n;
    RL.chunked(n, 20000, () => {
      const start = { sum: 12 + RL.randint(10), dealer: 1 + RL.randint(10), usable: Math.random() < 0.5, action: RL.randint(2) };
      const { G, visits } = episode(greedyPol, start);
      visits.forEach(([s, a]) => {
        const k = 2 * s + a;
        N[k]++; Q[k] += (G - Q[k]) / N[k];
        pol[s] = Q[2 * s + 1] > Q[2 * s] ? 1 : 0;
      });
      cEp++;
    }, drawCtrl, drawCtrl);
  }));
  RL.$('#bj-ctrl-reset').addEventListener('click', () => { resetControl(); drawCtrl(); });

  // ---- play a hand ----
  const SUITS = ['♠', '♥', '♦', '♣'];
  const FACES = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  let game = null, tally = { w: 0, l: 0, d: 0 };
  function drawCardFace() { const r = 1 + RL.randint(13); return { rank: r, val: Math.min(r, 10), suit: SUITS[RL.randint(4)] }; }
  function cardHTML(c, hidden) {
    if (hidden) return '<div class="pcard back"></div>';
    const red = c.suit === '♥' || c.suit === '♦';
    const r = FACES[c.rank] || c.rank;
    return `<div class="pcard ${red ? 'red' : ''}"><span>${r}${c.suit}</span><span class="big">${c.suit}</span></div>`;
  }
  const handOf = (cards) => cards.reduce((h, c) => addCard(h, c.val), { sum: 0, usable: false });
  function renderGame() {
    const ph = handOf(game.player), dh = handOf(game.dealer);
    RL.$('#bj-dealer').innerHTML = game.dealer.map((c, i) => cardHTML(c, i === 1 && !game.done)).join('');
    RL.$('#bj-player').innerHTML = game.player.map((c) => cardHTML(c)).join('');
    RL.$('#bj-psum').textContent = `${ph.sum}${ph.usable ? ' (soft — usable ace)' : ''}`;
    RL.$('#bj-dsum').textContent = game.done ? String(dh.sum) : `showing ${game.dealer[0].val === 1 ? 'A' : game.dealer[0].val}`;
    RL.$('#bj-hit').disabled = RL.$('#bj-stick').disabled = game.done;
    RL.$('#bj-tally').textContent = `W ${tally.w} · L ${tally.l} · D ${tally.d}`;
    const adv = RL.$('#bj-advice');
    if (!game.done && ph.sum >= 12 && ph.sum <= 21) {
      const s = idx(ph.usable, ph.sum, game.dealer[0].val);
      if (N[2 * s] + N[2 * s + 1] < 20) adv.innerHTML = '🧠 Advisor has no experience here yet — train it in the <b>MC control</b> tab.';
      else {
        const qh = Q[2 * s + 1], qs = Q[2 * s];
        adv.innerHTML = `🧠 Advisor (learned by MC-ES over ${cEp.toLocaleString()} episodes):<br>q(s, <b>hit</b>) = <span class="mono">${qh.toFixed(3)}</span> &nbsp; q(s, <b>stick</b>) = <span class="mono">${qs.toFixed(3)}</span><br>→ suggests <b style="color:var(--amber)">${qh > qs ? 'HIT' : 'STICK'}</b>`;
      }
    } else if (!game.done) adv.textContent = '🧠 Sum below 12: always hit, you cannot bust.';
    else adv.innerHTML = game.msg;
  }
  function newHand() {
    game = { player: [drawCardFace(), drawCardFace()], dealer: [drawCardFace(), drawCardFace()], done: false };
    const ph = handOf(game.player);
    if (ph.sum === 21) {
      const dh = handOf(game.dealer);
      finish(dh.sum === 21 ? 0 : 1, dh.sum === 21 ? 'Both natural — draw.' : '🎉 Natural blackjack! +1');
      return;
    }
    renderGame();
  }
  function finish(r, msg) {
    game.done = true;
    if (r > 0) tally.w++; else if (r < 0) tally.l++; else tally.d++;
    game.msg = `<b style="color:${r > 0 ? 'var(--green)' : r < 0 ? 'var(--red)' : 'var(--amber)'}">${msg}</b> &nbsp;Reward = ${r > 0 ? '+' : ''}${r}`;
    renderGame();
  }
  RL.$('#bj-hit').addEventListener('click', () => {
    game.player.push(drawCardFace());
    if (handOf(game.player).sum > 21) finish(-1, '💥 Bust!'); else renderGame();
  });
  RL.$('#bj-stick').addEventListener('click', () => {
    while (handOf(game.dealer).sum < 17) game.dealer.push(drawCardFace());
    const p = handOf(game.player).sum, d = handOf(game.dealer).sum;
    if (d > 21) finish(1, 'Dealer busts — you win!');
    else if (p > d) finish(1, `You win ${p} vs ${d}!`);
    else if (p === d) finish(0, `Push at ${p}.`);
    else finish(-1, `Dealer wins ${d} vs ${p}.`);
  });
  RL.$('#bj-new').addEventListener('click', newHand);

  // ---- off-policy importance sampling (Example 5.4) ----
  RL.$('#is-run').addEventListener('click', () => {
    const runs = 100, EPS = 10000, TRUE = -0.27726;
    const checkpoints = [];
    for (let e = 1; e <= EPS; e = Math.ceil(e * 1.15)) checkpoints.push(e);
    if (checkpoints[checkpoints.length - 1] !== EPS) checkpoints.push(EPS);
    const ord = new Float64Array(checkpoints.length), wtd = new Float64Array(checkpoints.length);
    RL.$('#is-status').textContent = 'running…';
    RL.chunked(runs, 5, () => {
      let sumO = 0, sumW = 0, sumRho = 0, ci = 0;
      for (let e = 1; e <= EPS; e++) {
        const p = { sum: 13, usable: true };
        let rho = 1, G;
        for (;;) {
          const a = Math.random() < 0.5 ? 1 : 0;
          rho *= (a === (p.sum >= 20 ? 0 : 1) ? 1 : 0) / 0.5;
          if (a === 0) { const ds = dealerPlay(2); G = ds > 21 || p.sum > ds ? 1 : p.sum === ds ? 0 : -1; break; }
          addCard(p, draw());
          if (p.sum > 21) { G = -1; break; }
        }
        sumO += rho * G; sumW += rho * G; sumRho += rho;
        if (e === checkpoints[ci]) {
          const vo = sumO / e, vw = sumRho > 0 ? sumW / sumRho : 0;
          ord[ci] += (vo - TRUE) ** 2; wtd[ci] += (vw - TRUE) ** 2; ci++;
        }
      }
    }, (i) => (RL.$('#is-status').textContent = `run ${i}/${runs}`), () => {
      RL.$('#is-status').textContent = `done — ${runs} runs × ${EPS.toLocaleString()} episodes. True value ≈ ${TRUE}`;
      isSeries = [
        { data: checkpoints.map((e, i) => [e, ord[i] / runs]), color: '#c4673f', label: 'ordinary IS' },
        { data: checkpoints.map((e, i) => [e, wtd[i] / runs]), color: '#3e6fb0', label: 'weighted IS' },
      ];
      drawIS();
    });
  });

  let isSeries = null;
  function drawIS() {
    const o = { logX: true, xMin: 1, xMax: 10000, yMin: 0, xLabel: 'episodes (log scale)', yLabel: 'mean squared error' };
    RL.lineChart(RL.$('#is-chart'), isSeries || [], isSeries ? o : { ...o, yMax: 5 });
  }
  drawIS();
  drawPred(); drawCtrl(); newHand();
  root.addEventListener('tabchange', () => { drawPred(); drawCtrl(); drawIS(); });
})();
