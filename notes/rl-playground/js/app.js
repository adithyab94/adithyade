'use strict';

const QUIZ = {
  ch1: [
    { q: 'What distinguishes reinforcement learning from supervised learning?', o: ['RL uses neural networks', 'The learner is told the correct action for each situation', 'The learner gets only an evaluative reward signal and must discover good actions by trial and error', 'RL never uses a model of the environment'], a: 2, why: 'RL feedback evaluates the action taken; it does not instruct which action was correct. That forces exploration.' },
    { q: 'Which of these is NOT one of the four main elements of an RL system (Sec. 1.3)?', o: ['Policy', 'Reward signal', 'Value function', 'Loss landscape'], a: 3, why: 'The elements are policy, reward signal, value function and (optionally) a model of the environment.' },
    { q: 'In the tic-tac-toe example, why are exploratory moves excluded from learning updates?', o: ['They are illegal moves', 'Values should estimate winning probability under (mostly) greedy play, not random play', 'They are too expensive to compute', 'The opponent ignores them'], a: 1, why: 'Updating after exploratory moves would make V estimate the value of a different (more random) policy.' },
    { q: 'In a 10-armed bandit, why does ε-greedy beat pure greedy in the long run?', o: ['It pulls the optimal arm more often after enough exploration', 'It has lower variance', 'It needs no value estimates', 'It uses a larger step size'], a: 0, why: 'Greedy often locks onto a suboptimal arm whose early samples looked good; ε-greedy keeps sampling all arms.' },
  ],
  ch3: [
    { q: 'With γ = 0.9 and reward +1 at every step forever, what is the return G?', o: ['0.9', '9', '10', '∞'], a: 2, why: 'G = Σ γᵏ = 1/(1−γ) = 10.' },
    { q: 'The Markov property means…', o: ['Rewards are deterministic', 'The future depends on the past only through the current state (and action)', 'All states are visited infinitely often', 'The policy is stationary'], a: 1, why: 'The state must summarize all relevant history: p(s\',r | s,a) does not depend on earlier states.' },
    { q: 'v_π(s) relates to q_π(s,a) by…', o: ['v_π(s) = maxₐ q_π(s,a)', 'v_π(s) = Σₐ π(a|s) q_π(s,a)', 'v_π(s) = q_π(s, π(s)) + r', 'They are unrelated'], a: 1, why: 'Average the action values under the policy. The max version holds for the optimal v*, q*.' },
    { q: 'In the 5×5 gridworld, why is v_π(A) less than 10 even though leaving A always gives +10?', o: ['Discounting only', 'Because from A\' (bottom row) the random policy often bumps into the edge and gets −1', 'Because A is terminal', 'Rounding'], a: 1, why: 'A teleports you to A\', next to the edge, where the random policy collects negative rewards.' },
    { q: 'The Bellman optimality equation is nonlinear because of…', o: ['the discount factor', 'the max operator', 'the stochastic transitions', 'the reward function'], a: 1, why: 'The max over actions makes it nonlinear, so you can\'t solve it with one linear system as you can for v_π.' },
  ],
  ch4: [
    { q: 'What does DP require that MC and TD do not?', o: ['A discount factor', 'A complete model p(s\',r|s,a) of the environment', 'Episodic tasks', 'Function approximation'], a: 1, why: 'DP backups take expectations over all next states, which requires knowing the dynamics.' },
    { q: 'The policy improvement theorem guarantees that the greedy policy π\' w.r.t. v_π satisfies…', o: ['v_π\' = v_π', 'v_π\'(s) ≥ v_π(s) for all s', 'v_π\'(s) ≤ v_π(s)', 'π\' is optimal immediately'], a: 1, why: 'Greedifying never makes things worse; if it doesn\'t change the value, both are already optimal.' },
    { q: 'Value iteration is equivalent to…', o: ['Policy iteration with one sweep of evaluation between improvements', 'Monte Carlo with exploring starts', 'Q-learning', 'Random search'], a: 0, why: 'It truncates evaluation to a single sweep and folds the max into the update.' },
    { q: '"Generalized Policy Iteration" refers to…', o: ['Running PI on GPUs', 'The interaction of evaluation and improvement processes at any granularity', 'Only asynchronous DP', 'Using a stochastic policy'], a: 1, why: 'Almost all RL methods can be seen as GPI: value and policy push each other toward optimality.' },
    { q: 'In the playground, try "Sutton 4×4" with policy evaluation. What does v_π of the random policy measure there?', o: ['Probability of reaching a corner', 'The negative expected number of steps to termination', 'The number of states', 'Distance to the nearest wall'], a: 1, why: 'With reward −1 per step and γ = 1, v_π(s) = −E[steps until termination].' },
  ],
  ch5: [
    { q: 'Monte Carlo methods estimate values by…', o: ['Bootstrapping from successor estimates', 'Averaging complete sample returns', 'Solving the Bellman equation exactly', 'Gradient descent on a model'], a: 1, why: 'MC waits until the end of an episode and averages observed returns. It does not bootstrap.' },
    { q: 'Why are "exploring starts" needed for MC control with a deterministic policy?', o: ['To reduce variance', 'Otherwise many state–action pairs would never be visited, so their q-values could never be estimated', 'To make episodes shorter', 'Because blackjack requires it'], a: 1, why: 'A deterministic policy only tries one action per state; ES guarantees every (s,a) gets a chance.' },
    { q: 'Ordinary vs weighted importance sampling: which is TRUE?', o: ['Weighted IS is unbiased', 'Ordinary IS can have unbounded variance; weighted IS is biased but usually much lower variance', 'Both have identical error', 'Ordinary IS can only be used on-policy'], a: 1, why: 'The IS experiment in this chapter shows this: weighted IS starts with much lower error.' },
    { q: 'For an on-policy ε-soft method, the policy found is…', o: ['Optimal among all policies', 'Optimal among ε-soft policies', 'Always greedy', 'Random'], a: 1, why: 'Dropping ES by using ε-soft policies means you converge to the best ε-soft policy, not the best overall.' },
  ],
  ch6: [
    { q: 'The TD(0) target for V(Sₜ) is…', o: ['Gₜ', 'Rₜ₊₁ + γ V(Sₜ₊₁)', 'maxₐ Q(Sₜ₊₁, a)', 'Rₜ₊₁'], a: 1, why: 'TD bootstraps: it uses the current estimate of the next state in place of the rest of the return.' },
    { q: 'On the cliff walk with ε = 0.1, why does Sarsa get more reward per episode than Q-learning?', o: ['Sarsa learns faster', 'Q-learning learns the optimal edge path, but ε-exploration makes it fall off the cliff; Sarsa learns a safer path that accounts for its own exploration', 'Q-learning has a bug', 'Sarsa uses a model'], a: 1, why: 'Sarsa is on-policy: it evaluates the ε-greedy policy it actually follows.' },
    { q: 'Q-learning is off-policy because…', o: ['It uses importance sampling', 'Its target uses maxₐ Q(S\',a), the greedy policy, regardless of the action actually taken next', 'It is only used offline', 'It doesn\'t use a policy'], a: 1, why: 'It learns q* directly while following any sufficiently exploratory behaviour policy.' },
    { q: 'In the random walk, batch TD converges to…', o: ['The maximum-likelihood / certainty-equivalence estimate', 'The minimum MSE on the training returns', 'Zero', 'The same as MC always'], a: 0, why: 'Batch MC minimizes squared error on the training data; batch TD finds the values that are exact for the maximum-likelihood model of the Markov process.' },
    { q: 'Expected Sarsa\'s target replaces Q(S\',A\') with…', o: ['maxₐ Q(S\',a)', 'Σₐ π(a|S\') Q(S\',a)', 'V(S)', 'Gₜ'], a: 1, why: 'Taking the expectation over next actions removes the variance due to sampling A\'.' },
  ],
  ch9: [
    { q: 'Why is it called a "semi-gradient" method when using a TD target?', o: ['It uses half the step size', 'The target depends on w, but we ignore that dependence when taking the gradient', 'Only half the features are updated', 'It uses second-order information'], a: 1, why: 'A true gradient would also differentiate the bootstrapped target v̂(S\',w); semi-gradient treats it as a constant.' },
    { q: 'State aggregation is a special case of linear FA where…', o: ['Features are polynomials', 'Each state activates exactly one binary feature (its group)', 'Features are learned', 'All states share one weight'], a: 1, why: 'Its one-hot features give a piecewise-constant v̂, which you can see as the staircase in the widget.' },
    { q: 'Tile coding with many offset tilings gives…', o: ['Exact tabular values', 'Generalization across nearby states with fine discrimination overall', 'Global generalization like Fourier', 'No generalization'], a: 1, why: 'Each tiling is coarse, but the overlapping offsets combine to give fine resolution.' },
    { q: 'The objective VE (value error) is weighted by μ(s) because…', o: ['μ makes it convex', 'With limited capacity we must trade off errors, and we care most about states we visit often', 'It is required for tabular methods', 'μ equals the reward'], a: 1, why: 'With function approximation, making one state more accurate usually makes others less accurate.' },
    { q: 'In Mountain Car, why does the agent explore even with ε = 0?', o: ['Random noise in physics', 'Optimistic initial values: q = 0 while true values are negative, so untried actions look better', 'Tile coding randomizes', 'It doesn\'t explore'], a: 1, why: 'Every visited (s,a) gets pushed below 0, so unvisited ones look relatively attractive.' },
  ],
  ch13: [
    { q: 'Why can a stochastic policy beat any ε-greedy policy in the short-corridor example?', o: ['It uses more memory', 'With identical features for all states, the best policy must randomize; action-value methods can only approximate deterministic choices plus ε noise', 'Because rewards are stochastic', 'It cannot'], a: 1, why: 'Because of function approximation (all states look the same), the optimum is p(right) ≈ 0.59.' },
    { q: 'The policy gradient theorem says ∇J(θ) ∝ …', o: ['Σₛ μ(s) Σₐ q_π(s,a) ∇π(a|s,θ)', 'Σₛ v_π(s)', '∇ maxₐ q(s,a)', 'The gradient of the state distribution'], a: 0, why: 'Crucially, it does not involve the derivative of the state distribution.' },
    { q: 'A baseline b(s) in REINFORCE…', o: ['Biases the gradient', 'Leaves the expected gradient unchanged but can greatly reduce variance', 'Is required for convergence', 'Must depend on the action'], a: 1, why: 'Σ_a b(s) ∇π(a|s) = b(s) ∇1 = 0, so it changes variance, not the expectation.' },
    { q: 'Actor–critic differs from REINFORCE-with-baseline mainly because the critic…', o: ['Is a neural network', 'Is used for bootstrapping (the TD error), introducing bias but reducing variance and allowing online updates', 'Picks actions', 'Is not learned'], a: 1, why: 'Using δ = R + γv̂(S\') − v̂(S) turns the Monte Carlo return into a one-step bootstrapped estimate.' },
    { q: 'For a softmax policy, ∇ ln π(a|s,θ) equals…', o: ['x(s,a) − Σ_b π(b|s,θ) x(s,b)', 'x(s,a)', 'π(a|s)', '1 − π(a|s)'], a: 0, why: 'The feature of the chosen action minus the expected feature under the policy (Eq. 13.9).' },
  ],
};

