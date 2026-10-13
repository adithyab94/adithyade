/* meta.js — site registry, version, verification dates, changelog.
   Loaded first on every page. Schema documented in MAINTENANCE.md. */
window.PAI = window.PAI || {};
PAI.meta = {
  site: "Physical AI Systems Map",
  version: "1.0.0",
  released: "2026-10-07",
  last_verified: "2026-10-07",
  research_window: "2025-04 to 2026-10",

  /* Ordered pipeline. `file` is relative to site root. */
  stages: [
    { id: "stage-00", num: "00", short: "Problem & embodiment", title: "Problem definition & embodiment", file: "stages/00-problem-definition.html" },
    { id: "stage-01", num: "01", short: "Hardware & sensing", title: "Hardware, sensing & middleware", file: "stages/01-hardware-sensing.html" },
    { id: "stage-02", num: "02", short: "Data collection", title: "Data collection", file: "stages/02-data-collection.html" },
    { id: "stage-03", num: "03", short: "Data infrastructure", title: "Data infrastructure (cloud)", file: "stages/03-data-infrastructure.html" },
    { id: "stage-04", num: "04", short: "Curation & annotation", title: "Curation & annotation per modality", file: "stages/04-curation-annotation.html" },
    { id: "stage-05", num: "05", short: "Simulation & synthetic", title: "Simulation & synthetic data", file: "stages/05-simulation-synthetic.html" },
    { id: "stage-06", num: "06", short: "Sim ↔ Real", title: "Sim ↔ Real transfer", file: "stages/06-sim-real-transfer.html" },
    { id: "stage-07", num: "07", short: "Models & training", title: "Model architectures & training", file: "stages/07-models-training.html" },
    { id: "stage-08", num: "08", short: "Reinforcement learning", title: "Reinforcement learning: where it fits", file: "stages/08-reinforcement-learning.html" },
    { id: "stage-09", num: "09", short: "Classical control", title: "Classical robotics & control", file: "stages/09-classical-control.html" },
    { id: "stage-10", num: "10", short: "Evaluation", title: "Evaluation", file: "stages/10-evaluation.html" },
    { id: "stage-11", num: "11", short: "Edge inference", title: "Optimization & edge inference", file: "stages/11-edge-inference.html" },
    { id: "stage-12", num: "12", short: "Deployment & fleet", title: "Deployment, edge ops, fleet & telemetry", file: "stages/12-deployment-fleet.html" },
    { id: "stage-13", num: "13", short: "Data flywheel", title: "Data flywheel & continual learning", file: "stages/13-data-flywheel.html" },
    { id: "stage-14", num: "14", short: "Safety & regulation", title: "Safety, standards & regulation", file: "stages/14-safety-regulation.html" }
  ],

  views: [
    { id: "view-traces", short: "Running example trace", title: "End-to-end traces", file: "views/traces.html",
      desc: "Bimanual connector-mating robot and humanoid tote handler traced through all 15 stages: artifacts, shapes, topics, rates at every hand-off.",
      keywords: "running example trace artifacts topics tensor shapes hand-off humanoid MB-1 H-1" },
    { id: "view-matrix", short: "What goes where", title: "What goes where", file: "views/what-goes-where.html",
      desc: "Stages × {Cloud, Sim, Edge, RL, IL, Classical, Sim2Real, Real2Sim, WAM / world model, ICL}, computed from the stage data files.",
      keywords: "matrix cloud sim edge rl il classical sim2real real2sim wam icl where" },
    { id: "view-modality", short: "Modality × annotation", title: "Modality × annotation matrix", file: "views/modality-annotation.html",
      desc: "For each sensor modality: what gets labelled, how, with which tools, stored in which format.",
      keywords: "annotation labels modality rgb depth point cloud tactile force torque proprioception audio language actions format" },
    { id: "view-runtime", short: "Runtime architecture", title: "On-robot runtime architecture", file: "views/runtime-architecture.html",
      desc: "Every on-robot process with rate, compute target, learned vs classical, and the safety layer.",
      keywords: "runtime processes rates hz compute thor rt safety plc impedance whole-body controller action chunk" },
    { id: "view-paradigms", short: "Paradigm comparison", title: "Paradigm comparison", file: "views/paradigms.html",
      desc: "VLA vs WAM vs diffusion policy vs RL policy vs classical pipeline: inputs, outputs, data, compute, strengths, failures, when to pick.",
      keywords: "vla wam diffusion policy rl classical compare paradigm world action model" },
    { id: "view-architectures", short: "Reference architectures", title: "Reference architectures", file: "views/reference-architectures.html",
      desc: "Three end-to-end stacks: solo / low-budget open source, startup, large-scale industry.",
      keywords: "reference architecture stack solo startup industry budget" },
    { id: "view-frontier", short: "Frontier", title: "Frontier scan", file: "views/frontier.html",
      desc: "Concepts and methods that became important between 2025-04 and 2026-10, placed in the pipeline with a breakthrough / incremental verdict.",
      keywords: "frontier wam world action model icl latent action rl recap scaling laws timeline breakthrough" },
    { id: "view-roadmap", short: "Learning roadmap", title: "Learning roadmap", file: "views/roadmap.html",
      desc: "Ordered hands-on projects that build up to the full pipeline.",
      keywords: "roadmap projects learning hands-on curriculum" },
    { id: "view-selftest", short: "Capstone self-test", title: "Capstone self-test", file: "views/self-test.html",
      desc: "20 system-design questions with model answers.",
      keywords: "self test capstone questions system design interview" },
    { id: "view-glossary", short: "Glossary", title: "Glossary", file: "views/glossary.html",
      desc: "Terms with cross-links to stages and frontier items.",
      keywords: "glossary terms definitions" }
  ],

  /* Every data file; search loads these on demand via <script> injection (file:// safe). */
  dataFiles: [
    "data/stage-00.js", "data/stage-01.js", "data/stage-02.js", "data/stage-03.js", "data/stage-04.js",
    "data/stage-05.js", "data/stage-06.js", "data/stage-07.js", "data/stage-08.js", "data/stage-09.js",
    "data/stage-10.js", "data/stage-11.js", "data/stage-12.js", "data/stage-13.js", "data/stage-14.js",
    "data/frontier.js", "data/glossary.js", "data/views.js", "data/roadmap.js", "data/capstone.js"
  ],

  /* Tag vocabulary. `group` drives filter logic: OR inside a group, AND across groups. */
  tagDefs: {
    cloud:        { label: "Cloud", group: "where" },
    onprem:       { label: "On-prem", group: "where" },
    sim:          { label: "Sim", group: "where" },
    edge:         { label: "Edge", group: "where" },
    robot:        { label: "Robot", group: "where" },
    il:           { label: "IL", group: "tech" },
    rl:           { label: "RL", group: "tech" },
    classical:    { label: "Classical", group: "tech" },
    sim2real:     { label: "Sim2Real", group: "tech" },
    real2sim:     { label: "Real2Sim", group: "tech" },
    real2sim2real:{ label: "Real2Sim2Real", group: "tech" },
    fm:           { label: "Foundation model", group: "tech" },
    wam:          { label: "WAM / world model", group: "tech" },
    icl:          { label: "ICL", group: "tech" }
  },

  /* Filter chips shown in the top bar. */
  filterChips: [
    { key: "cloud", label: "Cloud", group: "where" },
    { key: "sim", label: "Sim", group: "where" },
    { key: "edge", label: "Edge", group: "where" },
    { key: "rl", label: "RL", group: "tech" },
    { key: "il", label: "IL", group: "tech" },
    { key: "classical", label: "Classical", group: "tech" },
    { key: "frontier", label: "Frontier", group: "frontier" },
    { key: "open", label: "Open-source only", group: "open" }
  ],

  changelog: [
    { date: "2026-10-07", version: "1.0.0", stage: "all",
      change: "Initial release: 15 stages, 10 integration views, frontier scan covering 2025-04 to 2026-10.",
      why: "First build.",
      source: "See sources.md" }
  ]
};
