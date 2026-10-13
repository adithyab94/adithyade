/* Stage 14 — Safety, standards & regulation. Schema: MAINTENANCE.md
   Not legal advice: dates and obligations summarized from public sources listed per entry. */
window.PAI = window.PAI || {}; PAI.stages = PAI.stages || {};
PAI.stages["stage-14"] = {
  id: "stage-14", num: "14", title: "Safety, standards & regulation", short: "Safety & regulation",
  version: "1.0.0", last_verified: "2026-10-07",
  upstream: [
    { id: "stage-00", what: "intended use, embodiment, hazard list" },
    { id: "stage-09", what: "safety functions, limits, filters and their performance" },
    { id: "stage-10", what: "validation evidence incl. safety metrics" },
    { id: "stage-12", what: "incident records, post-market monitoring, change logs" },
    { id: "stage-03", what: "data governance records (provenance, consent, licences)" }
  ],
  downstream: [
    { id: "stage-00", what: "constraints on embodiment, speeds, forces, sensors (feedback)" },
    { id: "stage-12", what: "approved configuration envelope; change-management rules" },
    { id: "stage-02", what: "privacy and consent rules for data collection" }
  ],
  handoff_short: "Risk assessment, safety requirements spec, safety case, technical file / declaration of conformity, change-management rules",
  purpose: "Make a learned robot acceptable to deploy: identify hazards, put safety functions where they can be certified, constrain and monitor learned behaviour, and meet the standards and laws of the target market. In the EU the regulatory clock is concrete: Machinery Regulation from 20 January 2027, Cyber Resilience Act reporting since 11 September 2026, new Product Liability Directive from 9 December 2026, AI Act high-risk duties for machinery from 2 August 2028.",
  interface: {
    inputs: [
      { name: "Intended use & hazards", format: "ISO 12100-style risk assessment inputs", rate: "Per product / major change", from: "[[s:00]]" },
      { name: "Safety-function design", format: "Architecture, performance levels, validation plans", rate: "Per hardware / controller revision", from: "[[s:09]]" },
      { name: "Evidence", format: "Eval reports, safety metrics, incident data, logs", rate: "Per release + continuous", from: "[[s:10]], [[s:12]]" }
    ],
    outputs: [
      { name: "Risk assessment", format: "Hazard log with risk estimates and reduction measures", rate: "Versioned", to: "All stages" },
      { name: "Safety requirements & case", format: "Safety functions with PL/SIL, structured argument (e.g. GSN) with evidence links", rate: "Versioned per release", to: "Certification bodies, [[s:12]]" },
      { name: "Technical documentation", format: "Technical file, EU declaration of conformity, AI Act documentation where applicable", rate: "Per product version", to: "Market surveillance, customers" },
      { name: "Change rules", format: "Which changes (data, model, config, OS) need re-validation or re-assessment", rate: "Versioned", to: "[[s:12]], [[s:13]]" }
    ],
    handoff: "The safety case scopes **what is allowed to change** without re-assessment. Continuous learning collides with conformity assessment: a new policy version is a change to a product whose safety may depend on it. Design the boundary so that safety does not depend on the learned policy (certified safety functions limit consequences), then define which model updates are 'within envelope' (validated by the gate in [[s:10]]) and which trigger re-assessment."
  },
  mental_model: "Put the safety boundary outside the learned components. The policy proposes motions; certified safety functions (speed and separation monitoring, power and force limiting, safe stops, safely limited speed, fall management) bound the consequences regardless of what the policy does. Regulation then asks you to document, monitor and manage the learned part as a high-risk component, not to certify the neural network as a safety function.",
  mental_detail: "Functional-safety standards (ISO 13849-1, IEC 62061 on top of IEC 61508) assume deterministic, analysable components with quantified failure rates; a VLA is neither. Practical architectures therefore keep certified safety functions on safety-rated hardware and treat the learned policy as non-safety-rated control whose hazards are mitigated by those functions. ISO 10218-1/-2:2025 folded the collaborative-robot requirements of ISO/TS 15066 into Part 2, added robot classes with matching functional-safety requirements, and introduced cybersecurity as it affects safety. Dynamically stable robots (humanoids, quadrupeds, balancing bases) have no statically safe state, which is why ISO/CD 25785-1 is being drafted (committee draft; working group led by a US delegation including A3, Agility Robotics and Boston Dynamics).\n\nThe EU Machinery Regulation (EU) 2023/1230 explicitly addresses AI and self-evolving behaviour and the corruption of safety functions (cybersecurity), with digital documentation and 10-year retention. The AI Act (EU) 2024/1689, as amended by the Digital Omnibus (in force 27 July 2026), moves high-risk obligations for AI embedded in regulated products such as machinery to 2 August 2028 and stand-alone Annex III systems to 2 December 2027; prohibitions, GPAI duties and Article 50 transparency keep their original dates. The Cyber Resilience Act's vulnerability and incident reporting applies from 11 September 2026, full application 11 December 2027; the revised Product Liability Directive treats software, including AI, as a product from 9 December 2026.",
  methods: [
    { id: "risk", name: "Risk assessment for learned behaviour", tags: ["classical"],
      summary: "Follow the ISO 12100 process (limits of the machine, hazard identification, risk estimation and evaluation, risk reduction) and extend hazard identification to learned-behaviour failure modes: wrong object, wrong force, unexpected motion after distribution shift, unsafe instruction following, degraded perception, latency spikes, monitor false negatives. Tie each hazard to a mitigation outside the policy where possible.",
      pros: "Gives a complete hazard log that regulators recognize.", cons: "Learned failure modes are open-ended; the operational design domain must be explicit." },
    { id: "functional-safety", name: "Functional safety architecture", tags: ["classical"],
      summary: "Implement safety functions (protective stop, safe torque off, safely limited speed/position, speed and separation monitoring with safety-rated scanners, power and force limiting) on certified hardware with required performance levels (ISO 13849-1 PL / IEC 62061 SIL). Robot classes and collaborative requirements per ISO 10218-1/-2:2025; US equivalent ANSI/A3 R15.06-2025. Keep them independent of the policy computer.",
      pros: "Certifiable today; bounds the consequences of any policy error.", cons: "Conservative limits reduce speed and payload; collaboration limits constrain cycle times." ,
      refs: [{ t: "ISO 10218 FAQ (A3)", u: "https://www.automate.org/robotics/blogs/updated-iso-10218-faq" }] },
    { id: "humanoid-safety", name: "Dynamically stable robots (humanoids)", tags: ["classical", "rl"],
      summary: "Without a static safe state, stopping can mean falling. Required: fall detection and controlled-collapse behaviours, safe states (sit, kneel, lean on fixture), protective stop categories that preserve balance, exclusion zones during operation, and validation of learned whole-body controllers under perturbations. ISO/CD 25785-1 targets these 'industrial mobile robots with actively controlled stability'.",
      pros: "Addresses the hazard class that blocks humanoid deployments near people.", cons: "Standard still a committee draft; most evidence comes from company pilots." ,
      refs: [{ t: "ISO/CD 25785-1", u: "https://www.iso.org/standard/91469.html" }, { t: "Explainer", u: "https://www.i-scoop.eu/iso-25785-1-explained-and-what-it-means-for-humanoid-robot-safety/" }] },
    { id: "guardrails", name: "Guardrails for learned policies", tags: ["classical", "fm"],
      summary: "Layered, non-certified risk reduction around the policy: action and workspace limits, control-barrier-function filters (incl. perception-driven filters such as attention-guided CBFs around VLAs), runtime failure monitors (FIPER, value stalls), semantic safety for language-conditioned robots (ASIMOV benchmark: 500k situations / 3M instructions; generated constitutions reached 84.3 % alignment), human oversight and remote stop, and a defined operational design domain with checks before acting.",
      pros: "Reduces frequency of hazardous situations; supports AI Act robustness and oversight duties.", cons: "Not a substitute for certified safety functions; filters and monitors have their own failure modes." },
    { id: "eu-ai-act", name: "EU AI Act obligations (with Digital Omnibus)", tags: ["cloud"],
      summary: "AI that is a safety component of machinery (Annex I product legislation) is high-risk: risk management, data governance, technical documentation, automatic logging, transparency to deployers, human oversight, accuracy/robustness/cybersecurity, quality management, post-market monitoring and serious-incident reporting. Dates after the Digital Omnibus (EP approval 16 Jun 2026, Council 29 Jun, in force 27 Jul 2026): Annex I high-risk from **2 Aug 2028**, Annex III from **2 Dec 2027**; GPAI obligations (since Aug 2025), prohibitions (since Feb 2025) and Art. 50 transparency (Aug 2026) unchanged. Whether a given robot foundation model is a 'general-purpose AI model' is a legal question to assess case by case.",
      pros: "Clear checklist that maps onto good engineering practice (data cards, logging, monitoring).", cons: "Harmonised standards still in development; interplay with Machinery Regulation conformity assessment is complex." ,
      refs: [{ t: "Gibson Dunn on the Omnibus", u: "https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/" }] },
    { id: "machinery-reg", name: "EU Machinery Regulation (EU) 2023/1230", tags: ["classical"],
      summary: "Applies from **20 January 2027**, replacing the Machinery Directive. New: requirements on AI and self-evolving behaviour in control systems, protection of safety functions against corruption (cybersecurity), digital instructions and documentation, 10-year retention. Harmonised standards are being updated (new EN publications before the deadline carry Annexes for both the Directive and the Regulation); ISO 10218-1/-2:2025 is the current robot standard set (check OJ citation status).",
      pros: "Single EU framework for machinery including autonomous mobile machinery.", cons: "Some ML-based safety components and machinery embedding them face mandatory third-party conformity assessment; standards lag the law." ,
      refs: [{ t: "Status of harmonised standards", u: "https://www.ibf-solutions.com/en/seminars-and-news/news/new-machinery-regulation-status-of-harmonised-standards" }, { t: "Baker McKenzie overview", u: "https://www.bakermckenzie.com/en/insight/publications/resources/product-risk-radar-articles/machinery-regulation" }] },
    { id: "cyber-liability", name: "Cybersecurity & liability (CRA, PLD)", tags: ["cloud", "edge"],
      summary: "Cyber Resilience Act (EU) 2024/2847: reporting of actively exploited vulnerabilities and severe incidents to ENISA's platform since **11 Sep 2026**, full requirements (secure by design, SBOMs, vulnerability handling, support period) from **11 Dec 2027**; connected robots and their software are in scope. Product Liability Directive (EU) 2024/2853: from **9 Dec 2026** software and AI are 'products'; defects can arise from updates or learning after placing on the market.",
      pros: "Forces OTA security, SBOMs and incident processes that fleets need anyway.", cons: "Liability exposure for continuously updated policies; documentation burden." ,
      refs: [{ t: "CMS: CRA for robot manufacturers", u: "https://cms.law/en/deu/legal-updates/cyber-resilience-act-new-obligations-for-robot-manufacturers" }, { t: "PLD overview", u: "https://connections.nortonrosefulbright.com/post/102jpjp/revised-product-liability-directive-introducing-rules-on-strict-liability-for-ai" }] },
    { id: "safety-case", name: "Safety case, change management & post-market monitoring", tags: ["cloud"],
      summary: "Structured argument that residual risk is acceptable, with evidence from [[s:09]] (safety functions), [[s:10]] (validation incl. scenario libraries), [[s:12]] (monitoring, incidents). Define a change-impact process: which model, data or configuration changes stay inside the validated envelope and which require re-assessment; keep logs and versions to support incident investigation and regulatory reporting.",
      pros: "Makes continuous learning compatible with certification.", cons: "Requires organizational discipline across all stages." }
  ],
  extras: [
    { title: "EU regulatory timeline for robots with learned components", note: "Summary of public sources (Oct 2026). Not legal advice.",
      columns: ["Date", "Instrument", "What applies"],
      rows: [
        ["2 Feb 2025", "AI Act", "Prohibited practices; AI literacy"],
        ["2 Aug 2025", "AI Act", "General-purpose AI model obligations"],
        ["2 Aug 2026", "AI Act", "Article 50 transparency obligations (unchanged by Omnibus)"],
        ["27 Jul 2026", "Digital Omnibus on AI", "Entered into force; postpones high-risk deadlines"],
        ["11 Sep 2026", "Cyber Resilience Act", "Reporting of actively exploited vulnerabilities and severe incidents"],
        ["9 Dec 2026", "Product Liability Directive 2024/2853", "Software and AI are products; new rules applicable"],
        ["20 Jan 2027", "Machinery Regulation 2023/1230", "Applies (replaces Machinery Directive 2006/42/EC)"],
        ["2 Dec 2027", "AI Act (amended)", "High-risk obligations for stand-alone Annex III systems"],
        ["11 Dec 2027", "Cyber Resilience Act", "Full application"],
        ["2 Aug 2028", "AI Act (amended)", "High-risk obligations for AI in Annex I products (machinery, etc.)"]
      ] },
    { title: "Standards map", note: "Status as found Oct 2026.",
      columns: ["Standard", "Scope", "Status"],
      rows: [
        ["ISO 10218-1:2025 / -2:2025", "Industrial robots / robot applications and cells; includes former ISO/TS 15066 collaborative content; cybersecurity", "Published Feb 2025"],
        ["ISO/TS 15066:2016", "Collaborative robots (power and force limiting)", "Superseded: content absorbed into ISO 10218-2:2025"],
        ["ANSI/A3 R15.06-2025", "US adoption of industrial robot safety (Parts 1, 2; Part 3 planned)", "Published Sep 2025"],
        ["ISO/CD 25785-1", "Industrial mobile robots with actively controlled stability (humanoids, quadrupeds)", "Committee draft"],
        ["ISO 13482:2014", "Personal care robots", "In force; service-robot landscape has outgrown it"],
        ["ISO 13849-1 / IEC 62061 / IEC 61508", "Functional safety of control systems (PL / SIL)", "In force (IEC 61508 ed. 2010)"],
        ["ISO 12100", "Risk assessment and risk reduction principles", "In force"],
        ["ISO 3691-4", "Driverless industrial trucks / AMRs", "In force"]
      ] }
  ],
  decision: [
    { "if": "Learned policy controls a robot near people", use: "Certified safety functions (SSM or PFL per ISO 10218-2:2025) independent of the policy + guardrails + monitors", why: "The policy cannot be certified as a safety function today." },
    { "if": "Humanoid in a facility", use: "Exclusion zones or supervised operation until ISO 25785-1-class requirements mature; fall management as a designed function", why: "No static safe state; standard still in draft." },
    { "if": "Placing machinery with ML on the EU market after 20 Jan 2027", use: "Conformity under the Machinery Regulation; check if third-party assessment is required for ML-based safety components", why: "Explicit AI / self-evolving behaviour requirements." },
    { "if": "AI is a safety component of a regulated product", use: "Plan AI Act high-risk documentation, logging, oversight and QMS for 2 Aug 2028 (Annex I)", why: "Omnibus moved the date but not the obligations." },
    { "if": "Connected fleet with OTA", use: "CRA processes now: vulnerability handling, ENISA reporting, SBOMs; secure OTA", why: "Reporting obligations apply since 11 Sep 2026." },
    { "if": "Language-conditioned robot", use: "Semantic-safety evaluation and refusal policies (ASIMOV-style), constitution or rule layer", why: "Instructions themselves can be hazardous." }
  ],
  tools: [
    { id: "ai-act", name: "EU AI Act (EU) 2024/1689", what: "Horizontal AI regulation; high-risk duties for AI safety components of machinery", maker: "European Union", open: "open", license: "Public law", maturity: "production", best_for: "Compliance planning for AI-enabled robots in the EU", limitations: "Harmonised standards pending; dates amended by Omnibus", release: "2024-08-01", version: "in force; amended Jul 2026", link: "https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/", runs: ["cloud"], tech: ["fm"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "omnibus", name: "Digital Omnibus on AI", what: "Amends AI Act timelines: Annex III high-risk → 2 Dec 2027; Annex I → 2 Aug 2028", maker: "European Union", open: "open", license: "Public law", maturity: "production", best_for: "Current AI Act dates", limitations: "Does not change GPAI, prohibitions, Art. 50", release: "2026-07-27", version: "entered into force", link: "https://secureprivacy.ai/blog/eu-ai-act-digital-omnibus-the-new-high-risk-ai-deadlines-after-council-approval", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "machinery-regulation", name: "Machinery Regulation (EU) 2023/1230", what: "EU machinery safety law incl. AI / self-evolving behaviour and cybersecurity of safety functions", maker: "European Union", open: "open", license: "Public law", maturity: "pilot", best_for: "CE conformity of robots from 2027", limitations: "Harmonised standards still being updated", release: "2027-01-20", version: "applies from 20 Jan 2027", link: "https://www.ibf-solutions.com/en/seminars-and-news/news/new-machinery-regulation-status-of-harmonised-standards", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "machinery-directive", name: "Machinery Directive 2006/42/EC", what: "Previous EU machinery law", maker: "European Union", open: "open", license: "Public law", maturity: "production", best_for: "Products placed on the market until 19 Jan 2027", limitations: "Replaced by Regulation 2023/1230", release: null, version: "until 19 Jan 2027", release_note: "being replaced", link: "https://cema-agri.org/publication/news/1025-the-new-machinery-regulation-is-published-new-requirements-and-upcoming-steps", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "superseded", superseded_by: "Machinery Regulation (EU) 2023/1230" },
    { id: "cra", name: "Cyber Resilience Act (EU) 2024/2847", what: "Cybersecurity requirements for products with digital elements", maker: "European Union", open: "open", license: "Public law", maturity: "production", best_for: "Connected robots, OTA, vulnerability handling", limitations: "Full requirements from Dec 2027", release: "2026-09-11", version: "reporting obligations apply", link: "https://cms.law/en/deu/legal-updates/cyber-resilience-act-new-obligations-for-robot-manufacturers", runs: ["edge", "cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "pld", name: "Product Liability Directive (EU) 2024/2853", what: "Strict liability incl. software and AI as products", maker: "European Union", open: "open", license: "Public law", maturity: "pilot", best_for: "Liability exposure of software/AI updates", limitations: "National transposition varies", release: "2026-12-09", version: "applicable / transposition deadline", link: "https://connections.nortonrosefulbright.com/post/102jpjp/revised-product-liability-directive-introducing-rules-on-strict-liability-for-ai", runs: ["cloud"], tech: [], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "iso10218", name: "ISO 10218-1:2025 / -2:2025", what: "Industrial robot and robot application safety; robot classes; cybersecurity; collaborative requirements", maker: "ISO TC 299", open: "closed", license: "Paid standard", maturity: "production", best_for: "Industrial and collaborative arm safety", limitations: "Not designed for dynamically stable robots", release: "2025-02", version: "2025 editions", link: "https://www.iso.org/standard/73933.html", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "ts15066", name: "ISO/TS 15066:2016", what: "Collaborative robot technical specification (PFL limits)", maker: "ISO TC 299", open: "closed", license: "Paid", maturity: "production", best_for: "Historical reference; values reused in 10218-2:2025", limitations: "No longer standalone", release: "2016", version: "2016", link: "https://www.automate.org/robotics/blogs/updated-iso-10218-faq", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "superseded", superseded_by: "ISO 10218-2:2025" },
    { id: "r1506", name: "ANSI/A3 R15.06-2025", what: "US national standard for industrial robot safety (aligned with ISO 10218:2025)", maker: "A3 / ANSI", open: "closed", license: "Paid standard", maturity: "production", best_for: "US deployments", limitations: "Part 3 still pending at publication", release: "2025-09-10", version: "2025", link: "https://www.automate.org/robotics/news/new-ansi-a3-r15-06-2025-american-national-standard-for-industrial-robot-safety-now-available-for-purchase", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "iso25785", name: "ISO/CD 25785-1", what: "Safety of industrial mobile robots with actively controlled stability (humanoids, quadrupeds)", maker: "ISO (WG led by US delegation incl. A3, Agility, Boston Dynamics)", open: "closed", license: "Draft", maturity: "research", best_for: "Tracking humanoid safety requirements", limitations: "Committee draft; content may change", release: "2025-05", version: "working draft May 2025 → CD", link: "https://www.iso.org/standard/91469.html", runs: ["robot"], tech: ["classical"], frontier: true, added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "iso13482", name: "ISO 13482:2014", what: "Safety requirements for personal care robots", maker: "ISO", open: "closed", license: "Paid standard", maturity: "production", best_for: "Service / personal care robots", limitations: "Predates current service-robot diversity", release: "2014", version: "2014", link: "https://www.singaporestandardseshop.sg/Product/SSPdtDetail/665f152b-dba2-7edf-0a94-39fc42ced0fb", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "iec61508", name: "IEC 61508", what: "Functional safety of E/E/PE safety-related systems (basis for IEC 62061, sector standards)", maker: "IEC", open: "closed", license: "Paid standard", maturity: "production", best_for: "Safety-rated controllers and software (SIL)", limitations: "No accepted route for ML components as safety functions", release: "2010", version: "Edition 2.0 (2010)", link: "https://scc-ccn.ca/standardsdb/standards/2017073", runs: ["robot"], tech: ["classical"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null },
    { id: "asimov-14", name: "ASIMOV benchmark & robot constitutions", what: "Semantic safety evaluation and constitution generation for VLM/VLA-driven robots", maker: "Google DeepMind", open: "open", license: "See release", maturity: "research", best_for: "Testing refusal and safe instruction following", limitations: "Semantic only", release: "2025-03", version: "CoRL 2025", link: "https://proceedings.mlr.press/v305/sermanet25a.html", runs: ["cloud"], tech: ["fm"], added: "2026-10-07", last_verified: "2026-10-07", status: "current", superseded_by: null }
  ],
  where: {
    cloud: { l: 2, n: "documentation, monitoring, reporting" },
    onprem: { l: 1, n: "" },
    sim: { l: 2, n: "scenario-based validation" },
    edge: { l: 2, n: "guardrails, monitors" },
    robot: { l: 3, n: "certified safety functions" }
  },
  tech: {
    il: { l: 1, n: "data governance duties" },
    rl: { l: 1, n: "safe exploration rules" },
    classical: { l: 3, n: "functional safety" },
    sim2real: { l: 1, n: "validation in sim must be justified" },
    real2sim: { l: 1, n: "incident replay" },
    real2sim2real: { l: 0, n: "" },
    fm: { l: 2, n: "AI Act obligations, semantic safety" },
    wam: { l: 0, n: "" },
    icl: { l: 1, n: "steerable behaviour complicates validation" }
  },
  stacks: {
    open: { title: "Open / research practice", items: [
      "ISO 12100-style hazard log as a living document in the repo",
      "Safety-rated stop chain + scanners from a certified vendor; policy computer outside the safety boundary",
      "CBF / limit filters + FIPER-style monitors + ASIMOV-style semantic tests",
      "Data cards, logging and version tuples (they double as AI Act documentation)"
    ], note: "Research labs often skip formal certification; anything leaving the lab needs it." },
    industry: { title: "Industry pattern", items: [
      "Certified safety PLCs and scanners; PL d / SIL 2-class safety functions; collaborative applications validated per ISO 10218-2:2025",
      "Humanoid pilots run in segregated or supervised zones pending ISO 25785-1",
      "Compliance programmes for Machinery Regulation (Jan 2027), CRA (reporting since Sep 2026), PLD (Dec 2026), AI Act (Annex I Aug 2028)",
      "Post-market monitoring from fleet telemetry and incident pipelines"
    ], note: "Not legal advice; involve notified bodies and counsel." }
  },
  example: {
    summary: "MB-1's safety concept: the workcell uses safety-rated laser scanners for speed and separation monitoring and a safety PLC (PL d) that triggers protective stops and safe torque off; arms run power-and-force-limited modes with force caps when a person is in the collaborative zone. The learned policy, residual RL actor and action server are non-safety-rated; their hazards (unexpected motion, excessive insertion force) are mitigated by the safety functions plus controller force caps and runtime monitors. Market: EU; MB-1 units shipped after 20 Jan 2027 follow the Machinery Regulation; the vendor runs CRA vulnerability reporting now; the AI Act Annex I obligations are planned for Aug 2028.",
    artifacts: [
      { artifact: "Hazard log v7", format: "Spreadsheet / YAML in repo", shape: "42 hazards; 11 linked to learned behaviour; each with mitigation and verification evidence id", consumer: "safety case" },
      { artifact: "Safety requirements spec", format: "Document", shape: "SF-1 protective stop (PL d), SF-2 SSM, SF-3 PFL force limits, SF-4 safely limited speed in shared zone", consumer: "[[s:09]] implementation, certifier" },
      { artifact: "Change-impact rules", format: "Policy doc", shape: "Policy/engine updates within validated envelope → gate in [[s:10]]; changes to safety functions, sensors or ODD → re-assessment", consumer: "[[s:12]], [[s:13]]" },
      { artifact: "AI documentation pack", format: "Data cards, model cards, logs, monitoring plan", shape: "Generated from [[s:03]], [[s:07]], [[s:12]] artifacts", consumer: "AI Act / Machinery technical file" }
    ],
    humanoid: "H-1 has no static safe state. Its safety concept adds fall detection and controlled-collapse behaviours, a 'safe pose' command (crouch/kneel) available to remote operators, exclusion zones during autonomous operation, and validation of the learned whole-body controller under thousands of simulated perturbations plus a real push-test matrix. The standards route is still forming (ISO/CD 25785-1), so deployments near people remain supervised pilots."
  },
  pitfalls: [
    { t: "Calling the policy 'safe' because it was trained to avoid collisions", d: "Learned avoidance is a risk-reduction measure, not a certified safety function; regulators and standards will not accept it as the safety function." },
    { t: "Ignoring the 2027 Machinery Regulation because of the AI Act delay", d: "The Omnibus moved AI Act dates; the Machinery Regulation still applies from 20 January 2027 with AI-specific requirements." },
    { t: "Continuous learning without change management", d: "Each model update can change the product's risk profile; without defined envelopes you either freeze learning or invalidate the conformity assessment." },
    { t: "Treating humanoids like cobots", d: "Power-and-force limiting assumptions do not hold for a falling 60–70 kg robot; stability is a hazard class of its own." },
    { t: "No vulnerability process for OTA fleets", d: "CRA reporting obligations already apply; an exploited vulnerability in a connected robot is a reportable event." },
    { t: "Collecting egocentric video without consent", d: "GDPR obligations apply to people captured in homes and workplaces; plan consent, minimization and retention." }
  ],
  numbers: [
    { m: "Machinery Regulation application", v: "20 January 2027", s: "[IBF Solutions](https://www.ibf-solutions.com/en/seminars-and-news/news/new-machinery-regulation-status-of-harmonised-standards)" },
    { m: "AI Act high-risk (after Omnibus)", v: "Annex III: 2 Dec 2027 · Annex I products: 2 Aug 2028", s: "[Gibson Dunn](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/)" },
    { m: "CRA", v: "reporting from 11 Sep 2026; full from 11 Dec 2027", s: "[CMS](https://cms.law/en/deu/legal-updates/cyber-resilience-act-new-obligations-for-robot-manufacturers)" },
    { m: "PLD", v: "9 Dec 2026 (software and AI are products)", s: "[Norton Rose Fulbright](https://connections.nortonrosefulbright.com/post/102jpjp/revised-product-liability-directive-introducing-rules-on-strict-liability-for-ai)" },
    { m: "ASIMOV", v: "500k situations · 3M instructions · 84.3 % alignment with generated constitutions", s: "[CoRL 2025](https://proceedings.mlr.press/v305/sermanet25a.html)" },
    { m: "Machinery documentation retention", v: "10 years", s: "[Nemko](https://digital.nemko.com/regulations/eu-machinery-regulation)" }
  ],
  papers: [
    { title: "Updated ISO 10218: Answers to Frequently Asked Questions", year: "2025", venue: "A3", url: "https://www.automate.org/robotics/blogs/updated-iso-10218-faq", why: "What changed in the 2025 robot safety standards." },
    { title: "ISO 25785-1 explained: what it means for humanoid robot safety", year: "2026", venue: "i-SCOOP", url: "https://www.i-scoop.eu/iso-25785-1-explained-and-what-it-means-for-humanoid-robot-safety/", why: "Scope and status of the humanoid safety standard." },
    { title: "EU AI Act Omnibus Agreement: postponed high-risk deadlines", year: "2026", venue: "Gibson Dunn", url: "https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/", why: "Current AI Act dates and what did not change." },
    { title: "Cyber Resilience Act: new obligations for robot manufacturers", year: "2026", venue: "CMS", url: "https://cms.law/en/deu/legal-updates/cyber-resilience-act-new-obligations-for-robot-manufacturers", why: "CRA applied to robots." },
    { title: "Generating Robot Constitutions & Benchmarks for Semantic Safety (ASIMOV)", year: "2025", venue: "CoRL", url: "https://proceedings.mlr.press/v305/sermanet25a.html", why: "Semantic safety for language-conditioned robots." },
    { title: "Machinery Regulation: status of harmonised standards", year: "2026", venue: "IBF Solutions", url: "https://www.ibf-solutions.com/en/seminars-and-news/news/new-machinery-regulation-status-of-harmonised-standards", why: "How standards transition to the new Regulation." }
  ],
  open_problems: [
    "A recognized route to certify ML components that contribute to safety functions.",
    "Validation arguments for policies whose behaviour is steerable by prompts and context (π0.7-style).",
    "Harmonised standards for AI Act requirements in machinery.",
    "Safety standards for dynamically stable robots operating near untrained people (homes, retail)."
  ],
  self_check: [
    { q: "Your team proposes letting the VLA slow down near humans as the 'safety function'. Respond.", a: "Learned slowing is welcome as risk reduction but cannot be the safety function: it is not analysable or certifiable to a PL/SIL. Implement speed and separation monitoring with safety-rated scanners and a safety PLC (per ISO 10218-2:2025), independent of the policy; keep the learned behaviour as an additional layer and document both in the risk assessment." },
    { q: "Which artifacts from other stages double as AI Act documentation?", a: "Data cards, manifests and consent/licence columns ([[s:03]], [[s:04]]) for data governance; model cards and training manifests ([[s:07]]); eval reports with robustness axes and safety metrics ([[s:10]]); logs, version tuples, monitoring plans and incident records ([[s:12]]); risk management and human-oversight design (this stage)." },
    { q: "What changes in your release process because of the Machinery Regulation and the PLD?", a: "Change-impact assessment for every policy/config/OS update against the validated envelope; digital technical documentation kept 10 years; cybersecurity of safety functions; awareness that defects introduced by updates or learning after placing on the market create liability under the PLD; so gate updates rigorously and keep evidence." },
    { q: "Why is a humanoid's protective stop harder than an arm's?", a: "An arm can stop and hold (or STO) safely; a balancing robot that cuts torque falls. Stop categories must preserve balance or execute a controlled collapse, the learned whole-body controller becomes part of the stopping behaviour, and the fall itself is a hazard. This is the gap ISO/CD 25785-1 addresses." },
    { q: "What does the CRA require of your OTA fleet today (Oct 2026)?", a: "Reporting of actively exploited vulnerabilities and severe incidents via the ENISA platform within the deadlines, which presupposes vulnerability monitoring, SBOMs, incident triage and update capability. Full secure-by-design and support-period requirements follow from 11 Dec 2027." }
  ]
};
