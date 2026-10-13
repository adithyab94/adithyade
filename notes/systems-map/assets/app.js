/* app.js — shell (rail, top bar, search, filters, theme), stage renderer, view renderers.
   No build step, no fetch(): works from file://. Data arrives via <script> tags that populate window.PAI. */
(function () {
  "use strict";
  var PAI = window.PAI = window.PAI || {};
  PAI.stages = PAI.stages || {};
  PAI.data = PAI.data || {};
  var META = PAI.meta;
  var body = document.body;
  var ROOT = body.getAttribute("data-root") || "";
  var PAGE = body.getAttribute("data-page") || "view";
  var PAGE_ID = body.getAttribute("data-id") || "";

  /* ------------------------------------------------------------------ utils */
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; }
    return null;
  }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function stageMeta(id) { for (var i = 0; i < META.stages.length; i++) if (META.stages[i].id === id) return META.stages[i]; return null; }
  function viewMeta(id) { for (var i = 0; i < META.views.length; i++) if (META.views[i].id === id) return META.views[i]; return null; }
  function stageUrl(id, hash) { var s = stageMeta(id); return s ? ROOT + s.file + (hash ? "#" + hash : "") : "#"; }
  function viewUrl(id, hash) { var v = viewMeta(id); return v ? ROOT + v.file + (hash ? "#" + hash : "") : "#"; }
  function normStage(x) { x = String(x); if (/^stage-/.test(x)) return x; if (x.length === 1) x = "0" + x; return "stage-" + x; }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

  /* Inline markup used inside data strings:
     **bold**  `code`  [text](https://url)
     [[s:07]] [[s:07|text]] [[s:07#tools|text]]   stage link
     [[v:paradigms|text]]                         view link (id without "view-")
     [[g:term-id|text]]                           glossary entry
     [[f:item-id|text]]                           frontier item
     [[t:07:tool-id|text]]                        tool row on a stage page                */
  function md(s) {
    if (s == null) return "";
    var out = esc(s);
    out = out.replace(/`([^`]+)`/g, function (_, c) { return "<code>" + c + "</code>"; });
    out = out.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    out = out.replace(/\[\[([sgvft]):([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (_, k, ref, text) {
      var href = "#", label = text;
      if (k === "s") {
        var parts = ref.split("#"), id = normStage(parts[0]), sm = stageMeta(id);
        href = stageUrl(id, parts[1]); label = label || (sm ? sm.num + " " + sm.short : ref);
      } else if (k === "v") {
        var vid = "view-" + ref.split("#")[0], vm = viewMeta(vid);
        href = viewUrl(vid, ref.split("#")[1]); label = label || (vm ? vm.short : ref);
      } else if (k === "g") {
        href = viewUrl("view-glossary", "g-" + ref); label = label || ref;
      } else if (k === "f") {
        href = viewUrl("view-frontier", "f-" + ref); label = label || ref;
      } else if (k === "t") {
        var p = ref.split(":"); href = stageUrl(normStage(p[0]), "t-" + p[1]); label = label || p[1];
      }
      return '<a href="' + href + '">' + label + "</a>";
    });
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return out;
  }
  function paras(s) {
    if (!s) return "";
    return String(s).split(/\n\n+/).map(function (p) { return "<p>" + md(p.trim()) + "</p>"; }).join("");
  }
  function tagChip(key) {
    var d = META.tagDefs[key];
    var cls = key === "frontier" ? "tag-frontier" : "tag-" + key;
    return '<span class="tag ' + cls + '">' + esc(d ? d.label : key) + "</span>";
  }
  function tagList(keys) {
    if (!keys || !keys.length) return "";
    return '<span class="tags">' + keys.map(tagChip).join("") + "</span>";
  }
  function dots(level, max) {
    max = max || 3; var h = '<span class="dots" aria-label="' + level + " of " + max + '">';
    for (var i = 1; i <= max; i++) h += '<i class="' + (i <= level ? "on" : "") + '"></i>';
    return h + "</span>";
  }
  function maturity(m) { return '<span class="mat mat-' + esc(m) + '">' + esc(m) + "</span>"; }
  function openBadge(o, lic) {
    var cls = o === "open" ? "tag-open" : (o === "closed" ? "tag-closed" : "tag-mixed");
    var label = o === "open" ? "open" : (o === "closed" ? "closed" : o);
    return '<span class="tag ' + cls + '">' + esc(label) + "</span>" + (lic ? '<span class="what">' + esc(lic) + "</span>" : "");
  }
  function linkOut(u, text) {
    if (!u) return "";
    var host = text || u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
    return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(host) + "</a>";
  }

  /* ------------------------------------------------------------------ theme */
  function applyTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  var theme = store("pai.theme") || "system";
  applyTheme(theme);

  /* ------------------------------------------------------------------ filters */
  var filters = {};
  try { (JSON.parse(store("pai.filters") || "[]") || []).forEach(function (k) { filters[k] = true; }); } catch (e) { filters = {}; }
  function activeKeys() { return Object.keys(filters).filter(function (k) { return filters[k]; }); }
  function groupOf(k) { for (var i = 0; i < META.filterChips.length; i++) if (META.filterChips[i].key === k) return META.filterChips[i].group; return null; }
  function passes(tagsStr, isLicensed) {
    var tags = (tagsStr || "").split(/\s+/);
    var groups = {};
    activeKeys().forEach(function (k) { var g = groupOf(k); (groups[g] = groups[g] || []).push(k); });
    for (var g in groups) {
      if (g === "open") { if (isLicensed && tags.indexOf("open") < 0) return false; continue; }
      var ok = groups[g].some(function (k) { return tags.indexOf(k) >= 0; });
      if (!ok) return false;
    }
    return true;
  }
  function applyFilters() {
    var any = activeKeys().length > 0;
    $$("[data-ftags]").forEach(function (el) {
      var ok = !any || passes(el.getAttribute("data-ftags"), el.hasAttribute("data-lic"));
      if (el.classList.contains("d-node") || el.classList.contains("nav")) { el.classList.toggle("dim", !ok); }
      else el.hidden = !ok;
    });
    $$("[data-filtercount]").forEach(function (box) {
      var items = $$("[data-ftags]", box), hidden = items.filter(function (x) { return x.hidden; }).length;
      var note = box.querySelector(".filternote");
      if (!note) { note = document.createElement("div"); note.className = "filternote"; box.appendChild(note); }
      note.hidden = hidden === 0;
      note.innerHTML = hidden + " of " + items.length + ' hidden by filters. <button type="button" data-clearfilters>Clear filters</button>';
    });
    $$(".chip[data-fkey]").forEach(function (c) { c.setAttribute("aria-pressed", filters[c.getAttribute("data-fkey")] ? "true" : "false"); });
    store("pai.filters", JSON.stringify(activeKeys()));
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-clearfilters]") : null;
    if (t) { filters = {}; applyFilters(); }
  });

  /* ------------------------------------------------------------------ shell */
  function buildRail() {
    var rail = $("#rail"); if (!rail) return;
    var h = '<a class="brand" href="' + ROOT + 'index.html"><b>' + esc(META.site) + "</b><span>v" + esc(META.version) + " · verified " + esc(META.last_verified) + "</span></a>";
    h += '<h2>Pipeline</h2><ol>';
    META.stages.forEach(function (s) {
      var st = PAI.stages[s.id];
      h += '<li><a class="nav" href="' + ROOT + s.file + '"' + (PAGE_ID === s.id ? ' aria-current="page"' : "") + (PAI.stages[s.id] ? ' data-ftags="' + esc(stageFtags(s.id)) + '"' : "") + '><span class="n">' + s.num + "</span><span>" + esc(s.short) + "</span></a></li>";
    });
    h += "</ol><h2>Integration views</h2><ul>";
    h += '<li><a class="nav" href="' + ROOT + 'index.html"' + (PAGE === "index" ? ' aria-current="page"' : "") + '><span class="n">◇</span><span>Master map</span></a></li>';
    META.views.forEach(function (v) {
      h += '<li><a class="nav" href="' + ROOT + v.file + '"' + (PAGE_ID === v.id ? ' aria-current="page"' : "") + '><span class="n">·</span><span>' + esc(v.short) + "</span></a></li>";
    });
    h += "</ul>";
    rail.innerHTML = h;
  }
  /* Stage-level tags for filtering the rail & master map: levels >= 2 count. Uses STAGE_TAGS fallback when data not loaded. */
  function stageFtags(id) {
    var st = PAI.stages[id], out = [];
    var src = st;
    if (!src) return "";
    ["where", "tech"].forEach(function (grp) {
      var o = src[grp] || {};
      Object.keys(o).forEach(function (k) { var v = o[k]; var l = typeof v === "number" ? v : (v && v.l); if (l >= 2) out.push(k); });
    });
    if (st && st.methods && st.methods.some(function (m) { return m.frontier; })) out.push("frontier");
    return out.join(" ");
  }

  function buildTopbar() {
    var tb = $("#topbar"); if (!tb) return;
    var chips = META.filterChips.map(function (c) {
      return '<button type="button" class="chip" data-fkey="' + c.key + '" aria-pressed="false">' + esc(c.label) + "</button>";
    }).join("");
    tb.innerHTML =
      '<button type="button" class="btn menu-btn" id="menuBtn" aria-label="Open navigation">☰ Menu</button>' +
      '<div class="search" role="search"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" stroke-width="1.6"/><path d="M11 11l3.5 3.5" stroke-width="1.6"/></svg>' +
      '<input id="q" type="search" placeholder="Search stages, tools, papers, terms…  ( / )" autocomplete="off" aria-label="Search the site">' +
      '<div class="results" id="qres" hidden></div></div>' +
      '<div class="chips" aria-label="Filters"><span class="lbl">Filter</span>' + chips + '<button type="button" class="chip clear" data-clearfilters>Clear</button></div>' +
      '<button type="button" class="btn" id="themeBtn" aria-label="Toggle colour theme"></button>';
    $$(".chip[data-fkey]", tb).forEach(function (c) {
      c.addEventListener("click", function () { var k = c.getAttribute("data-fkey"); filters[k] = !filters[k]; applyFilters(); });
    });
    var tbtn = $("#themeBtn");
    function label() { tbtn.textContent = "Theme: " + (theme === "system" ? "System" : (theme === "dark" ? "Dark" : "Light")); }
    label();
    tbtn.addEventListener("click", function () {
      theme = theme === "system" ? "light" : (theme === "light" ? "dark" : "system");
      store("pai.theme", theme === "system" ? null : theme); applyTheme(theme); label();
    });
    var mb = $("#menuBtn"), rail = $("#rail");
    mb.addEventListener("click", function () {
      rail.classList.add("open");
      var scrim = document.createElement("div"); scrim.className = "scrim";
      scrim.addEventListener("click", function () { rail.classList.remove("open"); scrim.remove(); });
      document.body.appendChild(scrim);
    });
    initSearch();
  }

  function buildFooter() {
    var f = $("#pagefoot"); if (!f) return;
    f.innerHTML = esc(META.site) + " · v" + esc(META.version) + " · last verified " + esc(META.last_verified) +
      " · research window " + esc(META.research_window) + ' · <a href="' + ROOT + 'index.html#changelog">changelog</a>';
  }

  function crumbs(items) {
    return '<nav class="crumbs" aria-label="Breadcrumb">' + items.map(function (it) {
      return "<span>" + (it.href ? '<a href="' + it.href + '">' + esc(it.label) + "</a>" : esc(it.label)) + "</span>";
    }).join("") + "</nav>";
  }

  function pager(prev, next) {
    var h = '<nav class="pager" aria-label="Previous and next">';
    h += prev ? '<a class="prev" href="' + prev.href + '"><span class="eyebrow">← Previous</span><span>' + esc(prev.label) + "</span></a>" : "<span></span>";
    h += next ? '<a class="next" href="' + next.href + '"><span class="eyebrow">Next →</span><span>' + esc(next.label) + "</span></a>" : "<span></span>";
    return h + "</nav>";
  }
  function sequence() {
    var seq = [{ href: ROOT + "index.html", label: "Master map", id: "index" }];
    META.stages.forEach(function (s) { seq.push({ href: ROOT + s.file, label: s.num + " " + s.title, id: s.id }); });
    META.views.forEach(function (v) { seq.push({ href: ROOT + v.file, label: v.title, id: v.id }); });
    return seq;
  }
  function pagerFor(id) {
    var seq = sequence(), i = -1;
    for (var k = 0; k < seq.length; k++) if (seq[k].id === id) i = k;
    if (i < 0) return "";
    return pager(seq[i - 1], seq[i + 1]);
  }

  /* ------------------------------------------------------------------ search */
  var INDEX = null;
  function loadAllData(cb) {
    var files = META.dataFiles.slice(), pending = 0;
    files.forEach(function (f) {
      var key = f.replace(/^data\//, "").replace(/\.js$/, "");
      var have = /^stage-/.test(key) ? PAI.stages[key] : PAI.data[key];
      if (have) return;
      if (document.querySelector('script[data-lazy="' + f + '"]')) return;
      pending++;
      var s = document.createElement("script");
      s.src = ROOT + f; s.setAttribute("data-lazy", f);
      s.onload = s.onerror = function () { if (--pending === 0) cb(); };
      document.head.appendChild(s);
    });
    if (pending === 0) cb();
  }
  function buildIndex() {
    var idx = [];
    function plain(v) { return String(v || "").replace(/\[\[[sgvft]:[^\]|]+\|([^\]]+)\]\]/g, "$1").replace(/\[\[[sgvft]:([^\]]+)\]\]/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*|`/g, ""); }
    function add(kind, title, text, href, extra) { title = plain(title); text = plain(text); idx.push({ k: kind, t: title, x: (title + " " + text + " " + plain(extra)).toLowerCase(), s: text, h: href }); }
    META.views.forEach(function (v) { add("view", v.title, v.desc, viewUrl(v.id), v.keywords); });
    META.stages.forEach(function (sm) {
      var st = PAI.stages[sm.id]; if (!st) return;
      add("stage", sm.num + " " + st.title, st.purpose, stageUrl(sm.id), st.mental_model);
      (st.methods || []).forEach(function (m) { add("method", m.name, m.summary, stageUrl(sm.id, "m-" + m.id), (m.tags || []).join(" ") + (m.frontier ? " frontier" : "")); });
      (st.tools || []).forEach(function (t) { add("tool", t.name, t.what + " — " + t.maker, stageUrl(sm.id, "t-" + t.id), t.best_for + " " + (t.license || "")); });
      (st.papers || []).forEach(function (p) { add("paper", p.title, (p.year || "") + " " + (p.venue || "") + " · " + sm.short, stageUrl(sm.id, "papers"), p.why); });
      (st.pitfalls || []).forEach(function (p) { add("pitfall", p.t, p.d, stageUrl(sm.id, "pitfalls")); });
      (st.self_check || []).forEach(function (q) { add("question", q.q, sm.short, stageUrl(sm.id, "selfcheck"), q.a); });
    });
    var g = PAI.data.glossary; if (g) g.terms.forEach(function (t) { add("term", t.term, t.def, viewUrl("view-glossary", "g-" + t.id), (t.aka || []).join(" ")); });
    var f = PAI.data.frontier; if (f) f.items.forEach(function (it) { add("frontier", it.name, it.definition, viewUrl("view-frontier", "f-" + it.id), it.category); });
    var c = PAI.data.capstone; if (c) c.questions.forEach(function (q, i) { add("question", q.q, "Capstone Q" + (i + 1), viewUrl("view-selftest", "c-" + (i + 1)), q.a); });
    var r = PAI.data.roadmap; if (r) r.projects.forEach(function (p, i) { add("project", p.title, p.outcome, viewUrl("view-roadmap", "p-" + (i + 1)), (p.tools || []).join(" ")); });
    INDEX = idx;
  }
  function runSearch(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    var res = [];
    INDEX.forEach(function (e) {
      var score = 0, tl = e.t.toLowerCase();
      for (var i = 0; i < terms.length; i++) {
        if (e.x.indexOf(terms[i]) < 0) return;
        score += tl.indexOf(terms[i]) >= 0 ? 5 : 1;
        if (tl === terms.join(" ")) score += 10;
      }
      if (e.k === "stage" || e.k === "view") score += 2;
      if (e.k === "term" || e.k === "tool" || e.k === "frontier") score += 1;
      res.push({ e: e, s: score });
    });
    res.sort(function (a, b) { return b.s - a.s; });
    return res.slice(0, 40).map(function (r) { return r.e; });
  }
  function initSearch() {
    var input = $("#q"), box = $("#qres"), active = -1, items = [];
    function render() {
      var q = input.value.trim();
      if (!q) { box.hidden = true; return; }
      if (!INDEX) { box.hidden = false; box.innerHTML = '<div class="empty">Loading index…</div>'; return; }
      items = runSearch(q); active = -1;
      box.hidden = false;
      box.innerHTML = items.length ? items.map(function (e, i) {
        return '<a href="' + e.h + '" data-i="' + i + '"><span class="k">' + esc(e.k) + '</span><span class="t">' + esc(e.t) + '</span><span class="s">' + esc(e.s) + "</span></a>";
      }).join("") : '<div class="empty">No matches for “' + esc(q) + '”. Try a tool name, a paper keyword or a term such as “action chunk”.</div>';
    }
    function ensure() { if (!INDEX) loadAllData(function () { buildIndex(); render(); }); }
    input.addEventListener("focus", ensure);
    input.addEventListener("input", function () { ensure(); render(); });
    input.addEventListener("keydown", function (e) {
      var links = $$("a", box);
      if (e.key === "ArrowDown") { active = Math.min(active + 1, links.length - 1); e.preventDefault(); }
      else if (e.key === "ArrowUp") { active = Math.max(active - 1, 0); e.preventDefault(); }
      else if (e.key === "Enter") { var l = links[active >= 0 ? active : 0]; if (l) { window.location.href = l.getAttribute("href"); } return; }
      else if (e.key === "Escape") { box.hidden = true; input.blur(); return; }
      links.forEach(function (l, i) { l.classList.toggle("active", i === active); });
      if (links[active]) links[active].scrollIntoView({ block: "nearest" });
    });
    document.addEventListener("click", function (e) { if (!e.target.closest || !e.target.closest(".search")) box.hidden = true; });
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== input && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
    });
  }

  /* ------------------------------------------------------------------ sortable tables */
  var MAT_RANK = { research: 1, pilot: 2, production: 3 };
  function makeSortable(table) {
    $$("th.sortable", table).forEach(function (th, ci) {
      th.setAttribute("tabindex", "0");
      function go() {
        var idx = Array.prototype.indexOf.call(th.parentNode.children, th);
        var dir = th.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
        $$("th", table).forEach(function (x) { x.removeAttribute("aria-sort"); });
        th.setAttribute("aria-sort", dir);
        var tb = table.tBodies[0], rows = Array.prototype.slice.call(tb.rows);
        rows.sort(function (a, b) {
          var av = a.cells[idx].getAttribute("data-v") || a.cells[idx].textContent.trim().toLowerCase();
          var bv = b.cells[idx].getAttribute("data-v") || b.cells[idx].textContent.trim().toLowerCase();
          var an = parseFloat(av), bn = parseFloat(bv);
          var c = (!isNaN(an) && !isNaN(bn) && /^[\d.]+$/.test(av) && /^[\d.]+$/.test(bv)) ? an - bn : (av < bv ? -1 : av > bv ? 1 : 0);
          return dir === "ascending" ? c : -c;
        });
        rows.forEach(function (r) { tb.appendChild(r); });
      }
      th.addEventListener("click", go);
      th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }

  /* ------------------------------------------------------------------ tool table */
  function toolTable(tools, stageNum) {
    var h = '<div data-filtercount><div class="tablewrap"><table class="tools sortable-table"><thead><tr>' +
      '<th class="sortable">Tool</th><th class="sortable">Maker</th><th class="sortable">Open / closed</th><th class="sortable">Maturity</th>' +
      '<th>Best for</th><th>Limitations</th><th class="sortable">Last release</th><th>Link</th></tr></thead><tbody>';
    tools.forEach(function (t) {
      var ft = (t.runs || []).concat(t.tech || []);
      if (t.open === "open") ft.push("open");
      if (t.frontier) ft.push("frontier");
      var rel = t.release ? t.release : "";
      var relLabel = (t.version ? esc(t.version) + "<br>" : "") + (t.release ? esc(t.release) : '<span class="muted">' + esc(t.release_note || "rolling") + "</span>");
      var sup = t.status && t.status !== "current";
      h += '<tr id="t-' + esc(t.id) + '" class="' + (sup ? "superseded" : "") + '" data-ftags="' + esc(ft.join(" ")) + '" data-lic="1">' +
        '<td class="name" data-v="' + esc(t.name.toLowerCase()) + '"><b>' + esc(t.name) + "</b>" + (t.frontier ? ' <span class="tag tag-frontier">frontier</span>' : "") +
        (sup ? ' <span class="tag tag-closed">' + esc(t.status) + (t.superseded_by ? " → " + esc(t.superseded_by) : "") + "</span>" : "") +
        '<span class="what">' + md(t.what) + "</span>" + tagList((t.runs || []).concat(t.tech || [])) + "</td>" +
        "<td>" + esc(t.maker) + "</td>" +
        '<td data-v="' + esc(t.open) + '">' + openBadge(t.open, t.license) + "</td>" +
        '<td data-v="' + (MAT_RANK[t.maturity] || 0) + '">' + maturity(t.maturity) + "</td>" +
        '<td class="wide">' + md(t.best_for) + "</td>" +
        '<td class="wide">' + md(t.limitations) + "</td>" +
        '<td class="date" data-v="' + esc(rel || "0000") + '">' + relLabel + "</td>" +
        "<td>" + linkOut(t.link) + "</td></tr>";
    });
    h += "</tbody></table></div></div>";
    return h;
  }

  /* ------------------------------------------------------------------ mini map */
  var MAP_LAYOUT = {
    /* x, y (top-left), lane: 0 cloud, 1 sim, 2 robot/edge */
    "stage-00": [24, 384], "stage-01": [176, 384], "stage-02": [328, 384],
    "stage-03": [392, 92], "stage-04": [544, 92], "stage-05": [480, 238], "stage-06": [632, 238],
    "stage-07": [720, 92], "stage-08": [800, 238], "stage-09": [640, 384],
    "stage-10": [880, 92], "stage-11": [888, 384], "stage-12": [1040, 384], "stage-13": [1040, 92]
  };
  var MAP_EDGES = [
    ["stage-00", "stage-01", ""], ["stage-01", "stage-02", ""], ["stage-02", "stage-03", "MCAP episodes"],
    ["stage-03", "stage-04", ""], ["stage-04", "stage-07", "curated dataset"], ["stage-03", "stage-06", "real scans"],
    ["stage-05", "stage-06", ""], ["stage-06", "stage-07", "co-train mix"], ["stage-05", "stage-08", "envs"],
    ["stage-08", "stage-07", "RL-tuned weights"], ["stage-07", "stage-10", "checkpoints"], ["stage-10", "stage-11", "approved ckpt"],
    ["stage-11", "stage-12", "engine + manifest"], ["stage-09", "stage-11", ""], ["stage-12", "stage-13", "logs, interventions"]
  ];
  var MAP_FEEDBACK = [
    ["stage-13", "stage-02", "flywheel: targeted collection"],
    ["stage-13", "stage-04", "failure mining"],
    ["stage-10", "stage-07", "eval → retrain"],
    ["stage-12", "stage-08", "real-world RL"]
  ];
  var NW = 128, NH = 52;
  function nodeCenter(id) { var p = MAP_LAYOUT[id]; return [p[0] + NW / 2, p[1] + NH / 2]; }
  function edgePath(a, b) {
    var pa = MAP_LAYOUT[a], pb = MAP_LAYOUT[b];
    var ax = pa[0] + NW, ay = pa[1] + NH / 2, bx = pb[0], by = pb[1] + NH / 2;
    if (pb[0] <= pa[0] + NW) { /* vertical-ish */
      var down = pb[1] > pa[1];
      ax = pa[0] + NW / 2 + (pb[0] > pa[0] ? 20 : -20); ay = down ? pa[1] + NH : pa[1];
      bx = pb[0] + NW / 2 + (pb[0] > pa[0] ? -20 : 20); by = down ? pb[1] : pb[1] + NH;
      var my = (ay + by) / 2;
      return "M" + ax + "," + ay + " C" + ax + "," + my + " " + bx + "," + my + " " + bx + "," + by;
    }
    var mx = (ax + bx) / 2;
    return "M" + ax + "," + ay + " C" + mx + "," + ay + " " + mx + "," + by + " " + bx + "," + by;
  }
  function pipelineSVG(opts) {
    opts = opts || {};
    var cur = opts.current, up = opts.up || [], down = opts.down || [];
    var W = 1240, H = 520;
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Physical AI pipeline: 15 stages across cloud, simulation and robot/edge lanes with feedback loops">';
    s += '<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="d-arrow" d="M0,0 L10,5 L0,10 z"/></marker>' +
      '<marker id="arfb" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="d-arrow fb" d="M0,0 L10,5 L0,10 z"/></marker>' +
      '<marker id="arhot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="d-arrow hot" d="M0,0 L10,5 L0,10 z"/></marker></defs>';
    var lanes = [["CLOUD / ON-PREM · data, training, eval", 64], ["SIMULATION · physics, rendering, world models", 210], ["ROBOT & EDGE · sensing, control, inference, ops", 356]];
    lanes.forEach(function (l) { s += '<rect class="d-lane" x="8" y="' + l[1] + '" width="' + (W - 16) + '" height="136" rx="6"/><text class="d-lane-label" x="20" y="' + (l[1] + 18) + '">' + l[0] + "</text>"; });
    MAP_EDGES.forEach(function (e) {
      var hot = cur && (e[0] === cur || e[1] === cur);
      s += '<path class="d-edge' + (hot ? " hot" : "") + '" d="' + edgePath(e[0], e[1]) + '" marker-end="url(#' + (hot ? "arhot" : "ar") + ')"/>';
    });
    /* feedback loops, routed outside lanes */
    var fb = "";
    // 13 -> 02 : from 13 top, go up to y=40, left to x of 02... route below robot lane instead
    var p13 = MAP_LAYOUT["stage-13"], p02 = MAP_LAYOUT["stage-02"], p04 = MAP_LAYOUT["stage-04"], p10 = MAP_LAYOUT["stage-10"], p07 = MAP_LAYOUT["stage-07"], p12 = MAP_LAYOUT["stage-12"], p08 = MAP_LAYOUT["stage-08"];
    fb += '<path class="d-edge fb" d="M' + (p13[0] + NW) + "," + (p13[1] + NH / 2) + " H1196 V500 H" + (p02[0] + NW / 2) + " V" + (p02[1] + NH) + '" marker-end="url(#arfb)"/>';
    fb += '<text class="d-elabel fb" x="560" y="514">flywheel: failures & interventions → targeted collection (13 → 02)</text>';
    fb += '<path class="d-edge fb" d="M' + (p13[0] + NW / 2) + "," + p13[1] + " V44 H" + (p04[0] + NW / 2) + " V" + p04[1] + '" marker-end="url(#arfb)"/>';
    fb += '<text class="d-elabel fb" x="640" y="38">failure mining → relabel / re-curate (13 → 04)</text>';
    fb += '<path class="d-edge fb" d="M' + (p10[0] + 20) + "," + p10[1] + " C" + (p10[0] + 20) + ",70 " + (p07[0] + NW - 20) + ",70 " + (p07[0] + NW - 20) + "," + p07[1] + '" marker-end="url(#arfb)"/>';
    fb += '<path class="d-edge fb" d="M' + (p12[0] + 30) + "," + p12[1] + " C" + (p12[0] + 30) + ",320 " + (p08[0] + NW - 10) + ",330 " + (p08[0] + NW - 10) + "," + (p08[1] + NH) + '" marker-end="url(#arfb)"/>';
    fb += '<text class="d-elabel fb" x="' + (p08[0] + NW + 8) + '" y="353">on-robot RL / interventions (12 → 08)</text>';
    s += fb;
    META.stages.forEach(function (sm) {
      if (sm.id === "stage-14") return;
      var p = MAP_LAYOUT[sm.id];
      var cls = "d-node" + (sm.id === cur ? " cur" : "") + (up.indexOf(sm.id) >= 0 ? " up" : "") + (down.indexOf(sm.id) >= 0 ? " down" : "");
      var title = sm.short;
      s += '<a href="' + ROOT + sm.file + '" class="' + cls + '"' + (PAI.stages[sm.id] ? ' data-ftags="' + esc(stageFtags(sm.id)) + '"' : "") + ' aria-label="Stage ' + sm.num + ": " + esc(sm.title) + '">' +
        '<rect x="' + p[0] + '" y="' + p[1] + '" width="' + NW + '" height="' + NH + '" rx="5"/>' +
        '<text class="d-num" x="' + (p[0] + 10) + '" y="' + (p[1] + 18) + '">' + sm.num + "</text>" +
        wrapText(title, p[0] + 10, p[1] + 34, 17) + "</a>";
    });
    /* 14 safety: cross-cutting band */
    var s14 = stageMeta("stage-14");
    s += '<a href="' + ROOT + s14.file + '" class="d-band' + (cur === "stage-14" ? " cur" : "") + '" aria-label="Stage 14: Safety, standards & regulation (cross-cutting)">' +
      '<rect x="1206" y="64" width="26" height="428" rx="4"/><text x="1223" y="440" transform="rotate(-90 1223 440)">14 SAFETY · STANDARDS · REGULATION — constrains every stage</text></a>';
    s += "</svg>";
    return s;
  }
  function wrapText(t, x, y, maxChars) {
    var words = t.split(" "), lines = [], line = "";
    words.forEach(function (w) { if ((line + " " + w).trim().length > maxChars) { lines.push(line.trim()); line = w; } else line += " " + w; });
    if (line.trim()) lines.push(line.trim());
    return lines.slice(0, 2).map(function (l, i) { return '<text x="' + x + '" y="' + (y + i * 14) + '">' + esc(l) + "</text>"; }).join("");
  }

  /* ------------------------------------------------------------------ stage page */
  var SECTIONS = [
    ["where", "Where you are"], ["purpose", "Purpose"], ["interface", "Interface contract"], ["mental", "Mental model"],
    ["methods", "Methods"], ["decision", "Decision guide"], ["tools", "Tool table"], ["runs", "Where it runs"],
    ["tags", "Technique tags"], ["stacks", "Reference stacks"], ["example", "Running example"], ["pitfalls", "Pitfalls & misconceptions"],
    ["numbers", "Numbers that matter"], ["papers", "Key papers & resources"], ["open", "Open problems"], ["selfcheck", "Self-check"]
  ];
  var WHERE_KEYS = [["cloud", "Cloud"], ["onprem", "On-prem"], ["sim", "Sim"], ["edge", "Edge"], ["robot", "Robot"]];
  var TECH_KEYS = [["il", "IL"], ["rl", "RL"], ["classical", "Classical"], ["sim2real", "Sim2Real"], ["real2sim", "Real2Sim"], ["real2sim2real", "Real2Sim2Real"], ["fm", "Foundation model"], ["wam", "WAM / world model"], ["icl", "ICL"]];

  function sec(i, id, title, inner) {
    return '<section class="sec" id="' + id + '"><header><span class="num">' + String(i + 1).padStart(2, "0") + "</span><h2>" + esc(title) + "</h2></header>" + inner + "</section>";
  }
  function stageLinkList(arr) {
    return (arr || []).map(function (u) {
      var sm = stageMeta(u.id);
      return "<li>" + (sm ? '<a href="' + ROOT + sm.file + '">' + sm.num + " " + esc(sm.title) + "</a>" : esc(u.id)) + (u.what ? " — " + md(u.what) : "") + "</li>";
    }).join("");
  }
  function meterGrid(obj, keys) {
    return '<div class="meters">' + keys.map(function (k) {
      var v = obj[k[0]] || { l: 0, n: "" }; if (typeof v === "number") v = { l: v, n: "" };
      return '<div class="meter l' + v.l + '"><div class="top">' + tagChip(k[0]) + dots(v.l) + "</div>" + (v.n ? '<div class="note">' + md(v.n) + "</div>" : "") + "</div>";
    }).join("") + "</div>";
  }

  function extrasHtml(extras) {
    return (extras || []).map(function (x) {
      return '<div style="margin-top:1.25rem"><h3 style="margin-bottom:.5rem">' + esc(x.title) + "</h3>" + (x.note ? '<p class="small muted" style="margin-bottom:.5rem;max-width:var(--measure)">' + md(x.note) + "</p>" : "") +
        '<div class="tablewrap"><table><thead><tr>' + x.columns.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        x.rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return (i === 0 ? '<td class="name"><b>' + md(c) + "</b>" : '<td class="wide">' + md(c)) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div></div>";
    }).join("");
  }

  function renderStage(st) {
    var sm = stageMeta(st.id);
    var idxInSeq = META.stages.indexOf(sm);
    var h = crumbs([{ label: "Map", href: ROOT + "index.html" }, { label: "Pipeline" }, { label: "Stage " + sm.num }]);
    var allTags = [];
    TECH_KEYS.forEach(function (k) { var v = st.tech && st.tech[k[0]]; if (v && v.l >= 2) allTags.push(k[0]); });
    h += '<header class="phead"><div class="eyebrow">Stage ' + sm.num + " of 14 · pipeline</div><h1>" + esc(st.title) + "</h1>" +
      '<p class="lede">' + md(st.purpose) + "</p>" +
      '<div class="metaline"><span>Version <b>' + esc(st.version) + "</b></span><span>Last verified <b>" + esc(st.last_verified) + "</b></span><span>" +
      (st.tools || []).length + " tools · " + (st.methods || []).length + " methods · " + (st.papers || []).length + " papers</span>" + tagList(allTags) + "</div>" +
      '<ul class="toc">' + SECTIONS.map(function (s, i) { return '<li><a href="#' + s[0] + '">' + String(i + 1).padStart(2, "0") + " " + esc(s[1]) + "</a></li>"; }).join("") + "</ul></header>";

    var out = [];
    /* 1 where */
    out.push(sec(0, "where", "Where you are",
      '<div class="diagram mini">' + pipelineSVG({ current: st.id, up: (st.upstream || []).map(function (u) { return u.id; }), down: (st.downstream || []).map(function (u) { return u.id; }) }) + "</div>" +
      '<div class="legend"><span><span class="sw box" style="background:var(--accent);border-color:var(--accent)"></span>this stage</span><span><span class="sw box" style="border:1.5px dashed var(--accent)"></span>upstream</span><span><span class="sw box" style="border:2px solid var(--accent)"></span>downstream</span><span><span class="sw fb"></span>feedback loop</span></div>' +
      '<div class="twocol" style="margin-top:1rem"><div class="panel"><h3>Upstream: what feeds this stage</h3><ul>' + stageLinkList(st.upstream) + '</ul></div><div class="panel"><h3>Downstream: what consumes its output</h3><ul>' + stageLinkList(st.downstream) + "</ul></div></div>"));
    /* 2 purpose */
    out.push(sec(1, "purpose", "Purpose", '<div class="callout big"><p>' + md(st.purpose) + "</p></div>"));
    /* 3 interface */
    var itf = st.interface || {};
    function ioTable(rows, dirLabel) {
      return '<div class="tablewrap"><table><thead><tr><th>' + dirLabel + "</th><th>Format</th><th>Rate / size</th><th>" + (dirLabel === "Input" ? "From" : "To") + "</th></tr></thead><tbody>" +
        (rows || []).map(function (r) { return "<tr><td><b>" + md(r.name) + "</b></td><td>" + md(r.format) + '</td><td class="wide">' + md(r.rate) + "</td><td>" + md(r.from || r.to) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    }
    out.push(sec(2, "interface", "Interface contract",
      '<div style="display:grid;gap:1rem">' + ioTable(itf.inputs, "Input") + ioTable(itf.outputs, "Output") +
      (itf.handoff ? '<div class="callout"><h4>Hand-off contract to the next stage</h4><div class="prose">' + paras(itf.handoff) + "</div></div>" : "") + "</div>"));
    /* 4 mental model */
    out.push(sec(3, "mental", "Mental model", '<div class="callout big"><p>' + md(st.mental_model) + "</p></div>" + (st.mental_detail ? '<div class="prose" style="margin-top:1rem">' + paras(st.mental_detail) + "</div>" : "")));
    /* 5 methods */
    out.push(sec(4, "methods", "Methods", '<div data-filtercount><div class="methods">' + (st.methods || []).map(function (m) {
      var ft = (m.tags || []).slice(); if (m.frontier) ft.push("frontier");
      return '<article class="method' + (m.frontier ? " is-frontier" : "") + '" id="m-' + esc(m.id) + '" data-ftags="' + esc(ft.join(" ")) + '"><div class="side"><h3>' + esc(m.name) + "</h3>" + tagList(m.tags) +
        (m.frontier_ref ? '<a class="small" href="' + viewUrl("view-frontier", "f-" + m.frontier_ref) + '">Frontier entry →</a>' : "") + '</div><div class="body">' + paras(m.summary) +
        ((m.pros || m.cons) ? '<div class="tradeoffs"><div><b>Strengths</b>' + md(m.pros) + "</div><div><b>Costs / failure modes</b>" + md(m.cons) + "</div></div>" : "") +
        (m.refs && m.refs.length ? '<div class="small muted">Refs: ' + m.refs.map(function (r) { return '<a href="' + esc(r.u) + '" target="_blank" rel="noopener">' + esc(r.t) + "</a>"; }).join(" · ") + "</div>" : "") +
        "</div></article>";
    }).join("") + "</div></div>" + extrasHtml(st.extras)));
    /* 6 decision */
    out.push(sec(5, "decision", "Decision guide", '<div class="tablewrap"><table><thead><tr><th>If…</th><th>Use…</th><th>Because…</th></tr></thead><tbody>' +
      (st.decision || []).map(function (d) { return '<tr><td class="wide">' + md(d["if"]) + '</td><td class="wide"><b>' + md(d.use) + '</b></td><td class="wide">' + md(d.why) + "</td></tr>"; }).join("") + "</tbody></table></div>"));
    /* 7 tools */
    out.push(sec(6, "tools", "Tool table", '<p class="small muted" style="margin-bottom:.6rem">Click a column header to sort. Rows respond to the filter chips in the top bar. Release dates were checked against official release pages or announcements on ' + esc(st.last_verified) + '; “rolling” means no tagged releases.</p>' + toolTable(st.tools || [], sm.num)));
    /* 8 where it runs */
    out.push(sec(7, "runs", "Where it runs", meterGrid(st.where || {}, WHERE_KEYS)));
    /* 9 technique tags */
    out.push(sec(8, "tags", "Technique tags", meterGrid(st.tech || {}, TECH_KEYS) + '<p class="small muted" style="margin-top:.5rem">Dots: 0 = not used, 1 = occasional, 2 = common, 3 = central. These values feed the [[v:matrix|What goes where]] matrix.</p>'.replace(/\[\[v:matrix\|What goes where\]\]/, '<a href="' + viewUrl("view-matrix") + '">What goes where</a>')));
    /* 10 stacks */
    var stk = st.stacks || {};
    function stackPanel(p, label) { if (!p) return ""; return '<div class="panel"><div class="eyebrow">' + label + "</div><h3>" + md(p.title) + "</h3><ul>" + (p.items || []).map(function (x) { return "<li>" + md(x) + "</li>"; }).join("") + "</ul>" + (p.note ? '<p class="small muted" style="margin-top:.6rem">' + md(p.note) + "</p>" : "") + "</div>"; }
    out.push(sec(9, "stacks", "Reference stacks", '<div class="twocol">' + stackPanel(stk.open, "Open-source stack") + stackPanel(stk.industry, "Industry stack (publicly known)") + "</div>"));
    /* 11 running example */
    var ex = st.example || {};
    out.push(sec(10, "example", "Running example", '<div class="prose">' + paras(ex.summary) + "</div>" +
      (ex.artifacts && ex.artifacts.length ? '<div class="tablewrap" style="margin-top:1rem"><table><thead><tr><th>Artifact</th><th>Format</th><th>Shape / rate</th><th>Consumed by</th></tr></thead><tbody>' +
        ex.artifacts.map(function (a) { return "<tr><td><b>" + md(a.artifact) + "</b></td><td>" + md(a.format) + '</td><td class="wide">' + md(a.shape) + "</td><td>" + md(a.consumer) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "") +
      (ex.humanoid ? '<div class="callout" style="margin-top:1rem"><h4>Humanoid trace: where it diverges</h4><div class="prose">' + paras(ex.humanoid) + "</div></div>" : "") +
      '<p class="small" style="margin-top:.6rem"><a href="' + viewUrl("view-traces", st.id) + '">See this hand-off in the full end-to-end trace →</a></p>'));
    /* 12 pitfalls */
    out.push(sec(11, "pitfalls", "Pitfalls & misconceptions", '<ul class="pitfalls">' + (st.pitfalls || []).map(function (p) { return "<li><b>" + md(p.t) + "</b>" + md(p.d) + "</li>"; }).join("") + "</ul>"));
    /* 13 numbers */
    out.push(sec(12, "numbers", "Numbers that matter", '<div class="tablewrap"><table><thead><tr><th>Quantity</th><th>Value</th><th>Source / basis</th></tr></thead><tbody>' +
      (st.numbers || []).map(function (n) { return '<tr><td class="wide">' + md(n.m) + '</td><td class="wide"><b>' + md(n.v) + '</b></td><td class="wide">' + md(n.s) + "</td></tr>"; }).join("") + "</tbody></table></div>"));
    /* 14 papers */
    out.push(sec(13, "papers", "Key papers & resources", '<ol class="papers">' + (st.papers || []).map(function (p) {
      return '<li><span class="yr">' + esc(p.year) + (p.venue ? " · " + esc(p.venue) : "") + '</span><a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.title) + '</a><span class="why">' + md(p.why) + "</span></li>";
    }).join("") + "</ol>"));
    /* 15 open problems */
    out.push(sec(14, "open", "Open problems", '<ul class="prose">' + (st.open_problems || []).map(function (o) { return "<li>" + md(o) + "</li>"; }).join("") + "</ul>"));
    /* 16 self-check */
    out.push(sec(15, "selfcheck", "Self-check", (st.self_check || []).map(function (q, i) {
      return '<details class="qa"><summary><span class="q">Q' + (i + 1) + "</span><span>" + md(q.q) + '</span></summary><div class="a">' + paras(q.a) + "</div></details>";
    }).join("")));

    h += out.join("");
    h += pagerFor(st.id);
    $("#content").innerHTML = h;
    $$("table.sortable-table").forEach(makeSortable);
    document.title = sm.num + " " + st.title + " · " + META.site;
  }

  /* ------------------------------------------------------------------ view renderers */
  var R = {};

  R["pipeline-master"] = function (el) {
    el.innerHTML = '<div class="diagram">' + pipelineSVG({}) + '</div><div class="legend"><span><span class="sw"></span>forward data / artifact flow</span><span><span class="sw fb"></span>feedback loop</span><span>Click any stage. Filter chips dim stages where that technique or location is not central (level ≥ 2).</span></div>';
  };

  R["stage-cards"] = function (el) {
    el.innerHTML = '<div class="tablewrap"><table><thead><tr><th>#</th><th>Stage</th><th>Purpose</th><th>Hand-off artifact</th></tr></thead><tbody>' +
      META.stages.map(function (sm) {
        var st = PAI.stages[sm.id];
        return '<tr data-ftags="' + esc(stageFtags(sm.id)) + '"><td class="mono">' + sm.num + '</td><td class="name"><a href="' + ROOT + sm.file + '"><b>' + esc(sm.title) + "</b></a></td><td class=\"wide\">" + (st ? md(st.purpose) : "") + '</td><td class="wide">' + (st && st.handoff_short ? md(st.handoff_short) : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  };

  R["changelog"] = function (el) {
    el.innerHTML = '<div class="tablewrap"><table><thead><tr><th>Date</th><th>Version</th><th>Stage</th><th>Change</th><th>Why</th><th>Source</th></tr></thead><tbody>' +
      META.changelog.map(function (c) { return '<tr><td class="date">' + esc(c.date) + "</td><td>" + esc(c.version) + "</td><td>" + esc(c.stage) + '</td><td class="wide">' + md(c.change) + '</td><td class="wide">' + md(c.why) + "</td><td>" + md(c.source) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  };

  R["matrix-where"] = function (el) {
    var cols = [["cloud", "where", "Cloud"], ["sim", "where", "Sim"], ["edge", "where", "Edge"], ["rl", "tech", "RL"], ["il", "tech", "IL"], ["classical", "tech", "Classical"], ["sim2real", "tech", "Sim2Real"], ["real2sim", "tech", "Real2Sim"], ["wam", "tech", "WAM / world model"], ["icl", "tech", "ICL"]];
    var h = '<div class="tablewrap"><table class="matrix"><thead><tr><th>Stage</th>' + cols.map(function (c) { return "<th>" + esc(c[2]) + "</th>"; }).join("") + "</tr></thead><tbody>";
    META.stages.forEach(function (sm) {
      var st = PAI.stages[sm.id]; if (!st) return;
      h += '<tr data-ftags="' + esc(stageFtags(sm.id)) + '"><th class="rowh" scope="row"><a href="' + ROOT + sm.file + '">' + sm.num + " " + esc(sm.short) + "</a></th>";
      cols.forEach(function (c) {
        var src = c[1] === "where" ? st.where : st.tech, v = (src && src[c[0]]) || { l: 0, n: "" };
        if (c[0] === "edge") { var r = st.where && st.where.robot; if (r && r.l > v.l) v = { l: r.l, n: r.n }; }
        h += '<td class="cell l' + v.l + '" data-v="' + v.l + '">' + dots(v.l) + (v.n ? '<span class="cn">' + md(v.n) + "</span>" : "") + "</td>";
      });
      h += "</tr>";
    });
    el.innerHTML = h + "</tbody></table></div>";
  };

  R["traces"] = function (el) {
    var h = "";
    META.stages.forEach(function (sm) {
      var st = PAI.stages[sm.id]; if (!st || !st.example) return;
      var ex = st.example;
      h += '<section class="sec" id="' + sm.id + '"><header><span class="num">' + sm.num + '</span><h2><a href="' + ROOT + sm.file + '#example">' + esc(st.title) + "</a></h2></header>" +
        '<div class="prose">' + paras(ex.summary) + "</div>" +
        (ex.artifacts && ex.artifacts.length ? '<div class="tablewrap" style="margin-top:.8rem"><table><thead><tr><th>Artifact</th><th>Format</th><th>Shape / rate</th><th>Consumed by</th></tr></thead><tbody>' +
          ex.artifacts.map(function (a) { return "<tr><td><b>" + md(a.artifact) + "</b></td><td>" + md(a.format) + '</td><td class="wide">' + md(a.shape) + "</td><td>" + md(a.consumer) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "") +
        (ex.humanoid ? '<div class="callout" style="margin-top:.8rem"><h4>Humanoid H-1: divergence</h4><div class="prose">' + paras(ex.humanoid) + "</div></div>" : "") + "</section>";
    });
    el.innerHTML = h;
  };

  R["modality-matrix"] = function (el) {
    var st = PAI.stages["stage-04"]; if (!st || !st.annotation_matrix) { el.textContent = "Stage 04 data not loaded."; return; }
    el.innerHTML = '<div class="tablewrap"><table class="sortable-table"><thead><tr><th class="sortable">Modality</th><th>What is labelled</th><th>Method</th><th>Tools</th><th>Stored as</th><th>Consumed by</th></tr></thead><tbody>' +
      st.annotation_matrix.map(function (r) { return '<tr id="mod-' + slug(r.modality) + '"><td class="name"><b>' + md(r.modality) + '</b></td><td class="wide">' + md(r.what) + '</td><td class="wide">' + md(r.method) + '</td><td class="wide">' + md(r.tools) + '</td><td class="wide">' + md(r.format) + '</td><td class="wide">' + md(r.consumer) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    $$("table.sortable-table", el).forEach(makeSortable);
  };

  R["paradigms"] = function (el) {
    var p = PAI.data.views && PAI.data.views.paradigms; if (!p) return;
    var h = '<div class="tablewrap"><table><thead><tr><th>Dimension</th>' + p.columns.map(function (c) { return "<th>" + esc(c.name) + "</th>"; }).join("") + "</tr></thead><tbody>";
    p.rows.forEach(function (r) {
      h += '<tr><th class="rowh" scope="row">' + esc(r.label) + "</th>" + p.columns.map(function (c) { return '<td class="wide">' + md(c[r.key]) + "</td>"; }).join("") + "</tr>";
    });
    el.innerHTML = h + "</tbody></table></div>";
  };

  R["architectures"] = function (el) {
    var a = PAI.data.views && PAI.data.views.architectures; if (!a) return;
    var h = '<div class="tablewrap"><table><thead><tr><th>Stage</th>' + a.columns.map(function (c) { return "<th>" + esc(c.name) + '<span class="what" style="text-transform:none;letter-spacing:0">' + esc(c.sub) + "</span></th>"; }).join("") + "</tr></thead><tbody>";
    a.rows.forEach(function (r) {
      var sm = stageMeta(r.stage);
      h += '<tr><th class="rowh" scope="row">' + (sm ? '<a href="' + ROOT + sm.file + '">' + sm.num + " " + esc(sm.short) + "</a>" : esc(r.stage)) + "</th>" + r.cells.map(function (c) { return '<td class="wide">' + md(c) + "</td>"; }).join("") + "</tr>";
    });
    el.innerHTML = h + "</tbody></table></div>";
  };

  R["runtime-table"] = function (el) {
    var rt = PAI.data.views && PAI.data.views.runtime; if (!rt) return;
    el.innerHTML = '<div class="tablewrap"><table class="sortable-table"><thead><tr><th class="sortable">Process</th><th class="sortable">Rate</th><th class="sortable">Compute</th><th class="sortable">Kind</th><th>Inputs</th><th>Outputs</th><th>If it misses a deadline or fails</th></tr></thead><tbody>' +
      rt.processes.map(function (p) { return '<tr><td class="name"><b>' + md(p.name) + '</b></td><td class="date" data-v="' + esc(p.hz) + '">' + md(p.rate) + "</td><td>" + md(p.compute) + "</td><td>" + md(p.kind) + '</td><td class="wide">' + md(p.inputs) + '</td><td class="wide">' + md(p.outputs) + '</td><td class="wide">' + md(p.failure) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    $$("table.sortable-table", el).forEach(makeSortable);
  };

  R["frontier"] = function (el) {
    var f = PAI.data.frontier; if (!f) return;
    var h = '<div data-filtercount><div class="fgrid">';
    f.items.forEach(function (it) {
      var ft = (it.tags || []).concat(["frontier"]);
      h += '<article class="fitem" id="f-' + esc(it.id) + '" data-ftags="' + esc(ft.join(" ")) + '"><div class="side"><h3>' + esc(it.name) + '</h3><span class="verdict verdict-' + esc(it.verdict) + '">' + esc(it.verdict) + "</span>" + maturity(it.readiness) + tagList(it.tags) +
        '<div class="small">' + (it.stages || []).map(function (s) { var sm = stageMeta(normStage(s)); return sm ? '<a href="' + ROOT + sm.file + '">' + sm.num + " " + esc(sm.short) + "</a>" : ""; }).join("<br>") + "</div></div>" +
        '<div class="body">' + paras(it.definition) + "<dl>" +
        "<dt>Differs from</dt><dd>" + md(it.differs) + "</dd>" +
        "<dt>Replaces / augments</dt><dd>" + md(it.replaces) + "</dd>" +
        "<dt>Key papers</dt><dd>" + (it.papers || []).map(function (p) { return '<a href="' + esc(p.u) + '" target="_blank" rel="noopener">' + esc(p.t) + "</a>" + (p.y ? ' <span class="muted mono">' + esc(p.y) + "</span>" : ""); }).join("<br>") + "</dd>" +
        "<dt>Open</dt><dd>" + md(it.open_impl || "—") + "</dd>" +
        "<dt>Closed</dt><dd>" + md(it.closed_impl || "—") + "</dd>" +
        "<dt>Readiness</dt><dd>" + md(it.readiness_note) + "</dd>" +
        "<dt>Verdict</dt><dd>" + md(it.verdict_note) + "</dd></dl></div></article>";
    });
    el.innerHTML = h + "</div></div>";
  };

  R["frontier-timeline"] = function (el) {
    var f = PAI.data.frontier; if (!f || !f.timeline) return;
    var ev = f.timeline.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var start = new Date("2025-04-01"), end = new Date("2026-10-31");
    var W = 1180, padL = 24, padR = 24, CW = 6.4, ROWH = 17;
    var span = end - start;
    function x(d) { return padL + (new Date(d) - start) / span * (W - padL - padR); }
    /* greedy row assignment, alternating preference above / below the axis */
    var up = [], dn = [], placed = [];
    ev.forEach(function (e, i) {
      var xx = x(e.date), w = e.label.length * CW + 60;
      var anchorEnd = xx + w > W - padR;
      var x0 = anchorEnd ? xx - w : xx, x1 = anchorEnd ? xx : xx + w;
      function fits(rows, r) { return !(rows[r] || []).some(function (iv) { return !(x1 < iv[0] - 4 || x0 > iv[1] + 4); }); }
      var order = i % 2 === 0 ? [up, dn] : [dn, up], chosen = null, row = 0;
      for (row = 0; row < 30 && !chosen; row++) {
        for (var k = 0; k < 2; k++) { if (fits(order[k], row)) { chosen = order[k]; break; } }
        if (chosen) break;
      }
      (chosen[row] = chosen[row] || []).push([x0, x1]);
      placed.push({ e: e, xx: xx, row: row, up: chosen === up, anchorEnd: anchorEnd });
    });
    var nUp = up.length, nDn = dn.length;
    var axisY = 20 + nUp * ROWH + 14, H = axisY + 34 + nDn * ROWH + 10;
    var s = '<svg class="tl" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Timeline of frontier events April 2025 to October 2026">';
    s += '<line class="axis" x1="' + padL + '" y1="' + axisY + '" x2="' + (W - padR) + '" y2="' + axisY + '"/>';
    for (var y = 2025, m = 3; ; ) {
      var d = new Date(Date.UTC(y, m, 1)); if (d > end) break;
      var xx = x(d.toISOString().slice(0, 10));
      s += '<line class="tick" x1="' + xx + '" y1="' + (axisY - 4) + '" x2="' + xx + '" y2="' + (axisY + 4) + '"/>';
      if (m % 3 === 0) s += '<text x="' + xx + '" y="' + (axisY + 18) + '" text-anchor="middle">' + (y + "-" + String(m + 1).padStart(2, "0")) + "</text>";
      m++; if (m > 11) { m = 0; y++; }
    }
    placed.forEach(function (p) {
      var ly = p.up ? axisY - 14 - p.row * ROWH : axisY + 36 + p.row * ROWH;
      s += '<line class="stem" x1="' + p.xx + '" y1="' + axisY + '" x2="' + p.xx + '" y2="' + (p.up ? ly + 4 : ly - 11) + '"/>';
    });
    placed.forEach(function (p) {
      var ly = p.up ? axisY - 14 - p.row * ROWH : axisY + 36 + p.row * ROWH;
      s += '<circle class="' + esc(p.e.kind) + '" cx="' + p.xx + '" cy="' + axisY + '" r="4.5"/>';
      var tx = p.anchorEnd ? p.xx - 3 : p.xx + 3;
      var tw = (p.e.label.length + 10) * 6.05;
      s += '<rect x="' + (p.anchorEnd ? tx - tw - 2 : tx - 2) + '" y="' + (ly - 11) + '" width="' + (tw + 4) + '" height="15" rx="2" style="fill:var(--surface)"/>';
      s += '<a href="' + (p.e.ref ? viewUrl("view-frontier", "f-" + p.e.ref) : "#timeline") + '"><text class="ev" x="' + tx + '" y="' + ly + '"' + (p.anchorEnd ? ' text-anchor="end"' : "") + '>' + esc(p.e.label) + " · " + esc(p.e.date.slice(0, 7)) + "</text></a>";
    });
    s += "</svg>";
    el.innerHTML = '<div class="diagram">' + s + '</div><div class="legend"><span><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4.5" style="fill:var(--frontier)"/></svg> breakthrough</span><span><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4.5" style="fill:var(--accent)"/></svg> important</span><span><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4.5" style="fill:var(--muted)"/></svg> incremental</span><span><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4.5" style="fill:var(--line-strong)"/></svg> infrastructure / regulation</span></div>';
  };

  R["glossary"] = function (el) {
    var g = PAI.data.glossary; if (!g) return;
    var terms = g.terms.slice().sort(function (a, b) { return a.term.toLowerCase() < b.term.toLowerCase() ? -1 : 1; });
    var letters = {};
    terms.forEach(function (t) { var L = t.term[0].toUpperCase(); if (!/[A-Z]/.test(L)) L = "#"; (letters[L] = letters[L] || []).push(t); });
    var keys = Object.keys(letters).sort();
    var h = '<ul class="toc" style="margin-bottom:1rem">' + keys.map(function (k) { return '<li><a href="#L-' + k + '">' + k + "</a></li>"; }).join("") + "</ul>";
    keys.forEach(function (k) {
      h += '<h2 id="L-' + k + '" style="margin:1.5rem 0 .5rem">' + k + '</h2><dl class="kv" style="grid-template-columns:minmax(0,14rem) minmax(0,1fr);gap:.6rem 1.2rem">';
      letters[k].forEach(function (t) {
        h += '<dt id="g-' + esc(t.id) + '" style="scroll-margin-top:5rem;font-family:var(--font-body);font-size:var(--fs-sm);color:var(--fg);font-weight:600">' + esc(t.term) + (t.aka && t.aka.length ? '<span class="what">' + esc(t.aka.join(", ")) + "</span>" : "") + "</dt>" +
          '<dd style="max-width:var(--measure)">' + md(t.def) + (t.see && t.see.length ? '<span class="what">See: ' + t.see.map(function (x) { return md(x); }).join(" · ") + "</span>" : "") + "</dd>";
      });
      h += "</dl>";
    });
    el.innerHTML = h;
  };

  R["roadmap"] = function (el) {
    var r = PAI.data.roadmap; if (!r) return;
    el.innerHTML = '<div class="methods">' + r.projects.map(function (p, i) {
      return '<article class="method" id="p-' + (i + 1) + '"><div class="side"><span class="eyebrow">Project ' + (i + 1) + " · " + esc(p.time) + "</span><h3>" + esc(p.title) + '</h3><div class="small">' + (p.stages || []).map(function (s) { var sm = stageMeta(normStage(s)); return sm ? '<a href="' + ROOT + sm.file + '">' + sm.num + " " + esc(sm.short) + "</a>" : ""; }).join("<br>") + '</div></div><div class="body">' + paras(p.what) +
        '<dl class="kv"><dt>Tools</dt><dd>' + md((p.tools || []).join(", ")) + "</dd><dt>Outcome</dt><dd>" + md(p.outcome) + "</dd><dt>Done when</dt><dd>" + md(p.done) + "</dd></dl></div></article>";
    }).join("") + "</div>";
  };

  R["selftest"] = function (el) {
    var c = PAI.data.capstone; if (!c) return;
    el.innerHTML = c.questions.map(function (q, i) {
      return '<details class="qa" id="c-' + (i + 1) + '"><summary><span class="q">Q' + (i + 1) + "</span><span>" + md(q.q) + '</span></summary><div class="a">' + paras(q.a) +
        (q.stages ? '<p class="small muted">Stages: ' + q.stages.map(function (s) { var sm = stageMeta(normStage(s)); return sm ? '<a href="' + ROOT + sm.file + '">' + sm.num + "</a>" : ""; }).join(" · ") + "</p>" : "") + "</div></details>";
    }).join("");
  };

  /* ------------------------------------------------------------------ boot */
  function boot() {
    buildRail(); buildTopbar(); buildFooter();
    if (PAGE === "stage") {
      var st = PAI.stages[PAGE_ID];
      if (st) renderStage(st); else $("#content").innerHTML = "<p>Stage data for " + esc(PAGE_ID) + " did not load. Check that data/" + esc(PAGE_ID) + ".js exists.</p>";
    } else {
      var vm = viewMeta(PAGE_ID);
      var cr = $("[data-crumbs]");
      if (cr && vm) cr.outerHTML = crumbs([{ label: "Map", href: ROOT + "index.html" }, { label: "Integration views" }, { label: vm.short }]);
      $$("[data-render]").forEach(function (el) { var fn = R[el.getAttribute("data-render")]; if (fn) fn(el); });
      var pg = $("[data-pager]"); if (pg) pg.outerHTML = pagerFor(PAGE === "index" ? "index" : PAGE_ID);
    }
    applyFilters();
    if (location.hash) {
      var t = document.getElementById(location.hash.slice(1));
      if (t) { if (t.tagName === "DETAILS") t.open = true; if (t.tagName === "TR") t.classList.add("flash"); t.scrollIntoView(); }
    }
  }
  boot();
})();
