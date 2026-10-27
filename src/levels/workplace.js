// Workplace generator. Every job gets a 60 x 48 m building:
//
//   z = -24  +-----------------------------------------------+
//            | row 2: 7 back rooms (break room, loading, ...) |
//   z = -13  |~~~~~~~~~~~~~~~~ corridor B ~~~~~~~~~~~~~~~~~~~~|
//   z = -10  |s| row 1: 4 rooms |c| row 1: 4 rooms        |s|
//   z =   1  |~~~~~~~~~~~~~~~~ corridor A ~~~~~~~~~~~~~~~~~~~~|
//   z =   4  +---door------------door------------door--------+
//            |      public floor (job specific layout)        |
//   z =  24  +------------------ entrance --------------------+
//
// (s = side corridors, c = center corridor). Rooms are filled by type.
import * as THREE from 'three';
import { Level, mat } from '../level.js';

const W2 = 30;
const D2 = 24;
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

export function buildWorkplace(jobId, job, { coworkers = [] } = {}) {
  const L = new Level('work:' + jobId);
  const rnd = rng32(jobId.length * 977 + 13);
  L.bounds = { minX: -W2, maxX: W2, minZ: -D2, maxZ: D2 };
  L.pois.workstations = [];
  L.pois.hideSpots = [];
  L.pois.customerSpots = [];
  L.pois.wander = [];
  L.pois.entrance = { x: 0, z: D2 - 1 };
  L.indoor = true;
  const S = (tag, x, z, yaw, label, room, opts) => L.station(tag, x, z, yaw, label, room, opts);
  const WS = (x, z, yaw) => L.pois.workstations.push({ x, z, yaw });

  const theme = THEMES[jobId] || THEMES.office;

  // ---- floors
  L.floor(0, 14, 60, 20, theme.floor);
  L.floor(0, 2.5, 60, 3, '#cfc6b8');
  L.floor(0, -11.5, 60, 3, '#cfc6b8');
  L.floor(-28.5, -4.5, 3, 11, '#cfc6b8');
  L.floor(28.5, -4.5, 3, 11, '#cfc6b8');
  L.floor(0, -4.5, 3, 11, '#cfc6b8');
  L.floor(0, -4.5, 60, 11, theme.back, -0.0005);
  L.floor(0, -18.5, 60, 11, theme.back, -0.0005);

  // ---- outer walls
  L.wallX(-D2, -W2, W2, [{ c: -26, w: 3 }], 3.2, WALL);
  L.wallZ(-W2, -D2, D2, [], 3.2, WALL);
  L.wallZ(W2, -D2, D2, [], 3.2, WALL);
  L.wallX(D2, -W2, W2, [{ c: 0, w: 3 }], 3.2, WALL);
  L.box(0, D2 + 0.05, 3, 0.08, 2.6, '#aed6f1', { occlude: false, static: false, matOpts: { transparent: true, opacity: 0.3 } });
  L.interactable('exit', 0, D2 - 0.7, 'Leave work', { r: 1.0 });
  L.spawn = { x: 0, z: D2 - 2.6, yaw: Math.PI };
  const front = theme.doors || [-20, 0, 20];
  L.wallX(4, -W2, W2, front.map((c) => ({ c, w: 2.4 })), 3.2, WALL);
  for (const c of front) L.label('STAFF ONLY', c, 2.75, 4.12, 0, { height: 0.22, bg: '#2d3436' });

  // ---- back of house walls
  const r1L = [-27, -20.625, -14.25, -7.875, -1.5];
  const r1R = [1.5, 7.875, 14.25, 20.625, 27];
  const rooms = [];
  for (const xs of [r1L, r1R]) {
    for (let i = 0; i < 4; i++) rooms.push({ x0: xs[i], x1: xs[i + 1], z0: -10, z1: 1, row: 1 });
  }
  const r2 = [];
  for (let i = 0; i <= 7; i++) r2.push(-W2 + (60 / 7) * i);
  for (let i = 0; i < 7; i++) rooms.push({ x0: r2[i], x1: r2[i + 1], z0: -D2, z1: -13, row: 2 });
  rooms.forEach((r) => {
    r.cx = (r.x0 + r.x1) / 2;
    r.cz = (r.z0 + r.z1) / 2;
    r.w = r.x1 - r.x0;
    r.d = r.z1 - r.z0;
  });
  const row1 = rooms.filter((r) => r.row === 1);
  const row2 = rooms.filter((r) => r.row === 2);
  // walls: z=1 and z=-10 (row 1), dividers, z=-13 (row 2)
  const gapsFront1 = row1.map((r) => ({ c: r.cx, w: 1.6 }));
  L.wallX(1, -27, -1.5, gapsFront1.filter((g) => g.c < 0), 3, WALL);
  L.wallX(1, 1.5, 27, gapsFront1.filter((g) => g.c > 0), 3, WALL);
  const back1 = row1.filter((_, i) => i % 2 === 1).map((r) => ({ c: r.cx, w: 1.6 }));
  L.wallX(-10, -27, -1.5, back1.filter((g) => g.c < 0), 3, WALL);
  L.wallX(-10, 1.5, 27, back1.filter((g) => g.c > 0), 3, WALL);
  for (const x of [...r1L, ...r1R]) L.wallZ(x, -10, 1, [], 3, WALL);
  L.wallX(-13, -W2, W2, row2.map((r) => ({ c: r.cx, w: 1.6 })), 3, WALL);
  for (let i = 1; i < 7; i++) L.wallZ(r2[i], -D2, -13, [], 3, WALL);

  // ---- room assignment
  const jr = [...job.rooms];
  while (jr.length < 8) jr.push('storage');
  const order = [
    [row1[3], 'lockers'], [row1[4], jr[0]], [row1[2], jr[1]], [row1[5], 'manager'],
    [row1[1], 'restroom'], [row1[6], 'restroom'], [row1[0], 'storage'], [row1[7], jr[2]],
    [row2[0], 'loading'], [row2[1], jr[3]], [row2[2], 'break'], [row2[3], jr[4]],
    [row2[4], jr[5]], [row2[5], jr[6]], [row2[6], jr[7]],
  ];
  const counts = {};
  for (const [room, type] of order) {
    counts[type] = (counts[type] || 0) + 1;
    room.type = type;
    room.n = counts[type];
    const fn = ROOMS[type] || ROOMS.storage;
    room.label = fn(L, room, { S, WS, rnd, theme, jobId }) || type.toUpperCase();
    L.label(room.label, room.cx, 2.55, room.z1 + 0.12, 0, { height: 0.24, bg: theme.sign });
    L.pois.wander.push({ x: room.cx, z: room.z1 - 1.6 });
  }
  L.rooms = rooms;
  // corridor wander points
  for (const x of [-24, -12, 0, 12, 24]) {
    L.pois.wander.push({ x, z: 2.5 });
    L.pois.wander.push({ x, z: -11.5 });
  }
  L.pois.wander.push({ x: -28.5, z: -4.5 }, { x: 28.5, z: -4.5 }, { x: 0, z: -4.5 });

  // ---- public floor
  const pub = PUBLIC[jobId] || PUBLIC.office;
  pub(L, { S, WS, rnd, theme, coworkers });
  // common public extras
  S('trash', -27.5, 22.3, Math.PI, 'the lobby trash can', 'public');
  L.box(-28.3, 22.9, 0.6, 0.6, 0.9, '#2d3436');
  S('trash', 27.5, 22.3, Math.PI, 'the trash can by the door', 'public');
  L.box(28.3, 22.9, 0.6, 0.6, 0.9, '#2d3436');
  L.plant(-29, 23);
  L.plant(29, 23);
  S('plant', -28.2, 21.2, Math.PI, 'the lobby plant', 'public');
  // spills appear as small puddles
  for (const [x, z] of [[-9, 2.2], [12, 2.2]]) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshStandardMaterial({ color: '#6d4c41', roughness: 0.1, transparent: true, opacity: 0.75 }));
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.01, z);
    L.add(p);
    S('spill', x, z + 0.8, Math.PI, 'the spill in the hallway', 'corridor');
  }
  L.pois.wander.push(...L.pois.customerSpots.slice(0, 6).map((s) => ({ x: s.x + 0.8, z: s.z + 0.8 })));
  // make sure there are enough workstations for 12 coworkers
  for (const r of rooms) {
    if (L.pois.workstations.length >= 16) break;
    if (['restroom', 'manager', 'lockers', 'loading'].includes(r.type)) continue;
    const p = { x: r.cx + 1.2, z: r.z1 - 2.2 };
    if (!L.blockedPoint(p.x, p.z, 0.4)) WS(p.x, p.z, Math.PI);
  }
  L.maxCustomers = theme.maxCustomers || 8;
  L.finalize();
  L.buildNav(0.8);
  return L;
}

