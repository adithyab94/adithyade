'use strict';

const RL = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const rand = Math.random;
  const randint = (n) => Math.floor(Math.random() * n);
  let spare = null;
  function randn() {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u, v, s;
    do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * m;
    return u * m;
  }
  function argmaxRandom(arr, offset = 0, n = arr.length - offset) {
    let best = -Infinity, ties = 0, idx = 0;
    for (let i = 0; i < n; i++) {
      const v = arr[offset + i];
      if (v > best + 1e-12) { best = v; idx = i; ties = 1; }
      else if (Math.abs(v - best) <= 1e-12) { ties++; if (Math.random() * ties < 1) idx = i; }
    }
    return idx;
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');

  // ---- colors ----
  const SEQ = [[238, 242, 228], [205, 223, 200], [150, 196, 176], [104, 158, 196], [72, 112, 170]];
  function seq(t) {
    t = clamp(t, 0, 1) * (SEQ.length - 1);
    const i = Math.min(Math.floor(t), SEQ.length - 2), f = t - i;
    const a = SEQ[i], b = SEQ[i + 1];
    return `rgb(${lerp(a[0], b[0], f) | 0},${lerp(a[1], b[1], f) | 0},${lerp(a[2], b[2], f) | 0})`;
  }
  function diverge(v, maxAbs) {
    const t = clamp(v / (maxAbs || 1), -1, 1);
    const base = [244, 246, 238];
    const pos = [47, 125, 95], neg = [184, 69, 47];
    const c = t >= 0 ? pos : neg, f = Math.abs(t);
    return `rgb(${lerp(base[0], c[0], f) | 0},${lerp(base[1], c[1], f) | 0},${lerp(base[2], c[2], f) | 0})`;
  }
  const COLORS = ['#3e6fb0', '#c4673f', '#a8701a', '#2f7d5f', '#6b4fa8', '#5a8fb8', '#b8452f', '#a3e635'];

  // ---- canvas ----
  function fit(c) {
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || Number(c.getAttribute('width')) || 600;
    const h = Number(c.dataset.h || c.getAttribute('height') || 260);
    if (c._w !== w || c._h !== h || c._dpr !== dpr) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      c.style.height = h + 'px';
      c._w = w; c._h = h; c._dpr = dpr;
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function niceTicks(min, max, n = 5) {
    if (!(max > min)) { max = min + 1; }
    const span = max - min;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const r = step0 / mag;
    const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
    return ticks;
  }
  function tickLabel(v) {
    const a = Math.abs(v);
    if (a >= 10000) return (v / 1000).toFixed(0) + 'k';
    if (a >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    if (a === 0) return '0';
    if (a < 0.01) return v.toExponential(0);
    return String(+v.toFixed(3));
  }

  // series: [{data:[y...] | [[x,y]...], color, label, width, dash, x0, dx, fill}]
  function lineChart(c, series, o = {}) {
    const { ctx, w, h } = fit(c);
    const pad = { l: 52, r: 14, t: o.title ? 26 : 14, b: 38 };
    const pts = series.map((s) => {
      const d = s.data || [];
      if (d.length && Array.isArray(d[0])) return d;
      const x0 = s.x0 ?? 0, dx = s.dx ?? 1;
      return d.map((y, i) => [x0 + i * dx, y]);
    });
    let xmin = o.xMin, xmax = o.xMax, ymin = o.yMin, ymax = o.yMax;
    const all = pts.flat().filter((p) => Number.isFinite(p[1]));
    (o.points || []).forEach((p) => all.push([p.x, p.y]));
    if (xmin === undefined) xmin = all.length ? Math.min(...all.map((p) => p[0])) : 0;
    if (xmax === undefined) xmax = all.length ? Math.max(...all.map((p) => p[0])) : 1;
    if (ymin === undefined) ymin = all.length ? Math.min(...all.map((p) => p[1])) : 0;
    if (ymax === undefined) ymax = all.length ? Math.max(...all.map((p) => p[1])) : 1;
    if (ymax === ymin) { ymax += 1; ymin -= 1; }
    if (xmax === xmin) xmax = xmin + 1;
    const logX = !!o.logX, logY = !!o.logY;
    const tx = (x) => logX ? Math.log10(Math.max(x, 1e-12)) : x;
    const ty = (y) => logY ? Math.log10(Math.max(y, 1e-12)) : y;
    const X0 = tx(xmin), X1 = tx(xmax), Y0 = ty(ymin), Y1 = ty(ymax);
    const sx = (x) => pad.l + (tx(x) - X0) / (X1 - X0) * (w - pad.l - pad.r);
    const sy = (y) => h - pad.b - (ty(y) - Y0) / (Y1 - Y0) * (h - pad.t - pad.b);

    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.strokeStyle = 'rgba(35,34,32,0.07)';
    ctx.fillStyle = '#6f6e66';
    ctx.lineWidth = 1;
    const yt = logY ? decadeTicks(ymin, ymax) : niceTicks(ymin, ymax, o.yTicks || 5);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    yt.forEach((v) => { const y = sy(v); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.fillText(tickLabel(v), pad.l - 6, y); });
    const xt = logX ? decadeTicks(xmin, xmax) : niceTicks(xmin, xmax, o.xTicks || 6);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    xt.forEach((v) => { const x = sx(v); ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke(); ctx.fillText(tickLabel(v), x, h - pad.b + 5); });
    if (o.xLabel) { ctx.fillText(o.xLabel, (pad.l + w - pad.r) / 2, h - 16); }
    if (o.yLabel) { ctx.save(); ctx.translate(12, (pad.t + h - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(o.yLabel, 0, 0); ctx.restore(); }
    if (o.title) { ctx.textAlign = 'left'; ctx.fillStyle = '#232220'; ctx.font = '600 12.5px Inter, system-ui'; ctx.fillText(o.title, pad.l, 6); }

    ctx.save();
    ctx.beginPath(); ctx.rect(pad.l, pad.t - 2, w - pad.l - pad.r, h - pad.t - pad.b + 4); ctx.clip();
    (o.bars || []).forEach((b) => {
      ctx.fillStyle = b.color || 'rgba(35,34,32,0.08)';
      const bw = Math.max(1, sx(b.x + (b.w || 1)) - sx(b.x));
      ctx.fillRect(sx(b.x), sy(b.y), bw, sy(b.base ?? Math.max(ymin, 0)) - sy(b.y));
    });
    (o.hlines || []).forEach((l) => {
      ctx.strokeStyle = l.color || '#232220'; ctx.setLineDash(l.dash || [4, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(pad.l, sy(l.y)); ctx.lineTo(w - pad.r, sy(l.y)); ctx.stroke(); ctx.setLineDash([]);
      if (l.label) { ctx.fillStyle = l.color || '#232220'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(l.label, w - pad.r - 4, sy(l.y) - 2); }
    });
    (o.vlines || []).forEach((l) => {
      ctx.strokeStyle = l.color || '#232220'; ctx.setLineDash(l.dash || [4, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx(l.x), pad.t); ctx.lineTo(sx(l.x), h - pad.b); ctx.stroke(); ctx.setLineDash([]);
    });
    series.forEach((s, k) => {
      const p = pts[k];
      if (!p.length) return;
      ctx.strokeStyle = s.color || COLORS[k % COLORS.length];
      ctx.lineWidth = s.width || 2;
      ctx.setLineDash(s.dash || []);
      if (s.step) {
        ctx.beginPath();
        p.forEach(([x, y], i) => { const X = sx(x), Y = sy(y); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, sy(p[i - 1][1])), ctx.lineTo(X, Y); });
        ctx.stroke();
      } else if (s.dots) {
        ctx.fillStyle = s.color || COLORS[k % COLORS.length];
        p.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(sx(x), sy(y), s.r || 3, 0, 7); ctx.fill(); });
      } else {
        ctx.beginPath();
        let started = false;
        p.forEach(([x, y]) => { if (!Number.isFinite(y)) { started = false; return; } const X = sx(x), Y = sy(y); if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y); });
        ctx.stroke();
        if (s.fill) {
          ctx.lineTo(sx(p[p.length - 1][0]), sy(ymin)); ctx.lineTo(sx(p[0][0]), sy(ymin)); ctx.closePath();
          ctx.fillStyle = s.fill; ctx.fill();
        }
      }
      ctx.setLineDash([]);
    });
    (o.points || []).forEach((p) => {
      ctx.fillStyle = p.color || '#232220';
      ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), p.r || 5, 0, 7); ctx.fill();
      if (p.ring) { ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), (p.r || 5) + 5, 0, 7); ctx.stroke(); }
      if (p.label) { ctx.fillStyle = p.color || '#232220'; ctx.font = '600 11.5px Inter, system-ui'; ctx.textAlign = p.below ? 'center' : (p.align || 'left'); ctx.textBaseline = p.below ? 'top' : 'bottom'; ctx.fillText(p.label, sx(p.x) + (p.below ? 0 : p.align === 'right' ? -8 : 8), sy(p.y) + (p.below ? 10 : -6)); }
    });
    ctx.restore();

    if (o.legend !== false) {
      const labeled = series.filter((s) => s.label);
      if (labeled.length) {
        ctx.font = '11.5px Inter, system-ui'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        let x = w - pad.r - 8, y = pad.t + 10;
        const widths = labeled.map((s) => ctx.measureText(s.label).width + 26);
        const total = widths.reduce((a, b) => a + b, 0);
        if (total < w - pad.l - pad.r - 20) {
          x = w - pad.r - total;
          labeled.forEach((s, i) => {
            ctx.fillStyle = s.color || COLORS[series.indexOf(s) % COLORS.length];
            ctx.fillRect(x, y - 2, 14, 4);
            ctx.fillStyle = '#3d3c39'; ctx.fillText(s.label, x + 18, y);
            x += widths[i];
          });
        } else {
          const lw = Math.max(...widths);
          const lx = o.legendLeft ? pad.l + 8 : w - pad.r - lw - 8;
          ctx.fillStyle = 'rgba(251,252,248,0.94)';
          ctx.fillRect(lx - 6, y - 9, lw + 8, labeled.length * 15 + 4);
          labeled.forEach((s, i) => {
            ctx.fillStyle = s.color || COLORS[series.indexOf(s) % COLORS.length];
            ctx.fillRect(lx, y + i * 15 - 2, 14, 4);
            ctx.fillStyle = '#3d3c39'; ctx.fillText(s.label, lx + 18, y + i * 15);
          });
        }
      }
    }
    return { sx, sy, pad, w, h };
  }
  function decadeTicks(a, b) {
    const t = [];
    for (let e = Math.floor(Math.log10(Math.max(a, 1e-12))); e <= Math.ceil(Math.log10(b)); e++) t.push(Math.pow(10, e));
    return t.filter((v) => v >= a * 0.999 && v <= b * 1.001);
  }

  function smooth(arr, k) {
    const out = new Array(arr.length);
    let s = 0;
    for (let i = 0; i < arr.length; i++) {
      s += arr[i];
      if (i >= k) s -= arr[i - k];
      out[i] = s / Math.min(i + 1, k);
    }
    return out;
  }

  function arrow(ctx, x, y, dx, dy, len, color, width = 2) {
    const ex = x + dx * len, ey = y + dy * len;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    const hs = Math.max(4, len * 0.35), a = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(a) * 2, ey + Math.sin(a) * 2);
    ctx.lineTo(ex - Math.cos(a - 0.5) * hs, ey - Math.sin(a - 0.5) * hs);
    ctx.lineTo(ex - Math.cos(a + 0.5) * hs, ey - Math.sin(a + 0.5) * hs);
    ctx.closePath(); ctx.fill();
  }

  // Binds a range input to its <output> sibling and calls cb(value).
  function range(id, cb, format = (v) => v) {
    const inp = document.getElementById(id);
    const out = document.querySelector(`output[for="${id}"]`);
    const upd = (fire = true) => {
      const v = parseFloat(inp.value);
      if (out) out.textContent = format(v);
      if (fire && cb) cb(v);
    };
    inp.addEventListener('input', () => upd(true));
    upd(false);
    return () => parseFloat(inp.value);
  }

  function tabs(root) {
    const btns = $$('.tabs button', root);
    btns.forEach((b) => b.addEventListener('click', () => {
      btns.forEach((x) => x.classList.toggle('sel', x === b));
      $$('.tabpanel', root).forEach((p) => p.classList.toggle('on', p.dataset.tab === b.dataset.tab));
      root.dispatchEvent(new CustomEvent('tabchange', { detail: b.dataset.tab }));
    }));
  }

  // Runs work(i) in chunks so the UI stays responsive.
  function chunked(total, perChunk, work, onProgress, onDone) {
    let i = 0;
    let cancelled = false;
    function step() {
      if (cancelled) return;
      const end = Math.min(total, i + perChunk);
      for (; i < end; i++) work(i);
      if (onProgress) onProgress(i, total);
      if (i < total) setTimeout(step, 0); else if (onDone) onDone();
    }
    setTimeout(step, 0);
    return () => { cancelled = true; };
  }

  function onVisible(el, cb) {
    const io = new IntersectionObserver((es) => { es.forEach((e) => { if (e.isIntersecting) { cb(); io.disconnect(); } }); }, { rootMargin: '200px' });
    io.observe(el);
  }

  return { $, $$, rand, randint, randn, argmaxRandom, clamp, lerp, fmt, seq, diverge, COLORS, fit, lineChart, smooth, arrow, range, tabs, chunked, onVisible, niceTicks };
})();
