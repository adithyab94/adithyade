/* Stage 09 — Classical robotics & control. Schema: MAINTENANCE.md */
window.PAI = window.PAI || {}; PAI.stages = PAI.stages || {};
PAI.stages["stage-09"] = {
  id: "stage-09", num: "09", title: "Classical robotics & control", short: "Classical control",
  version: "1.0.0", last_verified: "2026-10-07",
  upstream: [
    { id: "stage-00", what: "rate hierarchy, action space, robot description" },
    { id: "stage-01", what: "proprioception, F/T, IMU, LiDAR, calibrated cameras" },
    { id: "stage-07", what: "learned policy emitting action chunks (targets)" },
    { id: "stage-08", what: "learned low-level controllers (locomotion, WBC, residuals)" }
  ],
  downstream: [
    { id: "stage-11", what: "real-time constraints and interfaces the inference runtime must meet" },
    { id: "stage-12", what: "controller health, limits and fault states for telemetry" },
    { id: "stage-14", what: "safety functions and their performance levels for the safety case" }
  ],
  handoff_short: "Action-server contract (chunk → interpolated targets), controller configs (gains, limits), safety-filter spec, state estimates and maps",
  purpose: "Execute learned intentions safely and precisely: kinematics, dynamics, planning, trajectory generation, compliant and whole-body control, state estimation and safety filtering. The classical stack turns a 5–15 Hz stream of learned targets into 1 kHz motor commands and guarantees limits the policy cannot.",
  interface: {
    inputs: [
      { name: "Action chunks", format: "`ActionChunk` msg: t0, dt, H×D float32 in a declared frame", rate: "1–15 Hz chunks (H ≈ 50 at 50 Hz)", from: "[[s:07]] via [[s:11]] runtime" },
      { name: "State", format: "`JointState`, `WrenchStamped`, `Imu`, odometry, maps", rate: "0.5–1 kHz proprio; 10–30 Hz perception", from: "[[s:01]]" },
      { name: "Robot model", format: "URDF / MJCF; limits; payload", rate: "Per hardware revision", from: "[[s:00]]" }
    ],
    outputs: [
      { name: "Joint commands", format: "Position / velocity / torque setpoints with feed-forward", rate: "0.5–4 kHz to drives (EtherCAT)", to: "Drives" },
      { name: "Filtered / executed actions", format: "Actually executed targets + filter interventions", rate: "Per control step", to: "[[s:12]] logs, [[s:13]] mining" },
      { name: "State estimates & maps", format: "TF tree, odometry, occupancy/ESDF", rate: "30–200 Hz", to: "policy observations, navigation" },
      { name: "Safety states", format: "Protective stop, speed limits active, fault codes", rate: "Event + 10 Hz status", to: "[[s:12]], [[s:14]]" }
    ],
    handoff: "The **action server** is the contract between learned and classical: it accepts chunks with timestamps, aligns them to the robot clock, blends overlapping chunks (or follows RTC-frozen prefixes), interpolates to the control rate with jerk limits, transforms frames, and passes targets through a safety filter before impedance or whole-body control. It also defines what happens if no new chunk arrives: finish the current chunk, then hold position with compliant stiffness or retract to a safe pose."
  },
  mental_model: "Learned policies decide **what** to do and roughly **where**; classical control decides **how hard, how fast and within which limits**. The cleaner this separation, the safer and more portable the policy. The interface is a time-stamped target stream with frames and limits, never raw motor currents from a neural network.",
  mental_detail: "Rates make the separation unavoidable. A 3B-parameter VLA on a Jetson Thor produces a chunk in tens of milliseconds at best (GR00T N1.7: ~40 ms with NVFP4), and a contact transient lasts a few milliseconds. Impedance control at 1 kHz with F/T feedback absorbs pose errors and contact shocks that the policy cannot react to. On humanoids, the fast layer is increasingly learned (whole-body tracking policies at ~50 Hz feeding 1 kHz PD; Helix 02's learned System 0 at ~1 kHz), but it still outputs PD targets into classical joint servos and sits under classical limit checks.\n\nClassical planning and MPC also persist as **components**: navigation (Nav2) for the mobile base, collision-free motion between policy segments (cuRobo, MoveIt 2), MPC for legged and humanoid balance in model-based stacks (Crocoddyl, acados, OCS2), and state estimation and SLAM (FAST-LIO2, cuVSLAM, nvblox). Safety filters (control barrier functions, speed-and-separation monitoring) wrap learned outputs.",
  methods: [
    { id: "kin-dyn", name: "Kinematics & dynamics libraries", tags: ["classical"],
      summary: "Rigid-body algorithms (forward/inverse kinematics, Jacobians, RNEA/ABA, derivatives) for control, estimation and MPC. Pinocchio 4.1 (URDF v1.2 with acceleration/jerk limits), Drake multibody, MuJoCo as an analytic model.",
      pros: "Exact, fast, differentiable; the basis of every controller and planner.", cons: "Only as good as the model's inertias and friction." },
    { id: "ik", name: "Inverse kinematics & task-space control", tags: ["classical"],
      summary: "Differential IK as a QP (velocity-level with joint limits, collision and singularity terms) converts EE-delta actions into joint targets; whole-body IK for mobile manipulators distributes motion over base, torso and arms. Required whenever the policy outputs Cartesian actions.",
      pros: "Respects limits and redundancy; deterministic.", cons: "Local; can jump near singularities; tune damping." },
    { id: "planning", name: "Motion planning & trajectory generation", tags: ["classical"],
      summary: "Collision-free paths for transfer motions the policy does not need to learn: sampling planners (OMPL via MoveIt 2), GPU-parallel optimization planners (cuRobo v2, Apache-2.0 since v0.8.0), time-optimal jerk-limited trajectories (Ruckig). Mobile base navigation via Nav2 (1.5.2 for Lyrical).",
      pros: "Guarantees on collision and limits; no training data.", cons: "Needs geometry (maps, meshes); slow in clutter; brittle to perception errors." },
    { id: "mpc", name: "Model predictive control", tags: ["classical"],
      summary: "Optimize a horizon of controls under dynamics and constraints at 50–1000 Hz: legged and humanoid balance (Crocoddyl, OCS2), manipulation with contact models, base navigation. Tooling: acados (embedded NLP solvers, 0.6.0), Crocoddyl 3.2 (DDP/FDDP), Drake. Learned models (TD-MPC2) blur the line with RL.",
      pros: "Explicit constraints, interpretable, adapts to new goals without retraining.", cons: "Model errors; computational load; contact-mode switching is hard." },
    { id: "impedance", name: "Impedance / admittance / hybrid force control", tags: ["classical"],
      summary: "Render a programmable spring-damper at the end-effector: impedance on torque-controlled arms (Franka FCI 1 kHz), admittance on position-controlled arms with F/T. The learned policy sets the equilibrium (and optionally stiffness); the controller handles contact. Variable-impedance policies output stiffness as part of the action.",
      pros: "Absorbs pose error, limits contact forces, makes insertion feasible.", cons: "Stiffness tuning per task; passivity issues with delays." },
    { id: "wbc", name: "Whole-body control (QP-based vs learned)", tags: ["classical", "rl"],
      summary: "QP-based WBC (task priorities, contact constraints, TSID-style) remains the backbone of model-based humanoids; learned tracking controllers (SONIC, BeyondMimic) increasingly replace it for agile motion. Hybrid: learned policy outputs references, QP enforces limits and contact consistency.",
      pros: "QP: constraint guarantees; learned: robustness and natural motion.", cons: "QP: modelling burden; learned: no formal guarantees, retraining for new bodies." },
    { id: "estimation", name: "State estimation, SLAM & mapping", tags: ["classical", "robot"],
      summary: "Proprioceptive + IMU estimators for floating base (humanoids, legged), LiDAR-inertial odometry (FAST-LIO2: GPL-2.0, ROS 1 upstream with community ROS 2 ports; Livox support), visual SLAM (NVIDIA cuVSLAM), GPU mapping (nvblox ESDF/mesh) for collision avoidance and navigation.",
      pros: "Metric state for planners, safety and policy inputs (base pose).", cons: "Drift; dynamic scenes; calibration dependence." },
    { id: "action-server", name: "Policy action server & chunk execution", tags: ["classical", "il", "edge"],
      summary: "The integration component: time-align chunks to the robot clock, execute with RTC/async semantics (freeze actions already committed; blend or switch at a chosen index), interpolate 10–50 Hz targets to 500 Hz–1 kHz with jerk limits, transform frames, apply rate and workspace limits, publish executed actions for logging. LeRobot's PolicyServer/RobotClient implements an open version.",
      pros: "One place to enforce timing and limits; decouples model latency from control.", cons: "Blending policies are task-sensitive (temporal ensembling vs RTC)." },
    { id: "safety-filter", name: "Safety filters & limit enforcement", tags: ["classical"],
      summary: "Minimal modification of learned commands to keep the system in a safe set: control barrier function QPs, workspace and velocity/force limits, self-collision checks, speed-and-separation monitoring via safety-rated scanners. Note: certified safety functions (protective stop, safe torque off, safely limited speed) run on safety-rated hardware (PLd/SIL2-class), not in the policy computer ([[s:14]]).",
      pros: "Bounds the consequences of policy errors.", cons: "Filters can cause chattering or deadlock; learned-component filters (CBF from perception) are not certifiable." }
  ],
  extras: [
    { title: "Learned ↔ classical interface by layer (manipulator reference)", note: "Rates are typical engineering values; adjust to your hardware.",
      columns: ["Layer", "Rate", "Input", "Output", "Learned or classical", "On missed deadline"],
      rows: [
        ["Task planner / reasoner", "0.1–2 Hz", "Instruction, scene summary, progress", "Subtask / prompt / subgoal", "Learned (VLM / ER model)", "Keep current subtask"],
        ["Visuomotor policy", "1–15 Hz chunks", "Images, state, prompt", "Action chunk H×D (targets)", "Learned (VLA / WAM)", "Finish current chunk, then hold"],
        ["Action server", "50–200 Hz", "Chunks, robot clock", "Interpolated targets", "Classical", "Hold last target compliantly"],
        ["Safety filter / IK", "200 Hz–1 kHz", "Targets, state, limits", "Limited joint / Cartesian targets", "Classical", "Clamp / stop"],
        ["Impedance / WBC", "0.5–1 kHz", "Targets, F/T, joint state", "Torque / position setpoints", "Classical (or learned tracking on humanoids)", "Damping mode"],
        ["Drive servo loops", "4–40 kHz", "Setpoints", "Motor currents", "Classical (firmware)", "Fault → STO"],
        ["Safety controller", "≈ 1–10 ms cycle", "E-stop, scanners, speed monitoring", "Protective stop, STO, SLS", "Classical, safety-rated", "Fail-safe by design"]
      ] }
  ],
  decision: [
    { "if": "Policy outputs EE deltas on a torque-controlled arm", use: "Diff-IK QP + Cartesian impedance at 1 kHz; policy sets equilibrium (optionally stiffness)", why: "Compliance makes contact tasks robust to pose error." },
    { "if": "Position-controlled industrial arm", use: "Admittance control with wrist F/T, conservative stiffness", why: "No torque interface; F/T closes the force loop." },
    { "if": "Long transfer motions in known geometry", use: "cuRobo / MoveIt 2 planning between learned segments", why: "Guaranteed collision-free and faster than learning them." },
    { "if": "Mobile base in a facility", use: "Nav2 + LiDAR-inertial odometry; policy controls only local base motions near the workcell", why: "Navigation is a solved classical problem with safety integration." },
    { "if": "Humanoid agile motion", use: "Learned tracking controller (RL) under classical joint PD and limit checks; MPC/QP WBC if model-based", why: "Learned controllers are more robust; QP gives guarantees where needed." },
    { "if": "Humans share the workspace", use: "Safety-rated speed-and-separation or power-and-force limiting, independent of the policy", why: "Required for certification; learned components cannot be the safety function." }
  ],
  tools: [
    { id: "ros2-control", name: "ros2_control", what: "Hardware abstraction + controller manager for real-time control loops in ROS 2", maker: "ros-controls community", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Standard controller plumbing (joint trajectory, impedance, admittance)", limitations: "Real-time needs PREEMPT_RT and careful configuration", release: null, version: "ships with ROS 2 Lyrical", release_note: "via ROS distro", link: "https://github.com/ros-controls/ros2_control", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "moveit2", name: "MoveIt 2", what: "Motion planning framework (OMPL, Pilz, STOMP, cuRobo plugin), collision checking, servoing", maker: "PickNik / MoveIt community", open: "open", license: "BSD-3-Clause", maturity: "production", best_for: "Planning and servoing for ROS 2 manipulators", limitations: "Planning latency in clutter; complex configuration", release: null, version: "ships with ROS 2 distros", release_note: "via ROS distro", link: "https://github.com/moveit/moveit2", runs: ["robot", "edge"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "curobo", name: "cuRobo (v2)", what: "GPU-accelerated motion generation, IK and collision checking", maker: "NVIDIA", open: "open", license: "Apache-2.0 (since v0.8.0)", maturity: "production", best_for: "Millisecond-scale collision-free motion on Jetson / RTX", limitations: "NVIDIA GPUs only; API restructured in v0.8", release: "2026-04-18", version: "v0.8.0 (cuRoboV2, arXiv 2603.05493)", link: "https://github.com/NVlabs/curobo/releases", runs: ["edge", "robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "ompl", name: "OMPL", what: "Sampling-based motion planning library", maker: "Kavraki Lab (Rice)", open: "open", license: "BSD-3-Clause", maturity: "production", best_for: "General-purpose planning; MoveIt default", limitations: "CPU-bound; path quality needs smoothing", release: "2026-08-14", version: "2.0.2 (year inferred)", link: "https://github.com/ompl/ompl/releases", runs: ["robot", "edge"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "ruckig", name: "Ruckig", what: "Real-time jerk-limited trajectory generation", maker: "Lars Berscheid (pantor)", open: "mixed", license: "MIT (Community); Pro version commercial", maturity: "production", best_for: "Interpolating policy targets with velocity/acc/jerk limits", limitations: "Some features (waypoints at scale) in Pro only", release: "2026-07-15", version: "0.19.4", link: "https://github.com/pantor/ruckig/releases", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "pinocchio", name: "Pinocchio", what: "Rigid-body dynamics library with analytical derivatives", maker: "INRIA / LAAS-CNRS", open: "open", license: "BSD-2-Clause", maturity: "production", best_for: "Dynamics for MPC, WBC, estimation; Python + C++", limitations: "Modelling and contact are separate concerns", release: "2026-07-07", version: "v4.1.0 (year inferred)", link: "https://github.com/stack-of-tasks/pinocchio/releases", runs: ["robot", "sim"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "crocoddyl", name: "Crocoddyl", what: "Optimal control (DDP/FDDP) for multi-contact robots", maker: "LAAS-CNRS / Edinburgh et al.", open: "open", license: "BSD-3-Clause", maturity: "pilot", best_for: "Legged / humanoid MPC research", limitations: "Expert tuning; contact sequence often given", release: "2026-05-10", version: "v3.2.1", link: "https://github.com/loco-3d/crocoddyl/releases", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "acados", name: "acados", what: "Fast embedded solvers for nonlinear MPC and estimation", maker: "acados team (Freiburg et al.)", open: "open", license: "BSD-2-Clause", maturity: "production", best_for: "Real-time MPC on embedded CPUs", limitations: "Requires CasADi modelling; code generation workflow", release: "2026-08-06", version: "v0.6.0 (year inferred)", link: "https://github.com/acados/acados/releases", runs: ["robot", "edge"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "nav2", name: "Nav2", what: "ROS 2 navigation stack (planners, controllers, behavior trees)", maker: "Open Navigation / ROS community", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Mobile base navigation in facilities", limitations: "Tuning per platform; not for manipulation", release: "2026-09-16", version: "1.5.2 (Lyrical sync)", link: "https://github.com/ros-navigation/navigation2/releases", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "fastlio", name: "FAST-LIO2", what: "LiDAR-inertial odometry (iterated EKF, ikd-tree)", maker: "HKU MaRS Lab", open: "open", license: "GPL-2.0", maturity: "production", best_for: "Robust odometry with Livox and spinning LiDARs", limitations: "GPL; upstream ROS 1, community ROS 2 forks", release: "2021-07-05", version: "FAST-LIO 2.0", link: "https://github.com/hku-mars/FAST_LIO", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "nvblox", name: "nvblox", what: "GPU-accelerated TSDF/ESDF mapping and meshing", maker: "NVIDIA", open: "open", license: "See repo (NVIDIA)", maturity: "pilot", best_for: "Real-time collision maps on Jetson for planners", limitations: "NVIDIA GPUs; 0.0.x versioning", release: "2026-05-07", version: "v0.0.10 (year inferred)", link: "https://github.com/nvidia-isaac/nvblox/releases", runs: ["edge", "robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "lerobot-async", name: "LeRobot PolicyServer / RobotClient", what: "Async inference: decouples action prediction from execution over gRPC", maker: "Hugging Face", open: "open", license: "Apache-2.0", maturity: "pilot", best_for: "Open reference action server for chunked policies", limitations: "Not a real-time controller; pair with ros2_control / vendor RT loop", release: "2026-08-03", version: "lerobot 0.6.1", link: "https://huggingface.co/docs/lerobot/main/async", runs: ["edge", "robot"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null }
  ],
  where: {
    cloud: { l: 0, n: "" },
    onprem: { l: 0, n: "" },
    sim: { l: 1, n: "controller tuning, SIL tests" },
    edge: { l: 2, n: "planning, mapping on GPU" },
    robot: { l: 3, n: "real-time loops on RT CPU / drives" }
  },
  tech: {
    il: { l: 1, n: "executes IL policy targets" },
    rl: { l: 1, n: "hosts learned low-level controllers" },
    classical: { l: 3, n: "the stage" },
    sim2real: { l: 1, n: "controller robustness absorbs gaps" },
    real2sim: { l: 1, n: "models identified for MPC" },
    real2sim2real: { l: 0, n: "" },
    fm: { l: 0, n: "" },
    wam: { l: 0, n: "" },
    icl: { l: 0, n: "" }
  },
  stacks: {
    open: { title: "Open stack", items: [
      "ros2_control on PREEMPT_RT + vendor RT interface (libfranka / UR RTDE)",
      "Cartesian impedance or admittance controller; Pinocchio diff-IK QP; Ruckig interpolation",
      "MoveIt 2 + cuRobo for transfer motions; Nav2 + FAST-LIO2 for the base",
      "LeRobot PolicyServer/RobotClient or a custom action server with RTC semantics"
    ], note: "Keep the safety-rated stop chain independent of all of the above." },
    industry: { title: "Industry pattern", items: [
      "Vendor real-time controllers (KUKA, ABB, Fanuc, UR, Franka) with safety-rated functions; policy streams targets over a vendor interface",
      "Humanoids: learned whole-body tracking (Helix 02 S0, SONIC-style) over classical joint PD; model-based MPC/QP in some stacks (e.g. Boston Dynamics historically)",
      "Facility navigation by classical stacks; learned policies only near the task",
      "Safety PLCs and scanners (PLd / SIL2-class) for protective stops"
    ], note: "Precise controller designs are rarely published by humanoid companies." }
  },
  example: {
    summary: "MB-1's RT PC (x86, PREEMPT_RT, isolated cores) runs ros2_control with an EtherCAT master at 1 kHz. The action server receives `/policy/action_chunk` (50×24) at ~8 Hz, executes with RTC semantics (actions inside the inference-delay window are frozen), adds the insertion residual, interpolates with Ruckig to 1 kHz, solves a diff-IK QP for the 7-DoF arms with joint, velocity and workspace limits, and feeds a Cartesian impedance controller (translational stiffness 800 N/m in free space, 300 N/m along the insertion axis during `insert`, force cap 60 N). The base follows Nav2 outside the cell and policy base-velocity commands inside it.",
    artifacts: [
      { artifact: "`/policy/action_chunk`", format: "custom `ActionChunk.msg` {header, t0, dt=0.02, H=50, D=24, data[1200], policy_version}", shape: "≈ 8 Hz", consumer: "action server" },
      { artifact: "`/arm_{l,r}/cartesian_impedance/target`", format: "`PoseStamped` + stiffness", shape: "1 kHz (interpolated)", consumer: "impedance controller" },
      { artifact: "`/safety_filter/interventions`", format: "custom msg", shape: "event + clamped dims", consumer: "[[s:12]] telemetry, [[s:13]] mining" },
      { artifact: "Controller config", format: "YAML (ros2_control)", shape: "gains, stiffness schedules per subtask, limits", consumer: "[[s:14]] safety case (non-safety functions documented)" }
    ],
    humanoid: "H-1 inverts the split: the fastest learned component (whole-body tracking policy, 50 Hz) sits **below** the VLA and outputs joint PD targets at 50 Hz, interpolated to 1 kHz joint servos. Classical pieces remain for state estimation (IMU + kinematics floating-base estimator), joint limit and torque checks, fall detection, and navigation outside task areas. Balance is learned, but limits are not."
  },
  pitfalls: [
    { t: "Feeding policy actions straight to joint position controllers", d: "Stiff position control turns small pose errors into large contact forces during insertion; use compliance." },
    { t: "Chunk boundary discontinuities", d: "Switching chunks without blending or RTC causes jerks; temporal ensembling smooths but adds lag; choose deliberately." },
    { t: "Frame mismatches", d: "Policy trained in base frame, executed in world frame (or after a base move) produces drift that looks like poor generalization." },
    { t: "Safety logic in the policy process", d: "A Python process that can hang must not host the protective-stop logic; safety runs on certified hardware." },
    { t: "Ignoring controller saturation in logs", d: "If the safety filter or IK clamps actions often, the policy is learning from targets the robot never executed; log executed actions." },
    { t: "Non-real-time kernels for 1 kHz loops", d: "Standard kernels show multi-millisecond jitter; use PREEMPT_RT, CPU isolation and memory locking." }
  ],
  numbers: [
    { m: "Typical impedance loop", v: "1 kHz (Franka FCI); EtherCAT cycle 1 ms or faster", s: "[libfranka](https://github.com/frankarobotics/libfranka/releases); engineering practice" },
    { m: "GR00T N1.7 inference on Thor", v: "≈ 40 ms (NVFP4) → chunk-level control, not servo-level", s: "[Jetson AI Lab](https://www.jetson-ai-lab.com/tutorials/groot_n17_on_thor/)" },
    { m: "Helix 02 rates", v: "S0 ~1 kHz (≈10M params), S1 200 Hz", s: "[Helix 02 report](https://humanoidroboticstechnology.com/industry-news/figure-launches-helix-02/)" },
    { m: "Learned humanoid tracking policy", v: "≈ 50 Hz policy → 0.5–1 kHz joint PD", s: "Common in BeyondMimic / SONIC-style deployments" },
    { m: "Async execution benefit", v: "30 % faster task completion (9.7 s vs 13.75 s) with async inference", s: "[LeRobot async](https://huggingface.co/docs/lerobot/main/async)" }
  ],
  papers: [
    { title: "Real-Time Execution of Action Chunking Flow Policies (RTC)", year: "2025", venue: "arXiv 2506.07339", url: "https://arxiv.org/html/2506.07339v2", why: "Defines chunk execution semantics the action server must implement." },
    { title: "cuRoboV2 (release notes and paper)", year: "2026", venue: "NVIDIA", url: "https://github.com/NVlabs/curobo/releases", why: "GPU motion generation now Apache-2.0; practical for Jetson-class robots." },
    { title: "CBF-RL: Safety Filtering RL in Training with Control Barrier Functions", year: "2025", venue: "arXiv 2510.14959", url: "https://arxiv.org/html/2510.14959v1", why: "How barrier functions integrate with learned humanoid control." },
    { title: "Attention-guided safety filter for VLA models", year: "2026", venue: "arXiv 2606.09749", url: "https://arxiv.org/abs/2606.09749", why: "Training-free CBF filter around a VLA using its attention to define obstacles." },
    { title: "SONIC: universal control interface for humanoids", year: "2025", venue: "Science Robotics 2026", url: "https://arxiv.org/pdf/2511.07820", why: "Where learned whole-body control meets planner-level commands." },
    { title: "ros2_control documentation and controllers", year: "2026", venue: "ros-controls", url: "https://github.com/ros-controls/ros2_control", why: "Reference implementation of the real-time controller layer." }
  ],
  open_problems: [
    "Certifiable safety filters for learned perception-based constraints (what is the obstacle set?).",
    "Variable impedance learned jointly with motion without destabilizing contact.",
    "Formal interface specs between learned layers and controllers (timing, frames, limits) shared across frameworks.",
    "How much of whole-body control should be learned vs model-based for certification in ISO 25785-class standards."
  ],
  self_check: [
    { q: "The policy chunk arrives 150 ms late. Walk through what each layer does.", a: "The action server continues executing the remaining actions of the current chunk (with RTC the next chunk's first actions are consistent with them). If the current chunk runs out, it holds the last target with compliant stiffness (or a damped stop), flags a deadline miss to telemetry, and resumes blending when the late chunk arrives (discarding actions whose timestamps have passed). Impedance and safety layers keep running at 1 kHz unaffected." },
    { q: "Why should executed (post-filter) actions be logged alongside policy outputs, and who consumes the difference?", a: "Training on commanded but unexecuted targets teaches impossible actions. [[s:03]]/[[s:07]] should use executed actions (or flag clamped segments); [[s:13]] mines frequent filter interventions as failure signals; [[s:10]] reports intervention rates; [[s:14]] uses them as evidence of how often the safety layer acts." },
    { q: "When would you let the policy output stiffness, and what guard do you add?", a: "For contact-rich phases where the right compliance varies (insertion, wiping), variable impedance improves success. Guard: clamp stiffness and force ranges per subtask, enforce passivity (energy tanks) and keep force caps in the controller independent of the policy." },
    { q: "A humanoid's learned tracking controller is retrained. What classical interfaces must be re-validated?", a: "Command space semantics (frames, units, rates of targets), joint PD gains and limits it assumes, fall detection thresholds and the safe-collapse behaviour, state estimator inputs it depends on, and the safety layer's torque/velocity limits. The VLA above must be re-evaluated because tracking error characteristics change." },
    { q: "Where does classical planning still beat a learned policy in a mobile manipulator, and how do they hand off?", a: "Long collision-free transfers, navigation across a facility, and moves in fully known geometry. Hand-off: the planner brings the robot to a pre-task pose with a known observation distribution; the policy takes over within the workcell; the policy can request planner moves (via a subtask) for transfers, keeping each in its domain of competence." }
  ]
};
