// Workplace generator.
//
// Every job has its own building recipe: a back-of-house block of a given size
// and a 60 x 20 m public floor attached to one of its sides (with an offset),
// so the building outline differs per job (rectangles, L and T shapes). The
// back block is cut up by a seeded binary space partition into hallways and
// rooms, so the room layout differs per job and per save. All walls come from
// one grid rasterization, which keeps doors and hallways consistent.
import * as THREE from 'three';
import { Level, Frame } from '../level.js';

const G = 0.5; // raster cell size
const CORR = 2.5; // corridor width
const MINR = 5; // minimum room size
const WALL = '#e9e4da';

function rng32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const snap = (v) => Math.round(v / G) * G;
const hashStr = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);

const RECIPES = {
  office: { back: [72, 34], side: 's', offset: 0, roomMax: 95 },
  restaurant: { back: [42, 46], side: 'e', offset: 0.35, roomMax: 85 },
  retail: { back: [66, 22], side: 's', offset: -0.15, roomMax: 120 },
  hotel: { back: [58, 46], side: 'n', offset: 0.1, roomMax: 60 },
  library: { back: [40, 58], side: 'w', offset: -0.25, roomMax: 90 },
  warehouse: { back: [82, 26], side: 's', offset: 0.2, roomMax: 150 },
  cafe: { back: [36, 32], side: 's', offset: 0.4, roomMax: 75 },
};
const EXTRA_ROOMS = {
  office: ['office', 'meeting', 'closet', 'storage', 'office', 'copy'],
  restaurant: ['storage', 'closet', 'pantry', 'office'],
  retail: ['stockroom', 'closet', 'storage', 'returns'],
  hotel: ['guestroom', 'guestroom', 'linen', 'closet', 'guestroom', 'storage'],
  library: ['study', 'archive', 'closet', 'study'],
  warehouse: ['stockroom', 'closet', 'storage', 'packing'],
  cafe: ['storage', 'closet', 'pantry'],
};

const THEMES = {
  office: { floor: '#8395a7', back: '#b8b2a7', corr: '#cfc6b8', sign: '#273c75', maxCustomers: 5 },
  restaurant: { floor: '#8e5b3a', back: '#c9c3b6', corr: '#d8cfc0', sign: '#6d214f', maxCustomers: 14 },
  retail: { floor: '#dfe6e9', back: '#b8b2a7', corr: '#cfc6b8', sign: '#e84118', maxCustomers: 12 },
  hotel: { floor: '#b33939', back: '#cbbba0', corr: '#8e3a3a', sign: '#5d4037', maxCustomers: 10 },
  library: { floor: '#7f6a5b', back: '#c9bfae', corr: '#d6cbb8', sign: '#3d3d6b', maxCustomers: 12 },
  warehouse: { floor: '#95a5a6', back: '#a8a49c', corr: '#b9b5ac', sign: '#e1b12c', maxCustomers: 4 },
  cafe: { floor: '#a47148', back: '#cfc6b8', corr: '#d8cfc0', sign: '#6f4e37', maxCustomers: 12 },
};

/** Build a workplace, retrying with other seeds until every room can be reached. */
export function buildWorkplace(jobId, job, opts = {}) {
  let best = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const L = generate(jobId, job, { ...opts, seed: (opts.seed || 1) + attempt * 1013 });
    const bad = unreachableRooms(L);
    if (!bad) return L;
    if (!best || bad < best.bad) best = { L, bad };
  }
  return best.L;
}

function unreachableRooms(L) {
  const sn = L.nearestNode(L.spawn.x, L.spawn.z);
  if (sn < 0) return 99;
  const seen = new Uint8Array(L.nav.nodes.length);
  seen[sn] = 1;
  const q = [sn];
  while (q.length) {
    const k = q.pop();
    for (const n of L.nav.nodes[k].n) if (!seen[n]) {
      seen[n] = 1;
      q.push(n);
    }
  }
  let bad = 0;
  for (const rm of L.rooms) {
    let ok = false;
    for (let k = 0; k < seen.length && !ok; k++) {
      if (!seen[k]) continue;
      const nd = L.nav.nodes[k];
      if (nd.x > rm.x0 && nd.x < rm.x1 && nd.z > rm.z0 && nd.z < rm.z1) ok = true;
    }
    if (!ok) bad++;
  }
  const tc = L.interactables.get('timeclock');
  if (tc) {
    const k = L.nearestNode(tc.x, tc.z);
    if (k < 0 || !seen[k]) bad += 5;
  }
  return bad;
}

