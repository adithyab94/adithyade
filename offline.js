// Offline: draggable prints, negatives that flip on tap, a lightbox, and writing filters.
(function () {
  "use strict";

  /* ---------- light table: a new random hand on every visit ---------- */
  const data = document.getElementById("frames");
  const surface = document.getElementById("ltSurface");
  const frames = data ? JSON.parse(data.textContent) : [];
  const stocks = JSON.parse((document.getElementById("film-stocks") || {}).textContent || "[]");

  function shuffled(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const pad = (n) => String(n).padStart(2, "0");
  const caption = (f) => `${f.roll} · frame ${pad(f.n)}`;

  if (surface && frames.length) {
    const deck = shuffled(frames);
    const negatives = deck.slice(0, 8);
    // prints: prefer frames not already on the contact sheet
    const prints = (deck.length >= 12 ? deck.slice(8, 12) : shuffled(frames).slice(0, 4));

    /* contact sheet: two strips of four */
    document.querySelectorAll(".lt-sheet__strip").forEach((strip, s) => {
      const holder = strip.querySelector(".lt-sheet__frames");
      negatives.slice(s * 4, s * 4 + 4).forEach((f) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "neg";
        b.dataset.lightbox = "table";
        b.dataset.src = f.src;
        b.dataset.caption = caption(f);
        b.innerHTML = `<img src="${f.thumb}" alt="Frame ${f.n}, as a negative"><span class="neg__no">${f.n}</span>`;
        holder.appendChild(b);
      });
      const edge = strip.querySelector(".lt-sheet__edge");
      if (edge && stocks.length) edge.textContent = stocks[Math.floor(Math.random() * stocks.length)].toUpperCase();
    });

    /* prints: live in a layer on the whole page, so they can be dragged anywhere */
    const layer = document.createElement("div");
    layer.className = "print-layer";
    document.body.appendChild(layer);
    const order = [];

    const els = prints.map((f, i) => {
      const fig = document.createElement("figure");
      fig.className = "print";
      fig.dataset.lightbox = "table";
      fig.dataset.src = f.src;
      fig.dataset.caption = caption(f);
      fig.style.setProperty("--r", `${(Math.random() * 10 - 5).toFixed(1)}deg`);
      fig.innerHTML = `<span class="tape" aria-hidden="true"></span><img src="${f.thumb}" alt="Print of frame ${f.n}" draggable="false"><figcaption>${pad(f.n)} · ${f.roll}</figcaption>`;
      layer.appendChild(fig);
      order.push(fig);
      return fig;
    });

    const restack = () => order.forEach((el, k) => (el.style.zIndex = k + 1));
    restack();

    function place() {
      const r = surface.getBoundingClientRect();
      const top = r.top + window.scrollY, left = r.left + window.scrollX;
      const narrow = r.width < 600;
      els.forEach((el, i) => {
        if (el.dataset.moved) return;
        const jitter = () => (Math.random() - 0.5) * 0.05;
        const fx = narrow ? [0.05, 0.5, 0.1, 0.52][i] : [0.6, 0.76, 0.58, 0.77][i];
        const fy = narrow ? [0.3, 0.32, 0.53, 0.55][i] : [0.1, 0.16, 0.5, 0.54][i];
        el.style.left = `${left + r.width * (fx + jitter())}px`;
        el.style.top = `${top + r.height * (fy + jitter())}px`;
      });
    }
    place();
    addEventListener("resize", place);
    // images change heights as they load; re-place anything not yet moved
    els.forEach((el) => el.querySelector("img").addEventListener("load", place, { once: true }));

    els.forEach((print) => {
      let startX, startY, baseX, baseY, moved, pointer = null;

      print.addEventListener("pointerdown", (e) => {
        pointer = e.pointerId;
        try { print.setPointerCapture(pointer); } catch (err) {}
        startX = e.pageX;
        startY = e.pageY;
        baseX = parseFloat(print.style.left);
        baseY = parseFloat(print.style.top);
        moved = false;
        order.splice(order.indexOf(print), 1);
        order.push(print);
        restack();
        print.classList.add("is-dragging");
      });

      print.addEventListener("pointermove", (e) => {
        if (e.pointerId !== pointer) return;
        const dx = e.pageX - startX, dy = e.pageY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        const maxX = document.documentElement.scrollWidth - print.offsetWidth;
        print.style.left = `${Math.min(Math.max(0, baseX + dx), maxX)}px`;
        print.style.top = `${Math.max(0, baseY + dy)}px`;
      });

      const end = (e) => {
        if (e.pointerId !== pointer) return;
        pointer = null;
        print.classList.remove("is-dragging");
        if (moved) print.dataset.moved = "1";
        else openLightbox(print);             // a click, not a drag
      };
      print.addEventListener("pointerup", end);
      print.addEventListener("pointercancel", end);
    });
  }

  /* ---------- negatives: first tap shows the positive, second opens it ---------- */
  document.addEventListener("click", (e) => {
    const neg = e.target.closest(".neg");
    if (!neg) return;
    const touch = matchMedia("(hover: none)").matches;
    if (touch && !neg.classList.contains("is-positive")) {
      neg.classList.add("is-positive");
      return;
    }
    openLightbox(neg);
  });

  /* ---------- lightbox ---------- */
  const box = document.getElementById("lightbox");
  let group = [], index = 0;

  function show(i) {
    index = (i + group.length) % group.length;
    const el = group[index];
    box.querySelector(".lightbox__img").src = el.dataset.src;
    box.querySelector(".lightbox__img").alt = el.dataset.caption || "";
    box.querySelector(".lightbox__caption").textContent = el.dataset.caption || "";
  }

  function openLightbox(el) {
    if (!box) return;
    group = [...document.querySelectorAll(`[data-lightbox="${el.dataset.lightbox}"]`)];
    // a frame can appear as both a negative and a print: keep one of each source
    const seen = new Set();
    group = group.filter((g) => !seen.has(g.dataset.src) && seen.add(g.dataset.src));
    show(group.findIndex((g) => g.dataset.src === el.dataset.src));
    box.hidden = false;
    document.body.style.overflow = "hidden";
    box.querySelector(".lightbox__close").focus();
  }

  function close() {
    box.hidden = true;
    document.body.style.overflow = "";
  }

  if (box) {
    box.querySelector(".lightbox__close").addEventListener("click", close);
    box.querySelector(".lightbox__nav--prev").addEventListener("click", () => show(index - 1));
    box.querySelector(".lightbox__nav--next").addEventListener("click", () => show(index + 1));
    box.addEventListener("click", (e) => { if (e.target === box) close(); });
    document.addEventListener("keydown", (e) => {
      if (box.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") show(index + 1);
      if (e.key === "ArrowLeft") show(index - 1);
    });
  }

  document.querySelectorAll(".frame[data-lightbox]").forEach((f) => f.addEventListener("click", () => openLightbox(f)));

  /* ---------- writing filters ---------- */
  const chips = document.querySelectorAll(".chip[data-filter]");
  chips.forEach((chip) => chip.addEventListener("click", () => {
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
    const f = chip.dataset.filter;
    let shown = 0;
    document.querySelectorAll("#archive li[data-kind]").forEach((li) => {
      const on = f === "all" || li.dataset.kind === f;
      li.hidden = !on;
      if (on) shown++;
    });
    const empty = document.querySelector(".archive__empty");
    if (empty) empty.hidden = shown > 0;
  }));
})();
