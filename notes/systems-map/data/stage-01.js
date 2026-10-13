/* Stage 01 — Hardware, sensing & middleware. Schema: MAINTENANCE.md */
window.PAI = window.PAI || {}; PAI.stages = PAI.stages || {};
PAI.stages["stage-01"] = {
  id: "stage-01", num: "01", title: "Hardware, sensing & middleware", short: "Hardware & sensing",
  version: "1.0.0", last_verified: "2026-10-07",
  upstream: [
    { id: "stage-00", what: "sensor list derived from the failure taxonomy; rate hierarchy; compute budget" }
  ],
  downstream: [
    { id: "stage-02", what: "time-synchronized, calibrated sensor streams for recording" },
    { id: "stage-09", what: "proprioception, F/T and state estimates for control" },
    { id: "stage-11", what: "camera pipelines and preprocessing that feed onboard inference" },
    { id: "stage-12", what: "health signals (dropped frames, clock offset, temperatures) for telemetry" }
  ],
  handoff_short: "Calibrated, PTP-synchronized topics (images, depth, F/T, tactile, joints, IMU, audio) + `calibration.yaml` + URDF with sensor frames",
  purpose: "Select, mount, calibrate and time-synchronize the sensors, and move their data through middleware with bounded latency to the policy, the controllers and the logger. Bad timestamps and drifting extrinsics are the most common silent cause of policy failure, and they originate here.",
  interface: {
    inputs: [
      { name: "Sensor requirements", format: "From `embodiment.yaml`: modalities, FOV, resolution, rates", rate: "Versioned", from: "[[s:00]]" },
      { name: "Robot description", format: "URDF / USD with mount frames", rate: "Per hardware revision", from: "[[s:00]]" },
      { name: "Calibration targets", format: "AprilGrid / ChArUco boards, F/T reference loads", rate: "Per calibration session", from: "Lab" }
    ],
    outputs: [
      { name: "Image streams", format: "`sensor_msgs/Image` or `CompressedImage` (H.264/H.265/AV1 for logging)", rate: "RGB 15–60 Hz; global shutter for wrist cams", to: "[[s:02]], [[s:11]]" },
      { name: "Depth / point clouds", format: "`Image` (16UC1 mm / 32FC1 m), `PointCloud2`", rate: "Depth 15–30 Hz; LiDAR 10–20 Hz", to: "[[s:09]] (SLAM, collision), [[s:02]]" },
      { name: "Force/torque, tactile", format: "`WrenchStamped`; tactile as images or taxel arrays", rate: "F/T 0.5–1 kHz; vision-tactile 30–60 Hz; magnetic skins 100+ Hz", to: "[[s:09]], [[s:02]], [[s:07]]" },
      { name: "Proprioception & IMU", format: "`JointState`, `Imu`", rate: "Joints 0.5–1 kHz (EtherCAT); IMU 200–1000 Hz", to: "[[s:09]], [[s:02]]" },
      { name: "Calibration bundle", format: "`calibration.yaml` (intrinsics, extrinsics as TF, time offsets) + report", rate: "Versioned; re-run on any mechanical change", to: "[[s:02]], [[s:03]], [[s:05]]" }
    ],
    handoff: "Every message carries a hardware-derived timestamp in a single clock domain (PTP grandmaster), the frame id from the URDF, and the calibration version. The recorder in [[s:02]] stores the calibration bundle inside each episode. Downstream stages must be able to answer: what was the camera-to-gripper extrinsic and the camera exposure-to-timestamp offset when this frame was taken?"
  },
  mental_model: "A sensor sample is only useful if you know when it was taken and where the sensor was. Time synchronization and calibration are part of the observation, not a preprocessing detail; a 30 ms skew between wrist image and joint state is a 30 ms-old action label.",
  mental_detail: "Three clocks matter: the **exposure / sampling time** inside the sensor, the **host receive time**, and the **control time** at which an action derived from it is applied. Hardware triggering or PTP (IEEE 1588) aligns sensor clocks to microsecond level; typical well-engineered rigs report camera-IMU sync within about 2 ms and IMU-LiDAR within about 1 ms. Software timestamps on USB cameras can be tens of milliseconds late and jittery, which shows up as a policy that is consistently late on contact.\n\nMiddleware is the second half: ROS 2 over DDS remains the default; Zenoh has been a Tier 1 RMW since Kilted Kaiju (May 2025) and Lyrical Luth (May 2026) keeps Fast DDS as default. Large tensors (images, point clouds) should travel zero-copy (shared memory: iceoryx2, Zenoh SHM, Isaac ROS NITROS) inside the robot and compressed across the network.",
  methods: [
    { id: "cameras", name: "Camera selection & placement", tags: ["robot", "il"],
      summary: "Wrist cameras: global shutter, wide FOV, short focus, 30–60 Hz; they dominate precision on contact tasks. Head / external RGB-D: context, depth for collision and grasping. Current options: RealSense D555 (PoE, IP65, global shutter, after RealSense's July 2025 spin-off from Intel), Orbbec Gemini 335 (active+passive stereo, 0.26–3 m optimal), Stereolabs ZED X (GMSL2, global shutter, neural depth). Keep camera models and mounts identical across the fleet: policies overfit to viewpoint.",
      pros: "Vision carries most of the signal for VLAs; cheap and data-rich.",
      cons: "Viewpoint changes between data collection and deployment are a top cause of policy degradation; rolling shutter blurs fast wrist motion." },
    { id: "depth-lidar", name: "Depth, LiDAR & radar", tags: ["robot", "classical"],
      summary: "Active stereo / ToF depth for manipulation workspaces; 360° LiDAR (e.g. Livox Mid-360: 200k pts/s, 40 m at 10 % reflectivity, 10 Hz, built-in IMU) for mobile base SLAM and safety-adjacent obstacle detection; radar for dust, smoke or glass where optics fail. Most VLAs consume RGB only; depth is consumed by the classical stack ([[s:09]]) and by 3D policies (DP3, point-track policies).",
      pros: "Metric geometry for collision checking, grasp planning and localization.",
      cons: "Depth fails on shiny, transparent and black objects (common in automotive parts); LiDAR rarely helps tabletop manipulation." },
    { id: "ft-tactile", name: "Force/torque & tactile", tags: ["robot", "il"], frontier: true, frontier_ref: "tactile",
      summary: "Wrist 6-axis F/T (e.g. Bota SensONE: up to 1 kHz over EtherCAT) gives net contact wrench for impedance control, insertion detection and safety thresholds. Fingertip tactile resolves local contact geometry and slip: vision-based gels (GelSight-type, Meta/GelSight Digit 360 with ~1 mN sensitivity), magnetic skins (AnySkin, replaceable, cross-instance policy transfer). Figure reports fingertip tactile sensing down to 3 g on Helix 02 hands.",
      pros: "Observes what cameras cannot: contact onset, slip, jam, seated vs unseated.",
      cons: "Gel sensors wear and drift; taxel layouts differ across vendors, so pretrained tactile encoders transfer poorly (Sparsh is one attempt at a general touch representation)." },
    { id: "proprio-imu", name: "Proprioception, IMU, audio, event cameras", tags: ["robot"],
      summary: "Joint encoders and motor currents at 0.5–1 kHz over EtherCAT with distributed clocks; IMUs for base and humanoid torso state estimation; microphones to detect latch clicks, collisions and motor anomalies; event cameras (e.g. Prophesee EVK4-HD with Sony IMX636, 1280×720, ~220 µs latency) for very fast or high-dynamic-range scenes, still mostly research in manipulation.",
      pros: "Cheap, high-rate signals that make contact and timing observable.",
      cons: "Audio and event streams are rarely in pretraining corpora, so they need task-specific data." },
    { id: "timesync", name: "Time synchronization", tags: ["robot", "classical"],
      summary: "Use a PTP grandmaster (linuxptp on Linux hosts, PTP-capable switches and NICs), hardware triggers for multi-camera exposure alignment (GMSL deserializers support this), and EtherCAT distributed clocks for joint/F/T data. Record the exposure midpoint, not the receive time. Verify with an LED or a strike test: tap the gripper on the table and check that F/T spike, audio transient and image contact frame line up.",
      pros: "Turns 10–50 ms of jitter into sub-millisecond alignment; makes action labels causal.",
      cons: "Consumer USB cameras cannot be hardware-synced; you must estimate and compensate a per-device offset." },
    { id: "calibration", name: "Calibration (intrinsic, extrinsic, temporal)", tags: ["robot", "classical", "real2sim"],
      summary: "Camera intrinsics (AprilGrid / ChArUco), hand-eye (camera-to-flange) extrinsics, camera-IMU spatio-temporal calibration (Kalibr, note it is ROS 1 only and stale since 2022), LiDAR-IMU extrinsics, F/T bias and gravity compensation, tactile per-sensor normalization. Store as TF + YAML with a version, and include it in every episode.",
      pros: "Lets you replay data in sim (real2sim), re-project 3D annotations, and swap a camera without retraining when extrinsics are model inputs.",
      cons: "Calibration silently drifts after collisions and maintenance; schedule automatic checks (fiducial on the gripper visible in the head camera)." },
    { id: "middleware", name: "Middleware & transport", tags: ["robot", "edge"],
      summary: "**ROS 2** Lyrical Luth (GA 22 May 2026) with Fast DDS default; **Zenoh** (rmw_zenoh, Tier 1 since Kilted) for lossy Wi-Fi, NAT traversal and robot-to-cloud; **Cyclone DDS** as an alternative RMW; **iceoryx2** for zero-copy shared memory on one host; Rust-native frameworks **dora-rs** (1.0 in Sep 2026) and **copper-rs** (deterministic scheduling, zero-copy logging) for teams leaving ROS. Use ROS 2 for ecosystem and drivers, but move large tensors between perception and the policy through shared memory.",
      pros: "ROS 2 gives drivers, TF, rosbag2/MCAP and tooling; Zenoh fixes DDS discovery storms on Wi-Fi.",
      cons: "DDS defaults (multicast discovery, large-message fragmentation) behave badly over Wi-Fi; mixing RMWs in one system is fragile." }
  ],
  decision: [
    { "if": "Contact-rich insertion with occluded contact", use: "Wrist F/T at ≥ 500 Hz + fingertip tactile + wrist global-shutter cameras", why: "Contact state is invisible to head cameras; F/T is the cheapest strong signal." },
    { "if": "You fine-tune a pretrained VLA", use: "Replicate its camera set and approximate poses (e.g. one wrist + one or two scene cameras)", why: "Pretraining priors are viewpoint-specific." },
    { "if": "Multi-camera rig with fast motion", use: "Global shutter + hardware trigger (GMSL or PoE with PTP)", why: "Rolling-shutter skew and unsynchronized exposures corrupt action labels." },
    { "if": "Robot on Wi-Fi talking to a workcell server or cloud", use: "Zenoh (rmw_zenoh or zenoh-bridge) with compressed images", why: "Handles NAT, lossy links and discovery better than default DDS." },
    { "if": "Single-host, high-bandwidth perception to policy", use: "Shared-memory transport (iceoryx2, Zenoh SHM, NITROS)", why: "Copying 4K images through DDS serialization wastes milliseconds and CPU." },
    { "if": "You need determinism and replayability for debugging", use: "copper-rs or a strictly scheduled executor + MCAP logging of every input", why: "Bit-exact replay turns field bugs into reproducible tests." },
    { "if": "Transparent or shiny parts", use: "Do not rely on depth; use RGB-only policies, polarization or tactile confirmation", why: "Active stereo and ToF return holes or wrong depth on such surfaces." }
  ],
  tools: [
    { id: "ros2-lyrical", name: "ROS 2 Lyrical Luth", what: "12th ROS 2 release; default RMW remains Fast DDS", maker: "Open Robotics / OSRF community", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Drivers, TF, ros2_control, rosbag2 (MCAP), ecosystem", limitations: "DDS tuning over Wi-Fi; executor latency for >1 kHz loops", release: "2026-05-22", version: "Lyrical Luth GA", link: "https://docs.ros.org/en/lyrical/Releases/Release-Lyrical-Luth.html", runs: ["robot", "edge"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "zenoh", name: "Eclipse Zenoh / rmw_zenoh", what: "Pub/sub/query protocol; Tier 1 ROS 2 RMW since Kilted", maker: "Eclipse Foundation (ZettaScale)", open: "open", license: "EPL-2.0 / Apache-2.0", maturity: "production", best_for: "Robot↔cloud links, lossy Wi-Fi, NAT traversal, fleets", limitations: "Not the ROS 2 default; some DDS-specific tooling does not apply", release: "2026-09-07", version: "zenoh 1.10.1", link: "https://github.com/eclipse-zenoh/zenoh/releases", runs: ["robot", "edge", "cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "fastdds", name: "Fast DDS", what: "Default ROS 2 DDS implementation", maker: "eProsima", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Default ROS 2 deployments; SHM transport on one host", limitations: "Recent releases are dominated by CVE fixes; tune discovery for large graphs", release: "2026-07-02", version: "v3.6.2 (year inferred)", link: "https://github.com/eProsima/Fast-DDS/releases", runs: ["robot", "edge"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "cyclonedds", name: "Eclipse Cyclone DDS", what: "Alternative ROS 2 RMW / DDS", maker: "Eclipse Foundation", open: "open", license: "EPL-2.0 / EDL-1.0", maturity: "production", best_for: "Simple, predictable DDS behavior; popular on research robots", limitations: "Smaller vendor support than Fast DDS", release: "2026-03-20", version: "11.0.1", link: "https://github.com/eclipse-cyclonedds/cyclonedds/releases", runs: ["robot", "edge"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "iceoryx2", name: "iceoryx2", what: "Rust zero-copy shared-memory IPC (single host); ROS 2 gateway", maker: "Eclipse / ekxide", open: "open", license: "Apache-2.0 / MIT", maturity: "pilot", best_for: "Moving images and tensors between processes at near-constant latency", limitations: "Single host only; still 0.x", release: "2026-09-18", version: "0.10.0", link: "https://github.com/eclipse-iceoryx/iceoryx2/releases", runs: ["robot", "edge"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "dora", name: "dora-rs", what: "Dataflow robotics framework (Rust, zero-copy, Python nodes)", maker: "dora-rs community", open: "open", license: "Apache-2.0", maturity: "pilot", best_for: "AI-heavy robot apps with Python model nodes and low overhead", limitations: "Small driver ecosystem vs ROS 2; 1.0 only since Sep 2026", release: "2026-09-03", version: "v1.0.1", link: "https://github.com/dora-rs/dora/releases", runs: ["robot", "edge"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "copper", name: "copper-rs", what: "Deterministic Rust robotics runtime with zero-copy logging and replay", maker: "Copper project", open: "open", license: "Apache-2.0", maturity: "pilot", best_for: "Deterministic replay, embedded targets, latency-critical pipelines", limitations: "Young ecosystem; ROS 2 interop via bridges", release: "2026-10-05", version: "1.2.4", link: "https://github.com/copper-project/copper-rs/releases", runs: ["robot", "edge"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "linuxptp", name: "linuxptp", what: "IEEE 1588 PTP stack for Linux (ptp4l, phc2sys)", maker: "Richard Cochran et al.", open: "open", license: "GPL-2.0", maturity: "production", best_for: "Sub-microsecond clock sync across hosts, cameras, LiDAR", limitations: "Needs NIC hardware timestamping and PTP-aware switches for best accuracy", release: null, version: "rolling", release_note: "rolling", link: "https://github.com/richardcochran/linuxptp", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "kalibr", name: "Kalibr", what: "Multi-camera and camera-IMU spatio-temporal calibration", maker: "ETH Zurich ASL", open: "open", license: "BSD-3-Clause", maturity: "production", best_for: "Camera-IMU extrinsics and time offset", limitations: "ROS 1 only (Docker); last significant update Nov 2022", release: null, version: "rolling (stale)", release_note: "no tagged releases", link: "https://github.com/ethz-asl/kalibr", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "d555", name: "RealSense D555 PoE", what: "Global-shutter active stereo RGB-D, PoE, IP65, IMU, ROS 2", maker: "RealSense (spun out of Intel, Jul 2025)", open: "closed", license: "Proprietary HW; open SDK (librealsense)", maturity: "production", best_for: "Industrial RGB-D with long cables and PTP-capable Ethernet", limitations: "Depth holes on shiny/transparent parts", release: "2025-07", version: "launched with spin-off", link: "https://realsenseai.com/products/d555-poe/", runs: ["robot"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "gemini335", name: "Orbbec Gemini 335", what: "Active+passive stereo RGB-D, 50 mm baseline, 1280×800@30, ≤1.5 % error at 2 m", maker: "Orbbec", open: "closed", license: "Proprietary HW; open SDK", maturity: "production", best_for: "Indoor/outdoor manipulation and AMRs; wrist-mountable", limitations: "Optimal range 0.26–3 m", release: null, version: "Gemini 330 series", release_note: "in production", link: "https://orbbec.com/products/stereo-vision-camera/gemini-335", runs: ["robot"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "zedx", name: "Stereolabs ZED X", what: "GMSL2 global-shutter stereo with neural depth and IMU", maker: "Stereolabs", open: "closed", license: "Proprietary HW + SDK", maturity: "production", best_for: "Jetson-based robots needing synchronized multi-camera rigs", limitations: "SDK tied to NVIDIA; neural depth costs GPU time", release: null, version: "ZED X / X Mini", release_note: "in production", link: "https://www.mouser.in/new/stereolabs/stereolabs-zed-x-stereo-camera/", runs: ["robot", "edge"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "mid360", name: "Livox Mid-360", what: "360°×(−7° to 52°) LiDAR, 200k pts/s, 10 Hz, built-in IMU, 6.5 W", maker: "Livox (DJI)", open: "closed", license: "Proprietary HW; open driver (livox_ros_driver2)", maturity: "production", best_for: "Mobile base SLAM/obstacle detection on AMRs and humanoids", limitations: "Not a safety-rated scanner; sparse for tabletop geometry", release: null, version: "Mid-360 (Mid-360S variant)", release_note: "in production", link: "https://www.livoxtech.com/mid-360/specs", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "sensone", name: "Bota SensONE", what: "6-axis F/T with IMU, EtherCAT or serial/USB, up to 1 kHz, IP67", maker: "Bota Systems", open: "closed", license: "Proprietary", maturity: "production", best_for: "Wrist wrench sensing for impedance control and insertion detection", limitations: "Thermal drift; needs gravity/bias compensation", release: null, version: "SensONE / T80", release_note: "in production", link: "https://qviro.com/product/bota-systems/the-sensone/specifications", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "digit360", name: "Digit 360", what: "Multimodal fingertip tactile sensor (18+ sensing features, ~1 mN)", maker: "Meta FAIR + GelSight", open: "mixed", license: "Research release; commercial via GelSight", maturity: "pilot", best_for: "Research on fine contact, slip, texture", limitations: "Cost, wear, limited policy-learning datasets", release: "2024-10", version: "announced Oct 2024", link: "https://www.therobotreport.com/gelsight-meta-ai-release-digit-360-tactile-sensor-for-robotic-fingers/", runs: ["robot"], tech: ["il"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "anyskin", name: "AnySkin", what: "Replaceable magnetic tactile skin; policies transfer across skin instances", maker: "NYU", open: "open", license: "Open design files", maturity: "research", best_for: "Cheap, replaceable fingertip/palm tactile with slip detection", limitations: "Magnetic interference; lower spatial resolution than gels", release: "2024-09", version: "arXiv 2409.08276", link: "https://any-skin.github.io/", runs: ["robot"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "evk4", name: "Prophesee EVK4-HD", what: "Event camera kit (Sony IMX636, 1280×720, ~220 µs latency, >86 dB)", maker: "Prophesee / Sony", open: "closed", license: "Proprietary; Metavision SDK", maturity: "pilot", best_for: "High-speed or high-dynamic-range sensing", limitations: "Few manipulation datasets or pretrained encoders", release: "2026-03", version: "2026 product brief", link: "https://www.prophesee.ai/wp-content/uploads/2026/03/EVK4-HD-Prophesee-Evaluation-Kit-Brief-2026.pdf", runs: ["robot"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null }
  ],
  where: {
    cloud: { l: 0, n: "" },
    onprem: { l: 1, n: "calibration rigs, lab infrastructure" },
    sim: { l: 1, n: "sensor models for sim (noise, FOV)" },
    edge: { l: 2, n: "preprocessing, compression, shared-memory transport" },
    robot: { l: 3, n: "the stage is physical" }
  },
  tech: {
    il: { l: 2, n: "sensor set defines policy observations" },
    rl: { l: 1, n: "proprio + IMU for locomotion policies" },
    classical: { l: 3, n: "calibration, sync, state estimation" },
    sim2real: { l: 1, n: "sensor noise and latency models" },
    real2sim: { l: 2, n: "calibrated cameras enable scene reconstruction" },
    real2sim2real: { l: 1, n: "" },
    fm: { l: 1, n: "" },
    wam: { l: 1, n: "multi-view consistency matters for video models" },
    icl: { l: 0, n: "" }
  },
  stacks: {
    open: { title: "Open stack", items: [
      "ROS 2 Lyrical + rmw_zenoh (Wi-Fi) or Cyclone DDS (wired)",
      "linuxptp on all hosts; GMSL or PoE cameras where possible",
      "Kalibr (in Docker) + easy_handeye-style hand-eye calibration; calibration YAML in git",
      "rosbag2 with MCAP storage for logging; Foxglove or Rerun for inspection"
    ], note: "Budget a day per rig for sync verification with a strike test." },
    industry: { title: "Industry pattern", items: [
      "Sensors on PTP-synced Ethernet/GMSL with hardware triggers; EtherCAT DC for joints and F/T",
      "NVIDIA Isaac ROS / Holoscan-style zero-copy GPU pipelines into the policy process",
      "Automatic on-robot calibration checks against fiducials; calibration version in every log",
      "Fingertip tactile on dexterous hands (publicly stated for Figure Helix 02)"
    ], note: "Exact sensor stacks of humanoid companies are not published." }
  },
  example: {
    summary: "MB-1 carries nine image streams and several high-rate signals. All hosts sync to a PTP grandmaster in the base; cameras on GMSL2 are hardware-triggered at 30 Hz; F/T and joints run on EtherCAT with distributed clocks at 1 kHz; a wrist MEMS microphone records 48 kHz audio to catch the connector latch click.",
    artifacts: [
      { artifact: "`/head/stereo/left/image_rect`", format: "`sensor_msgs/Image` (logged as H.265)", shape: "1280×720 RGB8 @ 30 Hz", consumer: "[[s:02]] logger, [[s:11]] policy preproc (resize 224×224)" },
      { artifact: "`/wrist_{l,r}/image_raw`", format: "`sensor_msgs/Image`", shape: "640×480 RGB8 @ 30 Hz, global shutter, hw trigger", consumer: "policy, logger" },
      { artifact: "`/tactile/{l,r}/f{0,1}/image`", format: "`sensor_msgs/Image`", shape: "320×240 RGB8 @ 30 Hz ×4", consumer: "tactile encoder → policy tokens" },
      { artifact: "`/wrist_{l,r}/wrench`", format: "`geometry_msgs/WrenchStamped`", shape: "6-D @ 1 kHz (bias- and gravity-compensated)", consumer: "[[s:09]] impedance, safety thresholds; logger decimated to 500 Hz" },
      { artifact: "`/joint_states`", format: "`sensor_msgs/JointState`", shape: "20 joints × (pos, vel, effort) @ 500 Hz", consumer: "controller, policy state vector" },
      { artifact: "`/base/lidar`, `/imu`", format: "`PointCloud2`, `Imu`", shape: "Mid-360 ~20k pts/frame @ 10 Hz; IMU 200 Hz", consumer: "[[s:09]] localization" },
      { artifact: "`/audio/wrist_mic`", format: "`audio_common_msgs` (16-bit PCM)", shape: "48 kHz mono → 16 kHz for models", consumer: "latch-click detector ([[s:04]] events)" },
      { artifact: "`calibration.yaml` v14", format: "YAML + TF static", shape: "9 cameras intrinsics/extrinsics, time offsets, F/T bias", consumer: "every episode in [[s:02]]" }
    ],
    humanoid: "H-1 adds a torso IMU at 1 kHz and foot contact / joint torque sensing that the locomotion policy depends on. Its sensing for the RL whole-body controller is proprioceptive only (joint positions/velocities, IMU, previous actions); cameras feed only the higher VLA layer. Head cameras move with gait, so the visual policy must tolerate motion blur and viewpoint oscillation that a wheeled robot never sees."
  },
  pitfalls: [
    { t: "Using host receive time as the sample time", d: "USB and network buffering add tens of milliseconds of variable delay; the policy learns from stale observations paired with current actions." },
    { t: "Calibrating once", d: "Collisions, cable strain and maintenance shift extrinsics. A 2 mm wrist-camera shift can be enough to break a learned insertion." },
    { t: "Logging only compressed images at low bitrate", d: "Compression artifacts at contact regions remove exactly the detail the policy needs. Keep wrist streams at higher bitrate than scene streams." },
    { t: "Running DDS discovery over Wi-Fi with defaults", d: "Multicast discovery and large-message fragmentation cause lost samples and multi-second stalls; use Zenoh or a discovery server." },
    { t: "Assuming depth works on parts", d: "Black plastic connectors and shiny metal pins return invalid depth; any depth-based grasp pipeline needs fallbacks." },
    { t: "Ignoring F/T temperature drift", d: "Uncompensated drift moves force thresholds; re-bias at known no-contact states (e.g. at every chunk start in free space)." }
  ],
  numbers: [
    { m: "Achievable sync (well-engineered rig)", v: "IMU–LiDAR ≈ 1 ms, IMU–camera ≈ 2 ms; PTP hardware timestamps µs-level", s: "Dataset rigs surveyed in multi-sensor SLAM literature ([survey](https://arxiv.org/pdf/2103.16045))" },
    { m: "Livox Mid-360", v: "200k pts/s, 40 m @ 10 %, 70 m @ 80 %, 10 Hz, 6.5 W", s: "[Livox specs](https://www.livoxtech.com/mid-360/specs)" },
    { m: "Wrist F/T (SensONE)", v: "up to 1000 samples/s, EtherCAT, integrated IMU", s: "[spec sheet](https://qviro.com/product/bota-systems/the-sensone/specifications)" },
    { m: "Event camera (IMX636)", v: "1280×720, ~220 µs latency, >86 dB", s: "[Prophesee brief](https://www.prophesee.ai/wp-content/uploads/2026/03/EVK4-HD-Prophesee-Evaluation-Kit-Brief-2026.pdf)" },
    { m: "Fingertip tactile sensitivity", v: "Digit 360 ≈ 1 mN; Helix 02 hands ≈ 3 g", s: "[The Robot Report](https://www.therobotreport.com/gelsight-meta-ai-release-digit-360-tactile-sensor-for-robotic-fingers/), [Helix 02](https://humanoidroboticstechnology.com/industry-news/figure-launches-helix-02/)" },
    { m: "Video bandwidth budget (logging)", v: "≈ 2–5 Mbit/s per 720p H.265 stream; 9 streams ≈ 25 Mbit/s ≈ 11 GB per robot-hour", s: "Arithmetic: 25 Mbit/s × 3600 s ÷ 8 ≈ 11.25 GB; bitrates are typical encoder settings, tune per stream" }
  ],
  papers: [
    { title: "AnySkin: Plug-and-play Skin Sensing for Robotic Touch", year: "2024", venue: "arXiv 2409.08276", url: "https://arxiv.org/pdf/2409.08276", why: "Replaceable tactile skin with cross-instance policy transfer; shows how sensor variance breaks learned policies." },
    { title: "ForceVLA: Force-aware MoE for Contact-rich Manipulation", year: "2025", venue: "NeurIPS", url: "https://arxiv.org/html/2505.22159v3", why: "Why 6-axis F/T as a first-class modality improves VLA insertion success (+23.2 % over π0 baselines)." },
    { title: "The Matter of Time: Precise Sensor Synchronization in Robotic Computing", year: "2021", venue: "arXiv 2103.16045", url: "https://arxiv.org/pdf/2103.16045", why: "Engineering of hardware sync and its effect on perception accuracy." },
    { title: "ROS 2 Lyrical Luth release notes", year: "2026", venue: "ROS docs", url: "https://docs.ros.org/en/lyrical/Releases/Release-Lyrical-Luth.html", why: "Current LTS feature set and RMW status." },
    { title: "ROS 2 Lyrical Luth and 11 years of Fast DDS as default", year: "2026", venue: "ROS Discourse", url: "https://discourse.openrobotics.org/t/ros-2-lyrical-luth-and-11-years-of-fast-dds-as-ros-2-default-middleware/55062", why: "Why Zenoh did not become the default and what that means for deployments." },
    { title: "copper-rs: real-time robotics in Rust", year: "2026", venue: "Codethink", url: "https://www.codethink.co.uk/articles/2026/copper-rs-real-time-robotics.html", why: "Deterministic, replayable runtime as an alternative to ROS 2 executors." }
  ],
  open_problems: [
    "No standard tactile data format or pretrained encoder that transfers across gel, magnetic and taxel sensors.",
    "Automatic, continuous extrinsic calibration on deployed fleets without fiducials.",
    "Middleware that is simultaneously deterministic, zero-copy, network-transparent and ROS-compatible.",
    "Which modalities pay off: published ablations of audio, event and tactile inputs in generalist policies are sparse."
  ],
  self_check: [
    { q: "Your policy reaches for the connector 40 ms late in deployment but not in replay. What sensing issue do you suspect and how do you prove it?", a: "Timestamp mismatch between recording and deployment, typically receive-time stamps on one camera or different buffering on the live path. Prove it with a strike test (gripper tap: compare F/T spike, audio transient and the image frame showing contact) on the deployed stack, and compare the image-to-joint-state offset in live logs vs training logs. Fix with hardware timestamps or a measured per-camera offset, then re-validate." },
    { q: "Why does a camera remount after maintenance require action in stages 02, 07 and 12, not only here?", a: "Data recorded afterwards has a different viewpoint distribution (02 must tag the new calibration version), the policy may need fine-tuning or at least evaluation under the new extrinsics (07/10), and fleet management (12) must track which robots run with which calibration so incidents can be correlated. If extrinsics are not model inputs, the policy silently degrades." },
    { q: "When would you move the image path from DDS to shared memory, and what do you lose?", a: "When frames are large (multi-megapixel, many cameras) and producer and consumer share a host, serialization and copies cost milliseconds and CPU. You lose network transparency (remote subscribers need a bridge) and some ROS tooling; keep a compressed DDS/Zenoh copy for logging and remote viewing." },
    { q: "What consumes F/T data and at what rate, and what happens if the F/T stream drops for 100 ms?", a: "The impedance/admittance controller and safety thresholds consume it at 0.5–1 kHz; the policy consumes a decimated wrench (e.g. 50 Hz) as an observation; the logger keeps 500 Hz. A 100 ms dropout must trigger a controller fallback (hold stiffness, stop pressing) and a safety-layer response; the policy should see a flag rather than stale values." },
    { q: "A teammate proposes adding an event camera to fix motion blur on wrist images. What do you check first?", a: "Whether a global-shutter wrist camera with shorter exposure solves it; whether any pretrained encoder or dataset covers event streams (few do), meaning all training data for that modality must be self-collected; bandwidth and sync integration; and whether the downstream policy architecture can tokenize events. Usually the cheaper fix wins." }
  ]
};