(() => {
  // ---- quizzes ----
  RL.$$('.quiz[data-quiz]').forEach((box) => {
    const key = box.dataset.quiz;
    const qs = QUIZ[key] || (window.ADV_QUIZ || {})[key] || [];
    let right = 0, answered = 0;
    const score = document.createElement('div');
    score.className = 'score';
    const upd = () => { score.textContent = `Score: ${right}/${qs.length}${answered === qs.length ? (right === qs.length ? ' 🌟 perfect!' : ' — retry with the ↻ button') : ''}`; };
    qs.forEach((item) => {
      const d = document.createElement('div');
      d.className = 'q';
      d.innerHTML = `<p>${item.q}</p><div class="opts"></div><div class="why">💡 ${item.why}</div>`;
      const opts = d.querySelector('.opts');
      item.o.forEach((o, i) => {
        const b = document.createElement('button');
        b.className = 'opt'; b.textContent = o;
        b.addEventListener('click', () => {
          if (d.classList.contains('answered')) return;
          d.classList.add('answered'); answered++;
          if (i === item.a) { right++; b.classList.add('right'); } else { b.classList.add('wrong'); opts.children[item.a].classList.add('right'); }
          upd();
        });
        opts.appendChild(b);
      });
      box.appendChild(d);
    });
    const retry = document.createElement('button');
    retry.textContent = '↻ retry quiz'; retry.className = 'ghost';
    retry.addEventListener('click', () => {
      right = answered = 0;
      RL.$$('.q', box).forEach((q) => { q.classList.remove('answered'); RL.$$('.opt', q).forEach((o) => o.classList.remove('right', 'wrong')); });
      upd();
    });
    const bar = document.createElement('div'); bar.className = 'controls'; bar.append(score, retry);
    box.appendChild(bar);
    upd();
  });

  // ---- flip cards ----
  RL.$$('.flip').forEach((f) => f.addEventListener('click', () => f.classList.toggle('on')));

  // ---- progress ----
  const chapters = RL.$$('section.chapter[data-ch]').map((s) => s.dataset.ch);
  const KEY = 'rl-study-done';
  const done = new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  function refresh() {
    RL.$$('.done-btn').forEach((b) => {
      const on = done.has(b.dataset.ch);
      b.classList.toggle('is-done', on);
      b.textContent = on ? '✓ Studied' : '○ Mark as studied';
    });
    RL.$$('.nav a[data-ch]').forEach((a) => a.classList.toggle('done', done.has(a.dataset.ch)));
    const pct = Math.round(100 * chapters.filter((c) => done.has(c)).length / chapters.length);
    const circ = 2 * Math.PI * 22;
    const fg = RL.$('.ring .fg');
    fg.style.strokeDasharray = circ;
    fg.style.strokeDashoffset = circ * (1 - pct / 100);
    RL.$('.progress-box .pct').textContent = pct + '%';
    localStorage.setItem(KEY, JSON.stringify([...done]));
  }
  RL.$$('.done-btn').forEach((b) => b.addEventListener('click', () => { done.has(b.dataset.ch) ? done.delete(b.dataset.ch) : done.add(b.dataset.ch); refresh(); }));
  refresh();

  // ---- active nav on scroll ----
  const links = RL.$$('.nav a[href^="#"]');
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (e.isIntersecting) links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === '#' + e.target.id));
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  RL.$$('section.chapter, header.hero').forEach((s) => io.observe(s));

  // ---- KaTeX ----
  const renderMath = () => {
    if (window.renderMathInElement) {
      window.renderMathInElement(document.body, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\(', right: '\\)', display: false }], throwOnError: false });
    }
  };
  if (document.readyState === 'complete') renderMath(); else window.addEventListener('load', renderMath);
})();