function generate(jobId, job, { coworkers = [], seed = 1 } = {}) {
  const L = new Level('work:' + jobId);
  const rnd = rng32(seed * 7919 + hashStr(jobId));
  const R = RECIPES[jobId] || RECIPES.office;
  const theme = THEMES[jobId] || THEMES.office;
  L.pois.workstations = [];
  L.pois.hideSpots = [];
  L.pois.customerSpots = [];
  L.pois.wander = [];
  L.indoor = true;

  // ---- building shape
  const bw = snap(R.back[0] * (0.9 + rnd() * 0.2));
  const bd = snap(R.back[1] * (0.9 + rnd() * 0.2));
  const side = R.side;
  const sideLen = side === 's' || side === 'n' ? bw : bd;
  const off = R.offset + (rnd() - 0.5) * 0.3;
  const c = snap(Math.max(-sideLen / 2 + 8, Math.min(sideLen / 2 - 8, (off * sideLen) / 2)));
  const phi = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 }[side];
  const anchor = { s: [c, bd / 2], n: [c, -bd / 2], e: [bw / 2, c], w: [-bw / 2, c] }[side];
  const P = new Frame(L, anchor[0], anchor[1], phi, 4);
  const pc = [P.tx(-30, 4), P.tx(30, 24)];
  const pub = { x0: Math.min(pc[0].x, pc[1].x), x1: Math.max(pc[0].x, pc[1].x), z0: Math.min(pc[0].z, pc[1].z), z1: Math.max(pc[0].z, pc[1].z) };
  const back = { x0: -bw / 2, x1: bw / 2, z0: -bd / 2, z1: bd / 2 };
  L.bounds = { minX: Math.min(pub.x0, back.x0) - 1, maxX: Math.max(pub.x1, back.x1) + 1, minZ: Math.min(pub.z0, back.z0) - 1, maxZ: Math.max(pub.z1, back.z1) + 1 };
  // the overlap between the public floor and the back block (along the shared side)
  const ov = side === 's' || side === 'n' ? [Math.max(pub.x0, back.x0), Math.min(pub.x1, back.x1)] : [Math.max(pub.z0, back.z0), Math.min(pub.z1, back.z1)];

  // ---- binary space partition of the back block
  const leaves = [];
  const corridors = [];
  const doors = []; // {axis:'x'|'z' (line orientation), at, from, to}
  const rootAxis = side === 's' || side === 'n' ? 'x' : 'z';
  const split = (r, axis, depth, corrSide) => {
    const W = r.x1 - r.x0;
    const D = r.z1 - r.z0;
    const len = axis === 'x' ? W : D;
    const area = W * D;
    const canCorr = len >= 2 * MINR + CORR;
    const leaf = () => leaves.push({ ...r, corrSide });
    if (depth > 0 && area <= R.roomMax * (0.75 + rnd() * 0.6)) return leaf();
    if (depth > 1 && area <= R.roomMax * 2.2 && len >= 2 * MINR && rnd() < 0.7) {
      // two rooms side by side, both opening onto the parent corridor
      const s = snap((axis === 'x' ? r.x0 : r.z0) + len * (0.38 + rnd() * 0.24));
      const a = axis === 'x' ? { ...r, x1: s } : { ...r, z1: s };
      const b = axis === 'x' ? { ...r, x0: s } : { ...r, z0: s };
      leaves.push({ ...a, corrSide }, { ...b, corrSide });
      if (rnd() < 0.5) {
        const mid = axis === 'x' ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
        doors.push({ line: axis === 'x' ? 'x' : 'z', at: s, from: mid - 1.0, to: mid + 1.0 });
      }
      return;
    }
    if (!canCorr) return leaf();
    let lo = (axis === 'x' ? r.x0 : r.z0) + MINR;
    let hi = (axis === 'x' ? r.x1 : r.z1) - MINR - CORR;
    if (depth === 0) {
      lo = Math.max(lo, ov[0] + 1);
      hi = Math.min(hi, ov[1] - CORR - 1);
      if (hi < lo) hi = lo;
    }
    const s = snap(lo + (hi - lo) * (0.3 + rnd() * 0.4));
    if (axis === 'x') {
      corridors.push({ x0: s, x1: s + CORR, z0: r.z0, z1: r.z1, axis: 'z', depth });
      split({ x0: r.x0, x1: s, z0: r.z0, z1: r.z1 }, 'z', depth + 1, 'e');
      split({ x0: s + CORR, x1: r.x1, z0: r.z0, z1: r.z1 }, 'z', depth + 1, 'w');
    } else {
      corridors.push({ x0: r.x0, x1: r.x1, z0: s, z1: s + CORR, axis: 'x', depth });
      split({ x0: r.x0, x1: r.x1, z0: r.z0, z1: s }, 'x', depth + 1, 's');
      split({ x0: r.x0, x1: r.x1, z0: s + CORR, z1: r.z1 }, 'x', depth + 1, 'n');
    }
  };
  split(back, rootAxis, 0, null);
  // doors from each room onto its corridor
  for (const lf of leaves) {
    const cx = (lf.x0 + lf.x1) / 2;
    const cz = (lf.z0 + lf.z1) / 2;
    lf.cx = cx;
    lf.cz = cz;
    if (lf.corrSide === 'e') doors.push({ line: 'z', at: lf.x1, from: cz - 1.0, to: cz + 1.0 });
    if (lf.corrSide === 'w') doors.push({ line: 'z', at: lf.x0, from: cz - 1.0, to: cz + 1.0 });
    if (lf.corrSide === 's') doors.push({ line: 'x', at: lf.z1, from: cx - 1.0, to: cx + 1.0 });
    if (lf.corrSide === 'n') doors.push({ line: 'x', at: lf.z0, from: cx - 1.0, to: cx + 1.0 });
  }
  // entrance
  const e1 = P.tx(-1.6, 24);
  const e2 = P.tx(1.6, 24);
  if (Math.abs(e1.x - e2.x) > 0.1) doors.push({ line: 'x', at: e1.z, from: Math.min(e1.x, e2.x), to: Math.max(e1.x, e2.x) });
  else doors.push({ line: 'z', at: e1.x, from: Math.min(e1.z, e2.z), to: Math.max(e1.z, e2.z) });

  // ---- raster: -2 outside, -1 public, -3 corridor, >0 room id
  const b = L.bounds;
  const nx = Math.ceil((b.maxX - b.minX) / G);
  const nz = Math.ceil((b.maxZ - b.minZ) / G);
  const ids = new Int16Array(nx * nz).fill(-2);
  const inR = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const x = b.minX + (i + 0.5) * G;
      const z = b.minZ + (j + 0.5) * G;
      let id = -2;
      if (inR(back, x, z)) {
        id = -3;
        for (let k = 0; k < leaves.length; k++) if (inR(leaves[k], x, z)) id = k + 1;
      } else if (inR(pub, x, z)) id = -1;
      ids[i * nz + j] = id;
    }
  const idAt = (i, j) => (i < 0 || j < 0 || i >= nx || j >= nz ? -2 : ids[i * nz + j]);
  const open = (a, c2) => a === c2 || (a === -3 && c2 === -1) || (a === -1 && c2 === -3);
  const isDoor = (line, at, m) => doors.some((d) => d.line === line && Math.abs(d.at - at) < 0.3 && m > d.from && m < d.to);
  // vertical lines (x fixed)
  for (let i = 0; i <= nx; i++) {
    const x = b.minX + i * G;
    let start = null;
    let tall = false;
    for (let j = 0; j <= nz; j++) {
      const a = idAt(i - 1, j);
      const c2 = idAt(i, j);
      const z = b.minZ + (j + 0.5) * G;
      const wall = j < nz && !open(a, c2) && !(a === -2 && c2 === -2) && !isDoor('z', x, z);
      if (wall && start === null) {
        start = b.minZ + j * G;
        tall = a === -2 || c2 === -2;
      }
      if ((!wall || j === nz) && start !== null) {
        seg(L, x, start, x, b.minZ + j * G, tall ? 3.2 : 3);
        start = null;
      }
    }
  }
  for (let j = 0; j <= nz; j++) {
    const z = b.minZ + j * G;
    let start = null;
    let tall = false;
    for (let i = 0; i <= nx; i++) {
      const a = idAt(i, j - 1);
      const c2 = idAt(i, j);
      const x = b.minX + (i + 0.5) * G;
      const wall = i < nx && !open(a, c2) && !(a === -2 && c2 === -2) && !isDoor('x', z, x);
      if (wall && start === null) {
        start = b.minX + i * G;
        tall = a === -2 || c2 === -2;
      }
      if ((!wall || i === nx) && start !== null) {
        seg(L, start, z, b.minX + i * G, z, tall ? 3.2 : 3);
        start = null;
      }
    }
  }

  // ---- floors
  L.floor((back.x0 + back.x1) / 2, (back.z0 + back.z1) / 2, bw, bd, theme.back);
  for (const cr of corridors) L.floor((cr.x0 + cr.x1) / 2, (cr.z0 + cr.z1) / 2, cr.x1 - cr.x0, cr.z1 - cr.z0, theme.corr, 0.003 + cr.depth * 0.001);
  P.floor(0, 14, 60, 20, theme.floor);
  // glass entrance + exit
  P.box(0, 24.05, 3.2, 0.08, 2.6, '#aed6f1', { occlude: false, collide: true, static: false, matOpts: { transparent: true, opacity: 0.25 } });
  P.interactable('exit', 0, 23.3, 'Leave work', { r: 1.0 });
  const sp = P.tpt({ x: 0, z: 21.4, yaw: Math.PI });
  L.spawn = sp;
  L.pois.entrance = P.tx(0, 23.2);
  // staff doorway signs where corridors open onto the public floor
  for (const cr of corridors) {
    if (side === 's' && cr.axis === 'z' && Math.abs(cr.z1 - back.z1) < 0.1) L.label('STAFF ONLY', (cr.x0 + cr.x1) / 2, 2.75, back.z1 + 0.12, 0, { height: 0.22, bg: '#2d3436' });
    if (side === 'n' && cr.axis === 'z' && Math.abs(cr.z0 - back.z0) < 0.1) L.label('STAFF ONLY', (cr.x0 + cr.x1) / 2, 2.75, back.z0 - 0.12, Math.PI, { height: 0.22, bg: '#2d3436' });
    if (side === 'e' && cr.axis === 'x' && Math.abs(cr.x1 - back.x1) < 0.1) L.label('STAFF ONLY', back.x1 + 0.12, 2.75, (cr.z0 + cr.z1) / 2, Math.PI / 2, { height: 0.22, bg: '#2d3436' });
    if (side === 'w' && cr.axis === 'x' && Math.abs(cr.x0 - back.x0) < 0.1) L.label('STAFF ONLY', back.x0 - 0.12, 2.75, (cr.z0 + cr.z1) / 2, -Math.PI / 2, { height: 0.22, bg: '#2d3436' });
  }

  // ---- assign room types
  const mainDoor = (() => {
    const root = corridors.find((cr) => cr.depth === 0);
    if (!root) return { x: anchor[0], z: anchor[1] };
    const ends = root.axis === 'z'
      ? [{ x: (root.x0 + root.x1) / 2, z: root.z0 }, { x: (root.x0 + root.x1) / 2, z: root.z1 }]
      : [{ x: root.x0, z: (root.z0 + root.z1) / 2 }, { x: root.x1, z: (root.z0 + root.z1) / 2 }];
    return ends.sort((a, b2) => Math.hypot(a.x - anchor[0], a.z - anchor[1]) - Math.hypot(b2.x - anchor[0], b2.z - anchor[1]))[0];
  })();
  const dist = (lf) => Math.hypot(lf.cx - mainDoor.x, lf.cz - mainDoor.z);
  const pool = [...leaves].sort((a, b2) => dist(a) - dist(b2));
  const take = (pred) => {
    const i = pool.findIndex(pred);
    return i < 0 ? null : pool.splice(i, 1)[0];
  };
  const area = (lf) => (lf.x1 - lf.x0) * (lf.z1 - lf.z0);
  const assign = (lf, type) => lf && (lf.type = type);
  assign(take(() => true), 'lockers');
  assign(take(() => true), 'manager');
  assign(take((lf, i) => true), 'restroom');
  // far rooms
  pool.sort((a, b2) => dist(b2) - dist(a));
  assign(take(() => true), 'loading');
  pool.sort((a, b2) => area(b2) - area(a));
  const big = new Set(['kitchen', 'laundry', 'stockroom', 'packing', 'shipping', 'receiving', 'bakery', 'archive', 'meeting']);
  const wanted = [...job.rooms];
  for (const t of wanted) {
    if (!pool.length) break;
    assign(big.has(t) ? take(() => true) : take((lf) => area(lf) < 90) || take(() => true), t);
  }
  assign(take(() => true), 'break');
  assign(take((lf) => area(lf) < 70) || take(() => true), 'restroom');
  assign(take(() => true), 'storage');
  const extras = EXTRA_ROOMS[jobId] || ['storage'];
  let k = 0;
  while (pool.length) {
    const lf = pool.pop();
    lf.type = area(lf) < 32 ? 'closet' : extras[k++ % extras.length];
  }

  // ---- build rooms in their own local frames (door on the local +z side)
  const counts = {};
  const S = (Fr) => (tag, x, z, yaw, label, room, opts) => Fr.station(tag, x, z, yaw, label, room, opts);
  for (const lf of leaves) {
    const type = lf.type || 'storage';
    counts[type] = (counts[type] || 0) + 1;
    const rphi = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[lf.corrSide || 's'];
    const ns = lf.corrSide === 'e' || lf.corrSide === 'w';
    const W = ns ? lf.z1 - lf.z0 : lf.x1 - lf.x0;
    const D = ns ? lf.x1 - lf.x0 : lf.z1 - lf.z0;
    const Fr = new Frame(L, lf.cx, lf.cz, rphi, 0);
    const rc = { x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2, cx: 0, cz: 0, w: W, d: D, type, n: counts[type], row: lf.cz < 0 ? 2 : 1 };
    const fn = ROOMS[type] || ROOMS.storage;
    const WS = (x, z, yaw) => Fr.pois.workstations.push({ x, z, yaw });
    const label = fn(Fr, rc, { S: S(Fr), WS, rnd, theme, jobId }) || type.toUpperCase();
    Fr.label(label, 0, 2.55, D / 2 + 0.12, 0, { height: 0.24, bg: theme.sign });
    Fr.pois.wander.push({ x: 0, z: D / 2 - 1.6 });
    lf.label = label;
  }
  L.rooms = leaves;
  L.corridors = corridors;

  // ---- corridor decor (cover, seats, pickups)
  for (const cr of corridors) corridorDecor(L, cr, doors, rnd);

  // ---- public floor
  const pubFn = PUBLIC[jobId] || PUBLIC.office;
  const PWS = (x, z, yaw) => P.pois.workstations.push({ x, z, yaw });
  pubFn(P, { S: S(P), WS: PWS, rnd, theme, coworkers });
  S(P)('trash', -27.5, 22.3, Math.PI, 'the lobby trash can', 'public');
  P.box(-28.3, 22.9, 0.6, 0.6, 0.9, '#2d3436');
  S(P)('trash', 27.5, 22.3, Math.PI, 'the trash can by the door', 'public');
  P.box(28.3, 22.9, 0.6, 0.6, 0.9, '#2d3436');
  P.plant(-29, 23.3);
  P.plant(29, 23.3);
  S(P)('plant', -28.2, 21.2, Math.PI, 'the lobby plant', 'public');
  // spills in hallways
  for (const cr of corridors.slice(0, 2)) {
    const x = (cr.x0 + cr.x1) / 2;
    const z = (cr.z0 + cr.z1) / 2;
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshStandardMaterial({ color: '#6d4c41', roughness: 0.1, transparent: true, opacity: 0.75 }));
    p.rotation.x = -Math.PI / 2;
    p.position.set(x + 0.3, 0.012, z);
    L.add(p);
    L.station('spill', x - 0.5, z, Math.PI / 2, 'the spill in the hallway', 'corridor');
  }
  // workstations for up to 12 coworkers
  for (const lf of leaves) {
    if (L.pois.workstations.length >= 16) break;
    if (['restroom', 'manager', 'lockers', 'loading', 'closet'].includes(lf.type)) continue;
    if (!L.blockedPoint(lf.cx, lf.cz, 0.4)) L.pois.workstations.push({ x: lf.cx, z: lf.cz, yaw: 0 });
  }
  for (const cr of corridors) L.pois.wander.push({ x: (cr.x0 + cr.x1) / 2, z: (cr.z0 + cr.z1) / 2 });
  L.pois.wander.push(...L.pois.customerSpots.slice(0, 6).map((s2) => ({ x: s2.x + 0.8, z: s2.z + 0.8 })));
  L.pois.wander = L.pois.wander.filter((w) => !L.blockedPoint(w.x, w.z, 0.35));
  L.maxCustomers = theme.maxCustomers || 8;
  L.layoutInfo = { side, bw, bd, rooms: leaves.length, corridors: corridors.length };
  for (const st of L.stations) {
    if (!L.blockedPoint(st.x, st.z, 0.25)) continue;
    for (let r = 0.2; r <= 0.8; r += 0.2) {
      const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
      const d = dirs.find(([dx, dz]) => !L.blockedPoint(st.x + dx * r, st.z + dz * r, 0.25));
      if (d) {
        st.x += d[0] * r;
        st.z += d[1] * r;
        const it = L.interactables.get(st.id);
        if (it) {
          it.x = st.x;
          it.z = st.z;
        }
        break;
      }
    }
  }
  // pushable whiteboards and carts in rooms and on the shop floor
  const freeSpot = (x0, x1, z0, z1) => {
    for (let t = 0; t < 25; t++) {
      const x = x0 + 1 + rnd() * Math.max(0.1, x1 - x0 - 2);
      const z = z0 + 1 + rnd() * Math.max(0.1, z1 - z0 - 2);
      if (!L.blockedPoint(x, z, 0.95) && !L.movables.some((m) => Math.hypot(m.x - x, m.z - z) < 2)) return { x, z };
    }
    return null;
  };
  for (const rm of L.rooms) {
    if (!['meeting', 'office', 'storage', 'break', 'mail', 'copy', 'archive', 'kitchen', 'laundry', 'stockroom', 'receiving', 'linen', 'study', 'workroom', 'packing', 'shipping', 'pantry', 'returns', 'guestroom', 'lockers'].includes(rm.type) || rnd() > 0.55) continue;
    const pt = freeSpot(rm.x0, rm.x1, rm.z0, rm.z1);
    if (pt) L.movable(['meeting', 'office'].includes(rm.type) || (jobId === 'office' && rnd() < 0.6) ? 'whiteboard' : 'cart', pt.x, pt.z, rnd() * Math.PI);
  }
  const floorPts = L.pois.customerSpots.concat(L.pois.wander);
  for (let k = 0; k < 3 && floorPts.length; k++) {
    const b = floorPts[Math.floor(rnd() * floorPts.length)];
    const pt = freeSpot(b.x - 3, b.x + 3, b.z - 3, b.z + 3);
    if (pt) L.movable(jobId === 'office' ? 'whiteboard' : 'cart', pt.x, pt.z, rnd() * Math.PI);
  }
  L.finalize();
  L.buildNav(0.8);
  return L;
}

