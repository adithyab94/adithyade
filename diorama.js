// Footer diorama: a pastel street of the places I've lived, rising out of the page.
// Dharmapuri (gopuram) → Chennai Central → Nantes (Tour LU) → Ulm (Münster, Metzgerturm) → München (Frauenkirche),
// with townhouses in between. Needs the "three" import map on the page and a #stage with #labels.
(function () {
  const stage = document.getElementById('stage');
  if (!stage) return;

  Promise.all([
    import('three'),
    import('three/addons/geometries/RoundedBoxGeometry.js'),
    import('three/addons/environments/RoomEnvironment.js')
  ])
    .then(([THREE, { RoundedBoxGeometry }, { RoomEnvironment }]) => build(THREE, RoundedBoxGeometry, RoomEnvironment))
    .catch(err => { console.warn('Diorama failed to load', err); stage.hidden = true; });

  function build(THREE, RoundedBoxGeometry, RoomEnvironment) {
    const labelBox = document.getElementById('labels');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── palette ──────────────────────────────────────────────
    const P = {
      terracotta: 0xCB8D76, brick: 0xBC7864, blue: 0xB4C6CF, sage: 0x9FC0AF, mint: 0xBAD3C5,
      cream: 0xEEE6D6, mustard: 0xDAB874, pink: 0xE7C7C2, white: 0xF1EDE4, stone: 0xE9E2D3,
      stoneDk: 0xD8CFBD, roof: 0x88AF9C, roofDk: 0x6F988A, copper: 0x8FB9A5, slate: 0x939E99,
      tile: 0xBA7764, trim: 0xF6F3EB, glass: 0x5F6E6A, lit: 0xF7E4B5, iron: 0x434B48,
      gold: 0xD3AF63, glassRoof: 0xD4E4DE, clock: 0xF8F4E9, tower: 0x6E9585
    };

    // ── seeded random ───────────────────────────────────────
    let seed = 20260;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const rr = (a, b) => a + rnd() * (b - a);
    const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

    // ── renderer, scene, light ──────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe2dccf, 0.55));

    const sun = new THREE.DirectionalLight(0xfff3e2, 1.9);
    sun.position.set(-28, 38, 46);
    sun.target.position.set(0, 6, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -62, right: 62, top: 34, bottom: -24, near: 1, far: 200 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);

    const camera = new THREE.PerspectiveCamera(24, 2, 1, 400);
    const root = new THREE.Group();
    scene.add(root);

    // ── materials + geometry helpers ────────────────────────
    const mats = new Map();
    function mat(color, opts) {
      const key = color + JSON.stringify(opts || {});
      if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.82, metalness: 0 }, opts)));
      return mats.get(key);
    }
    const rbCache = new Map();
    function rbox(w, h, d, r) {
      const rad = Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002);
      const key = [w, h, d, rad].map(v => v.toFixed(3)).join();
      if (!rbCache.has(key)) rbCache.set(key, new RoundedBoxGeometry(w, h, d, 2, rad));
      return rbCache.get(key);
    }
    function frustumGeo(wB, dB, wT, dT, h) {
      const g = new THREE.BoxGeometry(wB, h, dB), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * wT / wB); p.setZ(i, p.getZ(i) * dT / dB); }
      g.computeVertexNormals();
      return g;
    }
    function gableGeo(w, d, h) { // ridge runs along z, base at y = 0
      const s = new THREE.Shape();
      s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
      const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
      g.translate(0, 0, -d / 2);
      return g;
    }
    function mesh(parent, geo, color, x, y, z, opts) {
      const m = new THREE.Mesh(geo, typeof color === 'number' ? mat(color, opts) : color);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    }
    // rounded block whose bottom sits at y
    const block = (parent, w, h, d, color, x, y, z, r = 0.05) => mesh(parent, rbox(w, h, d, r), color, x, y + h / 2, z);
    const cone = (parent, r, h, color, x, y, z, seg = 8, opts) => mesh(parent, new THREE.ConeGeometry(r, h, seg), color, x, y + h / 2, z, opts);
    const cyl = (parent, rt, rb, h, color, x, y, z, seg = 12, opts) => mesh(parent, new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + h / 2, z, opts);

    // ── windows: collected per building, drawn as two instanced meshes ──
    const UNIT = new THREE.BoxGeometry(1, 1, 1);
    const paneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.05 });
    const panes = []; // every pane, for the lights that come on and off
    const facade = trim => ({ trim, panes: [], trims: [] });
    const trimBox = (F, x, y, z, w, h, d) => F.trims.push([x, y, z, w, h, d]);
    function windowAt(F, x, y, z, w, h, o = {}) { // z is the wall surface
      F.panes.push([x, y, z + 0.012, w, h, 0.05, o.lit]);
      trimBox(F, x, y - h / 2 - 0.04, z + 0.06, w + 0.18, 0.07, 0.14);          // sill
      trimBox(F, x, y + h / 2 + 0.045, z + 0.04, w + 0.12, 0.08, 0.09);         // head
      trimBox(F, x - w / 2 - 0.03, y, z + 0.035, 0.06, h + 0.02, 0.07);         // jambs
      trimBox(F, x + w / 2 + 0.03, y, z + 0.035, 0.06, h + 0.02, 0.07);
      if (!o.plain) {
        trimBox(F, x, y, z + 0.03, 0.035, h, 0.04);                           // mullion
        trimBox(F, x, y + h * 0.16, z + 0.03, w, 0.035, 0.04);                // transom
      }
    }
    function grid(F, w, z, y0, floors, fh, o = {}) {
      const cols = o.cols ?? Math.max(2, Math.round((w - 0.4) / 0.95));
      const pad = o.pad ?? 0.36, sp = (w - pad * 2) / cols;
      const ww = o.ww ?? Math.min(0.46, sp * 0.56), wh = o.wh ?? 0.6;
      for (let f = 0; f < floors; f++)
        for (let c = 0; c < cols; c++)
          windowAt(F, -w / 2 + pad + sp * (c + 0.5) + (o.x || 0), y0 + f * fh + fh * 0.52, z, ww, wh, o);
      return { cols, sp, pad, ww, wh };
    }
    function finish(F, G) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Color();
      if (F.panes.length) {
        const im = new THREE.InstancedMesh(UNIT, paneMat, F.panes.length);
        F.panes.forEach((p, i) => {
          im.setMatrixAt(i, m4.compose(v.set(p[0], p[1], p[2]), q, s.set(p[3], p[4], p[5])));
          const lit = p[6] ?? rnd() < 0.1;
          im.setColorAt(i, c.setHex(lit ? P.lit : P.glass));
          panes.push({ im, i, lit });
        });
        im.receiveShadow = true;
        G.add(im);
      }
      if (F.trims.length) {
        const im = new THREE.InstancedMesh(UNIT, mat(F.trim), F.trims.length);
        F.trims.forEach((p, i) => im.setMatrixAt(i, m4.compose(v.set(p[0], p[1], p[2]), q, s.set(p[3], p[4], p[5]))));
        im.castShadow = im.receiveShadow = true;
        G.add(im);
      }
    }
    // a tall pointed (gothic) window: a pane with a diamond on top
    function pointed(G, F, x, y, z, w, h) {
      F.panes.push([x, y, z + 0.012, w, h, 0.05, false]);
      const d = mesh(G, rbox(w * 0.71, w * 0.71, 0.05, 0.01), P.glass, x, y + h / 2, z + 0.012);
      d.rotation.z = Math.PI / 4;
    }

    // ── townhouse parts ─────────────────────────────────────
    function dormer(G, F, x, y, z, color) {
      block(G, 0.62, 0.62, 0.7, color, x, y, z, 0.04);
      windowAt(F, x, y + 0.31, z + 0.35, 0.3, 0.36, { plain: true });
      const cap = mesh(G, rbox(0.48, 0.48, 0.8, 0.03), P.roofDk, x, y + 0.64, z);
      cap.rotation.z = Math.PI / 4;
    }
    function chimney(G, x, y, z, h) {
      block(G, 0.34, h, 0.34, P.terracotta, x, y, z, 0.03);
      block(G, 0.44, 0.08, 0.44, P.stoneDk, x, y + h, z, 0.02);
    }
    function balcony(G, x, y, z, w) {
      block(G, w + 0.32, 0.06, 0.34, P.trim, x, y, z + 0.17, 0.02);
      block(G, w + 0.32, 0.03, 0.03, P.iron, x, y + 0.34, z + 0.32, 0.01);
      for (let i = 0; i <= 6; i++) block(G, 0.018, 0.34, 0.018, P.iron, x - (w + 0.3) / 2 + i * (w + 0.3) / 6, y + 0.04, z + 0.32, 0.005);
    }
    function glassLantern(G, x, y, z, w) {
      const d = w * 0.72;
      block(G, w, 0.3, d, P.roofDk, x, y, z, 0.04);
      mesh(G, frustumGeo(w - 0.12, d - 0.12, w * 0.5, 0.06, 0.8), P.glassRoof, x, y + 0.7, z, { roughness: 0.12, metalness: 0.1, flatShading: true });
      for (let i = 1; i < 5; i++) block(G, 0.03, 0.03, d - 0.1, P.trim, x - w / 2 + i * w / 5, y + 0.3, z, 0.01);
    }
    function dutchGable(G, F, w, d, top, body, trim) {
      const z = d / 2 - 0.2;
      let y = top;
      [[w * 0.8, 0.72], [w * 0.56, 0.7], [w * 0.32, 0.72]].forEach(([sw, sh]) => {
        block(G, sw, sh, 0.4, body, 0, y, z, 0.04);
        block(G, sw + 0.14, 0.08, 0.5, trim, 0, y + sh, z, 0.02);
        y += sh + 0.08;
      });
      windowAt(F, 0, top + 0.36, z + 0.2, 0.34, 0.44, { plain: true });
      const rw = mesh(G, new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24), P.glass, 0, top + 1.16, z + 0.21);
      rw.rotation.x = Math.PI / 2;
      mesh(G, new THREE.TorusGeometry(0.19, 0.04, 8, 24), trim, 0, top + 1.16, z + 0.23);
      mesh(G, gableGeo(w - 0.3, d - 0.6, 1.7), P.roof, 0, top, -0.3, { flatShading: true });
    }

    function townhouse(o) {
      const G = new THREE.Group(), trim = o.trim ?? P.trim, F = facade(trim);
      const fh = 1.0, w = o.w, d = o.d ?? 3.2, H = o.floors * fh + 0.35;
      block(G, w, H + 3, d, o.body, 0, -3, 0, 0.06);
      block(G, w + 0.06, 0.1, d + 0.06, trim, 0, fh + 0.28, 0, 0.03);         // string course
      block(G, w + 0.24, 0.2, d + 0.24, trim, 0, H, 0, 0.05);                 // cornice
      const g = grid(F, w, d / 2, 0.3, o.floors, fh, { cols: o.cols });
      if (o.balconies)
        for (const f of [1, 3]) if (f < o.floors)
          for (const c of [0, g.cols - 1]) balcony(G, -w / 2 + g.pad + g.sp * (c + 0.5), 0.3 + f * fh + 0.18, d / 2, g.ww);
      const top = H + 0.2;
      if (o.roof === 'mansard') {
        const mh = 1.15, rc = o.roofColor ?? P.roof;
        mesh(G, frustumGeo(w + 0.12, d + 0.12, w - 0.7, d - 0.9, mh), rc, 0, top + mh / 2, 0, { flatShading: true });
        block(G, w - 0.66, 0.12, d - 0.86, P.roofDk, 0, top + mh, 0, 0.03);
        for (let c = 0; c < g.cols; c++) {
          if (g.cols > 4 && c % 2) continue;
          dormer(G, F, -w / 2 + g.pad + g.sp * (c + 0.5), top + 0.12, d / 2 - 0.42, rc);
        }
        if (rnd() < 0.75) chimney(G, rr(-w / 2 + 0.5, w / 2 - 0.5), top, -0.5, mh + 0.55);
      } else if (o.roof === 'gable') {
        dutchGable(G, F, w, d, top, o.body, trim);
        if (rnd() < 0.6) chimney(G, w / 2 - 0.55, top, -0.8, 1.3);
      } else {
        block(G, w - 0.1, 0.14, d - 0.1, P.roof, 0, top, 0, 0.03);
        if (o.extra === 'box') block(G, Math.min(1.6, w - 1), 0.6, 1.3, P.terracotta, rr(-0.4, 0.4), top + 0.14, -0.3, 0.06);
        if (o.extra === 'glass') glassLantern(G, 0, top + 0.14, -0.2, Math.min(2.3, w - 0.9));
        if (rnd() < 0.5) chimney(G, -w / 2 + 0.5, top + 0.14, -0.9, 0.6);
      }
      finish(F, G);
      return G;
    }

    // a plain taller building for the back row, peeking over the street
    function backBuilding(o) {
      const G = new THREE.Group(), F = facade(o.trim ?? P.trim), d = o.d ?? 3;
      const H = o.floors * 1.0 + 0.3;
      block(G, o.w, H + 3, d, o.body, 0, -3, 0, 0.06);
      block(G, o.w + 0.2, 0.18, d + 0.2, o.trim ?? P.trim, 0, H, 0, 0.04);
      grid(F, o.w, d / 2, 0.3, o.floors, 1.0, o.glassy ? { plain: true, ww: 0.62, wh: 0.78 } : {});
      if (o.extra === 'glass') glassLantern(G, 0, H + 0.18, -0.2, Math.min(2.2, o.w - 0.6));
      else block(G, o.w * 0.5, 0.5, 1.2, o.trim ?? P.trim, 0, H + 0.18, -0.3, 0.05);
      finish(F, G);
      return G;
    }

    // ── landmarks ──────────────────────────────────────────
    const clockHands = {};
    // India Standard Time is UTC+5:30 all year (no daylight saving)
    const chennaiNow = () => new Date(Date.now() + 5.5 * 3600e3);
    const pad2 = n => String(n).padStart(2, '0');
    function setChennaiClock() {
      const d = chennaiNow();
      const sec = d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
      const min = d.getUTCMinutes() + sec / 60;
      const hr = (d.getUTCHours() % 12) + min / 60;
      clockHands.h.rotation.z = -hr / 12 * Math.PI * 2;
      clockHands.m.rotation.z = -min / 60 * Math.PI * 2;
      clockHands.s.rotation.z = -Math.floor(sec) / 60 * Math.PI * 2;
    }

    function chennaiCentral() {
      const G = new THREE.Group(), F = facade(P.trim), red = 0xC07A66;
      const W = 11.2, d = 3.4, fh = 1.05, H = 3 * fh + 0.3;
      block(G, W, H + 3, d, red, 0, -3, 0);
      for (const y of [fh + 0.24, 2 * fh + 0.24]) block(G, W + 0.05, 0.09, d + 0.05, P.trim, 0, y, 0, 0.03);
      block(G, W + 0.2, 0.18, d + 0.2, P.trim, 0, H, 0);
      for (let f = 0; f < 3; f++)
        for (const x of [-3.15, -2.4, -1.65, 1.65, 2.4, 3.15]) windowAt(F, x, 0.3 + f * fh + fh * 0.52, d / 2, 0.36, 0.66);
      mesh(G, frustumGeo(W - 0.3, d, W - 2.6, 0.3, 1.1), P.slate, 0, H + 0.18 + 0.55, 0, { flatShading: true });
      // corner pavilions with pyramid roofs and white finials
      for (const s of [-1, 1]) {
        const px = s * (W / 2 - 1.25), pd = d + 0.5, pz = 0.25, ph = H + 1.1;
        block(G, 2.5, ph + 3, pd, red, px, -3, pz);
        block(G, 2.7, 0.18, pd + 0.2, P.trim, px, ph, pz);
        for (let f = 0; f < 4; f++) for (const dx of [-0.48, 0.48]) windowAt(F, px + dx, 0.3 + f * fh + fh * 0.52, pz + pd / 2, 0.34, 0.6);
        mesh(G, frustumGeo(2.5, pd, 0.06, 0.06, 1.7), P.slate, px, ph + 0.18 + 0.85, pz, { flatShading: true });
        cone(G, 0.1, 0.9, P.trim, px, ph + 1.85, pz);
      }
      // the clock tower
      const tz = 0.95, tw = 2.3, face = tz + tw / 2;
      block(G, tw, 10.5, tw, red, 0, -3, tz);
      for (const y of [H, 5.25, 7.35]) block(G, tw + 0.16, 0.14, tw + 0.16, P.trim, 0, y, tz, 0.03);
      for (const dx of [-0.42, 0.42]) windowAt(F, dx, 4.35, face, 0.34, 0.85);
      const cf = mesh(G, new THREE.CylinderGeometry(0.6, 0.6, 0.08, 48), P.clock, 0, 6.3, face + 0.04);
      cf.rotation.x = Math.PI / 2;
      mesh(G, new THREE.TorusGeometry(0.62, 0.06, 10, 48), P.trim, 0, 6.3, face + 0.06);
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        const tick = mesh(G, UNIT, P.iron, Math.sin(a) * 0.5, 6.3 + Math.cos(a) * 0.5, face + 0.09);
        tick.scale.set(0.03, 0.09, 0.02); tick.rotation.z = -a;
      }
      // hands pivot at the centre of the face; the loop sets them to Chennai time
      const hand = (len, w, color, z) => {
        const pivot = new THREE.Group();
        pivot.position.set(0, 6.3, face + z);
        const h = mesh(pivot, UNIT, color, 0, len / 2 - 0.06, 0);
        h.scale.set(w, len + 0.12, 0.02);
        G.add(pivot);
        return pivot;
      };
      clockHands.h = hand(0.32, 0.05, P.iron, 0.11);
      clockHands.m = hand(0.47, 0.035, P.iron, 0.13);
      clockHands.s = hand(0.5, 0.012, P.tile, 0.15);
      mesh(G, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), P.iron, 0, 6.3, face + 0.17).rotation.x = Math.PI / 2;
      block(G, tw + 0.32, 0.2, tw + 0.32, P.trim, 0, 7.5, tz);
      block(G, 1.7, 1.3, 1.7, red, 0, 7.7, tz);
      for (const dx of [-0.35, 0.35]) windowAt(F, dx, 8.35, tz + 0.85, 0.26, 0.6, { plain: true });
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cone(G, 0.12, 0.75, P.trim, a * 1.0, 7.7, tz + b * 1.0);
      block(G, 1.95, 0.16, 1.95, P.trim, 0, 9.0, tz);
      cyl(G, 0.72, 0.8, 0.4, P.trim, 0, 9.16, tz, 8);
      cone(G, 0.76, 2.3, 0xD7DAD4, 0, 9.56, tz, 8);
      mesh(G, new THREE.SphereGeometry(0.14, 16, 12), P.trim, 0, 11.9, tz);
      cyl(G, 0.025, 0.025, 0.6, P.iron, 0, 11.95, tz, 6);
      finish(F, G);
      return G;
    }

    // a limb from a to b (cylinder oriented between two points)
    const UP = new THREE.Vector3(0, 1, 0);
    function limb(parent, a, b, r, color, opts) {
      const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
      const m = mesh(parent, new THREE.CylinderGeometry(r * 0.85, r, len, 10), color, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, opts);
      m.quaternion.setFromUnitVectors(UP, dir.normalize());
      return m;
    }

    // Dharmapuri roundabout: Adhiyaman offering the nellikkani to Avvaiyar, on a striped base
    function adhiyamanStatue(parent, x, z) {
      const S = new THREE.Group(), V = THREE.Vector3;
      // lifted and enlarged so it clears the bottom edge and reads at footer size
      S.position.set(x, 1.0, z);
      S.scale.setScalar(1.5);
      parent.add(S);
      const gold = { roughness: 0.5, metalness: 0.12 }, G0 = 0xEBD59E;
      // roundabout: black-and-white striped kerb, yellow rim, grass
      const R = 1.35, n = 20;
      cyl(S, R, R, 0.55, P.trim, 0, -0.3, 0, 40);
      for (let k = 0; k < n; k += 2) {
        const a = (k + 0.5) / n * Math.PI * 2;
        const seg = mesh(S, new THREE.BoxGeometry(2 * R * Math.sin(Math.PI / n) + 0.01, 0.55, 0.03), P.iron, Math.sin(a) * (R + 0.005), -0.025, Math.cos(a) * (R + 0.005));
        seg.rotation.y = a;
      }
      cyl(S, R + 0.04, R + 0.04, 0.08, P.mustard, 0, 0.25, 0, 40);
      cyl(S, R - 0.1, R - 0.1, 0.06, P.sage, 0, 0.3, 0, 40);
      cyl(S, 0.75, 0.82, 0.3, P.mustard, 0, 0.32, 0, 24);          // statue plinth
      const y0 = 0.62;
      // Adhiyaman: taller, crowned, holding out the fruit
      const ax = 0.36;
      cyl(S, 0.2, 0.3, 0.95, G0, ax, y0, 0, 14, gold);
      cyl(S, 0.18, 0.2, 0.5, G0, ax, y0 + 0.95, 0, 14, gold);
      mesh(S, new THREE.SphereGeometry(0.13, 16, 12), G0, ax, y0 + 1.58, 0, gold);
      cyl(S, 0.08, 0.12, 0.22, G0, ax, y0 + 1.68, 0, 10, gold);         // crown
      cone(S, 0.06, 0.14, G0, ax, y0 + 1.9, 0, 8, gold);
      limb(S, new V(ax - 0.05, y0 + 1.36, 0.05), new V(ax - 0.38, y0 + 1.22, 0.12), 0.05, G0, gold);
      mesh(S, new THREE.SphereGeometry(0.055, 12, 10), P.sage, ax - 0.44, y0 + 1.22, 0.13);   // the nellikkani
      limb(S, new V(ax + 0.14, y0 + 1.36, 0), new V(ax + 0.2, y0 + 0.95, 0.02), 0.045, G0, gold);
      // Avvaiyar: smaller, leaning in, hands out to receive
      const vx = -0.4, A = new THREE.Group();
      A.position.set(vx, y0, 0);
      A.rotation.z = -0.08;
      S.add(A);
      cyl(A, 0.17, 0.3, 0.85, G0, 0, 0, 0, 14, gold);
      cyl(A, 0.15, 0.17, 0.45, G0, 0.02, 0.85, 0, 14, gold);
      mesh(A, new THREE.SphereGeometry(0.12, 16, 12), G0, 0.06, 1.42, 0, gold);
      mesh(A, new THREE.SphereGeometry(0.07, 12, 10), G0, -0.06, 1.47, -0.04, gold);  // hair bun
      limb(A, new V(0.06, 1.22, 0.06), new V(0.32, 1.14, 0.13), 0.045, G0, gold);
      limb(A, new V(0.04, 1.2, -0.06), new V(0.3, 1.12, 0.06), 0.04, G0, gold);
      return S;
    }

    // Dharmapuri: a temple gopuram between striped compound walls
    function gopuram() {
      const G = new THREE.Group(), F = facade(P.trim);
      const base = 0xE8DECB, tiers = 6, th = 0.9;
      // plinth with the gateway
      block(G, 5.0, 6.2, 3.6, base, 0, -3, 0);
      block(G, 5.2, 0.16, 3.8, P.trim, 0, 3.2, 0, 0.04);
      F.panes.push([0, 1.4, 1.812, 1.0, 2.6, 0.05, false]);
      for (const dx of [-1.6, 1.6]) windowAt(F, dx, 1.9, 1.8, 0.34, 0.7, { plain: true });
      // the stepped tower: each tier narrower, with a terracotta ledge and a row of niches
      let y = 3.36, w = 4.6, d = 3.2;
      for (let i = 0; i < tiers; i++) {
        const body = i % 2 ? P.mustard : P.cream;
        block(G, w, th, d, body, 0, y, 0, 0.04);
        block(G, w + 0.2, 0.12, d + 0.2, P.terracotta, 0, y + th, 0, 0.03);
        const n = Math.max(1, Math.round(w / 1.1));
        for (let k = 0; k < n; k++) {
          const x = -w / 2 + (k + 0.5) * w / n;
          F.panes.push([x, y + th * 0.48, d / 2 + 0.012, 0.22, 0.42, 0.05, false]);
          mesh(G, new THREE.SphereGeometry(0.08, 10, 8), P.copper, x, y + th + 0.17, d / 2 + 0.02);
        }
        y += th + 0.12; w -= 0.42; d -= 0.24;
      }
      // barrel-vault crown with gold kalasams
      const vlen = w + 0.5, vr = 0.62;
      const vault = mesh(G, new THREE.CylinderGeometry(vr, vr, vlen, 24, 1, false, 0, Math.PI), P.terracotta, 0, y, 0);
      vault.rotation.z = Math.PI / 2;
      for (const s of [-1, 1]) block(G, 0.18, 0.5, 0.18, P.trim, s * (vlen / 2 + 0.05), y, 0, 0.03);
      for (let k = 0; k < 5; k++) {
        const x = -vlen / 2 + 0.25 + k * (vlen - 0.5) / 4;
        mesh(G, new THREE.SphereGeometry(0.15, 14, 10), P.gold, x, y + vr + 0.1, 0);
        cone(G, 0.06, 0.32, P.gold, x, y + vr + 0.2, 0, 8);
      }
      // compound walls with the red-and-white temple stripes
      for (const s of [-1, 1]) {
        const ww = 2.8, wx = s * (2.5 + ww / 2);
        block(G, ww, 5.4, 1.4, P.trim, wx, -3, 0.6, 0.04);
        for (let k = 0; k < 7; k++) {
          if (k % 2) continue;
          block(G, ww / 7, 2.3, 0.03, P.terracotta, wx - ww / 2 + (k + 0.5) * ww / 7, 0, 1.31, 0.005);
        }
        block(G, ww + 0.1, 0.12, 1.5, P.terracotta, wx, 2.4, 0.6, 0.03);
      }
      adhiyamanStatue(G, 0, 3.0);
      finish(F, G);
      return G;
    }

    function tourLU() {
      const G = new THREE.Group(), F = facade(P.trim), body = 0xEFE7D6, w = 2.6, H = 7.4;
      block(G, w, H + 3, w, body, 0, -3, 0);
      for (const s of [-1, 1]) block(G, 0.24, H, 0.24, P.trim, s * (w / 2 - 0.05), 0, w / 2 - 0.05, 0.04); // corner pilasters
      for (let f = 0; f < 6; f++) for (const dx of [-0.48, 0.48]) windowAt(F, dx, 0.6 + f * 1.1, w / 2, 0.36, 0.72);
      block(G, w + 0.3, 0.22, w + 0.3, P.trim, 0, H, 0);
      cyl(G, 1.05, 1.15, 1.5, body, 0, H + 0.22, 0, 8);
      windowAt(F, 0, H + 0.95, 1.07, 0.3, 0.6, { plain: true });
      cyl(G, 1.22, 1.22, 0.14, P.trim, 0, H + 1.72, 0, 24);
      const dome = mesh(G, new THREE.SphereGeometry(1.06, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), P.copper, 0, H + 1.86, 0);
      dome.scale.y = 1.25;
      cyl(G, 0.3, 0.3, 0.6, P.trim, 0, H + 3.15, 0, 12);
      const cap = mesh(G, new THREE.SphereGeometry(0.34, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), P.copper, 0, H + 3.75, 0);
      cap.scale.y = 1.2;
      mesh(G, new THREE.SphereGeometry(0.1, 12, 10), P.gold, 0, H + 4.25, 0);
      cone(G, 0.035, 0.55, P.gold, 0, H + 4.3, 0, 6);
      finish(F, G);
      return G;
    }

    function ulmMunster() {
      const G = new THREE.Group(), F = facade(P.stoneDk), st = P.stone;
      // nave, long side to the street
      const nx = 1.7, nw = 6.4, nh = 5.6, nd = 4, nz = -1.0;
      block(G, nw, nh + 3, nd, st, nx, -3, nz);
      for (let i = 0; i < 4; i++) pointed(G, F, nx - 2.25 + i * 1.5, 2.9, nz + nd / 2, 0.55, 2.4);
      for (let i = 0; i < 5; i++) {
        const bx = nx - 3.0 + i * 1.5;
        block(G, 0.3, nh - 0.5, 0.5, st, bx, 0, nz + nd / 2 + 0.2, 0.04);
        cone(G, 0.13, 0.9, st, bx, nh - 0.5, nz + nd / 2 + 0.2, 6);
      }
      block(G, nw + 0.15, 0.15, nd + 0.15, P.stoneDk, nx, nh, nz);
      const roof = mesh(G, gableGeo(nd + 0.3, nw + 0.3, 3.0), P.slate, nx, nh + 0.15, nz, { flatShading: true });
      roof.rotation.y = Math.PI / 2;
      // the west tower: three stages, then the openwork spire
      const tx = -2.0;
      block(G, 3.0, 11, 3.0, st, tx, -3, 0);
      pointed(G, F, tx, 4.6, 1.5, 0.7, 2.6);
      block(G, 3.24, 0.2, 3.24, P.stoneDk, tx, 8, 0, 0.04);
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cone(G, 0.17, 1.4, st, tx + a * 1.38, 8.2, b * 1.38, 6);
      block(G, 2.4, 3.4, 2.4, st, tx, 8.2, 0);
      for (const dx of [-0.5, 0.5]) pointed(G, F, tx + dx, 9.8, 1.2, 0.42, 1.9);
      block(G, 2.64, 0.16, 2.64, P.stoneDk, tx, 11.6, 0, 0.04);
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cone(G, 0.13, 1.1, st, tx + a * 1.08, 11.76, b * 1.08, 6);
      cyl(G, 0.95, 1.1, 2.2, st, tx, 11.76, 0, 8);
      pointed(G, F, tx, 12.7, 1.0, 0.32, 1.1);
      cone(G, 0.95, 6.4, st, tx, 13.96, 0, 8);
      for (const k of [0.22, 0.46, 0.68]) {
        const ring = mesh(G, new THREE.TorusGeometry(0.95 * (1 - k) + 0.02, 0.05, 6, 24), P.stoneDk, tx, 13.96 + 6.4 * k, 0);
        ring.rotation.x = Math.PI / 2;
      }
      mesh(G, new THREE.SphereGeometry(0.14, 14, 10), P.gold, tx, 20.45, 0);
      finish(F, G);
      return G;
    }

    function metzgerturm() {
      const G = new THREE.Group(), T = new THREE.Group(), F = facade(P.stoneDk);
      T.rotation.z = -0.045; // it leans
      G.add(T);
      block(T, 1.9, 10.2, 1.9, P.brick, 0, -3, 0);
      for (const y of [2.4, 4.2, 6.0]) windowAt(F, 0, y, 0.95, 0.3, 0.46, { plain: true });
      block(T, 2.1, 0.14, 2.1, P.stoneDk, 0, 7.2, 0, 0.03);
      mesh(T, frustumGeo(2.1, 2.1, 0.06, 0.06, 2.7), P.roofDk, 0, 7.34 + 1.35, 0, { flatShading: true });
      mesh(T, new THREE.SphereGeometry(0.09, 12, 10), P.gold, 0, 10.1, 0);
      finish(F, T);
      return G;
    }

    function frauenkirche() {
      const G = new THREE.Group(), F = facade(0xA9695A), brick = P.brick;
      block(G, 4.2, 10, 4.4, brick, 0, -3, -2.6);
      mesh(G, gableGeo(4.5, 4.7, 2.8), P.tile, 0, 7, -2.6, { flatShading: true });
      block(G, 1.9, 9.2, 1.2, brick, 0, -3, 0.4);
      pointed(G, F, 0, 3.4, 1.0, 0.8, 3.0);
      for (const s of [-1, 1]) {
        const x = s * 1.9, z = 0.6;
        block(G, 2.4, 13, 2.4, brick, x, -3, z);
        for (const y of [2.6, 4.6, 6.6, 8.6]) for (const dx of [-0.42, 0.42]) windowAt(F, x + dx, y, z + 1.2, 0.26, 0.6, { plain: true });
        for (const y of [3.7, 7.6]) block(G, 2.48, 0.08, 2.48, 0xA9695A, x, y, z, 0.02);
        block(G, 2.62, 0.2, 2.62, P.stoneDk, x, 10, z, 0.04);
        cyl(G, 1.0, 1.1, 0.7, P.copper, x, 10.2, z, 16);
        const onion = mesh(G, new THREE.SphereGeometry(1.12, 36, 24), P.copper, x, 11.75, z);
        onion.scale.y = 1.18;
        cyl(G, 0.26, 0.42, 0.6, P.copper, x, 12.95, z, 12);
        mesh(G, new THREE.SphereGeometry(0.3, 18, 14), P.copper, x, 13.75, z);
        cone(G, 0.05, 0.85, P.gold, x, 13.95, z, 6);
      }
      finish(F, G);
      return G;
    }

    // ── the street ─────────────────────────────────────────
    const TH = [
      { body: P.terracotta, roof: 'flat', extra: 'box', floors: 4, w: 3.6 },
      { body: P.blue, roof: 'gable', floors: 5, w: 3.4 },
      { body: P.sage, roof: 'flat', floors: 4, w: 3.2 },
      { body: P.white, roof: 'mansard', floors: 5, w: 3.6, balconies: true },
      { body: P.mustard, roof: 'mansard', floors: 4, w: 4.2 },
      { body: P.mint, roof: 'gable', floors: 4, w: 3.4 },
      { body: P.pink, roof: 'mansard', floors: 5, w: 3.8, balconies: true },
      { body: P.brick, roof: 'flat', extra: 'glass', floors: 4, w: 3.6 },
      { body: P.cream, roof: 'mansard', floors: 6, w: 3.3 },
      { body: P.sage, roof: 'flat', extra: 'box', floors: 3, w: 3.0 },
      { body: P.mustard, roof: 'flat', floors: 5, w: 3.4 },
      { body: P.blue, roof: 'mansard', floors: 4, w: 3.6 }
    ];
    const T = i => () => townhouse(TH[i]);
    const LM = {
      dharmapuri: { t: 'Dharmapuri', s: 'Avvaiyar & Adhiyaman', make: gopuram },
      chennai: { t: 'Chennai', s: 'Central Station', make: chennaiCentral,
                 live: () => { const d = chennaiNow(); return 'Central Station · ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ' IST'; } },
      nantes: { t: 'Nantes', s: 'Tour LU', make: tourLU },
      ulm: { t: 'Ulm', s: 'Münster', make: ulmMunster },
      metzger: { t: 'Ulm', s: 'Metzgerturm', make: metzgerturm },
      muc: { t: 'München', s: 'Frauenkirche', make: frauenkirche }
    };
    const street = [
      T(10), T(6),                              // spill past the left edge
      'core', T(0), LM.dharmapuri, T(1), LM.chennai, T(2), T(3), LM.nantes, T(4), T(5),
      LM.ulm, LM.metzger, T(6), T(7), LM.muc, T(8), T(9), 'core',
      T(11), T(1)                               // spill past the right edge
    ];

    const buildings = [], PINS = [];
    const box3 = new THREE.Box3();
    let cursor = 0, coreL = 0, coreR = 0, coreSeen = 0;
    for (const item of street) {
      if (item === 'core') { if (coreSeen++ === 0) coreL = cursor; else coreR = cursor; continue; }
      const lm = typeof item === 'object' ? item : null;
      const G = lm ? lm.make() : item();
      box3.setFromObject(G);
      const w = box3.max.x - box3.min.x;
      G.position.set(cursor - box3.min.x + 0.04, 0, lm ? 0 : rr(-0.35, 0.35));
      cursor += w + 0.08;
      root.add(G);
      buildings.push(G);
      if (lm) PINS.push({ t: lm.t, s: lm.s, live: lm.live, g: G });
    }
    // a back row of taller blocks for depth
    const backs = [
      { at: 0.07, o: { body: P.mustard, floors: 8, w: 3.4 } },
      { at: 0.31, o: { body: P.tower, trim: 0x7FA393, floors: 10, w: 3.2, glassy: true } },
      { at: 0.48, o: { body: P.cream, floors: 9, w: 3.0, extra: 'glass' } },
      { at: 0.72, o: { body: P.terracotta, floors: 8, w: 3.4 } },
      { at: 0.93, o: { body: P.blue, floors: 9, w: 3.0 } }
    ];
    for (const b of backs) {
      const G = backBuilding(b.o);
      G.position.set(coreL + (coreR - coreL) * b.at, 0, -3.8);
      root.add(G);
      buildings.push(G);
    }
    const coreW = coreR - coreL;
    root.position.x = -(coreL + coreW / 2);
    root.updateMatrixWorld(true);

    // rise order, heights, label anchors
    buildings.sort((a, b) => a.position.x - b.position.x);
    buildings.forEach((G, i) => {
      box3.setFromObject(G);
      G.userData.h = box3.max.y;
      G.userData.delay = i * 0.045 + rnd() * 0.08 + (G.position.z < -1 ? 0.25 : 0);
      G.userData.lift = 0; G.userData.liftTo = 0;
    });
    PINS.forEach(pn => {
      box3.setFromObject(pn.g);
      pn.anchor = new THREE.Vector3((box3.min.x + box3.max.x) / 2, box3.max.y + 0.5, box3.max.z);
      const el = document.createElement('div');
      el.className = 'place-tag';
      if (pn.live) pn.s = pn.live();
      el.innerHTML = pn.t + (pn.s ? '<em>' + pn.s + '</em>' : '');
      labelBox.appendChild(el);
      pn.el = el;
    });

    // ── camera: level (so walls stay vertical), lowered so the street sits on the bottom edge ──
    const FOV = 19, NEED_H = 22;
    let dist = 50, camY = 10, panAmp = 0, camX = 0, camXTo = 0;
    function resize() {
      const w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = FOV;
      camera.updateProjectionMatrix();
      const v = THREE.MathUtils.degToRad(FOV) / 2, tv = Math.tan(v);
      // narrow screens show part of the street and drift along it
      const wFit = camera.aspect >= 2.4 ? coreW + 1 : Math.min(coreW + 1, Math.max(26, camera.aspect * 22));
      dist = Math.max((wFit / 2) / (tv * camera.aspect), NEED_H / (2 * tv));
      camY = dist * tv;
      panAmp = Math.max(0, (coreW - wFit) / 2);
    }
    addEventListener('resize', resize);
    resize();

    // ── hover: lift the landmark and show its name ──────────
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let hovered = null;
    const pinFor = obj => { for (let o = obj; o; o = o.parent) { const p = PINS.find(pn => pn.g === o); if (p) return p; } return null; };
    function pick(cx, cy) {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(PINS.map(p => p.g), true)[0];
      setHover(hit ? pinFor(hit.object) : null);
    }
    function setHover(p) {
      if (p === hovered) return;
      if (hovered) { hovered.el.classList.remove('on'); hovered.g.userData.liftTo = 0; }
      hovered = p;
      if (p) { p.el.classList.add('on'); p.g.userData.liftTo = 0.35; }
      renderer.domElement.style.cursor = p ? 'pointer' : '';
    }
    const cv = renderer.domElement;
    cv.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      pick(e.clientX, e.clientY);
      const r = cv.getBoundingClientRect();
      camXTo = ((e.clientX - r.left) / r.width - 0.5) * 1.2;
    });
    cv.addEventListener('pointerleave', () => { setHover(null); camXTo = 0; });
    cv.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') pick(e.clientX, e.clientY); });

    // ── loop ───────────────────────────────────────────────
    const clock = new THREE.Clock();
    const v3 = new THREE.Vector3(), col = new THREE.Color();
    const easeOutBack = u => { const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
    let startAt = -1, nextFlicker = 2, running = false;

    function tick() {
      const t = clock.getElapsedTime();

      buildings.forEach(G => {
        const d = G.userData;
        const u = startAt < 0 ? 0 : clamp01((t - startAt - d.delay) / 1.05);
        const e = reduced ? (startAt < 0 ? 0 : 1) : easeOutBack(u);
        d.lift += (d.liftTo - d.lift) * 0.14;
        G.position.y = -(d.h + 2) * (1 - e) + d.lift;
      });

      // a window here and there switches on or off
      if (!reduced && startAt >= 0 && t > nextFlicker) {
        const p = panes[(rnd() * panes.length) | 0];
        p.lit = !p.lit;
        p.im.setColorAt(p.i, col.setHex(p.lit ? P.lit : P.glass));
        p.im.instanceColor.needsUpdate = true;
        nextFlicker = t + rr(0.4, 1.4);
      }

      camX += (camXTo - camX) * 0.04;
      const drift = reduced ? 0 : panAmp * Math.sin(t * 0.09);
      camera.position.set(camX + drift, camY, dist);
      camera.rotation.set(0, 0, 0);
      camera.updateMatrixWorld();

      setChennaiClock();

      if (hovered) {
        const r = cv.getBoundingClientRect(), el = hovered.el;
        if (hovered.live) {
          const s = hovered.live();
          if (s !== hovered.s) { hovered.s = s; el.innerHTML = hovered.t + '<em>' + s + '</em>'; }
        }
        v3.copy(hovered.anchor);
        v3.y += hovered.g.position.y;
        v3.project(camera);
        const ew = el.offsetWidth, eh = el.offsetHeight, pad = 8;
        el.style.left = Math.min(r.width - ew / 2 - pad, Math.max(ew / 2 + pad, (v3.x * 0.5 + 0.5) * r.width)) + 'px';
        el.style.top = Math.min(r.height - pad, Math.max(eh + pad, (-v3.y * 0.5 + 0.5) * r.height - 6)) + 'px';
      }

      renderer.render(scene, camera);
      if (running) requestAnimationFrame(tick);
    }

    function start() { if (!running) { running = true; tick(); } }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => {
        const e = es[0];
        if (e.isIntersecting) {
          start();
          if (startAt < 0 && e.intersectionRatio > 0.2) startAt = clock.getElapsedTime();
        } else running = false;
      }, { threshold: [0, 0.2, 0.5] }).observe(stage);
    } else { startAt = 0; start(); }
  }
})();
