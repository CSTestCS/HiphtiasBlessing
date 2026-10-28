// The city: a 4 x 4 grid of blocks, streets with names, parks, shops for errands,
// your apartment, your workplace, cars, sidewalk routes and bus lines.
import * as THREE from 'three';
import { Level, mat, textPlane } from '../level.js';
import { PLACES, APARTMENTS, WORK_SLOTS } from '../data.js';

function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const STREETS = [-120, -60, 0, 60, 120];
const AVES = ['1st Ave', '2nd Ave', '3rd Ave', '4th Ave', '5th Ave']; // streets along z (x fixed)
const STS = ['Cedar St', 'Elm St', 'Maple St', 'Oak St', 'Pine St']; // streets along x (z fixed)
const ROAD = 5; // half road width (2 lanes + on-street parking)
const WALK = 8.5; // sidewalk outer edge from street center
const SW = 6.75; // sidewalk center line
const PARK = 4.2; // parked car line
const blockRange = (i) => [STREETS[i] + WALK, STREETS[i + 1] - WALK];

export const LINES = [
  { id: 'red', name: 'Red Line (Ring)', color: '#e74c3c', pts: [[-120, 120], [-120, -120], [120, -120], [120, 120]] },
  { id: 'blue', name: 'Blue Line (Crosstown)', color: '#2980b9', pts: [[-60, -120], [-60, 120], [60, 120], [60, -120]] },
  { id: 'green', name: 'Green Line (Midtown)', color: '#27ae60', pts: [[120, -60], [-120, -60], [-120, 60], [120, 60]] },
];

export function streetName(axis, v) {
  const i = STREETS.indexOf(v);
  return axis === 'x' ? AVES[i] : STS[i];
}

