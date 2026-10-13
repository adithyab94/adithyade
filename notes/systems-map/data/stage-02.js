/* Stage 02 — Data collection. Schema: MAINTENANCE.md */
window.PAI = window.PAI || {}; PAI.stages = PAI.stages || {};
PAI.stages["stage-02"] = {
  id: "stage-02", num: "02", title: "Data collection", short: "Data collection",
  version: "1.0.0", last_verified: "2026-10-07",
  upstream: [
    { id: "stage-00", what: "action space, episode definition, task spec and failure taxonomy" },
    { id: "stage-01", what: "synchronized, calibrated sensor streams" },
    { id: "stage-13", what: "targeted collection requests from failure mining (feedback loop)" }
  ],
  downstream: [
    { id: "stage-03", what: "raw episodes (MCAP) plus metadata for ingestion" },
    { id: "stage-04", what: "operator notes, intervention flags and live success marks to seed labels" },
    { id: "stage-06", what: "real scans and trajectories for real2sim" }
  ],
  handoff_short: "Raw MCAP episodes + episode metadata JSON (operator, task, calibration and spec versions, success, intervention spans)",
  purpose: "Produce demonstrations and interaction data that cover the task distribution with the right action labels, at a cost per useful hour you can sustain. The collection method decides the action quality, the diversity and the embodiment gap that every later stage inherits.",
  interface: {
    inputs: [
      { name: "Task & episode spec", format: "`task_spec.md`, `embodiment.yaml`", rate: "Versioned", from: "[[s:00]]" },
      { name: "Sensor streams", format: "ROS 2 topics / shared memory", rate: "See [[s:01]]", from: "[[s:01]]" },
      { name: "Collection requests", format: "Ticket: scenario, object set, count, deadline", rate: "Weekly in a running flywheel", from: "[[s:13]]" }
    ],
    outputs: [
      { name: "Raw episode logs", format: "MCAP (rosbag2 storage) with compressed video", rate: "≈ 10–15 GB per robot-hour for a 9-camera rig", to: "[[s:03]]" },
      { name: "Episode metadata", format: "JSON sidecar: `episode_id`, task, language instruction, operator, robot id, spec + calibration versions, success flag, intervention spans, start/end markers", rate: "1 per episode", to: "[[s:03]], [[s:04]]" },
      { name: "Human / egocentric video", format: "MP4 + hand/head pose streams (e.g. Vision Pro, Aria, gloves)", rate: "Hours to 10k+ hours", to: "[[s:03]], [[s:07]] (latent-action or retargeted pretraining)" },
      { name: "Autonomous rollouts & interventions", format: "MCAP with policy version and `intervention=true` segments", rate: "Continuous from fleet", to: "[[s:13]], [[s:08]]" }
    ],
    handoff: "An episode is the unit of exchange. Each one must be self-describing: which spec and calibration versions, which operator and device, which policy version (for autonomous data), which segments were human-controlled. Episodes without this metadata cannot be filtered, weighted or audited later and usually end up discarded."
  },
  mental_model: "Data collection is choosing a point on a triangle of action fidelity, diversity and cost per hour. Teleoperation gives exact robot actions but is slow and narrow; handheld and wearable devices trade a small embodiment gap for 3–10× throughput and real-world diversity; egocentric human video gives near-unlimited diversity but no robot actions at all.",
  mental_detail: "The 2025–2026 evidence changed the balance. [[f:egocentric-scale|EgoScale]] trained on 20,854 hours of action-labelled egocentric human video and found a log-linear relation between human-data scale and validation loss, then bridged to a 22-DoF robot hand with only 50 h of aligned human data and 4 h of robot data. Generalist reports 270,000 h of real manipulation data growing at about 10,000 h per week for GEN-0. Data-scaling studies on fixed tasks show that **diversity of environments and objects matters far more than demo count** once each environment has a modest number of demos ([Lin et al., ICLR 2025](https://arxiv.org/html/2410.18647v3)). The practical pattern: a large, cheap, diverse layer (human video, handheld devices) for pretraining; a smaller, exact layer (robot teleop) for embodiment alignment; and autonomous rollouts with interventions for the last mile ([[s:13]]).",
  methods: [
    { id: "leader-follower", name: "Leader-follower teleoperation", tags: ["il", "robot"],
      summary: "A kinematically matched leader arm (ALOHA, GELLO, SO-101 leader) drives the follower joint-to-joint. Lowest latency, exact joint actions, operators learn fast. GELLO supports YAM, FR3, Panda, UR and xArm.",
      pros: "Exact robot actions; intuitive; cheap (a GELLO leader is mostly 3D-printed parts and Dynamixels).",
      cons: "One operator per robot; no force feedback on most rigs; collection limited to where the robot is.",
      refs: [{ t: "GELLO", u: "https://github.com/wuphilipp/gello_software" }, { t: "ALOHA", u: "https://github.com/tonyzhaozh/aloha" }] },
    { id: "vr-teleop", name: "VR / XR teleoperation", tags: ["il", "robot"],
      summary: "Headset hand and head tracking (Apple Vision Pro, Meta Quest 3, PICO 4U) streamed to IK or whole-body retargeting; stereo video back to the operator. Open-TeleVision (CoRL 2024) and TWIST2 for humanoids: PICO 4U + two motion trackers (~$1,000) plus a $250 2-DoF neck; 100 demos in about 15 minutes on a Unitree G1.",
      pros: "Works for humanoids and dexterous hands; no leader hardware; can be remote.",
      cons: "Retargeting errors, latency sickness, no haptics; hand tracking jitter at contact.",
      refs: [{ t: "TWIST2", u: "https://arxiv.org/pdf/2511.02832" }, { t: "Open-TeleVision", u: "https://github.com/OpenTeleVision/TeleVision" }] },
    { id: "handheld", name: "Handheld & wearable interfaces (UMI family)", tags: ["il"], frontier: true, frontier_ref: "umi-wearables",
      summary: "A handheld gripper with a wrist camera (UMI: GoPro + fisheye + SLAM) records the gripper trajectory in the wild without a robot; the robot later reproduces it with the same gripper and camera. Variants: FastUMI (simpler hardware/tracking), DexUMI (hand exoskeleton + robot-hand inpainting, 86 % avg success on two hands), HiFi-UMI (full-palm glove), FreeTacMan (finger-worn with tactile), UMI on Legs / HuMI (mobile and humanoid).",
      pros: "3–10× faster than teleop, collected anywhere, naturally diverse; minimal embodiment gap when the gripper matches.",
      cons: "SLAM is fragile (UMI authors call ORB-SLAM3 the most fragile part; degrades in direct sunlight); no robot proprioception; dynamics differ (human wrist vs robot arm).",
      refs: [{ t: "UMI repo", u: "https://github.com/real-stanford/universal_manipulation_interface" }, { t: "DexUMI", u: "https://arxiv.org/html/2505.21864v2" }, { t: "Data Pyramid survey", u: "https://arxiv.org/pdf/2607.24744" }] },
    { id: "exo-gloves", name: "Exoskeletons, gloves & mocap", tags: ["il", "rl"],
      summary: "Arm exoskeletons (AirExo-2) and data gloves (Manus, used in NVIDIA EgoScale) capture joint-level human motion; optical or inertial mocap captures full-body motion for humanoid retargeting (Helix 02 was trained on over 1,000 h of joint-level retargeted human motion). Mocap libraries (LAFAN1, AMASS) also seed RL motion tracking in [[s:08]].",
      pros: "High-DoF hand and body motion at human speed; works for humanoid whole-body skills.",
      cons: "Retargeting is lossy (different limb proportions, joint limits); gloves drift; studio mocap is location-bound.",
      refs: [{ t: "AirExo-2", u: "https://arxiv.org/abs/2503.03081v2" }, { t: "Manus × EgoScale", u: "https://www.manus-meta.com/use-cases/nvidia-egoscale-scaling-dexterous-robot-manipulation-with-manus-gloves" }] },
    { id: "egocentric", name: "Egocentric human video at scale", tags: ["il", "fm"], frontier: true, frontier_ref: "egocentric-scale",
      summary: "Head-mounted capture with hand pose: Apple Vision Pro (EgoDex: 829 h, 90M frames, 338k demos, 194 tasks, 3D hand joints), Meta Aria Gen 2 (shipping to researchers from Q2 2026), commodity rigs (EgoKit, MobileEgo). EgoScale's 20,854 h is the largest action-labelled corpus reported so far; HumanScale (2026) argues egocentric human video can outperform real-robot data for pretraining.",
      pros: "Orders of magnitude more diversity per dollar; no robot needed; captures human strategies.",
      cons: "No robot actions (needs retargeting, latent actions or human-robot mid-training); privacy and consent obligations (GDPR for workplaces and homes); hand-object occlusion.",
      refs: [{ t: "EgoScale", u: "https://research.nvidia.com/labs/gear/egoscale" }, { t: "EgoDex", u: "https://github.com/apple/ml-egodex" }, { t: "HumanScale", u: "https://arxiv.org/pdf/2606.20521" }] },
    { id: "internet-video", name: "Internet & third-person video", tags: ["fm", "wam"],
      summary: "Unlabelled web video teaches dynamics and semantics through video-model pretraining (Cosmos, Genie 3 trained on ~200k h of online video) and through [[g:latent-action|latent action models]] (LAPA, UniVLA). It is consumed by world models and WAMs ([[s:07]]) rather than directly by action heads.",
      pros: "Free, massive, diverse physics.",
      cons: "No actions, wrong viewpoints, licensing questions; signal per hour is low for precise manipulation." },
    { id: "kinesthetic", name: "Kinesthetic teaching", tags: ["il", "robot"],
      summary: "Physically guiding a backdrivable or torque-controlled arm in gravity-compensation mode.",
      pros: "Exact proprioception and natural contact forces for short precise skills.",
      cons: "The human is in the camera view (visual distribution shift); slow; bimanual is awkward." },
    { id: "autonomous", name: "Autonomous collection, interventions & fleet data", tags: ["il", "rl", "robot"],
      summary: "Deployed policies generate rollouts; humans intervene on failure (HG-DAgger style) and those correction segments are the most valuable data per minute. π*0.6's RECAP trains on demos, on-policy rollouts and teleoperated interventions together ([[s:08]], [[s:13]]). Autonomous resets and scripted variations scale collection without operators.",
      pros: "On-distribution data exactly where the policy fails; scales with fleet size.",
      cons: "Requires reliable success detection and safe autonomy; biased toward states the current policy reaches." }
  ],
  decision: [
    { "if": "Single robot, precise bimanual task, fine-tuning a pretrained VLA", use: "Leader-follower teleop (GELLO/ALOHA-style), 50–500 demos per task family", why: "Exact actions in the target embodiment matter most at small scale." },
    { "if": "You need diversity across many homes / sites with a parallel gripper", use: "UMI-style handheld collection + a small robot-teleop alignment set", why: "Diversity drives generalization; handheld throughput is several times teleop." },
    { "if": "Dexterous hands", use: "Gloves / exoskeleton (DexUMI) + egocentric video pretraining (EgoScale recipe)", why: "VR teleop of 20+ DoF hands is slow and imprecise." },
    { "if": "Humanoid whole-body skills", use: "Mocap / VR whole-body teleop (TWIST2) for demos; mocap libraries for RL tracking", why: "Locomotion + manipulation must be captured jointly." },
    { "if": "Deployed fleet with a working policy", use: "Intervention-driven collection with on-robot tagging; prioritize failures", why: "Correction data targets the policy's actual failure distribution." },
    { "if": "Recording people in workplaces or homes in the EU", use: "Consent, purpose limitation, face/screen blurring at ingest, retention policy", why: "GDPR applies to egocentric and scene video ([[s:14]])." }
  ],
  tools: [
    { id: "lerobot-record", name: "LeRobot record / teleop", what: "Recording, teleop and dataset tooling; supports SO-101, OpenArm, Unitree G1, many teleoperators", maker: "Hugging Face", open: "open", license: "Apache-2.0", maturity: "production", best_for: "End-to-end collection → LeRobotDataset v3 for small and mid-size labs", limitations: "Not a fleet-scale collection system; limited multi-robot orchestration", release: "2026-08-03", version: "v0.6.1", link: "https://github.com/huggingface/lerobot/releases", runs: ["robot", "cloud"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "gello", name: "GELLO", what: "Low-cost kinematic-replica leader arms for joint-space teleop", maker: "UC Berkeley (Wu et al.)", open: "open", license: "MIT", maturity: "production", best_for: "Fast, intuitive joint-space teleop of 6/7-DoF arms", limitations: "No force feedback; one replica per arm model", release: null, version: "rolling", release_note: "rolling", link: "https://github.com/wuphilipp/gello_software", runs: ["robot"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "umi", name: "UMI", what: "Handheld gripper + GoPro + SLAM pipeline for in-the-wild demos", maker: "Stanford / Columbia / TRI", open: "open", license: "MIT", maturity: "pilot", best_for: "Diverse parallel-gripper demonstrations without a robot", limitations: "ORB-SLAM3 fragility; gripper must match robot's", release: null, version: "rolling", release_note: "rolling", link: "https://github.com/real-stanford/universal_manipulation_interface", runs: ["onprem"], tech: ["il"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "dexumi", name: "DexUMI", what: "Hand exoskeleton + robot-hand video inpainting for dexterous data", maker: "Stanford / Columbia et al.", open: "open", license: "See repo", maturity: "research", best_for: "Dexterous-hand demos with haptic feedback", limitations: "Exoskeleton per robot-hand design; small-scale evidence (86 % avg on 2 hands)", release: "2025-05", version: "CoRL 2025", link: "https://arxiv.org/html/2505.21864v2", runs: ["onprem"], tech: ["il"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "twist2", name: "TWIST2", what: "Mocap-free humanoid whole-body teleop: PICO 4U + motion trackers + 2-DoF neck", maker: "Academic (TWIST authors)", open: "open", license: "Open-source (see paper)", maturity: "research", best_for: "Humanoid loco-manipulation demos on Unitree G1", limitations: "VR retargeting limits precision; G1-centric", release: "2025-11", version: "arXiv 2511.02832", link: "https://arxiv.org/pdf/2511.02832", runs: ["robot"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "opentelevision", name: "Open-TeleVision", what: "Immersive stereo VR teleop (Vision Pro / Quest 3)", maker: "UC San Diego / MIT", open: "open", license: "Not stated in repo", maturity: "research", best_for: "Dexterous and humanoid upper-body teleop with active head camera", limitations: "Licence unclear; latency over WAN", release: "2024-07", version: "CoRL 2024", link: "https://github.com/OpenTeleVision/TeleVision", runs: ["robot"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "aria-gen2", name: "Project Aria Gen 2", what: "Research glasses with SLAM, eye/hand tracking, on-device perception", maker: "Meta Reality Labs", open: "closed", license: "Research program (application)", maturity: "pilot", best_for: "Egocentric human data with calibrated poses", limitations: "Research-only distribution; ships to approved labs from Q2 2026", release: "2026-06", version: "research kit shipping Q2 2026", link: "https://www.meta.com/blog/aria-gen-2-updates/", runs: ["onprem"], tech: ["il"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "egodex", name: "EgoDex dataset", what: "829 h Vision Pro egocentric video with 3D hand joints; 338k demos, 194 tasks", maker: "Apple", open: "open", license: "See repo (research)", maturity: "research", best_for: "Pretraining hand-trajectory and dexterous policies", limitations: "Tabletop only; human hands, no robot actions", release: "2025-05", version: "arXiv; ICLR 2026", link: "https://github.com/apple/ml-egodex", runs: ["cloud"], tech: ["il", "fm"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "oxe", name: "Open X-Embodiment", what: "1M+ real trajectories from 22 embodiments, 21 institutions (RLDS)", maker: "Google DeepMind + 20 partners", open: "open", license: "Per-dataset licences", maturity: "production", best_for: "Cross-embodiment pretraining mixtures", limitations: "Heterogeneous quality, action conventions and camera setups", release: "2023-10-03", version: "v1 (+ later additions)", link: "https://arxiv.org/pdf/2310.08864", runs: ["cloud"], tech: ["il", "fm"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "droid", name: "DROID", what: "76k Franka trajectories, 350 h, 564 scenes, 3 synced cameras + calibration", maker: "Stanford / Berkeley / TRI et al.", open: "open", license: "CC BY 4.0", maturity: "production", best_for: "In-the-wild single-arm pretraining; evaluation (RoboArena, PolaRiS)", limitations: "Single embodiment; teleop quality varies", release: "2024-03", version: "RSS 2024", link: "https://arxiv.org/abs/2403.12945v2", runs: ["cloud"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "agibot-world", name: "AgiBot World", what: "1,003,672 trajectories (~43.8 TB), 217 tasks, 100 AgiBot G1 robots", maker: "AgiBot / OpenDriveLab", open: "open", license: "Non-commercial research licence (check card)", maturity: "production", best_for: "Large bimanual humanoid-torso pretraining", limitations: "Single embodiment family; non-commercial terms", release: "2025-03", version: "Beta (IEEE TRO 2026)", link: "https://github.com/OpenDriveLab/Agibot-World", runs: ["cloud"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "galaxea-ow", name: "Galaxea Open-World", what: "100k dual-arm trajectories (500+ h) on R1 Lite (23-DoF mobile bimanual), 150 categories, 50 scenes", maker: "Galaxea", open: "open", license: "See HF card", maturity: "pilot", best_for: "Mobile bimanual pretraining; RLDS and LeRobot formats", limitations: "Single robot family", release: null, version: "with G0 / G0.5", release_note: "see HF", link: "https://github.com/OpenGalaxea/GalaxeaVLA", runs: ["cloud"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null }
  ],
  where: {
    cloud: { l: 1, n: "upload and dedup of raw logs" },
    onprem: { l: 2, n: "collection studios, handheld/egocentric capture" },
    sim: { l: 1, n: "sim teleop for synthetic seeds" },
    edge: { l: 2, n: "on-robot recorders, compression, intervention tagging" },
    robot: { l: 3, n: "teleop and autonomous rollouts" }
  },
  tech: {
    il: { l: 3, n: "demonstrations are the IL training signal" },
    rl: { l: 1, n: "autonomous rollouts and interventions feed RL" },
    classical: { l: 1, n: "IK / retargeting in teleop" },
    sim2real: { l: 0, n: "" },
    real2sim: { l: 2, n: "scans and trajectories seed real2sim" },
    real2sim2real: { l: 1, n: "" },
    fm: { l: 2, n: "pretraining corpora (human video, cross-embodiment)" },
    wam: { l: 2, n: "video without actions trains world models" },
    icl: { l: 1, n: "demo libraries for retrieval / prompting" }
  },
  stacks: {
    open: { title: "Open stack", items: [
      "GELLO or SO-101 leaders → LeRobot `record` → LeRobotDataset v3",
      "rosbag2 (MCAP) for raw multi-sensor logging on ROS rigs",
      "UMI hardware + pipeline for in-the-wild gripper data",
      "EgoDex / Aria datasets for human-video pretraining experiments"
    ], note: "Expect 8–12 usable episodes per operator-hour at first, 25–40 after 2–3 weeks (vendor-reported ranges)." },
    industry: { title: "Industry pattern (public statements)", items: [
      "Dedicated teleop operations with shift-based operators and QA (cost reported at ≈ $118 per collected hour in a 2026 vendor benchmark, down from ≈ $340 in 2024; treat as vendor claims)",
      "Wearable / handheld programs for diverse in-the-wild data (Generalist: 270k h, +10k h per week)",
      "Egocentric human data at 10k+ h scale (NVIDIA EgoScale 20,854 h; GR00T N1.7 pretraining includes 20k h EgoScale)",
      "Fleet intervention data feeding RL fine-tuning (Physical Intelligence RECAP)"
    ], note: "Collection hardware details are rarely disclosed; numbers come from company posts and papers." }
  },
  example: {
    summary: "MB-1 collects in three layers. (1) **Robot teleop**: two operators per shift use GELLO-style leader arms for the arms and a 3D mouse for base and torso; 400 h over 10 weeks across 3 workcell replicas with 60 connector SKUs. (2) **Handheld**: 120 h with UMI-style handheld grippers carrying the same fingertip tactile pads and wrist camera model, collected at 6 supplier sites. (3) **Interventions**: once deployed, every human takeover is logged with its span. Each episode is a rosbag2 MCAP file plus a JSON sidecar.",
    artifacts: [
      { artifact: "`ep_2026-09-14_mb1-07_000183.mcap`", format: "MCAP (rosbag2 storage plugin), zstd chunks", shape: "≈ 100 s, ≈ 300 MB (9 H.265 streams + 1 kHz F/T + joints + audio)", consumer: "[[s:03]] ingestion" },
      { artifact: "`…000183.meta.json`", format: "JSON", shape: "{task: 'mate_connector_A12', instruction, operator: op-41, robot: mb1-07, spec: 2.0, calib: 14, success: true, interventions: [], subtask_marks: [...]}", consumer: "[[s:03]] catalog, [[s:04]] label seeding" },
      { artifact: "Handheld episodes", format: "MP4 (fisheye) + IMU + tactile + SLAM trajectory CSV", shape: "gripper pose @ 60 Hz in world frame", consumer: "[[s:03]] → retarget to MB-1 EE frame" },
      { artifact: "Intervention segments", format: "MCAP + `intervention: [{t0, t1, operator, reason_code}]`", shape: "≈ 2–20 s spans", consumer: "[[s:13]] mining, [[s:08]] RECAP-style training" }
    ],
    humanoid: "H-1 data is dominated by **motion data**: VR whole-body teleop (TWIST2-style PICO rig) for task demos, studio and library mocap retargeted to the robot for the RL tracking controller, and egocentric human video with gloves for hand skills. Robot-teleop hours are scarce and expensive because each session risks falls; most diversity comes from human data."
  },
  pitfalls: [
    { t: "Optimizing demo count instead of diversity", d: "Data-scaling results show performance follows environment and object diversity; 500 demos in one scene generalize worse than 50 in each of 10 scenes." },
    { t: "Inconsistent operator strategies", d: "Multimodal demonstrations (some operators push, others lift) are fine for diffusion/flow heads but poison MSE regression heads; record operator id and review strategy drift." },
    { t: "Missing metadata", d: "Episodes without spec/calibration version or success flags cannot be filtered later; enforce sidecar schema validation at upload." },
    { t: "Collecting only successes", d: "Failures and recoveries are essential for success detectors, value functions and RL. Keep them, labelled." },
    { t: "Ignoring privacy for egocentric and scene video", d: "Faces, screens and badges in factory or home footage create GDPR obligations; blur at ingest and document lawful basis." },
    { t: "Treating handheld data as robot data", d: "Human wrist dynamics and speeds differ; without an alignment set on the real robot, policies trained on handheld data overshoot or miss timing." }
  ],
  numbers: [
    { m: "DROID", v: "76k trajectories · 350 h · 564 scenes · 86 tasks · 50 collectors · 12 months", s: "[arXiv 2403.12945](https://arxiv.org/abs/2403.12945v2)" },
    { m: "AgiBot World Beta", v: "1,003,672 trajectories · ~43.8 TB · 217 tasks · 100 robots", s: "[GitHub](https://github.com/OpenDriveLab/Agibot-World)" },
    { m: "EgoScale human data", v: "20,854 h · 9,869 scenes · 6,015 tasks · 43,237 objects; mid-training 50 h human + 4 h robot", s: "[NVIDIA GEAR](https://research.nvidia.com/labs/gear/egoscale)" },
    { m: "EgoDex", v: "829 h · 90M frames · 338k demos · 194 tasks", s: "[apple/ml-egodex](https://github.com/apple/ml-egodex)" },
    { m: "GEN-0 corpus", v: "270,000 h real manipulation, +10,000 h/week", s: "[Generalist blog](https://generalistai.com/blog/gen-0) (company claim)" },
    { m: "Teleop cost (vendor benchmark)", v: "≈ $118 per collected hour (Mar 2026) vs ≈ $340 (2024); operators $28–60 per hour; 8–12 → 25–40 episodes/h with training", s: "[Dexset guide](https://dexset.ai/blogs/robot-training-data-costs-pricing-complete-2026/) — vendor claims, not independently verified" },
    { m: "TWIST2 throughput", v: "100 demos in ~15 min; rig ≈ $1,000 + $250 neck", s: "[arXiv 2511.02832](https://arxiv.org/pdf/2511.02832)" }
  ],
  papers: [
    { title: "DROID: A Large-Scale In-The-Wild Robot Manipulation Dataset", year: "2024", venue: "RSS", url: "https://arxiv.org/abs/2403.12945v2", why: "Reference for multi-site collection protocol, calibration and metadata." },
    { title: "Universal Manipulation Interface (UMI) and the Data Pyramid survey", year: "2024 / 2026", venue: "RSS / arXiv 2607.24744", url: "https://arxiv.org/pdf/2607.24744", why: "Survey of handheld, wearable and teleop interfaces and their quality–cost trade-offs." },
    { title: "EgoScale: Scaling Dexterous Manipulation with Diverse Egocentric Human Data", year: "2026", venue: "arXiv 2602.16710", url: "https://arxiv.org/html/2602.16710", why: "Log-linear scaling with human data; three-stage human→robot recipe." },
    { title: "Data Scaling Laws in Imitation Learning for Robotic Manipulation", year: "2025", venue: "ICLR (oral)", url: "https://arxiv.org/html/2410.18647v3", why: "Diversity beats demo count; tells you how to spend a collection budget." },
    { title: "TWIST2: Scalable, Portable, and Holistic Humanoid Data Collection System", year: "2025", venue: "arXiv 2511.02832", url: "https://arxiv.org/pdf/2511.02832", why: "Practical humanoid whole-body teleop at low cost." },
    { title: "Open X-Embodiment: Robotic Learning Datasets and RT-X Models", year: "2023", venue: "ICRA 2024", url: "https://arxiv.org/pdf/2310.08864", why: "The cross-embodiment pooling effort and its heterogeneity problems." }
  ],
  open_problems: [
    "Retargeting human video to robots without an aligned human–robot set: how small can the mid-training bridge be?",
    "Quality metrics for demonstrations that predict downstream policy value (not just smoothness or success).",
    "Legal and consent frameworks for large-scale egocentric capture in workplaces.",
    "Whether wearable data scales as well for force-critical tasks as for kinematic ones (most evidence is kinematic)."
  ],
  self_check: [
    { q: "You have budget for 300 hours. Option A: 300 h robot teleop in one lab. Option B: 60 h robot teleop + 240 h handheld across 20 sites. Which do you pick for a generalist bin-picking policy, and what must B include to work?", a: "B, because generalization tracks environment/object diversity. B must include an alignment set on the real robot (same gripper and wrist camera geometry), consistent action frames (handheld trajectories converted into the robot's EE frame), calibration of the handheld camera, and evaluation on held-out sites. Without the robot set the policy will misjudge dynamics and timing." },
    { q: "Which downstream consumers break if operators stop marking subtask boundaries during collection?", a: "Subtask segmentation in [[s:04]] falls back to automatic methods (VLM segmentation), which are noisier; subtask-level success metrics in [[s:10]] lose ground truth; hierarchical policies and language-conditioned subtask prompts in [[s:07]] get weaker supervision; failure mining in [[s:13]] cannot localize where in the task failures occur." },
    { q: "Why are intervention segments worth more than fresh teleop demos, and what bias do they carry?", a: "They are on the policy's own state distribution exactly where it fails, so they correct compounding errors (the DAgger argument) and supply negative/positive pairs for advantage or value learning. Bias: they only cover states the current policy reaches, and operators intervene late or inconsistently; you need intervention reason codes and a policy-version tag to weight them correctly." },
    { q: "EgoScale bridged human video to a robot with 4 h of robot data. What breaks if your robot hand has a very different kinematic structure from the human hand?", a: "The shared action space (relative wrist pose plus finger joints or keypoints) no longer maps cleanly; retargeting introduces systematic errors, and the mid-training stage needs more aligned data. EgoScale reports transfer to lower-DoF hands, but the more the morphology departs, the more the human prior covers intent and approach rather than finger-level control." },
    { q: "What metadata would you require in every episode sidecar, and which stage needs each field?", a: "episode/robot/operator ids (audit, operator-quality analysis in 04/13); task id + language instruction (07 conditioning); spec and calibration versions (03 conversion, 05 real2sim, 07 normalization); policy version for autonomous data (13, 08); success flag and intervention spans (04 labels, 08 rewards/advantages, 10 eval); subtask marks (04, 10); site and object set ids (10 generalization splits); consent/privacy flags (14)." }
  ]
};
