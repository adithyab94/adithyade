/* Stage 10 — Evaluation. Schema: MAINTENANCE.md */
window.PAI = window.PAI || {}; PAI.stages = PAI.stages || {};
PAI.stages["stage-10"] = {
  id: "stage-10", num: "10", title: "Evaluation", short: "Evaluation",
  version: "1.0.0", last_verified: "2026-10-07",
  upstream: [
    { id: "stage-07", what: "checkpoints and policy contracts" },
    { id: "stage-08", what: "RL-tuned candidates" },
    { id: "stage-04", what: "human-verified success labels; success detectors with known error rates" },
    { id: "stage-05", what: "frozen sim benchmark environments" },
    { id: "stage-06", what: "real2sim environments with measured sim–real correlation" }
  ],
  downstream: [
    { id: "stage-11", what: "approved checkpoint for optimization (and re-eval after compression)" },
    { id: "stage-12", what: "release gate decision and rollout plan inputs" },
    { id: "stage-07", what: "failure analysis that drives retraining (feedback loop)" },
    { id: "stage-14", what: "evidence for the safety case and AI Act / Machinery documentation" }
  ],
  handoff_short: "Eval report (per-axis success with confidence intervals, failure-mode breakdown, safety metrics, sim–real correlation) + release gate decision",
  purpose: "Measure what a policy can and cannot do, with enough statistical confidence to make decisions: which checkpoint to ship, whether a change helped, where it fails, and whether it is safe. Evaluation is the most under-engineered stage in robot learning and the one that determines whether every other stage is improving.",
  interface: {
    inputs: [
      { name: "Candidate checkpoints", format: "Checkpoint + `policy.yaml`", rate: "Per training run / RL cycle", from: "[[s:07]], [[s:08]]" },
      { name: "Eval environments", format: "Frozen sim envs (hash), real2sim scenes, real test cells with fixture-defined initial conditions", rate: "Versioned", from: "[[s:05]], [[s:06]]" },
      { name: "Ground truth", format: "Human success labels; calibrated detectors", rate: "Per rollout", from: "[[s:04]]" }
    ],
    outputs: [
      { name: "Eval report", format: "JSON + HTML: success per axis with 95 % CI, subtask success, failure-code histogram, cycle time, interventions, safety metrics", rate: "Per candidate", to: "[[s:12]], [[s:07]], [[s:14]]" },
      { name: "Gate decision", format: "Pass / fail per criterion with statistical test used", rate: "Per release", to: "[[s:12]]" },
      { name: "Rollout videos & logs", format: "MCAP / MP4 with policy version", rate: "Per rollout", to: "[[s:03]] (eval split), [[s:13]]" }
    ],
    handoff: "A release gate is a set of pre-registered criteria (e.g. 'success on held-out sites ≥ 92 % with lower 95 % CI bound ≥ 88 %; no regression on any failure code beyond 2 pp; peak insertion force p99 < 80 N; zero safety-filter hard stops in 200 trials') and the test used to check them. Deployment ([[s:12]]) consumes the gate decision plus the report; it never consumes a single success number."
  },
  mental_model: "Robot evaluation is an experiment with expensive, noisy, correlated samples. Treat each claim as a statistical test with a pre-defined protocol, a minimum sample size and controlled initial conditions; use cheap proxies (sim, real2sim, world models, detectors) only where their correlation with real outcomes has been measured.",
  mental_detail: "Three facts shape practice in 2026. **Saturation**: LIBERO scores of 97–99 % are common (Cosmos Policy 98.5, LaWAM 98.6, PLD 99), and LIBERO-PRO / LIBERO-Plus show models collapsing under object-position, camera, lighting or instruction perturbations; aggregate benchmark numbers no longer discriminate. **Cost**: detecting a 70 → 80 % improvement with 80 % power at α = 0.05 needs about 290 trials per policy; real-world evals of 20–50 trials can only detect large effects. Sequential tests (STEP) cut trials by up to 40 % without p-hacking. **Proxies**: real2sim (PolaRiS r ≈ 0.9 vs real), crowd-sourced pairwise real evaluation (RoboArena), and world-model evaluation (WorldGym, Ctrl-World, 1X World Model) scale evaluation, but each needs a correlation study for your task family.",
  methods: [
    { id: "sim-bench", name: "Simulation benchmarks", tags: ["sim", "il", "rl"],
      summary: "LIBERO (130 tasks, saturated) with robustness variants **LIBERO-PRO** and **LIBERO-Plus** (7 perturbation dimensions, 10,030 tasks); SimplerEnv (visual matching + variant aggregation for real-policy proxies); RoboCasa365 (365 tasks, public leaderboard since Apr 2026); RoboTwin 2.0 (50 bimanual tasks); BEHAVIOR-1K challenge (2025 winner 26 % q-score on 50 long tasks); newer suites X2Real, RoboDojo, VLA-Arena. Frameworks such as StarVLA and LeRobot integrate several of them.",
      pros: "Cheap, reproducible, comparable across papers.", cons: "Saturation and overfitting to benchmark specifics; weak correlation with your real task unless measured." ,
      refs: [{ t: "LIBERO-PRO", u: "https://arxiv.org/pdf/2510.03827" }, { t: "LIBERO-Plus (LeRobot docs)", u: "https://huggingface.co/docs/lerobot/libero_plus" }] },
    { id: "real-protocol", name: "Real-world evaluation protocols", tags: ["robot"],
      summary: "Fixtures or marked initial conditions, randomized trial order, blind A/B (evaluator does not know which policy runs), pre-registered success criteria and failure codes, separate held-out sites/objects. TRI's LBM study: 1,800 blind A/B real rollouts plus 47,000 sim rollouts; RoboArena distributes pairwise A/B evaluations across institutions on DROID robots (600+ episodes, 7 policies, 7 labs).",
      pros: "The ground truth; captures integration effects (latency, calibration).", cons: "Slow and expensive; operator drift; resets dominate time." ,
      refs: [{ t: "TRI LBM", u: "https://arxiv.org/pdf/2507.05331" }, { t: "RoboArena", u: "https://arxiv.org/pdf/2506.18123" }] },
    { id: "real2sim-eval", name: "Real-to-sim evaluation", tags: ["sim", "real2sim"], frontier: true, frontier_ref: "neural-rendering-3d",
      summary: "Reconstruct real eval scenes (Gaussian splats + object meshes) and evaluate policies in sim: PolaRiS reports Pearson r ≈ 0.9 vs real and r = 0.98 vs RoboArena; small sim fine-tuning raises correlation. R2S-Eval calibrates real2sim with VLMs.",
      pros: "Repeatable, parallel, near-free per trial once built.", cons: "Static scenes; contact-heavy tasks less faithful; correlation must be re-measured per task family." },
    { id: "wm-eval", name: "World-model-based evaluation", tags: ["wam", "fm"], frontier: true, frontier_ref: "wm-simulators",
      summary: "Roll out policies inside action-conditioned video models and score with a VLM or detector: WorldGym (preserves policy rankings across versions and sizes), Ctrl-World (multi-view, 20 s+ consistency, ranks policies without real rollouts), dWorldEval, RoboWorld, SC3-Eval; 1X uses its world model to predict NEO outcomes. 2026 diagnostics ask whether robotic world models actually follow actions.",
      pros: "Evaluates generalization to new scenes from a single start frame; scales without hardware.", cons: "Model hallucination can reward wrong behaviour; ranking fidelity varies by task; needs calibration against real." },
    { id: "auto-success", name: "Automated success detection", tags: ["fm"],
      summary: "Success detectors and VLM judges ([[s:04]]) score rollouts automatically. Use them for triage and large-scale proxies; report their precision/recall against humans and never use the same model that produced training labels as the only judge.",
      pros: "Removes human scoring bottleneck.", cons: "Systematic errors bias comparisons, especially on near-misses." },
    { id: "stats", name: "Statistical rigour", tags: [],
      summary: "Report success with 95 % confidence intervals (Wilson); pre-compute sample sizes; use paired designs (same initial conditions for A and B); sequential testing with valid stopping rules (STEP: up to 40 % fewer trials); account for run-to-run training variance (multiple seeds; GR00T notes 5–6 %). Beyond binary success: partial-credit and time metrics with appropriate tests (RSS 2026 work on sample-efficient, rigorous comparison).",
      pros: "Decisions you can defend; fewer false 'improvements'.", cons: "Requires more trials than teams expect; discipline to pre-register." ,
      refs: [{ t: "STEP", u: "https://arxiv.org/pdf/2503.10966" }, { t: "Beyond Binary Success (RSS 2026)", u: "https://roboticsconference.org/program/papers/76/" }] },
    { id: "generalization", name: "Generalization axes & splits", tags: [],
      summary: "Evaluate separately along axes: object instance, object category, position/layout, distractors, lighting, background, camera pose, instruction paraphrase, new task composition, new site, new embodiment. Hold out entire sites and object sets, not random episodes. Data-scaling evidence says environment and object diversity drives these axes.",
      pros: "Shows where a policy is brittle; guides collection.", cons: "Combinatorial; prioritize axes from the deployment envelope." },
    { id: "regression", name: "Regression suites & production metrics", tags: ["sim", "robot"],
      summary: "Nightly sim regression (frozen envs), weekly real canary cell, shadow-mode comparison on fleet logs ([[s:12]]). Production KPIs: first-pass success, cycle time, interventions per robot-hour (IPH), mean time between interventions, recovery rate, uptime. Track every metric per policy version.",
      pros: "Catches regressions before rollout; connects research metrics to business metrics.", cons: "Shadow mode cannot measure closed-loop effects." },
    { id: "safety-eval", name: "Safety validation", tags: ["classical"],
      summary: "Physical safety: force and speed peaks, contact events with humans/environment, safety-filter activation counts, behaviour under sensor faults and network loss, fall rate for humanoids. Semantic safety: refusal and constraint following on ASIMOV-style datasets (500k situations, 3M instructions) for language-conditioned robots. Adversarial and edge-case scenario libraries in sim and real.",
      pros: "Evidence for the safety case ([[s:14]]).", cons: "Rare events need very large sample sizes or scenario-based arguments." ,
      refs: [{ t: "ASIMOV / robot constitutions", u: "https://proceedings.mlr.press/v305/sermanet25a.html" }] }
  ],
  extras: [
    { title: "How many trials do you need?", note: "Normal-approximation arithmetic; use exact or sequential tests in practice.",
      columns: ["Question", "Trials", "Formula / note"],
      rows: [
        ["95 % CI half-width at p = 0.8, n = 50", "± 11.1 pp", "1.96·√(p(1−p)/n)"],
        ["Same at n = 100 / n = 200", "± 7.8 pp / ± 5.5 pp", "Halving the interval needs 4× trials"],
        ["95 % CI half-width at p = 0.95, n = 100", "± 4.3 pp", "High-success regimes need fewer trials for the same width but more to detect small gains"],
        ["Detect 70 % → 80 % (α = 0.05, power 0.8)", "≈ 290 per policy", "(z₀.₉₇₅ + z₀.₈)² · Σp(1−p) / Δ²"],
        ["Detect 90 % → 95 % (same settings)", "≈ 430 per policy", "Small improvements near the ceiling are expensive"],
        ["Sequential test (STEP)", "up to 40 % fewer", "Valid early stopping without p-hacking"]
      ] }
  ],
  decision: [
    { "if": "Comparing two checkpoints of the same model", use: "Paired real A/B on fixed initial conditions with a sequential test; sim/real2sim as pre-filter", why: "Paired designs cut variance; sequential tests cut trials." },
    { "if": "Claiming generalization", use: "Held-out sites and object sets; report per-axis success with CIs", why: "Random episode splits leak scenes and inflate results." },
    { "if": "Using a sim or world model to select checkpoints", use: "Only after measuring rank correlation with real over ≥ 5–10 checkpoints", why: "Unvalidated proxies can anti-correlate with real performance." },
    { "if": "Publishing on LIBERO", use: "Also report LIBERO-PRO / LIBERO-Plus and at least one real task", why: "LIBERO alone is saturated." },
    { "if": "Release gating for a fleet", use: "Pre-registered criteria incl. safety metrics + shadow-mode comparison + canary", why: "Single success numbers miss regressions in failure modes and safety." },
    { "if": "Language-conditioned robot near people", use: "Add semantic-safety evaluation (ASIMOV-style) and refusal tests", why: "Instruction following includes refusing unsafe instructions." }
  ],
  tools: [
    { id: "libero", name: "LIBERO", what: "130-task lifelong manipulation benchmark (4 suites)", maker: "UT Austin et al.", open: "open", license: "MIT (code), CC BY 4.0 (data)", maturity: "production", best_for: "Quick sanity checks and comparability with prior work", limitations: "Saturated (97–99 % common); memorization rather than generalization", release: "2023", version: "NeurIPS 2023", link: "https://github.com/Lifelong-Robot-Learning/LIBERO", runs: ["sim"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "libero-pro", name: "LIBERO-PRO", what: "Perturbed LIBERO: objects, initial states, instructions, environments", maker: "Academic", open: "open", license: "See repo", maturity: "research", best_for: "Exposing memorization in LIBERO-trained VLAs", limitations: "Still LIBERO scenes", release: "2025-10", version: "arXiv 2510.03827", link: "https://github.com/Zijian007/LIBERO-PRO", runs: ["sim"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "libero-plus", name: "LIBERO-Plus", what: "7 perturbation dimensions (layout, camera, robot init, language, light, background, noise); 10,030 tasks", maker: "Academic; integrated in LeRobot", open: "open", license: "See docs", maturity: "research", best_for: "Fine-grained robustness profiles", limitations: "Sim-only robustness", release: null, version: "LeRobot integration", release_note: "see docs", link: "https://huggingface.co/docs/lerobot/libero_plus", runs: ["sim"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "simplerenv", name: "SimplerEnv", what: "Sim proxies for real-robot policies (visual matching, variant aggregation)", maker: "UCSD / Stanford / Google et al.", open: "open", license: "MIT", maturity: "production", best_for: "Evaluating Bridge / Google-robot style policies cheaply", limitations: "Limited task set; ManiSkill2-based (ManiSkill3 GPU variant exists)", release: "2024", version: "CoRL 2024", link: "https://github.com/simpler-env/SimplerEnv", runs: ["sim"], tech: ["il", "real2sim"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "robocasa-eval", name: "RoboCasa365 leaderboard", what: "Public leaderboard for generalist household policies", maker: "UT Austin et al.", open: "open", license: "MIT / CC BY 4.0", maturity: "pilot", best_for: "Household generalization comparisons", limitations: "Kitchen domain; sim physics", release: "2026-04", version: "leaderboard launch", link: "https://github.com/robocasa/robocasa", runs: ["sim"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "robotwin2", name: "RoboTwin 2.0", what: "50 bimanual tasks, strong domain randomization, 100k+ trajectories, leaderboard", maker: "RoboTwin team", open: "open", license: "MIT", maturity: "pilot", best_for: "Bimanual policy benchmarking", limitations: "Sim-only; aloha-agilex default embodiment", release: "2025-06-21", version: "2.0 (+ XPolicyLab eval Aug 2026)", link: "https://github.com/RoboTwin-Platform/RoboTwin", runs: ["sim"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "roboarena", name: "RoboArena", what: "Distributed crowd-sourced pairwise real-world evaluation on DROID", maker: "Penn / Stanford / Berkeley et al.", open: "open", license: "Open protocol", maturity: "pilot", best_for: "Ranking generalist policies in diverse real settings", limitations: "DROID platform; ranking, not absolute success", release: "2025-06", version: "CoRL 2025", link: "https://arxiv.org/pdf/2506.18123", runs: ["robot"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "polaris-eval", name: "PolaRiS", what: "Real-to-sim evaluation with GS reconstructions (see [[s:06]])", maker: "Academic", open: "open", license: "See hub", maturity: "pilot", best_for: "Correlated, repeatable eval of DROID-style policies", limitations: "Static scenes", release: "2025-12", version: "RSS 2026", link: "https://huggingface.co/datasets/owhan/PolaRiS-Hub", runs: ["sim"], tech: ["real2sim"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "worldgym", name: "WorldGym", what: "Action-conditioned video world model as policy-evaluation environment with VLM rewards", maker: "Academic (Sherry Yang et al.)", open: "open", license: "See repo", maturity: "research", best_for: "Ranking policies on novel tasks from one start frame", limitations: "Hallucination; absolute success unreliable", release: "2025-06", version: "ICLR 2026", link: "https://arxiv.org/html/2506.00613v3", runs: ["cloud"], tech: ["wam"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "ctrl-world", name: "Ctrl-World", what: "Controllable multi-view world model for policy evaluation and improvement (DROID)", maker: "Academic", open: "open", license: "See repo", maturity: "research", best_for: "Policy ranking and imagination-based improvement (+44.7 %)", limitations: "DROID-domain; ~20 s horizons", release: "2025-10", version: "ICLR 2026", link: "https://arxiv.org/pdf/2510.10125", runs: ["cloud"], tech: ["wam"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "step", name: "STEP", what: "Sequential statistical test for policy comparison with near-optimal stopping", maker: "Academic (Snyder et al.) + TRI", open: "open", license: "See paper", maturity: "research", best_for: "Fewer real trials for A/B comparisons without p-hacking", limitations: "Binary outcomes (extensions exist)", release: "2025-03", version: "RSS 2025", link: "https://arxiv.org/pdf/2503.10966", runs: ["robot", "sim"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "asimov", name: "ASIMOV benchmark", what: "Semantic safety datasets (500k situations, 3M instructions) + generated robot constitutions", maker: "Google DeepMind", open: "open", license: "See release", maturity: "research", best_for: "Evaluating semantic safety of language-conditioned robots", limitations: "Semantic, not physical safety", release: "2025-03", version: "CoRL 2025", link: "https://proceedings.mlr.press/v305/sermanet25a.html", runs: ["cloud"], tech: ["fm"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null }
  ],
  where: {
    cloud: { l: 2, n: "world-model and VLM-judge eval" },
    onprem: { l: 1, n: "eval cells" },
    sim: { l: 3, n: "benchmarks, regression, real2sim" },
    edge: { l: 1, n: "on-robot eval runtime = deployment runtime" },
    robot: { l: 3, n: "real A/B, canaries" }
  },
  tech: {
    il: { l: 2, n: "" },
    rl: { l: 1, n: "" },
    classical: { l: 1, n: "safety metrics" },
    sim2real: { l: 2, n: "sim–real correlation" },
    real2sim: { l: 3, n: "real2sim evaluation" },
    real2sim2real: { l: 1, n: "" },
    fm: { l: 2, n: "VLM judges, success detectors" },
    wam: { l: 2, n: "world-model evaluation" },
    icl: { l: 0, n: "" }
  },
  stacks: {
    open: { title: "Open stack", items: [
      "LIBERO + LIBERO-PRO/Plus, RoboCasa365, RoboTwin 2.0 via LeRobot or StarVLA harnesses",
      "PolaRiS-style real2sim scenes of your own cells; correlation study per task family",
      "Real A/B with fixtures, blind operators and STEP sequential testing",
      "Report Wilson intervals; store all rollouts with policy version"
    ], note: "Budget eval time explicitly: it is often 30–50 % of real-robot time." },
    industry: { title: "Industry (public)", items: [
      "Dedicated evaluation fleets / cells with standardized protocols (TRI LBM blind A/B methodology)",
      "World models as evaluators (1X World Model; Tesla neural simulator for Optimus and FSD)",
      "Crowd-sourced benchmarks used for claims (GR00T N2 'No. 1 on RoboArena and MolmoSpaces' at preview)",
      "Production KPIs: interventions per hour, cycle time, uptime (Agility reports 65k+ operating hours across 9 customer facilities)"
    ], note: "Internal eval protocols are rarely published in full." }
  },
  example: {
    summary: "MB-1's gate for checkpoint `@41` vs production `@37`: (1) nightly sim regression on 300 frozen scenarios (must not drop any subtask by > 3 pp); (2) real2sim eval in 6 reconstructed cells (measured r = 0.83 with real for this task family); (3) paired real A/B in 2 held-out cells, same 60 fixture configurations for both policies, 140 trials per policy; the pre-registered gate is non-inferiority on success (margin 3 pp) plus improvement in cycle time and no new failure mode, because proving superiority for a few points would need several hundred trials; (4) safety metrics over all real trials. Pre-registered pass criteria come from `task_spec.md`.",
    artifacts: [
      { artifact: "`eval/2026-09-28_ckpt41.json`", format: "JSON report", shape: "success 95.0 % (133/140, Wilson 95 % CI [90.0, 97.6]) vs 90.7 % (127/140, [84.8, 94.5]); Δ = +4.3 pp, 95 % CI [−1.7, +10.3] pp → superiority not shown, non-inferiority vs pre-registered −3 pp margin passes; per-failure-code deltas; cycle −2.3 s; IPH 0.4 → 0.25 (est.)", consumer: "[[s:12]] gate" },
      { artifact: "Safety summary", format: "JSON", shape: "peak insertion force p99 72 N (limit 80); 0 hard stops; 3 soft filter clamps / 140 trials", consumer: "[[s:14]] safety file" },
      { artifact: "Failure clips", format: "MP4 + MCAP refs", shape: "7 failures, coded (4× misalign, 2× latch-not-seated, 1× drop)", consumer: "[[s:13]] mining, [[s:07]] next run" }
    ],
    humanoid: "H-1 adds **locomotion and stability** evaluation: fall rate per hour, tracking error on a motion test suite, recovery from pushes (calibrated impulse), stair/ramp success, and battery-time per task. Fall events are rare and costly, so scenario-based sim testing with thousands of perturbations is the main evidence, backed by a smaller real test matrix."
  },
  pitfalls: [
    { t: "20-trial evaluations", d: "With n = 20 the 95 % CI at p = 0.5 is ± 22 pp; most claimed improvements at this scale are noise." },
    { t: "Unpaired comparisons", d: "Running A on Monday and B on Tuesday with different object placements confounds the result; pair initial conditions." },
    { t: "Evaluator bias", d: "Operators who know which policy runs reset more favourably; blind the A/B." },
    { t: "Optimizing the proxy", d: "Checkpoint selection on a world-model or sim score without measured correlation can select worse real policies." },
    { t: "Ignoring partial success and time", d: "Binary success hides cycle-time regressions and near-miss rates that matter in production." },
    { t: "Eval runtime ≠ deployment runtime", d: "Evaluating the PyTorch model while deploying a TensorRT FP8 engine skips the compression regression; re-evaluate the deployed artifact ([[s:11]])." }
  ],
  numbers: [
    { m: "LIBERO saturation", v: "97–99 % reported by many 2026 methods", s: "e.g. [Cosmos Policy](https://arxiv.org/html/2601.16163v1), [LaWAM](https://arxiv.org/pdf/2606.15768), [PLD](https://arxiv.org/abs/2511.00091v1)" },
    { m: "LIBERO-Plus size", v: "10,030 tasks across 7 perturbation dimensions", s: "[LeRobot docs](https://huggingface.co/docs/lerobot/libero_plus)" },
    { m: "TRI LBM protocol", v: "1,800 blind A/B real rollouts + 47,000 sim rollouts", s: "[arXiv 2507.05331](https://arxiv.org/pdf/2507.05331)" },
    { m: "RoboArena", v: "600+ pairwise episodes, 7 policies, 7 institutions", s: "[arXiv 2506.18123](https://arxiv.org/pdf/2506.18123)" },
    { m: "PolaRiS correlation", v: "r ≈ 0.9 vs real; 0.98 vs RoboArena", s: "[RSS 2026](https://roboticsproceedings.org/rss22/p062.html)" },
    { m: "STEP savings", v: "up to 40 % fewer trials", s: "[arXiv 2503.10966](https://arxiv.org/pdf/2503.10966)" },
    { m: "Trials to detect 70 → 80 %", v: "≈ 290 per policy (α 0.05, power 0.8)", s: "Standard two-proportion sample-size formula" }
  ],
  papers: [
    { title: "A Careful Examination of Large Behavior Models for Multitask Dexterous Manipulation", year: "2025", venue: "TRI", url: "https://arxiv.org/pdf/2507.05331", why: "The reference for rigorous real-world evaluation methodology." },
    { title: "Is Your Imitation Learning Policy Better than Mine? (STEP)", year: "2025", venue: "RSS", url: "https://arxiv.org/pdf/2503.10966", why: "Sequential testing for policy comparison." },
    { title: "RoboArena: Distributed Real-World Evaluation of Generalist Robot Policies", year: "2025", venue: "CoRL", url: "https://arxiv.org/pdf/2506.18123", why: "Crowd-sourced pairwise evaluation and ranking." },
    { title: "PolaRiS: Scalable Real-to-Sim Evaluations for Generalist Robot Policies", year: "2025", venue: "RSS 2026", url: "https://arxiv.org/pdf/2512.16881", why: "Measured real2sim correlation for evaluation." },
    { title: "LIBERO-PRO: Robust and Fair Evaluation of VLA Models Beyond Memorization", year: "2025", venue: "arXiv 2510.03827", url: "https://arxiv.org/pdf/2510.03827", why: "Why saturated benchmarks mislead." },
    { title: "WorldGym: World Model as an Environment for Policy Evaluation", year: "2025", venue: "ICLR 2026", url: "https://arxiv.org/html/2506.00613v3", why: "World-model evaluation and its ranking fidelity." }
  ],
  open_problems: [
    "Standard, shared real-world benchmarks beyond the DROID platform (multi-embodiment, contact-rich).",
    "Calibrated world-model evaluators with uncertainty, robust to policy exploitation.",
    "Evaluating rare safety-critical events with feasible sample sizes (scenario-based assurance for learned policies).",
    "Metrics for steerability and in-context adaptation (how quickly coaching or prompts fix behaviour)."
  ],
  self_check: [
    { q: "Your new checkpoint wins 17/20 vs the old 14/20 on the robot. Should you ship? What do you do instead?", a: "No: 85 % vs 70 % with n = 20 each is not significant (CIs overlap widely). Run a paired, blinded A/B on fixed initial conditions with a sequential test (STEP) or a pre-computed sample size (~290 per arm for a 10-pp effect), plus sim/real2sim pre-checks and safety metrics." },
    { q: "Which artifact must be evaluated before rollout: the training checkpoint or the compiled engine? Why?", a: "The compiled engine (TensorRT / quantized) that will actually run, inside the deployment runtime (same preprocessing, action server, RTC settings). Quantization, operator fusion and runtime changes can shift behaviour; [[s:11]] produces it and [[s:10]] must gate it." },
    { q: "How do you decide whether a world-model evaluator can replace part of real evaluation?", a: "Run a correlation study: evaluate ≥ 5–10 checkpoints (diverse quality) both in the world model and in real with adequate trials; compute rank correlation and check failure-mode agreement. Use it for pre-filtering only if correlation is high and stable across task families; keep real gates for releases." },
    { q: "What consumes the failure-code histogram from eval?", a: "[[s:07]] (what to fix next and which data to add), [[s:13]] (mining queries and targeted collection requests to [[s:02]]), [[s:04]] (label taxonomy refinements if codes are ambiguous), and [[s:12]] (rollout risk assessment: new failure modes block rollout even if aggregate success rose)." },
    { q: "Why report generalization per axis instead of one held-out success number?", a: "Because policies fail along specific axes (camera pose, lighting, object position) that a single average hides; per-axis results tell collection ([[s:02]]) what diversity to add and tell deployment ([[s:12]]) which sites are risky. LIBERO-Plus/PRO show models that look perfect on average collapse on single axes." }
  ]
};