export function buildCity({ workplaceName = 'Work', jobColor = '#273c75', homeId = 'maple', workSlot = 0 } = {}) {
  const L = new Level('city');
  const rng = mulberry(4242);
  L.indoor = false;
  L.bounds = { minX: -127.5, maxX: 127.5, minZ: -127.5, maxZ: 127.5 };

  // ---- ground: sidewalks everywhere, roads on top, blocks inside
  L.floor(0, 0, 256, 256, '#a5a5a5');
  for (const s of STREETS) {
    L.floor(s, 0, ROAD * 2, 256, '#3b3b3f', 0.003);
    L.floor(0, s, 256, ROAD * 2, '#3b3b3f', 0.004);
  }
  // lane markings
  for (const s of STREETS) {
    for (let t = -126; t < 126; t += 6) {
      if (STREETS.some((q) => Math.abs(t - q) < 6)) continue;
      L.floor(s, t, 0.18, 3, '#f5f6fa', 0.006);
      L.floor(t, s, 3, 0.18, '#f5f6fa', 0.006);
    }
  }
  // crosswalks at every intersection
  for (const sx of STREETS)
    for (const sz of STREETS) {
      for (let i = -3; i <= 3; i++) {
        for (const side of [-1, 1]) {
          L.floor(sx + i * 1.1, sz + side * (ROAD + 1.6), 0.55, 2.6, '#ecf0f1', 0.007);
          L.floor(sx + side * (ROAD + 1.6), sz + i * 1.1, 2.6, 0.55, '#ecf0f1', 0.007);
        }
      }
    }
  // boundary fence
  for (const v of [-127.6, 127.6]) {
    L.box(0, v, 256, 0.3, 1.2, '#7f8c8d', { occlude: false });
    L.box(v, 0, 0.3, 256, 1.2, '#7f8c8d', { occlude: false });
  }

  // ---- blocks
  const palette = ['#d1ccc0', '#b8a99a', '#a4b0be', '#c8d6e5', '#e3c4a8', '#c7a17a', '#95a5a6', '#d6a2ad', '#b5c99a', '#dcd3c4'];
  const special = {
    '1,3': [{ kind: 'supermarket', side: 'n' }],
    '2,3': [{ kind: 'pharmacy', side: 'w' }],
    '0,1': [{ kind: 'postoffice', side: 'e' }],
    '0,0': [{ kind: 'laundromat', side: 's' }],
    '2,0': [{ kind: 'bank', side: 's' }],
    '3,2': [{ kind: 'hardware', side: 'w' }],
    '1,0': [{ kind: 'bookstore', side: 'e' }],
  };
  // the workplace: wherever this save put it
  const [wb, ws] = WORK_SLOTS[workSlot] || WORK_SLOTS[0];
  (special[wb] ||= []).push({ kind: 'work', side: ws });
  // apartment complexes; one of them is home
  for (const a of APARTMENTS) (special[a.block] ||= []).push({ kind: 'apt:' + a.id, side: a.side, home: a.id === homeId });
  L.apartments = {};
  const parks = new Set(['1,2', '2,1']);
  L.places = {};
  const blocks = [];
  L.pois.benches = [];
  for (let bx = 0; bx < 4; bx++) {
    for (let bz = 0; bz < 4; bz++) {
      const [x0, x1] = blockRange(bx);
      const [z0, z1] = blockRange(bz);
      const key = bx + ',' + bz;
      if (parks.has(key)) buildPark(L, x0, x1, z0, z1, rng);
      else buildBlock(L, x0, x1, z0, z1, rng, palette, special[key] || [], { workplaceName, jobColor });
      // street furniture on the block's sidewalks
      blocks.push([x0, x1, z0, z1]);
    }
  }

  // ---- doors
  const door = (id, s) => s && L.interactable(id, s.door.x, s.door.z, s.label, { r: 1.8 });
  door('homedoor', L.places.home);
  door('poolgate', L.places.poolgate);
  door('workdoor', L.places.work);
  for (const k of Object.keys(PLACES)) door('place:' + k, L.places[k]);
  L.spawnHome = { ...L.places.home.out };
  L.spawnWork = { ...L.places.work.out };
  L.spawn = L.spawnHome;

  // ---- bus routes and stops
  L.lines = LINES.map((ln) => buildLine(L, ln));
  L.nearStop = (x, z) => L.lines.some((ln) => ln.stops.some((st) => Math.hypot(st.x - x, st.z - z) < 10));
  for (const b of blocks) sidewalkProps(L, ...b, rng);

  // ---- cars
  buildCars(L, rng);

  // ---- pedestrian graph: block sidewalk corners
  const nodes = [];
  const nid = (bx, bz, c) => (bx * 4 + bz) * 4 + c; // c: 0=nw 1=ne 2=se 3=sw
  for (let bx = 0; bx < 4; bx++)
    for (let bz = 0; bz < 4; bz++) {
      const xl = STREETS[bx] + SW;
      const xr = STREETS[bx + 1] - SW;
      const zt = STREETS[bz] + SW;
      const zb = STREETS[bz + 1] - SW;
      nodes[nid(bx, bz, 0)] = { x: xl, z: zt, n: [] };
      nodes[nid(bx, bz, 1)] = { x: xr, z: zt, n: [] };
      nodes[nid(bx, bz, 2)] = { x: xr, z: zb, n: [] };
      nodes[nid(bx, bz, 3)] = { x: xl, z: zb, n: [] };
    }
  const link = (a, b) => {
    nodes[a].n.push(b);
    nodes[b].n.push(a);
  };
  for (let bx = 0; bx < 4; bx++)
    for (let bz = 0; bz < 4; bz++) {
      for (let c = 0; c < 4; c++) link(nid(bx, bz, c), nid(bx, bz, (c + 1) % 4));
      if (bx < 3) {
        link(nid(bx, bz, 1), nid(bx + 1, bz, 0));
        link(nid(bx, bz, 2), nid(bx + 1, bz, 3));
      }
      if (bz < 3) {
        link(nid(bx, bz, 3), nid(bx, bz + 1, 0));
        link(nid(bx, bz, 2), nid(bx, bz + 1, 1));
      }
    }
  L.pedGraph = nodes;
  L.finalize();
  return L;
}

