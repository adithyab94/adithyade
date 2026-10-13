/* Stage 12 — Deployment, edge ops, fleet & telemetry. Schema: MAINTENANCE.md */
window.PAI = window.PAI || {}; PAI.stages = PAI.stages || {};
PAI.stages["stage-12"] = {
  id: "stage-12", num: "12", title: "Deployment, edge ops, fleet & telemetry", short: "Deployment & fleet",
  version: "1.0.0", last_verified: "2026-10-07",
  upstream: [
    { id: "stage-11", what: "engines, runtime container, manifest, latency profile" },
    { id: "stage-10", what: "release gate decision and eval report" },
    { id: "stage-09", what: "controller configs, safety states, executed-action logs" },
    { id: "stage-14", what: "approved configuration envelope for certified deployments" }
  ],
  downstream: [
    { id: "stage-13", what: "logs, interventions, failure events, shadow-mode comparisons" },
    { id: "stage-03", what: "uploaded episodes and telemetry into the data platform" },
    { id: "stage-08", what: "on-robot rollouts for real-world RL" },
    { id: "stage-14", what: "incident records and post-market monitoring evidence" }
  ],
  handoff_short: "Signed, staged releases (OS image + containers + engines + configs) with rollback; fleet telemetry; incident tickets; intervention-tagged logs",
  purpose: "Get a validated policy onto many robots safely and keep them working: reproducible artifacts, staged rollout with automatic rollback, health monitoring, observability, remote intervention and incident triage. This stage turns a model into a product and produces the data that drives the flywheel.",
  interface: {
    inputs: [
      { name: "Release candidate", format: "OCI images (runtime, policy server), engines, `manifest.json`, configs", rate: "Per release (weekly–monthly)", from: "[[s:11]]" },
      { name: "Gate decision", format: "Eval report + pass/fail", rate: "Per release", from: "[[s:10]]" },
      { name: "Robot telemetry", format: "Metrics (Prometheus/OTel), logs, MCAP ring buffers, events", rate: "Metrics 1–10 Hz; events async; bulk logs at dock", from: "Robots" }
    ],
    outputs: [
      { name: "Fleet state", format: "Which robot runs which OS/container/engine/config version", rate: "Continuous", to: "Ops, [[s:13]], [[s:14]]" },
      { name: "Episodes & interventions", format: "MCAP + sidecars with `policy_version`, `intervention` spans", rate: "Event-triggered + scheduled upload", to: "[[s:03]], [[s:13]]" },
      { name: "Incidents", format: "Ticket with time window, robot, versions, log bundle, video, root-cause code", rate: "Per incident", to: "[[s:13]], [[s:14]]" },
      { name: "Rollout metrics", format: "Per-cohort KPIs (success, IPH, cycle time, faults) vs control cohort", rate: "Daily", to: "Release decisions" }
    ],
    handoff: "Every log line, metric and episode carries the full version tuple (`os_image`, `container_digest`, `engine_manifest`, `config_rev`, `calib_v`). Without it, the flywheel cannot attribute failures to a policy version, and incident triage cannot reproduce a behaviour. Rollback is a first-class operation: the previous artifact set stays on the robot until the new one is confirmed healthy."
  },
  mental_model: "Treat the robot like a safety-relevant edge server that moves: immutable, versioned artifacts; staged rollout with health gates; automatic rollback; and telemetry designed around the questions you will ask during an incident. The policy is only one artifact among OS image, drivers, calibration and controller configs, and any of them can cause a regression.",
  mental_detail: "Two update channels coexist. The **OS / firmware** channel (JetPack, kernel, drivers, safety controller firmware) uses A/B partitions with atomic switch and rollback (Mender, RAUC, SWUpdate, OSTree, NVIDIA's Jetson OTA). The **application** channel (containers with the policy runtime, engines, configs) updates more often via a container registry and a device agent (Greengrass, balena, Mender application updates, Kubernetes-at-edge, or custom). Engines must match the OS channel's TensorRT version, so the two are coupled through the manifest.\n\nRollout follows the same pattern as cloud services but with physical risk: **shadow mode** (new policy runs on the robot or on uploaded logs without acting; compare predicted actions and predicted success), **canary** (one cell / robot, human supervision), **staged cohorts** (5 % → 25 % → 100 %) with automatic halt on KPI or safety regressions, and **rollback** to the previous artifact set. Runtime monitors (progress stalls, OOD scores, action-chunk entropy as in FIPER) trigger safe stops and remote assistance before failures become incidents.",
  methods: [
    { id: "packaging", name: "Packaging & reproducibility", tags: ["edge", "cloud"],
      summary: "OCI containers built in CI from pinned base images (JetPack L4T), NVIDIA Container Toolkit for GPU access, engines built in a digest-pinned build container, everything signed (Sigstore/cosign or similar) and stored in a registry with the manifest. One artifact set = OS image version + container digests + engine manifest + config revision.",
      pros: "Bit-for-bit reproducible deployments; audit trail for certification.", cons: "Large images over constrained links; delta updates needed." },
    { id: "ota", name: "OTA updates (OS and application)", tags: ["edge", "robot"],
      summary: "A/B system updates with atomic switch and health-check rollback (Mender 5.x, RAUC 1.15 with HTTP streaming/adaptive updates, SWUpdate, OSTree; NVIDIA Jetson OTA for JetPack ≥ 4.6), plus container updates via a device agent (AWS IoT Greengrass v2, balena, Mender app updates). Schedule updates at dock / off-shift; never mid-task.",
      pros: "Robots recover from bad updates automatically.", cons: "Bandwidth and storage for two slots; coupling between OS and engine versions." ,
      refs: [{ t: "OTA providers overview", u: "https://developer.ridgerun.com/wiki/index.php/RidgeRun_Platform_Security_Manual/Getting_Started/Over-the-Air/Main-Providers" }] },
    { id: "staged-rollout", name: "Shadow mode, canary, staged cohorts, rollback", tags: ["robot", "cloud"],
      summary: "Shadow: run the candidate alongside production (on-robot or offline replay) and compare actions, predicted success and monitor scores. Canary: one supervised cell. Cohorts: 5 → 25 → 100 % with pre-defined halt criteria (success drop, IPH rise, new failure code, any safety event). Rollback keeps the previous artifact set resident.",
      pros: "Limits blast radius; produces A/B evidence at fleet scale.", cons: "Shadow mode cannot see closed-loop effects; cohorts must be comparable (site, task mix)." },
    { id: "observability", name: "Observability & health monitoring", tags: ["edge", "cloud"],
      summary: "Metrics: inference latency p50/p99, deadline misses, GPU/CPU/memory, thermals, power, dropped frames, clock offset, controller saturation, safety-filter interventions, task KPIs. Logs + traces (OpenTelemetry). MCAP ring buffer on the robot, uploaded on events. Node health watchdogs with restart policies (systemd / supervisor / ROS lifecycle nodes). Platforms: Foxglove, Formant, InOrbit, Viam, or Prometheus/Grafana + MLflow/W&B for model-centric views.",
      pros: "Turns incidents into answerable questions.", cons: "Telemetry volume and cost; privacy of camera data." },
    { id: "runtime-monitors", name: "Runtime monitors & failure prediction", tags: ["edge", "fm"], frontier: true, frontier_ref: "runtime-monitors",
      summary: "Predict failure before it happens and trigger safe responses: FIPER (no failure data needed: OOD score via random network distillation in policy embedding space + action-chunk entropy, calibrated with conformal prediction on successful rollouts), uncertainty-aware detectors, value/progress stalls from the RL value model ([[s:08]]), VLM verifiers that check foresight from a world model (FOREWARN). A 2026 survey ('No Free Checker') maps verifier types and their failure modes.",
      pros: "Converts silent failures into requests for help; feeds the flywheel with labelled near-failures.", cons: "False alarms cost throughput; thresholds drift with policy updates." ,
      refs: [{ t: "FIPER", u: "https://arxiv.org/abs/2510.09459v1" }, { t: "No Free Checker survey", u: "https://arxiv.org/pdf/2609.09250" }] },
    { id: "remote-assist", name: "Remote intervention & teleassist", tags: ["robot", "il"],
      summary: "When a monitor fires or a robot is stuck: hold safe state, page a remote operator, show synchronized video + state, allow high-level guidance (re-prompt, choose subtask, language coaching as π0.7 demonstrates) or low-level teleop. Every intervention is recorded with reason code and becomes training data ([[s:13]]).",
      pros: "Keeps uptime high while autonomy matures; produces the most valuable data.", cons: "Operator staffing; latency over WAN; security of remote control channels." },
    { id: "incident", name: "Incident triage & post-market monitoring", tags: ["cloud"],
      summary: "Incident = time window + version tuple + log bundle + video + root-cause code (policy, perception, controller, hardware, environment, operator). Reproduce by replaying the MCAP through the same container. Severity classes link to the safety case; serious incidents may be reportable under the AI Act for high-risk systems (from Aug 2028 for machinery under the Digital Omnibus) and must be considered under the Machinery Regulation ([[s:14]]).",
      pros: "Closes the loop to engineering and to regulators.", cons: "Requires disciplined versioning and log retention." },
    { id: "fleet-orchestration", name: "Fleet & mission orchestration", tags: ["cloud", "robot"],
      summary: "Task assignment, traffic management and interoperability across vendors: Open-RMF (Apache-2.0, ROS 2 Humble–Kilted/Rolling), InOrbit, Formant missions, vendor fleet managers; integrates with WMS/MES in factories and warehouses.",
      pros: "Many robots share space and tasks safely.", cons: "Integration effort per site and per vendor." }
  ],
  decision: [
    { "if": "Jetson-based fleet", use: "A/B OS updates (RAUC/Mender/Jetson OTA) + containerized runtime; engines rebuilt per JetPack pin", why: "Atomic rollback; engines locked to TensorRT version." },
    { "if": "< 10 robots in one lab", use: "Docker Compose + Ansible/manual updates + Foxglove/Rerun; keep version tuple in logs", why: "Avoids platform overhead while keeping reproducibility." },
    { "if": "Multi-site commercial fleet", use: "Managed fleet platform (Formant / InOrbit / Viam) or in-house equivalent + staged cohorts + 24/7 remote assist", why: "Uptime and incident response matter more than tooling cost." },
    { "if": "New policy version", use: "Shadow → canary cell → 5/25/100 % cohorts with automatic halt criteria", why: "Limits physical risk; produces comparable KPIs." },
    { "if": "Policy failures are silent (looks busy, achieves nothing)", use: "Runtime monitors: progress/value stall + OOD + action entropy, calibrated on successes", why: "Catches failure modes before timeouts." },
    { "if": "Certified (safety-relevant) deployment", use: "Freeze the configuration envelope; changes go through change management and re-validation", why: "Safety case validity depends on the deployed configuration ([[s:14]])." }
  ],
  tools: [
    { id: "nvidia-ctk", name: "NVIDIA Container Toolkit", what: "GPU access for containers on Jetson and x86", maker: "NVIDIA", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Containerized GPU runtimes on robots", limitations: "Version coupling with JetPack / drivers", release: "2026-09-19", version: "v1.20.1 (year inferred)", link: "https://github.com/NVIDIA/nvidia-container-toolkit/releases", runs: ["edge"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "mender", name: "Mender", what: "OTA updates for embedded Linux (A/B system + application updates)", maker: "Northern.tech", open: "mixed", license: "Apache-2.0 client; commercial server tiers", maturity: "production", best_for: "Robust A/B OS updates with rollback for device fleets", limitations: "Enterprise features paid", release: "2026-05-12", version: "5.1.0 (year inferred)", link: "https://github.com/mendersoftware/mender/releases", runs: ["edge", "cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "rauc", name: "RAUC", what: "Robust A/B update client with signed bundles, HTTP streaming, adaptive (delta-like) updates", maker: "Pengutronix + community", open: "open", license: "LGPL-2.1", maturity: "production", best_for: "Yocto-based robot images; bandwidth-efficient updates", limitations: "Client only; you build the server / orchestration", release: "2026-03-27", version: "v1.15.2 (fixes CVE-2026-34155)", link: "https://github.com/rauc/rauc/releases", runs: ["edge"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "greengrass", name: "AWS IoT Greengrass v2", what: "Edge runtime for deploying components (containers, models) to device groups", maker: "Amazon Web Services", open: "mixed", license: "Apache-2.0 nucleus; AWS service", maturity: "production", best_for: "AWS-centric fleets; staged deployments to thing groups", limitations: "AWS lock-in; nucleus is Java-based", release: "2026-08-07", version: "nucleus 2.18.3 (year inferred)", link: "https://github.com/aws-greengrass/aws-greengrass-nucleus/releases", runs: ["edge", "cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "jetson-ota", name: "NVIDIA Jetson OTA", what: "Image-based and package-based OTA for JetPack ≥ 4.6", maker: "NVIDIA", open: "mixed", license: "NVIDIA tools", maturity: "production", best_for: "JetPack upgrades on Jetson fleets", limitations: "Jetson-only; orchestration not included", release: null, version: "per JetPack", release_note: "per JetPack", link: "https://developer.ridgerun.com/wiki/index.php/RidgeRun_Platform_Security_Manual/Getting_Started/Over-the-Air/Main-Providers", runs: ["edge"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "formant", name: "Formant", what: "Cloud robot fleet operations: telemetry, teleop, missions, incidents, analytics", maker: "Formant", open: "closed", license: "Commercial", maturity: "production", best_for: "Heterogeneous fleets needing a 'single pane of glass'", limitations: "Commercial; data residency to evaluate", release: null, version: "SaaS", release_note: "continuous (SaaS)", link: "https://formant.io/docs", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "inorbit", name: "InOrbit", what: "Robot orchestration and RobOps: observability, incident response, root cause, multi-vendor", maker: "InOrbit", open: "closed", license: "Commercial (Developer Edition available)", maturity: "production", best_for: "Multi-vendor AMR / robot orchestration at sites", limitations: "Manipulation-specific tooling limited", release: null, version: "SaaS", release_note: "continuous (SaaS)", link: "https://inorbit.ai/orchestration", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "viam", name: "Viam", what: "Open-source robot software platform with fleet management, remote control, data and ML deployment", maker: "Viam", open: "mixed", license: "Open-source SDK/RDK; commercial cloud", maturity: "production", best_for: "Device fleets wanting integrated config, data and deployment", limitations: "Own abstractions alongside ROS", release: null, version: "SaaS + RDK", release_note: "continuous", link: "https://www.viam.com/product", runs: ["cloud", "edge"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "openrmf", name: "Open-RMF", what: "Multi-fleet robot management and traffic coordination on ROS 2", maker: "Open Source Robotics Alliance", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Coordinating heterogeneous fleets, doors, lifts in facilities", limitations: "Mobile-robot centric; integration effort", release: null, version: "Humble / Jazzy / Kilted / Rolling", release_note: "via ROS distros", link: "https://github.com/open-rmf/rmf", runs: ["cloud", "onprem"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "mlflow", name: "MLflow", what: "Model registry, experiment tracking, OpenTelemetry-based tracing", maker: "Databricks / LF AI", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Model registry linking checkpoints, engines and eval reports", limitations: "Not robot-aware; you define the manifest schema", release: "2026-10-07", version: "3.17.0", link: "https://pypi.org/project/mlflow/", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "fiper", name: "FIPER", what: "Runtime failure prediction for generative IL policies (OOD + action-chunk entropy, conformal)", maker: "Academic (TUM / MCML)", open: "open", license: "See paper", maturity: "research", best_for: "Failure alarms without failure data", limitations: "Calibrated per policy; false alarms under benign OOD", release: "2025-10", version: "NeurIPS 2025", link: "https://arxiv.org/abs/2510.09459v1", runs: ["edge"], tech: ["il"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null }
  ],
  where: {
    cloud: { l: 3, n: "registry, fleet backend, dashboards" },
    onprem: { l: 2, n: "site servers, private registries" },
    sim: { l: 1, n: "pre-rollout SIL" },
    edge: { l: 3, n: "device agents, runtime, monitors" },
    robot: { l: 3, n: "the deployed system" }
  },
  tech: {
    il: { l: 1, n: "interventions feed IL" },
    rl: { l: 1, n: "on-robot rollouts for RL" },
    classical: { l: 2, n: "watchdogs, safe states" },
    sim2real: { l: 0, n: "" },
    real2sim: { l: 1, n: "incident replay in sim" },
    real2sim2real: { l: 0, n: "" },
    fm: { l: 1, n: "VLM verifiers / monitors" },
    wam: { l: 1, n: "world-model foresight for monitors" },
    icl: { l: 1, n: "coaching via remote assist" }
  },
  stacks: {
    open: { title: "Open stack", items: [
      "GitLab/GitHub CI building JetPack-pinned containers and TensorRT engines on Jetson runners; artifacts + manifest in a registry",
      "RAUC or Mender for A/B OS updates; Docker/containerd for the runtime",
      "Prometheus + Grafana + OpenTelemetry; MCAP ring buffer with event upload; Foxglove/Rerun for inspection",
      "MLflow registry for checkpoint ↔ engine ↔ eval links; FIPER-style monitor + value-stall detector"
    ], note: "This matches the GitLab runner + S3 + remote flashing workflow many Jetson teams already use." },
    industry: { title: "Industry (public)", items: [
      "Fleet platforms (Formant, InOrbit, Viam) or in-house equivalents with teleassist",
      "Remote operations centres supervising autonomy (common in humanoid pilots and AMR fleets)",
      "Agility Digit: 65k+ operating hours across 9 customer facilities under RaaS contracts",
      "Figure 02 at BMW: 10-month deployment, 1,250+ operating hours, supporting 30,000+ X3 vehicles"
    ], note: "Public figures are company-reported." }
  },
  example: {
    summary: "MB-1's release `2026.10.2`: CI builds `mb1-runtime@sha256:…` (ROS 2 Lyrical, action server, monitors) and `mb1-policy@sha256:…` (engines + manifest) on Thor runners; OS image stays at JetPack 7.1 (RAUC slot B holds the previous image). Rollout: 3 days shadow on 6 robots (compare predicted chunks vs production, monitor scores) → canary on 1 supervised cell for 2 shifts → 25 % of cells → 100 %, halting automatically if first-pass success drops > 2 pp, IPH rises > 0.1, or any hard safety stop occurs.",
    artifacts: [
      { artifact: "Release manifest `2026.10.2`", format: "JSON (signed)", shape: "{os: jp7.1-rc3, runtime: sha256:…, policy: sha256:…, engines: manifest@41, config_rev: 1187, calib: per-robot}", consumer: "device agent, [[s:13]], [[s:14]]" },
      { artifact: "Telemetry", format: "Prometheus metrics + OTel traces", shape: "`policy_infer_ms{p99}`, `rtc_deadline_miss_total`, `safety_filter_clamp_total`, `gpu_mem_bytes`, `thermal_c`, `task_success_total{subtask}`", consumer: "dashboards, alerts" },
      { artifact: "Monitor events", format: "Event stream", shape: "{t, robot, type ∈ {ood_high, entropy_high, progress_stall}, score, action: pause|ask_help}", consumer: "remote assist, [[s:13]]" },
      { artifact: "Incident bundle", format: "tar: MCAP (−60 s/+10 s), video, version tuple, operator notes", shape: "≈ 0.5–2 GB", consumer: "[[s:13]] triage, [[s:14]] records" }
    ],
    humanoid: "H-1 rollouts treat the whole-body controller as the highest-risk artifact: it updates far less often than the VLA, only after sim stress tests and supervised real trials with a safety gantry or harness, and the robot keeps the previous controller resident for immediate rollback. Telemetry adds fall detections, joint temperatures and battery health; remote assist must include a safe sit/kneel command."
  },
  pitfalls: [
    { t: "Unversioned configs", d: "Gains, stiffness schedules and prompts changed by hand on one robot make fleet comparisons meaningless; manage configs like code." },
    { t: "Updating mid-shift", d: "Partial updates during operation leave robots in mixed states; update at dock with health checks before resuming." },
    { t: "Telemetry without the version tuple", d: "You will not be able to tell whether a failure spike comes from the new engine, a new calibration or a site change." },
    { t: "Shadow mode as proof", d: "Open-loop agreement between old and new policy says little about closed-loop success; it is a filter, not a gate." },
    { t: "Monitors tuned once", d: "OOD and entropy thresholds shift with each policy version; recalibrate on the new version's successful rollouts." },
    { t: "Ignoring memory limits on shared SoCs", d: "A logging or perception spike can OOM the policy process; set cgroup limits and test worst-case concurrency (GPU memory overflow is a classic Jetson failure)." }
  ],
  numbers: [
    { m: "Agility Digit deployment", v: "65,000+ operating hours across 9 customer facilities; >100,000 totes at GXO", s: "[Technology.org](https://www.technology.org/2026/07/18/humanoid-robots-in-2026-what-is-actually-deployed/) (company-reported)" },
    { m: "Figure 02 at BMW", v: "10 months, 1,250+ operating hours, 90,000+ parts, 30,000+ X3", s: "[Technology.org](https://www.technology.org/2026/07/18/humanoid-robots-in-2026-what-is-actually-deployed/) (company-reported)" },
    { m: "Upload volume (example)", v: "≈ 11 GB per robot-hour raw; event-triggered upload typically keeps a small fraction", s: "See [[s:03]]" },
    { m: "Typical cohort plan", v: "shadow → 1 canary cell → 5 % → 25 % → 100 %", s: "Engineering practice" }
  ],
  papers: [
    { title: "Failure Prediction at Runtime for Generative Robot Policies (FIPER)", year: "2025", venue: "NeurIPS", url: "https://arxiv.org/abs/2510.09459v1", why: "Calibrated runtime failure alarms without failure data." },
    { title: "No Free Checker: A Survey of Verifiers for Robot Policies", year: "2026", venue: "arXiv 2609.09250", url: "https://arxiv.org/pdf/2609.09250", why: "Map of runtime verifiers and their trade-offs." },
    { title: "From Foresight to Forethought: VLM-in-the-loop Policy Steering (FOREWARN)", year: "2025", venue: "ICLR 2025", url: "https://iclr.cc/virtual/2025/37528", why: "World-model foresight + VLM verification for steering at runtime." },
    { title: "Exploring open-source dual A/B update solutions for embedded Linux", year: "2025", venue: "FOSDEM", url: "https://fosdem.org/2025/events/attachments/fosdem-2025-6299-exploring-open-source-dual-a-b-update-solutions-for-embedded-linux/slides/236750/leon-anav_nHAgFc8.pdf", why: "Practical comparison of Mender, RAUC, SWUpdate." },
    { title: "Humanoid robots in 2026: what is actually deployed", year: "2026", venue: "Technology.org", url: "https://www.technology.org/2026/07/18/humanoid-robots-in-2026-what-is-actually-deployed/", why: "Public deployment facts to calibrate expectations." },
    { title: "Open-RMF", year: "2026", venue: "OSRA", url: "https://github.com/open-rmf/rmf", why: "Open multi-fleet coordination." }
  ],
  open_problems: [
    "Closed-loop safe A/B testing of policies on fleets without exposing customers to regressions.",
    "Monitors that remain calibrated across policy updates and site changes.",
    "Standard telemetry schemas for learned policies (latency, uncertainty, interventions) across vendors.",
    "Change management for continuously learning policies under certification regimes."
  ],
  self_check: [
    { q: "A JetPack security update is mandatory. List what must happen before it reaches robots.", a: "Rebuild all TensorRT engines in a container matching the new TensorRT/CUDA, rerun parity and closed-loop evals ([[s:10]]/[[s:11]]), re-validate controller timing on the new kernel (PREEMPT_RT latency), update manifests, then stage via A/B OS update with rollback, shadow/canary as for a policy change. The OS and application channels are coupled through the engine manifest." },
    { q: "Interventions per hour doubled after rollout, but eval success was unchanged. What do you check in this stage's data?", a: "Cohort comparability (sites, task mix, shifts), version tuples of affected robots (calibration or config changes coinciding with the rollout), monitor threshold changes (more alarms → more interventions without more failures), latency/deadline-miss metrics, safety-filter clamp rates, and intervention reason codes. Then hand mined episodes to [[s:13]]." },
    { q: "Why keep the previous artifact set resident on the robot?", a: "To roll back without network dependence or a long download when health checks fail or a regression appears; A/B slots for the OS and the previous container/engine set for the application make rollback atomic and fast." },
    { q: "What is the role of the value function from [[s:08]] at runtime?", a: "A progress estimate: if predicted value stalls or drops over a window, the monitor pauses, retries or asks for help, and logs the segment as a likely failure for mining. It complements OOD and action-entropy signals." },
    { q: "Which records from this stage support regulatory obligations?", a: "Version tuples and change logs (configuration management), incident records with root cause, post-market monitoring metrics (failure and near-miss rates), logs retained per policy, and evidence of safety-function performance. These feed the technical documentation under the Machinery Regulation and, for high-risk AI systems, the AI Act's logging and post-market monitoring duties ([[s:14]])." }
  ]
};
