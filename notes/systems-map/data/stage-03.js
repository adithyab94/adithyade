/* Stage 03 — Data infrastructure (cloud). Schema: MAINTENANCE.md */
window.PAI = window.PAI || {}; PAI.stages = PAI.stages || {};
PAI.stages["stage-03"] = {
  id: "stage-03", num: "03", title: "Data infrastructure (cloud)", short: "Data infrastructure",
  version: "1.0.0", last_verified: "2026-10-07",
  upstream: [
    { id: "stage-02", what: "raw MCAP episodes, human video, sidecar metadata" },
    { id: "stage-12", what: "fleet logs, telemetry and intervention segments uploaded from deployed robots" },
    { id: "stage-05", what: "synthetic episodes in the same schema (tagged `source=sim`)" }
  ],
  downstream: [
    { id: "stage-04", what: "queryable episodes for labelling, QA and curation" },
    { id: "stage-06", what: "real scenes and trajectories for real2sim reconstruction" },
    { id: "stage-07", what: "versioned training snapshots (LeRobotDataset v3 / RLDS) with frozen normalization stats" },
    { id: "stage-10", what: "held-out evaluation splits and replay logs" },
    { id: "stage-13", what: "search and mining over fleet data" }
  ],
  handoff_short: "Immutable raw store + versioned training snapshot (`dataset@version`, manifest, stats) + episode catalog with embeddings",
  purpose: "Ingest, validate, store, version, index and serve robot episodes so that every training run, evaluation and flywheel query can find exactly the data it needs and reproduce it later. It is the system of record that connects raw sensor logs to the tensors a model sees.",
  interface: {
    inputs: [
      { name: "Raw episodes", format: "MCAP (+ sidecar JSON), MP4 + pose streams for human video", rate: "≈ 10–15 GB per robot-hour (multi-camera rig); fleet: TB/day", from: "[[s:02]], [[s:12]]" },
      { name: "Synthetic episodes", format: "Same schema, `source=sim`, generator version", rate: "Bursty: 10k–1M episodes per generation job", from: "[[s:05]]" },
      { name: "Labels", format: "Episode/frame annotations (Parquet / JSON), quality scores", rate: "Continuous", from: "[[s:04]]" }
    ],
    outputs: [
      { name: "Raw store", format: "Object storage (S3/GCS/on-prem) with MCAP, immutable, content-addressed", rate: "Append-only", to: "Audit, re-conversion, [[s:06]]" },
      { name: "Episode catalog", format: "Table (Iceberg / Delta / Parquet) + vector index (Lance / LanceDB) over captions and embeddings", rate: "Updated on ingest and labelling", to: "[[s:04]], [[s:13]]" },
      { name: "Training snapshot", format: "LeRobotDataset v3 (Parquet + MP4, many episodes per file) or RLDS (TFRecord); `meta/info.json`, `stats.json`, `episodes`, `tasks`", rate: "Versioned (e.g. weekly)", to: "[[s:07]], [[s:08]]" },
      { name: "Data card + manifest", format: "Episode-id list, source mix, licences, consent flags, transform code hash", rate: "Per snapshot", to: "[[s:07]], [[s:14]]" }
    ],
    handoff: "Training consumes a **named, immutable snapshot**: `mb1-connectors@2026.09.3` = manifest of episode ids + conversion code hash + feature schema + normalization statistics. Re-running training with the same snapshot must reproduce the same batches. Normalization stats travel with the snapshot and later with the model artifact ([[s:11]], [[s:12]]); recomputing them on a different snapshot is a silent breaking change."
  },
  mental_model: "Keep three tiers and never collapse them: an immutable raw tier (MCAP, the legal and forensic record), a derived training tier (columnar frames + chunked video at training resolution), and a catalog tier (episode-level metadata, labels and embeddings for search). Train only from the derived tier; always be able to regenerate it from raw.",
  mental_detail: "Robot data is time-series plus video plus episode semantics, and no single format handles all three well. MCAP is excellent for multi-topic logs with heterogeneous rates but awkward for random-access training. Training wants fixed-rate, aligned frames with video decoded on demand: LeRobotDataset v3 stores many episodes per Parquet/MP4 file with relational metadata so the filesystem is not drowned in small files, and supports streaming from the Hub. The catalog is a lakehouse problem: episodes become rows, labels become columns, embeddings become vector indexes, and the flywheel ([[s:13]]) becomes SQL plus nearest-neighbour search.\n\nScale arithmetic makes the design non-optional: at ≈ 11 GB per robot-hour, a 50-robot fleet running two shifts produces ≈ 9 TB per day; Generalist's stated 10,000 h per week would be on the order of 100 TB per week at similar bitrates (estimate, not a disclosed figure).",
  methods: [
    { id: "raw-logs", name: "Raw logging format: MCAP", tags: ["robot", "cloud"],
      summary: "MCAP is the default rosbag2 storage format; it stores interleaved multi-topic messages with schemas, chunk compression (zstd/lz4) and an index for time-range reads. One file per episode (or per fixed time window for continuous fleet logging) with the sidecar metadata.",
      pros: "Self-describing, language-agnostic (Python/C++/Go/Rust readers), streamable, good tooling (Foxglove, Rerun, mcap CLI).",
      cons: "Not a training format: message-level access, mixed rates, no frame alignment.",
      refs: [{ t: "MCAP", u: "https://github.com/foxglove/mcap/releases" }] },
    { id: "training-formats", name: "Training formats: LeRobotDataset v3, RLDS, Zarr, HDF5", tags: ["cloud", "il"],
      summary: "**LeRobotDataset v3** (lerobot ≥ 0.4): Parquet for low-dim streams and MP4/AV1 for video, many episodes per file, relational metadata, `StreamingLeRobotDataset` for Hub streaming; converter from v2.1. **RLDS** (TFRecord episodes via TFDS): the Open X-Embodiment and DROID standard, used by Octo/openpi data loaders; library itself has been static since 2023. **Zarr** (Diffusion Policy lineage) and **HDF5** (robomimic, ALOHA) remain common for single-lab work.",
      pros: "v3 scales to millions of episodes with few files and streams; RLDS gives access to OXE.",
      cons: "Converting between them loses metadata unless you carry a schema mapping; video codec and keyframe interval choices affect random-access speed.",
      refs: [{ t: "LeRobotDataset v3 docs", u: "https://huggingface.co/docs/lerobot/lerobot-dataset-v3" }, { t: "RLDS", u: "https://pypi.org/project/rlds/" }] },
    { id: "lakehouse", name: "Lakehouse catalog & episode search", tags: ["cloud"],
      summary: "Object storage + an open table format (Apache Iceberg v3, Delta) for episode and label tables; **Lance** for multimodal columns (frames, embeddings) with vector and full-text indexes. Episode search combines SQL filters (robot, site, task, success, policy version) with semantic retrieval over VLM captions or SigLIP embeddings of key frames.",
      pros: "Turns curation and failure mining into queries; one catalog for training, eval and flywheel.",
      cons: "Operating a lakehouse is real data-engineering work; embeddings go stale when the embedding model changes.",
      refs: [{ t: "Lance format", u: "https://docs.lancedb.com/lance" }, { t: "Iceberg vs Delta 2026", u: "https://dev.to/mr_manushukla/apache-iceberg-vs-delta-lake-in-2026-choosing-the-open-table-format-for-your-lakehouse-16kp" }] },
    { id: "versioning", name: "Versioning & lineage", tags: ["cloud"],
      summary: "A dataset version is a manifest (episode ids + byte hashes), the conversion code hash, the feature schema and the normalization stats. Implement with Hub revisions (git-based), DVC or lakeFS-style branches over object storage, or Iceberg snapshots for the catalog. Every model artifact records the snapshot it was trained on ([[s:12]]).",
      pros: "Reproducible training; ability to answer 'which data produced this behaviour?' in an incident.",
      cons: "Copying data per version is unaffordable at scale; use manifests and content addressing, not copies." },
    { id: "ingest-qa", name: "Ingestion pipeline & automatic QA", tags: ["cloud", "edge"],
      summary: "Resumable, bandwidth-aware upload from robots (off-shift or on dock), schema validation of sidecars, sensor QA (dropped frames, non-monotonic timestamps, sync offsets beyond threshold, missing calibration), action QA (jumps, saturation, idle segments: openpi added an idle filter for DROID training), dedup, PII blurring, transcoding to training resolution, statistics update.",
      pros: "Bad episodes are cheap to reject at ingest and very expensive to discover after a training run.",
      cons: "Over-aggressive filters remove the hard cases you need; keep rejected episodes with a reason code." },
    { id: "viz", name: "Visualization & inspection", tags: ["cloud", "robot"],
      summary: "Foxglove (merged Studio + data platform since 2.0; open-source Studio discontinued), Rerun (open SDK and viewer; `LeRobotReader` for streaming datasets), LeRobot dataset visualizer. Inspect synchronized video, actions, F/T and labels on one timeline before trusting any dataset.",
      pros: "Fastest way to catch sync errors, wrong frames and bad labels.",
      cons: "Visual review does not scale; use it to validate automatic QA rules." },
    { id: "governance", name: "Governance, licensing & privacy", tags: ["cloud"],
      summary: "Track per-episode licence (OXE subsets differ), consent and purpose, personal data present (faces, voices), retention deadline and deletion propagation into derived snapshots. Required for GDPR and increasingly expected by customers; the AI Act's documentation duties for high-risk systems include data governance ([[s:14]]).",
      pros: "Avoids retraining from scratch when a data source must be withdrawn.",
      cons: "Deletion propagation across snapshots and trained weights has no clean technical solution (you can delete data, not easily un-train)." },
    { id: "loading", name: "High-throughput data loading", tags: ["cloud"],
      summary: "GPU training is often decode-bound: use hardware video decode (NVDEC), decode at training resolution, cache decoded frames for hot subsets, shard by episode, and balance data mixtures with explicit sampling weights. LeRobot v0.6 reports a 2× faster dataloader via parallel decode and uint8 transport.",
      pros: "Keeps H100/B200 utilization high; mixture weights become explicit, versioned config.",
      cons: "Caches multiply storage; random frame access in long GOP video is slow." }
  ],
  decision: [
    { "if": "ROS 2 robots", use: "rosbag2 with MCAP storage for raw; convert to LeRobotDataset v3 for training", why: "Keeps ROS tooling for debugging while giving trainers aligned frames." },
    { "if": "You fine-tune openpi / GR00T / SmolVLA / X-VLA", use: "LeRobotDataset v3 (or the model's documented RLDS path)", why: "These stacks ship loaders and normalization for these formats." },
    { "if": "You pretrain on Open X-Embodiment / DROID", use: "RLDS readers, then unify into your own schema with explicit action-convention mapping", why: "OXE subsets differ in action frames, rates and gripper conventions." },
    { "if": "More than ~10k episodes or multiple sites", use: "Catalog table (Iceberg / Delta) + Lance vector index for search", why: "Curation and failure mining become queries instead of scripts over folders." },
    { "if": "Single lab, < 1k episodes", use: "HF Hub dataset repo or a git-versioned folder + DVC", why: "A lakehouse is overhead you do not need yet." },
    { "if": "Any human video", use: "Blur/consent at ingest, licence and retention columns from day one", why: "Retrofitting privacy on petabytes is close to impossible." }
  ],
  tools: [
    { id: "lerobot-v3", name: "LeRobotDataset v3", what: "Robot learning dataset format: Parquet + MP4, many episodes per file, relational metadata, Hub streaming", maker: "Hugging Face", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Training snapshots for open VLAs; sharing on the Hub", limitations: "Opinionated feature schema; very high-rate signals (1 kHz F/T) must be resampled or stored separately", release: "2026-08-03", version: "lerobot 0.6.1", link: "https://huggingface.co/docs/lerobot/lerobot-dataset-v3", runs: ["cloud"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "lerobot-v21", name: "LeRobotDataset v2.1", what: "Previous LeRobot format (one file per episode)", maker: "Hugging Face", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Legacy datasets; convert with `convert_dataset_v21_to_v30`", limitations: "Millions of small files at scale", release: null, version: "v2.1", release_note: "superseded", link: "https://huggingface.co/docs/lerobot/lerobot-dataset-v3", runs: ["cloud"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "superseded", superseded_by: "LeRobotDataset v3" },
    { id: "mcap", name: "MCAP", what: "Multi-topic log container; default rosbag2 storage", maker: "Foxglove (open spec)", open: "open", license: "MIT", maturity: "production", best_for: "Raw multi-sensor logs, forensic record, replay", limitations: "Not frame-aligned; poor for random-access training", release: "2026-09-24", version: "mcap (Python) 1.5.0", link: "https://github.com/foxglove/mcap/releases", runs: ["robot", "cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "rlds", name: "RLDS / TFDS", what: "Episodic dataset spec on TFRecord; Open X-Embodiment standard", maker: "Google Research", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Reading OXE / DROID; JAX/TF pipelines", limitations: "Library unchanged since 2023; TensorFlow dependency", release: "2023-04-14", version: "rlds 0.1.8", link: "https://pypi.org/project/rlds/", runs: ["cloud"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "zarr", name: "Zarr", what: "Chunked, compressed N-D array store (v3 spec)", maker: "Zarr developers", open: "open", license: "MIT", maturity: "production", best_for: "Diffusion-policy style replay buffers; cloud-native array data", limitations: "No episode semantics; you build the schema", release: "2026-09-15", version: "zarr-python 3.4.0 (year inferred)", link: "https://github.com/zarr-developers/zarr-python/releases", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "arrow-parquet", name: "Apache Arrow / Parquet", what: "Columnar memory format and file format", maker: "Apache Software Foundation", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Low-dim streams, labels, catalogs", limitations: "Not for video", release: "2026-08-10", version: "pyarrow 25.0.1", link: "https://pypi.org/project/pyarrow/", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "lance", name: "Lance / LanceDB", what: "Multimodal lakehouse format with vector and full-text indexes", maker: "LanceDB (Volcano Engine contributes for embodied AI)", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Episode search by embedding; storing frames + metadata together", limitations: "Younger than Iceberg/Delta; fewer engines read it", release: "2026-10-07", version: "lancedb 0.40.0 / lance v13.0.0", link: "https://github.com/lance-format/lance/releases", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "iceberg", name: "Apache Iceberg", what: "Open table format (v3 spec ratified 2025) for the episode/label catalog", maker: "Apache Software Foundation", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Large, multi-writer episode catalogs with snapshots and time travel", limitations: "Needs a catalog service and an engine (Spark, Trino, DuckDB)", release: "2026-09-01", version: "pyiceberg 0.12.0", link: "https://pypi.org/project/pyiceberg/", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "dvc", name: "DVC", what: "Git-based data and pipeline versioning", maker: "Iterative / DVC community", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Small-team dataset versioning and reproducible pipelines", limitations: "Struggles with millions of files; not a catalog", release: "2026-03-31", version: "3.67.1", link: "https://pypi.org/project/dvc/", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "rerun", name: "Rerun", what: "Multimodal logging SDK + viewer (time series, images, 3D); LeRobotReader", maker: "Rerun", open: "open", license: "MIT / Apache-2.0", maturity: "production", best_for: "Inspecting episodes and live robot state; Python-first", limitations: "Frequent breaking API changes across 0.x releases", release: "2026-09-17", version: "0.38.1", link: "https://github.com/rerun-io/rerun/releases", runs: ["cloud", "robot"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "foxglove", name: "Foxglove", what: "Robotics visualization + data platform (MCAP-native)", maker: "Foxglove", open: "closed", license: "Commercial (Pro from $20/month; OSS Studio discontinued in 2.0)", maturity: "production", best_for: "ROS/MCAP inspection, team data management, dashboards", limitations: "Closed source since 2.0; costs scale with data", release: null, version: "SaaS", release_note: "continuous (SaaS)", link: "https://www.foxglove.dev/blog/reduced-self-service-pricing", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "roboto", name: "Roboto AI", what: "Cloud platform to manage, search and process robotics logs", maker: "Roboto AI", open: "closed", license: "Commercial", maturity: "pilot", best_for: "Teams wanting a managed log lake with automated processing", limitations: "Vendor lock-in; young company ($4.8M seed)", release: null, version: "SaaS", release_note: "continuous (SaaS)", link: "https://www.therobotreport.com/?p=565434", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null }
  ],
  where: {
    cloud: { l: 3, n: "storage, catalog, conversion, search" },
    onprem: { l: 2, n: "large fleets often keep raw on-prem for cost/privacy" },
    sim: { l: 1, n: "synthetic episodes share the schema" },
    edge: { l: 1, n: "on-robot buffering and upload" },
    robot: { l: 0, n: "" }
  },
  tech: {
    il: { l: 3, n: "training snapshots for imitation" },
    rl: { l: 1, n: "replay buffers for offline RL" },
    classical: { l: 0, n: "" },
    sim2real: { l: 1, n: "sim/real source tags for co-training mixes" },
    real2sim: { l: 2, n: "raw scans and logs feed reconstruction" },
    real2sim2real: { l: 1, n: "" },
    fm: { l: 2, n: "pretraining mixtures at TB–PB scale" },
    wam: { l: 2, n: "video-heavy storage for world models" },
    icl: { l: 2, n: "retrieval index for in-context demos" }
  },
  stacks: {
    open: { title: "Open stack", items: [
      "rosbag2 (MCAP) → custom converter → LeRobotDataset v3 on HF Hub or S3/MinIO",
      "Parquet episode table + LanceDB index over SigLIP / VLM caption embeddings",
      "DVC or Hub revisions for snapshot versioning; `stats.json` frozen per snapshot",
      "Rerun / Foxglove free tier for inspection"
    ], note: "Fits a lab with up to tens of TB." },
    industry: { title: "Industry pattern", items: [
      "On-robot ring buffer + event-triggered upload (interventions, anomalies) + scheduled bulk upload at dock",
      "Raw tier in object storage; Iceberg/Delta catalog; Lance or vector DB for semantic search",
      "Ingestion QA and PII blurring as a streaming pipeline; dataset snapshots referenced by model registry",
      "Managed tools (Foxglove, Roboto) or in-house equivalents; Volcano Engine uses Lance for embodied-AI data"
    ], note: "Large players rarely publish their data platform; patterns follow autonomous-driving data platforms." }
  },
  annotation_note: "",
  example: {
    summary: "MB-1 uploads episodes over the workcell's wired network after each shift. Ingestion validates sidecars, checks sync (head-camera vs joint-state offset < 5 ms), blurs faces in head-camera frames, transcodes to training resolution and writes rows into the catalog. Weekly, a curated snapshot is cut for training.",
    artifacts: [
      { artifact: "Raw store", format: "`s3://mb1-raw/2026/09/14/mb1-07/ep_…000183.mcap` + `.meta.json`", shape: "immutable, ~300 MB/episode", consumer: "audit, re-conversion, [[s:06]]" },
      { artifact: "Catalog row", format: "Iceberg table `robot.episodes`", shape: "episode_id, robot, site, task, operator, spec_v, calib_v, policy_v, success, n_interventions, duration_s, qa_flags[], license, consent", consumer: "[[s:04]], [[s:13]], [[s:10]] splits" },
      { artifact: "Embedding index", format: "Lance table `robot.episode_embeddings`", shape: "SigLIP 2 frame embeddings at subtask boundaries + caption text, IVF-PQ index", consumer: "failure mining, retrieval for ICL" },
      { artifact: "Training snapshot `mb1-connectors@2026.09.3`", format: "LeRobotDataset v3", shape: "fps 50; features: `observation.images.{head,wrist_l,wrist_r}` (video 448×448 AV1), `observation.tactile.{l0,l1,r0,r1}` (video 128×128), `observation.state` float32[50], `observation.wrench` float32[12], `action` float32[24], `task_index`, `subtask_index`; 31,412 episodes; `meta/stats.json` (q01/q99 per dim)", consumer: "[[s:07]]" },
      { artifact: "Data card", format: "Markdown + JSON manifest", shape: "source mix: 61 % teleop, 14 % handheld (retargeted), 25 % sim (MimicGen); licences; excluded episodes with reasons", consumer: "[[s:07]], [[s:14]] documentation" }
    ],
    humanoid: "H-1's data tier carries more **motion data** than episodes: mocap clips (BVH/FBX → retargeted joint trajectories in NPZ), RL rollout logs from sim at very high volume (kept only as summaries and checkpoints), and egocentric video with hand poses. The catalog must link a deployed whole-body controller checkpoint to the motion library version it was trained to track."
  },
  pitfalls: [
    { t: "Training directly from raw logs", d: "Every training run re-implements alignment and resampling slightly differently; results become irreproducible." },
    { t: "Recomputing normalization stats per run", d: "Stats computed on a different snapshot shift the action distribution the model expects; freeze stats per snapshot and ship them with the model." },
    { t: "Millions of tiny files", d: "One file per episode per camera collapses filesystem and object-store performance; this is why LeRobotDataset v3 packs many episodes per file." },
    { t: "Mixing action conventions across sources", d: "OXE subsets differ in frame, gripper sign, delta vs absolute; unify explicitly with a per-source mapping and unit tests." },
    { t: "Dropping rejected data", d: "Keep rejected episodes with reason codes; filters change, and failures are training data for success detectors and value functions." },
    { t: "No deletion path", d: "When a consent is withdrawn you must find every snapshot containing that episode; without manifests this is a full re-scan." }
  ],
  numbers: [
    { m: "Raw volume, 9-stream rig", v: "≈ 11 GB per robot-hour", s: "25 Mbit/s × 3600 s ÷ 8 (see [[s:01]])" },
    { m: "AgiBot World Beta size", v: "~43.8 TB for 1,003,672 trajectories (≈ 44 MB per trajectory)", s: "[GitHub](https://github.com/OpenDriveLab/Agibot-World)" },
    { m: "Fleet example", v: "50 robots × 16 h/day × 11 GB/h ≈ 8.8 TB/day", s: "Arithmetic estimate" },
    { m: "Generalist corpus growth", v: "+10,000 h/week (stated); ≈ 100 TB/week at 11 GB/h (estimate)", s: "[GEN-0 blog](https://generalistai.com/blog/gen-0); volume is our estimate" },
    { m: "LeRobot dataloader", v: "≈ 2× faster via parallel decode and uint8 transport (v0.6.0)", s: "[LeRobot releases](https://github.com/huggingface/lerobot/releases)" },
    { m: "OXE scale", v: "1M+ trajectories, 22 embodiments", s: "[arXiv 2310.08864](https://arxiv.org/pdf/2310.08864)" }
  ],
  papers: [
    { title: "LeRobotDataset v3.0 documentation", year: "2025–2026", venue: "Hugging Face", url: "https://huggingface.co/docs/lerobot/lerobot-dataset-v3", why: "Current open reference design for a scalable robot training format." },
    { title: "Open X-Embodiment: Robotic Learning Datasets and RT-X Models", year: "2023", venue: "ICRA 2024", url: "https://arxiv.org/pdf/2310.08864", why: "RLDS as a pooling standard and the heterogeneity problems of pooled data." },
    { title: "DROID: A Large-Scale In-The-Wild Robot Manipulation Dataset", year: "2024", venue: "RSS", url: "https://arxiv.org/abs/2403.12945v2", why: "Metadata, calibration and QA practices for multi-site data." },
    { title: "Multimodal lakehouses: the architecture AI teams are migrating to", year: "2025", venue: "Gradient Flow", url: "https://gradientflow.com/multimodal-lakehouse-lance/", why: "Why columnar + vector formats replace folder-of-files data lakes for multimodal AI." },
    { title: "AgiBot World Colosseo", year: "2025", venue: "IEEE TRO 2026", url: "https://github.com/OpenDriveLab/Agibot-World", why: "Operating a 100-robot data factory: scale, QA and release format." },
    { title: "Foxglove 2.0: integrated UI, new pricing and open-source changes", year: "2024", venue: "ROS Discourse", url: "https://discourse.openrobotics.org/t/foxglove-2-0-integrated-ui-new-pricing-and-open-source-changes/36583", why: "Context for tooling choices: the open-source Studio was discontinued." }
  ],
  open_problems: [
    "A common schema for heterogeneous robot data (rates, frames, conventions) that is richer than RLDS and adopted beyond one framework.",
    "Efficient random access into long video for training without large decoded caches.",
    "Machine unlearning / deletion propagation from datasets into trained policies.",
    "Measuring dataset value per episode (influence on downstream success) cheaply enough to drive curation."
  ],
  self_check: [
    { q: "A policy regresses after retraining on a 'bigger' snapshot. Which artifacts from this stage do you diff first?", a: "The snapshot manifests (which sources and episodes were added or dropped, source-mix percentages), the normalization stats (q01/q99 per action dimension), the conversion code hash (resampling, frame alignment changes), the feature schema (camera resolution or codec change), and QA flag distributions (did a filter change admit idle or desynced episodes)." },
    { q: "Why must normalization statistics travel with the model artifact into deployment?", a: "The policy outputs normalized actions; the runtime must un-normalize with exactly the statistics used in training. If the deployment computes or loads stats from a different snapshot, every action is scaled or offset wrongly, which typically looks like a timid or overshooting robot rather than an obvious crash." },
    { q: "Your flywheel needs 'all failed insertions on connector family A12 at site 3 since policy v41'. What must exist in the catalog to answer this in one query?", a: "Episode rows with site, task/connector SKU, policy version, success flag and failure code (from [[s:04]] or success detectors), plus subtask-level labels to isolate the insertion segment; ideally an embedding index to expand to visually similar failures." },
    { q: "When is RLDS still the right choice in 2026?", a: "When you consume OXE or DROID directly, or train with a JAX/TF stack that expects it (e.g. some openpi and Octo data paths). For new data, a format with packed episodes and streaming (LeRobotDataset v3) is usually preferable; convert with an explicit action-convention mapping." },
    { q: "What changes in this stage when you add 10,000 h of egocentric human video?", a: "Storage grows by an order of magnitude and becomes video-dominated; you need privacy processing (faces, screens), consent and licence columns, hand-pose and camera-pose streams in the schema, and a separate training view (latent-action or retargeted-action features) because there are no robot actions. Data loading becomes decode-bound, so hardware decode and pre-extracted features matter." }
  ]
};
