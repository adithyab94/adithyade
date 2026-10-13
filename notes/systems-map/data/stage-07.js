/* Stage 07 — Model architectures & training. Schema: MAINTENANCE.md */
window.PAI = window.PAI || {}; PAI.stages = PAI.stages || {};
PAI.stages["stage-07"] = {
  id: "stage-07", num: "07", title: "Model architectures & training", short: "Models & training",
  version: "1.0.0", last_verified: "2026-10-07",
  upstream: [
    { id: "stage-04", what: "labelled, weighted mixtures; language and metadata prompts; progress/advantage labels" },
    { id: "stage-03", what: "versioned training snapshots and frozen normalization stats" },
    { id: "stage-06", what: "co-training ratio and sim data" },
    { id: "stage-08", what: "RL-fine-tuned weights, value functions, distilled residual data" },
    { id: "stage-10", what: "eval results drive checkpoint selection and retraining (feedback)" }
  ],
  downstream: [
    { id: "stage-08", what: "base policy for RL fine-tuning; value / reward heads" },
    { id: "stage-10", what: "checkpoints + model card for evaluation" },
    { id: "stage-11", what: "approved checkpoint (weights, config, norm stats, tokenizer) for compression and compilation" }
  ],
  handoff_short: "Checkpoint (safetensors) + model config + normalization stats + tokenizer/prompt template + training manifest (data snapshot, code hash, seeds)",
  purpose: "Turn curated data into a policy: pick an architecture family, run pretraining and post-training at the right scale, and produce checkpoints whose behaviour, inputs and outputs are fully specified for evaluation and deployment. In 2026 this mostly means adapting a pretrained generalist (VLA or world-action model) rather than training from scratch.",
  interface: {
    inputs: [
      { name: "Training snapshot(s)", format: "LeRobotDataset v3 / RLDS; mixture YAML with weights", rate: "Per run", from: "[[s:03]], [[s:04]]" },
      { name: "Base checkpoint", format: "Pretrained VLA / WAM / VLM weights (safetensors / orbax)", rate: "Per base-model release", from: "openpi, Isaac-GR00T, LeRobot hub, in-house" },
      { name: "Labels & prompts", format: "Language, subtask, metadata prompts, advantage indicators", rate: "Per snapshot", from: "[[s:04]]" },
      { name: "RL data / weights", format: "On-policy rollouts with rewards, value functions, residual-distilled data", rate: "Per RL cycle", from: "[[s:08]]" }
    ],
    outputs: [
      { name: "Checkpoint", format: "safetensors (PyTorch) or orbax (JAX); EMA weights", rate: "Every N steps; promoted ones tagged", to: "[[s:10]], [[s:11]]" },
      { name: "Policy contract", format: "`policy.yaml`: observation keys and shapes, image preprocessing, action dims, chunk H, control rate, normalization stats, prompt template", rate: "Per checkpoint", to: "[[s:11]], [[s:12]]" },
      { name: "Training manifest", format: "Data snapshot ids, code hash, config, seeds, hardware, loss curves (W&B/MLflow run id)", rate: "Per run", to: "[[s:12]] registry, [[s:14]] documentation" }
    ],
    handoff: "A checkpoint is unusable without its **policy contract**: which cameras in which order, resolution and crop, state vector layout, normalization stats, action space and frame, chunk length and expected control rate, denoising steps, prompt format. Compilation in [[s:11]] and the runtime in [[s:12]] are generated from this contract; most 'the model works in eval but not on the robot' incidents are contract mismatches."
  },
  mental_model: "A 2026 robot policy is a pretrained backbone + an action interface + a three-phase recipe. The backbone is either a **VLM** (semantics, language, web knowledge: VLAs) or a **video world model** (dynamics, physical foresight: WAMs). The action interface is tokens, a flow/diffusion head, or action latents inside the video model. The recipe is: pretrain broad (cross-embodiment robot data, human video, web data), mid-train/align to the embodiment, post-train for reliability (RL, advantage conditioning).",
  mental_detail: "**VLA anatomy (π0.5 as reference)**: a PaliGemma VLM (SigLIP So400m vision encoder + Gemma 2B) processes images, language and discretized proprioceptive state as a prefix; a separate ~300M-parameter **action expert** generates continuous action chunks by flow matching, conditioned through attention on the prefix with the timestep injected via adaptive RMSNorm; knowledge insulation stops action-loss gradients from corrupting the VLM while FAST-token co-training keeps the backbone learning action structure. GR00T N1.7 follows the same split with Cosmos-Reason2-2B (Qwen3-VL architecture) and a 16-layer flow-matching DiT, 3B total, trained with 20k h of EgoScale human video in a relative end-effector action space.\n\n**WAM anatomy (DreamZero / Cosmos Policy)**: start from a pretrained video diffusion model; encode actions (and values, future states) as additional latent frames or streams; train to jointly denoise future video and actions. DreamZero (14B, autoregressive video diffusion) reports >2× generalization to new tasks and environments vs state-of-the-art VLAs and real-time control at 7 Hz after system optimizations; its open code needs ≥2 GPUs (≈0.6 s per step on GB200 with DiT caching). Efficiency variants keep video prediction as a training signal but decode only actions at inference (GigaWorld-Policy: 85 ms on an RTX 4090) or predict future **features** instead of pixels (LaWAM: 187 ms per chunk, up to 24× faster than pixel WAMs).\n\nThe paradigm split is real but converging: Cosmos 3 puts a VLM tower and a world-generation tower in one mixture-of-transformers; π0.7 uses generated subgoal images (a cascaded world-model step) inside a VLA; GR00T N2 is previewed as WAM-based.",
  methods: [
    { id: "flow-vla", name: "VLA with flow-matching action expert", tags: ["il", "fm"],
      summary: "VLM prefix + continuous action head trained by flow matching (or diffusion), producing chunks of H ≈ 50 actions; 5–10 integration steps at inference. Family: π0 / π0.5 (openpi), π*0.6, π0.7 (closed), GR00T N1.x, SmolVLA (~450M), X-VLA (0.9B, soft-prompted cross-embodiment), Wall-OSS-0.5 (FAST tokens + flow).",
      pros: "Multimodal action distributions, smooth high-frequency chunks, strong language following via the VLM.",
      cons: "Iterative denoising costs latency; VLM backbone dominates memory; physical dynamics are learned only from robot data.",
      refs: [{ t: "openpi", u: "https://github.com/Physical-Intelligence/openpi" }, { t: "GR00T N1.7", u: "https://github.com/NVIDIA/Isaac-GR00T" }] },
    { id: "token-vla", name: "Autoregressive token VLAs", tags: ["il", "fm"],
      summary: "Actions discretized into tokens and predicted autoregressively by the language model. FAST compresses 1-s chunks with DCT + BPE (FAST+ universal tokenizer trained on 1M sequences), making AR training efficient; π0-FAST, MolmoAct (action reasoning with 7B, fully open data and code; MolmoAct2 May 2026), OpenVLA lineage. OpenVLA-OFT showed that parallel decoding of continuous actions removes most AR latency.",
      pros: "Reuses LLM training infrastructure; easy to mix with reasoning tokens; good language grounding.",
      cons: "Sequential decoding latency; quantization error; long-chunk AR is slow without parallel decoding.",
      refs: [{ t: "FAST", u: "https://arxiv.org/pdf/2501.09747" }, { t: "MolmoAct", u: "https://github.com/allenai/molmoact" }] },
    { id: "ki", name: "Knowledge insulation & web co-training", tags: ["fm", "il"],
      summary: "Freeze or stop-gradient the VLM against the continuous action loss, train the backbone with discrete FAST action tokens plus web VQA / captioning data, and let only the action expert learn from flow matching. π0.5 introduced this; π0.6 reimplementations describe a larger Gemma 3 backbone and ~860M action expert (not an official spec).",
      pros: "Preserves semantic generalization and language following during robot fine-tuning.",
      cons: "More complex loss mixing; web-data mixture is a tuning burden." },
    { id: "diffusion-policy", name: "Task-specific diffusion / flow / ACT policies", tags: ["il"],
      summary: "Small visuomotor policies trained from scratch per task: Diffusion Policy (RSS 2023), ACT (ALOHA), DP3 (point clouds). TRI's large behavior model study (1,700 h, 1,800 blind real rollouts, 47k sim rollouts) found pretrained multitask models fine-tuned to a task need **3–5× less data** than from-scratch specialists.",
      pros: "Fast to train (hours on one GPU), fast inference, strong on narrow tasks with 50–200 demos.",
      cons: "No language, poor generalization outside training distribution; superseded by fine-tuned generalists when data is scarce.",
      refs: [{ t: "Diffusion Policy", u: "https://github.com/real-stanford/diffusion_policy" }, { t: "TRI LBM study", u: "https://arxiv.org/pdf/2507.05331" }] },
    { id: "joint-wam", name: "Joint World Action Models (video backbone)", tags: ["wam", "fm", "il"], frontier: true, frontier_ref: "wam",
      summary: "One model jointly predicts future observations and actions from a video-diffusion backbone. **DreamZero** (NVIDIA GEAR, Feb 2026; 14B; code and DROID/AgiBot checkpoints Apache-2.0): learns from heterogeneous data without repetitive demos; video-only demos from other robots or humans improve unseen tasks by >40 % with 10–20 min of data; 30 min of play data to adapt to a new embodiment. **Cosmos Policy** (NVIDIA + Stanford, ICLR 2026): post-trains Cosmos-Predict2 with actions, future states and values as latent frames; LIBERO 98.5 %, RoboCasa 67.1 %; test-time planning by scoring sampled futures. Also X-WAM, Fast-WAM, LingBot-VA, DiT4DiT.",
      pros: "Physical dynamics learned from video; strong generalization to unseen motions; can use action-free video directly.",
      cons: "Large (multi-billion) models with multi-GPU inference in open releases; latency; video-generation quality ≠ action quality.",
      refs: [{ t: "DreamZero", u: "https://arxiv.org/html/2602.15922" }, { t: "Cosmos Policy", u: "https://arxiv.org/html/2601.16163v1" }, { t: "WAM survey (Sep 2026)", u: "https://arxiv.org/abs/2609.16074v1" }] },
    { id: "efficient-wam", name: "Action-centered and latent WAMs", tags: ["wam", "edge"], frontier: true, frontier_ref: "wam-efficient",
      summary: "Keep future prediction as **training-time** supervision but avoid generating pixels at inference. GigaWorld-Policy (action-centered: video supervision in training, action-only decoding; v0.5 with mixture-of-transformers experts reaches 85 ms on an RTX 4090). LaWAM predicts future features of a frozen vision foundation model via a latent-action-conditioned latent world model (187 ms/chunk; LIBERO 98.6 %, RoboTwin 91.2 %). V-JEPA 2-AC plans in latent space after post-training on <62 h of DROID video. VPP uses video-model features as policy inputs.",
      pros: "Most of the WAM benefit at a fraction of the inference cost; deployable on edge GPUs.",
      cons: "Lose explicit visual foresight for monitoring/planning; evidence mostly on simulated benchmarks.",
      refs: [{ t: "GigaWorld-Policy-0.5", u: "https://arxiv.org/pdf/2607.13960" }, { t: "LaWAM", u: "https://arxiv.org/pdf/2606.15768" }] },
    { id: "latent-action", name: "Latent action pretraining from actionless video", tags: ["fm", "il", "wam"], frontier: true, frontier_ref: "latent-actions",
      summary: "Learn a discrete or continuous latent action between frames (an inverse-dynamics encoder + forward decoder), pretrain the policy to predict latent actions on human/web video, then map latents to robot actions with a small labelled set. LAPA (ICLR 2025), UniVLA (task-centric latents on DINOv2 features), villa-X (adds proprioceptive forward dynamics), AgiBot GO-1 (latent action planner, 'ViLLA'), LatBot.",
      pros: "Turns unlabelled video into policy pretraining signal; cross-embodiment by construction.",
      cons: "Latents capture camera motion and distractors; mapping to precise robot control still needs robot data." },
    { id: "hierarchy", name: "Hierarchical / dual- and triple-system models", tags: ["fm", "il", "rl"], frontier: true, frontier_ref: "hierarchical",
      summary: "A slow reasoner (VLM / embodied-reasoning model, 0.1–2 Hz) emits subtasks, subgoals or latent plans for a fast visuomotor policy (System 1, 10–200 Hz), sometimes above a learned whole-body controller (System 0, ~1 kHz in Helix 02). Gemini Robotics 2 pairs ER 2 (reasoning, tool use) with a VLA and an On-Device variant; GR00T N1.x and Hi Robot use similar splits; 1X uses OpenAI models for high-level planning on NEO with its own low-level policy.",
      pros: "Each layer meets its latency; reasoning can use large cloud models; failures are localizable.",
      cons: "Interface between layers (language? latents? subgoal images?) limits what can be communicated; joint training is hard." },
    { id: "reasoning", name: "Embodied reasoning & 'thinking' VLAs", tags: ["fm"], frontier: true, frontier_ref: "embodied-reasoning",
      summary: "Generate intermediate reasoning (subtask plans, spatial points, traces, visual subgoals) before actions: Gemini Robotics 1.5 'thinking' VLA, OneTwoVLA (ICLR 2026, switches between reasoning and acting), ThinkAct (reinforced visual latent planning), Hume (value-guided System-2), MolmoAct (action reasoning in 2D traces), ECoT.",
      pros: "Better long-horizon and instruction generalization; interpretable intermediate outputs.",
      cons: "Extra tokens cost latency; reasoning quality is hard to supervise; gains on dexterous control are smaller than on planning." },
    { id: "steerable-icl", name: "Steerable prompting & in-context adaptation", tags: ["icl", "fm"], frontier: true, frontier_ref: "icl",
      summary: "Condition the policy on rich context that changes behaviour without gradient updates: π0.7 (7B, 7 embodiments, 50+ tasks) prompts with language, generated subgoal images and episode metadata; step-by-step verbal coaching raised an unseen air-fryer task from 5 % to 95 %. Retrieval-augmented policies (RICL, ICI-VLA, RA-VLA, BiCICLe) place retrieved demos in context; MEM shows in-context adaptation of manipulation strategy from memory.",
      pros: "Adaptation at deployment time; operator coaching becomes a data source.",
      cons: "Context length and latency grow; retrieval quality determines gains; 2026 studies question when retrieval actually helps.",
      refs: [{ t: "π0.7", u: "https://arxiv.org/abs/2604.15483" }, { t: "RICL", u: "https://arxiv.org/pdf/2508.02062" }, { t: "When does retrieval help?", u: "https://arxiv.org/html/2610.05492" }] },
    { id: "memory", name: "Long-horizon memory", tags: ["fm"], frontier: true, frontier_ref: "memory",
      summary: "MEM (Physical Intelligence + Stanford/Berkeley, Mar 2026) mixes a short-horizon video memory (efficient video encoder) with a long-horizon **language memory**, enabling tasks that require up to 15 minutes of memory within real-time latency limits. Other designs: MemoryVLA / MemoryVLA++, HiMem-WAM, explicit language memory for planning.",
      pros: "Handles partial observability and progress tracking in long tasks.",
      cons: "What to store is task-dependent; memory errors persist and compound.",
      refs: [{ t: "MEM", u: "https://arxiv.org/html/2603.03596v1" }] },
    { id: "cross-embodiment", name: "Cross-embodiment training", tags: ["fm", "il"],
      summary: "Train one model on many robots and humans: shared relative end-effector spaces (GR00T N1.7), embodiment-specific soft prompts (X-VLA), Motion Transfer (Gemini Robotics 1.5), padding/masking of action dims (π0 family), human-hand retargeting (EgoScale). Embodiment-scaling studies in locomotion find more training embodiments generalize better to unseen ones; CrossFormer controlled 20 embodiments with one network.",
      pros: "Pools data across fleets; zero-shot or few-shot to new robots (π0.7, DreamZero on YAM).",
      cons: "Negative transfer when conventions or camera setups disagree; capacity dilution for small models." },
    { id: "multisensory", name: "Force- and tactile-conditioned policies", tags: ["il"], frontier: true, frontier_ref: "tactile",
      summary: "Add F/T and tactile tokens to the policy: ForceVLA routes 6-axis force through a mixture-of-experts fusion module during action decoding (+23.2 % average success over π0 baselines, up to 80 % on plug insertion); ForceVLA2 adds tactile. Helix 02 uses fingertip tactile and palm cameras on its hands.",
      pros: "Contact-rich success under occlusion; detects seated/unseated states.",
      cons: "No large pretraining corpora with force/tactile; sensor-specific encoders." },
    { id: "infra", name: "Training infrastructure & recipe", tags: ["cloud"],
      summary: "Pretraining: hundreds to thousands of GPUs, bf16, FSDP/sharded data parallel (PyTorch) or JAX pjit (openpi originated in JAX; PyTorch support since Sep 2025), video decode as the main bottleneck. Fine-tuning: openpi needs >8 GB to infer, >22.5 GB for LoRA, >70 GB for full fine-tuning; GR00T N1.7 needs 16 GB+ to infer and 40 GB+ to fine-tune. Track every run (W&B / MLflow) with data snapshot id; select checkpoints on real or correlated-sim eval, not on loss.",
      pros: "LoRA makes per-site specialization cheap; EMA and long schedules stabilize flow heads.",
      cons: "Validation loss correlates weakly with success; GR00T notes 5–6 % run-to-run variance from augmentation nondeterminism." }
  ],
  extras: [
    { title: "Training recipe phases", note: "Composite of published recipes (π0.5/π0.7, GR00T N1.7, EgoScale, π*0.6). Data volumes are indicative.",
      columns: ["Phase", "Data", "Objective", "Typical scale", "Output"],
      rows: [
        ["Pretrain (backbone)", "Web image/video + text; for WAMs, large video corpora", "VLM / video-generation objectives", "Inherited from VLM or video model (billions of tokens / frames)", "Backbone with semantics or dynamics priors"],
        ["Robot pretrain", "Cross-embodiment robot data (OXE, DROID, AgiBot World, in-house), human video (EgoScale 20k h), sim", "Flow matching / FAST tokens / joint video-action denoising; web co-training", "10³–10⁵ h robot data; 10⁴ h human video; 10s–100s of GPU-weeks", "Generalist base checkpoint"],
        ["Mid-train / align", "Aligned human–robot data, target embodiment teleop", "Same objectives on target action space", "EgoScale: 50 h human + 4 h robot; typical 10–500 h", "Embodiment-adapted checkpoint"],
        ["Post-train (SFT)", "Task / site data, curated, metadata prompts", "Fine-tune (full or LoRA)", "50–1,000 episodes per task family; GPU-hours to GPU-days", "Task or site specialist / steerable generalist"],
        ["Post-train (RL)", "On-policy rollouts, interventions, values", "Advantage conditioning (RECAP), PPO/GRPO-style, residual RL + distillation", "Hours–days of robot time per task; sim RL at scale", "Reliable, faster policy ([[s:08]])"]
      ] }
  ],
  decision: [
    { "if": "Single task, < 200 demos, no language needed, tight latency", use: "Diffusion Policy / ACT from scratch, or SmolVLA fine-tune", why: "Small, fast, strong on narrow tasks." },
    { "if": "Multi-task with language, moderate data, standard arms", use: "Fine-tune π0.5 (openpi) or GR00T N1.7 with LoRA, then full FT if data grows", why: "Best open generalists; commercial licence for GR00T N1.7 weights." },
    { "if": "You need generalization to unseen motions / environments and can afford GPUs", use: "Evaluate a WAM (DreamZero, Cosmos Policy) against your VLA baseline", why: "WAMs report >2× generalization on new tasks (DreamZero); verify on your data." },
    { "if": "WAM benefits but edge latency budget", use: "Action-centered or latent WAM (GigaWorld-Policy, LaWAM) or distill a WAM into a VLA head", why: "Keeps dynamics priors at 85–190 ms per chunk on desktop GPUs." },
    { "if": "Lots of human video, few robot hours", use: "EgoScale-style human pretraining + aligned mid-training, or latent-action pretraining", why: "Log-linear gains with human data; small robot bridge." },
    { "if": "Long tasks with state you cannot see", use: "Memory (MEM-style language + video memory) or an explicit planner layer", why: "Single-frame policies lose track of progress." },
    { "if": "Contact-rich insertion", use: "Add F/T (and tactile) tokens (ForceVLA-style) and plan RL post-training", why: "Contact state is invisible to cameras; RL fixes the last 10–20 %." },
    { "if": "Fleet of heterogeneous robots", use: "Cross-embodiment training with explicit embodiment prompts and a shared relative action space", why: "Pools data while reducing negative transfer." }
  ],
  tools: [
    { id: "openpi", name: "π0 / π0-FAST / π0.5 (openpi)", what: "Open VLA weights + training code (JAX and PyTorch); DROID, ALOHA, LIBERO checkpoints", maker: "Physical Intelligence", open: "open", license: "Apache-2.0 (+ Gemma terms)", maturity: "production", best_for: "Strong open generalist base for fine-tuning", limitations: "PyTorch path lacks π0-FAST, FSDP, LoRA (per README); newer PI models are closed", release: "2025-09", version: "π0.5 + PyTorch support", link: "https://github.com/Physical-Intelligence/openpi", runs: ["cloud", "edge"], tech: ["il", "fm"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "pistar06", name: "π*0.6 (RECAP)", what: "VLA post-trained with advantage-conditioned offline + on-robot RL and interventions", maker: "Physical Intelligence", open: "closed", license: "Proprietary (method published)", maturity: "pilot", best_for: "Reference for reliability via RL post-training (laundry, boxes, espresso)", limitations: "Weights closed; reimplementations (e.g. OpenTau) are unofficial", release: "2025-11", version: "arXiv 2511.14759", link: "https://pi.website/blog/pistar06", runs: ["cloud", "robot"], tech: ["rl", "fm"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "pi07", name: "π0.7", what: "7B steerable generalist: language + generated subgoal images + episode metadata prompts; 7 embodiments", maker: "Physical Intelligence", open: "closed", license: "Proprietary", maturity: "pilot", best_for: "State of the art in compositional generalization and coaching (company evaluation)", limitations: "Closed; results are self-reported", release: "2026-04-16", version: "arXiv 2604.15483", link: "https://arxiv.org/abs/2604.15483", runs: ["cloud", "robot"], tech: ["fm", "icl", "wam"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "groot-n17", name: "GR00T N1.7", what: "3B VLA: Cosmos-Reason2-2B backbone + flow-matching DiT; relative EEF action space; 20k h EgoScale human video", maker: "NVIDIA", open: "open", license: "Code Apache-2.0; weights NVIDIA Open Model License (commercial use)", maturity: "production", best_for: "Humanoid and dexterous manipulation with commercial licence; Jetson Thor deployment", limitations: "5–6 % run-to-run variance noted; fine-tune needs 40 GB+", release: "2026-04-17", version: "N1.7 (EA Apr 2026, then GA)", link: "https://github.com/NVIDIA/Isaac-GR00T", runs: ["cloud", "edge"], tech: ["il", "fm"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "groot-n16", name: "GR00T N1.6", what: "Previous GR00T release (Eagle VLM backbone)", maker: "NVIDIA", open: "open", license: "NVIDIA Open Model License", maturity: "production", best_for: "Existing deployments", limitations: "Superseded by N1.7 (new backbone, commercial licence)", release: null, version: "N1.6", release_note: "superseded", link: "https://github.com/NVIDIA/Isaac-GR00T", runs: ["cloud", "edge"], tech: ["il", "fm"], added: "2026-10-07", last_verified: "2026-10-07", status: "superseded", superseded_by: "GR00T N1.7" },
    { id: "groot-n2", name: "GR00T N2 (preview)", what: "Next GR00T, built on the DreamZero WAM architecture; NVIDIA claims >2× new-task-in-new-environment success vs leading VLAs and No. 1 on RoboArena / MolmoSpaces at preview", maker: "NVIDIA", open: "closed", license: "Not yet released", maturity: "research", best_for: "Watch item for WAM-based humanoid control", limitations: "Preview only; availability targeted end of 2026; claims unverified", release: "2026-03", version: "GTC 2026 preview", link: "https://nvidianews.nvidia.com/news/nvidia-and-global-robotics-leaders-take-physical-ai-to-the-real-world", runs: ["cloud", "edge"], tech: ["wam", "fm"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "gemini-robotics-2", name: "Gemini Robotics 2 (+ ER 2, On-Device)", what: "VLA with whole-body control and dexterity (e.g. 22-DoF SharpaWave hand on Apptronik Apollo 2) + embodied-reasoning model", maker: "Google DeepMind", open: "closed", license: "ER 2 via Gemini API; VLA / On-Device to early-access partners", maturity: "pilot", best_for: "Partners building humanoids / dexterous systems; ER 2 for planning and labelling", limitations: "Closed; VLA access restricted", release: "2026-07-30", version: "Gemini Robotics 2", link: "https://www.therobotreport.com/google-deepmind-says-gemini-robotics-2-enables-full-body-control/", runs: ["cloud", "edge"], tech: ["fm"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "gemini-robotics-15", name: "Gemini Robotics 1.5 / ER 1.5", what: "Multi-embodiment thinking VLA with Motion Transfer; ER 1.5 in Gemini API", maker: "Google DeepMind", open: "closed", license: "ER 1.5 via API; VLA to partners", maturity: "pilot", best_for: "Historical reference for thinking VLAs and Motion Transfer", limitations: "Superseded by Gemini Robotics 2", release: "2025-09", version: "1.5 (arXiv 2510.03342)", link: "https://arxiv.org/abs/2510.03342", runs: ["cloud"], tech: ["fm"], added: "2026-10-07", last_verified: "2026-10-07", status: "superseded", superseded_by: "Gemini Robotics 2" },
    { id: "helix02", name: "Figure Helix 02", what: "Full-body humanoid control from pixels: S2 reasoning, S1 200 Hz joint targets, S0 ~10M params ~1 kHz", maker: "Figure AI", open: "closed", license: "Proprietary", maturity: "pilot", best_for: "Reference architecture for triple-rate humanoid control", limitations: "Closed; details from company announcements", release: "2026-01-27", version: "Helix 02", link: "https://humanoidroboticstechnology.com/industry-news/figure-launches-helix-02/", runs: ["edge", "robot"], tech: ["fm", "il", "rl"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "gen0", name: "GEN-0", what: "Embodied foundation model trained on 270k h real data; 'Harmonic Reasoning' over async sensing/acting token streams", maker: "Generalist AI", open: "closed", license: "Proprietary", maturity: "pilot", best_for: "Evidence for robot scaling laws (ossification below ~7B params)", limitations: "Closed data and weights; claims self-reported", release: "2025-11-04", version: "GEN-0", link: "https://generalistai.com/blog/gen-0", runs: ["cloud"], tech: ["fm", "il"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "dreamzero", name: "DreamZero", what: "14B autoregressive video-diffusion World Action Model; zero-shot policies", maker: "NVIDIA GEAR", open: "open", license: "Apache-2.0", maturity: "research", best_for: "Generalization to unseen tasks/motions; learning from video-only demos", limitations: "Inference needs ≥2 large GPUs (≈0.6 s GB200 / ≈3 s H100 per step with caching in the open release)", release: "2026-02-27", version: "code + DROID / AgiBot ckpts", link: "https://github.com/dreamzero0/dreamzero", runs: ["cloud"], tech: ["wam", "fm"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "cosmos-policy", name: "Cosmos Policy", what: "Cosmos-Predict2 post-trained to output actions, future states and values as latent frames", maker: "NVIDIA + Stanford", open: "open", license: "Apache-2.0", maturity: "research", best_for: "Video-model-based policy with test-time planning", limitations: "Large; planning multiplies inference cost", release: "2026-01", version: "ICLR 2026", link: "https://github.com/NVlabs/cosmos-policy", runs: ["cloud"], tech: ["wam", "fm"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "gigaworld-policy", name: "GigaWorld-Policy", what: "Action-centered WAM: video supervision in training, action-only decoding; v0.5 MoT experts, 85 ms on RTX 4090", maker: "GigaAI", open: "open", license: "See repo", maturity: "research", best_for: "WAM benefits at deployable latency", limitations: "Mostly company / benchmark evidence", release: "2026-07", version: "0.5 (arXiv 2607.13960)", link: "https://arxiv.org/pdf/2607.13960", runs: ["cloud", "edge"], tech: ["wam"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "lawam", name: "LaWAM", what: "Latent WAM predicting future vision-foundation features (187 ms/chunk)", maker: "Tsinghua / PKU / Jilin et al.", open: "open", license: "See paper", maturity: "research", best_for: "Dynamics-aware policies without pixel generation", limitations: "New (Jun 2026); limited real-world evidence", release: "2026-06-14", version: "arXiv 2606.15768", link: "https://arxiv.org/pdf/2606.15768", runs: ["cloud", "edge"], tech: ["wam"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "smolvla", name: "SmolVLA", what: "~450M-parameter VLA with async inference stack", maker: "Hugging Face", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Low-cost robots, consumer GPUs, education, fast iteration", limitations: "Lower capability than multi-billion VLAs on hard tasks", release: "2025-06", version: "arXiv 2506.01844", link: "https://huggingface.co/docs/lerobot/main/async", runs: ["edge", "cloud"], tech: ["il", "fm"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "xvla", name: "X-VLA", what: "0.9B soft-prompted cross-embodiment VLA; LeRobot-native", maker: "Tsinghua AIR et al.", open: "open", license: "Apache-2.0", maturity: "pilot", best_for: "Cross-embodiment fine-tuning at small scale; strong sim benchmarks", limitations: "Smaller backbone limits language/semantic breadth", release: "2025-10", version: "ICLR 2026", link: "https://github.com/2toinf/X-VLA", runs: ["cloud", "edge"], tech: ["il", "fm"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "molmoact2", name: "MolmoAct2", what: "Fully open action-reasoning model (7B): weights, code and data", maker: "Allen Institute for AI", open: "open", license: "Apache-2.0", maturity: "pilot", best_for: "Open research baseline with reasoning traces; reported to beat π0.5 on 7 benchmarks", limitations: "AR decoding latency; claims from authors", release: "2026-05-05", version: "MolmoAct2", link: "https://github.com/allenai/molmoact", runs: ["cloud"], tech: ["il", "fm"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "wall-oss", name: "Wall-OSS-0.5", what: "4B VLA on Qwen2.5-VL with MoE routing, FAST tokens + flow actions; weights, code, optimizer public", maker: "X Square Robot", open: "open", license: "Apache-2.0", maturity: "pilot", best_for: "Strong zero-shot pretrained behaviour before fine-tuning", limitations: "Evaluation mostly on the company's 17-task suite", release: "2026-05-28", version: "0.5", link: "https://huggingface.co/lerobot/wall-oss-0.5", runs: ["cloud"], tech: ["il", "fm"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "openvla-oft", name: "OpenVLA-OFT", what: "Optimized fine-tuning recipe for OpenVLA: parallel decoding, continuous actions, chunking", maker: "Stanford", open: "open", license: "MIT", maturity: "pilot", best_for: "Fast, strong fine-tuning baseline on LIBERO / ALOHA", limitations: "7B Llama-2 backbone is dated; 16–18 GB inference", release: "2025-02", version: "arXiv 2502.19645", link: "https://github.com/moojink/openvla-oft", runs: ["cloud"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "diffusion-policy-tool", name: "Diffusion Policy", what: "Visuomotor policy via action diffusion (single-task baseline)", maker: "Columbia / TRI / MIT", open: "open", license: "MIT", maturity: "production", best_for: "Narrow tasks with 50–200 demos; baseline for any new method", limitations: "No language or cross-task generalization", release: "2023", version: "RSS 2023", link: "https://github.com/real-stanford/diffusion_policy", runs: ["cloud", "edge"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "lerobot-train", name: "LeRobot (training)", what: "PyTorch library: ACT, Diffusion, π0/π0.5/π0-FAST, SmolVLA, X-VLA, GR00T, EO-1, Wall-OSS; RL API", maker: "Hugging Face", open: "open", license: "Apache-2.0", maturity: "production", best_for: "One framework to train and compare many open policies", limitations: "Fast-moving API (breaking renames in 0.6.x)", release: "2026-08-03", version: "v0.6.1", link: "https://github.com/huggingface/lerobot/releases", runs: ["cloud"], tech: ["il", "rl"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "starvla", name: "StarVLA", what: "Modular backbone × action-head codebase (VLM or world-model backbones; 4 decoding paradigms) with unified benchmarks", maker: "starVLA community", open: "open", license: "See repo", maturity: "research", best_for: "Controlled comparisons of VLA/WAM design choices", limitations: "Research codebase; not a deployment stack", release: "2026-04", version: "arXiv 2604.05014", link: "https://github.com/starVLA/starVLA", runs: ["cloud"], tech: ["il", "wam"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null }
  ],
  where: {
    cloud: { l: 3, n: "GPU clusters for pretraining and fine-tuning" },
    onprem: { l: 2, n: "large labs and companies run own clusters" },
    sim: { l: 1, n: "sim data in mixtures" },
    edge: { l: 1, n: "edge constraints shape model size" },
    robot: { l: 0, n: "" }
  },
  tech: {
    il: { l: 3, n: "imitation is the core objective" },
    rl: { l: 2, n: "RL post-training phase" },
    classical: { l: 0, n: "" },
    sim2real: { l: 1, n: "co-training" },
    real2sim: { l: 0, n: "" },
    real2sim2real: { l: 0, n: "" },
    fm: { l: 3, n: "VLM / video backbones" },
    wam: { l: 3, n: "joint and latent world-action models" },
    icl: { l: 2, n: "steerable prompts, retrieval, memory" }
  },
  stacks: {
    open: { title: "Open stack", items: [
      "Base: π0.5 (openpi) or GR00T N1.7; small: SmolVLA / X-VLA; WAM experiments: DreamZero, Cosmos Policy",
      "LeRobot or the model's own repo for fine-tuning (LoRA first); StarVLA for architecture comparisons",
      "PyTorch FSDP / JAX on rented H100/H200; W&B or MLflow run tracking with data snapshot ids",
      "Checkpoint selection on real eval or PolaRiS-style correlated sim eval"
    ], note: "LoRA fine-tuning of π0.5 fits a 24 GB GPU; full fine-tuning needs 70 GB+." },
    industry: { title: "Industry (public descriptions)", items: [
      "Physical Intelligence: π0.5 → π*0.6 (RECAP RL) → π0.7 (steerable, metadata + subgoal prompts) → MEM memory",
      "NVIDIA: GR00T N1.7 (VLA, human video) and DreamZero → GR00T N2 (WAM, previewed)",
      "Google DeepMind: Gemini Robotics 2 VLA + ER 2 + On-Device",
      "Figure: Helix 02 S2/S1/S0; Generalist: GEN-0 at 270k h scale; 1X: OpenAI models for planning + in-house low-level policy"
    ], note: "Architectures are described in papers/blogs; weights and data are mostly closed." }
  },
  example: {
    summary: "MB-1 fine-tunes GR00T N1.7 (commercially licensed weights) and compares against a π0.5 LoRA baseline. Additions: a wrench encoder (12-D F/T → 2 tokens, ForceVLA-style MoE fusion in the action head) and a tactile encoder (4 gel images at 128×128 → 4 tokens). Training mixture from snapshot `mb1-connectors@2026.09.3`. Prompts include the task, the current subtask (from labels) and metadata (`speed: normal`, `quality: good`). Policy contract fixed in `policy.yaml`.",
    artifacts: [
      { artifact: "Observation tensor", format: "dict of tensors", shape: "`images`: 3×3×224×224 uint8 (head, wrist_l, wrist_r) · `tactile`: 4×3×128×128 · `state`: float32[50] · `wrench`: float32[12] · `prompt`: ≤ 64 tokens", consumer: "model forward" },
      { artifact: "Action output", format: "tensor", shape: "float32[50, 24] (H = 50 at 50 Hz), normalized; un-normalized with `stats.json` q01/q99", consumer: "[[s:09]] via action server" },
      { artifact: "Run config", format: "YAML + W&B run", shape: "full FT 60k steps, batch 256, lr 1e-4 cosine, EMA 0.999, 32× H100 ≈ 40 h; LoRA baseline on π0.5: 1× H100 ≈ 10 h", consumer: "training manifest" },
      { artifact: "Checkpoint `mb1-gr00t17-ft@41`", format: "safetensors + `policy.yaml` + `stats.json` + manifest", shape: "≈ 3.1B params (bf16 ≈ 6.2 GB)", consumer: "[[s:10]], [[s:11]]" }
    ],
    humanoid: "H-1 trains **two models with different recipes**: a GR00T-class VLA for upper-body manipulation and whole-body motion targets (imitation on teleop + human video), and a whole-body tracking controller trained by RL in sim ([[s:08]]). They meet at a 'universal control interface' (SONIC connects GR00T N1.5 this way): the VLA outputs motion targets, the RL controller tracks them at 50 Hz. Changes to either side must respect that interface."
  },
  pitfalls: [
    { t: "Selecting checkpoints on validation loss", d: "Action MSE / flow loss correlates weakly with task success; select on real eval or a sim with measured correlation." },
    { t: "Contract drift between training and deployment", d: "Different image resize (crop vs pad), camera order, or normalization stats produce plausible but wrong actions; generate runtime preprocessing from `policy.yaml`." },
    { t: "Full fine-tuning that destroys language following", d: "Robot-only fine-tuning erodes the VLM's semantic skills; use knowledge insulation, LoRA, or mix web data." },
    { t: "Believing self-reported generalist results transfer to your robot", d: "Most frontier results are company-evaluated on their own hardware; reproduce on your eval protocol before switching." },
    { t: "Comparing a WAM and a VLA at different compute", d: "A 14B video model vs a 3B VLA is not an architecture comparison; compare at matched inference latency for deployment decisions." },
    { t: "Ignoring run-to-run variance", d: "5–6 % variance between identical runs (noted for GR00T) swamps many 'improvements'; use multiple seeds and statistical tests ([[s:10]])." }
  ],
  numbers: [
    { m: "π0.5 architecture", v: "Gemma 2B (PaliGemma, SigLIP So400m) + ~300M flow-matching action expert", s: "[Intel OEP / openpi docs](https://docs.openedgeplatform.intel.com/2026.0/edge-ai-suites/robotics-ai-suite/embodied/sample_pipelines/pi05_with_rtc.html)" },
    { m: "GR00T N1.7", v: "3B params; Cosmos-Reason2-2B + 16-layer DiT; 20k h EgoScale; infer ≥ 16 GB, FT ≥ 40 GB", s: "[Isaac-GR00T](https://github.com/NVIDIA/Isaac-GR00T)" },
    { m: "openpi memory", v: "infer > 8 GB · LoRA > 22.5 GB · full FT > 70 GB", s: "[openpi README](https://github.com/Physical-Intelligence/openpi)" },
    { m: "DreamZero", v: "14B; 7 Hz closed loop (paper, optimized); open release ≈ 0.6 s/step GB200, ≈ 3 s H100 (≥ 2 GPUs)", s: "[paper](https://arxiv.org/html/2602.15922), [repo](https://github.com/dreamzero0/dreamzero)" },
    { m: "Efficient WAM latency", v: "GigaWorld-Policy-0.5: 85 ms (RTX 4090) · LaWAM: 187 ms/chunk", s: "[2607.13960](https://arxiv.org/pdf/2607.13960), [2606.15768](https://arxiv.org/pdf/2606.15768)" },
    { m: "Benchmark saturation", v: "LIBERO: Cosmos Policy 98.5 %, LaWAM 98.6 %, PLD 99 %", s: "See [[s:10]] on why LIBERO no longer discriminates" },
    { m: "Pretraining benefit (TRI LBM)", v: "3–5× less task data for same performance vs from-scratch", s: "[arXiv 2507.05331](https://arxiv.org/pdf/2507.05331)" },
    { m: "GEN-0 scaling", v: "270k h data; 'ossification' below ~7B params (company claim)", s: "[Generalist](https://generalistai.com/blog/gen-0)" }
  ],
  papers: [
    { title: "π0.7: a Steerable Generalist Robotic Foundation Model with Emergent Capabilities", year: "2026", venue: "arXiv 2604.15483", url: "https://arxiv.org/abs/2604.15483", why: "Current reference for steerable, context-conditioned generalists." },
    { title: "World Action Models are Zero-shot Policies (DreamZero)", year: "2026", venue: "arXiv 2602.15922", url: "https://arxiv.org/html/2602.15922", why: "Flagship joint WAM on a video-diffusion backbone; basis for GR00T N2." },
    { title: "Cosmos Policy: Fine-Tuning Video Models for Visuomotor Control and Planning", year: "2026", venue: "ICLR", url: "https://arxiv.org/html/2601.16163v1", why: "Actions, states and values as latent frames; test-time planning." },
    { title: "World-Action Models for Robot Learning and Control: A Survey", year: "2026", venue: "arXiv 2609.16074", url: "https://arxiv.org/abs/2609.16074v1", why: "Taxonomy of prediction routes, architectures and data for WAMs." },
    { title: "EgoScale: Scaling Dexterous Manipulation with Diverse Egocentric Human Data", year: "2026", venue: "arXiv 2602.16710", url: "https://arxiv.org/html/2602.16710", why: "Human-video pretraining recipe used in GR00T N1.7." },
    { title: "A Careful Examination of Large Behavior Models for Multitask Dexterous Manipulation", year: "2025", venue: "TRI", url: "https://arxiv.org/pdf/2507.05331", why: "Rigorous evidence for pretraining benefits and how to measure them." }
  ],
  open_problems: [
    "VLA vs WAM at matched compute and latency: no controlled, independent comparison on real robots yet.",
    "Interfaces between hierarchy levels: language, latents, subgoal images or motion targets — which carries enough information?",
    "Scaling laws for robot data are company-reported (GEN-0) or task-narrow; public, reproducible evidence is thin.",
    "Catastrophic forgetting across post-training stages (SFT → RL → site fine-tunes) in long-lived fleet models.",
    "Pretraining corpora for force and tactile signals."
  ],
  self_check: [
    { q: "A GR00T fine-tune scores 92 % in your sim eval and 55 % on the robot. Name four contract mismatches you check before blaming the model.", a: "(1) Image preprocessing: resolution, crop vs letterbox, color order (RGB/BGR), JPEG vs raw. (2) Camera order and naming relative to training. (3) State vector layout, units and normalization stats (q01/q99 file mismatch). (4) Action frame and chunk execution: relative vs absolute, base vs world frame, control rate, how many actions of the chunk are executed before replanning, RTC settings. Also prompt template differences." },
    { q: "Why might a WAM generalize better to unseen motions than a VLA trained on the same robot data?", a: "Its backbone was pretrained to predict how scenes evolve from massive video, and joint training ties actions to predicted visual consequences, giving dense supervision about dynamics. A VLA's VLM backbone carries semantics but its action head learns dynamics only from the (narrow) robot data, so novel motions are out of distribution." },
    { q: "What does knowledge insulation protect, and what would you see without it?", a: "It protects the VLM's pretrained representations (language understanding, object semantics) from being overwritten by gradients from the continuous action loss. Without it, fine-tuned policies follow instructions worse, confuse objects outside the fine-tuning set and lose open-vocabulary generalization." },
    { q: "Which downstream stages consume `policy.yaml`, and what do they generate from it?", a: "[[s:11]] generates the export/compile graph (input shapes, dtypes, number of denoising steps) and calibration data shapes; [[s:12]] generates runtime preprocessing, the action server's chunk handling and the monitoring schema; [[s:10]] uses it to configure eval harnesses identically to deployment." },
    { q: "You have 2,000 h of egocentric human video and 20 h of robot teleop for a dexterous task. Outline the training plan.", a: "Retarget or represent human data in a shared relative wrist + hand action space (or latent actions); pretrain on the human video (EgoScale-style); mid-train on a small aligned human–robot set; fine-tune on the 20 h teleop; evaluate per subtask; optionally RL post-train on contact-heavy phases. Keep normalization per embodiment and track the human/robot mix ratio." }
  ]
};