/** Exact-length wall segment (no overlap into doorways). */
function seg(L, x1, z1, x2, z2, h) {
  const t = 0.2;
  const w = Math.abs(x2 - x1);
  const d = Math.abs(z2 - z1);
  L.box((x1 + x2) / 2, (z1 + z2) / 2, w || t, d || t, h, WALL);
}

function corridorDecor(L, cr, doors, rnd) {
  const alongX = cr.axis === 'x';
  const len = alongX ? cr.x1 - cr.x0 : cr.z1 - cr.z0;
  if (len < 6) return;
  const nearDoor = (x, z) =>
    doors.some((d) => {
      const m = d.line === 'x' ? x : z;
      const a = d.line === 'x' ? z : x;
      return Math.abs(a - d.at) < 1.6 && m > d.from - 1.2 && m < d.to + 1.2;
    });
  let flip = rnd() < 0.5;
  for (let t = 3 + rnd() * 3; t < len - 3; t += 5 + rnd() * 5) {
    flip = !flip;
    const along = (alongX ? cr.x0 : cr.z0) + t;
    const sideOff = flip ? 0.35 : CORR - 0.35;
    const x = alongX ? along : cr.x0 + sideOff;
    const z = alongX ? cr.z0 + sideOff : along;
    if (nearDoor(x, z)) continue;
    const r = rnd();
    const w = alongX ? 0.9 : 0.5;
    const d = alongX ? 0.5 : 0.9;
    if (r < 0.25) L.plant(x, z, 1.1);
    else if (r < 0.4) L.box(x, z, w, d, 1.85, '#c0392b'); // vending machine
    else if (r < 0.52) {
      L.box(x, z, alongX ? 0.4 : 0.4, alongX ? 0.4 : 0.4, 1.2, '#74b9ff'); // water cooler
    } else if (r < 0.68) {
      L.movable('cart', x, z, alongX ? 0 : Math.PI / 2); // a cart anyone can push around
    } else if (r < 0.8) {
      L.box(x, z, alongX ? 1.4 : 0.45, alongX ? 0.45 : 1.4, 0.45, '#8d6e63', { occlude: false });
      L.seat(x, z, alongX ? (flip ? 0 : Math.PI) : flip ? Math.PI / 2 : -Math.PI / 2, 'hallway bench');
    } else if (r < 0.9) {
      L.box(x, z, w, d, 1.4, '#636e72'); // filing cabinet
      L.pickup('folder', x, z, 1.4);
    } else L.pickup('sign', x, z, 0.0);
  }
}

// ---------------------------------------------------------------------------
// Back rooms. Local frame: x from -w/2..w/2, back wall at z0, door wall at z1
// (door in the middle). yaw Math.PI faces the back wall.

function shelfRow(L, r, tag, label, color, S, n = 2, h = 1.9) {
  const xs = n === 1 ? [r.cx] : [r.x0 + r.w * 0.28, r.x0 + r.w * 0.72];
  xs.forEach((x, i) => {
    L.box(x, r.z0 + 0.55, Math.min(2.4, r.w * 0.38), 0.7, h, color);
    S(tag, x, r.z0 + 1.55, Math.PI, `${label}${xs.length > 1 ? ' ' + (i + 1) : ''}`, r.type);
  });
}
function shelfRowSide(L, r, tag, label, S) {
  L.box(r.x0 + 0.45, r.cz + 0.5, 0.7, Math.min(2.2, r.d - 3), 1.8, '#e1b382');
  S(tag, r.x0 + 1.3, r.cz + 0.5, -Math.PI / 2, label, r.type);
}

