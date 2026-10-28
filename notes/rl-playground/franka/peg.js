// Franka peg-in-hole widget: MuJoCo WASM physics, three.js rendering, scripted controller + learned residual.
// Everything loads only when the reader presses "Load the simulator".
import { PegSim } from './pegsim.js';

const C = { ink: '#232220', muted: '#6f6e66', blue: '#3e6fb0', terra: '#c4673f', green: '#2f7d5f', red: '#b8452f', amber: '#a8701a', bg: '#fbfcf8' };
const $ = (s) => document.querySelector(s);
const root = $('#peg-widget');
const abs = (u) => new URL(u, document.baseURI).href;   // dynamic import() resolves against this module, so make URLs absolute
const BASE = abs(root.dataset.base);            // folder with peg.mjb, panda_vis.*, residual.json
const MJ = abs(root.dataset.mujoco);            // folder with mujoco.js / mujoco.wasm
const THREE_URL = abs(root.dataset.three);

let THREE, sim, renderer, scene, camera, bodies = [], prims = [], playing = false, speed = 1, trace = [], result = null, err = [0.005, -0.003];

$('#peg-load').addEventListener('click', load, { once: true });

async function load() {
  const status = $('#peg-status');
  const btn = $('#peg-load'); btn.disabled = true;
  try {
    status.textContent = 'loading physics engine (≈3 MB compressed)…';
    const [{ default: loadMujoco }, three] = await Promise.all([import(MJ + 'mujoco.js'), import(THREE_URL)]);
    THREE = three;
    const mujoco = await loadMujoco({ locateFile: (p) => MJ + p });
    status.textContent = 'loading the robot…';
    const get = (f, t) => fetch(BASE + f).then((r) => { if (!r.ok) throw new Error(f); return r[t](); });
    const [mjb, res, vis, bin] = await Promise.all([get('peg.mjb', 'arrayBuffer'), get('residual.json', 'json'), get('panda_vis.json', 'json'), get('panda_vis.bin', 'arrayBuffer')]);
    sim = new PegSim(mujoco, new Uint8Array(mjb), res);
    build(vis, bin);
    root.classList.add('is-live');
    status.textContent = '';
    newError(); attempt();
  } catch (e) {
    status.textContent = 'Could not load the simulator: ' + e.message;
    btn.disabled = false;
    $('#peg-load').addEventListener('click', load, { once: true });
  }
}

// ------------------------------------------------------------------ scene
function build(vis, bin) {
  const T = THREE, cv = $('#peg-canvas');
  renderer = new T.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  scene = new T.Scene(); scene.background = new T.Color(C.bg);
  camera = new T.PerspectiveCamera(32, 1, 0.01, 20); camera.up.set(0, 0, 1);
  scene.add(new T.HemisphereLight(0xffffff, 0xd8dccf, 1.6));
  const sun = new T.DirectionalLight(0xffffff, 1.8); sun.position.set(1.2, -1.0, 2.2); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -0.8, right: 0.8, top: 0.8, bottom: -0.8, near: 0.5, far: 5 });
  scene.add(sun);

  const m = sim.m, mj = sim.mj;
  // primitive geoms of the physics model (floor, table, peg, hole)
  const types = mj.mjtGeom;
  for (let g = 0; g < m.ngeom; g++) {
    const t = m.geom_type[g], s = m.geom_size.subarray(3 * g, 3 * g + 3), rgba = m.geom_rgba.subarray(4 * g, 4 * g + 4);
    const mat = m.geom_matid[g] >= 0 ? m.mat_rgba.subarray(4 * m.geom_matid[g], 4 * m.geom_matid[g] + 4) : rgba;
    let geo;
    if (t === types.mjGEOM_PLANE.value) { geo = new T.PlaneGeometry(4, 4); }
    else if (t === types.mjGEOM_BOX.value) geo = new T.BoxGeometry(2 * s[0], 2 * s[1], 2 * s[2]);
    else if (t === types.mjGEOM_CYLINDER.value) { geo = new T.CylinderGeometry(s[0], s[0], 2 * s[1], 40); geo.rotateX(Math.PI / 2); }
    else continue;
    const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ color: new T.Color(mat[0], mat[1], mat[2]), roughness: 0.75, metalness: 0.0 }));
    mesh.castShadow = t !== types.mjGEOM_PLANE.value; mesh.receiveShadow = true;
    scene.add(mesh); prims.push([g, mesh]);
  }
  // decimated visual meshes, attached to bodies
  const groups = {};
  for (const v of vis) {
    const bid = mj.mj_name2id(m, mj.mjtObj.mjOBJ_BODY.value, v.body);
    if (!groups[bid]) { groups[bid] = new T.Group(); scene.add(groups[bid]); bodies.push([bid, groups[bid]]); }
    const q = new Uint16Array(bin.slice(v.off, v.off + v.nv * 6));
    const fb = v.off + v.nv * 6, F = v.i32 ? new Uint32Array(bin.slice(fb, fb + v.nf * 12)) : new Uint16Array(bin.slice(fb, fb + v.nf * 6));
    const pos = new Float32Array(v.nv * 3);
    for (let i = 0; i < v.nv * 3; i++) pos[i] = v.lo[i % 3] + (q[i] / 65535) * (v.hi[i % 3] - v.lo[i % 3]);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setIndex(new T.BufferAttribute(F, 1)); geo.computeVertexNormals();
    const c = v.rgba, light = c[0] > 0.6;
    const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ color: new T.Color(c[0], c[1], c[2]).multiplyScalar(light ? 0.93 : 1), roughness: light ? 0.55 : 0.45, metalness: light ? 0.05 : 0.2 }));
    mesh.position.set(...v.pos); mesh.quaternion.set(v.quat[1], v.quat[2], v.quat[3], v.quat[0]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    groups[bid].add(mesh);
  }
  orbit(cv);
  addEventListener('resize', resize); resize();
  requestAnimationFrame(frame);
}

