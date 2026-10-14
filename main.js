// Fade sections in as they scroll into view.

const items = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  items.forEach((el) => observer.observe(el));
} else {
  items.forEach((el) => el.classList.add("is-visible"));
}

// Floating stickers down the home page margins, draggable anywhere on the page.
(function () {
  const layer = document.getElementById("stickers");
  const hero = document.querySelector(".hero");
  if (!layer || !hero) return;

  // Body moved to the end of <body> so stickers can float over every section.
  document.body.appendChild(layer);
  const stickers = [...layer.querySelectorAll(".sticker")];

  // Wide screens: hand-placed next to specific lines of the page.
  // [anchor element, side, share of the margin from the text, offset from the anchor's top, width, rotation]
  const chapters = () => document.querySelectorAll("#story .chapter h2");
  const WIDE = [
    [() => document.querySelector(".hero .note--hero"), "right", 0.11, -68, 140, 6],   // chip, by "It's a long story"
    [() => chapters()[0], "right", 0.19, 31, 166, -5],                                   // camera, by "Cars, then data."
    [() => document.querySelector(".thesis .big"), "left", 0.23, -31, 113, -8],         // film, by "Robots used to be…"
    [() => chapters()[2], "left", 0.41, 117, 104, 4],                                    // robot, by the brain-and-heart chapter
    [() => chapters()[4], "right", 0.38, -68, 96, 10],                                   // arm, by "Teaching humanoids."
  ];
  // Phones: a small row of stickers in the gap under the hero.
  const NARROW = [
    [0.02, 0, 58, 6],
    [0.22, 0, 66, -5],
    [0.46, 0, 46, -8],
    [0.63, 0, 42, 4],
    [0.8, 0, 38, 10],
  ];

  let z = 10;
  function place() {
    const wide = window.innerWidth >= 1300;
    const content = (hero.querySelector(".hero__title") || hero).getBoundingClientRect();
    const r = hero.getBoundingClientRect();
    let cursor = r.left + window.scrollX + 16;      // phones/tablets: a packed row under the hero
    stickers.forEach((el, i) => {
      if (el.dataset.moved) return;
      el.style.setProperty("--d", `${-i * 1.3}s`);
      if (wide) {
        const [anchor, side, frac, dy, w, rot] = WIDE[i];
        const target = anchor() || hero;
        const tr = target.getBoundingClientRect();
        const margin = side === "left" ? content.left : window.innerWidth - content.right;
        el.style.setProperty("--w", `${w}px`);
        el.style.setProperty("--r", `${rot}deg`);
        const x = side === "left"
          ? Math.min(content.left - frac * margin, content.left - w - 16)              // never over the text
          : Math.min(Math.max(content.right + frac * margin, content.right + 16), window.innerWidth - w - 8);
        el.style.left = `${x + window.scrollX}px`;
        el.style.top = `${tr.top + window.scrollY + dy}px`;
      } else {
        const [, , w, rot] = NARROW[i];
        el.style.setProperty("--w", `${w}px`);
        el.style.setProperty("--r", `${rot}deg`);
        el.style.left = `${cursor}px`;
        cursor += w + 10;
        el.style.top = `${r.top + window.scrollY + r.height - 70}px`;
      }
      el.classList.add("is-placed");
    });
  }

  addEventListener("load", place);
  addEventListener("resize", place);
  place();

  stickers.forEach((el) => {
    let sx, sy, bx, by, id = null;
    el.addEventListener("pointerdown", (e) => {
      id = e.pointerId;
      try { el.setPointerCapture(id); } catch (err) {}
      sx = e.pageX; sy = e.pageY;
      bx = parseFloat(el.style.left); by = parseFloat(el.style.top);
      el.style.zIndex = ++z;
      el.classList.add("is-dragging");
      e.preventDefault();
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const maxX = document.documentElement.scrollWidth - el.offsetWidth;
      el.style.left = `${Math.min(Math.max(0, bx + e.pageX - sx), maxX)}px`;
      el.style.top = `${Math.max(0, by + e.pageY - sy)}px`;
      el.dataset.moved = "1";
    });
    const end = (e) => { if (e.pointerId === id) { id = null; el.classList.remove("is-dragging"); } };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  });
})();