const ROOMS = {
  lockers(L, r, { S }) {
    const n = Math.max(2, Math.floor((r.d - 2) / 0.6));
    for (let i = 0; i < n; i++) L.box(r.x0 + 0.35, r.z0 + 0.6 + i * 0.6, 0.5, 0.56, 1.9, i % 2 ? '#74b9ff' : '#0984e3');
    for (let i = 0; i < n; i++) L.box(r.x1 - 0.35, r.z0 + 0.6 + i * 0.6, 0.5, 0.56, 1.9, i % 2 ? '#74b9ff' : '#0984e3');
    L.box(r.cx, r.cz, Math.min(2.2, r.w - 3), 0.5, 0.45, '#8d6e63', { occlude: false });
    L.seat(r.cx, r.cz + 0.4, 0, 'locker room bench');
    L.box(r.cx, r.z0 + 0.2, 0.5, 0.25, 0.6, '#2d3436', { y: 1.1, collide: false });
    L.label('TIME CLOCK', r.cx, 1.95, r.z0 + 0.35, 0, { height: 0.22, bg: '#c0392b' });
    L.interactable('timeclock', r.cx, r.z0 + 1.1, 'Time clock', { r: 1.2 });
    L.box(r.cx + 1.4, r.z0 + 0.12, 1.0, 0.05, 0.8, '#ecf0f1', { y: 1.2, collide: false });
    S('schedule', r.cx + 1.4, r.z0 + 1.0, Math.PI, 'the schedule board', 'lockers');
    L.box(r.cx - 1.4, r.z0 + 0.4, 0.8, 0.5, 1.0, '#636e72');
    S('inbox', r.cx - 1.4, r.z0 + 1.2, Math.PI, 'the staff inbox', 'lockers');
    L.pickup('towel', r.cx - 0.6, r.cz, 0.45);
    L.hideSpot(r.x0 + 0.9, r.z1 - 1.2, 'lockers');
    L.setPoi('lockers', { spot: { x: r.cx, z: r.cz + 1 } });
    return 'LOCKER ROOM';
  },
  manager(L, r, { S }) {
    L.box(r.cx, r.z0 + 2.2, 2.4, 1.0, 0.78, '#6d4c41');
    L.box(r.cx, r.z0 + 2.2, 0.6, 0.1, 0.4, '#2d3436', { y: 0.78, collide: false });
    L.chair(r.cx, r.z0 + 1.2, 0, '#2d3436');
    L.chair(r.cx - 0.8, r.z0 + 3.4, Math.PI, '#6d4c41');
    L.box(r.x0 + 0.5, r.z0 + 0.5, 0.8, 0.6, 1.4, '#636e72');
    L.plant(r.x1 - 0.6, r.z0 + 0.6);
    S('mgrdesk', r.cx + 0.3, r.z0 + 3.3, Math.PI, "the manager's desk", 'manager');
    L.setPoi('manager', { desk: { x: r.cx, z: r.z0 + 1.3, yaw: 0 }, stand: { x: r.cx + 0.3, z: r.z0 + 3.5, yaw: Math.PI }, door: { x: r.cx, z: r.z1 + 1.2, yaw: 0 } });
    return "MANAGER'S OFFICE";
  },
  restroom(L, r, { S }) {
    for (let i = 0; i < 2; i++) {
      L.box(r.x1 - 0.4, r.z1 - 2.5 - i * 1.4, 0.7, 0.9, 0.85, '#ffffff');
      S('sink', r.x1 - 1.2, r.z1 - 2.5 - i * 1.4, -Math.PI / 2, 'the restroom sink', 'restroom');
    }
    const n = Math.max(2, Math.min(4, Math.floor((r.w - 0.4) / 1.4)));
    const sw = (r.w - 0.4) / n;
    for (let i = 0; i <= n; i++) L.box(r.x0 + 0.2 + i * sw, r.z0 + 1.1, 0.08, 2.2, 2.1, '#a4b0be');
    for (let i = 0; i < n; i++) {
      const x = r.x0 + 0.2 + sw * (i + 0.5);
      L.box(x, r.z0 + 0.45, 0.45, 0.6, 0.45, '#ffffff', { collide: false });
      L.box(x - sw * 0.3, r.z0 + 2.2, sw * 0.4, 0.06, 1.9, '#a4b0be', { y: 0.15 });
      L.hideSpot(x + 0.15, r.z0 + 1.1, 'restroom');
    }
    return `RESTROOM ${r.n}`;
  },
  storage(L, r, { S }) {
    shelfRow(L, r, 'supply', 'the supply shelf', '#81ecec', S);
    L.box(r.x0 + 0.5, r.cz, 0.8, 1.6, 1.0, '#c8a27a');
    L.pickup('box', r.x0 + 0.5, r.cz, 1.0);
    L.box(r.x1 - 0.5, r.cz + 1, 0.6, 0.6, 0.9, '#f1c40f');
    S('mop', r.x1 - 1.2, r.cz + 1, -Math.PI / 2, 'the janitor closet', 'storage');
    L.pickup('bucket', r.x1 - 0.5, r.cz + 1, 0.9);
    L.hideSpot(r.x0 + 1.2, r.z0 + 1.4, 'storage');
    return r.n > 1 ? `STORAGE ${r.n}` : 'STORAGE';
  },
  closet(L, r) {
    L.box(r.cx, r.z0 + 0.4, r.w - 1, 0.6, 1.9, '#a1887f');
    L.pickup('box', r.x0 + 0.6, r.cz, 0.0);
    L.hideSpot(r.cx, r.cz - 0.3, 'closet');
    return 'CLOSET';
  },
  loading(L, r, { S }) {
    L.box(r.x0 + 1.5, r.z0 + 1.2, 2.2, 1.6, 1.5, '#27ae60');
    S('dumpster', r.x0 + 1.5, r.z0 + 2.6, Math.PI, 'the dumpster', 'loading');
    L.box(r.x1 - 1.6, r.z0 + 1.0, 1.2, 1.2, 0.3, '#a1887f');
    L.box(r.x1 - 1.6, r.z0 + 1.0, 1.1, 1.1, 0.9, '#c8a27a', { y: 0.3 });
    L.pickup('box', r.x1 - 1.6, r.z0 + 1.0, 1.2);
    S('dock', r.cx + 1, r.z0 + 2.2, Math.PI, 'the loading dock', 'loading');
    S('pallet', r.x1 - 1.6, r.z0 + 2.3, Math.PI, 'the pallet by the dock', 'loading');
    L.box(r.x0 + 0.8, r.z1 - 1.0, 1.0, 1.0, 1.4, '#c8a27a');
    return 'LOADING';
  },
  break(L, r, { S, WS }) {
    L.box(r.x0 + 0.45, r.cz, 0.8, Math.max(1.5, r.d - 3), 0.95, '#b2bec3');
    S('coffee', r.x0 + 1.3, r.cz - 0.8, -Math.PI / 2, 'the coffee machine', 'break');
    S('microwave', r.x0 + 1.3, r.cz + 0.8, -Math.PI / 2, 'the microwave', 'break');
    L.pickup('cup', r.x0 + 0.45, r.cz + 0.3, 0.95);
    L.box(r.x1 - 0.5, r.z0 + 0.6, 0.9, 0.9, 1.9, '#dfe6e9');
    S('fridge', r.x1 - 0.6, r.z0 + 1.6, Math.PI, 'the break room fridge', 'break');
    const zs = r.d > 8 ? [r.cz - 1.4, r.cz + 1.6] : [r.cz];
    for (const z of zs) {
      L.box(r.cx + 0.6, z, 1.6, 1.0, 0.75, '#fab1a0');
      L.chair(r.cx - 0.5, z, Math.PI / 2, undefined, true);
      L.chair(r.cx + 1.7, z, -Math.PI / 2, undefined, true);
      WS(r.cx - 0.5, z, Math.PI / 2);
    }
    L.sofa(r.x1 - 0.55, r.z1 - 1.8, 1.8, -Math.PI / 2, '#6c5ce7');
    L.seat(r.x1 - 0.6, r.z1 - 1.8, -Math.PI / 2, 'break room couch');
    return 'BREAK ROOM';
  },
  meeting(L, r, { S }) {
    const tl = Math.max(1.6, r.d - 5);
    L.box(r.cx, r.cz - 0.5, 1.6, tl, 0.76, '#8d6e63');
    const n = Math.max(1, Math.floor(tl / 1.5));
    for (let i = 0; i < n; i++) {
      const z = r.cz - 0.5 - tl / 2 + 0.75 + i * 1.5;
      L.chair(r.cx - 1.2, z, Math.PI / 2, '#2d3436', true);
      L.chair(r.cx + 1.2, z, -Math.PI / 2, '#2d3436', true);
    }
    S('meetingtable', r.cx + 1.6, r.cz + tl / 2 - 0.2, -Math.PI / 2, `meeting room ${String.fromCharCode(64 + r.n)}`, 'meeting');
    L.pickup('clipboard', r.cx, r.cz, 0.78);
    L.box(r.cx, r.z0 + 0.12, 2.4, 0.06, 1.2, '#ffffff', { y: 0.9, collide: false });
    S('whiteboard', r.cx, r.z0 + 1.0, Math.PI, `the whiteboard in meeting room ${String.fromCharCode(64 + r.n)}`, 'meeting');
    return `MEETING ${String.fromCharCode(64 + r.n)}`;
  },
  copy(L, r, { S }) {
    L.box(r.x0 + 1.2, r.z0 + 0.7, 1.4, 1.0, 1.15, '#bdc3c7');
    S('copier', r.x0 + 1.2, r.z0 + 1.8, Math.PI, 'the big copier', 'copy');
    L.box(r.x1 - 1.2, r.z0 + 0.6, 1.0, 0.9, 1.05, '#ecf0f1');
    S('printer', r.x1 - 1.2, r.z0 + 1.6, Math.PI, 'the copy room printer', 'copy');
    L.box(r.x0 + 0.4, r.cz + 1, 0.6, 2, 1.8, '#81ecec');
    S('supply', r.x0 + 1.2, r.cz + 1, -Math.PI / 2, 'the copy room supplies', 'copy');
    L.box(r.x1 - 0.5, r.cz + 1, 0.6, 0.7, 0.9, '#2d3436');
    S('shredder', r.x1 - 1.2, r.cz + 1, -Math.PI / 2, 'the shredder', 'copy');
    L.pickup('folder', r.x1 - 1.2, r.z0 + 0.6, 1.05);
    return 'COPY ROOM';
  },
  mail(L, r, { S, WS }) {
    L.box(r.cx, r.z0 + 0.4, r.w - 1, 0.5, 1.8, '#d1ccc0');
    S('mail', r.cx, r.z0 + 1.3, Math.PI, 'the mail sorting rack', 'mail');
    L.box(r.cx, r.cz + 0.5, 2.2, 1.0, 0.9, '#a1887f');
    L.pickup('box', r.cx + 0.6, r.cz + 0.5, 0.9);
    WS(r.cx, r.cz + 1.6, Math.PI);
    return 'MAIL ROOM';
  },
  server(L, r, { S }) {
    const n = Math.max(1, Math.floor((r.w - 1.5) / 1.8));
    for (let i = 0; i < n; i++) L.box(r.x0 + 1.2 + i * 1.8, r.cz - 1, 0.8, Math.max(2, r.d - 5), 2.1, '#2d3436');
    S('server', r.x0 + 2.1, r.z1 - 1.6, Math.PI, 'the server rack', 'server');
    L.hideSpot(r.x0 + 2.1, r.cz - 1, 'server');
    return 'SERVER ROOM';
  },
  office(L, r, { S, WS }) {
    L.box(r.cx, r.z0 + 2, 2.2, 0.9, 0.76, '#6d4c41');
    L.chair(r.cx, r.z0 + 1.1, 0, '#2d3436', true);
    L.box(r.x1 - 0.5, r.z0 + 0.5, 0.8, 0.6, 1.4, '#636e72');
    S('officedesk', r.cx + 0.2, r.z0 + 3.1, Math.PI, `private office ${r.n}`, 'office');
    WS(r.cx, r.z0 + 1.1, 0);
    L.plant(r.x0 + 0.6, r.z0 + 0.6);
    L.pickup('folder', r.cx + 0.6, r.z0 + 2, 0.78);
    return `OFFICE ${r.n}`;
  },
  archive(L, r, { S }) {
    const n = Math.max(1, Math.floor((r.d - 2.5) / 2.6));
    for (let i = 0; i < n; i++) L.box(r.cx, r.z0 + 1 + i * 2.6, r.w - 2.2, 0.7, 2.1, '#a1887f');
    S('archivebox', r.cx, r.z0 + 2.3, Math.PI, 'the archive shelves', 'archive');
    L.pickup('box', r.x0 + 0.6, r.z1 - 1.2, 0.0);
    L.hideSpot(r.x0 + 0.7, r.z0 + 2.3, 'archive');
    return 'ARCHIVE';
  },
  kitchen(L, r, { S, WS }) {
    L.box(r.cx, r.z0 + 0.5, r.w - 0.6, 0.9, 0.95, '#636e72');
    S('stove', r.cx - 1, r.z0 + 1.5, Math.PI, `the stove in kitchen ${r.n}`, 'kitchen');
    WS(r.cx + 1.2, r.z0 + 1.5, Math.PI);
    L.box(r.cx, r.cz + 0.6, Math.min(2.6, r.w - 2), 1.0, 0.95, '#b2bec3');
    S('prep', r.cx, r.cz - 0.5, 0, `the prep table in kitchen ${r.n}`, 'kitchen');
    L.pickup('tray', r.cx + 0.6, r.cz + 0.6, 0.95);
    WS(r.cx - 1, r.cz + 1.7, Math.PI);
    return `KITCHEN ${r.n}`;
  },
  pantry(L, r, { S }) {
    shelfRow(L, r, 'pantryshelf', 'the pantry shelf', '#e1b382', S);
    L.box(r.x0 + 0.5, r.cz + 1, 0.8, 2, 1.6, '#e1b382');
    L.pickup('box', r.x1 - 0.7, r.cz + 1, 0.0);
    L.hideSpot(r.x1 - 1, r.z0 + 1.6, 'pantry');
    return 'PANTRY';
  },
  freezer(L, r, { S }) {
    L.floor(r.cx, r.cz, r.w, r.d, '#dff9fb', 0.004);
    shelfRow(L, r, 'freezer', 'the walk-in freezer', '#c7ecee', S);
    L.hideSpot(r.x0 + 1, r.cz, 'freezer');
    return 'FREEZER';
  },
  dishroom(L, r, { S, WS }) {
    L.box(r.cx, r.z0 + 0.5, r.w - 0.6, 0.9, 0.95, '#b2bec3');
    S('dish', r.cx, r.z0 + 1.5, Math.PI, 'the dish pit', 'dishroom');
    WS(r.cx + 1.4, r.z0 + 1.5, Math.PI);
    L.pickup('tray', r.x1 - 0.8, r.z0 + 0.5, 0.95);
    return 'DISH ROOM';
  },
  laundry(L, r, { S, WS }) {
    const n = Math.max(1, Math.min(3, Math.floor(r.w / 2.4)));
    for (let i = 0; i < n; i++) L.box(r.x0 + 1 + i * 1.1, r.z0 + 0.5, 0.9, 0.8, 1.0, '#ecf0f1');
    S('washer', r.x0 + 1 + (n - 1) * 0.55, r.z0 + 1.5, Math.PI, 'the washing machines', 'laundry');
    for (let i = 0; i < 2; i++) L.box(r.x1 - 1 - i * 1.1, r.z0 + 0.5, 0.9, 0.8, 1.0, '#dfe6e9');
    S('dryer', r.x1 - 1.6, r.z0 + 1.5, Math.PI, 'the dryers', 'laundry');
    L.box(r.cx, r.cz + 1, 2, 1, 0.9, '#a29bfe');
    S('linen', r.cx, r.cz + 2.1, Math.PI, 'the linen table', 'laundry');
    L.pickup('laundry', r.cx - 0.5, r.cz + 1, 0.9);
    L.pickup('towel', r.cx + 0.5, r.cz + 1, 0.9);
    WS(r.cx - 0.8, r.cz + 2.1, Math.PI);
    return 'LAUNDRY';
  },
  linen(L, r, { S }) {
    shelfRow(L, r, 'linenshelf', 'the linen closet', '#dfe6e9', S);
    L.pickup('towel', r.x1 - 0.7, r.cz + 1, 0.0);
    L.hideSpot(r.x0 + 1, r.cz + 1, 'linen');
    return 'LINEN';
  },
  guestroom(L, r, { S }) {
    const num = 100 + r.n * 2 + (r.row === 2 ? 100 : 0);
    L.box(r.cx, r.z0 + 1.3, 2.0, 2.4, 0.55, '#dfe6e9');
    L.box(r.cx, r.z0 + 0.2, 2.1, 0.15, 1.1, '#6d4c41');
    S('guestbed', r.cx + 1.6, r.z0 + 1.6, -Math.PI / 2, `room ${num}`, 'guestroom');
    L.pickup('pillow', r.cx - 0.5, r.z0 + 0.7, 0.55);
    L.box(r.x1 - 0.5, r.cz + 1.2, 0.6, 0.6, 0.85, '#2d3436');
    S('minibar', r.x1 - 1.3, r.cz + 1.2, -Math.PI / 2, `the minibar in room ${num}`, 'guestroom');
    L.box(r.x0 + 0.4, r.cz + 1, 0.6, 1.5, 0.75, '#8d6e63');
    L.chair(r.x0 + 1.1, r.cz + 1, -Math.PI / 2, '#6d4c41', true);
    L.box(r.x0 + 0.5, r.z1 - 1.0, 0.8, 1.2, 2.0, '#8d6e63'); // wardrobe
    L.hideSpot(r.x0 + 1.2, r.z1 - 1.0, 'guestroom');
    return `ROOM ${num}`;
  },
  stockroom(L, r, { S, WS }) {
    const n = Math.max(1, Math.floor((r.d - 2.5) / 2.7));
    for (let i = 0; i < n; i++) L.box(r.cx, r.z0 + 1 + i * 2.7, Math.max(1, r.w - 2.4), 0.9, 2.0, '#636e72');
    S('stockbox', r.cx, r.z0 + 2.2, Math.PI, `stockroom ${r.n}`, 'stockroom');
    L.pickup('box', r.x1 - 0.6, r.z1 - 1.3, 0.0);
    WS(r.cx + 1.2, r.z1 - 1.4, Math.PI);
    L.hideSpot(r.x0 + 0.7, r.z0 + 2.2, 'stockroom');
    return `STOCKROOM ${r.n}`;
  },
  receiving(L, r, { S, WS }) {
    const n = Math.max(1, Math.min(3, Math.floor((r.w - 1) / 2.2)));
    for (let i = 0; i < n; i++) L.box(r.x0 + 1.4 + i * 2.2, r.z0 + 1.2, 1.2, 1.2, 1.0 + (i % 2) * 0.6, '#c8a27a');
    L.pickup('box', r.x0 + 1.4, r.z0 + 1.2, 1.0);
    S('dock', r.cx, r.z0 + 2.6, Math.PI, 'the receiving dock', 'receiving');
    S('pallet', r.x0 + 1.4, r.z0 + 2.6, Math.PI, 'the receiving pallets', 'receiving');
    WS(r.cx + 1.5, r.cz + 1, Math.PI);
    return 'RECEIVING';
  },
  returns(L, r, { S, WS }) {
    L.box(r.cx, r.z0 + 1.2, r.w - 1.2, 0.8, 1.05, '#e84118');
    S('returnbin', r.cx, r.z0 + 2.3, Math.PI, 'the returns bin', 'returns');
    L.pickup('bag', r.cx + 0.8, r.z0 + 1.2, 1.05);
    WS(r.cx - 1.4, r.z0 + 2.3, Math.PI);
    return 'RETURNS';
  },
  study(L, r, { S }) {
    L.box(r.cx, r.cz, 1.6, 2.4, 0.76, '#8d6e63');
    L.chair(r.cx - 1.1, r.cz, Math.PI / 2);
    L.chair(r.cx + 1.1, r.cz, -Math.PI / 2, undefined, true);
    S('studytable', r.cx, r.cz + 1.9, Math.PI, `study room ${r.n}`, 'study');
    L.pois.customerSpots.push({ x: r.cx - 1.1, z: r.cz, yaw: Math.PI / 2, sit: true });
    L.pickup('books', r.cx, r.cz - 0.6, 0.76);
    return `STUDY ROOM ${r.n}`;
  },
  workroom(L, r, { S, WS }) {
    L.box(r.x0 + 1.4, r.z0 + 0.6, 2, 1, 0.9, '#a1887f');
    S('repair', r.x0 + 1.4, r.z0 + 1.6, Math.PI, 'the book repair bench', 'workroom');
    L.box(r.x1 - 1.2, r.z0 + 0.6, 1.2, 1, 1.0, '#bdc3c7');
    S('scanner', r.x1 - 1.2, r.z0 + 1.6, Math.PI, 'the big scanner', 'workroom');
    L.pickup('books', r.x0 + 1.4, r.z0 + 0.6, 0.9);
    WS(r.cx, r.cz + 1, Math.PI);
    return 'WORKROOM';
  },
  shipping(L, r, { S, WS }) {
    L.box(r.cx, r.z0 + 0.8, r.w - 1.5, 1.2, 1.4, '#c8a27a');
    S('dock', r.cx, r.z0 + 2.1, Math.PI, 'the shipping dock', 'shipping');
    S('pallet', r.x0 + 1, r.cz + 1, -Math.PI / 2, 'the outbound pallets', 'shipping');
    L.pickup('box', r.x1 - 1, r.cz + 1, 0.0);
    WS(r.cx + 1.5, r.z0 + 2.1, Math.PI);
    return 'SHIPPING';
  },
  packing(L, r, { S, WS }) {
    const zs = r.d > 8 ? [r.z0 + 1.5, r.cz + 1.5] : [r.z0 + 1.5];
    for (const z of zs) {
      L.box(r.cx, z, Math.max(1.5, r.w - 2), 0.9, 0.9, '#dfe6e9');
      S('packing', r.cx, z + 1.0, Math.PI, 'a packing table', 'packing');
      L.pickup('box', r.cx + 0.8, z, 0.9);
      WS(r.cx - 1.2, z + 1.0, Math.PI);
    }
    return 'PACKING';
  },
  bakery(L, r, { S, WS }) {
    L.box(r.cx, r.z0 + 0.5, r.w - 0.8, 0.9, 1.4, '#636e72');
    S('oven', r.cx, r.z0 + 1.6, Math.PI, 'the bakery ovens', 'bakery');
    L.box(r.cx, r.cz + 1, 2.2, 1, 0.95, '#f5f6fa');
    L.pickup('tray', r.cx + 0.6, r.cz + 1, 0.95);
    WS(r.cx, r.cz + 2.1, Math.PI);
    shelfRowSide(L, r, 'pantryshelf', 'the flour shelf', S);
    return 'BAKERY';
  },
  roastery(L, r, { S, WS }) {
    L.box(r.x0 + 1.4, r.z0 + 1, 1.6, 1.6, 1.6, '#6f4e37');
    S('roaster', r.x0 + 1.4, r.z0 + 2.4, Math.PI, 'the coffee roaster', 'roastery');
    L.box(r.x1 - 1, r.z0 + 0.6, 1.4, 0.9, 1.0, '#a1887f');
    S('beans', r.x1 - 1, r.z0 + 1.6, Math.PI, 'the green bean sacks', 'roastery');
    L.pickup('bag', r.x1 - 1, r.z0 + 0.6, 1.0);
    WS(r.cx, r.cz + 1.5, Math.PI);
    return 'ROASTERY';
  },
};