// ---------------------------------------------------------------------------
function buildBlock(L, x0, x1, z0, z1, rng, palette, sp, ctx) {
  // fill the block with a courtyard ring of buildings
  const depth = 14;
  const sides = [
    { side: 'n', a0: x0, a1: x1, fixed: z0, axis: 'x', dir: 1 },
    { side: 's', a0: x0, a1: x1, fixed: z1, axis: 'x', dir: -1 },
    { side: 'w', a0: z0 + depth, a1: z1 - depth, fixed: x0, axis: 'z', dir: 1 },
    { side: 'e', a0: z0 + depth, a1: z1 - depth, fixed: x1, axis: 'z', dir: -1 },
  ];
  L.floor((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, '#8c8c84', 0.002);
  for (const s of sides) {
    let a = s.a0;
    const len = s.a1 - s.a0;
    const spS = sp.find((x) => x.side === s.side);
    const isSpecial = !!spS;
    const specW = Math.min(18, len);
    const specA = s.a0 + len / 2 - specW / 2;
    while (a < s.a1 - 0.5) {
      let w;
      let special = false;
      if (isSpecial && a <= specA + 0.01 && a + 4 > specA) {
        w = specW;
        special = true;
        a = specA;
      } else {
        w = Math.min(s.a1 - a, 7 + rng() * 9);
        if (isSpecial && a < specA && a + w > specA) w = specA - a;
      }
      if (w < 0.5) {
        a += w;
        continue;
      }
      const h = special ? (spS.kind.startsWith('apt:') ? 16 : 9) : 7 + rng() * 16;
      const col = special ? (spS.kind.startsWith('apt:') ? (spS.home ? '#c8a27a' : '#d7bfa3') : spS.kind === 'work' ? '#dfe4ea' : PLACES[spS.kind] ? '#ecf0f1' : palette[Math.floor(rng() * palette.length)]) : palette[Math.floor(rng() * palette.length)];
      const ca = a + w / 2;
      const cf = s.fixed + s.dir * (depth / 2);
      const bx = s.axis === 'x' ? ca : cf;
      const bz = s.axis === 'x' ? cf : ca;
      const bw = s.axis === 'x' ? w - 0.3 : depth;
      const bd = s.axis === 'x' ? depth : w - 0.3;
      L.box(bx, bz, bw, bd, h, col);
      // shop window band and windows on the street face
      const fx = s.axis === 'x' ? ca : s.fixed - s.dir * 0.03;
      const fz = s.axis === 'x' ? s.fixed - s.dir * 0.03 : ca;
      const ww = Math.max(0.5, w - 1.6);
      L.box(fx, fz, s.axis === 'x' ? ww : 0.06, s.axis === 'x' ? 0.06 : ww, 1.6, '#5dade2', { y: 0.7, collide: false, occlude: false, matOpts: { roughness: 0.2, metalness: 0.3 } });
      for (let fy = 4; fy < h - 1; fy += 3.2) {
        L.box(fx, fz, s.axis === 'x' ? ww : 0.05, s.axis === 'x' ? 0.05 : ww, 1.2, '#34495e', { y: fy, collide: false, occlude: false, shadow: false });
      }
      if (special) placeSpecial(L, spS.kind, s, ca, ctx, spS);
      a += w;
    }
  }
}

function placeSpecial(L, kind, s, ca, ctx, spec = {}) {
  // outward normal from the building face toward the street
  const nx = s.axis === 'z' ? -s.dir : 0;
  const nz = s.axis === 'x' ? -s.dir : 0;
  const fx = s.axis === 'x' ? ca : s.fixed;
  const fz = s.axis === 'x' ? s.fixed : ca;
  const yaw = Math.atan2(nx, nz);
  const doorMesh = L.box(fx + nx * 0.05, fz + nz * 0.05, s.axis === 'x' ? 2.2 : 0.1, s.axis === 'x' ? 0.1 : 2.2, 2.5, '#2f3640', { collide: false });
  void doorMesh;
  let label;
  let signText;
  let signBg;
  const apt = kind.startsWith('apt:') ? APARTMENTS.find((a) => 'apt:' + a.id === kind) : null;
  if (apt) {
    label = spec.home ? `Enter ${apt.name} (home)` : apt.name;
    signText = apt.name;
    signBg = apt.color;
  } else if (kind === 'work') {
    label = `Enter ${ctx.workplaceName}`;
    signText = ctx.workplaceName;
    signBg = ctx.jobColor;
  } else if (PLACES[kind]) {
    label = `Enter ${PLACES[kind].name}`;
    signText = PLACES[kind].name;
    signBg = PLACES[kind].color;
  } else return;
  const sign = textPlane(signText, { bg: signBg, height: 0.8 });
  sign.position.set(fx + nx * 0.12, 3.5, fz + nz * 0.12);
  sign.rotation.y = yaw;
  L.add(sign);
  L.places[kind] = {
    label,
    door: { x: fx + nx * 1.0, z: fz + nz * 1.0 },
    out: { x: fx + nx * 2.2, z: fz + nz * 2.2, yaw },
  };
  if (apt) {
    L.apartments[apt.id] = L.places[kind];
    if (spec.home) L.places.home = L.places[kind];
  }
  if (apt && spec.home) {
    // the residents' pool gate, a few meters along the same face: a back way in
    const ax = s.axis === 'x' ? 1 : 0;
    const az = s.axis === 'x' ? 0 : 1;
    const gx = fx + ax * 5.5;
    const gz = fz + az * 5.5;
    L.box(gx + nx * 0.05, gz + nz * 0.05, s.axis === 'x' ? 1.8 : 0.1, s.axis === 'x' ? 0.1 : 1.8, 1.9, '#2c3e50', { collide: false });
    const gsign = textPlane("Residents' Pool", { bg: '#1e3799', height: 0.35 });
    gsign.position.set(gx + nx * 0.12, 2.3, gz + nz * 0.12);
    gsign.rotation.y = yaw;
    L.add(gsign);
    L.places.poolgate = {
      label: `Residents' pool gate (back way into ${apt.short})`,
      door: { x: gx + nx * 1.0, z: gz + nz * 1.0 },
      out: { x: gx + nx * 2.2, z: gz + nz * 2.2, yaw },
    };
  }
}

function buildPark(L, x0, x1, z0, z1, rng) {
  (L.parks ||= []).push({ x0, x1, z0, z1 });
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  L.floor(cx, cz, x1 - x0, z1 - z0, '#6ab04c', 0.006);
  L.floor(cx, cz, 3, z1 - z0, '#d6c7a1', 0.008);
  L.floor(cx, cz, x1 - x0, 3, '#d6c7a1', 0.008);
  for (let i = 0; i < 16; i++) {
    const x = x0 + 3 + rng() * (x1 - x0 - 6);
    const z = z0 + 3 + rng() * (z1 - z0 - 6);
    if (Math.abs(x - cx) < 3 || Math.abs(z - cz) < 3) continue;
    L.box(x, z, 1.6 + rng() * 2, 1.4 + rng() * 1.5, 1.15, '#2d6a4f');
  }
  for (let i = 0; i < 10; i++) {
    const x = x0 + 3 + rng() * (x1 - x0 - 6);
    const z = z0 + 3 + rng() * (z1 - z0 - 6);
    if (Math.abs(x - cx) < 3 || Math.abs(z - cz) < 3) continue;
    L.box(x, z, 0.35, 0.35, 2.2, '#6d4c41');
    const top = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 1), mat('#27ae60'));
    top.position.set(x, 3.2, z);
    top.castShadow = true;
    L.add(top);
    L.staticMeshes.push(top);
  }
  for (const [x, z, yaw] of [[cx - 2.3, cz - 8, Math.PI / 2], [cx + 2.3, cz + 8, -Math.PI / 2], [cx - 8, cz + 2.3, Math.PI], [cx + 8, cz - 2.3, 0]]) {
    L.box(x, z, Math.abs(Math.sin(yaw)) > 0.5 ? 0.6 : 1.8, Math.abs(Math.sin(yaw)) > 0.5 ? 1.8 : 0.6, 0.45, '#8d6e63');
    L.pois.benches.push(L.seat(x, z, yaw, 'park bench'));
  }
  // fountain
  L.box(cx, cz, 2.6, 2.6, 0.8, '#b2bec3');
}