const THEMES = {
  office: { floor: '#8395a7', back: '#b8b2a7', sign: '#273c75', maxCustomers: 5 },
  restaurant: { floor: '#8e5b3a', back: '#c9c3b6', sign: '#6d214f', maxCustomers: 14, doors: [-20, 0, 20] },
  retail: { floor: '#dfe6e9', back: '#b8b2a7', sign: '#e84118', maxCustomers: 12 },
  hotel: { floor: '#b33939', back: '#cbbba0', sign: '#5d4037', maxCustomers: 10 },
  library: { floor: '#7f6a5b', back: '#c9bfae', sign: '#3d3d6b', maxCustomers: 12 },
  warehouse: { floor: '#95a5a6', back: '#a8a49c', sign: '#e1b12c', maxCustomers: 4 },
  cafe: { floor: '#a47148', back: '#cfc6b8', sign: '#6f4e37', maxCustomers: 12 },
};

// ---------------------------------------------------------------------------
// Back rooms. Coordinates: room spans x0..x1, z0 (back wall) .. z1 (door wall).
// Helpers place things relative to the back wall.

function shelfRow(L, r, tag, label, color, S, n = 2, h = 1.9) {
  const xs = n === 1 ? [r.cx] : [r.x0 + r.w * 0.28, r.x0 + r.w * 0.72];
  xs.forEach((x, i) => {
    L.box(x, r.z0 + 0.55, Math.min(2.4, r.w * 0.38), 0.7, h, color);
    S(tag, x, r.z0 + 1.55, Math.PI, `${label}${xs.length > 1 ? ' ' + (i + 1) : ''}`, r.type);
  });
}