function sync() {
  const d = sim.d, xp = d.xpos, xq = d.xquat, gp = d.geom_xpos, gm = d.geom_xmat;
  for (const [b, g] of bodies) { g.position.set(xp[3 * b], xp[3 * b + 1], xp[3 * b + 2]); g.quaternion.set(xq[4 * b + 1], xq[4 * b + 2], xq[4 * b + 3], xq[4 * b]); }
  const M = new THREE.Matrix4();
  for (const [g, mesh] of prims) {
    const r = gm.subarray(9 * g, 9 * g + 9);
    M.set(r[0], r[1], r[2], gp[3 * g], r[3], r[4], r[5], gp[3 * g + 1], r[6], r[7], r[8], gp[3 * g + 2], 0, 0, 0, 1);
    M.decompose(mesh.position, mesh.quaternion, mesh.scale);
  }
}

// drag to orbit, wheel / pinch to zoom, around the hole
const view = { az: -0.9, el: 0.38, r: 1.75, tgt: [0.42, 0, 0.36] };
function placeCamera() {
  const { az, el, r, tgt } = view;
  camera.position.set(tgt[0] + r * Math.cos(el) * Math.cos(az), tgt[1] + r * Math.cos(el) * Math.sin(az), tgt[2] + r * Math.sin(el));
  camera.lookAt(...tgt);
}
function orbit(cv) {
  let p = null, pinch = null;
  cv.addEventListener('pointerdown', (e) => { p = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!p) return;
    view.az -= (e.clientX - p[0]) * 0.008; view.el = Math.max(0.05, Math.min(1.45, view.el + (e.clientY - p[1]) * 0.006));
    p = [e.clientX, e.clientY];
  });
  cv.addEventListener('pointerup', () => { p = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); view.r = Math.max(0.35, Math.min(3, view.r * Math.exp(e.deltaY * 0.001))); }, { passive: false });
  cv.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2) { pinch = null; return; }
    const dd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (pinch) view.r = Math.max(0.35, Math.min(3, view.r * pinch / dd));
    pinch = dd; e.preventDefault();
  }, { passive: false });
  $('#peg-close').addEventListener('click', () => Object.assign(view, view.r > 0.6 ? { r: 0.42, el: 0.35, tgt: [...sim.hole] } : { r: 1.75, el: 0.38, tgt: [0.42, 0, 0.36] }));
}
function resize() {
  const cv = renderer.domElement, w = cv.clientWidth, h = Math.round(Math.min(460, Math.max(300, w * 0.62)));
  renderer.setSize(w, h, false); cv.style.height = h + 'px';
  camera.aspect = w / h; camera.updateProjectionMatrix();
  inset();
}

