/* Stage 08 — Reinforcement learning: where it fits. Schema: MAINTENANCE.md */
window.PAI = window.PAI || {}; PAI.stages = PAI.stages || {};
PAI.stages["stage-08"] = {
  id: "stage-08", num: "08", title: "Reinforcement learning: where it fits", short: "Reinforcement learning",
  version: "1.0.0", last_verified: "2026-10-07",
  upstream: [
    { id: "stage-05", what: "GPU-parallel environments, randomization, curricula" },
    { id: "stage-06", what: "aligned simulators, delta-action models, twins" },
    { id: "stage-07", what: "base policies (VLA/WAM/diffusion) to fine-tune; value heads" },
    { id: "stage-04", what: "reward / progress / success models and advantage labels" },
    { id: "stage-12", what: "on-robot rollouts and interventions from the fleet (feedback loop)" }
  ],
  downstream: [
    { id: "stage-07", what: "RL-improved weights or distilled data merged into the generalist" },
    { id: "stage-09", what: "learned low-level controllers (locomotion, whole-body tracking) that replace or augment classical loops" },
    { id: "stage-10", what: "candidates with reliability and speed improvements for evaluation" }
  ],
  handoff_short: "RL-tuned policy weights, value/advantage models, distilled datasets; for humanoids a whole-body controller checkpoint with its tracking interface",
  purpose: "Use trial and error where demonstrations cannot reach: controllers that must be learned from physics (locomotion, whole-body tracking, dexterous in-hand skills), and the last-mile reliability, speed and recovery behaviour of imitation-trained policies. In 2026 RL is a post-training and control-layer technology, not the main source of semantic competence.",
  interface: {
    inputs: [
      { name: "Environment", format: "Sim task (Isaac Lab / mjlab / ManiSkill) or real robot with reset procedure", rate: "10³–10⁵ parallel sim envs; real: 1–10 robots", from: "[[s:05]], [[s:06]], [[s:12]]" },
      { name: "Reward signal", format: "Hand-designed terms, success detector, progress/value model, human interventions", rate: "Per step / per episode", from: "[[s:04]], operators" },
      { name: "Initial policy", format: "Checkpoint (VLA, diffusion, or from scratch), demo buffer", rate: "Per RL cycle", from: "[[s:07]]" }
    ],
    outputs: [
      { name: "RL-tuned policy", format: "Checkpoint + updated `policy.yaml`", rate: "Per cycle", to: "[[s:10]] → [[s:11]]" },
      { name: "Value / critic", format: "Value network or advantage estimator", rate: "Per cycle", to: "[[s:07]] (advantage conditioning), [[s:12]] (runtime monitoring)" },
      { name: "Distilled data", format: "Rollouts filtered by success / advantage, recovery segments", rate: "Per cycle", to: "[[s:03]] → [[s:07]] SFT" },
      { name: "Low-level controller", format: "Small MLP / transformer (e.g. 42M SONIC) exported to ONNX", rate: "Per robot revision", to: "[[s:09]], [[s:11]]" }
    ],
    handoff: "RL outputs must say what they optimize and under which reward model version. A policy that improved its success rate against a learned reward model can be exploiting that model; [[s:10]] must evaluate with independent success labels. For learned controllers, the hand-off is an interface spec (command space, rate, limits, fall/failure behaviour) consumed by the policy layer above."
  },
  mental_model: "Imitation learning gets you to competent; RL gets you to reliable and fast. In sim, RL is the primary way to learn physics-dominated controllers. On real robots, RL is a post-training loop that turns deployment experience (successes, failures, interventions) into better policies, using a strong pretrained policy to keep exploration safe and sample-efficient.",
  mental_detail: "Three placements dominate. (1) **Sim RL for control**: PPO with thousands of parallel envs, privileged teacher → proprioceptive student, domain randomization; locomotion and whole-body motion tracking (BeyondMimic, GMT, SONIC: 42M parameters, 100M+ frames / 700 h of mocap, 9k GPU-hours, 42 % lower position error than BeyondMimic). (2) **Real-world RL for precision**: off-policy actor-critic with demos and human corrections (HIL-SERL: near-perfect success within 1–2.5 h of training on dynamic and precision tasks), or residual RL on a frozen base. (3) **RL post-training of generalists**: advantage-conditioned policies trained on demos + on-policy rollouts + interventions (π*0.6 RECAP: more than doubles throughput and roughly halves failure rate on hard tasks), PPO/GRPO-style fine-tuning in sim (SimpleVLA-RL: LIBERO 99 %, real 17.5 → 38.5 % via sim2real), residual probe-and-distill (PLD), RL inside learned world models (VLA-RFT, World4RL).\n\nThe reward is the bottleneck for (2) and (3): success detectors and VLM progress models ([[s:04]]) make it possible, and also make reward hacking possible.",
  methods: [
    { id: "sim-locomotion", name: "Sim RL for locomotion & whole-body control", tags: ["rl", "sim", "sim2real"],
      summary: "PPO (rsl_rl) with 4,096+ parallel envs, curricula over terrain and commands, domain randomization, privileged teacher → student distillation; deploy zero-shot. Standard for quadrupeds and humanoid walking; mjlab and Isaac Lab ship velocity-tracking tasks.",
      pros: "Robust controllers in hours of GPU time; no demonstrations needed.", cons: "Reward shaping effort; gait style needs regularization or motion priors." },
    { id: "motion-tracking", name: "Motion-tracking controllers (humanoid foundation controllers)", tags: ["rl", "sim", "sim2real"], frontier: true, frontier_ref: "wbc-tracking",
      summary: "Train one policy to track arbitrary reference motions (retargeted human mocap), producing a **universal command interface** for higher layers: BeyondMimic (G1, LAFAN1, MIT licence), GMT, Any2Track, **SONIC** (NVIDIA, Science Robotics 2026; open-sourced Feb 2026 in GR00T-WholeBodyControl; connects GR00T N1.5 as the planner). Helix 02's System 0 plays a similar role in a closed system.",
      pros: "Decouples 'what motion' (VLA, teleop, motion generator) from 'how to stay balanced'.", cons: "Tracking quality depends on retargeting; contact-rich loco-manipulation still hard." },
    { id: "dexterous-rl", name: "Dexterous manipulation RL in sim", tags: ["rl", "sim", "sim2real"],
      summary: "In-hand reorientation and dexterous grasping with heavy randomization, tactile/proprio observations and asymmetric actor-critic; transfers for rigid objects. Usually combined with IL for reaching and grasp selection.",
      pros: "Learns contact-rich finger coordination no teleop can demonstrate.", cons: "Object and contact modelling limits; reward engineering per skill." },
    { id: "real-world-rl", name: "Real-world RL with human-in-the-loop", tags: ["rl", "robot", "il"],
      summary: "Off-policy RL (SAC-family) on the robot with demonstrations in the replay buffer, a learned reward/success classifier and human corrections during training: HIL-SERL (dynamic manipulation, precision assembly, dual-arm; 2× success and 1.8× faster than IL baselines). LeRobot ships a HIL-SERL port; ConRFT and HiL-ResRL extend the recipe to VLAs.",
      pros: "Hours of robot time to near-perfect single tasks; learns speed.", cons: "Needs resets, a reliable reward classifier and safety envelopes; per-task." ,
      refs: [{ t: "HIL-SERL", u: "https://arxiv.org/pdf/2410.21845" }] },
    { id: "recap", name: "Advantage-conditioned RL for generalists (RECAP)", tags: ["rl", "il", "fm"], frontier: true, frontier_ref: "rl-generalists",
      summary: "Train a value function on all data (demos, autonomous rollouts, interventions), compute an advantage indicator per chunk, and condition the policy on 'good' vs 'bad' advantage during training; at inference prompt for 'good'. Scales RL to a large VLA without PPO's on-policy gradient machinery. π*0.6 used it for laundry folding in real homes, box assembly and espresso.",
      pros: "Uses heterogeneous off-policy data; stable at foundation-model scale.", cons: "Value-model quality caps gains; method published but weights closed (OpenTau reimplementation exists)." ,
      refs: [{ t: "π*0.6", u: "https://arxiv.org/html/2511.14759v2" }, { t: "OpenTau RECAP tutorial", u: "https://opentau.readthedocs.io/en/stable/_sources/tutorials/RECAP.rst.txt" }] },
    { id: "vla-ppo", name: "On-policy RL fine-tuning of VLAs in sim", tags: ["rl", "sim", "fm"],
      summary: "PPO / GRPO-style updates on VLA rollouts in parallel simulators with binary success rewards: SimpleVLA-RL (veRL-based, ICLR 2026), RIPT-VLA, VLA-RL, RLinf-VLA (up to 2.27× speedup by co-locating heterogeneous workloads; v0.3 adds a real-world RL pipeline).",
      pros: "Big gains where sim covers the task; discovers new strategies.", cons: "Benchmark-heavy evidence (LIBERO saturation); sim2real gap on gains." ,
      refs: [{ t: "SimpleVLA-RL", u: "https://github.com/PRIME-RL/SimpleVLA-RL" }, { t: "RLinf", u: "https://github.com/RLinf/RLinf" }] },
    { id: "residual-rl", name: "Residual RL & probe-learn-distill", tags: ["rl", "il"],
      summary: "Freeze the generalist; learn a lightweight residual actor that corrects it in failure regions; collect hybrid rollouts aligned with the generalist's distribution; distil back by SFT (PLD, ICLR 2026: LIBERO 99 %, SimplerEnv +50 %, 100 % on real Franka and YAM tasks).",
      pros: "Safe exploration near a good policy; improvements flow back into one model.", cons: "Residual capacity is limited; distillation can dilute other skills." ,
      refs: [{ t: "PLD", u: "https://arxiv.org/abs/2511.00091v1" }] },
    { id: "wm-rl", name: "RL inside learned world models", tags: ["rl", "wam"], frontier: true, frontier_ref: "wm-simulators",
      summary: "Optimize policies against an action-conditioned video world model with VLM or learned rewards (VLA-RFT with verified rewards, World4RL, World-VLA-Loop co-evolution; Ctrl-World improves policies by 44.7 % through imagined successful trajectories + SFT). Classic latent-model RL (DreamerV3, Nature 2025; TD-MPC2) remains strong for state-based control.",
      pros: "No physics engine or robot needed; uses real-data-calibrated appearance.", cons: "Policies exploit world-model errors; 2026 diagnostics question whether robotic world models follow actions faithfully." },
    { id: "offline-rl", name: "Offline RL & value learning from logs", tags: ["rl"],
      summary: "Learn values and policies from logged fleet data without new interaction (IQL/CQL-style, or value functions used only for filtering and advantage weighting). In practice used to weight or filter data and to provide advantages for conditioning rather than as a standalone policy learner.",
      pros: "Uses all historical data including failures.", cons: "Distribution shift; overestimation on unseen actions." },
    { id: "safe-rl", name: "Safety in RL: constraints and filters", tags: ["rl", "classical"],
      summary: "Enforce constraints during training and execution: CBF-RL (control barrier functions in training; G1 safe stair climbing without a runtime filter), action limits, safety filters on exploration, human kill-switch in real RL. Safety functions still belong in certified layers ([[s:09]], [[s:14]]).",
      pros: "Safer exploration and fewer hardware incidents.", cons: "Constraints reduce performance; learned constraints are not certifiable." }
  ],
  extras: [
    { title: "Where IL wins, RL wins, hybrids win", note: "Rule-of-thumb synthesis from 2024–2026 evidence.",
      columns: ["Situation", "Winner", "Why"],
      rows: [
        ["Semantic, long-horizon, language-conditioned household tasks", "IL (pretrained VLA/WAM) + RL post-training", "Semantics come from pretraining and demos; RL polishes reliability (RECAP)"],
        ["Legged locomotion, balance, whole-body tracking", "RL in sim", "Physics-dominated; demonstrations of torques do not exist"],
        ["Dexterous in-hand rotation", "RL in sim (+ IL for approach)", "Finger coordination not teleoperable at quality"],
        ["Precision insertion / assembly on one product", "Hybrid: IL base + real-world RL (HIL-SERL, residual)", "RL learns fine contact and speed in hours"],
        ["Throughput / cycle-time optimization", "RL (or advantage conditioning)", "Demos encode human speed; RL rewards speed directly"],
        ["Recovering from failures", "Hybrid: interventions + RL", "Corrections give data; RL learns when to apply them"],
        ["New task with 10 demos", "IL with a strong pretrained model / ICL", "RL needs reward and resets; too slow to start"]
      ] }
  ],
  decision: [
    { "if": "Locomotion or whole-body tracking for a humanoid", use: "PPO in Isaac Lab / mjlab with DR + teacher-student; start from a motion-tracking recipe (BeyondMimic, SONIC)", why: "Mature, open, zero-shot transfer." },
    { "if": "Single precision task in a fixed cell, need ~100 % success", use: "HIL-SERL-style real-world RL with demos and a success classifier", why: "1–2.5 h of training reported for near-perfect success." },
    { "if": "Generalist VLA with deployment data and interventions", use: "Advantage-conditioned post-training (RECAP-style) with a value model", why: "Uses heterogeneous off-policy data at foundation scale." },
    { "if": "Task well covered by a sim benchmark", use: "PPO/GRPO VLA fine-tuning (SimpleVLA-RL, RLinf) then validate in real", why: "Cheap rollouts; confirm sim gains transfer." },
    { "if": "Generalist fails in specific regions, retraining is expensive", use: "Residual RL probe → distill (PLD)", why: "Targets failures, keeps one model." },
    { "if": "No physics sim of the task, but lots of real video", use: "World-model RL (Ctrl-World, VLA-RFT) with independent real validation", why: "Neural sims enable rollouts; guard against exploitation." }
  ],
  tools: [
    { id: "rsl-rl", name: "rsl_rl", what: "GPU-friendly PPO / distillation library used by Isaac Lab and mjlab", maker: "ETH Zurich RSL", open: "open", license: "BSD-3-Clause", maturity: "production", best_for: "Locomotion and WBC PPO with teacher-student", limitations: "On-policy only; minimal by design", release: "2026-09-09", version: "5.5.1", link: "https://github.com/leggedrobotics/rsl_rl/releases", runs: ["sim", "cloud"], tech: ["rl"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "isaaclab-rl", name: "Isaac Lab (RL tasks)", what: "Locomotion, WBC, dexterous and manipulation RL environments", maker: "NVIDIA", open: "open", license: "BSD-3-Clause", maturity: "production", best_for: "Large-scale sim RL with photoreal sensors if needed", limitations: "3.0 still early access", release: "2026-09-16", version: "3.0.0-EA / 2.3.2", link: "https://github.com/isaac-sim/IsaacLab/releases", runs: ["sim"], tech: ["rl", "sim2real"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "mjlab-rl", name: "mjlab", what: "MuJoCo Warp RL framework (velocity tracking, motion imitation)", maker: "mujocolab", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Humanoid tracking/locomotion with MuJoCo fidelity", limitations: "NVIDIA GPU needed for training", release: "2026-08-09", version: "1.6.0", link: "https://github.com/mujocolab/mjlab", runs: ["sim"], tech: ["rl"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "sonic", name: "SONIC (GR00T-WholeBodyControl)", what: "42M-parameter motion-tracking foundation controller for humanoids", maker: "NVIDIA GEAR", open: "open", license: "Code Apache-2.0; weights NVIDIA Open Model License", maturity: "pilot", best_for: "Universal whole-body control interface under a VLA or teleop", limitations: "G1-centric evidence; tracking ≠ task success", release: "2026-02-20", version: "GEAR-SONIC", link: "https://github.com/NVlabs/GR00T-WholeBodyControl", runs: ["sim", "edge", "robot"], tech: ["rl", "sim2real"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "beyondmimic", name: "BeyondMimic", what: "Dynamic motion tracking with steerable test-time control (G1, LAFAN1)", maker: "UC Berkeley HybridRobotics", open: "open", license: "MIT", maturity: "research", best_for: "Open baseline for humanoid motion tracking", limitations: "Single robot; separate deployment repo", release: null, version: "rolling", release_note: "rolling", link: "https://github.com/HybridRobotics/whole_body_tracking", runs: ["sim", "robot"], tech: ["rl", "sim2real"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "rlinf", name: "RLinf", what: "RL infrastructure for embodied AI: VLA RL in many simulators and real robots (Franka)", maker: "Tsinghua + Infini-AI", open: "open", license: "Apache-2.0", maturity: "pilot", best_for: "Scaling RL fine-tuning of π0/π0.5, OpenVLA, GR00T N1.5–N1.7", limitations: "Complex distributed setup", release: "2026-07", version: "v0.3", link: "https://github.com/RLinf/RLinf", runs: ["cloud", "sim", "robot"], tech: ["rl", "fm"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "simplevla-rl", name: "SimpleVLA-RL", what: "veRL-based RL for VLAs with VLA-specific sampling and parallel rendering", maker: "PRIME-RL (Tsinghua et al.)", open: "open", license: "See repo", maturity: "research", best_for: "Sim RL fine-tuning of VLAs on LIBERO / RoboTwin", limitations: "Benchmark-centric; sim2real gains smaller", release: "2025-09", version: "ICLR 2026", link: "https://github.com/PRIME-RL/SimpleVLA-RL", runs: ["cloud", "sim"], tech: ["rl", "fm"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "hilserl", name: "HIL-SERL (LeRobot port)", what: "Human-in-the-loop sample-efficient real-world RL", maker: "UC Berkeley (orig.); Hugging Face (port)", open: "open", license: "Apache-2.0 (LeRobot)", maturity: "pilot", best_for: "Single-task precision skills in hours on a real robot", limitations: "Per-task; needs reward classifier and resets", release: "2024-10", version: "paper 2410.21845", link: "https://arxiv.org/pdf/2410.21845", runs: ["robot", "edge"], tech: ["rl", "il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "pld", name: "PLD (Probe, Learn, Distill)", what: "Residual RL + distribution-aware data collection + SFT distillation into a VLA", maker: "UT Austin + NVIDIA", open: "open", license: "See project", maturity: "research", best_for: "Self-improving VLAs without full RL fine-tuning", limitations: "Evidence mostly LIBERO/SimplerEnv + small real tasks", release: "2025-10", version: "ICLR 2026", link: "https://arxiv.org/abs/2511.00091v1", runs: ["sim", "robot", "cloud"], tech: ["rl", "il"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "dreamerv3", name: "DreamerV3", what: "General latent world-model RL with fixed hyperparameters (Nature 2025)", maker: "Google DeepMind / Hafner et al.", open: "open", license: "MIT", maturity: "research", best_for: "Model-based RL baselines; state- and pixel-based control", limitations: "Not a manipulation-VLA tool; long training", release: "2025-04", version: "Nature publication", link: "https://github.com/danijar/dreamerv3", runs: ["sim", "cloud"], tech: ["rl", "wam"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "tdmpc2", name: "TD-MPC2", what: "Scalable model-based RL with latent MPC (up to 317M params)", maker: "UC San Diego (Hansen et al.)", open: "open", license: "MIT", maturity: "research", best_for: "Continuous control across many tasks; MPC-flavoured RL", limitations: "Last push May 2025", release: "2025-05", version: "repo (last push May 2025)", link: "https://gittrend.io/repo/nicklashansen/tdmpc2", runs: ["sim"], tech: ["rl", "wam"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null }
  ],
  where: {
    cloud: { l: 2, n: "learner processes, value models" },
    onprem: { l: 1, n: "" },
    sim: { l: 3, n: "most RL samples come from sim" },
    edge: { l: 2, n: "actors on robots for real-world RL" },
    robot: { l: 2, n: "real-world RL and interventions" }
  },
  tech: {
    il: { l: 2, n: "demos seed RL; distillation back to IL" },
    rl: { l: 3, n: "the stage" },
    classical: { l: 1, n: "safety filters, CBFs, reward terms" },
    sim2real: { l: 3, n: "sim RL must transfer" },
    real2sim: { l: 1, n: "" },
    real2sim2real: { l: 2, n: "RL in twins / corrected sims" },
    fm: { l: 2, n: "RL post-training of foundation policies" },
    wam: { l: 2, n: "RL inside world models" },
    icl: { l: 0, n: "" }
  },
  stacks: {
    open: { title: "Open stack", items: [
      "Locomotion/WBC: mjlab or Isaac Lab + rsl_rl; motion tracking from BeyondMimic or SONIC",
      "VLA RL: RLinf or SimpleVLA-RL in ManiSkill / LIBERO / RoboTwin; PLD for residual probe-and-distill",
      "Real-world: LeRobot HIL-SERL with a learned success classifier",
      "Rewards: GVL / Robometer / TOPReward-style progress models, validated on human labels"
    ], note: "Start RL only after you have a reliable success signal." },
    industry: { title: "Industry (public)", items: [
      "Physical Intelligence: RECAP advantage-conditioned RL on deployment data (π*0.6)",
      "Figure Helix 02: learned System 0 for balance/contact; trained on >1,000 h retargeted human motion",
      "NVIDIA: SONIC whole-body control under GR00T; RL in Isaac Lab for humanoid partners",
      "Humanoid makers broadly: sim RL locomotion with DR and actuator models (details rarely published)"
    ], note: "Reward models and value functions are core IP and rarely released." }
  },
  example: {
    summary: "MB-1 uses RL in two narrow places. (1) **Insertion residual**: a small residual actor (MLP on wrench + EE pose, outputs Δpose in the compliance frame, ±2 mm / ±2°) trained first in the sysID'd Newton contact sim, then 6 h of HIL-SERL-style real training per connector family with a latch-click + F/T success classifier. (2) **RECAP-style post-training** of the full policy every 4 weeks on deployment data: a value model trained on progress labels assigns advantage bins; the policy is fine-tuned with the advantage token and prompted with 'good' at inference.",
    artifacts: [
      { artifact: "Residual actor `ins_res@v7`", format: "ONNX (MLP 3×256)", shape: "in: wrench(6) + EE pose err(9) + base action(10) → out Δ(6), 50 Hz", consumer: "[[s:09]] action server (summed before impedance)" },
      { artifact: "Success classifier", format: "Small CNN on wrist image + F/T + audio features", shape: "precision 0.98 / recall 0.95 vs human labels", consumer: "reward for real RL; [[s:10]] metrics" },
      { artifact: "Value model `val@2026.09`", format: "Transformer head on frozen policy features", shape: "per-chunk value ∈ [0,1]; advantage bin threshold at 0", consumer: "[[s:07]] RECAP fine-tune, [[s:12]] runtime progress monitor" },
      { artifact: "RL report", format: "Markdown", shape: "insertion success 91 → 98.6 %; cycle −4.1 s; peak force −18 %", consumer: "[[s:10]] gating" }
    ],
    humanoid: "For H-1, RL is the **primary** controller technology: the whole-body tracking policy (SONIC-class, tens of millions of parameters) is trained entirely in sim with PPO, tracking retargeted mocap; it runs at 50 Hz on the robot producing PD targets for 1 kHz joint control. Manipulation skills come from the VLA (IL) layer above; RL post-training of that VLA follows the manipulation recipe."
  },
  pitfalls: [
    { t: "Reward hacking against learned reward models", d: "Policies find states the VLM or progress model scores highly without completing the task. Hold out an independent success signal for evaluation." },
    { t: "Starting RL too early", d: "Without a decent base policy and a reliable reward, real-world RL wastes hours and hardware. Get IL to 50–80 % first." },
    { t: "Sim RL gains that do not transfer", d: "LIBERO-style gains of 10–20 points often shrink on real robots (SimpleVLA-RL: 17.5 → 38.5 % real). Budget for sim2real validation." },
    { t: "Forgetting other skills", d: "RL on one task degrades others in a generalist; mix in SFT data or use residual/distillation schemes." },
    { t: "Unsafe exploration on hardware", d: "Bound residual actions, run impedance control with force limits, keep a human kill-switch and safety-rated stops during real RL." },
    { t: "Stale value models", d: "Value/advantage models trained on old policy data misjudge new behaviour; retrain with each cycle." }
  ],
  numbers: [
    { m: "HIL-SERL", v: "near-perfect success after 1–2.5 h training; 2× success, 1.8× faster than IL baselines", s: "[arXiv 2410.21845](https://arxiv.org/pdf/2410.21845)" },
    { m: "π*0.6 RECAP", v: "> 2× throughput and ≈ ½ failure rate on hardest tasks", s: "[arXiv 2511.14759](https://arxiv.org/html/2511.14759v2)" },
    { m: "SONIC scale", v: "42M params · 100M+ frames (700 h mocap) · 9k GPU-h on 128 GPUs · −42 % pos. error vs BeyondMimic", s: "[GEAR-SONIC](https://nvlabs.github.io/GEAR-SONIC/)" },
    { m: "SimpleVLA-RL", v: "LIBERO 99 %; RoboTwin +80 % relative; real 17.5 → 38.5 %", s: "[GitHub](https://github.com/PRIME-RL/SimpleVLA-RL)" },
    { m: "PLD", v: "LIBERO 99 %; SimplerEnv +50 %; 100 % on real Franka / YAM tasks", s: "[arXiv 2511.00091](https://arxiv.org/abs/2511.00091v1)" },
    { m: "Ctrl-World imagination SFT", v: "+44.7 % policy success", s: "[arXiv 2510.10125](https://arxiv.org/pdf/2510.10125)" },
    { m: "RLinf-VLA", v: "up to 2.27× training speedup", s: "[RLinf](https://github.com/RLinf/RLinf)" }
  ],
  papers: [
    { title: "π*0.6: a VLA That Learns From Experience (RECAP)", year: "2025", venue: "arXiv 2511.14759", url: "https://arxiv.org/html/2511.14759v2", why: "RL post-training of a generalist at scale using advantage conditioning." },
    { title: "Precise and Dexterous Robotic Manipulation via Human-in-the-Loop RL (HIL-SERL)", year: "2024", venue: "Science Robotics 2025", url: "https://arxiv.org/pdf/2410.21845", why: "Reference recipe for real-world RL on precision tasks." },
    { title: "SONIC: Supersizing Motion Tracking for Natural Humanoid Whole-Body Control", year: "2025", venue: "Science Robotics 2026", url: "https://arxiv.org/pdf/2511.07820", why: "Scaling laws for motion tracking; universal control interface for humanoids." },
    { title: "Self-Improving VLA Models with Data Generation via Residual RL (PLD)", year: "2025", venue: "ICLR 2026", url: "https://arxiv.org/abs/2511.00091v1", why: "Residual RL + distillation loop for generalists." },
    { title: "SimpleVLA-RL: Scaling VLA Training via Reinforcement Learning", year: "2025", venue: "ICLR 2026", url: "https://arxiv.org/pdf/2509.09674", why: "On-policy RL for VLAs in sim; what transfers and what does not." },
    { title: "Learning agile and dynamic motor skills for legged robots", year: "2019", venue: "Science Robotics", url: "https://arxiv.org/pdf/1901.08652", why: "Foundation of sim RL + actuator modelling for legged robots." }
  ],
  open_problems: [
    "Reward models robust to optimization pressure (no hacking) across embodiments.",
    "Sample-efficient real-world RL for long-horizon, multi-stage tasks with automatic resets.",
    "Combining RL post-training across many tasks without forgetting in one generalist.",
    "Safe exploration guarantees for learned policies on hardware near people."
  ],
  self_check: [
    { q: "Your RECAP-style run raises success measured by the value model from 70 % to 90 %, but human-labelled success only from 70 % to 74 %. Diagnose.", a: "The policy partially exploits the value/progress model (reaching states it scores high without finishing), or the value model is miscalibrated on new behaviours. Check disagreement cases, retrain the value model on fresh on-policy data with human labels, and always evaluate with an independent success signal ([[s:10]])." },
    { q: "Why does a motion-tracking controller make the VLA above it easier to train?", a: "It turns whole-body control into a stable command interface: the VLA outputs kinematic targets (motions, end-effector or keypoint goals) and the controller handles balance, contacts and dynamics. The VLA no longer needs to learn torques or balance from demonstrations, and teleop, motion generators and the VLA can share the same interface." },
    { q: "What must exist before you start real-world RL on an insertion task?", a: "A base policy with reasonable success, a success/reward classifier with measured precision/recall, a reset procedure, bounded action spaces (residual limits), compliant control with force limits, safety stops, and logging of every rollout with policy version for later distillation." },
    { q: "Which downstream consumers use the value function besides training?", a: "Runtime monitoring in [[s:12]] (progress stalls signal failure), failure mining in [[s:13]] (low-value segments), data weighting in [[s:04]]/[[s:07]], and test-time selection or planning (Cosmos Policy scores sampled futures by value)." },
    { q: "When is RL in a learned world model preferable to RL in a physics sim, and what is the main risk?", a: "When the task's appearance and object diversity are hard to model in physics sim but real video is plentiful (e.g. household variety), and contact precision is not the bottleneck. The risk is exploitation of world-model errors: the policy learns actions the model renders as successful but that fail physically; validate on real or a physics sim." }
  ]
};