const ROOMS = {
  lockers(L, r, { S }) {
    for (let i = 0; i < 6; i++) L.box(r.x0 + 0.35, r.z0 + 1 + i * 0.6, 0.5, 0.56, 1.9, i % 2 ? '#74b9ff' : '#0984e3');
    for (let i = 0; i < 6; i++) L.box(r.x1 - 0.35, r.z0 + 1 + i * 0.6, 0.5, 0.56, 1.9, i % 2 ? '#74b9ff' : '#0984e3');
    L.box(r.cx, r.cz - 1, 2.2, 0.5, 0.45, '#8d6e63');
    // time clock on back wall
    L.box(r.cx, r.z0 + 0.2, 0.5, 0.25, 0.6, '#2d3436', { y: 1.1, collide: false });
    L.label('TIME CLOCK', r.cx, 1.95, r.z0 + 0.35, 0, { height: 0.22, bg: '#c0392b' });
    L.interactable('timeclock', r.cx, r.z0 + 1.1, 'Time clock', { r: 1.2 });
    L.box(r.cx + 1.6, r.z0 + 0.12, 1.2, 0.05, 0.8, '#ecf0f1', { y: 1.2, collide: false });
    S('schedule', r.cx + 1.6, r.z0 + 1.0, Math.PI, 'the schedule board', 'lockers');
    L.box(r.cx - 1.6, r.z0 + 0.4, 0.8, 0.5, 1.0, '#636e72');
    S('inbox', r.cx - 1.6, r.z0 + 1.2, Math.PI, 'the staff inbox', 'lockers');
    L.pois.lockers = { x: r.cx, z: r.cz };
    return 'LOCKER ROOM';
  },
  manager(L, r, { S }) {
    L.box(r.cx, r.z0 + 2.2, 2.4, 1.0, 0.78, '#6d4c41');
    L.box(r.cx, r.z0 + 2.2, 0.6, 0.1, 0.4, '#2d3436', { y: 0.78, collide: false });
    L.chair(r.cx, r.z0 + 1.2, 0, '#2d3436');
    L.box(r.x0 + 0.5, r.z0 + 0.5, 0.8, 0.6, 1.4, '#636e72');
    L.plant(r.x1 - 0.6, r.z0 + 0.6);
    S('mgrdesk', r.cx + 0.3, r.z0 + 3.3, Math.PI, "the manager's desk", 'manager');
    L.pois.manager = { desk: { x: r.cx, z: r.z0 + 1.3, yaw: 0 }, stand: { x: r.cx, z: r.z0 + 3.4, yaw: Math.PI }, door: { x: r.cx, z: r.z1 + 1.2 } };
    return "MANAGER'S OFFICE";
  },
  restroom(L, r, { S }) {
    // sinks along one side, stalls along the back
    for (let i = 0; i < 2; i++) {
      L.box(r.x1 - 0.4, r.z1 - 2.5 - i * 1.4, 0.7, 0.9, 0.85, '#ffffff');
      S('sink', r.x1 - 1.2, r.z1 - 2.5 - i * 1.4, -Math.PI / 2, `the restroom sink`, 'restroom');
    }
    const n = 3;
    const sw = (r.w - 0.4) / n;
    for (let i = 0; i <= n; i++) L.box(r.x0 + 0.2 + i * sw, r.z0 + 1.1, 0.08, 2.2, 2.1, '#a4b0be');
    for (let i = 0; i < n; i++) {
      const x = r.x0 + 0.2 + sw * (i + 0.5);
      L.box(x, r.z0 + 0.45, 0.45, 0.6, 0.45, '#ffffff', { collide: false });
      // stall door (half open)
      L.box(x - sw * 0.3, r.z0 + 2.2, sw * 0.4, 0.06, 1.9, '#a4b0be', { y: 0.15 });
      L.pois.hideSpots.push({ x: x + 0.15, z: r.z0 + 1.1, room: 'restroom' });
    }
    return `RESTROOM ${r.n}`;
  },
  storage(L, r, { S }) {
    shelfRow(L, r, 'supply', 'the supply shelf', '#81ecec', S);
    L.box(r.x0 + 0.5, r.cz, 0.8, 1.6, 1.0, '#c8a27a');
    L.box(r.x1 - 0.5, r.cz + 1, 0.6, 0.6, 0.9, '#f1c40f');
    S('mop', r.x1 - 1.2, r.cz + 1, -Math.PI / 2, 'the janitor closet', 'storage');
    L.pois.hideSpots.push({ x: r.x0 + 1.2, z: r.z0 + 1.3, room: 'storage' });
    return r.n > 1 ? `STORAGE ${r.n}` : 'STORAGE';
  },
  loading(L, r, { S }) {
    L.box(r.x0 + 1.5, r.z0 + 1.2, 2.2, 1.6, 1.5, '#27ae60');
    S('dumpster', r.x0 + 1.5, r.z0 + 2.6, Math.PI, 'the dumpster', 'loading');
    L.box(r.x1 - 1.6, r.z0 + 1.0, 1.2, 1.2, 0.3, '#a1887f');
    L.box(r.x1 - 1.6, r.z0 + 1.0, 1.1, 1.1, 0.9, '#c8a27a', { y: 0.3 });
    S('dock', r.cx + 1, r.z0 + 2.2, Math.PI, 'the loading dock', 'loading');
    S('pallet', r.x1 - 1.6, r.z0 + 2.3, Math.PI, 'the pallet by the dock', 'loading');
    return 'LOADING';
  },
  break(L, r, { S, WS }) {
    L.box(r.x0 + 0.45, r.cz, 0.8, r.d - 3, 0.95, '#b2bec3');
    S('coffee', r.x0 + 1.3, r.cz - 1.5, -Math.PI / 2, 'the coffee machine', 'break');
    S('microwave', r.x0 + 1.3, r.cz + 1.2, -Math.PI / 2, 'the microwave', 'break');
    L.box(r.x1 - 0.5, r.z0 + 0.6, 0.9, 0.9, 1.9, '#dfe6e9');
    S('fridge', r.x1 - 0.6, r.z0 + 1.6, Math.PI, 'the break room fridge', 'break');
    for (const z of [r.cz - 1.4, r.cz + 1.6]) {
      L.box(r.cx + 0.6, z, 1.6, 1.0, 0.75, '#fab1a0');
      L.chair(r.cx - 0.5, z, Math.PI / 2);
      L.chair(r.cx + 1.7, z, -Math.PI / 2);
      L.pois.customerSpots && WS(r.cx - 0.5, z, Math.PI / 2);
    }
    return 'BREAK ROOM';
  },
  meeting(L, r, { S }) {
    L.box(r.cx, r.cz - 0.5, 1.6, r.d - 5, 0.76, '#8d6e63');
    for (let i = 0; i < 3; i++) {
      L.chair(r.cx - 1.2, r.cz - 2 + i * 1.5, Math.PI / 2, '#2d3436');
      L.chair(r.cx + 1.2, r.cz - 2 + i * 1.5, -Math.PI / 2, '#2d3436');
    }
    S('meetingtable', r.cx + 1.6, r.cz + 1.5, -Math.PI / 2, `meeting room ${String.fromCharCode(64 + r.n)}`, 'meeting');
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
    return 'COPY ROOM';
  },
  mail(L, r, { S, WS }) {
    L.box(r.cx, r.z0 + 0.4, r.w - 1, 0.5, 1.8, '#d1ccc0');
    S('mail', r.cx, r.z0 + 1.3, Math.PI, 'the mail sorting rack', 'mail');
    L.box(r.cx, r.cz + 0.5, 2.2, 1.0, 0.9, '#a1887f');
    WS(r.cx, r.cz + 1.6, Math.PI);
    return 'MAIL ROOM';
  },
  server(L, r, { S }) {
    for (let i = 0; i < 3; i++) L.box(r.x0 + 1.2 + i * 1.8, r.cz - 1, 0.8, 4, 2.1, '#2d3436');
    S('server', r.x0 + 2.1, r.z1 - 2, Math.PI, 'the server rack', 'server');
    L.pois.hideSpots.push({ x: r.x0 + 2.1, z: r.cz - 1, room: 'server' });
    return 'SERVER ROOM';
  },
  office(L, r, { S, WS }) {
    L.box(r.cx, r.z0 + 2, 2.2, 0.9, 0.76, '#6d4c41');
    L.chair(r.cx, r.z0 + 1.1, 0, '#2d3436');
    L.box(r.x1 - 0.5, r.z0 + 0.5, 0.8, 0.6, 1.4, '#636e72');
    S('officedesk', r.cx + 0.2, r.z0 + 3.1, Math.PI, `private office ${r.n}`, 'office');
    WS(r.cx, r.z0 + 1.1, 0);
    L.plant(r.x0 + 0.6, r.z0 + 0.6);
    return `OFFICE ${r.n}`;
  },
  archive(L, r, { S }) {
    for (let i = 0; i < 3; i++) L.box(r.cx, r.z0 + 1 + i * 2.6, r.w - 2.2, 0.7, 2.1, '#a1887f');
    S('archivebox', r.cx, r.z0 + 2.3, Math.PI, `the archive shelves`, 'archive');
    L.pois.hideSpots.push({ x: r.x0 + 0.7, z: r.z0 + 3.6, room: 'archive' });
    return 'ARCHIVE';
  },
  kitchen(L, r, { S, WS }) {
    L.box(r.cx, r.z0 + 0.5, r.w - 0.6, 0.9, 0.95, '#636e72');
    S('stove', r.cx - 1, r.z0 + 1.5, Math.PI, `the stove in kitchen ${r.n}`, 'kitchen');
    WS(r.cx + 1.2, r.z0 + 1.5, Math.PI);
    L.box(r.cx, r.cz + 0.6, 2.6, 1.0, 0.95, '#b2bec3');
    S('prep', r.cx, r.cz - 0.5, 0, `the prep table in kitchen ${r.n}`, 'kitchen');
    WS(r.cx - 1, r.cz + 1.7, Math.PI);
    return `KITCHEN ${r.n}`;
  },
  pantry(L, r, { S }) {
    shelfRow(L, r, 'pantryshelf', 'the pantry shelf', '#e1b382', S);
    L.box(r.x0 + 0.5, r.cz + 1, 0.8, 2, 1.6, '#e1b382');
    return 'PANTRY';
  },
  freezer(L, r, { S }) {
    L.floor(r.cx, r.cz, r.w, r.d, '#dff9fb', 0.002);
    shelfRow(L, r, 'freezer', 'the walk-in freezer', '#c7ecee', S);
    L.pois.hideSpots.push({ x: r.x0 + 1, z: r.cz, room: 'freezer' });
    return 'FREEZER';
  },
  dishroom(L, r, { S, WS }) {
    L.box(r.cx, r.z0 + 0.5, r.w - 0.6, 0.9, 0.95, '#b2bec3');
    S('dish', r.cx, r.z0 + 1.5, Math.PI, 'the dish pit', 'dishroom');
    WS(r.cx + 1.4, r.z0 + 1.5, Math.PI);
    return 'DISH ROOM';
  },
  laundry(L, r, { S, WS }) {
    for (let i = 0; i < 3; i++) L.box(r.x0 + 1 + i * 1.1, r.z0 + 0.5, 0.9, 0.8, 1.0, '#ecf0f1');
    S('washer', r.x0 + 2.1, r.z0 + 1.5, Math.PI, 'the washing machines', 'laundry');
    for (let i = 0; i < 2; i++) L.box(r.x1 - 1 - i * 1.1, r.z0 + 0.5, 0.9, 0.8, 1.0, '#dfe6e9');
    S('dryer', r.x1 - 1.6, r.z0 + 1.5, Math.PI, 'the dryers', 'laundry');
    L.box(r.cx, r.cz + 1, 2, 1, 0.9, '#a29bfe');
    S('linen', r.cx, r.cz + 2.1, Math.PI, 'the linen table', 'laundry');
    WS(r.cx - 0.8, r.cz + 2.1, Math.PI);
    return 'LAUNDRY';
  },
  linen(L, r, { S }) {
    shelfRow(L, r, 'linenshelf', 'the linen closet', '#dfe6e9', S);
    L.pois.hideSpots.push({ x: r.x0 + 1, z: r.cz + 1, room: 'linen' });
    return 'LINEN';
  },
  guestroom(L, r, { S }) {
    const num = 100 + r.n * 2 + (r.row === 2 ? 100 : 0);
    L.box(r.cx, r.z0 + 1.3, 2.0, 2.4, 0.55, '#dfe6e9');
    L.box(r.cx, r.z0 + 0.2, 2.1, 0.15, 1.1, '#6d4c41');
    S('guestbed', r.cx + 1.6, r.z0 + 1.6, -Math.PI / 2, `room ${num}`, 'guestroom');
    L.box(r.x1 - 0.5, r.cz + 1.5, 0.6, 0.6, 0.85, '#2d3436');
    S('minibar', r.x1 - 1.3, r.cz + 1.5, -Math.PI / 2, `the minibar in room ${num}`, 'guestroom');
    L.box(r.x0 + 0.4, r.cz + 1, 0.6, 1.5, 0.75, '#8d6e63');
    L.pois.hideSpots.push({ x: r.x0 + 0.8, z: r.z0 + 1, room: 'guestroom' });
    return `ROOM ${num}`;
  },
  stockroom(L, r, { S, WS }) {
    for (let i = 0; i < 3; i++) L.box(r.cx, r.z0 + 1 + i * 2.7, r.w - 2.4, 0.9, 2.0, '#636e72');
    S('stockbox', r.cx, r.z0 + 2.2, Math.PI, `stockroom ${r.n}`, 'stockroom');
    WS(r.cx + 1.2, r.z0 + 4.9, Math.PI);
    L.pois.hideSpots.push({ x: r.x0 + 0.7, z: r.z0 + 3.2, room: 'stockroom' });
    return `STOCKROOM ${r.n}`;
  },
  receiving(L, r, { S, WS }) {
    for (let i = 0; i < 3; i++) L.box(r.x0 + 1.4 + i * 2.2, r.z0 + 1.2, 1.2, 1.2, 1.0 + (i % 2) * 0.6, '#c8a27a');
    S('dock', r.cx, r.z0 + 2.6, Math.PI, 'the receiving dock', 'receiving');
    S('pallet', r.x0 + 1.4, r.z0 + 2.6, Math.PI, 'the receiving pallets', 'receiving');
    WS(r.cx + 1.5, r.cz + 1, Math.PI);
    return 'RECEIVING';
  },
  returns(L, r, { S, WS }) {
    L.box(r.cx, r.z0 + 1.2, r.w - 1.2, 0.8, 1.05, '#e84118');
    S('returnbin', r.cx, r.z0 + 2.3, Math.PI, 'the returns bin', 'returns');
    WS(r.cx - 1.4, r.z0 + 2.3, Math.PI);
    return 'RETURNS';
  },
  study(L, r, { S }) {
    L.box(r.cx, r.cz, 1.6, 2.4, 0.76, '#8d6e63');
    L.chair(r.cx - 1.1, r.cz, Math.PI / 2);
    L.chair(r.cx + 1.1, r.cz, -Math.PI / 2);
    S('studytable', r.cx, r.cz + 1.9, Math.PI, `study room ${r.n}`, 'study');
    L.pois.customerSpots.push({ x: r.cx - 1.1, z: r.cz, yaw: Math.PI / 2, sit: true });
    return `STUDY ROOM ${r.n}`;
  },
  workroom(L, r, { S, WS }) {
    L.box(r.x0 + 1.4, r.z0 + 0.6, 2, 1, 0.9, '#a1887f');
    S('repair', r.x0 + 1.4, r.z0 + 1.6, Math.PI, 'the book repair bench', 'workroom');
    L.box(r.x1 - 1.2, r.z0 + 0.6, 1.2, 1, 1.0, '#bdc3c7');
    S('scanner', r.x1 - 1.2, r.z0 + 1.6, Math.PI, 'the big scanner', 'workroom');
    WS(r.cx, r.cz + 1, Math.PI);
    return 'WORKROOM';
  },
  shipping(L, r, { S, WS }) {
    L.box(r.cx, r.z0 + 0.8, r.w - 1.5, 1.2, 1.4, '#c8a27a');
    S('dock', r.cx, r.z0 + 2.1, Math.PI, 'the shipping dock', 'shipping');
    S('pallet', r.x0 + 1, r.cz + 1, -Math.PI / 2, 'the outbound pallets', 'shipping');
    WS(r.cx + 1.5, r.z0 + 2.1, Math.PI);
    return 'SHIPPING';
  },
  packing(L, r, { S, WS }) {
    for (const z of [r.z0 + 1.5, r.cz + 1.5]) {
      L.box(r.cx, z, r.w - 2, 0.9, 0.9, '#dfe6e9');
      S('packing', r.cx, z + 1.0, Math.PI, 'a packing table', 'packing');
      WS(r.cx - 1.2, z + 1.0, Math.PI);
    }
    return 'PACKING';
  },
  bakery(L, r, { S, WS }) {
    L.box(r.cx, r.z0 + 0.5, r.w - 0.8, 0.9, 1.4, '#636e72');
    S('oven', r.cx, r.z0 + 1.6, Math.PI, 'the bakery ovens', 'bakery');
    L.box(r.cx, r.cz + 1, 2.2, 1, 0.95, '#f5f6fa');
    WS(r.cx, r.cz + 2.1, Math.PI);
    shelfRowSide(L, r, 'pantryshelf', 'the flour shelf', S);
    return 'BAKERY';
  },
  roastery(L, r, { S, WS }) {
    L.box(r.x0 + 1.4, r.z0 + 1, 1.6, 1.6, 1.6, '#6f4e37');
    S('roaster', r.x0 + 1.4, r.z0 + 2.4, Math.PI, 'the coffee roaster', 'roastery');
    L.box(r.x1 - 1, r.z0 + 0.6, 1.4, 0.9, 1.0, '#a1887f');
    S('beans', r.x1 - 1, r.z0 + 1.6, Math.PI, 'the green bean sacks', 'roastery');
    WS(r.cx, r.cz + 1.5, Math.PI);
    return 'ROASTERY';
  },
};

