/* Stage 00 — Problem definition & embodiment. Schema: MAINTENANCE.md */
window.PAI = window.PAI || {}; PAI.stages = PAI.stages || {};
PAI.stages["stage-00"] = {
  id: "stage-00", num: "00", title: "Problem definition & embodiment", short: "Problem & embodiment",
  version: "1.0.0", last_verified: "2026-10-07",
  upstream: [
    { id: "stage-14", what: "regulatory class and hazard list constrain embodiment, speed and force limits from day one" },
    { id: "stage-13", what: "fleet failure statistics revise task specs and sensor suites in later iterations" }
  ],
  downstream: [
    { id: "stage-01", what: "sensor suite, mounting, sync and bandwidth requirements" },
    { id: "stage-02", what: "teleop mapping, action space and episode definition" },
    { id: "stage-05", what: "robot description (URDF / MJCF / USD) and task success predicates for sim" },
    { id: "stage-07", what: "action dimensionality, chunk length, normalization, observation set" },
    { id: "stage-09", what: "controller type and rate hierarchy" },
    { id: "stage-10", what: "acceptance metrics and test conditions" }
  ],
  handoff_short: "`task_spec.md`, `embodiment.yaml` (action/obs spaces, rates, frames), robot description (URDF/MJCF/USD), hazard list",
  purpose: "Turn a goal into a measurable task specification and an embodiment whose sensors, actuators, compute and action space make that task learnable, controllable and certifiable. Every later decision (data, model class, control rates, safety case) inherits the constraints fixed here.",
  interface: {
    inputs: [
      { name: "Task requirements", format: "Product / research brief", rate: "One-off, revised per iteration", from: "Customer, ops, research lead" },
      { name: "Environment envelope", format: "Site survey, CAD of workcell, lighting and floor data", rate: "One-off", from: "Site / facility team" },
      { name: "Budgets", format: "BOM cost, power (W), mass, compute, latency, cycle time", rate: "One-off", from: "Program management" },
      { name: "Regulatory context", format: "Applicable directives / standards list, hazard list", rate: "Per market", from: "[[s:14]]" },
      { name: "Fleet evidence (later iterations)", format: "Failure taxonomy, interventions per hour, cycle-time histograms", rate: "Monthly / quarterly", from: "[[s:13]]" }
    ],
    outputs: [
      { name: "`task_spec.md`", format: "Versioned doc: subtask graph, success predicates, tolerances, failure taxonomy, acceptance thresholds", rate: "Versioned (semver)", to: "[[s:02]], [[s:04]], [[s:10]]" },
      { name: "`embodiment.yaml`", format: "Action space (dims, frames, units, limits, normalization), observation set, control-rate hierarchy, chunk length", rate: "Versioned; changes force retraining", to: "[[s:01]], [[s:02]], [[s:07]], [[s:09]]" },
      { name: "Robot description", format: "URDF (ROS), MJCF (MuJoCo), USD (Isaac / Newton); meshes, inertias, joint limits", rate: "Versioned with hardware revision", to: "[[s:05]], [[s:09]], [[s:11]]" },
      { name: "Compute & latency budget", format: "Table: process → target HW → p99 latency budget", rate: "Versioned", to: "[[s:11]], [[s:12]]" },
      { name: "Hazard list & intended use", format: "ISO 12100-style hazard identification", rate: "Versioned", to: "[[s:14]]" }
    ],
    handoff: "The contract is the pair `embodiment.yaml` + robot description, tagged with a hardware revision. Anything that changes action dimensionality, frames, units or normalization statistics is a **breaking change**: datasets recorded under the old spec need conversion, and policy heads must be retrained or re-adapted. Treat it like a public API: version it, review changes, and record which spec version every episode was recorded under."
  },
  mental_model: "Fix the action space and the control-rate hierarchy first. They define the seam between learned and classical components, decide which data sources can supervise the policy, and set the latency budget that the rest of the pipeline must meet.",
  mental_detail: "A learned policy never commands motors directly in a well-engineered system. It emits **targets** (end-effector deltas, joint positions, whole-body motion commands) into a hierarchy of faster classical loops: a task-level planner at 0.1–2 Hz, a policy producing [[g:action-chunk|action chunks]] at 1–15 Hz, an action stream interpolated at 30–200 Hz, impedance or whole-body control at 500 Hz–1 kHz, and drive current loops at 10–40 kHz. Each boundary is a contract: units, frame, rate, and what happens when the upstream producer is late.\n\nThe action representation determines what data you can use. Relative end-effector actions transfer across embodiments and match human hand motion (GR00T N1.7 trains robot and human video in one relative end-effector space); joint-space actions are exact for one robot but do not transfer; torque actions are rarely learned outside RL. Choose the representation that your best data source naturally provides, then let [[s:09]] convert it to what the hardware needs.",
  methods: [
    { id: "task-graph", name: "Task decomposition & success predicates", tags: ["classical"],
      summary: "Write the task as a subtask graph with machine-checkable success predicates per node (e.g. `connector_seated: insertion depth ≥ 9.5 mm AND latch click detected AND pull-test ≥ 20 N`). Attach a failure taxonomy (grasp miss, misalignment, jam, drop, collision, timeout) that annotation ([[s:04]]) and evaluation ([[s:10]]) reuse verbatim.",
      pros: "Gives annotation, reward design, success detection and eval one shared vocabulary; makes subtask-level metrics possible.",
      cons: "Over-specified graphs bias data collection toward one strategy; keep predicates on outcomes, not on motions." },
    { id: "action-space", name: "Action-space design", tags: ["il", "rl", "classical"],
      summary: "Choose (1) space: joint position, end-effector pose, or whole-body command; (2) absolute vs **relative** (delta from current or from chunk start); (3) frame: base, world, or camera; (4) rotation encoding: 6D continuous rotation avoids quaternion sign flips; (5) gripper: continuous width or binary; (6) chunk length H and control frequency; (7) normalization: per-dimension quantiles, frozen with the dataset version. FAST-style tokenizers assume actions normalized to [-1, 1] ([FAST](https://arxiv.org/pdf/2501.09747)).",
      pros: "Relative EE actions are robust to calibration drift and enable cross-embodiment and human-video pretraining.",
      cons: "Relative actions accumulate drift over long chunks; absolute joint targets are precise but embodiment-locked. Normalization stats leaking across dataset versions silently degrades policies.",
      refs: [{ t: "GR00T N1.7 (relative EEF shared by robot and human)", u: "https://github.com/NVIDIA/Isaac-GR00T" }] },
    { id: "rate-hierarchy", name: "Control-rate hierarchy (dual / triple system)", tags: ["il", "rl", "classical", "fm"], frontier: true, frontier_ref: "hierarchical",
      summary: "Split the controller into a slow reasoning layer, a learned visuomotor layer and a fast stabilizing layer. Figure's Helix 02 (Jan 2026) runs a ~10M-parameter **System 0** at ~1 kHz for balance and contact, a 200 Hz **System 1** producing full-body joint targets, and a slow **System 2** for goals ([report](https://humanoidroboticstechnology.com/industry-news/figure-launches-helix-02/)). For fixed-base manipulators the fast layer is usually classical impedance control rather than a learned S0.",
      pros: "Each layer gets the latency it needs; slow models stop being on the safety-critical path.",
      cons: "Interfaces between layers become the main failure surface (stale targets, frame mismatches, handoff jitter)." },
    { id: "embodiment-data-fit", name: "Embodiment-data fit", tags: ["il", "fm"],
      summary: "Pick hardware for which large datasets and pretrained checkpoints already exist, or that maps cleanly from a cheap data source. Examples: Franka + wrist and external cameras ([DROID](https://arxiv.org/abs/2403.12945v2): 76k trajectories / 350 h), bimanual ALOHA-class arms, AgiBot G1 (AgiBot World: 1,003,672 trajectories), SO-101 for hobby-scale. A parallel gripper is easier to supervise from handheld [[g:umi|UMI]]-style tools than a 22-DoF hand.",
      pros: "Cuts the data you must collect yourself by an order of magnitude via fine-tuning instead of training from scratch.",
      cons: "Locks you to someone else's sensor layout; camera placement mismatch is a leading cause of poor transfer.",
      refs: [{ t: "AgiBot World", u: "https://github.com/OpenDriveLab/Agibot-World" }] },
    { id: "compute-budget", name: "Compute & latency budgeting", tags: ["edge", "robot"],
      summary: "Budget the p99 latency from photon to actuator for every loop, then assign each process to a compute target: safety MCU/PLC, real-time CPU, onboard GPU (Jetson Thor / Orin), workcell server, or cloud. With [[g:rtc|real-time chunking]] the policy latency must be shorter than the executed part of the previous chunk, not shorter than one control period.",
      pros: "Makes the on-robot vs off-board split explicit early; prevents late discovery that a 3B-parameter model misses the deadline.",
      cons: "Budgets drift as models grow; re-check after every model change ([[s:11]])." },
    { id: "sensor-rationale", name: "Sensor suite by failure mode", tags: ["robot"],
      summary: "Derive sensors from the failure taxonomy, not from a catalog. Wrist cameras fix occlusion and precision; head or external cameras give context; wrist F/T and fingertip tactile resolve contact state that vision cannot see; microphones catch latch clicks and collisions. Detailed selection lives in [[s:01]].",
      pros: "Every sensor has a reason to exist and an annotation plan.",
      cons: "Each added modality adds sync, calibration, storage and model-input cost." },
    { id: "safety-by-design", name: "Hazard identification at specification time", tags: ["classical"],
      summary: "Run an ISO 12100-style hazard identification before freezing the embodiment: payload, speed, pinch points, fall behavior (critical for humanoids, which have no statically safe state on power loss), human co-presence. ISO 10218-1:2025 introduces robot classes with matching functional-safety requirements ([A3 FAQ](https://www.automate.org/robotics/blogs/updated-iso-10218-faq)).",
      pros: "Cheaper to choose a power-and-force-limited arm than to retrofit a safety case.",
      cons: "Conservative limits reduce achievable cycle time; quantify the trade-off explicitly." }
  ],
  decision: [
    { "if": "The task is contact-rich with sub-millimetre tolerances (insertion, snap-fit)", use: "Torque-controlled arms + wrist F/T + impedance control; relative EE actions at 30–50 Hz", why: "Compliance absorbs pose error the policy cannot see; F/T gives the contact state." },
    { "if": "You want to start from a pretrained VLA with little data", use: "An embodiment and camera layout close to the checkpoint's pretraining mix (Franka/DROID, ALOHA-class bimanual, AgiBot G1, SO-101)", why: "Fine-tuning efficiency drops sharply with camera and kinematic mismatch." },
    { "if": "In-hand dexterity is required", use: "Dexterous hand + fingertip tactile; plan glove / egocentric data ([[f:egocentric-scale|EgoScale]]-style)", why: "Teleop of 20+ DoF hands is slow and noisy; human-video pretraining is the scalable source." },
    { "if": "A legged form factor is not mandatory", use: "Wheeled bimanual base", why: "Statically stable, simpler safety case, cheaper, and most manipulation datasets are wheeled or fixed-base." },
    { "if": "Cycle time is the KPI", use: "Action chunks at 50 Hz with [[g:rtc|RTC]] or async inference; budget p99 inference < executed horizon", why: "Removes pauses at chunk boundaries (SmolVLA async inference: 9.7 s vs 13.75 s task time)." },
    { "if": "Tasks need context over minutes", use: "A planner layer or a memory-equipped policy ([[f:memory|MEM]])", why: "Single-frame VLAs cannot track progress through long tasks." },
    { "if": "You consider off-board inference", use: "Only if network p99 RTT + inference < executed horizon; keep safety and low-level control onboard", why: "Wi-Fi tail latency is unbounded; the robot must degrade safely without the link." },
    { "if": "Deploying in the EU after January 2027", use: "Plan conformity under the Machinery Regulation and the AI Act timeline from day one", why: "AI and self-evolving behaviour are explicitly covered ([[s:14]])." }
  ],
  tools: [
    { id: "menagerie", name: "MuJoCo Menagerie", what: "Curated MJCF robot models (80+), incl. Franka FR3 v2, Unitree G1, Trossen WXAI", maker: "Google DeepMind + community", open: "open", license: "Apache-2.0 (per-model licences vary)", maturity: "production", best_for: "Starting a sim-ready robot description with validated inertias and actuators", limitations: "Coverage of grippers/sensors uneven; MJCF only (convert for USD)", release: null, version: "rolling", release_note: "rolling", link: "https://github.com/google-deepmind/mujoco_menagerie", runs: ["sim"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "openusd", name: "OpenUSD", what: "Scene description format used by Isaac Sim / Isaac Lab and Newton for robots and environments", maker: "Pixar / Alliance for OpenUSD", open: "open", license: "Modified Apache 2.0", maturity: "production", best_for: "Single source of truth for robot + scene assets across sim and digital twin", limitations: "Physics schemas still evolving; URDF/MJCF round-trips lossy", release: "2026-07-20", version: "v26.08", link: "https://github.com/PixarAnimationStudios/OpenUSD/releases", runs: ["sim", "cloud"], tech: ["sim2real"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "urdf", name: "URDF (urdfdom)", what: "ROS robot description format and parser; Pinocchio 4.1 parses URDF v1.2 acceleration/jerk limits", maker: "Open Robotics / ROS community", open: "open", license: "BSD-3-Clause", maturity: "production", best_for: "ROS 2 control stacks, MoveIt 2, kinematics libraries", limitations: "No closed chains; weak actuator and sensor modelling", release: null, version: "ships with ROS 2 distros", release_note: "rolling", link: "https://github.com/ros/urdfdom", runs: ["robot", "sim"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "thor-t5000", name: "Jetson AGX Thor (T5000)", what: "Onboard robot computer: Blackwell GPU (2560 cores, 96 Tensor Cores), 14-core Neoverse-V3AE, 128 GB LPDDR5X, 2070 FP4 sparse TFLOPS, 40–130 W", maker: "NVIDIA", open: "closed", license: "Proprietary HW; JetPack SDK", maturity: "production", best_for: "Onboard VLA / WAM inference with NVFP4; humanoids and mobile manipulators", limitations: "Power envelope; JetPack/TensorRT version pinning needed for reproducibility", release: "2026-01-12", version: "JetPack 7.1 support", link: "https://forums.developer.nvidia.com/t/nvidia-jetson-t4000-and-nvidia-jetpack-7-1-now-available-accelerate-ai-inference-for-edge-and-robotics/356852", runs: ["edge", "robot"], tech: ["fm"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "thor-t4000", name: "Jetson T4000", what: "Lower-power Thor module: 1536-core Blackwell GPU, 64 GB, 1200 FP4 sparse TFLOPS, 40–70 W", maker: "NVIDIA", open: "closed", license: "Proprietary HW", maturity: "production", best_for: "Cost/thermal-constrained robots that still need FP4 inference", limitations: "Half the memory of T5000 limits multi-model co-residency", release: "2026-01-12", version: "with JetPack 7.1", link: "https://jetsonhacks.com/2026/01/12/jetpack-7-1-and-jetson-t4000-now-available/", runs: ["edge", "robot"], tech: ["fm"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "orin-agx", name: "Jetson AGX Orin 64GB", what: "Previous-generation onboard computer: 275 sparse INT8 TOPS, 2048-core Ampere, 12-core A78AE, 64 GB, 15–60 W", maker: "NVIDIA", open: "closed", license: "Proprietary HW", maturity: "production", best_for: "Perception, small VLAs (<1B) and diffusion policies; installed base", limitations: "No FP4/FP8 tensor cores; large VLAs run at a few Hz without heavy optimization", release: null, version: "in production since 2022", release_note: "mature", link: "https://connecttech.com/product/nvidia-jetson-agx-orin-64gb-module-900-13701-0050-000/", runs: ["edge", "robot"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "iq10", name: "Qualcomm Dragonwing IQ10 RRD", what: "Robotics reference design: up to 700 TOPS, 18 Oryon CPU cores, NPUs + GPU", maker: "Qualcomm", open: "closed", license: "Proprietary", maturity: "pilot", best_for: "Industrial AMRs / humanoids wanting a non-NVIDIA option with integrated connectivity", limitations: "Smaller robotics software ecosystem than CUDA/TensorRT; GA only from Sep 2026", release: "2026-09", version: "GA (announced Jun 2026)", link: "https://www.qualcomm.com/news/onq/2026/06/dragonwing-iq10-robotics-reference-design", runs: ["edge", "robot"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "so101", name: "SO-101 arm", what: "Open-hardware 6-DoF arm, leader + follower kit (~$230 for both)", maker: "TheRobotStudio + Hugging Face", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Learning the full IL loop at hobby cost; LeRobot-native", limitations: "Hobby servos: backlash, no torque sensing, low payload; not for contact-rich industrial tasks", release: null, version: "rolling", release_note: "rolling", link: "https://github.com/TheRobotStudio/SO-ARM100", runs: ["robot"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "aloha", name: "ALOHA / ALOHA 2", what: "Low-cost open bimanual teleop + learning platform (leader-follower)", maker: "Stanford / Google DeepMind", open: "open", license: "MIT", maturity: "pilot", best_for: "Bimanual fine manipulation; large compatible datasets and checkpoints (openpi ALOHA ckpts)", limitations: "Low payload; position-controlled; limited force sensing", release: null, version: "rolling", release_note: "rolling", link: "https://github.com/tonyzhaozh/aloha", runs: ["robot"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "libfranka", name: "Franka FR3 + libfranka (FCI)", what: "Torque-controlled 7-DoF research arm with 1 kHz real-time interface", maker: "Franka Robotics", open: "mixed", license: "Closed HW; libfranka source available", maturity: "production", best_for: "Impedance control, contact-rich learning, DROID-compatible setups", limitations: "1 kHz RT loop requires PREEMPT_RT host; payload 3 kg", release: "2025-07-30", version: "libfranka 0.21.3", link: "https://github.com/frankarobotics/libfranka/releases", runs: ["robot"], tech: ["classical", "il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null }
  ],
  where: {
    cloud: { l: 1, n: "specs and docs in version control" },
    onprem: { l: 1, n: "workcell survey and CAD" },
    sim: { l: 2, n: "kinematic/reachability studies, sensor FOV checks in sim" },
    edge: { l: 2, n: "compute budget decided here" },
    robot: { l: 3, n: "embodiment selection is the output" }
  },
  tech: {
    il: { l: 2, n: "action space must match demo source" },
    rl: { l: 1, n: "observation/action spaces also define RL MDP" },
    classical: { l: 3, n: "rate hierarchy, controllers, hazard analysis" },
    sim2real: { l: 1, n: "choose actuators with modelable dynamics" },
    real2sim: { l: 0, n: "" },
    real2sim2real: { l: 0, n: "" },
    fm: { l: 2, n: "pick embodiment close to pretrained checkpoints" },
    wam: { l: 1, n: "camera layout matters more for video-based models" },
    icl: { l: 0, n: "" }
  },
  stacks: {
    open: { title: "Low-cost open embodiment", items: [
      "2× SO-101 (leader/follower) or I2RT YAM arms with GELLO-style leaders",
      "2–3 USB/MIPI cameras (wrist + scene), optional RealSense D555",
      "Robot description from MuJoCo Menagerie or vendor URDF; MJCF for sim",
      "`embodiment.yaml` checked into git next to LeRobot config; RTX desktop or Jetson Orin for inference"
    ], note: "Enough to learn every interface in this map; not enough for industrial contact tasks." },
    industry: { title: "Industrial bimanual mobile manipulator (publicly described patterns)", items: [
      "Torque-controlled arms with wrist F/T, fingertip tactile, global-shutter wrist cameras",
      "Onboard Jetson AGX Thor-class GPU + separate real-time controller + safety PLC",
      "Triple hierarchy as in Figure Helix 02 (S2 reasoning / S1 visuomotor / S0 fast control) or VLA + classical impedance",
      "Robot description authored in USD for digital twin, exported to URDF for ROS 2 control"
    ], note: "Figure, 1X, Agility, Apptronik and others do not publish full specs; treat specifics as indicative." }
  },
  example: {
    summary: "**MB-1** is a bimanual mobile manipulator for an automotive electronics workcell. Task: pick wire-harness connectors from a tote, mate them onto ECU headers (snap-fit, latch click, roughly 20–60 N insertion force depending on connector family), clip the cable slack, and place the assembly on an outbound AMR cart. Episodes last 60–120 s with six subtasks: `navigate → pick_connector → align → insert → clip_cable → place`.\n\nEmbodiment: holonomic base (3 DoF), torso lift (1), two 7-DoF torque-controlled arms, two parallel grippers with visuo-tactile fingertips. That is 20 actuated DoF. Action space `a_t ∈ R^24`: per arm `[Δp(3), rot6d(6), gripper(1)]` in the base frame relative to the chunk-start pose, plus torso `Δz(1)` and base velocity `(vx, vy, ωz)`. Chunk H = 50 at 50 Hz (1 s). Acceptance: ≥ 95 % first-pass success, ≤ 45 s cycle, ≤ 0.5 interventions per robot-hour, peak insertion force < 80 N.",
    artifacts: [
      { artifact: "`task_spec.md` v1.3", format: "Markdown + YAML front-matter", shape: "6 subtasks, 9 success predicates, 14 failure codes", consumer: "[[s:04]] labels, [[s:10]] eval" },
      { artifact: "`embodiment.yaml` v2.0", format: "YAML", shape: "action: 24-D float32, frames: base_link; obs: 3 RGB + 4 tactile + state 50-D; rates: policy chunk 8 Hz, stream 50 Hz, impedance 1 kHz", consumer: "[[s:02]], [[s:07]], [[s:09]]" },
      { artifact: "`mb1.usd` / `mb1.urdf` (hw rev C)", format: "USD + URDF + MJCF export", shape: "23 links, 20 actuated joints, collision meshes ≤ 2k tris each", consumer: "[[s:05]], [[s:09]]" },
      { artifact: "Latency budget", format: "Spreadsheet in repo", shape: "photon→chunk ≤ 120 ms p99; chunk→actuator ≤ 4 ms; safety stop ≤ 50 ms reaction", consumer: "[[s:11]]" }
    ],
    humanoid: "**H-1** is a 29-DoF humanoid with dexterous hands doing tote handling and loco-manipulation. The action space splits: a learned whole-body tracking controller consumes target motions (root velocity, upper-body keypoints or joint targets) at 50 Hz and outputs PD joint targets; a VLA emits those targets at 10–25 Hz. There is **no statically safe state**: losing power or control means falling, so fall management becomes a first-class requirement in the spec ([[s:14]], ISO/CD 25785-1)."
  },
  pitfalls: [
    { t: "Changing normalization or frames mid-project", d: "Re-normalizing actions or switching from base to world frame invalidates every recorded episode silently. Version `embodiment.yaml` and store the spec version in each episode's metadata." },
    { t: "Choosing a 22-DoF hand for a gripper task", d: "Dexterity multiplies data cost and control difficulty. Use the simplest end-effector that meets the failure taxonomy." },
    { t: "Specifying motions instead of outcomes", d: "Success predicates like 'approach from above' encode one strategy and penalize valid alternatives in eval and reward models." },
    { t: "Ignoring camera placement compatibility", d: "Fine-tuning a checkpoint pretrained with wrist + third-person views on a head-only rig wastes most of the pretraining." },
    { t: "Budgeting average instead of tail latency", d: "A 60 ms mean with a 400 ms p99 still produces visible stalls and missed contacts. Budget p99 and specify behavior when deadlines are missed." },
    { t: "Treating the learned policy as the safety function", d: "Safety functions must be implemented in certified components; the policy proposes, the safety layer disposes ([[s:09]], [[s:14]])." }
  ],
  numbers: [
    { m: "Typical rate hierarchy (manipulation)", v: "planner 0.1–2 Hz · policy chunks 1–15 Hz · action stream 30–200 Hz · impedance 0.5–1 kHz · current loop 10–40 kHz", s: "Engineering practice; Helix 02 S0 ~1 kHz / S1 200 Hz ([report](https://humanoidroboticstechnology.com/industry-news/figure-launches-helix-02/))" },
    { m: "Action chunk length used by flow VLAs", v: "H ≈ 50 steps (≈1 s at 50 Hz)", s: "π0-family convention; RTC paper ([arXiv 2506.07339](https://arxiv.org/html/2506.07339v2))" },
    { m: "Jetson AGX Thor T5000", v: "2070 FP4 sparse TFLOPS, 128 GB, 40–130 W", s: "[NVIDIA forum](https://forums.developer.nvidia.com/t/nvidia-jetson-t4000-and-nvidia-jetpack-7-1-now-available-accelerate-ai-inference-for-edge-and-robotics/356852)" },
    { m: "Jetson AGX Orin 64GB", v: "275 sparse INT8 TOPS, 15–60 W", s: "[Connect Tech](https://connecttech.com/product/nvidia-jetson-agx-orin-64gb-module-900-13701-0050-000/)" },
    { m: "SO-101 leader + follower kit", v: "≈ $230", s: "[SO-ARM100 repo](https://github.com/TheRobotStudio/SO-ARM100)" },
    { m: "DROID (Franka) dataset", v: "76k trajectories, 350 h, 564 scenes, 86 tasks, 50 collectors", s: "[DROID, RSS 2024](https://arxiv.org/abs/2403.12945v2)" }
  ],
  papers: [
    { title: "FAST: Efficient Action Tokenization for Vision-Language-Action Models", year: "2025", venue: "RSS", url: "https://arxiv.org/pdf/2501.09747", why: "Why action normalization and frequency-domain structure matter when you design the action space." },
    { title: "Real-Time Execution of Action Chunking Flow Policies (RTC)", year: "2025", venue: "arXiv 2506.07339", url: "https://arxiv.org/html/2506.07339v2", why: "Defines the latency/execution-horizon relationship your rate hierarchy must satisfy." },
    { title: "GR00T N1.7 model card and code", year: "2026", venue: "NVIDIA", url: "https://github.com/NVIDIA/Isaac-GR00T", why: "Relative end-effector action space shared between robot and human data." },
    { title: "Figure Helix 02 announcement (System 0/1/2)", year: "2026", venue: "Industry report", url: "https://humanoidroboticstechnology.com/industry-news/figure-launches-helix-02/", why: "Public description of a triple-rate hierarchy for whole-body humanoid control." },
    { title: "Updated ISO 10218 FAQ", year: "2025", venue: "A3", url: "https://www.automate.org/robotics/blogs/updated-iso-10218-faq", why: "Robot classes and functional-safety requirements that constrain embodiment choice." },
    { title: "Data Scaling Laws in Imitation Learning for Robotic Manipulation", year: "2025", venue: "ICLR (oral)", url: "https://arxiv.org/html/2410.18647v3", why: "Environment and object diversity, not demo count, drive generalization: shapes how you scope the task envelope." }
  ],
  open_problems: [
    "No standard schema for `embodiment.yaml`-style action/observation contracts across frameworks (LeRobot features, RLDS specs, GR00T modality configs all differ).",
    "Choosing between gripper and dexterous hand remains a cost bet: human-video scaling (EgoScale) may flip the economics toward hands, but evidence is from few labs.",
    "Humanoid form factor vs wheeled bimanual: public evidence of humanoid ROI is limited to a handful of deployments (Digit at GXO, Figure at BMW).",
    "How to specify tasks for generalist policies whose envelope is open-ended (what is the acceptance test for 'tidy any kitchen')."
  ],
  self_check: [
    { q: "Your team switches the action space from absolute joint positions to relative end-effector deltas. Which downstream artifacts break, and which stages must re-run?", a: "Recorded datasets need re-derivation of action labels (forward kinematics from joint logs), normalization statistics must be recomputed and versioned, the policy head and any tokenizer (FAST) must be retrained or re-fit, the controller interface in [[s:09]] changes from joint targets to Cartesian impedance targets, sim environments ([[s:05]]) need matching action wrappers, and eval baselines are no longer comparable. Stages 02–04 (conversion only), 05, 07, 09, 10, 11 must re-run." },
    { q: "Why is the latency budget for a chunked policy with RTC different from that of a single-step policy?", a: "A single-step policy must finish within one control period (20 ms at 50 Hz). With chunking plus [[g:rtc|real-time chunking]], the next chunk is computed while the current one executes; the constraint becomes inference latency (p99) < executed horizon (e.g. 25 of 50 steps = 500 ms), and RTC freezes the actions that will execute during inference. The fast reactive loop then must be classical (impedance) because the policy no longer reacts every period." },
    { q: "A humanoid and a wheeled bimanual robot must do the same tote task. List three specification items that exist only for the humanoid.", a: "(1) Fall management: detection, controlled collapse, and a definition of safe states, because there is no static safe state. (2) A whole-body control layer and its interface (motion commands vs joint targets) with balance constraints. (3) Standards scope: dynamically stable industrial mobile robots fall under ISO/CD 25785-1 rather than ISO 3691-4 or 10218 alone; plus footstep/terrain assumptions in the environment envelope." },
    { q: "What consumes the failure taxonomy you define here, and what goes wrong if it drifts?", a: "Annotation ([[s:04]]) uses it for failure labels, success detectors and reward models are trained on it, evaluation ([[s:10]]) reports per-failure-mode rates, and the flywheel ([[s:13]]) triages incidents by it. If codes are renamed or split without versioning, historical comparisons break, mined failure sets mix categories, and reward models learn inconsistent labels." },
    { q: "When is off-board inference acceptable for the main policy?", a: "When p99 network RTT plus inference fits inside the executed horizon of the chunk, the link has a defined degraded mode (the robot finishes the current chunk, then holds or retracts safely), and nothing safety-relevant depends on it. Typical: workcell server over wired Ethernet or private 5G for a slow, high-capacity planner; rarely the visuomotor policy over Wi-Fi." }
  ]
};