function sidewalkProps(L, x0, x1, z0, z1, rng) {
  // street furniture along each block edge (on the sidewalk), plus parked cars at the curb
  const edges = [
    { f: (t) => ({ x: t, z: z0 - 1.3 }), a: x0, b: x1, axis: 'x', street: z0 - WALK, out: -1 },
    { f: (t) => ({ x: t, z: z1 + 1.3 }), a: x0, b: x1, axis: 'x', street: z1 + WALK, out: 1 },
    { f: (t) => ({ x: x0 - 1.3, z: t }), a: z0, b: z1, axis: 'z', street: x0 - WALK, out: -1 },
    { f: (t) => ({ x: x1 + 1.3, z: t }), a: z0, b: z1, axis: 'z', street: x1 + WALK, out: 1 },
  ];
  const nearDoor = (x, z) => Object.values(L.places || {}).some((pl) => Math.hypot(pl.door.x - x, pl.door.z - z) < 5);
  for (const e of edges) {
    const ax = e.axis === 'x';
    for (let t = e.a + 5; t < e.b - 5; t += 6 + rng() * 7) {
      const p = e.f(t);
      if (nearDoor(p.x, p.z)) continue;
      const r = rng();
      const w = (a, b) => (ax ? a : b);
      if (r < 0.22) L.box(p.x, p.z, w(3, 0.9), w(0.9, 3), 1.1, '#2d6a4f'); // hedge planter
      else if (r < 0.32) {
        L.box(p.x, p.z, 0.75, 0.75, 1.05, ['#2c3e50', '#2980b9', '#c0392b'][Math.floor(rng() * 3)]); // bin / mailbox
      } else if (r < 0.42) {
        L.box(p.x, p.z, w(0.9, 0.7), w(0.7, 0.9), 1.85, '#e17055'); // vending machine
      } else if (r < 0.5) {
        // phone booth: walk in and hide
        L.box(p.x - w(0.55, 0), p.z - w(0, 0.55), w(0.06, 1.1), w(1.1, 0.06), 2.2, '#c0392b');
        L.box(p.x + w(0.55, 0), p.z + w(0, 0.55), w(0.06, 1.1), w(1.1, 0.06), 2.2, '#c0392b');
        L.box(p.x - e.out * w(0, 0.55), p.z - e.out * w(0.55, 0), w(1.1, 0.06), w(0.06, 1.1), 2.2, '#c0392b');
        L.hideSpot(p.x, p.z, 'phone booth');
      } else if (r < 0.6) {
        L.box(p.x, p.z, 0.8, 0.6, 1.0, '#1e3799'); // newspaper stand
        L.pickup('newspaper', p.x, p.z, 1.0);
      } else if (r < 0.68) {
        L.box(p.x, p.z, w(1.8, 0.6), w(0.6, 1.8), 0.45, '#8d6e63', { occlude: false });
        L.pois.benches.push(L.seat(p.x, p.z, ax ? (e.out > 0 ? 0 : Math.PI) : e.out > 0 ? Math.PI / 2 : -Math.PI / 2, 'bench'));
        if (rng() < 0.4) L.pickup('bag', p.x + w(0.6, 0), p.z + w(0, 0.6), 0.45);
      } else if (r < 0.74) {
        L.box(p.x, p.z, 0.9, 0.9, 2.6, '#f5cd79'); // advertising pillar
      } else if (r < 0.8) {
        L.box(p.x, p.z, w(2, 1.2), w(1.2, 2), 1.5, '#ffeaa7'); // food cart
      } else if (r < 0.86) {
        L.box(p.x, p.z, 0.6, 0.6, 1.0, '#576574'); // umbrella stand
        L.pickup('umbrella', p.x, p.z, 0.2);
      } else {
        L.box(p.x, p.z, 0.35, 0.35, 2.4, '#6d4c41'); // street tree
        const top = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), mat('#27ae60'));
        top.position.set(p.x, 3.4, p.z);
        top.castShadow = true;
        L.add(top);
        L.staticMeshes.push(top);
      }
    }
    // parked cars along the curb
    for (let t = e.a + 8; t < e.b - 8; t += 5.5 + rng() * 5) {
      if (rng() < 0.4) continue;
      const lane = e.street - e.out * (WALK - PARK);
      const x = ax ? t : lane;
      const z = ax ? lane : t;
      if (nearDoor(x, z) || L.nearStop?.(x, z)) continue;
      const col = ['#e74c3c', '#3498db', '#f1c40f', '#ecf0f1', '#2c3e50', '#16a085', '#8e44ad', '#d35400'][Math.floor(rng() * 8)];
      L.box(x, z, ax ? 4.2 : 1.8, ax ? 1.8 : 4.2, 0.95, col, { y: 0.15 });
      L.box(x, z, ax ? 2.2 : 1.6, ax ? 1.6 : 2.2, 0.55, '#2c3e50', { y: 1.1 });
    }
  }
}