// ------------------------------------------------------------------ episodes
const useRes = () => $('#peg-res').checked;
function newError() {
  const r = sim.c.err_max * Math.sqrt(0.15 + 0.85 * Math.random()), a = Math.random() * 2 * Math.PI;
  err = [r * Math.cos(a), r * Math.sin(a)];
}
function attempt() {
  sim.reset(err); trace = []; result = null; playing = true;
  $('#peg-err').textContent = (1000 * Math.hypot(...err)).toFixed(1) + ' mm';
  $('#peg-result').textContent = 'descending…';
}
let last = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
  if (playing) {
    const n = Math.round(dt * speed / sim.m.opt.timestep);
    for (let i = 0; i < n && !sim.done(); i++) {
      sim.tick(useRes());
      if (sim.i % 10 === 0) { const x = sim.d.site_xpos; trace.push([x[3 * sim.tip], x[3 * sim.tip + 1]]); }
    }
    if (sim.done()) {
      playing = false;
      const dep = sim.depth(); result = dep > 0.02;
      $('#peg-result').innerHTML = result ? `<span style="color:${C.green}">inserted, ${(1000 * dep).toFixed(0)} mm deep ✓</span>` : `<span style="color:${C.red}">stuck on the surface ✕</span>`;
    }
    $('#peg-depth').textContent = Math.max(0, 1000 * sim.depth()).toFixed(1) + ' mm';
  }
  sync(); placeCamera(); renderer.render(scene, camera); inset();
  requestAnimationFrame(frame);
}

// top view, 10× zoom: hole, belief, tip trace, centre of pressure
function inset() {
  const cv = $('#peg-top'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = W;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  if (!sim || !sim.belief) return;
  const S = W / 0.05, cx = W / 2, cy = H / 2, hx = sim.hole[0], hy = sim.hole[1];
  const P = (x, y) => [cx + (y - hy) * S, cy + (x - hx) * S];          // screen right = +y, down = +x (seen from the robot)
  ctx.fillStyle = 'rgba(62,111,176,0.16)'; ctx.fillRect(0, 0, W, H);
  const hw = 0.0135;
  ctx.fillStyle = C.bg; ctx.fillRect(cx - hw * S, cy - hw * S, 2 * hw * S, 2 * hw * S);
  ctx.strokeStyle = 'rgba(35,34,32,0.35)'; ctx.strokeRect(cx - hw * S, cy - hw * S, 2 * hw * S, 2 * hw * S);
  const [bx, by] = P(sim.belief[0], sim.belief[1]);
  ctx.strokeStyle = C.amber; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(bx - 10, by); ctx.lineTo(bx + 10, by); ctx.moveTo(bx, by - 10); ctx.lineTo(bx, by + 10); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath();
  trace.forEach(([x, y], i) => { const [X, Y] = P(x, y); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
  const x = sim.d.site_xpos, [px, py] = P(x[3 * sim.tip], x[3 * sim.tip + 1]);
  ctx.strokeStyle = C.terra; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 0.012 * S, 0, 7); ctx.stroke();
  const v = sim.vel;                                                // the residual's lateral push (m/s)
  if (Math.hypot(v[0], v[1]) > 1e-4) {
    ctx.strokeStyle = C.green; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + v[1] * 1500, py + v[0] * 1500); ctx.stroke();
  }
  ctx.font = '10.5px "Fragment Mono", ui-monospace, monospace'; ctx.fillStyle = C.muted; ctx.textAlign = 'left';
  ctx.fillText('top view, 10×', 6, 13);
  ctx.fillStyle = C.amber; ctx.fillText('+ believed hole', 6, H - 20);
  ctx.fillStyle = C.terra; ctx.fillText('○ peg', 6, H - 7);
  ctx.fillStyle = C.green; ctx.fillText('— push', 52, H - 7);
}

// ------------------------------------------------------------------ controls
$('#peg-again').addEventListener('click', () => sim && attempt());
$('#peg-new').addEventListener('click', () => { if (!sim) return; newError(); attempt(); });
$('#peg-res').addEventListener('change', () => sim && attempt());
$('#peg-speed').addEventListener('click', (e) => { speed = speed === 1 ? 0.25 : 1; e.target.textContent = speed === 1 ? '🐢 slow motion' : '1× speed'; });
$('#peg-batch').addEventListener('click', () => {
  if (!sim) return;
  const btn = $('#peg-batch'); btn.disabled = true; playing = false;
  const N = 20, errs = Array.from({ length: N }, () => { newError(); return err.slice(); });
  let k = 0, ok = [0, 0];
  const run = () => {
    for (const [j, useR] of [[0, false], [1, true]]) {
      sim.reset(errs[k]);
      while (!sim.done()) sim.tick(useR);
      if (sim.depth() > 0.02) ok[j]++;
    }
    k++;
    $('#peg-batchout').textContent = `scripted only ${ok[0]}/${k} · with residual ${ok[1]}/${k}`;
    if (k < N) setTimeout(run, 0); else { btn.disabled = false; attempt(); }
  };
  run();
});
