/* Stage 06 — Sim <-> Real transfer. Schema: MAINTENANCE.md */
window.PAI = window.PAI || {}; PAI.stages = PAI.stages || {};
PAI.stages["stage-06"] = {
  id: "stage-06", num: "06", title: "Sim ↔ Real transfer", short: "Sim ↔ Real",
  version: "1.0.0", last_verified: "2026-10-07",
  upstream: [
    { id: "stage-05", what: "simulators, synthetic data, randomization configs" },
    { id: "stage-03", what: "real logs, scans and trajectories for reconstruction and system ID" },
    { id: "stage-01", what: "calibrated cameras for scene reconstruction" }
  ],
  downstream: [
    { id: "stage-07", what: "co-training mixtures (ratio α) and sim-pretrained weights" },
    { id: "stage-08", what: "aligned simulators (sysID, delta-action models) for RL" },
    { id: "stage-10", what: "real2sim evaluation environments with measured sim–real correlation" },
    { id: "stage-05", what: "identified parameters and reconstructed scenes back into sim (real2sim)" }
  ],
  handoff_short: "Aligned sim (identified params, actuator / delta models), reconstructed scenes (splats + collision proxies), co-training ratio, sim–real correlation report",
  purpose: "Make experience from one domain useful in the other: move policies and data from sim to real, move real scenes and dynamics into sim, and close the loop so that sim results predict real results. The deliverable is not a policy but a measured, bounded gap.",
  interface: {
    inputs: [
      { name: "Sim environments & synthetic data", format: "Isaac Lab / MuJoCo tasks, synthetic episodes", rate: "Versioned", from: "[[s:05]]" },
      { name: "Real excitation & task logs", format: "MCAP: chirps, step responses, contact trials, task episodes", rate: "Hours per robot type", from: "[[s:02]], [[s:03]]" },
      { name: "Scene captures", format: "Phone / robot video, calibrated images, CAD", rate: "Per site", from: "[[s:01]], [[s:03]]" }
    ],
    outputs: [
      { name: "Identified dynamics", format: "Parameter YAML (masses, friction, damping, motor constants, latency), actuator networks (ONNX), delta-action models", rate: "Per hardware revision", to: "[[s:05]], [[s:08]]" },
      { name: "Reconstructed scenes", format: "Gaussian splats (PLY / USD NuRec) + collision meshes + object poses", rate: "Per site / scene", to: "[[s:05]], [[s:10]]" },
      { name: "Co-training spec", format: "Mixture ratio α (sim probability per batch), per-source weights", rate: "Per training run", to: "[[s:07]]" },
      { name: "Transfer report", format: "Sim vs real success / tracking error, Pearson r of policy rankings", rate: "Per release", to: "[[s:10]], [[s:12]]" }
    ],
    handoff: "A sim is 'aligned' only with a number attached: tracking error on held-out real excitation, or rank correlation of policy scores between sim and real (PolaRiS reports r ≈ 0.9 against real and 0.98 against RoboArena). Downstream stages consume the report together with the environment; an unaligned sim may still be used for training but not for gating releases."
  },
  mental_model: "Every transfer method attacks one of three gaps: **dynamics** (how the world responds to actions), **perception** (what sensors see), and **distribution** (which situations occur). Diagnose which gap dominates before choosing a method; randomization, identification and real data each fix a different one.",
  mental_detail: "**Sim2real** pushes policies trained in sim into the world, relying on randomization and robust control. **Real2sim** builds sims from reality (system identification, scene reconstruction) so that simulation reflects your robot and site. **Real2sim2real** closes the loop: reconstruct the real scene, fine-tune or robustify in that twin (often with RL), deploy, and repeat (RialTo: >67 % robustness increase from phone-scanned digital twins). **Co-training** sidesteps transfer of policies and instead mixes sim and real data in one training run.\n\nWhere it works in 2026: proprioceptive locomotion and whole-body tracking transfer zero-shot routinely; rigid pick-and-place vision policies benefit from co-training and GS-rendered data; dexterous in-hand rotation transfers with heavy randomization and tactile/proprio inputs; tight-tolerance insertion and deformables transfer poorly and rely on real data plus residual RL.",
  methods: [
    { id: "dr-transfer", name: "Domain randomization & robust training", tags: ["sim2real", "rl", "sim"],
      summary: "Randomize what you cannot measure (see [[s:05]]); add observation noise and action latency; train with privileged teacher → proprioceptive student distillation so the student infers hidden parameters from history. Remains the default for locomotion and WBC.",
      pros: "No real data; robust policies.", cons: "Conservative behaviour; cannot fix systematic bias (e.g. a gearbox backlash model that is structurally wrong)." },
    { id: "sysid", name: "System identification & actuator models", tags: ["real2sim", "classical"],
      summary: "Fit physical parameters from excitation data (masses, friction, damping, motor torque curves, latency) or learn an **actuator network** that maps commanded targets and history to produced torque (ANYmal, Science Robotics 2019). Identify per hardware revision, not per robot unit, unless unit variance is large.",
      pros: "Fixes the largest dynamics errors cheaply; transfers across tasks.", cons: "Requires excitation trajectories and safe test rigs; contact parameters are hard to identify.",
      refs: [{ t: "Hwangbo et al. 2019", u: "https://arxiv.org/pdf/1901.08652" }] },
    { id: "delta-action", name: "Delta-action / residual dynamics models", tags: ["real2sim2real", "rl"],
      summary: "Deploy a sim-trained policy, record real rollouts, learn a **delta action model** that makes sim reproduce real trajectories, then fine-tune the policy in the corrected sim (ASAP, RSS 2025: G1 agile whole-body skills; outperforms SysID, DR and delta-dynamics baselines).",
      pros: "Corrects unmodelled dynamics with modest real data; keeps sim speed.", cons: "Delta model is policy-distribution-specific; must be refreshed as the policy changes.",
      refs: [{ t: "ASAP", u: "https://arxiv.org/abs/2502.01143" }] },
    { id: "residual-policy", name: "Residual policies on top of a base controller", tags: ["rl", "classical", "sim2real"],
      summary: "Learn a small correction on top of a classical controller or a frozen generalist policy, in sim or directly on the robot. PLD uses residual RL actors to probe a VLA's failure regions and distil the data back ([[s:08]]); HiL-ResRL adds human-in-the-loop residual RL as a model-agnostic adapter.",
      pros: "Small search space, safe exploration, preserves base behaviour.", cons: "Bounded by what the base policy can represent; the residual can mask base-policy drift." },
    { id: "cotraining", name: "Sim-and-real co-training", tags: ["sim2real", "il"],
      summary: "Train on a mixture of real and sim data with sampling probability α for sim. NVIDIA/UT study: sim data improves real performance by **38 % on average** even with visible gaps, and more sim beyond a 1:1 mix (1:5) can still help; gains persist with 400 real demos. Later work reports +24 % on OpenVLA and +20 % on π0.5 from co-training variants. Tune α on real eval, not sim.",
      pros: "Simplest way to benefit from sim for vision policies; no policy transfer step.", cons: "α is task-specific; sim artefacts can be learned as shortcuts.",
      refs: [{ t: "Sim-and-Real Co-Training", u: "https://arxiv.org/html/2503.24361v2" }] },
    { id: "gs-real2sim", name: "Real2sim scene reconstruction (Gaussian splatting)", tags: ["real2sim", "real2sim2real", "sim"], frontier: true, frontier_ref: "neural-rendering-3d",
      summary: "Reconstruct scenes from phone or robot video as Gaussian splats for photoreal rendering, paired with collision proxies and object poses for physics: PolaRiS (real-to-sim evaluation, r ≈ 0.9 to real), RoboGSim (real2sim2real demo synthesis), SplatSim (zero-shot sim2real of RGB policies), Real2Render2Real (data from an object scan + one human video, no dynamics sim or robot), RL-GSBridge (GS inside RL sim). Isaac Sim 6.0 ships NuRec splat support.",
      pros: "Closes the visual gap for a specific site; makes eval environments cheap to create.", cons: "Static backgrounds; object dynamics need separate meshes; lighting changes break appearance.",
      refs: [{ t: "PolaRiS", u: "https://arxiv.org/pdf/2512.16881" }, { t: "Real2Render2Real", u: "https://arxiv.org/pdf/2505.09601" }, { t: "RoboGSim", u: "https://arxiv.org/html/2411.11839" }] },
    { id: "digital-twin", name: "Digital twins & real2sim2real loops", tags: ["real2sim2real", "rl", "sim"],
      summary: "Scan a real environment, build a twin, fine-tune or robustify policies in it (often with RL), deploy, collect failures, update the twin. RialTo (RSS 2024) does this from phone scans with 'inverse distillation' of real demos into sim. Industrial twins (Omniverse/USD) also serve commissioning and safety validation.",
      pros: "Site-specific robustness without large real data.", cons: "Twin maintenance cost; fidelity limits on deformables and contact.",
      refs: [{ t: "RialTo", u: "https://arxiv.org/abs/2403.03949v2" }] },
    { id: "visual-transfer", name: "Visual sim2real via generative augmentation", tags: ["sim2real", "fm"],
      summary: "Restyle sim renders toward the real camera distribution (Cosmos Transfer with depth/segmentation controls), or train on large pretrained visual encoders robust to appearance shift. Often combined with co-training.",
      pros: "Addresses appearance gap without touching physics.", cons: "May alter fine geometry; compute cost." },
    { id: "sim2sim", name: "Sim2sim validation", tags: ["sim2real", "sim"],
      summary: "Before hardware, evaluate a policy trained in engine A in engine B (e.g. Isaac Lab → MuJoCo; ASAP also evaluates IsaacGym → IsaacSim and → Genesis). Policies that exploit simulator artefacts usually fail here first.",
      pros: "Cheap, safe filter before real deployment.", cons: "Passing sim2sim does not guarantee sim2real." }
  ],
  extras: [
    { title: "Where each transfer method works", note: "Qualitative synthesis of 2024–2026 results; ✓ = routinely works, ~ = works with care / partial evidence, ✗ = rarely sufficient alone.",
      columns: ["Method", "Locomotion / WBC", "Rigid manipulation (vision)", "Dexterous in-hand", "Deformables", "Tight contact (insertion)"],
      rows: [
        ["Domain randomization", "✓ standard", "~ needs visual DR or co-training", "~ with heavy DR + proprio/tactile", "✗", "~ for force-controlled residuals"],
        ["System ID / actuator nets", "✓ big gains on agility", "~ arm dynamics rarely the bottleneck", "~", "✗ material params hard", "~ friction/compliance ID helps"],
        ["Delta-action models (ASAP)", "✓ agile humanoid skills", "~ little evidence", "~", "✗", "~"],
        ["Sim-real co-training", "—", "✓ +38 % avg (2025 study)", "~", "~ with real-heavy mix", "~ sim helps approach, not contact"],
        ["GS real2sim (PolaRiS, R2R2R)", "—", "✓ eval and data for static scenes", "~", "✗ static splats", "✗ contact physics not modelled"],
        ["Real2sim2real twins (RialTo)", "~", "✓ site-specific robustness", "~", "✗", "~"],
        ["Residual RL", "~", "✓ last-mile fixes", "✓", "~", "✓ common in real-world RL (HIL-SERL, PLD)"]
      ] }
  ],
  decision: [
    { "if": "Humanoid or quadruped locomotion / whole-body tracking", use: "DR + privileged teacher-student + actuator modelling; sim2sim check; ASAP-style delta model for agile skills", why: "Proven zero-shot pipeline; delta models fix residual dynamics errors." },
    { "if": "Vision manipulation policy with sim data available", use: "Co-training with α tuned on real eval (start 0.2–0.5), visual augmentation", why: "Consistent real gains without a separate transfer step." },
    { "if": "Need a reliable eval environment for a specific site", use: "GS real2sim (PolaRiS-style) + small sim fine-tuning to raise correlation; report Pearson r", why: "Cheap, reproducible evaluation correlated with real." },
    { "if": "Tight-tolerance insertion", use: "Real data for the base policy + residual RL on the real robot (or in a sysID'd contact sim)", why: "Contact physics gap is too large for zero-shot transfer." },
    { "if": "Robustness at one deployment site", use: "Real2sim2real twin (RialTo-style) with RL fine-tuning", why: "Site-specific variation covered without big real data." },
    { "if": "Sim and real results disagree", use: "Diagnose: replay real actions in sim (dynamics gap), render real poses in sim (perception gap), compare state distributions (distribution gap)", why: "Each gap has a different fix." }
  ],
  tools: [
    { id: "asap", name: "ASAP", what: "Delta-action model framework for aligning sim and real humanoid dynamics", maker: "CMU + NVIDIA", open: "open", license: "See repo", maturity: "research", best_for: "Agile humanoid whole-body skills on Unitree G1", limitations: "Policy-specific delta models; humanoid-focused evidence", release: "2025-02", version: "RSS 2025", link: "https://www.ri.cmu.edu/project/asap/", runs: ["sim", "robot"], tech: ["real2sim2real", "rl"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "polaris", name: "PolaRiS", what: "Real-to-sim evaluation: GS scene reconstruction + 3D object generation; hub of DROID scenes", maker: "Academic (DROID / RoboArena community)", open: "open", license: "See repo / HF hub", maturity: "pilot", best_for: "Cheap, correlated evaluation of generalist policies", limitations: "Static scenes; contact-heavy tasks less faithful", release: "2025-12", version: "RSS 2026", link: "https://roboticsproceedings.org/rss22/p062.html", runs: ["sim", "cloud"], tech: ["real2sim"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "r2r2r", name: "Real2Render2Real", what: "Robot data from an object scan + one human video via GS rendering; no dynamics sim or robot", maker: "UC Berkeley AUTOLab", open: "open", license: "See repo", maturity: "research", best_for: "Scaling rigid / articulated object manipulation data cheaply", limitations: "Kinematic replay only; no contact dynamics", release: "2025-05", version: "CoRL 2025", link: "https://arxiv.org/pdf/2505.09601", runs: ["cloud", "sim"], tech: ["real2sim", "il"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "robogsim", name: "RoboGSim", what: "Real2sim2real GS simulator for demo synthesis with novel scenes, objects and views", maker: "Academic", open: "open", license: "See repo", maturity: "research", best_for: "Photoreal synthetic demos for VLA training", limitations: "Zero-shot parity claims need independent replication", release: "2024-11", version: "arXiv 2411.11839", link: "https://arxiv.org/html/2411.11839", runs: ["sim"], tech: ["real2sim2real"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "rialto", name: "RialTo", what: "Phone-scanned digital twins + RL fine-tuning with inverse distillation of real demos", maker: "MIT (Agrawal lab) + UW", open: "open", license: "See repo", maturity: "research", best_for: "Robustifying IL policies at a specific site", limitations: "Twin construction effort per scene; rigid objects", release: "2024-03", version: "RSS 2024", link: "https://arxiv.org/abs/2403.03949v2", runs: ["sim"], tech: ["real2sim2real", "rl"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "gsplat-tool", name: "gsplat", what: "CUDA library for Gaussian-splat rasterization and training (nerfstudio)", maker: "nerfstudio project", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Building splat reconstructions for real2sim pipelines", limitations: "Reconstruction only; physics proxies separate", release: "2025-07-04", version: "1.5.3", link: "https://github.com/nerfstudio-project/gsplat/releases", runs: ["cloud"], tech: ["real2sim"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "isaac-nurec", name: "Isaac Sim 6.0 NuRec", what: "Neural reconstruction (Gaussian splats) rendered inside Isaac Sim", maker: "NVIDIA", open: "mixed", license: "Isaac Sim Apache-2.0; NuRec libraries per NVIDIA terms", maturity: "pilot", best_for: "Photoreal digital twins of real sites inside the NVIDIA stack", limitations: "NVIDIA-only; dynamic objects need meshes", release: "2026-06", version: "Isaac Sim 6.0", link: "https://radiancefields.com/nvidia-s-isaac-sim-6.0-ships-with-nurec-gaussian-splatting", runs: ["sim"], tech: ["real2sim"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "cosmos-transfer-06", name: "Cosmos Transfer 2.5", what: "Controlled video restyling for visual sim2real (see [[s:05]])", maker: "NVIDIA", open: "mixed", license: "Apache-2.0 code; Open Model License weights", maturity: "pilot", best_for: "Appearance gap reduction while keeping geometry", limitations: "Compute; geometry drift near contacts", release: "2026-02-23", version: "2.5 (edge-distilled)", link: "https://github.com/nvidia-cosmos/cosmos-transfer2.5", runs: ["cloud"], tech: ["sim2real"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "isaaclab-dr", name: "Isaac Lab / mjlab randomization & curricula", what: "Event managers for physics, actuator and observation randomization", maker: "NVIDIA / mujocolab", open: "open", license: "BSD-3 / Apache-2.0", maturity: "production", best_for: "Standard DR and teacher-student pipelines", limitations: "DR ranges are hand-tuned", release: "2026-09-16", version: "Isaac Lab 3.0-EA · mjlab 1.6.0", link: "https://github.com/isaac-sim/IsaacLab/releases", runs: ["sim"], tech: ["sim2real", "rl"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null }
  ],
  where: {
    cloud: { l: 2, n: "reconstruction, co-training jobs" },
    onprem: { l: 1, n: "" },
    sim: { l: 3, n: "aligned sims and twins" },
    edge: { l: 1, n: "" },
    robot: { l: 2, n: "excitation runs, real rollouts for delta models" }
  },
  tech: {
    il: { l: 2, n: "co-training mixtures" },
    rl: { l: 2, n: "RL in twins, residual RL" },
    classical: { l: 2, n: "system identification" },
    sim2real: { l: 3, n: "the core of the stage" },
    real2sim: { l: 3, n: "sysID, GS scenes" },
    real2sim2real: { l: 3, n: "twin loops, delta models" },
    fm: { l: 1, n: "generative visual transfer" },
    wam: { l: 1, n: "neural sims as alternative to aligned physics" },
    icl: { l: 0, n: "" }
  },
  stacks: {
    open: { title: "Open stack", items: [
      "Isaac Lab or mjlab DR + teacher-student for locomotion; MuJoCo for sim2sim checks",
      "gsplat / nerfstudio reconstructions + PolaRiS-style eval scenes",
      "Co-training with α sweeps logged per run; Cosmos Transfer for visual augmentation",
      "ASAP code for delta-action alignment on humanoids"
    ], note: "Report sim–real correlation for every sim used to gate decisions." },
    industry: { title: "Industry pattern", items: [
      "Actuator characterization rigs and per-revision dynamics models for humanoids",
      "Digital twins of customer sites (USD, NuRec) for commissioning and regression",
      "Co-training of sim and real at foundation-model scale (ratios undisclosed)",
      "Neural world simulators as an alternative to aligned physics for evaluation (1X, Tesla)"
    ], note: "Most companies describe methods qualitatively." }
  },
  example: {
    summary: "For MB-1 the dynamics gap that matters is **contact during insertion**; the perception gap is **lighting and cable clutter**. The team (1) identifies arm joint friction and the gripper force curve from excitation runs, (2) measures connector insertion force profiles on a test rig and tunes Newton SDF contact stiffness/friction until simulated force traces match within 15 %, (3) builds GS reconstructions of each workcell for evaluation, and (4) co-trains with α = 0.25 sim, chosen by a real-eval sweep over {0, 0.1, 0.25, 0.5}.",
    artifacts: [
      { artifact: "`sysid/mb1-revC.yaml`", format: "YAML", shape: "per-joint viscous/Coulomb friction, gripper force map, control latency 6 ± 2 ms", consumer: "[[s:05]] envs, [[s:08]] residual RL" },
      { artifact: "Insertion force validation", format: "CSV + plots", shape: "50 real vs 50 sim insertions; peak-force error 11 %; seating depth error 0.3 mm", consumer: "transfer report" },
      { artifact: "`scenes/site3_cell2.usdz`", format: "USD with NuRec splat + collision meshes", shape: "≈ 2 GB; 40 fixed objects posed by FoundationPose", consumer: "[[s:10]] real2sim eval" },
      { artifact: "Transfer report v2026.09", format: "Markdown + JSON", shape: "Pearson r (sim vs real success over 12 checkpoints) = 0.83; α sweep results", consumer: "[[s:10]] gating, [[s:07]] mixture" }
    ],
    humanoid: "H-1 is the classic sim2real case: the whole-body controller trains entirely in sim with DR over mass, friction, motor strength, PD gains and 0–20 ms latency; an actuator model is fitted on a test bench per joint type; the policy is checked sim2sim (Isaac → MuJoCo) and then deployed; agile skills get an ASAP-style delta-action model after the first real rollouts. The VLA layer above it is trained mostly on real and human data, so the two layers have entirely different transfer recipes."
  },
  pitfalls: [
    { t: "Randomizing instead of measuring", d: "Wide DR ranges hide a systematic error you could measure in an afternoon (latency, friction). Measure first, randomize the residual uncertainty." },
    { t: "Tuning α on sim performance", d: "Co-training ratios that maximize sim success usually over-weight sim. Choose α by real evaluation." },
    { t: "Reporting sim success without correlation", d: "A sim that ranks policies differently from reality is not an evaluation tool; report Pearson/Spearman over several checkpoints." },
    { t: "Stale delta models", d: "Delta-action models learned on policy v1 rollouts do not describe v3's state distribution; refresh them." },
    { t: "Assuming splats are simulators", d: "Gaussian splats render; they do not collide. Every manipulated object needs a physics proxy and a pose." },
    { t: "Skipping sim2sim", d: "Policies that exploit simulator quirks (penetration, unrealistic friction) are cheap to catch by evaluating in a second engine." }
  ],
  numbers: [
    { m: "Sim-and-real co-training gain", v: "+38 % average real-world improvement; 1:5 sim still helps; holds with 400 real demos", s: "[arXiv 2503.24361](https://arxiv.org/html/2503.24361v2)" },
    { m: "PolaRiS correlation", v: "Pearson r ≈ 0.9 vs real; r = 0.98 vs RoboArena scores", s: "[RSS 2026](https://roboticsproceedings.org/rss22/p062.html)" },
    { m: "RialTo robustness", v: "> 67 % increase in policy robustness", s: "[arXiv 2403.03949](https://arxiv.org/abs/2403.03949v2)" },
    { m: "Typical humanoid DR latency range", v: "0–20 ms action latency randomization", s: "Common practice in humanoid RL recipes; tune to measured latency" },
    { m: "Co-training on VLAs", v: "+24 % (OpenVLA), +20 % (π0.5) real success in reported variants", s: "Reported in 2026 co-training follow-ups (e.g. [arXiv 2601.19406](https://arxiv.org/abs/2601.19406v1)); attribution to one specific paper not verified" }
  ],
  papers: [
    { title: "Learning agile and dynamic motor skills for legged robots (actuator net)", year: "2019", venue: "Science Robotics", url: "https://arxiv.org/pdf/1901.08652", why: "Origin of learned actuator models for sim2real." },
    { title: "ASAP: Aligning Simulation and Real-World Physics for Learning Agile Humanoid Whole-Body Skills", year: "2025", venue: "RSS", url: "https://arxiv.org/abs/2502.01143", why: "Delta-action models; the current reference for humanoid real2sim2real." },
    { title: "Sim-and-Real Co-Training: A Simple Recipe for Vision-Based Robotic Manipulation", year: "2025", venue: "arXiv 2503.24361", url: "https://arxiv.org/html/2503.24361v2", why: "Quantified co-training gains and ratio guidance." },
    { title: "Reconciling Reality through Simulation (RialTo)", year: "2024", venue: "RSS", url: "https://arxiv.org/abs/2403.03949v2", why: "Phone-scanned digital twins with RL robustification." },
    { title: "PolaRiS: Scalable Real-to-Sim Evaluations for Generalist Robot Policies", year: "2025", venue: "RSS 2026", url: "https://arxiv.org/pdf/2512.16881", why: "GS-based real2sim evaluation with measured correlation." },
    { title: "Real2Render2Real: Scaling Robot Data Without Dynamics Simulation or Robot Hardware", year: "2025", venue: "CoRL", url: "https://arxiv.org/pdf/2505.09601", why: "Shows how far rendering-only real2sim data can go." }
  ],
  open_problems: [
    "Identifying contact parameters (friction, compliance, latch mechanics) quickly enough to be routine per part family.",
    "Dynamic scenes in GS-based simulators (moving objects, deformables, lighting change).",
    "A principled way to choose co-training ratios without many real-world sweeps.",
    "Predicting real-world performance from sim with calibrated uncertainty, not just rank correlation."
  ],
  self_check: [
    { q: "Your locomotion policy works in Isaac Lab and MuJoCo but stumbles on hardware at higher speeds only. Which gap and which fix?", a: "Dynamics gap appearing at high torque/velocity: actuator saturation, torque-speed curve or latency not modelled. Fix with actuator characterization (torque-speed limits, latency measurement) or an actuator network, then a delta-action model if agile skills still deviate. Randomization alone likely made the policy conservative elsewhere." },
    { q: "What consumes the sim–real correlation number, and what happens if it is not computed?", a: "[[s:10]] uses it to decide whether a sim benchmark can gate releases; [[s:12]] uses gated results for rollout decisions; [[s:07]] uses sim evals for checkpoint selection. Without it, teams select checkpoints on sim scores that may anti-correlate with real performance and ship regressions." },
    { q: "Co-training improved grasp success but not insertion. Why is that expected?", a: "Sim reproduces visual approach and rigid grasping reasonably; insertion depends on contact mechanics (friction, compliance, latch forces) that are poorly modelled, so sim demos teach approach behaviour but not the force-sensitive phase. Use real data and residual RL for the contact phase; consider weighting sim data by subtask." },
    { q: "Why must a GS-reconstructed evaluation scene be paired with object poses and collision meshes?", a: "The splat provides appearance for rendering camera observations; it has no geometry for physics. Any object the robot touches needs a collision proxy with the right pose, mass and friction; otherwise the policy's actions have no physical consequence in the eval." },
    { q: "When is real2sim2real worth more than collecting more real data?", a: "When variation at a site is large but structured (layouts, object placements), RL in a twin can cover thousands of configurations cheaply, and the twin can be reused for regression testing. When the failure mode is contact physics or deformables, the twin is too wrong and real data wins." }
  ]
};