// ---------------------------------------------------------------------------
// Bus lines
function buildLine(L, ln) {
  const pts = ln.pts.map(([x, z]) => ({ x, z }));
  const n = pts.length;
  const segs = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    segs.push({ a, b, len, dx, dz, rx: -dz, rz: dx });
  }
  // lane polyline (drive on the right, 2 m from the center)
  const lane = [];
  for (let i = 0; i < n; i++) {
    const prev = segs[(i - 1 + n) % n];
    const cur = segs[i];
    lane.push({ x: pts[i].x + (prev.rx + cur.rx) * 2, z: pts[i].z + (prev.rz + cur.rz) * 2 });
  }
  const lsegs = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = lane[i];
    const b = lane[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    lsegs.push({ a, b, len, s0: total, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len });
    total += len;
  }
  const at = (s) => {
    s = ((s % total) + total) % total;
    for (const g of lsegs) {
      if (s <= g.s0 + g.len) {
        const t = s - g.s0;
        return { x: g.a.x + g.dx * t, z: g.a.z + g.dz * t, yaw: Math.atan2(g.dx, g.dz), rx: -g.dz, rz: g.dx, seg: g };
      }
    }
    return { x: lane[0].x, z: lane[0].z, yaw: 0, rx: 0, rz: 0 };
  };
  // stops: at every other mid-block point along each segment
  const stops = [];
  for (const g of lsegs) {
    const axis = Math.abs(g.dx) > 0.5 ? 'x' : 'z';
    const fixed = axis === 'x' ? Math.round((g.a.z - g.dz * 0) / 60) * 60 : Math.round(g.a.x / 60) * 60;
    let k = 0;
    for (let t = 30; t < g.len; t += 60) {
      const p = { x: g.a.x + g.dx * t, z: g.a.z + g.dz * t };
      if (k++ % 2 === 1) continue;
      const along = axis === 'x' ? p.x : p.z;
      const cross = STREETS.reduce((best, q) => (Math.abs(q - along) < Math.abs(best - along) ? q : best), STREETS[0]);
      const sideCross = along < cross ? 'before' : 'past';
      void sideCross;
      const sname = streetName(axis === 'x' ? 'z' : 'x', fixed);
      const cname = streetName(axis === 'x' ? 'x' : 'z', cross);
      stops.push({
        s: g.s0 + t,
        name: `${sname} & ${cname}`,
        x: p.x + -g.dz * 4.4,
        z: p.z + g.dx * 4.4,
        yaw: Math.atan2(g.dx, g.dz),
        rx: -g.dz,
        rz: g.dx,
        line: ln.id,
      });
    }
  }
  stops.sort((a, b) => a.s - b.s);
  stops.forEach((st, i) => {
    st.index = i;
    // shelter on the sidewalk, behind the stop point
    const bx = st.x + st.rx * 1.6;
    const bz = st.z + st.rz * 1.6;
    const along = Math.abs(st.rx) < 0.5; // road runs along z when rx ~ 0? (rx = -dz)
    const sx = along ? 3.4 : 1.0;
    const sz = along ? 1.0 : 3.4;
    L.box(bx, bz, sx, sz, 0.08, '#7f8c8d', { y: 2.4, collide: false, occlude: false });
    L.box(bx + st.rx * 0.5, bz + st.rz * 0.5, along ? 3.4 : 0.06, along ? 0.06 : 3.4, 1.9, '#aed6f1', { y: 0.4, occlude: false, static: false, matOpts: { transparent: true, opacity: 0.35 } });
    L.box(bx + st.rx * 0.2, bz + st.rz * 0.2, along ? 2.2 : 0.5, along ? 0.5 : 2.2, 0.45, '#8d6e63', { collide: false, occlude: false });
    const pole = { x: st.x - Math.sin(st.yaw) * 2.4 + st.rx * 0.2, z: st.z - Math.cos(st.yaw) * 2.4 + st.rz * 0.2 };
    L.box(pole.x, pole.z, 0.1, 0.1, 2.6, '#2d3436', { occlude: false });
    const sign = textPlane('BUS', { bg: ln.color, height: 0.45 });
    sign.position.set(pole.x, 2.7, pole.z);
    sign.rotation.y = st.yaw + Math.PI / 2;
    L.add(sign);
    const sign2 = sign.clone();
    sign2.rotation.y = st.yaw - Math.PI / 2;
    L.add(sign2);
    L.interactable(`stop:${ln.id}:${i}`, st.x + st.rx * 0.6, st.z + st.rz * 0.6, `${ln.name} stop: ${st.name}`, { r: 3.2, stop: st, lineId: ln.id });
    L.pois.benches.push(L.seat(bx + st.rx * 0.2, bz + st.rz * 0.2, Math.atan2(-st.rx, -st.rz), 'bus stop bench', { busStop: st }));
    // opaque ad panel on one end of the shelter (cover)
    L.box(bx - Math.sin(st.yaw) * 1.7, bz - Math.cos(st.yaw) * 1.7, along ? 0.12 : 1.0, along ? 1.0 : 0.12, 2.0, ln.color, { y: 0.1 });
  });
  return { ...ln, lane, lsegs, total, at, stops };
}