// ---------------------------------------------------------------------------
// Public floors in a canonical 60 x 20 frame: x -30..30, z 4 (back) .. 24 (entrance).
// Keep the entrance (x -3..3, z 19..24) clear.

const PUBLIC = {
  office(L, { S, WS, coworkers }) {
    L.floor(0, 21, 10, 6, '#576574', 0.002);
    L.box(0, 19.5, 5, 0.9, 1.1, '#e1b382');
    L.label('RECEPTION', 0, 1.6, 19.96, 0, { height: 0.3, bg: '#273c75' });
    S('reception', 0, 18.6, 0, 'the reception desk', 'public');
    S('inbox', 1.8, 20.5, Math.PI, 'the reception inbox', 'public');
    WS(-1.2, 18.6, 0);
    L.pickup('clipboard', 1.6, 19.5, 1.1);
    for (let i = 0; i < 4; i++) L.chair(-12 + i * 0.8, 22.8, Math.PI);
    for (let i = 0; i < 4; i++) L.pois.customerSpots.push({ x: -12 + i * 0.8, z: 22.8, yaw: Math.PI, sit: true });
    const desks = [];
    const pc = '#a29bfe';
    for (const zc of [7.2, 11.6, 16.0]) {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const cx = side * (5 + i * 3.4);
          L.box(cx, zc - 1.3, 3.2, 0.1, 1.35, pc);
          L.box(cx - 1.6, zc - 0.55, 0.1, 1.5, 1.35, pc);
          L.box(cx + 1.6, zc - 0.55, 0.1, 1.5, 1.35, pc);
          L.box(cx, zc - 0.85, 2.4, 0.7, 0.75, '#dfe6e9');
          L.box(cx, zc - 0.9, 0.6, 0.08, 0.4, '#2d3436', { y: 0.75, collide: false, occlude: false });
          desks.push({ x: cx, z: zc - 0.1, yaw: Math.PI, seat: L.chair(cx, zc - 0.1, Math.PI, '#2d3436', true) });
          if ((i + zc) % 3 < 1) L.pickup('folder', cx + 0.7, zc - 0.85, 0.75);
        }
      }
    }
    desks.sort((a, b) => Math.abs(a.x) + a.z * 0.1 - (Math.abs(b.x) + b.z * 0.1));
    const me = desks[0];
    if (me.seat) me.seat.label = 'your chair';
    S('mydesk', me.x, me.z + 0.3, Math.PI, 'your desk', 'public');
    L.label('YOU', me.x, 1.45, me.z - 1.17, 0, { height: 0.22, bg: '#00b894' });
    coworkers.forEach((c, i) => {
      const d = desks[i + 1];
      if (!d) return;
      S('desk', d.x, d.z + 0.3, Math.PI, `${c.name}'s desk`, 'public', { owner: i });
      if (d.seat) {
        d.seat.owner = i;
        d.seat.label = `${c.name}'s chair`;
      }
      L.label(c.name.toUpperCase(), d.x, 1.45, d.z - 1.17, 0, { height: 0.22, bg: '#6c5ce7' });
    });
    desks.slice(1).forEach((d) => WS(d.x, d.z, d.yaw));
    for (const [x, z] of [[-28.4, 9], [28.4, 9]]) {
      L.box(x, z, 0.9, 1.1, 1.05, '#ecf0f1');
      S('printer', x + (x < 0 ? 1 : -1), z, x < 0 ? -Math.PI / 2 : Math.PI / 2, x < 0 ? 'the west printer' : 'the east printer', 'public');
      L.pickup('folder', x, z, 1.05);
    }
    ['A', 'B', 'C', 'D'].forEach((c, i) => {
      const x = [-28.5, -28.5, 28.5, 28.5][i];
      const z = [13.5, 17, 13.5, 17][i];
      L.box(x, z, 0.7, 1.0, 1.35, '#636e72');
      S('cabinet', x + (x < 0 ? 1 : -1), z, x < 0 ? -Math.PI / 2 : Math.PI / 2, 'filing cabinet ' + c, 'public');
    });
    // big planters and a partition wall in the middle aisle: cover
    for (const z of [9.4, 13.8]) L.box(0, z, 1.0, 1.6, 1.25, '#2d6a4f');
    L.plant(-3, 18.3);
    L.plant(3, 13.5);
    S('plant', 3, 12.6, Math.PI, 'the office ficus', 'public');
    L.box(-20, 20.5, 3, 0.4, 1.6, '#576574'); // display panel
    for (const p of [[0, 15.8], [-20, 20], [20, 20], [0, 5.8]]) L.pois.customerSpots.push({ x: p[0], z: p[1], yaw: Math.PI });
  },

  restaurant(L, { S, WS }) {
    L.box(-8.5, 5.0, 7, 0.8, 1.1, '#b2bec3');
    L.label('KITCHEN PASS', -8.5, 2.2, 4.25, 0, { height: 0.3, bg: '#e17055' });
    S('pass', -8.5, 6.1, Math.PI, 'the kitchen pass', 'public');
    L.pickup('tray', -10, 5.0, 1.1);
    L.pickup('tray', -7, 5.0, 1.1);
    WS(-10.5, 6.2, Math.PI);
    L.box(-3.6, 4.6, 0.6, 0.5, 1.2, '#2d3436');
    S('terminal', -3.6, 5.5, Math.PI, 'the order terminal', 'public');
    L.box(8, 4.6, 2.4, 0.8, 1.1, '#2d3436');
    S('soda', 8, 5.6, Math.PI, 'the soda fountain', 'public');
    L.box(24.5, 13, 0.8, 12, 1.1, '#4b2c20');
    L.box(28.8, 13, 0.6, 12, 2, '#6d4c41');
    S('bar', 26.2, 13, -Math.PI / 2, 'the bar', 'public');
    WS(26.2, 10, -Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const z = 8.5 + i * 1.8;
      L.box(23.5, z, 0.4, 0.4, 0.75, '#2d3436', { collide: false, occlude: false });
      L.pois.customerSpots.push({ x: 23.4, z, yaw: -Math.PI / 2, sit: true });
    }
    L.box(-4.2, 20.5, 1.2, 0.7, 1.15, '#4b2c20');
    L.label('HOST', -4.2, 1.45, 20.86, 0, { height: 0.2, bg: '#4b2c20' });
    S('host', -4.2, 19.6, 0, 'the host stand', 'public');
    L.pickup('menu', -4.6, 20.5, 1.15);
    L.pickup('menu', -3.8, 20.5, 1.15);
    let n = 1;
    for (const z of [9, 13.5, 18]) {
      for (const x of [-23, -16.5, -10, -3.5, 3.5, 10, 16.5]) {
        if (z === 18 && Math.abs(x) < 5) continue;
        L.box(x, z, 1.4, 1.4, 0.76, '#ecf0f1');
        L.label(String(n), x, 0.9, z, 0, { height: 0.25, bg: '#2d3436' });
        L.chair(x, z - 1.0, 0);
        L.chair(x, z + 1.0, Math.PI);
        L.chair(x - 1.0, z, Math.PI / 2);
        L.chair(x + 1.0, z, -Math.PI / 2);
        L.pois.customerSpots.push(
          { x, z: z - 1.0, yaw: 0, sit: true },
          { x, z: z + 1.0, yaw: Math.PI, sit: true },
          { x: x - 1.0, z, yaw: Math.PI / 2, sit: true },
          { x: x + 1.0, z, yaw: -Math.PI / 2, sit: true }
        );
        S('table', x + 1.6, z + 1.2, -Math.PI / 2, 'table ' + n, 'public');
        n++;
      }
    }
    // high-backed booths along the west wall and room dividers with planters (cover)
    for (const z of [8, 12, 16, 20]) {
      L.box(-28.6, z, 1.2, 0.3, 1.3, '#6d214f');
      L.box(-28.6, z + 1.6, 1.2, 0.3, 1.3, '#6d214f');
      L.box(-28.6, z + 0.8, 1.0, 0.9, 0.74, '#ecf0f1');
      L.pois.customerSpots.push({ x: -28.6, z: z + 0.3, yaw: 0, sit: true });
    }
    for (const x of [-13.2, 0, 13.2]) L.box(x, 11.2, 2.2, 0.5, 1.25, '#2d6a4f');
    for (const [x, z] of [[-13.2, 6.3], [0, 11.8], [13.2, 6.3], [-20, 15.8], [20, 15.8], [6.8, 20]]) WS(x, z, Math.PI);
    L.plant(-28.8, 5);
    L.plant(21, 5);
    S('plant', 21, 6, Math.PI, 'the dining room palm', 'public');
  },

  retail(L, { S, WS }) {
    let k = 1;
    for (const x of [-19, -14, -9, 9, 14, 19]) {
      L.box(x, 19.8, 0.9, 3, 1.05, '#e84118');
      L.box(x, 19, 0.4, 0.3, 0.35, '#2d3436', { y: 1.05, collide: false, occlude: false });
      L.label('LANE ' + k, x, 2.3, 19.8, 0, { height: 0.25, bg: '#e84118' });
      S('register', x + 1.0, 19.4, -Math.PI / 2, 'checkout lane ' + k, 'public');
      WS(x + 1.0, 20.4, -Math.PI / 2);
      L.pois.customerSpots.push({ x: x - 1.0, z: 19.4, yaw: Math.PI / 2 });
      L.pickup('bag', x, 20.8, 1.05);
      k++;
    }
    let a = 1;
    const colors = ['#0097e6', '#44bd32', '#8c7ae6', '#e1b12c', '#e84393', '#00cec9', '#fd9644', '#4b6584', '#20bf6b', '#eb3b5a'];
    for (const x of [-25, -20.5, -16, -11.5, -7, 7, 11.5, 16, 20.5, 25]) {
      const c = colors[a - 1];
      L.box(x, 11.8, 1.1, 7.4, 1.95, c);
      L.label('AISLE ' + a, x, 2.35, 15.6, 0, { height: 0.3, bg: c });
      S('shelf', x + 1.15, 11.8, -Math.PI / 2, 'aisle ' + a, 'public');
      L.pois.customerSpots.push({ x: x - 1.2, z: 10 + (a % 3), yaw: Math.PI / 2 }, { x: x + 1.2, z: 13 - (a % 2), yaw: -Math.PI / 2 });
      WS(x - 1.15, 12.5, Math.PI / 2);
      if (a % 2) L.pickup('basket', x - 1.15, 8.6, 0.0);
      a++;
    }
    for (const z of [7.5, 12.5]) {
      L.box(0, z, 2.6, 1.6, 0.8, '#fbc531');
      S('display', 0, z + 1.4, Math.PI, z < 10 ? 'the front display table' : 'the clearance table', 'public');
      L.pickup('laundry', 0.6, z, 0.8);
    }
    // mannequin display stands (tall cover)
    for (const [x, z] of [[-3, 16.5], [3, 16.5], [-3, 5.8], [3, 5.8]]) L.box(x, z, 0.8, 0.8, 1.8, '#dfe6e9');
    for (let i = 0; i < 4; i++) {
      const x = 27.8 - i * 2.2;
      L.box(x - 1.1, 5.4, 0.08, 2.2, 2.2, '#fab1a0');
      L.hideSpot(x, 5.0, 'fitting');
    }
    L.box(27.8 - 4 * 2.2 + 1.1, 5.4, 0.08, 2.2, 2.2, '#fab1a0');
    L.label('FITTING ROOMS', 24.5, 2.6, 6.6, 0, { height: 0.25, bg: '#e84393' });
    S('fitting', 24.5, 7.3, Math.PI, 'the fitting rooms', 'public');
    L.box(-24, 21.2, 3, 0.8, 1.05, '#7f8fa6');
    S('returnbin', -24, 20.2, 0, 'the service desk', 'public');
    WS(-25, 22.1, Math.PI);
    for (const x of [-26, -22]) {
      L.box(x, 17.6, 0.7, 0.7, 0.45, '#8d6e63', { occlude: false });
      L.seat(x, 17.6, Math.PI, 'bench');
    }
  },

  hotel(L, { S, WS }) {
    L.floor(0, 14, 20, 12, '#d1ccc0', 0.002);
    L.box(-7, 8.2, 10, 0.9, 1.1, '#5d4037');
    L.label('RECEPTION', -7, 2.4, 8.7, 0, { height: 0.35, bg: '#5d4037' });
    S('frontdesk', -9.5, 7.2, 0, 'the front desk', 'public');
    S('frontdesk', -4.5, 7.2, 0, 'the front desk (east end)', 'public');
    L.pickup('folder', -8, 8.2, 1.1);
    WS(-7, 7.0, 0);
    WS(-11, 7.0, 0);
    for (const x of [-9.5, -4.5]) L.pois.customerSpots.push({ x, z: 9.6, yaw: Math.PI });
    L.box(9, 8.2, 2.4, 0.8, 1.05, '#5d4037');
    S('concierge', 9, 7.2, 0, 'the concierge desk', 'public');
    L.box(0, 14.5, 3.2, 3.2, 1.1, '#b2bec3');
    L.box(0, 14.5, 0.6, 0.6, 1.4, '#dfe6e9', { y: 1.1 });
    for (const x of [-8, 8, -18, 18]) for (const z of [12, 18]) L.box(x, z, 0.9, 0.9, 3.2, '#ecf0f1');
    for (const cx of [-23, 23]) {
      L.box(cx, 16, 2, 1.2, 0.45, '#8d6e63');
      L.sofa(cx - 2, 16, 2.4, Math.PI / 2, '#6c5ce7');
      L.sofa(cx + 2, 16, 2.4, -Math.PI / 2, '#6c5ce7');
      L.sofa(cx, 18.4, 2.4, Math.PI, '#6c5ce7');
      L.pickup('newspaper', cx, 16, 0.45);
      L.pois.customerSpots.push(
        { x: cx - 2, z: 15.4, yaw: Math.PI / 2, sit: true },
        { x: cx - 2, z: 16.6, yaw: Math.PI / 2, sit: true },
        { x: cx + 2, z: 15.4, yaw: -Math.PI / 2, sit: true },
        { x: cx + 2, z: 16.6, yaw: -Math.PI / 2, sit: true },
        { x: cx, z: 18.4, yaw: Math.PI, sit: true }
      );
      S('lounge', cx, 14.3, 0, cx < 0 ? 'the west lounge' : 'the east lounge', 'public');
    }
    for (const x of [-27, -24.5]) {
      L.box(x, 4.15, 1.8, 0.1, 2.4, '#b2bec3', { collide: false });
      L.pois.customerSpots.push({ x, z: 5.4, yaw: Math.PI });
    }
    for (const x of [5, 6.6]) L.box(x, 21.5, 0.9, 1.4, 1.2, '#f1c40f');
    S('luggage', 5.8, 20.2, 0, 'the luggage carts', 'public');
    L.pickup('bag', 5.8, 21.5, 1.2);
    WS(4, 20.2, Math.PI);
    WS(12, 10, Math.PI);
    WS(-20, 8, Math.PI);
    L.plant(-15, 5);
    S('plant', -15, 6, Math.PI, 'the lobby fern', 'public');
    for (const [x, z] of [[-12, 21], [12, 21], [-27, 12], [27, 12]]) L.plant(x, z, 1.4);
    for (const p of [[14, 12], [-14, 22], [15, 22], [-26, 9]]) L.pois.customerSpots.push({ x: p[0], z: p[1], yaw: Math.PI });
  },

  library(L, { S, WS }) {
    L.box(4, 17.2, 7, 0.9, 1.05, '#6d4c41');
    L.label('CIRCULATION', 4, 2.3, 17.7, 0, { height: 0.3, bg: '#3d3d6b' });
    S('circ', 2.5, 16.3, 0, 'the circulation desk', 'public');
    S('circ', 5.5, 16.3, 0, 'the checkout counter', 'public');
    WS(4, 16.2, 0);
    for (const x of [2.5, 5.5]) L.pois.customerSpots.push({ x, z: 18.4, yaw: Math.PI });
    L.box(9.5, 21.5, 1.2, 0.7, 1.0, '#a1887f');
    S('returncart', 9.5, 20.5, 0, 'the return cart by the door', 'public');
    L.pickup('books', 9.5, 21.5, 1.0);
    L.box(-4, 7, 1.2, 0.7, 1.0, '#a1887f');
    S('returncart', -4, 8, Math.PI, 'the return cart in the stacks', 'public');
    L.pickup('books', -4, 7, 1.0);
    let n = 1;
    for (const x of [-27, -23.5, -20, -16.5, -13, -9.5]) {
      L.box(x, 10.5, 1.0, 11, 2.3, '#8d6e63');
      S('bookshelf', x + 1.1, 8.5 + (n % 3), -Math.PI / 2, 'stack ' + n, 'public');
      L.pois.customerSpots.push({ x: x + 1.2, z: 13 - (n % 3), yaw: -Math.PI / 2 });
      WS(x - 1.1, 10.5, Math.PI / 2);
      n++;
    }
    for (const x of [20, 23.5, 27]) {
      L.box(x, 18, 1.0, 7, 2.3, '#8d6e63');
      S('bookshelf', x - 1.1, 18, Math.PI / 2, 'stack ' + n, 'public');
      n++;
    }
    for (const [x, z] of [[8, 8], [14, 8], [8, 12], [14, 12]]) {
      L.box(x, z, 2.2, 1.2, 0.76, '#a1887f');
      L.chair(x - 0.6, z - 0.9, 0);
      L.chair(x + 0.6, z - 0.9, 0);
      L.chair(x - 0.6, z + 0.9, Math.PI);
      L.chair(x + 0.6, z + 0.9, Math.PI);
      L.pois.customerSpots.push(
        { x: x - 0.6, z: z - 0.9, yaw: 0, sit: true },
        { x: x + 0.6, z: z + 0.9, yaw: Math.PI, sit: true },
        { x: x + 0.6, z: z - 0.9, yaw: 0, sit: true },
        { x: x - 0.6, z: z + 0.9, yaw: Math.PI, sit: true }
      );
      S('readtable', x + 1.6, z, -Math.PI / 2, 'a reading table', 'public');
      L.pickup('books', x, z, 0.76);
    }
    for (const x of [20, 23, 26]) {
      L.box(x, 4.8, 2.6, 0.8, 0.76, '#dfe6e9');
      L.box(x, 4.6, 0.6, 0.1, 0.4, '#2d3436', { y: 0.76, collide: false, occlude: false });
      L.chair(x, 5.8, Math.PI);
      L.pois.customerSpots.push({ x, z: 5.8, yaw: Math.PI, sit: true });
    }
    S('computer', 21.5, 6.6, Math.PI, 'the public computers', 'public');
    L.plant(-1, 22.5);
    S('plant', -1, 21.5, 0, 'the reading room plant', 'public');
    L.box(-5, 20, 0.6, 3, 1.5, '#8d6e63'); // low shelf divider by the entrance
  },

  warehouse(L, { S, WS }) {
    let n = 1;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const x = side * (6 + i * 4);
        L.box(x, 11, 1.4, 11, 3.4, '#e1b12c');
        for (let s = 0; s < 3; s++) L.box(x, 11, 1.5, 11.1, 0.06, '#2d3436', { y: 0.9 + s * 1.0, collide: false, occlude: false, shadow: false });
        S('rack', x + side * -1.3, 9 + (i % 3) * 2, side < 0 ? Math.PI / 2 : -Math.PI / 2, 'rack ' + String.fromCharCode(64 + n), 'public');
        WS(x - side * 1.3, 13, side < 0 ? Math.PI / 2 : -Math.PI / 2);
        if (i % 2) L.pickup('box', x - side * 1.3, 15.8, 0.0);
        n++;
      }
    }
    L.box(0, 19, 34, 1.0, 0.9, '#57606f');
    S('conveyor', -6, 20, Math.PI, 'the conveyor belt', 'public');
    S('conveyor', 8, 18, 0, 'the conveyor merge point', 'public');
    for (const x of [-12, -4, 6, 12]) L.pickup('box', x, 19, 0.9);
    for (const x of [-21, -15, 15, 21]) {
      L.box(x, 21.6, 2.4, 1.0, 0.9, '#dfe6e9');
      S('packing', x, 20.6, 0, 'a packing table', 'public');
      WS(x + 0.8, 20.6, 0);
    }
    for (const x of [-26, 26]) {
      L.box(x, 21.5, 0.6, 0.5, 1.3, '#2d3436');
      S('terminal', x, 20.6, 0, x < 0 ? 'the west terminal' : 'the east terminal', 'public');
      L.pois.customerSpots.push({ x: x + (x < 0 ? 1.4 : -1.4), z: 20.6, yaw: x < 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
    for (const [x, z] of [[-1, 7], [2, 13.5], [0, 16.5]]) {
      L.box(x, z, 1.2, 1.2, 1.1 + (z % 2) * 0.4, '#c8a27a');
      S('pallet', x + 1.2, z, -Math.PI / 2, 'the floor pallets', 'public');
    }
    L.box(-2.5, 10.5, 1.2, 2, 1.2, '#f39c12');
    L.box(-2.5, 9.3, 1.0, 0.1, 2.0, '#2d3436');
  },

  cafe(L, { S, WS }) {
    L.box(-3, 10, 16, 1.0, 1.05, '#6f4e37');
    L.box(-3, 7.0, 16, 0.8, 0.95, '#a1887f');
    L.label('ORDER HERE', -7, 2.3, 10.52, 0, { height: 0.3, bg: '#6f4e37' });
    S('counter', -7, 9.0, 0, 'the order counter', 'public');
    S('counter', 0, 9.0, 0, 'the pickup counter', 'public');
    WS(-9, 8.6, 0);
    WS(-3, 8.6, 0);
    WS(2, 8.6, 0);
    for (const x of [-7, 0]) L.pois.customerSpots.push({ x, z: 11.2, yaw: Math.PI });
    S('espresso', -5, 8.0, Math.PI, 'espresso machine 1', 'public');
    S('espresso', 1, 8.0, Math.PI, 'espresso machine 2', 'public');
    S('grinder', -10, 8.0, Math.PI, 'the grinder', 'public');
    for (const x of [-8, -2, 3]) L.pickup('tray', x, 7.0, 0.95);
    L.box(8, 10, 3, 1.0, 1.25, '#dff9fb');
    S('pastry', 8, 9.0, 0, 'the pastry case', 'public');
    for (const [x, z] of [[-24, 15], [-18, 15], [-12, 15], [12, 15], [18, 15], [24, 15], [-24, 20], [-18, 20], [-12, 20], [12, 20], [18, 20], [24, 20], [16, 7], [22, 7], [27, 11]]) {
      L.box(x, z, 1.0, 1.0, 0.76, '#ecf0f1');
      L.chair(x - 0.8, z, Math.PI / 2);
      L.chair(x + 0.8, z, -Math.PI / 2);
      L.pois.customerSpots.push({ x: x - 0.8, z, yaw: Math.PI / 2, sit: true }, { x: x + 0.8, z, yaw: -Math.PI / 2, sit: true });
      S('cafetable', x, z + 1.0, Math.PI, 'a cafe table', 'public');
      if ((x + z) % 3 === 0) L.pickup('cup', x, z, 0.76);
    }
    for (const z of [5.5, 8.5]) L.box(-25, z, 4, 0.4, 1.3, '#6d214f');
    L.box(-25, 7, 2, 1.2, 0.76, '#ecf0f1');
    L.pois.customerSpots.push({ x: -25, z: 6.2, yaw: 0, sit: true }, { x: -25, z: 7.8, yaw: Math.PI, sit: true });
    // planter dividers between seating areas (cover)
    for (const x of [-15, 15]) L.box(x, 17.5, 0.6, 3.4, 1.2, '#2d6a4f');
    L.plant(-1, 22.5);
    S('plant', -1, 21.5, 0, 'the window plant', 'public');
  },
};
