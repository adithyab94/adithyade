/* Stage 13 — Data flywheel & continual learning. Schema: MAINTENANCE.md */
window.PAI = window.PAI || {}; PAI.stages = PAI.stages || {};
PAI.stages["stage-13"] = {
  id: "stage-13", num: "13", title: "Data flywheel & continual learning", short: "Data flywheel",
  version: "1.0.0", last_verified: "2026-10-07",
  upstream: [
    { id: "stage-12", what: "fleet logs, interventions, monitor events, incidents, cohort KPIs" },
    { id: "stage-10", what: "failure-code histograms and per-axis weaknesses" },
    { id: "stage-03", what: "catalog and embedding search over all episodes" }
  ],
  downstream: [
    { id: "stage-02", what: "targeted collection requests (scenarios, objects, sites)" },
    { id: "stage-04", what: "relabel / label queues for mined episodes" },
    { id: "stage-07", what: "new snapshot and mixture for the next training cycle" },
    { id: "stage-08", what: "rollouts and interventions for RL / advantage conditioning" },
    { id: "stage-00", what: "spec changes when failures reveal missing sensors or wrong task definitions" }
  ],
  handoff_short: "Mining queries + mined episode sets, collection tickets, next snapshot definition, retraining trigger with expected impact",
  purpose: "Close the loop: turn deployment experience into the next, better policy on a predictable cadence. The flywheel decides which failures to fix, which data to collect or label, when to retrain, and how to verify that the fix worked without breaking anything else.",
  interface: {
    inputs: [
      { name: "Fleet data", format: "Episodes with policy version, interventions, monitor events (from [[s:12]] via [[s:03]])", rate: "Continuous", from: "[[s:12]], [[s:03]]" },
      { name: "Eval failures", format: "Coded failures, per-axis weaknesses", rate: "Per eval", from: "[[s:10]]" },
      { name: "Incident root causes", format: "Tickets with root-cause codes", rate: "Per incident", from: "[[s:12]]" }
    ],
    outputs: [
      { name: "Mined sets", format: "Episode-id lists with query, reason and priority", rate: "Weekly", to: "[[s:04]], [[s:07]]" },
      { name: "Collection tickets", format: "Scenario spec: site, object set, condition, count, deadline", rate: "Weekly", to: "[[s:02]]" },
      { name: "Retraining trigger", format: "Snapshot definition + expected impact + eval plan", rate: "Weekly–monthly", to: "[[s:07]], [[s:08]]" },
      { name: "Flywheel metrics", format: "Time from failure to fix, IPH trend, recurrence rate per failure code", rate: "Monthly", to: "Leadership, [[s:14]] post-market monitoring" }
    ],
    handoff: "Every flywheel cycle is a hypothesis: 'failure code X at sites Y is caused by Z; adding data D (or RL on subtask S) will reduce it by Δ without regressions'. The ticket carries the hypothesis, the mined evidence and the eval plan, so [[s:10]] can confirm or reject it and the next cycle learns from the result."
  },
  mental_model: "The fleet is a sensor for the policy's failure distribution. A flywheel works when three latencies are short: failure → detection (monitors, detectors), detection → data (mining, labels, targeted collection, interventions), data → verified deployment (training, eval, rollout). Most teams are bottlenecked on the middle step, not on training.",
  mental_detail: "Data sources rank by value per hour: **interventions** (on-policy states where the policy failed, with human corrections) > **autonomous failures with labels** (negative examples for value models and advantage conditioning) > **targeted collection** for mined gaps > **generic new data**. Physical Intelligence's RECAP formalizes this: demos, autonomous rollouts and interventions all train a value function and an advantage-conditioned policy. PLD automates part of it with residual RL probes that find failure regions and generate recovery data. Shadow mode lets a candidate be judged on the fleet's real distribution before it acts.\n\nRetraining cadence is a trade-off between freshness and validation cost. Weekly fine-tunes with full gating are feasible for task-specific policies; foundation-model retraining is monthly or slower. Without careful mixture management, each cycle risks **catastrophic forgetting** of skills absent from the newest data; keep a replay mixture and per-skill regression tests.",
  methods: [
    { id: "failure-mining", name: "Failure mining & clustering", tags: ["cloud", "fm"],
      summary: "Query the catalog for failures (success detector, monitor alarms, interventions, low value), cluster them by embedding (VLM captions, SigLIP frames, action features) and by failure code, rank clusters by frequency × cost, and pick the top few per cycle. Nearest-neighbour search finds similar successful and failed episodes for contrast.",
      pros: "Focuses effort on the failures that matter commercially.", cons: "Detector blind spots hide whole failure classes; audit with random samples." },
    { id: "interventions", name: "Intervention data & DAgger-style correction", tags: ["il", "robot"],
      summary: "Human takeovers (teleop or language coaching) during autonomous runs, recorded with reason codes; train on intervention segments with up-weighting (HG-DAgger style) or as positive-advantage examples (RECAP). π0.7 shows verbal coaching as an intervention channel that changes behaviour in context.",
      pros: "Highest-value data per minute; directly on the failure distribution.", cons: "Operator latency and inconsistency; interventions only cover states the policy reaches." },
    { id: "shadow", name: "Shadow mode & offline replay", tags: ["cloud", "edge"],
      summary: "Run candidate policies on uploaded observations (or live on the robot without actuation) and compare predicted actions, predicted success/value and monitor scores against production. Useful to find disagreements to label and to pre-screen candidates.",
      pros: "Uses real distribution at zero physical risk.", cons: "Open-loop: cannot evaluate how the candidate's own actions change future states." },
    { id: "targeted-collection", name: "Targeted collection & synthetic gap filling", tags: ["il", "sim"],
      summary: "Convert mined clusters into collection tickets (scenario, objects, site, count) for teleop or handheld collection; or fill gaps synthetically (MimicGen variations, Cosmos-style visual augmentation, neural trajectories) when the gap is visual or positional rather than contact-related.",
      pros: "Adds the diversity that matters, cheaply.", cons: "Turnaround time; synthetic fills can miss the real cause." },
    { id: "rl-cycle", name: "RL / advantage-conditioned cycles on fleet data", tags: ["rl", "fm"], frontier: true, frontier_ref: "rl-generalists",
      summary: "Each cycle: retrain the value model on all data with current policy rollouts, recompute advantages, fine-tune the policy with advantage conditioning (RECAP), optionally probe failures with residual RL and distil (PLD). Real-world RL frameworks (RLinf 0.3) target this loop.",
      pros: "Learns from failures, not just successes; improves speed and reliability.", cons: "Value-model drift; requires strong success signals." },
    { id: "cadence", name: "Retraining cadence, mixtures & forgetting control", tags: ["cloud", "il"],
      summary: "Define triggers (failure-code threshold, new site, new product variant, scheduled), mixture policy (replay ratio of older data, per-skill quotas), and regression suites per skill. Version every snapshot and keep the ability to roll back to an older model if a cycle regresses.",
      pros: "Predictable improvement with bounded regression risk.", cons: "Mixture tuning is empirical; storage and compute grow with history." },
    { id: "imagination", name: "World-model-in-the-loop improvement", tags: ["wam", "fm"], frontier: true, frontier_ref: "wm-simulators",
      summary: "Use an action-conditioned world model of your domain to evaluate candidates and synthesize successful trajectories for fine-tuning (Ctrl-World: +44.7 % from imagined successes; World-VLA-Loop: co-evolution of policy and world model). Promising for long-tail scenes that are hard to stage physically.",
      pros: "Scales improvement beyond physical collection capacity.", cons: "World-model errors can be learned; validate on real." },
    { id: "metrics", name: "Flywheel metrics", tags: ["cloud"],
      summary: "Measure the loop itself: median time from first occurrence of a failure cluster to deployed fix; recurrence rate per failure code after a fix; interventions per robot-hour trend; data-to-improvement efficiency (hours collected per pp gained). These are the leading indicators of whether autonomy will reach economic viability.",
      pros: "Makes the flywheel manageable.", cons: "Requires consistent failure codes and version tagging end to end." }
  ],
  decision: [
    { "if": "One failure cluster dominates (> 30 % of interventions)", use: "Targeted collection + relabel + focused fine-tune or residual RL on that subtask", why: "Biggest return per cycle." },
    { "if": "Many small, diverse failures", use: "Advantage-conditioned post-training on all fleet data + broader diversity collection", why: "Generalist improvement beats patching each case." },
    { "if": "New site or product variant", use: "Shadow mode on site data → small site fine-tune (LoRA) → canary", why: "Distribution shift is predictable; adapt before acting." },
    { "if": "Failures are visual / positional (lighting, layouts)", use: "Synthetic gap filling (augmentation, MimicGen) plus small real set", why: "Cheaper than physical collection for non-contact gaps." },
    { "if": "Retraining regresses older skills", use: "Increase replay of older data, per-skill quotas, regression gates per skill", why: "Controls catastrophic forgetting." }
  ],
  tools: [
    { id: "lance-13", name: "Lance / LanceDB (mining index)", what: "Vector + SQL search over episodes and embeddings", maker: "LanceDB", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Similarity search for failure clustering", limitations: "Embeddings must be recomputed when models change", release: "2026-10-07", version: "lancedb 0.40.0", link: "https://github.com/lance-format/lance/releases", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "encord-active", name: "Encord (Active / Index)", what: "Curation, quality evaluation and petabyte-scale dataset search", maker: "Encord", open: "closed", license: "Commercial", maturity: "production", best_for: "Managed mining + labelling loop for VLA data", limitations: "Commercial", release: "2026-02", version: "Series C (Feb 2026) product line", link: "https://pulse2.com/encord-60-million-series-c-raised-to-scale-ai-native-data-infrastructure", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "roboto-13", name: "Roboto AI", what: "Robotics log lake with automated processing and search", maker: "Roboto AI", open: "closed", license: "Commercial", maturity: "pilot", best_for: "Triggering processing and mining on uploaded robot logs", limitations: "Young vendor", release: null, version: "SaaS", release_note: "continuous (SaaS)", link: "https://www.therobotreport.com/?p=565434", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "opentau", name: "OpenTau (RECAP reimplementation)", what: "Open implementation and tutorial of advantage-conditioned training (π0.6-style)", maker: "OpenTau community", open: "open", license: "See docs", maturity: "research", best_for: "Experimenting with RECAP-style loops on open models", limitations: "Unofficial; architecture details may differ from PI's", release: null, version: "docs (stable)", release_note: "see docs", link: "https://opentau.readthedocs.io/en/stable/_sources/tutorials/RECAP.rst.txt", runs: ["cloud"], tech: ["rl"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "rlinf-13", name: "RLinf (real-world RL pipeline)", what: "Data collection → SFT → RL → deployment pipeline (v0.3)", maker: "Tsinghua + Infini-AI", open: "open", license: "Apache-2.0", maturity: "pilot", best_for: "Running the RL half of the flywheel on open VLAs", limitations: "Setup complexity", release: "2026-07", version: "v0.3", link: "https://github.com/RLinf/RLinf", runs: ["cloud", "robot"], tech: ["rl"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "ctrl-world-13", name: "Ctrl-World", what: "World model for imagination-based evaluation and improvement", maker: "Academic", open: "open", license: "See repo", maturity: "research", best_for: "Ranking candidates and synthesizing successes in DROID-like domains", limitations: "Domain-specific; needs validation", release: "2025-10", version: "ICLR 2026", link: "https://arxiv.org/pdf/2510.10125", runs: ["cloud"], tech: ["wam"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "mlflow-13", name: "MLflow / W&B registries", what: "Lineage from data snapshot → run → checkpoint → engine → eval → release", maker: "Databricks / Weights & Biases", open: "mixed", license: "MLflow Apache-2.0; W&B commercial", maturity: "production", best_for: "Making each cycle traceable and reversible", limitations: "Robot-specific schema is up to you", release: "2026-10-07", version: "MLflow 3.17.0", link: "https://pypi.org/project/mlflow/", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null }
  ],
  where: {
    cloud: { l: 3, n: "mining, labelling, training cycles" },
    onprem: { l: 1, n: "" },
    sim: { l: 1, n: "synthetic gap filling, regression" },
    edge: { l: 2, n: "on-robot triggers, intervention capture" },
    robot: { l: 2, n: "targeted collection, interventions" }
  },
  tech: {
    il: { l: 3, n: "interventions and new demos" },
    rl: { l: 2, n: "advantage conditioning, residual RL" },
    classical: { l: 0, n: "" },
    sim2real: { l: 1, n: "" },
    real2sim: { l: 1, n: "incident replay in twins" },
    real2sim2real: { l: 1, n: "" },
    fm: { l: 2, n: "VLM mining, generalist retraining" },
    wam: { l: 1, n: "world-model-in-the-loop" },
    icl: { l: 1, n: "coaching as intervention channel" }
  },
  stacks: {
    open: { title: "Open stack", items: [
      "Catalog (Parquet/Iceberg) + LanceDB embeddings; weekly mining notebook producing tickets",
      "LeRobot recording with intervention flags; HG-DAgger-style weighting in fine-tunes",
      "RLinf / OpenTau for RL and advantage-conditioned cycles; PLD for residual probe-and-distill",
      "MLflow lineage and per-skill regression suites"
    ], note: "Start with a manual weekly review of the top-10 failure clusters before automating." },
    industry: { title: "Industry (public)", items: [
      "Physical Intelligence: RECAP on demos + autonomous rollouts + interventions (laundry, boxes, espresso)",
      "Generalist: data engine growing ~10,000 h/week feeding GEN-0",
      "Tesla: fleet-data flywheel and neural world simulator shared between FSD and Optimus",
      "Fleet operators with remote-assist centres turning interventions into training data"
    ], note: "Cadences and mixture rules are not disclosed." }
  },
  example: {
    summary: "In week 39 the MB-1 fleet logs 1,840 autonomous episodes with 61 interventions (IPH 0.33). Mining clusters interventions: 38 % 'latch-not-seated on connector family B7' (all at site 3, a new supplier batch with stiffer latches), 22 % 'grasp slip on glossy connectors', rest scattered. Actions: (1) collection ticket for 150 teleop insertions on B7 at site 3 plus 40 h handheld; (2) relabel 400 historical B7 episodes with the updated latch-click detector; (3) RECAP cycle on all week-36–39 data; (4) residual RL refresh for the insertion phase on B7. Expected impact: −30 % interventions; verified by A/B in [[s:10]].",
    artifacts: [
      { artifact: "Mining query", format: "SQL + vector search", shape: "`SELECT … FROM robot.episodes WHERE policy_v='41' AND (n_interventions>0 OR success=false) AND week=39` → cluster by embedding (k=12)", consumer: "weekly review" },
      { artifact: "Ticket `FW-2026-39-01`", format: "YAML", shape: "{hypothesis: 'B7 latch stiffness', evidence: 23 episodes, collect: 150 teleop + 40 h handheld @ site3, relabel: 400, train: snapshot 2026.10.1, eval: B7 A/B 200 trials, owner, due}", consumer: "[[s:02]], [[s:04]], [[s:07]], [[s:10]]" },
      { artifact: "Flywheel dashboard", format: "Grafana", shape: "failure → fix median 12 days; recurrence after fix 9 %; IPH 0.33 → target 0.25", consumer: "management, [[s:14]] post-market monitoring" }
    ],
    humanoid: "H-1's flywheel splits by layer: falls and stumbles feed back into **sim** (new terrain/perturbation scenarios, randomization ranges, delta-action models refreshed from real rollouts) rather than into teleop collection; manipulation failures follow the MB-1 pattern. The two loops share the incident pipeline but have different retraining cadences."
  },
  pitfalls: [
    { t: "Collecting more data without a hypothesis", d: "Generic data rarely fixes specific failures; tie each collection to a mined cluster and an expected effect." },
    { t: "Training on interventions without reason codes", d: "Different intervention reasons (safety, efficiency, failure) need different treatment; mixing them confuses advantage labels." },
    { t: "Forgetting older skills", d: "Fine-tuning on recent failures erodes behaviours absent from new data; keep replay and per-skill regression gates." },
    { t: "Detector-defined failures only", d: "If the success detector misses a failure type, the flywheel never sees it; sample random episodes for human review." },
    { t: "No versioning end-to-end", d: "Without policy, data and config versions on every episode, you cannot attribute improvements or regressions to a cycle." }
  ],
  numbers: [
    { m: "π*0.6 RECAP outcome", v: "> 2× throughput, ≈ ½ failure rate on hard tasks", s: "[arXiv 2511.14759](https://arxiv.org/html/2511.14759v2)" },
    { m: "GEN-0 data engine", v: "+10,000 h/week (company claim)", s: "[Generalist](https://generalistai.com/blog/gen-0)" },
    { m: "Imagination-based improvement", v: "+44.7 % (Ctrl-World)", s: "[arXiv 2510.10125](https://arxiv.org/pdf/2510.10125)" },
    { m: "PLD real-world", v: "100 % on evaluated Franka / YAM tasks after probe-learn-distill", s: "[arXiv 2511.00091](https://arxiv.org/abs/2511.00091v1)" }
  ],
  papers: [
    { title: "π*0.6: a VLA That Learns From Experience", year: "2025", venue: "arXiv 2511.14759", url: "https://arxiv.org/html/2511.14759v2", why: "The clearest public description of a deployment-data flywheel for a generalist." },
    { title: "Self-Improving VLA Models with Data Generation via Residual RL (PLD)", year: "2025", venue: "ICLR 2026", url: "https://arxiv.org/abs/2511.00091v1", why: "Automated failure probing and distillation." },
    { title: "Ctrl-World: A Controllable Generative World Model for Robot Manipulation", year: "2025", venue: "ICLR 2026", url: "https://arxiv.org/pdf/2510.10125", why: "World model as evaluator and data engine in the loop." },
    { title: "Failure Prediction at Runtime for Generative Robot Policies (FIPER)", year: "2025", venue: "NeurIPS", url: "https://arxiv.org/abs/2510.09459v1", why: "Detecting near-failures to mine." },
    { title: "Data Scaling Laws in Imitation Learning", year: "2025", venue: "ICLR", url: "https://arxiv.org/html/2410.18647v3", why: "Why targeted diversity beats more of the same." },
    { title: "Tesla AI chief details unified world simulator for FSD and Optimus", year: "2026", venue: "Humanoids Daily", url: "https://www.humanoidsdaily.com/news/tesla-ai-chief-details-unified-world-simulator-for-fsd-and-optimus", why: "Fleet + neural simulator flywheel as described publicly." }
  ],
  open_problems: [
    "Estimating the value of a candidate data batch before training on it.",
    "Continual learning for foundation policies without forgetting and without full retraining.",
    "Automatic root-cause attribution across policy, perception, control and environment.",
    "Privacy-preserving fleet learning when customers restrict data upload."
  ],
  self_check: [
    { q: "Your flywheel added 500 h of data in a month but interventions per hour did not drop. What do you investigate?", a: "Whether the data targeted the dominant failure clusters (hypothesis-driven or generic?), whether interventions are labelled by reason (maybe the remaining ones are efficiency or safety interventions), whether the new data reached the training mixture with sufficient weight, whether eval confirmed improvement on those clusters, and whether a regression elsewhere offset gains (per-skill regression)." },
    { q: "Which stages consume a flywheel ticket and what does each do with it?", a: "[[s:02]] executes targeted collection; [[s:04]] relabels and labels mined episodes; [[s:03]] versions the new snapshot; [[s:07]]/[[s:08]] train or RL-fine-tune; [[s:10]] runs the pre-defined A/B; [[s:12]] rolls out and measures recurrence; [[s:00]] updates specs if the ticket reveals sensing gaps." },
    { q: "Why are interventions more valuable than new teleop demos, and how should they be weighted?", a: "They lie on the policy's own state distribution exactly where it fails and include the correction. Weight them up for imitation (HG-DAgger) or treat corrected segments as positive-advantage and preceding segments as negative in advantage conditioning, with reason codes to exclude interventions made for non-failure reasons." },
    { q: "How does shadow mode help the flywheel, and what can it not tell you?", a: "It shows where the candidate disagrees with production on real fleet data (cheap triage, labelling targets) and pre-screens catastrophic differences. It cannot show closed-loop consequences such as recovery behaviour or compounding errors; those need canary or A/B." },
    { q: "When should a failure trigger a change in stage 00 instead of more data?", a: "When the failure is unobservable with current sensors (e.g. latch state not visible and no F/T), when the action space cannot express the needed behaviour (e.g. no stiffness control), or when the task spec or success predicate is wrong. More data cannot fix missing information." }
  ]
};
