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

// Floating stickers around the hero: placed in the margins, draggable anywhere on the page.
(function () {
  const layer = document.getElementById("stickers");
  const hero = document.querySelector(".hero");
  if (!layer || !hero) return;

  // Body moved to the end of <body> so stickers can float over every section.
  document.body.appendChild(layer);
  const stickers = [...layer.querySelectorAll(".sticker")];

  // [x, y, width, rotation] as fractions of the hero box. Wide screens use the side margins.
  const WIDE = [
    [1.03, -0.02, 140, 6],   // chip, right of the headline
    [1.03, 0.66, 160, -5],   // camera, right, lower
    [-0.25, 0.04, 116, -8],  // film, left margin
    [-0.23, 0.56, 106, 4],   // robot, left margin
    [1.2, 0.34, 88, 10],     // arm, far right
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
    const r = hero.getBoundingClientRect();
    const top = r.top + window.scrollY, left = r.left + window.scrollX;
    const inner = hero.querySelector(".hero__title") || hero;
    const ir = inner.getBoundingClientRect();
    const wide = window.innerWidth >= 1300;
    const spots = wide ? WIDE : NARROW;
    const boxL = wide ? ir.left + window.scrollX : left + 16;
    const boxW = wide ? ir.width : r.width - 32;
    let cursor = boxL;                         // phones/tablets: pack the row from the left
    stickers.forEach((el, i) => {
      if (el.dataset.moved) return;
      const [fx, fy, w, rot] = spots[i];
      el.style.setProperty("--w", `${w}px`);
      el.style.setProperty("--r", `${rot}deg`);
      el.style.setProperty("--d", `${-i * 1.3}s`);
      if (wide) el.style.left = `${boxL + boxW * fx}px`;
      else { el.style.left = `${cursor}px`; cursor += w + 10; }
      el.style.top = wide ? `${top + r.height * fy}px` : `${top + r.height - 70}px`;
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