// ---------------------------------------------------------------------------
function buildCars(L, rng) {
  const cars = [];
  const carColors = ['#e74c3c', '#3498db', '#f1c40f', '#ecf0f1', '#2c3e50', '#16a085', '#8e44ad', '#d35400'];
  const mkCar = (axis, lane, dir, start, speed) => {
    const g = new THREE.Group();
    const col = carColors[Math.floor(rng() * carColors.length)];
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 4.2), mat(col));
    body.position.y = 0.6;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), mat('#2c3e50'));
    cab.position.set(0, 1.25, -0.2);
    g.add(body, cab);
    for (const [wx, wz] of [[0.85, 1.3], [-0.85, 1.3], [0.85, -1.3], [-0.85, -1.3]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.25, 10), mat('#111111'));
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.33, wz);
      g.add(w);
    }
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    L.add(g);
    const car = { g, axis, lane, dir, pos: start, speed, cur: speed, hw: 1.0, hl: 2.2 };
    g.rotation.y = axis === 'z' ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    cars.push(car);
  };
  for (const s of STREETS) {
    // z-direction streets (x fixed = s): +z lane at x = s - 2, -z lane at x = s + 2
    mkCar('z', s - 2, 1, -120 + rng() * 240, 8 + rng() * 3);
    mkCar('z', s + 2, -1, -120 + rng() * 240, 8 + rng() * 3);
    mkCar('x', s + 2, 1, -120 + rng() * 240, 8 + rng() * 3);
    mkCar('x', s - 2, -1, -120 + rng() * 240, 8 + rng() * 3);
  }
  L.cars = cars;
  L.updaters.push((dt, game) => {
    const blockers = game ? game.allBodies() : [];
    for (const c of cars) {
      let blocked = false;
      for (const b of blockers) {
        const along = c.axis === 'z' ? (b.z - c.pos) * c.dir : (b.x - c.pos) * c.dir;
        if (along < 1.5 || along > 9) continue;
        const side = c.axis === 'z' ? Math.abs(b.x - c.lane) : Math.abs(b.z - c.lane);
        if (side < (b.big ? 2.6 : 1.6)) blocked = true;
      }
      const target = blocked ? 0 : c.speed;
      c.cur += (target - c.cur) * Math.min(1, dt * (blocked ? 5 : 1.2));
      c.pos += c.cur * c.dir * dt;
      if (c.pos > 127) c.pos = -127;
      if (c.pos < -127) c.pos = 127;
      if (c.axis === 'z') c.g.position.set(c.lane, 0, c.pos);
      else c.g.position.set(c.pos, 0, c.lane);
    }
  });
}
