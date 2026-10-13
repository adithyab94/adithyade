/* views.js — data for integration views: paradigms, reference architectures, runtime processes.
   Schema: MAINTENANCE.md */
window.PAI = window.PAI || {}; PAI.data = PAI.data || {};
PAI.data.views = {
  version: "1.0.0",
  last_verified: "2026-10-07",

  paradigms: {
    columns: [
      { name: "VLA (flow / token)",
        inputs: "Multi-view RGB, language, proprioceptive state (optionally F/T, tactile tokens)",
        outputs: "Action chunks (H≈50) of EE deltas or joint targets at 10–50 Hz",
        data: "10³–10⁵ h cross-embodiment robot data + web VLM pretraining; 50–1,000 episodes to fine-tune a task family",
        compute: "Train: 10s–1000s GPUs pretrain; LoRA FT on 1 GPU (π0.5 >22.5 GB). Infer: ≈40 ms on Jetson Thor (GR00T N1.7 NVFP4)",
        strengths: "Language following, semantic generalization, mature open models (π0.5, GR00T N1.7, SmolVLA, X-VLA), deployable on edge",
        failures: "Unseen motions and dynamics; precise contact without force input; brittle to camera/viewpoint shifts; saturated benchmarks hide fragility",
        pick: "Default for language-conditioned manipulation with moderate data and edge deployment",
        examples: "[[t:07:openpi|π0.5]], [[t:07:groot-n17|GR00T N1.7]], [[t:07:pi07|π0.7]], [[t:07:gemini-robotics-2|Gemini Robotics 2]]" },
      { name: "WAM (world action model)",
        inputs: "Video context (multi-view), language, state; sometimes action-free video for learning",
        outputs: "Future frames/latents/features + actions (+ values); action-only decoding in efficient variants",
        data: "Video-model pretraining on massive video + robot data; can learn from video-only demos of other robots/humans",
        compute: "Pixel WAMs: multi-GPU inference (DreamZero ≈0.6 s/step on GB200); efficient WAMs 85–190 ms on desktop GPUs",
        strengths: "Physical foresight; >2× generalization to new tasks/environments reported (DreamZero); test-time planning by scoring futures (Cosmos Policy)",
        failures: "Latency and memory; video quality ≠ action quality; evidence still largely from authors; world models may not follow actions faithfully",
        pick: "When generalization to novel motions matters and you can afford compute, or as a teacher / data engine; watch GR00T N2",
        examples: "[[t:07:dreamzero|DreamZero]], [[t:07:cosmos-policy|Cosmos Policy]], [[t:07:gigaworld-policy|GigaWorld-Policy]], [[t:07:lawam|LaWAM]]" },
      { name: "Diffusion / flow policy (task-specific)",
        inputs: "RGB (or point clouds), state",
        outputs: "Action sequences for one task family",
        data: "50–200 demos per task",
        compute: "Hours on one GPU to train; ms-scale inference on Orin-class hardware",
        strengths: "Simple, fast, strong on narrow tasks; great baseline and fallback",
        failures: "No language, poor out-of-distribution generalization; needs per-task data",
        pick: "Single fixed task, tight latency, little data, or as a baseline for any new method",
        examples: "[[t:07:diffusion-policy-tool|Diffusion Policy]], ACT, DP3" },
      { name: "RL policy (sim-trained or real-world RL)",
        inputs: "Proprioception, IMU, commands; sometimes depth/heightmaps or residual inputs",
        outputs: "Joint PD targets at 50 Hz (locomotion/WBC) or residual corrections",
        data: "Billions of sim steps (no demos) or 1–2.5 h of real interaction with demos for HIL-SERL",
        compute: "GPU sim farms (SONIC: 9k GPU-h); tiny inference (<1 ms, tens of M params)",
        strengths: "Physics-dominated control (balance, agile motion, in-hand dexterity); optimizes speed and reliability directly",
        failures: "Reward design; sim2real gaps for contact-rich manipulation; reward hacking with learned rewards; per-task",
        pick: "Locomotion, whole-body tracking, dexterous in-hand skills, last-mile precision via residual RL",
        examples: "[[t:08:sonic|SONIC]], [[t:08:beyondmimic|BeyondMimic]], [[t:08:hilserl|HIL-SERL]], [[t:08:rlinf|RLinf]]" },
      { name: "Classical pipeline (perception → planning → control)",
        inputs: "Calibrated geometry (poses, maps, meshes), task specification",
        outputs: "Collision-free trajectories, compliant control commands",
        data: "No training data; CAD, calibration and engineering time",
        compute: "CPU / GPU planners (cuRobo ms-scale), real-time control at 1 kHz",
        strengths: "Guarantees (limits, collisions), interpretability, certification path, zero data",
        failures: "Breaks with perception errors, clutter, deformables, open-ended tasks; high engineering cost per variant",
        pick: "Structured tasks with known geometry, transfer motions, navigation, safety layers, and always beneath learned policies",
        examples: "[[t:09:moveit2|MoveIt 2]], [[t:09:curobo|cuRobo]], [[t:09:nav2|Nav2]], [[t:09:ros2-control|ros2_control]]" }
    ],
    rows: [
      { key: "inputs", label: "Inputs" },
      { key: "outputs", label: "Outputs" },
      { key: "data", label: "Data needs" },
      { key: "compute", label: "Compute (train / infer)" },
      { key: "strengths", label: "Strengths" },
      { key: "failures", label: "Failure modes" },
      { key: "pick", label: "When to pick" },
      { key: "examples", label: "Examples" }
    ]
  },

  architectures: {
    columns: [
      { name: "(a) Solo / low-budget open source", sub: "1–2 robots, one person, ≈ $1–15k hardware + rented GPUs" },
      { name: "(b) Startup", sub: "5–50 robots, 5–30 engineers, one product vertical" },
      { name: "(c) Large-scale industry", sub: "100s–1000s robots, foundation-model team, multi-site fleets (public descriptions)" }
    ],
    rows: [
      { stage: "stage-00", cells: ["SO-101 or I2RT YAM arms; one task family; action space = LeRobot defaults (joint or EE)", "Commercial arms (Franka/UR/Kinova) or ALOHA-class bimanual on a mobile base; relative EE actions; Jetson Thor", "Custom humanoids or bimanual platforms designed for data (Figure, Apptronik, 1X, Agility); triple-rate hierarchy"] },
      { stage: "stage-01", cells: ["USB/MIPI cameras, optional RealSense; ROS 2 or LeRobot drivers; software timestamps + offset calibration", "GMSL/PoE global-shutter cameras, wrist F/T, PTP, ROS 2 Lyrical + Zenoh", "Custom sensor heads, fingertip tactile, EtherCAT DC, in-house middleware or ROS 2 + shared memory"] },
      { stage: "stage-02", cells: ["SO-101 leader or GELLO teleop; 50–500 episodes", "Teleop shifts + UMI-style handheld; 100s–1000s of hours; intervention logging", "Teleop operations + wearable programs + egocentric video at 10k+ h (GEN-0: +10k h/week; EgoScale 20k h)"] },
      { stage: "stage-03", cells: ["LeRobotDataset v3 on HF Hub; Rerun", "MCAP raw on S3, LeRobotDataset v3 snapshots, Parquet catalog + LanceDB, Foxglove", "PB-scale lakehouse (Iceberg/Delta + Lance), streaming QA, privacy pipeline, lineage"] },
      { stage: "stage-04", cells: ["Manual success flags; VLM captions via open Qwen3-VL", "VLM-first labelling (Cosmos Reason 2), SAM 3.1, progress model, Label Studio audits", "In-house success/value models, metadata prompts (π0.7-style), managed labelling vendors"] },
      { stage: "stage-05", cells: ["MuJoCo / ManiSkill3 or LIBERO for practice; RoboCasa365 data", "Isaac Lab Mimic for demo multiplication; digital twins of customer cells", "GPU sim farms for humanoid RL; neural world simulators (1X, Tesla); Cosmos-scale video models"] },
      { stage: "stage-06", cells: ["Co-train with small sim set; sim2sim checks", "Co-training α sweeps; GS real2sim eval scenes; sysID of contact", "Actuator characterization, delta-action models, site twins, neural sims"] },
      { stage: "stage-07", cells: ["SmolVLA or π0.5 LoRA; Diffusion Policy baseline", "Fine-tune GR00T N1.7 / π0.5; add F/T tokens; evaluate WAMs (Cosmos Policy)", "In-house foundation models (π0.7, Helix 02, Gemini Robotics 2, GEN-0, GR00T N2-class WAMs)"] },
      { stage: "stage-08", cells: ["HIL-SERL on one task; mjlab locomotion if legged", "Residual RL on contact phases; RLinf/PLD for VLA post-training", "RECAP-style advantage conditioning on fleet data; RL-trained S0 / WBC"] },
      { stage: "stage-09", cells: ["Vendor position control + LeRobot async client", "ros2_control impedance/admittance, cuRobo, Nav2, custom action server with RTC", "Custom RT controllers, learned WBC over joint PD, safety PLCs"] },
      { stage: "stage-10", cells: ["LIBERO + 20–50 real trials with CIs", "Real A/B with STEP, PolaRiS-style scenes, nightly sim regression", "Eval fleets, blind A/B at scale (TRI-style), world-model evaluation, RoboArena-type rankings"] },
      { stage: "stage-11", cells: ["PyTorch on RTX desktop or Jetson Orin; ONNX/TensorRT FP16", "TensorRT FP8/NVFP4 on Thor; RTC; parity CI", "Custom kernels, NVFP4, distilled students, on-board S0/S1 with off-board S2"] },
      { stage: "stage-12", cells: ["Docker + manual updates", "Containers + RAUC/Mender OTA, cohorts, Prometheus/Grafana or Formant/InOrbit, remote assist", "Fleet platforms, remote ops centres, staged global rollouts, incident pipelines"] },
      { stage: "stage-13", cells: ["Weekly manual review of failures; re-collect", "Mining + targeted collection + monthly fine-tunes", "Continuous flywheel: interventions → value models → RL post-training; automated mining"] },
      { stage: "stage-14", cells: ["Lab safety: e-stop, reduced speed, no humans in workspace", "Risk assessment, safety PLC, ISO 10218-2:2025 collaborative validation, CRA reporting", "Certification programmes, Machinery Regulation / AI Act compliance, ISO 25785-1 participation (Agility, Boston Dynamics)"] }
    ]
  },

  runtime: {
    processes: [
      { name: "Task reasoner / planner (S2)", rate: "0.1–2 Hz", hz: "1", compute: "Thor GPU (small VLM) or cloud API (ER 2)", kind: "Learned (VLM / ER)", inputs: "Head image, instruction, progress, memory", outputs: "Subtask, prompt metadata, subgoal image", failure: "Keep current subtask; ask for help after timeout" },
      { name: "Visuomotor policy (S1, VLA/WAM)", rate: "5–15 Hz chunks", hz: "8", compute: "Thor GPU (TensorRT NVFP4/FP8)", kind: "Learned", inputs: "3 RGB + 4 tactile + state 50-D + wrench 12-D + prompt", outputs: "Action chunk 50×24", failure: "Action server finishes current chunk, then holds compliantly" },
      { name: "Runtime monitor", rate: "per chunk (≈8 Hz)", hz: "8", compute: "Thor GPU/CPU", kind: "Learned + statistical", inputs: "Policy embeddings, chunk samples, value estimate", outputs: "OOD / entropy / progress-stall alarms", failure: "Fail-safe: treat missing monitor as alarm → pause" },
      { name: "Perception for control", rate: "15–30 Hz", hz: "30", compute: "Thor GPU (FoundationPose, nvblox)", kind: "Learned + classical", inputs: "RGB-D", outputs: "Object poses, ESDF map", failure: "Stale map flag; planner refuses motions" },
      { name: "Action server (RTC execution, interpolation)", rate: "50–200 Hz", hz: "200", compute: "RT CPU (PREEMPT_RT)", kind: "Classical", inputs: "Chunks, robot clock", outputs: "Interpolated targets", failure: "Hold last target; flag deadline miss" },
      { name: "Insertion residual actor", rate: "50 Hz", hz: "50", compute: "RT CPU (ONNX) or GPU", kind: "Learned (RL)", inputs: "Wrench, pose error, base action", outputs: "Δpose (bounded ±2 mm / ±2°)", failure: "Residual set to zero" },
      { name: "Safety filter + diff-IK QP", rate: "500 Hz–1 kHz", hz: "1000", compute: "RT CPU", kind: "Classical", inputs: "Targets, joint state, limits", outputs: "Limited joint/Cartesian targets", failure: "Clamp; protective stop request" },
      { name: "Cartesian impedance controller", rate: "1 kHz", hz: "1000", compute: "RT CPU / arm controller", kind: "Classical", inputs: "Targets, F/T, joint state", outputs: "Joint torque commands", failure: "Damping mode" },
      { name: "State estimation / localization", rate: "200 Hz–1 kHz (proprio), 10 Hz (LiDAR)", hz: "200", compute: "RT CPU + Thor", kind: "Classical", inputs: "Joints, IMU, LiDAR", outputs: "TF, odometry", failure: "Base motion disabled" },
      { name: "Drive servo loops", rate: "4–40 kHz", hz: "20000", compute: "Drive firmware", kind: "Classical", inputs: "Setpoints", outputs: "Motor currents", failure: "Drive fault → safe torque off" },
      { name: "Safety controller (PLC + scanners)", rate: "≈ 1–10 ms cycle", hz: "500", compute: "Safety PLC (PL d / SIL 2-class)", kind: "Classical, safety-rated", inputs: "E-stops, scanners, speed monitoring", outputs: "Protective stop, STO, SLS", failure: "Fail-safe by design" },
      { name: "Logger (MCAP ring buffer)", rate: "per message", hz: "1", compute: "CPU + NVMe", kind: "Infrastructure", inputs: "All topics", outputs: "Episodes, event bundles", failure: "Drop low-priority topics first" },
      { name: "Fleet agent & telemetry", rate: "1–10 Hz metrics", hz: "1", compute: "CPU", kind: "Infrastructure", inputs: "Metrics, events", outputs: "Prometheus/OTel, uploads, OTA", failure: "Buffer locally; robot keeps operating" },
      { name: "Humanoid: whole-body tracking policy (S0-like)", rate: "50 Hz → 1 kHz PD", hz: "50", compute: "Thor (priority stream) / CPU", kind: "Learned (RL)", inputs: "Proprio, IMU, motion targets", outputs: "Joint PD targets", failure: "Fall management / safe pose" }
    ]
  }
};
