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

  // Wide screens: one sticker per section, alternating margins down the page.
  // [section selector, side, how far down the section (0-1), width, rotation]
  const WIDE = [
    [".hero", "right", 0.05, 140, 6],          // chip
    [".story", "left", 0.38, 160, -5],         // camera
    [".thesis", "left", 0.12, 112, -8],        // film
    [".work", "right", 0.25, 106, 4],          // robot
    ["#working-with-me", "left", 0.2, 92, 10], // arm
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
        const [sel, side, fy, w, rot] = WIDE[i];
        const sec = document.querySelector(sel) || hero;
        const sr = sec.getBoundingClientRect();
        el.style.setProperty("--w", `${w}px`);
        el.style.setProperty("--r", `${rot}deg`);
        const gap = 70 + (i % 2) * 30;
        const x = side === "left" ? content.left - gap - w : content.right + gap;
        el.style.left = `${x + window.scrollX}px`;
        el.style.top = `${sr.top + window.scrollY + sr.height * fy}px`;
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
