// Offline: draggable prints, negatives that flip on tap, a lightbox, and writing filters.
(function () {
  "use strict";

  /* ---------- draggable prints ---------- */
  let z = 10;
  document.querySelectorAll(".print").forEach((print) => {
    let startX, startY, baseX, baseY, moved, pointer = null;

    print.addEventListener("pointerdown", (e) => {
      pointer = e.pointerId;
      print.setPointerCapture(pointer);
      startX = e.clientX;
      startY = e.clientY;
      baseX = parseFloat(print.dataset.dx || 0);
      baseY = parseFloat(print.dataset.dy || 0);
      moved = false;
      print.style.zIndex = ++z;
      print.classList.add("is-dragging");
    });

    print.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pointer) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      print.dataset.dx = baseX + dx;
      print.dataset.dy = baseY + dy;
      print.style.translate = `${baseX + dx}px ${baseY + dy}px`;
    });

    const end = (e) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      print.classList.remove("is-dragging");
      if (!moved) openLightbox(print);          // a click, not a drag
    };
    print.addEventListener("pointerup", end);
    print.addEventListener("pointercancel", end);
  });

  /* ---------- negatives: first tap shows the positive, second opens it ---------- */
  document.querySelectorAll(".neg").forEach((neg) => {
    neg.addEventListener("click", () => {
      const touch = matchMedia("(hover: none)").matches;
      if (touch && !neg.classList.contains("is-positive")) {
        neg.classList.add("is-positive");
        return;
      }
      openLightbox(neg);
    });
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