function shelfRowSide(L, r, tag, label, S) {
  L.box(r.x0 + 0.45, r.cz + 1.5, 0.7, 2.2, 1.8, '#e1b382');
  S(tag, r.x0 + 1.3, r.cz + 1.5, -Math.PI / 2, label, r.type);
}

// ---------------------------------------------------------------------------
// Public floors (z from 4 to 24). Keep the entrance (x -3..3, z 19..24) clear.

const PUBLIC = {
  office(L, { S, WS, coworkers }) {
    L.floor(0, 21, 10, 6, '#576574');
    L.box(0, 19.5, 5, 0.9, 1.1, '#e1b382');
    L.label('RECEPTION', 0, 1.6, 19.96, 0, { height: 0.3, bg: '#273c75' });
    S('reception', 0, 18.6, 0, 'the reception desk', 'public');
    S('inbox', 1.8, 20.5, Math.PI, 'the reception inbox', 'public');
    WS(-1.2, 18.6, 0);
    for (let i = 0; i < 4; i++) L.chair(-12 + i * 0.8, 22.8, Math.PI);
    for (let i = 0; i < 4; i++) L.pois.customerSpots.push({ x: -12 + i * 0.8, z: 22.8, yaw: Math.PI, sit: true });
    // cubicle farm
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
          L.chair(cx, zc - 0.1, Math.PI, '#2d3436');
          desks.push({ x: cx, z: zc - 0.1, yaw: Math.PI });
        }
      }
    }
    // shuffle desks deterministically: first one near the middle is the player's
    desks.sort((a, b) => Math.abs(a.x) + a.z * 0.1 - (Math.abs(b.x) + b.z * 0.1));
    const me = desks[0];
    S('mydesk', me.x, me.z + 0.3, Math.PI, 'your desk', 'public');
    L.label('YOU', me.x, 1.45, me.z - 1.17, 0, { height: 0.22, bg: '#00b894' });
    coworkers.forEach((c, i) => {
      const d = desks[i + 1];
      if (!d) return;
      S('desk', d.x, d.z + 0.3, Math.PI, `${c.name}'s desk`, 'public', { owner: i });
      L.label(c.name.toUpperCase(), d.x, 1.45, d.z - 1.17, 0, { height: 0.22, bg: '#6c5ce7' });
    });
    desks.slice(1).forEach((d) => WS(d.x, d.z, d.yaw));
    for (const [x, z] of [[-28.4, 9], [28.4, 9]]) {
      L.box(x, z, 0.9, 1.1, 1.05, '#ecf0f1');
      S('printer', x + (x < 0 ? 1 : -1), z, x < 0 ? -Math.PI / 2 : Math.PI / 2, x < 0 ? 'the west printer' : 'the east printer', 'public');
    }
    ['A', 'B', 'C', 'D'].forEach((c, i) => {
      const x = [-28.5, -28.5, 28.5, 28.5][i];
      const z = [13.5, 17, 13.5, 17][i];
      L.box(x, z, 0.7, 1.0, 1.35, '#636e72');
      S('cabinet', x + (x < 0 ? 1 : -1), z, x < 0 ? -Math.PI / 2 : Math.PI / 2, 'filing cabinet ' + c, 'public');
    });
    L.plant(-3, 9);
    L.plant(3, 13.5);
    S('plant', 3, 12.6, Math.PI, 'the office ficus', 'public');
    // clients wander to these
    for (const p of [[0, 15], [-20, 20], [20, 20], [0, 6]]) L.pois.customerSpots.push({ x: p[0], z: p[1], yaw: Math.PI });
  },

  restaurant(L, { S, WS }) {
    // kitchen pass along the back wall, west of the center door
    L.box(-8.5, 5.0, 7, 0.8, 1.1, '#b2bec3');
    L.label('KITCHEN PASS', -8.5, 2.2, 4.25, 0, { height: 0.3, bg: '#e17055' });
    S('pass', -8.5, 6.1, Math.PI, 'the kitchen pass', 'public');
    WS(-10.5, 4.9 - 0.0, 0);
    L.box(-3.6, 4.6, 0.6, 0.5, 1.2, '#2d3436');
    S('terminal', -3.6, 5.5, Math.PI, 'the order terminal', 'public');
    L.box(8, 4.6, 2.4, 0.8, 1.1, '#2d3436');
    S('soda', 8, 5.6, Math.PI, 'the soda fountain', 'public');
    // bar (east wall)
    L.box(24.5, 13, 0.8, 12, 1.1, '#4b2c20');
    L.box(28.8, 13, 0.6, 12, 2, '#6d4c41');
    S('bar', 26.2, 13, -Math.PI / 2, 'the bar', 'public');
    WS(26.2, 10, -Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const z = 8.5 + i * 1.8;
      L.box(23.5, z, 0.4, 0.4, 0.75, '#2d3436', { collide: false, occlude: false });
      L.pois.customerSpots.push({ x: 23.4, z, yaw: -Math.PI / 2, sit: true });
    }
    // host stand
    L.box(-4.2, 20.5, 1.2, 0.7, 1.15, '#4b2c20');
    L.label('HOST', -4.2, 1.45, 20.86, 0, { height: 0.2, bg: '#4b2c20' });
    S('host', -4.2, 19.6, 0, 'the host stand', 'public');
    // tables
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
    for (const [x, z] of [[-13.2, 6.3], [0, 11.2], [13.2, 6.3], [-20, 15.8], [20, 15.8], [6.8, 20]]) WS(x, z, Math.PI);
    L.plant(-28.8, 5);
    L.plant(21, 5);
    S('plant', 21, 6, Math.PI, 'the dining room palm', 'public');
  },

  retail(L, { S, WS }) {
    // checkout lanes
    let k = 1;
    for (const x of [-19, -14, -9, 9, 14, 19]) {
      L.box(x, 19.8, 0.9, 3, 1.05, '#e84118');
      L.box(x, 19, 0.4, 0.3, 0.35, '#2d3436', { y: 1.05, collide: false, occlude: false });
      L.label('LANE ' + k, x, 2.3, 19.8, 0, { height: 0.25, bg: '#e84118' });
      S('register', x + 1.0, 19.4, -Math.PI / 2, 'checkout lane ' + k, 'public');
      WS(x + 1.0, 20.4, -Math.PI / 2);
      L.pois.customerSpots.push({ x: x - 1.0, z: 19.4, yaw: Math.PI / 2 });
      k++;
    }
    // aisles
    let a = 1;
    const colors = ['#0097e6', '#44bd32', '#8c7ae6', '#e1b12c', '#e84393', '#00cec9', '#fd9644', '#4b6584', '#20bf6b', '#eb3b5a'];
    for (const x of [-25, -20.5, -16, -11.5, -7, 7, 11.5, 16, 20.5, 25]) {
      const c = colors[a - 1];
      L.box(x, 11.8, 1.1, 7.4, 1.95, c);
      L.label('AISLE ' + a, x, 2.35, 15.6, 0, { height: 0.3, bg: c });
      S('shelf', x + 1.15, 11.8, -Math.PI / 2, 'aisle ' + a, 'public');
      L.pois.customerSpots.push({ x: x - 1.2, z: 10 + (a % 3), yaw: Math.PI / 2 }, { x: x + 1.2, z: 13 - (a % 2), yaw: -Math.PI / 2 });
      WS(x - 1.15, 12.5, Math.PI / 2);
      a++;
    }
    for (const z of [7.5, 12.5]) {
      L.box(0, z, 2.6, 1.6, 0.8, '#fbc531');
      S('display', 0, z + 1.4, Math.PI, z < 10 ? 'the front display table' : 'the clearance table', 'public');
    }
    // fitting rooms (north-east corner, along the back wall)
    for (let i = 0; i < 4; i++) {
      const x = 27.8 - i * 2.2;
      L.box(x - 1.1, 5.4, 0.08, 2.2, 2.2, '#fab1a0');
      L.pois.hideSpots.push({ x, z: 5.0, room: 'fitting' });
    }
    L.box(27.8 - 4 * 2.2 + 1.1, 5.4, 0.08, 2.2, 2.2, '#fab1a0');
    L.label('FITTING ROOMS', 24.5, 2.6, 6.6, 0, { height: 0.25, bg: '#e84393' });
    S('fitting', 24.5, 7.2, Math.PI, 'the fitting rooms', 'public');
    // service desk
    L.box(-24, 21.2, 3, 0.8, 1.05, '#7f8fa6');
    S('returnbin', -24, 20.2, 0, 'the service desk', 'public');
    WS(-25, 22.1, Math.PI);
  },

  hotel(L, { S, WS }) {
    L.floor(0, 14, 20, 12, '#d1ccc0', 0.002);
    // front desk
    L.box(-7, 8.2, 10, 0.9, 1.1, '#5d4037');
    L.label('RECEPTION', -7, 2.4, 8.7, 0, { height: 0.35, bg: '#5d4037' });
    S('frontdesk', -9.5, 7.2, 0, 'the front desk', 'public');
    S('frontdesk', -4.5, 7.2, 0, 'the front desk (east end)', 'public');
    WS(-7, 7.0, 0);
    WS(-11, 7.0, 0);
    for (const x of [-9.5, -4.5]) L.pois.customerSpots.push({ x, z: 9.6, yaw: Math.PI });
    // concierge
    L.box(9, 8.2, 2.4, 0.8, 1.05, '#5d4037');
    S('concierge', 9, 7.2, 0, 'the concierge desk', 'public');
    // fountain in the middle
    L.box(0, 14.5, 3.2, 3.2, 1.1, '#b2bec3');
    L.box(0, 14.5, 0.6, 0.6, 1.4, '#dfe6e9', { y: 1.1 });
    // pillars
    for (const x of [-8, 8, -18, 18]) for (const z of [12, 18]) L.box(x, z, 0.9, 0.9, 3.2, '#ecf0f1');
    // lounges
    for (const cx of [-23, 23]) {
      L.box(cx, 16, 2, 1.2, 0.45, '#8d6e63');
      L.box(cx - 2, 16, 0.9, 2.4, 0.75, '#6c5ce7');
      L.box(cx + 2, 16, 0.9, 2.4, 0.75, '#6c5ce7');
      L.box(cx, 18.4, 2.4, 0.9, 0.75, '#6c5ce7');
      L.pois.customerSpots.push(
        { x: cx - 2, z: 15.4, yaw: Math.PI / 2, sit: true },
        { x: cx - 2, z: 16.6, yaw: Math.PI / 2, sit: true },
        { x: cx + 2, z: 15.4, yaw: -Math.PI / 2, sit: true },
        { x: cx + 2, z: 16.6, yaw: -Math.PI / 2, sit: true },
        { x: cx, z: 18.4, yaw: Math.PI, sit: true }
      );
      S('lounge', cx, 14.3, 0, cx < 0 ? 'the west lounge' : 'the east lounge', 'public');
    }
    // elevators (decor) on back wall
    for (const x of [-27, -24.5]) {
      L.box(x, 4.15, 1.8, 0.1, 2.4, '#b2bec3', { collide: false });
      L.pois.customerSpots.push({ x, z: 5.4, yaw: Math.PI });
    }
    // luggage carts
    for (const x of [5, 6.6]) {
      L.box(x, 21.5, 0.9, 1.4, 1.2, '#f1c40f');
    }
    S('luggage', 5.8, 20.2, 0, 'the luggage carts', 'public');
    WS(4, 20.2, Math.PI);
    WS(12, 10, Math.PI);
    WS(-20, 8, Math.PI);
    L.plant(-15, 5);
    S('plant', -15, 6, Math.PI, 'the lobby fern', 'public');
    for (const p of [[14, 12], [-14, 22], [15, 22], [-26, 9]]) L.pois.customerSpots.push({ x: p[0], z: p[1], yaw: Math.PI });
  },

  library(L, { S, WS }) {
    // circulation desk
    L.box(4, 17.2, 7, 0.9, 1.05, '#6d4c41');
    L.label('CIRCULATION', 4, 2.3, 17.7, 0, { height: 0.3, bg: '#3d3d6b' });
    S('circ', 2.5, 16.3, 0, 'the circulation desk', 'public');
    S('circ', 5.5, 16.3, 0, 'the checkout counter', 'public');
    WS(4, 16.2, 0);
    for (const x of [2.5, 5.5]) L.pois.customerSpots.push({ x, z: 18.4, yaw: Math.PI });
    L.box(9.5, 21.5, 1.2, 0.7, 1.0, '#a1887f');
    S('returncart', 9.5, 20.5, 0, 'the return cart by the door', 'public');
    L.box(-4, 7, 1.2, 0.7, 1.0, '#a1887f');
    S('returncart', -4, 8, Math.PI, 'the return cart in the stacks', 'public');
    // stacks (west)
    let n = 1;
    for (const x of [-27, -23.5, -20, -16.5, -13, -9.5]) {
      for (const z0 of [10.5]) {
        L.box(x, z0, 1.0, 11, 2.3, '#8d6e63');
        S('bookshelf', x + 1.1, z0 - 2 + (n % 3), -Math.PI / 2, 'stack ' + n, 'public');
        L.pois.customerSpots.push({ x: x + 1.2, z: z0 + 2.5 - (n % 3), yaw: -Math.PI / 2 });
        WS(x - 1.1, z0, Math.PI / 2);
        n++;
      }
    }
    // stacks (east, shorter)
    for (const x of [20, 23.5, 27]) {
      L.box(x, 18, 1.0, 7, 2.3, '#8d6e63');
      S('bookshelf', x - 1.1, 18, Math.PI / 2, 'stack ' + n, 'public');
      n++;
    }
    // reading tables
    for (const [x, z] of [[8, 8], [14, 8], [8, 12], [14, 12]]) {
      L.box(x, z, 2.2, 1.2, 0.76, '#a1887f');
      L.chair(x - 0.6, z - 0.9, 0);
      L.chair(x + 0.6, z - 0.9, 0);
      L.chair(x - 0.6, z + 0.9, Math.PI);
      L.chair(x + 0.6, z + 0.9, Math.PI);
      L.pois.customerSpots.push(
        { x: x - 0.6, z: z - 0.9, yaw: 0, sit: true },
        { x: x + 0.6, z: z + 0.9, yaw: Math.PI, sit: true },
        { x: x + 0.6, z: z - 0.9, yaw: 0, sit: true }
      );
      S('readtable', x + 1.6, z, -Math.PI / 2, 'a reading table', 'public');
    }
    // computers along back wall
    for (const x of [20, 23, 26]) {
      L.box(x, 4.8, 2.6, 0.8, 0.76, '#dfe6e9');
      L.box(x, 4.6, 0.6, 0.1, 0.4, '#2d3436', { y: 0.76, collide: false, occlude: false });
      L.chair(x, 5.8, Math.PI);
      L.pois.customerSpots.push({ x, z: 5.8, yaw: Math.PI, sit: true });
    }
    S('computer', 21.5, 6.6, Math.PI, 'the public computers', 'public');
    L.plant(-1, 22.5);
    S('plant', -1, 21.5, 0, 'the reading room plant', 'public');
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
        n++;
      }
    }
    // conveyor
    L.box(0, 19, 34, 1.0, 0.9, '#57606f');
    S('conveyor', -6, 20, Math.PI, 'the conveyor belt', 'public');
    S('conveyor', 8, 18, 0, 'the conveyor merge point', 'public');
    for (const x of [-21, -15, 15, 21]) {
      L.box(x, 21.6, 2.4, 1.0, 0.9, '#dfe6e9');
      S('packing', x, 20.6, 0, 'a packing table', 'public');
      WS(x + 0.8, 20.6, 0);
    }
    for (const x of [-26, 26]) {
      L.box(x, 21.5, 0.6, 0.5, 1.3, '#2d3436');
      S('terminal', x + (x < 0 ? 0 : 0), 20.6, 0, x < 0 ? 'the west terminal' : 'the east terminal', 'public');
      L.pois.customerSpots.push({ x: x + (x < 0 ? 1.4 : -1.4), z: 20.6, yaw: x < 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
    for (const [x, z] of [[-1, 7], [2, 13.5]]) {
      L.box(x, z, 1.2, 1.2, 1.1, '#c8a27a');
      S('pallet', x + 1.2, z, -Math.PI / 2, 'the floor pallets', 'public');
    }
    // forklift (decor)
    L.box(-2.5, 10.5, 1.2, 2, 1.2, '#f39c12');
    L.box(-2.5, 9.3, 1.0, 0.1, 2.0, '#2d3436');
  },

  cafe(L, { S, WS }) {
    // counter
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
    L.box(8, 10, 3, 1.0, 1.25, '#dff9fb');
    S('pastry', 8, 9.0, 0, 'the pastry case', 'public');
    // seating
    for (const [x, z] of [[-24, 15], [-18, 15], [-12, 15], [12, 15], [18, 15], [24, 15], [-24, 20], [-18, 20], [-12, 20], [12, 20], [18, 20], [24, 20], [16, 7], [22, 7], [27, 11]]) {
      L.box(x, z, 1.0, 1.0, 0.76, '#ecf0f1');
      L.chair(x - 0.8, z, Math.PI / 2);
      L.chair(x + 0.8, z, -Math.PI / 2);
      L.pois.customerSpots.push({ x: x - 0.8, z, yaw: Math.PI / 2, sit: true }, { x: x + 0.8, z, yaw: -Math.PI / 2, sit: true });
      S('cafetable', x, z + 1.0, Math.PI, 'a cafe table', 'public');
    }
    // cozy nook with high-back booths (cover)
    for (const z of [5.5, 8.5]) L.box(-25, z, 4, 0.4, 1.3, '#6d214f');
    L.box(-25, 7, 2, 1.2, 0.76, '#ecf0f1');
    L.pois.customerSpots.push({ x: -25, z: 6.2, yaw: 0, sit: true }, { x: -25, z: 7.8, yaw: Math.PI, sit: true });
    L.plant(-1, 22.5);
    S('plant', -1, 21.5, 0, 'the window plant', 'public');
  },
};
