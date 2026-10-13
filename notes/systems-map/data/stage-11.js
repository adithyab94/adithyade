/* Stage 11 — Optimization & edge inference. Schema: MAINTENANCE.md */
window.PAI = window.PAI || {}; PAI.stages = PAI.stages || {};
PAI.stages["stage-11"] = {
  id: "stage-11", num: "11", title: "Optimization & edge inference", short: "Edge inference",
  version: "1.0.0", last_verified: "2026-10-07",
  upstream: [
    { id: "stage-10", what: "approved checkpoint and its eval baseline" },
    { id: "stage-07", what: "policy contract (`policy.yaml`), weights, normalization stats" },
    { id: "stage-00", what: "compute and latency budget, target hardware" },
    { id: "stage-09", what: "action-server timing contract (chunk rate, execution horizon)" }
  ],
  downstream: [
    { id: "stage-12", what: "versioned engine + runtime container + manifest for deployment" },
    { id: "stage-10", what: "compressed engine for re-evaluation (parity and closed-loop)" }
  ],
  handoff_short: "Target-specific engine (TensorRT / ORT / ExecuTorch) + calibration artifacts + latency profile + parity report + manifest pinned to JetPack/TensorRT versions",
  purpose: "Make the approved policy run on the robot within its latency, memory and power budget without changing its behaviour beyond a measured tolerance. This is where model size, quantization, denoising steps, token counts and the on-robot / off-board split are decided against hard deadlines.",
  interface: {
    inputs: [
      { name: "Checkpoint + contract", format: "safetensors + `policy.yaml` + `stats.json`", rate: "Per approved candidate", from: "[[s:07]], [[s:10]]" },
      { name: "Calibration data", format: "Representative observation batches from deployment-like logs", rate: "Per quantization run", from: "[[s:03]]" },
      { name: "Budget", format: "p99 latency per process, memory ceiling, power mode", rate: "Versioned", from: "[[s:00]], [[s:09]]" }
    ],
    outputs: [
      { name: "Engine(s)", format: "TensorRT `.engine` per submodule (vision encoder, backbone, action head) or ORT / ExecuTorch / OpenVINO artifacts", rate: "Per checkpoint × target × software version", to: "[[s:12]]" },
      { name: "Latency profile", format: "Per-stage p50/p99 latency, memory, power at the chosen nvpmodel", rate: "Per engine", to: "[[s:12]], [[s:09]]" },
      { name: "Parity report", format: "Action-space error vs reference (per dim, per subtask), closed-loop sim/real deltas", rate: "Per engine", to: "[[s:10]]" },
      { name: "Manifest", format: "JSON: checkpoint hash, data snapshot, JetPack/L4T, TensorRT, CUDA, precision per layer, calibration hash, build container digest", rate: "Per engine", to: "[[s:12]] registry" }
    ],
    handoff: "TensorRT engines are tied to the GPU architecture and the TensorRT version that built them; JetPack upgrades require rebuilding and re-validating. The manifest pins every version so that the deployed artifact is reproducible from its inputs. Deployment must refuse an engine whose manifest does not match the robot's software image."
  },
  mental_model: "Latency is a budget split across a pipeline, and only the p99 matters. Spend it where it buys behaviour: the vision encoder and backbone tolerate aggressive quantization; the action head and its denoising loop are the most sensitive; and asynchronous execution with real-time chunking hides most of the remaining latency from the controller.",
  mental_detail: "A flow-matching VLA has three cost centres: **vision encoding** (several images per step; SigLIP-class encoders), **prefix processing** in the language backbone (hundreds to thousands of tokens), and the **action expert** run N times (denoising steps). Each has a different lever: token pruning and caching for vision and prefix, quantization (FP8, NVFP4 on Blackwell / Thor) for the backbone, step-count reduction and distillation for the action head, and CUDA graphs plus fused kernels everywhere.\n\nThe 2026 reference point: GR00T N1.7 runs end-to-end in ≈ 40 ms (25 Hz) on Jetson AGX Thor with TensorRT mixed NVFP4, a 3.1× speed-up over the 125 ms baseline; FP8 gives ≈ 44 ms. TensorRT Edge-LLM (Apache-2.0) runs LLMs, VLMs and VLAs including π0.5 on Thor and T4000 with NVFP4 weights/activations and FP8 KV cache. World-action models remain far heavier: the open DreamZero needs ≥ 2 data-centre GPUs, which is why action-centered and latent WAMs (85–190 ms on an RTX 4090) matter for deployment.",
  methods: [
    { id: "quantization", name: "Quantization (PTQ, QAT/QAD; INT8, FP8, NVFP4)", tags: ["edge"],
      summary: "Post-training quantization with calibration on deployment-like observations; per-module precision: vision encoder FP8/INT8, backbone NVFP4/FP8 (Blackwell, Thor), action expert FP16/FP8, FP8 KV cache. NVIDIA Model Optimizer adds NVFP4 activation headroom, learned-scale quantization and quantization-aware distillation (QAD) when PTQ loses accuracy.",
      pros: "2–4× speed and memory reduction; Thor's FP4 tensor cores deliver the headline TOPS.", cons: "Action heads are sensitive; calibration data mismatch causes systematic action bias; INT8 on older Orin lacks FP8/FP4 paths.",
      refs: [{ t: "Model Optimizer", u: "https://github.com/NVIDIA/Model-Optimizer/releases" }] },
    { id: "sparsity", name: "Pruning & structured sparsity", tags: ["edge"],
      summary: "2:4 structured sparsity (Ampere+ sparse tensor cores) with iterative prune → fine-tune cycles; channel/head pruning for vision backbones. Gains are model- and layer-dependent; sparse TOPS figures (e.g. 275 sparse INT8 TOPS on AGX Orin, 2070 sparse FP4 TFLOPS on Thor) assume 2:4 sparsity.",
      pros: "Up to ~2× math throughput on supported layers.", cons: "Requires retraining to recover accuracy; memory-bound layers see little gain." },
    { id: "token-pruning", name: "Visual token pruning & caching", tags: ["edge", "fm"],
      summary: "Drop or merge redundant image tokens and reuse computation across control steps: VLA-Pruner (semantic + action-relevance importance, up to 1.99× with comparable success), VLA-Cache (reuse static-token KV), CronusVLA (feature-level FIFO cache), SP-VLA (model scheduling + pruning), modality-aware pruning for 2D/3D inputs.",
      pros: "Large savings because most of the scene is static between steps.", cons: "Pruning can drop small task-critical objects (connectors, buttons); validate per task." },
    { id: "step-distill", name: "Fewer denoising steps & distillation", tags: ["edge", "il"],
      summary: "Reduce flow-matching integration steps (10 → 5 is common; π0.6 reimplementations default to 5), distil multi-step heads into few-step or one-step students (consistency / shortcut-style), distil a large teacher (VLA or WAM) into a smaller student, or decode only actions from an action-centered WAM.",
      pros: "Linear reduction of action-head cost; student models fit edge memory.", cons: "Fewer steps reduce multimodality and precision; distillation needs large rollout data." },
    { id: "compilers", name: "Compilation & runtimes", tags: ["edge"],
      summary: "Export: PyTorch → ONNX (opset per runtime) or `torch.export` → TensorRT / AOTInductor; JAX models via ONNX or reimplementation. Runtimes: **TensorRT 11** (Jetson, RTX), **TensorRT Edge-LLM** (C++ LLM/VLM/VLA runtime incl. π0.5), **ONNX Runtime** (CUDA/TensorRT EPs, CPU), **ExecuTorch** (mobile/embedded, many delegates), **OpenVINO** (Intel CPUs/GPUs/NPUs), Qualcomm stacks for Dragonwing. Use CUDA graphs to remove launch overhead; split the model into engines per submodule for profiling and mixed precision.",
      pros: "Fused kernels, static memory, predictable latency.", cons: "Export breaks on dynamic control flow (loops over denoising steps, variable token counts); engines are version-locked." },
    { id: "async-rtc", name: "Asynchronous execution & real-time chunking", tags: ["edge", "robot", "il"],
      summary: "Run inference in parallel with execution: start the next chunk when the remaining horizon drops below a threshold (LeRobot async: 30 % faster task completion), and use **RTC** to keep the new chunk consistent with actions already committed (inference-time inpainting, training-free; training-time variant used for π*0.6 espresso). Jetson-PI (2026) studies foresight-aligned async inference on board.",
      pros: "Hides model latency; removes pauses at chunk boundaries.", cons: "Requires latency < executed horizon; stale observations for the first actions of each chunk." ,
      refs: [{ t: "RTC", u: "https://arxiv.org/html/2506.07339v2" }, { t: "Jetson-PI", u: "https://arxiv.org/pdf/2607.12659" }] },
    { id: "split", name: "On-robot vs off-board vs cloud split", tags: ["edge", "cloud", "robot"],
      summary: "Onboard: safety, control, perception for control, the visuomotor policy. Workcell server (wired / private 5G): large planner or WAM, batch success detection. Cloud: reasoning models (Gemini Robotics-ER 2 via API, OpenAI models for 1X NEO planning), fleet learning. Hybrids interleave cloud VLA calls with lightweight local action prediction (VLA-ULAP). Design so that losing the link degrades capability, never safety.",
      pros: "Run models larger than the robot can hold; centralize expensive compute.", cons: "Network tail latency, privacy (images leave the site), cost per call." },
    { id: "small-models", name: "Small and efficient policies", tags: ["edge", "il"],
      summary: "Sub-1B VLAs (SmolVLA ~450M, Evo-1 0.77B, X-VLA 0.9B) and task-specific diffusion policies run on Orin-class or consumer GPUs at 15–30 Hz; efficient WAMs (GigaWorld-Policy-0.5, LaWAM) bring video-model priors to desktop GPUs. A 2026 study of SmolVLA across PyTorch and ONNX variants shows faster deployment variants can change closed-loop behaviour, so re-evaluate after every runtime change.",
      pros: "Cheap hardware, high control rates.", cons: "Less semantic breadth; may need more task data." }
  ],
  extras: [
    { title: "Edge hardware (published figures)", note: "Peak numbers assume sparsity and the lowest precision; real model throughput is far lower. Verify with your own profiling.",
      columns: ["Module", "AI compute", "Memory", "Power", "Notes"],
      rows: [
        ["Jetson AGX Thor T5000", "2070 TFLOPS FP4 (sparse)", "128 GB LPDDR5X", "40–130 W", "Blackwell GPU 2560 cores / 96 TC; 14-core Neoverse-V3AE; JetPack 7.x"],
        ["Jetson T4000", "1200 TFLOPS FP4 (sparse)", "64 GB", "40–70 W", "Available with JetPack 7.1 (Jan 2026)"],
        ["Jetson AGX Orin 64GB", "275 TOPS INT8 (sparse)", "64 GB LPDDR5", "15–60 W", "Ampere 2048 cores / 64 TC; no FP8/FP4"],
        ["Jetson Orin Nano Super", "67 TOPS INT8 (sparse)", "8 GB", "up to 25 W", "$249 dev kit; small policies and perception"],
        ["Qualcomm Dragonwing IQ10 RRD", "up to 700 TOPS", "—", "—", "18 Oryon cores; GA Sep 2026"]
      ] },
    { title: "Latency reference points (2026)", note: "Different hardware, precisions and measurement methods; use as orders of magnitude.",
      columns: ["Model / system", "Hardware", "Latency", "Source"],
      rows: [
        ["GR00T N1.7 (3B), TRT mixed NVFP4", "Jetson AGX Thor", "≈ 40 ms (25 Hz); 125 ms baseline; FP8 ≈ 44 ms", "[Jetson AI Lab](https://www.jetson-ai-lab.com/tutorials/groot_n17_on_thor/)"],
        ["π0.5 (openpi)", "Jetson AGX Thor", "reports range from ≈ 44 ms (optimized) to ≈ 310–460 ms (less optimized); disputed / setup-dependent", "[Jetson AI Lab](https://www.jetson-ai-lab.com/tutorials/openpi_on_thor), [Intel OEP article](https://docs.openedgeplatform.intel.com/2026.1/_sources/OEP-articles/publications/optimizing-pi0.5-lva-model.md.txt)"],
        ["GigaWorld-Policy-0.5 (WAM, action-only decode)", "RTX 4090", "85 ms", "[arXiv 2607.13960](https://arxiv.org/pdf/2607.13960)"],
        ["LaWAM (latent WAM)", "desktop GPU", "187 ms per chunk", "[arXiv 2606.15768](https://arxiv.org/pdf/2606.15768)"],
        ["DreamZero (14B WAM), open release", "GB200 / H100 (≥ 2 GPUs)", "≈ 0.6 s / ≈ 3 s per step", "[repo](https://github.com/dreamzero0/dreamzero)"],
        ["Qwen3.6-27B LLM, TRT Edge-LLM NVFP4", "Jetson AGX Thor", "52.33 tokens/s (MLPerf Edge agentic)", "[NVIDIA blog](https://developer.nvidia.com/blog/tensorrt-edge-llm-completes-the-mlperf-edge-agentic-benchmark-6-4x-faster-on-jetson-agx-thor/)"]
      ] }
  ],
  decision: [
    { "if": "Jetson Thor and a 2–4B VLA", use: "TensorRT per submodule: vision FP8, backbone NVFP4/FP8, action head FP16→FP8 after parity check; CUDA graphs; 5 denoising steps; RTC", why: "Matches the published ≈ 40 ms GR00T path; keeps the sensitive head precise." },
    { "if": "Jetson Orin (no FP8/FP4)", use: "Sub-1B VLA or diffusion policy; INT8 for vision, FP16 for heads; 2:4 sparsity where it helps; or offload the big model to a workcell GPU", why: "Multi-billion VLAs run at a few Hz on Orin without heavy work." },
    { "if": "Model needs > 150 ms per chunk", use: "Async inference + RTC with a long execution horizon, impedance control underneath", why: "Latency is hidden as long as it is below the executed horizon." },
    { "if": "You want WAM benefits on the robot", use: "Action-centered / latent WAM, or distil WAM rollouts into a VLA student", why: "Pixel WAMs do not fit edge budgets today." },
    { "if": "Large planner / reasoner", use: "Workcell server or cloud API with a bounded-latency fallback onboard", why: "Reasoning is slow and not safety-critical; isolate it." },
    { "if": "Upgrading JetPack / TensorRT", use: "Rebuild engines in the pinned container, re-run parity and closed-loop eval before rollout", why: "Engines and numerics change across versions." }
  ],
  tools: [
    { id: "tensorrt", name: "TensorRT", what: "NVIDIA inference compiler/runtime (FP4/FP8/INT8, sparsity, CUDA graphs)", maker: "NVIDIA", open: "mixed", license: "Proprietary runtime; OSS parsers/plugins (Apache-2.0)", maturity: "production", best_for: "Lowest latency on Jetson and RTX", limitations: "Engines tied to GPU + TRT version; export friction for dynamic graphs", release: "2026-09-22", version: "11.3 (CUDA 13.4)", link: "https://github.com/NVIDIA/TensorRT/releases", runs: ["edge"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "trt-edge-llm", name: "TensorRT Edge-LLM", what: "Lightweight C++ runtime for LLMs, VLMs and VLAs on Jetson Thor/T4000, DRIVE, DGX Spark; supports π0.5", maker: "NVIDIA", open: "open", license: "Apache-2.0", maturity: "pilot", best_for: "Transformer-heavy VLA backbones with NVFP4 + FP8 KV cache", limitations: "Young (0.x); model coverage via compatibility matrix", release: "2026-09", version: "0.11.0", link: "https://github.com/NVIDIA/TensorRT-Edge-LLM", runs: ["edge"], tech: ["fm"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "modelopt", name: "NVIDIA Model Optimizer", what: "PTQ/QAT/QAD, NVFP4/FP8/INT8, sparsity, distillation; ONNX autotune", maker: "NVIDIA", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Producing quantized checkpoints/ONNX for TensorRT", limitations: "Best on NVIDIA targets", release: "2026-09-23", version: "0.47.0", link: "https://github.com/NVIDIA/Model-Optimizer/releases", runs: ["cloud", "edge"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "ort", name: "ONNX Runtime", what: "Cross-platform inference runtime with CUDA, TensorRT, CPU, WebGPU execution providers", maker: "Microsoft", open: "open", license: "MIT", maturity: "production", best_for: "Portable deployment; CPU fallback; mixed hardware fleets", limitations: "Peak Jetson latency below hand-built TRT engines", release: "2026-09-10", version: "1.30.0", link: "https://github.com/microsoft/onnxruntime/releases", runs: ["edge"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "executorch", name: "ExecuTorch", what: "PyTorch on-device runtime with CUDA, Core ML, OpenVINO, Qualcomm, Arm/Ethos-U delegates", maker: "Meta / PyTorch", open: "open", license: "BSD-3-Clause", maturity: "production", best_for: "Non-NVIDIA edge targets (Qualcomm, Arm MCUs) from PyTorch", limitations: "Operator coverage for large VLAs still growing", release: "2026-09-23", version: "1.5.1", link: "https://github.com/pytorch/executorch/releases", runs: ["edge"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "openvino", name: "OpenVINO", what: "Intel inference toolkit (CPU, iGPU, NPU)", maker: "Intel", open: "open", license: "Apache-2.0", maturity: "production", best_for: "Intel Core Ultra-based robot computers; Intel's π0.5 + RTC reference pipelines", limitations: "Intel hardware only", release: "2026-10-01", version: "2026.4.1", link: "https://github.com/openvinotoolkit/openvino/releases", runs: ["edge"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "jetpack", name: "JetPack 7.x", what: "Jetson OS + CUDA/TensorRT stack (JetPack 7.1: Jetson Linux 38.4, kernel 6.8, Ubuntu 24.04)", maker: "NVIDIA", open: "mixed", license: "NVIDIA terms + open-source components", maturity: "production", best_for: "Base image for Thor / T4000 (GR00T N1.7 docs reference 7.2)", limitations: "Pin versions per fleet; upgrades invalidate engines", release: "2026-01-12", version: "7.1 (7.2 referenced by GR00T)", link: "https://jetsonhacks.com/2026/01/12/jetpack-7-1-and-jetson-t4000-now-available/", runs: ["edge"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "vla-pruner", name: "VLA-Pruner", what: "Plug-and-play visual token pruning using semantic and action relevance", maker: "Academic", open: "open", license: "See paper", maturity: "research", best_for: "Up to 1.99× speed-up with comparable success", limitations: "Task-dependent; risk of pruning small targets", release: "2025-11", version: "arXiv 2511.16449", link: "https://arxiv.org/html/2511.16449v4", runs: ["edge"], tech: ["fm"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "lerobot-async-11", name: "LeRobot async inference", what: "PolicyServer / RobotClient decoupling prediction and execution", maker: "Hugging Face", open: "open", license: "Apache-2.0", maturity: "pilot", best_for: "Open async/chunk-threshold execution; on-robot or over network", limitations: "Python/gRPC; not hard real-time", release: "2026-08-03", version: "lerobot 0.6.1", link: "https://huggingface.co/docs/lerobot/main/async", runs: ["edge", "robot"], tech: ["il"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null }
  ],
  where: {
    cloud: { l: 2, n: "build farms, QAT/QAD, calibration" },
    onprem: { l: 1, n: "workcell inference servers" },
    sim: { l: 1, n: "closed-loop parity tests" },
    edge: { l: 3, n: "the deployment target" },
    robot: { l: 2, n: "power/thermal envelope" }
  },
  tech: {
    il: { l: 2, n: "compresses IL policies" },
    rl: { l: 1, n: "small RL controllers to ONNX" },
    classical: { l: 1, n: "timing contracts with control" },
    sim2real: { l: 0, n: "" },
    real2sim: { l: 0, n: "" },
    real2sim2real: { l: 0, n: "" },
    fm: { l: 3, n: "foundation models dominate cost" },
    wam: { l: 2, n: "WAM efficiency is the deployment blocker" },
    icl: { l: 1, n: "context length costs latency" }
  },
  stacks: {
    open: { title: "Open stack", items: [
      "PyTorch → ONNX (or torch.export) → TensorRT 11 in a pinned build container; Model Optimizer for FP8/NVFP4/INT8",
      "TensorRT Edge-LLM for transformer backbones (π0.5 supported); ONNX Runtime as portable fallback",
      "LeRobot async inference or custom action server with RTC",
      "Parity harness: replay logged observations through PyTorch and engine; compare actions per dim; closed-loop sim check"
    ], note: "Build engines in CI (e.g. GitLab runners on Jetson) and store them in an artifact registry with the manifest." },
    industry: { title: "Industry (public)", items: [
      "NVIDIA reference: GR00T N1.7 at ≈ 40 ms on Thor with NVFP4; Cosmos 3 Edge announced for on-device world models",
      "Figure Helix: onboard embedded GPUs with S1 at 200 Hz and S0 at ~1 kHz (closed details)",
      "Cloud reasoning + onboard control splits (1X with OpenAI planning models; Gemini Robotics-ER via API, On-Device VLA)",
      "Qualcomm Dragonwing IQ10 as a non-NVIDIA option from Sep 2026"
    ], note: "Most companies do not publish latency budgets." }
  },
  example: {
    summary: "MB-1 runs on a Jetson AGX Thor T5000 at the 120 W mode with JetPack 7.1. The GR00T N1.7-based policy is split into three TensorRT engines: SigLIP-class vision encoder (FP8, 3 images + 4 tactile crops), Cosmos-Reason2-2B backbone (NVFP4 weights/activations, FP8 KV cache), and the DiT action head with the force-fusion module (FP16, 4 flow steps after distillation from 8). Inference runs asynchronously; RTC freezes the first 6 actions (≈ 120 ms) of each new chunk.",
    artifacts: [
      { artifact: "Latency budget (design target)", format: "Table", shape: "capture+preproc 8 ms · vision 12 ms · backbone prefill 18 ms · action head 4×4 ms = 16 ms · post 2 ms ⇒ ≈ 56 ms p50 / ≤ 90 ms p99", consumer: "[[s:09]] RTC freeze window, [[s:12]] alerts" },
      { artifact: "Engines", format: "`vision_fp8.engine`, `backbone_nvfp4.engine`, `head_fp16.engine`", shape: "≈ 0.4 + 1.5 + 0.6 GB; built with TensorRT 11.x in container `trt-build@sha256:…`", consumer: "[[s:12]] runtime" },
      { artifact: "Parity report", format: "JSON", shape: "action L2 error p99 = 0.9 % of range; per-subtask closed-loop sim success within −0.5 pp", consumer: "[[s:10]] gate" },
      { artifact: "`manifest.json`", format: "JSON", shape: "{ckpt: mb1-gr00t17-ft@41, data: mb1-connectors@2026.09.3, jetpack: 7.1, l4t: 38.4, trt: 11.x, cuda: 13.x, precisions: {...}, calib_hash, stats_hash, build_digest}", consumer: "[[s:12]] artifact registry" }
    ],
    humanoid: "H-1 has two very different inference loads on the same Thor: the whole-body tracking policy (tens of millions of parameters, ONNX/TensorRT, < 1 ms per step, 50 Hz, must never be starved) and the VLA (seconds-scale budget per chunk, 10–25 Hz). The tracking policy gets a dedicated CUDA stream / priority (or runs on the CPU/DLA), so a slow VLA chunk can never delay balance control."
  },
  pitfalls: [
    { t: "Calibrating quantization on the wrong data", d: "Calibration batches from a different site, lighting or camera set bias activations; use recent deployment logs." },
    { t: "Testing parity open-loop only", d: "Small per-step action errors compound in closed loop; always run closed-loop sim or real checks after compression." },
    { t: "Quantizing the action head first", d: "The head and its denoising loop are the most precision-sensitive; start with vision and backbone." },
    { t: "Unpinned JetPack / TensorRT", d: "An OTA OS update invalidates engines or changes numerics; pin versions and rebuild deliberately (your reproducibility concern)." },
    { t: "GPU memory overflow from co-resident models", d: "Perception, VLA, monitors and logging share unified memory on Jetson; set hard memory limits per process and test peak, not average." },
    { t: "Thermal throttling in enclosures", d: "Latency budgets measured on an open dev kit fail in a sealed robot torso; profile at the real power mode and ambient temperature." }
  ],
  numbers: [
    { m: "GR00T N1.7 on Thor", v: "≈ 40 ms e2e (25 Hz) NVFP4; 125 ms baseline (3.1×); FP8 ≈ 44 ms", s: "[Jetson AI Lab](https://www.jetson-ai-lab.com/tutorials/groot_n17_on_thor/)" },
    { m: "TRT Edge-LLM on Thor", v: "Qwen3.6-27B at 52.33 tok/s; NVFP4 W/A, FP8 KV; ~96 % prompt tokens from hot cache", s: "[NVIDIA blog](https://developer.nvidia.com/blog/tensorrt-edge-llm-completes-the-mlperf-edge-agentic-benchmark-6-4x-faster-on-jetson-agx-thor/)" },
    { m: "Token pruning", v: "up to 1.99× (VLA-Pruner)", s: "[arXiv 2511.16449](https://arxiv.org/html/2511.16449v4)" },
    { m: "Async inference", v: "9.7 s vs 13.75 s task time (≈ 30 % faster)", s: "[LeRobot async](https://huggingface.co/docs/lerobot/main/async)" },
    { m: "Thor T5000 / T4000", v: "2070 / 1200 FP4 sparse TFLOPS; 128 / 64 GB; 40–130 / 40–70 W", s: "[NVIDIA forum](https://forums.developer.nvidia.com/t/nvidia-jetson-t4000-and-nvidia-jetpack-7-1-now-available-accelerate-ai-inference-for-edge-and-robotics/356852)" },
    { m: "openpi inference memory", v: "> 8 GB GPU", s: "[openpi](https://github.com/Physical-Intelligence/openpi)" }
  ],
  papers: [
    { title: "Real-Time Execution of Action Chunking Flow Policies (RTC)", year: "2025", venue: "arXiv 2506.07339", url: "https://arxiv.org/html/2506.07339v2", why: "Latency hiding for chunked flow policies without retraining." },
    { title: "SmolVLA: compact VLA with asynchronous inference", year: "2025", venue: "arXiv 2506.01844", url: "https://arxiv.org/abs/2506.01844", why: "Small model + async stack; measured task-time gains." },
    { title: "Bridging the Semantic-Action Gap in Visual Token Pruning (VLA-Pruner)", year: "2025", venue: "arXiv 2511.16449", url: "https://arxiv.org/html/2511.16449v4", why: "Token pruning designed for action relevance." },
    { title: "Jetson-PI: Onboard Real-Time Robot Control via Foresight-Aligned Asynchronous Inference", year: "2026", venue: "arXiv 2607.12659", url: "https://arxiv.org/pdf/2607.12659", why: "On-board async inference design for π-class models." },
    { title: "When Faster VLA Deployment Changes Closed-Loop Behavior (SmolVLA PyTorch vs ONNX)", year: "2026", venue: "arXiv 2609.14146", url: "https://arxiv.org/pdf/2609.14146", why: "Evidence that runtime changes alter task success, not just latency." },
    { title: "TensorRT Edge-LLM MLPerf on Jetson AGX Thor", year: "2026", venue: "NVIDIA", url: "https://developer.nvidia.com/blog/tensorrt-edge-llm-completes-the-mlperf-edge-agentic-benchmark-6-4x-faster-on-jetson-agx-thor/", why: "Current edge precision recipe (NVFP4 + FP8 KV)." }
  ],
  open_problems: [
    "Running pixel-space world-action models within edge budgets (or proving latent WAMs keep their benefits).",
    "Quantization methods with guarantees on closed-loop behaviour, not just per-step error.",
    "Export of dynamic denoising and variable-token graphs without hand-written engines.",
    "Scheduling multiple learned models (WBC, VLA, monitors, perception) on one SoC with real-time guarantees."
  ],
  self_check: [
    { q: "Your FP8 engine matches the PyTorch model within 1 % per action but closed-loop success drops 6 pp. Explain and fix.", a: "Small systematic biases (e.g. in gripper or rotation dims) accumulate in closed loop, or the error concentrates in rare states (contact) that average metrics hide. Inspect per-dimension and per-subtask errors, keep the action head in FP16, use QAD, recalibrate with contact-phase data, and gate on closed-loop eval, not open-loop parity." },
    { q: "With async inference and RTC, what is the hard constraint on latency, and what consumes the latency profile?", a: "p99 inference latency must be below the executed horizon (the actions of the current chunk that remain when inference starts), and RTC must freeze actions within the expected delay. The action server ([[s:09]]) uses the profile to set the freeze window and trigger threshold; telemetry ([[s:12]]) alerts on p99 drift." },
    { q: "Why must the manifest pin JetPack, TensorRT and calibration hashes, and who enforces it?", a: "Engines are built for a specific TensorRT version and GPU; calibration determines quantization scales; any change can alter numerics. The deployment system ([[s:12]]) refuses to load an engine whose manifest does not match the robot image, and incident triage uses the manifest to reproduce behaviour." },
    { q: "When is off-board inference over the workcell network the better design?", a: "When the model cannot fit or meet latency on board (WAMs, large planners), the network is wired or private 5G with bounded p99, the policy tolerates the added latency through chunking/RTC, and onboard fallbacks keep the robot safe and able to stop or finish the current motion on link loss." },
    { q: "How would you apply your 2:4 sparsity workflow to a VLA, and where would you expect gains?", a: "Prune the vision encoder and backbone linear layers in iterative prune → fine-tune cycles with the robot data mixture (plus web data to protect semantics), skip the action head initially, rebuild TensorRT engines with sparsity enabled, and measure per-module latency. Gains appear in compute-bound GEMMs (prefill on many image tokens); memory-bound decode and small heads benefit little." }
  ]
};
