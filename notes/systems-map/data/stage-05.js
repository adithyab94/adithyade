/* Stage 05 — Simulation & synthetic data. Schema: MAINTENANCE.md */
window.PAI = window.PAI || {}; PAI.stages = PAI.stages || {};
PAI.stages["stage-05"] = {
  id: "stage-05", num: "05", title: "Simulation & synthetic data", short: "Simulation & synthetic",
  version: "1.0.0", last_verified: "2026-10-07",
  upstream: [
    { id: "stage-00", what: "robot description (USD/MJCF/URDF), task success predicates" },
    { id: "stage-04", what: "object poses, meshes, affordances for scene building" },
    { id: "stage-06", what: "system-identified dynamics and reconstructed scenes (real2sim)" }
  ],
  downstream: [
    { id: "stage-06", what: "simulated data and environments to be transferred / co-trained" },
    { id: "stage-08", what: "massively parallel RL environments" },
    { id: "stage-07", what: "synthetic demonstrations and augmented video for training mixtures" },
    { id: "stage-10", what: "simulated benchmarks and regression suites" }
  ],
  handoff_short: "Task environments (USD/MJCF + task code), synthetic episodes in the training schema tagged `source=sim`, augmented video, neural-trajectory data",
  purpose: "Generate experience that is cheaper, safer, more varied or more labelled than real data: physics simulation for RL and evaluation, procedural and generative scene creation, demonstration multiplication, and video/world models that synthesize photoreal trajectories. The question is never 'is sim realistic' but 'does this synthetic data move the real-world metric'.",
  interface: {
    inputs: [
      { name: "Robot & object assets", format: "USD / MJCF / URDF, meshes (OBJ/GLB), materials", rate: "Versioned", from: "[[s:00]], [[s:04]], asset generators" },
      { name: "Real scenes", format: "Gaussian splats / meshes from phone or robot scans", rate: "Per site", from: "[[s:06]]" },
      { name: "Seed demonstrations", format: "Episodes (teleop in sim or real)", rate: "10–1,000 seeds", from: "[[s:02]]" }
    ],
    outputs: [
      { name: "Task environments", format: "Isaac Lab / ManiSkill / mjlab / MuJoCo Playground task classes + USD/MJCF scenes", rate: "Versioned with code", to: "[[s:08]], [[s:10]]" },
      { name: "Synthetic demonstrations", format: "Training schema (LeRobotDataset / HDF5), `source=sim`, generator version", rate: "10k–1M episodes per job", to: "[[s:03]] → [[s:07]]" },
      { name: "Augmented / generated video", format: "MP4 + pseudo-actions (IDM or latent actions)", rate: "Batch", to: "[[s:07]]" },
      { name: "Throughput profile", format: "Steps/s per GPU at target fidelity", rate: "Per env version", to: "[[s:08]] planning" }
    ],
    handoff: "Synthetic data enters the same catalog as real data with `source`, generator, randomization config and seed recorded. Environments used for evaluation are frozen and versioned so that a sim score in [[s:10]] means the same thing across months."
  },
  mental_model: "There are now two kinds of simulator. **Physics simulators** are exact about the equations and wrong about the world (contacts, materials, appearance). **Neural simulators** (video and world models) are right about appearance and statistically plausible about the world, but have no guaranteed physics. Use physics sim where you need ground truth, contacts and millions of steps (RL, locomotion, eval regressions); use neural sim where you need visual diversity and long-tail scenes (data augmentation, policy evaluation at scale).",
  mental_detail: "GPU-parallel physics changed the economics of RL: thousands of environments per GPU, policies for locomotion in hours. The 2026 platform landscape converged on a few engines: NVIDIA PhysX and **Newton** (Warp-based, OpenUSD, co-developed with Google DeepMind and Disney Research under the Linux Foundation; 1.0 at GTC March 2026) inside **Isaac Lab 3.0**, which became multi-backend; **MuJoCo / MuJoCo Warp** (also part of the Newton project) with the **mjlab** and **MuJoCo Playground** frameworks; **Genesis**; and **ManiSkill3 / SAPIEN**. Contact-rich manipulation with deformables (cables, cloth) remains the weakest area for physics sim.\n\nOn the neural side, video world models (Cosmos Predict / Transfer 2.5, Cosmos 3 since June 2026, Genie 3, company-internal models at 1X and Tesla) generate photoreal variations or whole trajectories. DreamGen showed a humanoid learning 22 new behaviours from a single teleoperated pick-and-place task plus video-model 'neural trajectories' labelled with inverse-dynamics or latent-action models.",
  methods: [
    { id: "gpu-physics", name: "GPU-parallel physics simulation", tags: ["sim", "rl"],
      summary: "Isaac Lab 3.0 (beta Mar 2026, early access Sep 2026, GA targeted end of Oct 2026) on Isaac Sim 6.0 with factory-based multi-backend physics (PhysX, Newton), kit-less installs, Warp-native data paths. MuJoCo 3.15 / MuJoCo Warp with mjlab (Isaac Lab-style manager API on MuJoCo Warp) and MuJoCo Playground. Genesis 1.4 (large-scene performance via island hibernation). ManiSkill3 on SAPIEN 3 (PhysX 5 GPU). Drake for accurate contact (hydroelastic) and optimization-heavy work.",
      pros: "10³–10⁵ parallel envs per GPU; exact state, privileged info, free labels.",
      cons: "Contact, friction and deformables diverge from reality; rendering realism varies; engine choice locks asset formats.",
      refs: [{ t: "Isaac Lab releases", u: "https://github.com/isaac-sim/IsaacLab/releases" }, { t: "Newton 1.0", u: "https://developer.nvidia.com/blog/newton-adds-contact-rich-manipulation-and-locomotion-capabilities-for-industrial-robotics" }, { t: "mjlab", u: "https://github.com/mujocolab/mjlab" }] },
    { id: "rendering", name: "Rendering & sensor simulation", tags: ["sim", "sim2real"],
      summary: "Ray-traced RTX rendering in Isaac Sim, rasterized batched rendering in ManiSkill/Genesis, and neural rendering: Isaac Sim 6.0 ships NuRec Gaussian-splat scene support; GS-based simulators (RoboGSim, SplatSim) render photoreal views of reconstructed scenes for policy training and evaluation. Sensor models add noise, latency and rolling shutter.",
      pros: "Closes the visual gap for vision policies; enables photoreal digital twins.",
      cons: "Rendering cost dominates throughput for vision RL; splats are static unless combined with physics proxies." },
    { id: "scene-gen", name: "Procedural & generative scene and asset creation", tags: ["sim", "fm"],
      summary: "Procedural layouts (Infinigen-style), LLM-designed tasks and scenes (RoboCasa365: 365 tasks, 2,500+ kitchen scenes, 3,200+ objects, tasks designed with LLM guidance), text/image-to-3D asset generation and single-image reconstruction (SAM 3D Objects), articulated object libraries (PartNet-Mobility via SAPIEN). Assets need collision meshes, mass, friction and joint parameters, which generators rarely provide correctly.",
      pros: "Diversity at near-zero marginal cost; long-tail objects and layouts.",
      cons: "Physically wrong assets (mass, friction, inertia) produce wrong behaviour; visual realism ≠ physical plausibility." },
    { id: "dr", name: "Domain randomization", tags: ["sim", "sim2real", "rl"],
      summary: "Randomize dynamics (mass, friction, damping, motor strength, PD gains, latency 0–20 ms, sensor noise) and appearance (textures, lighting, camera pose) so the real world is one sample of the training distribution. Standard for locomotion and whole-body control; RoboTwin 2.0 uses strong domain randomization for bimanual data generation.",
      pros: "Simple, robust, no real data needed for many locomotion tasks.",
      cons: "Over-randomization yields conservative policies; does not fix systematic model errors (use system ID or delta models, [[s:06]])." },
    { id: "demo-multiplication", name: "Demonstration multiplication (MimicGen family)", tags: ["sim", "il"],
      summary: "Split seed demos into object-centric segments and re-target them to new object poses and scenes: MimicGen (50k demos from 200 human demos across 18 tasks), DexMimicGen (21k from 60 for bimanual dexterous), SkillMimicGen (+26.6 pp on cluttered tasks via skill decomposition and motion-planned stitching). Available inside Isaac Lab Mimic (MimicGen and SkillGen since Isaac Lab 2.3).",
      pros: "Two to three orders of magnitude more demos per human demo; free labels.",
      cons: "Assumes object-centric, quasi-static segments; fails on contact-rich dynamics and deformables; inherits seed strategy (low behavioural diversity).",
      refs: [{ t: "MimicGen", u: "https://arxiv.org/pdf/2310.17596" }, { t: "DexMimicGen", u: "https://arxiv.org/html/2410.24185v2" }, { t: "Isaac Lab 2.3 Mimic", u: "https://developer.nvidia.com/blog/streamline-robot-learning-with-whole-body-control-and-enhanced-teleoperation-in-nvidia-isaac-lab-2-3/" }] },
    { id: "video-augmentation", name: "Generative augmentation of real and sim video", tags: ["sim2real", "fm", "wam"],
      summary: "Controlled video-to-video models restyle sim renders into photoreal video or vary real video (lighting, textures, backgrounds) while preserving geometry and actions: Cosmos Transfer 2.5 (2B, depth/segmentation/edge/blur controls, distilled edge model Feb 2026) is the main open option.",
      pros: "Visual diversity without new physics or collection; keeps action labels valid.",
      cons: "Hallucinated geometry changes break action validity near contact; expensive per frame.",
      refs: [{ t: "Cosmos-Transfer2.5", u: "https://github.com/nvidia-cosmos/cosmos-transfer2.5" }] },
    { id: "neural-trajectories", name: "World models as data engines (neural trajectories)", tags: ["wam", "fm", "il"], frontier: true, frontier_ref: "wm-simulators",
      summary: "Fine-tune a video world model on your robot, prompt it with an image and instruction to generate new task videos, recover actions with an inverse-dynamics model or a latent action model, then train on these 'neural trajectories' (DreamGen / GR00T-Dreams with Cosmos Predict 2 and Cosmos Reason). Cosmos 3 (June 2026) unifies reasoning, world generation and action prediction in a two-tower mixture-of-transformers model with Super, Nano and (announced) Edge variants.",
      pros: "Generates behaviours and environments never demonstrated; uses web-scale video priors.",
      cons: "Physics plausibility is not guaranteed; action labels inferred by IDM are noisy; GPU cost per trajectory is high.",
      refs: [{ t: "DreamGen", u: "https://www.alphaxiv.org/audio/2505.12705" }, { t: "GR00T-Dreams blog", u: "https://developer.nvidia.com/blog/enhance-robot-learning-with-synthetic-trajectory-data-generated-by-world-foundation-models" }, { t: "Cosmos 3", u: "https://nvidianews.nvidia.com/news/nvidia-launches-cosmos-3-the-open-frontier-foundation-model-for-physical-ai" }] },
    { id: "interactive-wm", name: "Interactive world models", tags: ["wam"], frontier: true, frontier_ref: "wm-simulators",
      summary: "Action-controllable generative environments: Genie 3 (DeepMind, Aug 2025: 720p, 24 fps, minutes of consistency, ~1 minute visual memory) for agent training; 1X World Model (action-conditioned, used to predict outcomes of NEO policies); Tesla's neural world simulator shared between FSD and Optimus. Mostly closed and used internally.",
      pros: "Closed-loop interaction with photoreal, open-ended worlds.",
      cons: "No published contact accuracy; drift over long horizons; access limited." }
  ],
  decision: [
    { "if": "Legged locomotion or whole-body control via RL", use: "Isaac Lab (PhysX/Newton) or mjlab / MuJoCo Playground with heavy domain randomization", why: "Mature sim2real recipes; thousands of envs per GPU." },
    { "if": "Tabletop pick-and-place with a vision policy", use: "MimicGen-style multiplication in Isaac Lab Mimic or RoboCasa/ManiSkill + sim-real co-training", why: "Cheap demo diversity; co-training reported +38 % average real improvement." },
    { "if": "Contact-rich insertion with tight tolerances", use: "Physics sim with SDF / hydroelastic contact (Newton, Drake, MuJoCo) mainly for RL residuals and eval; real data for the base policy", why: "Visual sim helps little; contact fidelity is the bottleneck." },
    { "if": "Cables, cloth, food", use: "Newton VBD / MuJoCo flex for research; otherwise real data + neural augmentation", why: "Deformable physics is still the least reliable sim component." },
    { "if": "Need visual diversity on real data", use: "Cosmos Transfer-style augmentation with geometry controls", why: "Keeps action labels valid while changing appearance." },
    { "if": "Need new behaviours with little teleop", use: "Neural trajectories (DreamGen recipe) + IDM labelling, validated in real", why: "Shown to unlock new verbs from one teleop task; verify physical validity." },
    { "if": "Debugging at the integration level (ROS 2 stack)", use: "Gazebo Jetty or Isaac Sim with ROS 2 bridge for software-in-the-loop", why: "Tests the real software graph, not only the policy." }
  ],
  tools: [
    { id: "isaaclab", name: "Isaac Lab 3.0", what: "Robot learning framework on Isaac Sim 6; multi-backend physics (PhysX, Newton), Mimic, teleop, RL", maker: "NVIDIA", open: "open", license: "BSD-3-Clause", maturity: "pilot", best_for: "RL for locomotion/WBC, Mimic data generation, photoreal vision tasks", limitations: "3.0 is early access (GA targeted end of Oct 2026); heavy install; NVIDIA GPUs only", release: "2026-09-16", version: "v3.0.0-EA (v2.3.2 stable)", link: "https://github.com/isaac-sim/IsaacLab/releases", runs: ["sim", "cloud"], tech: ["rl", "il", "sim2real"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "isaacsim", name: "Isaac Sim 6.0", what: "Omniverse-based robot simulator; RTX sensors, NuRec Gaussian splats, ROS 2 bridge", maker: "NVIDIA", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Photoreal sensor sim, digital twins, SIL with ROS 2", limitations: "GPU- and memory-hungry; steep learning curve", release: "2026-06", version: "6.0.x GA (Jun 2026)", link: "https://docs.isaacsim.omniverse.nvidia.com/6.0.1/installation/download.html", runs: ["sim", "cloud", "onprem"], tech: ["sim2real", "real2sim"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "newton", name: "Newton", what: "GPU physics engine on Warp + OpenUSD (VBD deformables, solver coupling, Kamino); Linux Foundation project", maker: "NVIDIA + Google DeepMind + Disney Research", open: "open", license: "Apache-2.0", maturity: "pilot", best_for: "Contact-rich manipulation and locomotion at scale; deformables research", limitations: "Rapid release cadence; integration still maturing in Isaac Lab 3.0", release: "2026-10-05", version: "v1.6.1 (1.0 at GTC Mar 2026)", link: "https://github.com/newton-physics/newton/releases", runs: ["sim"], tech: ["rl", "sim2real"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "mujoco", name: "MuJoCo", what: "Physics engine (CPU) with MJX (JAX) and MuJoCo Warp (GPU) variants", maker: "Google DeepMind", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Accurate, fast rigid-body + contact; research standard; sim2sim checks", limitations: "Rendering is basic; deformables (flex) still experimental features", release: "2026-10-05", version: "3.15.0", link: "https://github.com/google-deepmind/mujoco/releases", runs: ["sim"], tech: ["rl", "classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "mujoco-warp", name: "MuJoCo Warp", what: "GPU-accelerated MuJoCo on NVIDIA Warp (part of the Newton project)", maker: "Google DeepMind + NVIDIA", open: "open", license: "Apache-2.0", maturity: "pilot", best_for: "Thousands of parallel MuJoCo envs for RL", limitations: "Some MuJoCo features unsupported; NVIDIA GPUs", release: "2026-10-05", version: "3.15.0", link: "https://github.com/google-deepmind/mujoco_warp", runs: ["sim"], tech: ["rl"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "mjlab", name: "mjlab", what: "Isaac Lab manager-style API on MuJoCo Warp; velocity tracking & motion imitation tasks", maker: "mujocolab (Zakka, Liao, Yi, Sreenath, Abbeel et al.)", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Lightweight humanoid/legged RL with native MuJoCo data structures", limitations: "Smaller task library than Isaac Lab; limited photoreal rendering", release: "2026-08-09", version: "1.6.0", link: "https://github.com/mujocolab/mjlab", runs: ["sim"], tech: ["rl", "sim2real"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "playground", name: "MuJoCo Playground", what: "GPU robot-learning environments on MJX: dm_control, locomotion, manipulation, vision", maker: "Google DeepMind", open: "open", license: "Apache-2.0", maturity: "pilot", best_for: "JAX-based RL pipelines; quick sim2real baselines", limitations: "JAX ecosystem; fewer manipulation assets", release: null, version: "rolling", release_note: "rolling", link: "https://github.com/google-deepmind/mujoco_playground", runs: ["sim"], tech: ["rl"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "genesis", name: "Genesis", what: "Python-native multi-physics simulator (rigid, MPM, SPH, FEM) with GPU parallelism", maker: "Genesis-Embodied-AI", open: "open", license: "Apache-2.0", maturity: "pilot", best_for: "Fast prototyping, multi-material physics, large scenes", limitations: "Launch-era speed claims were publicly disputed; validate contact accuracy for your task", release: "2026-09-30", version: "v1.4.3 (year inferred)", link: "https://github.com/Genesis-Embodied-AI/Genesis/releases", runs: ["sim"], tech: ["rl"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "maniskill", name: "ManiSkill3 / SAPIEN 3", what: "GPU-parallel manipulation sim and benchmarks; SAPIEN PhysX 5 backend", maker: "UC San Diego (Hao Su lab)", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Manipulation RL/IL at scale, sim2real tooling, SimplerEnv GPU variant", limitations: "Rendering realism below RTX; contact for tight insertion limited", release: "2026-04-21", version: "mani-skill 3.0.1 · sapien 3.0.3 (2026-03-10)", link: "https://github.com/haosulab/ManiSkill/releases", runs: ["sim"], tech: ["rl", "il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "drake", name: "Drake", what: "Model-based design and verification toolbox: multibody dynamics, hydroelastic contact, optimization", maker: "Toyota Research Institute", open: "open", license: "BSD-3-Clause", maturity: "production", best_for: "Accurate contact studies, trajectory optimization, controller verification", limitations: "Not built for 10k-env parallel RL", release: "2026-09-10", version: "v1.57.0", link: "https://github.com/RobotLocomotion/drake/releases", runs: ["sim"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "gazebo", name: "Gazebo (Jetty)", what: "ROS-native robot simulator for software-in-the-loop", maker: "Open Robotics", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Testing the full ROS 2 stack (nav, control) in CI", limitations: "Not designed for GPU-parallel learning", release: "2025", version: "gz-sim 10.0.0 (Jetty)", link: "https://github.com/gazebosim/gz-sim/releases", runs: ["sim"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "robocasa", name: "RoboCasa365", what: "365 kitchen tasks, 2,500+ scenes, 3,200+ objects, 2,200+ h demos; leaderboard", maker: "UT Austin et al.", open: "open", license: "MIT (code), CC BY 4.0 (assets/data)", maturity: "pilot", best_for: "Household manipulation data and benchmarking (DP, π0, GR00T supported)", limitations: "Kitchen domain; robosuite/MuJoCo physics limits contact realism", release: "2026-05-12", version: "v1.0.1", link: "https://github.com/robocasa/robocasa", runs: ["sim"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "behavior1k", name: "BEHAVIOR-1K / OmniGibson", what: "1,000 household activities in Isaac Sim; 2025 challenge with 10k demos (1,200+ h)", maker: "Stanford Vision & Learning Lab", open: "open", license: "MIT", maturity: "research", best_for: "Long-horizon household mobile manipulation", limitations: "Very hard (2025 winner: 26 % q-score); heavy simulator", release: "2025-12-07", version: "2025 challenge results", link: "https://behavior.stanford.edu/challenge/archive/2025/index.html", runs: ["sim"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "isaaclab-mimic", name: "Isaac Lab Mimic (MimicGen / SkillGen)", what: "Demonstration multiplication inside Isaac Lab", maker: "NVIDIA", open: "open", license: "BSD-3-Clause / Apache-2.0", maturity: "pilot", best_for: "Scaling 10s of teleop demos to 1000s of sim demos", limitations: "Quasi-static, object-centric segments only", release: "2026-02-02", version: "with Isaac Lab 2.3.x", link: "https://developer.nvidia.com/blog/streamline-robot-learning-with-whole-body-control-and-enhanced-teleoperation-in-nvidia-isaac-lab-2-3/", runs: ["sim"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "cosmos-transfer", name: "Cosmos Transfer 2.5", what: "Multi-control video-to-video world model (2B) for sim2real and real2real augmentation", maker: "NVIDIA", open: "mixed", license: "Code Apache-2.0; weights NVIDIA Open Model License", maturity: "pilot", best_for: "Photoreal restyling of sim renders and real video with geometry controls", limitations: "Compute-heavy; may alter fine geometry near contact", release: "2026-02-23", version: "distilled edge model (initial release Oct 2025)", link: "https://github.com/nvidia-cosmos/cosmos-transfer2.5", runs: ["cloud"], tech: ["sim2real", "wam"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: "Cosmos 3 (development moved Jun 2026)" },
    { id: "cosmos3", name: "Cosmos 3", what: "Open world foundation model: two-tower mixture-of-transformers for reasoning, world generation and action prediction (Super, Nano; Edge announced)", maker: "NVIDIA", open: "open", license: "NVIDIA Open Model License", maturity: "pilot", best_for: "World generation and as a WAM backbone", limitations: "New (Jun 2026); independent evaluations limited", release: "2026-06-01", version: "Cosmos 3 Super / Nano", link: "https://nvidianews.nvidia.com/news/nvidia-launches-cosmos-3-the-open-frontier-foundation-model-for-physical-ai", runs: ["cloud"], tech: ["wam", "fm"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "gr00t-dreams", name: "GR00T-Dreams (DreamGen)", what: "Blueprint for neural trajectories: fine-tuned video WM + IDM/latent actions", maker: "NVIDIA", open: "open", license: "See repo", maturity: "research", best_for: "Generating new behaviours/environments from few demos", limitations: "IDM label noise; physical validity unverified", release: "2025-05", version: "DreamGen paper (May 2025)", link: "https://developer.nvidia.com/blog/enhance-robot-learning-with-synthetic-trajectory-data-generated-by-world-foundation-models", runs: ["cloud"], tech: ["wam", "il"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "genie3", name: "Genie 3", what: "Real-time interactive world model (720p, 24 fps, minutes of consistency)", maker: "Google DeepMind", open: "closed", license: "Not publicly available (research preview)", maturity: "research", best_for: "Agent training in generated worlds (navigation, long-horizon)", limitations: "Closed; no contact-level physics guarantees", release: "2025-08", version: "Genie 3", link: "https://www.techrepublic.com/article/news-google-deepmind-genie-3/", runs: ["cloud"], tech: ["wam"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null }
  ],
  where: {
    cloud: { l: 3, n: "GPU clusters run sim and generative models" },
    onprem: { l: 2, n: "on-prem GPU clusters for large sim jobs" },
    sim: { l: 3, n: "the stage is simulation" },
    edge: { l: 0, n: "" },
    robot: { l: 0, n: "" }
  },
  tech: {
    il: { l: 2, n: "synthetic demos for imitation" },
    rl: { l: 3, n: "parallel envs for RL" },
    classical: { l: 1, n: "motion planners stitch synthetic demos" },
    sim2real: { l: 3, n: "DR, rendering, augmentation" },
    real2sim: { l: 2, n: "reconstructed scenes as environments" },
    real2sim2real: { l: 2, n: "" },
    fm: { l: 2, n: "video FMs as data engines" },
    wam: { l: 3, n: "world models as simulators" },
    icl: { l: 0, n: "" }
  },
  stacks: {
    open: { title: "Open stack", items: [
      "Isaac Lab 2.3 (stable) / 3.0-EA or mjlab + MuJoCo Warp for RL",
      "ManiSkill3 or RoboCasa365 for manipulation data and benchmarks",
      "MimicGen in Isaac Lab Mimic to multiply teleop seeds",
      "Cosmos Transfer 2.5 / Cosmos 3 for visual augmentation; DreamGen recipe for neural trajectories"
    ], note: "All of the above are open source or open-weight; NVIDIA GPUs required for most." },
    industry: { title: "Industry pattern", items: [
      "Large GPU sim farms for humanoid RL (locomotion, WBC); NVIDIA stack common among humanoid makers",
      "Neural world simulators for evaluation and data: 1X World Model, Tesla neural world simulator (shared FSD/Optimus)",
      "Digital twins of customer sites built from scans (Omniverse / NuRec) for commissioning and testing",
      "Synthetic data as a fraction of mixtures; exact ratios are not public"
    ], note: "Company statements describe these systems qualitatively; measured contributions are rarely disclosed." }
  },
  example: {
    summary: "MB-1 uses sim in three ways. (1) A **digital twin of the workcell** in Isaac Lab 3.0 with Newton SDF contact for the connector and header CAD, used for MimicGen multiplication (200 sim-teleop seeds → 20,000 demos with randomized tote layouts, connector SKUs and lighting) and for a nightly regression suite. (2) **Cosmos Transfer** restyles a subset of sim renders to match real workcell lighting. (3) A small **residual RL** environment for the insertion phase ([[s:08]]). The cable is simplified to a rigid capsule chain; cable-routing data comes from real teleop only.",
    artifacts: [
      { artifact: "`envs/mb1_workcell` (USD + task code)", format: "Isaac Lab 3.0 task, Newton backend", shape: "4,096 envs/GPU (state-only RL); 64 envs/GPU with 3 RTX cameras", consumer: "[[s:08]], [[s:10]] regression" },
      { artifact: "`sim-mimicgen-2026.09`", format: "LeRobotDataset v3, `source=sim`, generator `mimicgen@isaaclab3-ea`", shape: "20,000 episodes, same 24-D action and camera schema as real", consumer: "[[s:03]] → co-training mix (25 %)" },
      { artifact: "Augmented video", format: "MP4 + original actions", shape: "5,000 episodes restyled (Cosmos Transfer depth+seg control)", consumer: "[[s:07]]" },
      { artifact: "Randomization config", format: "YAML", shape: "friction 0.4–1.2, connector mass ±20 %, latency 0–30 ms, camera pose ±1 cm / ±2°", consumer: "[[s:06]] audit" }
    ],
    humanoid: "For H-1 sim is the **primary** training environment: the whole-body tracking controller trains entirely in Isaac Lab / mjlab with 4,096+ parallel envs, heavy dynamics randomization and terrain curricula, using retargeted mocap as targets; days of GPU time replace years of real experience. Visual realism barely matters for this layer (proprioceptive policy); physical fidelity of actuators and contacts dominates ([[s:06]])."
  },
  pitfalls: [
    { t: "Measuring sim quality by eye", d: "Photoreal renders with wrong friction or mass teach wrong behaviour. Validate by the real-world metric of policies trained with and without the synthetic data." },
    { t: "Generated assets without physics", d: "Text-to-3D meshes have no mass, inertia or proper collision geometry; default values cause sliding, tunnelling and unrealistic grasps." },
    { t: "Synthetic data dominating the mixture", d: "Too much sim shifts the policy toward sim-specific cues. Tune the co-training ratio (see [[s:06]]) and evaluate on real." },
    { t: "Comparing engines on speed alone", d: "Steps/second claims (some publicly disputed) are meaningless without fixed accuracy, contact settings and rendering; benchmark your own task." },
    { t: "Trusting neural trajectories' actions", d: "IDM-inferred actions on generated video can be physically impossible; filter by kinematic feasibility and validate on hardware." },
    { t: "Unversioned eval environments", d: "Changing a sim asset silently changes benchmark scores; freeze eval envs and record their hash with every result." }
  ],
  numbers: [
    { m: "MimicGen multiplication", v: "200 human demos → 50k demos (18 tasks)", s: "[arXiv 2310.17596](https://arxiv.org/pdf/2310.17596)" },
    { m: "DexMimicGen", v: "60 human demos → 21k demos", s: "[arXiv 2410.24185](https://arxiv.org/html/2410.24185v2)" },
    { m: "DreamGen", v: "22 new humanoid behaviours from teleop data of a single pick-and-place task", s: "[DreamGen](https://www.alphaxiv.org/audio/2505.12705)" },
    { m: "RoboCasa365", v: "365 tasks · 2,500+ scenes · 3,200+ objects · 2,200+ h demos", s: "[GitHub](https://github.com/robocasa/robocasa)" },
    { m: "Genie 3", v: "720p · 24 fps · minutes of consistency · ~1 min memory", s: "[TechRepublic](https://www.techrepublic.com/article/news-google-deepmind-genie-3/)" },
    { m: "BEHAVIOR Challenge 2025", v: "50 tasks, 10,000 demos (1,200+ h); winner 26 % q-score", s: "[BEHAVIOR](https://behavior.stanford.edu/challenge/archive/2025/index.html)" }
  ],
  papers: [
    { title: "MimicGen: A Data Generation System for Scalable Robot Learning using Human Demonstrations", year: "2023", venue: "CoRL", url: "https://arxiv.org/pdf/2310.17596", why: "The core demo-multiplication method used in Isaac Lab Mimic." },
    { title: "DreamGen: Unlocking Generalization in Robot Learning through Video World Models", year: "2025", venue: "arXiv 2505.12705", url: "https://www.alphaxiv.org/audio/2505.12705", why: "Neural trajectories: video models as data engines with IDM/latent-action labels." },
    { title: "Newton adds contact-rich manipulation and locomotion capabilities", year: "2026", venue: "NVIDIA blog", url: "https://developer.nvidia.com/blog/newton-adds-contact-rich-manipulation-and-locomotion-capabilities-for-industrial-robotics", why: "Current state of the open GPU physics engine behind Isaac Lab 3.0." },
    { title: "RoboCasa365 repository", year: "2026", venue: "UT Austin", url: "https://github.com/robocasa/robocasa", why: "Large-scale procedural + LLM-designed task generation with demos and leaderboard." },
    { title: "Cosmos 3 launch", year: "2026", venue: "NVIDIA", url: "https://www.marktechpost.com/2026/06/03/nvidia-releases-cosmos-3-a-two-tower-mixture-of-transformers-foundation-model-unifying-physical-reasoning-world-generation-and-action-generation/", why: "Open world model that combines generation and action prediction." },
    { title: "Sim-and-Real Co-Training: A Simple Recipe for Vision-Based Robotic Manipulation", year: "2025", venue: "arXiv 2503.24361", url: "https://arxiv.org/html/2503.24361v2", why: "Quantifies when and how much synthetic data helps real performance." }
  ],
  open_problems: [
    "Contact and deformable physics fidelity sufficient for sub-millimetre insertion and cable handling at RL scale.",
    "Generated assets with correct physical properties (mass, friction, articulation) from images or text.",
    "Measuring physical consistency of neural simulators (do world models follow actions? see 2026 diagnostics papers).",
    "A standard asset + task format across engines (OpenUSD physics schemas are converging but not complete)."
  ],
  self_check: [
    { q: "Your MimicGen-expanded dataset improves sim success from 40 % to 90 % but real success does not change. Where do you look?", a: "Visual gap (sim renders vs real cameras: restyle or co-train), behaviour diversity (all demos inherit the seed strategy), contact fidelity of the phases that fail in real (insertion), and the co-training ratio. Evaluate per subtask: MimicGen helps reaching/grasping phases far more than contact phases." },
    { q: "Why can a proprioceptive locomotion policy transfer from sim with almost no real data while a vision manipulation policy cannot?", a: "Its observations (joint states, IMU) have small sim-real gaps that domain randomization covers, and its dynamics errors are absorbed by randomization and robust control. Vision policies face a large appearance gap plus contact-rich dynamics with long-tail objects, which randomization alone does not cover." },
    { q: "What does a neural simulator give you that a physics simulator does not, and what must you verify before training on its output?", a: "Photoreal diversity, long-tail scenes and behaviours learned from web video, without asset authoring. Verify action consistency (does the generated video follow the commanded actions?), kinematic feasibility of IDM-recovered actions, and object permanence over the horizon; validate the benefit on real metrics." },
    { q: "Which downstream artifacts must record the sim version, and why?", a: "Synthetic episodes in the catalog (so mixtures are reproducible), RL checkpoints (which env and randomization produced them), and evaluation results (a benchmark number is only meaningful with the frozen env hash). Without it, regressions cannot be attributed to policy vs environment changes." },
    { q: "When would you pick mjlab over Isaac Lab 3.0, or the reverse?", a: "mjlab/MuJoCo Warp: lightweight humanoid/legged RL, MuJoCo-native assets (Menagerie), fast iteration, minimal dependencies. Isaac Lab: photoreal RTX sensors, Mimic data generation, USD digital twins, teleop and broader task library, Newton/PhysX backends. Many teams train in one and check sim2sim in the other before real deployment." }
  ]
};
