// Level building blocks: boxes with collision/occlusion, labels, stations,
// fast sight-line tests (box ray casts with a spatial hash), mesh merging,
// and an automatic navigation grid with A* for NPC path finding.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { propMesh } from './props.js';

const mats = {};
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats[key]) {
    mats[key] = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...opts });
  }
  return mats[key];
}

export function textPlane(text, { color = '#ffffff', bg = '#2d3436', size = 64, height = 0.5 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `bold ${size}px sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  c.width = w;
  c.height = size + 30;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = `bold ${size}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry((c.width / c.height) * height, height), new THREE.MeshBasicMaterial({ map: tex }));
}

const CELL = 4;

// Binary heap for A*
class Heap {
  constructor() {
    this.a = [];
  }
  push(k, f) {
    const a = this.a;
    a.push([k, f]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][1] <= a[i][1]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][1] < a[m][1]) m = l;
        if (r < a.length && a[r][1] < a[m][1]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[0];
  }
  get size() {
    return this.a.length;
  }
}

export class Level {
  constructor(name) {
    this.name = name;
    this.group = new THREE.Group();
    this.colliders = []; // {minX,maxX,minZ,maxZ,h}
    this.occ = []; // sight blockers {minX,maxX,minY,maxY,minZ,maxZ}
    this.interactables = new Map();
    this.stations = []; // {id, tag, x, z, yaw, label, room}
    this.pois = {};
    this.bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
    this.spawn = { x: 0, z: 0, yaw: 0 };
    this.indoor = true;
    this.updaters = [];
    this.staticMeshes = [];
    this.stamp = 0;
    this.seats = []; // {x, z, yaw, taken, label}
    this.pickups = []; // {x, z, kind, mesh, taken}
    this.coverPoints = [];
    this.movables = []; // whiteboards and carts that can be pushed around
  }

  /** A whiteboard or cart you (or NPCs) can push around and hide behind. */
  movable(kind, x, z, yaw = 0) {
    const g = new THREE.Group();
    const M = (c) => mat(c);
    let hw;
    let hd;
    let y0;
    let h;
    if (kind === 'whiteboard') {
      hw = 0.75;
      hd = 0.12;
      y0 = 0.45;
      h = 1.85;
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 0.04), M('#f5f6fa'));
      board.position.y = 1.2;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.56, 1.26, 0.03), M('#95a5a6'));
      frame.position.set(0, 1.2, -0.01);
      g.add(board, frame);
      for (const sx of [-0.7, 0.7]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.04), M('#7f8c8d'));
        leg.position.set(sx, 0.3, 0);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.5), M('#7f8c8d'));
        foot.position.set(sx, 0.03, 0);
        g.add(leg, foot);
      }
    } else {
      hw = 0.55;
      hd = 0.32;
      y0 = 0.15;
      h = 1.05;
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.64), M('#7f8c8d'));
      base.position.y = 0.2;
      const top = base.clone();
      top.position.y = 0.95;
      const box1 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.65, 0.55), M(kind === 'laundrycart' ? '#dfe6e9' : '#c8a27a'));
      box1.position.y = 0.55;
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.6), M('#2d3436'));
      handle.position.set(-0.56, 1.15, 0);
      g.add(base, top, box1, handle);
      for (const [sx, sz] of [[-0.48, -0.26], [0.48, -0.26], [-0.48, 0.26], [0.48, 0.26]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10), M('#2d3436'));
        w.rotation.x = Math.PI / 2;
        w.position.set(sx, 0.07, sz);
        g.add(w);
      }
    }
    g.traverse((o) => o.isMesh && ((o.castShadow = true), (o.receiveShadow = true)));
    this.group.add(g);
    const m = { kind, x, z, yaw, hw, hd, y0, h, mesh: g, holder: null };
    this.placeMovable(m, x, z, yaw);
    this.movables.push(m);
    return m;
  }

  placeMovable(m, x, z, yaw) {
    m.x = x;
    m.z = z;
    m.yaw = yaw;
    m.mesh.position.set(x, 0, z);
    m.mesh.rotation.y = yaw;
    // axis-aligned box around the rotated footprint, for sight lines and bumping
    const c = Math.abs(Math.cos(yaw));
    const sn = Math.abs(Math.sin(yaw));
    const ex = m.hw * c + m.hd * sn;
    const ez = m.hw * sn + m.hd * c;
    m.box = { minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez, minY: m.y0, maxY: m.h };
  }

  /**
   * Where someone at (fromX, fromZ) should stand to push m, and which way they face.
   * Whiteboards are pushed flat side first; carts from either short end (the handle end is nicest).
   * Also records on m how it stays oriented relative to the pusher.
   */
  pushGrip(m, fromX, fromZ) {
    const board = m.kind === 'whiteboard';
    // push axis in world space: the board's facing (local z) or the cart's length (local x)
    const ax = board ? Math.sin(m.yaw) : Math.cos(m.yaw);
    const az = board ? Math.cos(m.yaw) : -Math.sin(m.yaw);
    const ext = board ? m.hd : m.hw;
    const side = (fromX - m.x) * ax + (fromZ - m.z) * az >= 0 ? 1 : -1;
    const fx = -side * ax;
    const fz = -side * az;
    const yaw = Math.atan2(fx, fz);
    const gap = 0.42 + ext;
    return { yaw, x: m.x - fx * gap, z: m.z - fz * gap, ext, off: m.yaw - yaw };
  }

  /** Put m in front of a pusher standing at (x, z) facing yaw, keeping the grip they took. */
  pushTarget(m, x, z, yaw) {
    const gap = 0.42 + (m.pushExt ?? m.hd);
    return { x: x + Math.sin(yaw) * gap, z: z + Math.cos(yaw) * gap, yaw: yaw + (m.pushOff ?? Math.PI / 2) };
  }

  /** A chair/bench spot anyone can sit on (player included). Returns the spot. */
  seat(x, z, yaw, label = 'chair', extra = {}) {
    const s = { x, z, yaw, sit: true, label, ...extra };
    this.seats.push(s);
    return s;
  }

  /** An item lying around that the player can pick up and carry in front of them. */
  pickup(kind, x, z, y = 0.8, rotY = 0) {
    const m = propMesh(kind);
    m.position.set(x, y + (m.userData.up < 0 ? 0.3 : 0), z);
    m.rotation.y = rotY;
    this.group.add(m);
    const p = { x, z, y, kind, mesh: m, taken: false, home: { x, z, y } };
    this.pickups.push(p);
    return p;
  }

  hideSpot(x, z, room, label = 'Hide') {
    (this.pois.hideSpots ||= []).push({ x, z, room, label });
  }

  add(obj) {
    this.group.add(obj);
    return obj;
  }

  /** Box centered at (x,z) with size w (x) by d (z) and height h. */
  box(x, z, w, d, h, color, opts = {}) {
    const y0 = opts.y || 0;
    const glass = !!opts.matOpts?.transparent;
    // glass must not write depth, or eyes and see-through clothes behind it vanish
    const mo = glass ? { ...opts.matOpts, depthWrite: false } : opts.matOpts;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), opts.material || mat(color, mo));
    m.position.set(x, y0 + h / 2, z);
    if (opts.rotY) m.rotation.y = opts.rotY;
    if (glass) m.renderOrder = 5;
    m.castShadow = opts.shadow !== false && !glass;
    m.receiveShadow = true;
    this.group.add(m);
    if (opts.static !== false && !opts.matOpts?.transparent) this.staticMeshes.push(m);
    const rot = opts.rotY && Math.abs(Math.sin(opts.rotY * 2)) > 0.1;
    const hw = rot ? Math.max(w, d) / 2 : Math.abs(Math.cos(opts.rotY || 0)) > 0.5 ? w / 2 : d / 2;
    const hd = rot ? Math.max(w, d) / 2 : Math.abs(Math.cos(opts.rotY || 0)) > 0.5 ? d / 2 : w / 2;
    if (opts.collide !== false && y0 < 1.2) {
      this.colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, h: y0 + h });
    }
    if (opts.occlude !== false) {
      this.occ.push({ minX: x - hw, maxX: x + hw, minY: y0, maxY: y0 + h, minZ: z - hd, maxZ: z + hd });
    }
    return m;
  }

  wall(x1, z1, x2, z2, h = 3, color = '#e8e2d6', t = 0.2) {
    const w = Math.abs(x2 - x1) || t;
    const d = Math.abs(z2 - z1) || t;
    return this.box((x1 + x2) / 2, (z1 + z2) / 2, w + (x1 !== x2 ? t : 0), d + (z1 !== z2 ? t : 0), h, color);
  }

  /** Wall along X (z fixed) with door gaps [{c, w}] (gap centers on x). */
  wallX(z, x1, x2, gaps = [], h = 3, color = '#e8e2d6') {
    const segs = this.splitGaps(x1, x2, gaps);
    for (const [a, b] of segs) if (b - a > 0.05) this.wall(a, z, b, z, h, color);
  }

  wallZ(x, z1, z2, gaps = [], h = 3, color = '#e8e2d6') {
    const segs = this.splitGaps(z1, z2, gaps);
    for (const [a, b] of segs) if (b - a > 0.05) this.wall(x, a, x, b, h, color);
  }

  splitGaps(a, b, gaps) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const g = gaps.map((x) => [x.c - x.w / 2, x.c + x.w / 2]).sort((p, q) => p[0] - q[0]);
    const out = [];
    let cur = lo;
    for (const [s, e] of g) {
      if (s > cur) out.push([cur, Math.min(s, hi)]);
      cur = Math.max(cur, e);
    }
    if (cur < hi) out.push([cur, hi]);
    return out;
  }

  floor(x, z, w, d, color, y = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + 0.001, z);
    m.receiveShadow = true;
    this.group.add(m);
    this.staticMeshes.push(m);
    return m;
  }

  label(text, x, y, z, rotY = 0, opts) {
    const p = textPlane(text, opts);
    p.position.set(x, y, z);
    p.rotation.y = rotY;
    this.group.add(p);
    return p;
  }

  interactable(id, x, z, label, opts = {}) {
    const it = { id, x, z, r: opts.r || 1.3, label, ...opts };
    this.interactables.set(id, it);
    return it;
  }

  /** Register a work station (target for tasks). Also makes it interactable. */
  station(tag, x, z, yaw, label, room, opts = {}) {
    const id = opts.id || `${tag}#${this.stations.length}`;
    const s = { id, tag, x, z, yaw, label, room, ...opts };
    this.stations.push(s);
    this.interactable(id, x, z, label, { r: opts.r || 1.15, station: s });
    return s;
  }

  stationsByTag(tag) {
    return this.stations.filter((s) => s.tag === tag);
  }

  chair(x, z, rotY = 0, color = '#6d4c41') {
    this.box(x, z, 0.45, 0.45, 0.45, color, { collide: false, occlude: false });
    const bx = x - Math.sin(rotY) * 0.2;
    const bz = z - Math.cos(rotY) * 0.2;
    const along = Math.abs(Math.cos(rotY)) > 0.5;
    this.box(bx, bz, along ? 0.45 : 0.06, along ? 0.06 : 0.45, 0.5, color, { y: 0.45, collide: false, occlude: false });
  }

  plant(x, z, s = 1) {
    this.box(x, z, 0.4 * s, 0.4 * s, 0.4 * s, '#a0522d');
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4 * s, 1), mat('#2e8b57'));
    leaves.position.set(x, 0.75 * s, z);
    leaves.castShadow = true;
    this.group.add(leaves);
    this.staticMeshes.push(leaves);
    this.occ.push({ minX: x - 0.35 * s, maxX: x + 0.35 * s, minY: 0.4 * s, maxY: 1.1 * s, minZ: z - 0.35 * s, maxZ: z + 0.35 * s });
  }

  /** Merge static meshes by material to cut draw calls, and build spatial hashes. */
  finalize() {
    const byMat = new Map();
    for (const m of this.staticMeshes) {
      if (!m.parent || m.parent !== this.group) continue;
      if (!byMat.has(m.material)) byMat.set(m.material, []);
      byMat.get(m.material).push(m);
    }
    for (const [material, list] of byMat) {
      if (list.length < 2) continue;
      const geos = [];
      for (const m of list) {
        m.updateMatrix();
        let g = m.geometry.clone();
        if (g.index) g = g.toNonIndexed();
        g.applyMatrix4(m.matrix);
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        geos.push(g);
        this.group.remove(m);
      }
      const merged = mergeGeometries(geos, false);
      if (!merged) {
        list.forEach((m) => this.group.add(m));
        continue;
      }
      const mm = new THREE.Mesh(merged, material);
      mm.castShadow = list.some((m) => m.castShadow);
      mm.receiveShadow = true;
      this.group.add(mm);
    }
    this.staticMeshes = [];
    this.buildHashes();
    this.buildCoverPoints();
    this.markTableSeats();
  }

  /** Chairs pulled up to a desk or table: your legs go under it, so nobody can see. */
  markTableSeats() {
    for (const s of this.seats) {
      if (s.underTable !== undefined) continue;
      s.underTable = false;
      for (const d of [0.45, 0.65, 0.85]) {
        const px = s.x + Math.sin(s.yaw) * d;
        const pz = s.z + Math.cos(s.yaw) * d;
        for (const b of this.occ) {
          if (b.maxY < 0.55 || b.maxY > 1.05 || b.minY > 0.5) continue;
          if (px > b.minX - 0.1 && px < b.maxX + 0.1 && pz > b.minZ - 0.1 && pz < b.maxZ + 0.1) {
            s.underTable = true;
            break;
          }
        }
        if (s.underTable) break;
      }
    }
  }

  /** Spots right next to sight blockers, used by sneaking NPCs to get out of view. */
  buildCoverPoints() {
    const pts = [];
    for (const b of this.occ) {
      if (b.maxY < 0.7 || b.minY > 0.4) continue;
      const w = b.maxX - b.minX;
      const d = b.maxZ - b.minZ;
      if (w * d > 60) continue;
      const tall = b.maxY >= 1.2;
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      const cand = [
        [b.minX - 0.55, cz], [b.maxX + 0.55, cz], [cx, b.minZ - 0.55], [cx, b.maxZ + 0.55],
      ];
      if (w > 3) cand.push([b.minX + w * 0.25, b.minZ - 0.55], [b.maxX - w * 0.25, b.maxZ + 0.55], [b.minX + w * 0.25, b.maxZ + 0.55], [b.maxX - w * 0.25, b.minZ - 0.55]);
      if (d > 3) cand.push([b.minX - 0.55, b.minZ + d * 0.25], [b.maxX + 0.55, b.maxZ - d * 0.25], [b.maxX + 0.55, b.minZ + d * 0.25], [b.minX - 0.55, b.maxZ - d * 0.25]);
      for (const [x, z] of cand) if (!this.blockedPoint(x, z, 0.3)) pts.push({ x, z, tall });
    }
    this.coverPoints = pts;
  }

  buildHashes() {
    const hash = (list) => {
      const h = new Map();
      list.forEach((b, i) => {
        const x0 = Math.floor(b.minX / CELL);
        const x1 = Math.floor(b.maxX / CELL);
        const z0 = Math.floor(b.minZ / CELL);
        const z1 = Math.floor(b.maxZ / CELL);
        for (let x = x0; x <= x1; x++)
          for (let z = z0; z <= z1; z++) {
            const k = x * 73856 + z;
            if (!h.has(k)) h.set(k, []);
            h.get(k).push(i);
          }
      });
      return h;
    };
    this.colHash = hash(this.colliders);
    this.occHash = hash(this.occ);
    this.colStamp = new Uint32Array(this.colliders.length);
    this.occStamp = new Uint32Array(this.occ.length);
  }

  _query(hash, stampArr, minX, maxX, minZ, maxZ, fn) {
    const st = ++this.stamp;
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL);
    const z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const l = hash.get(x * 73856 + z);
        if (!l) continue;
        for (const i of l) {
          if (stampArr[i] === st) continue;
          stampArr[i] = st;
          if (fn(i)) return true;
        }
      }
    return false;
  }

  // ---- collision -------------------------------------------------------
  resolve(x, z, r, ignore = null) {
    if (!this.colHash) this.buildHashes();
    for (let iter = 0; iter < 3; iter++) {
      for (const m of this.movables) {
        if (m === ignore) continue;
        const c = m.box;
        const cx = Math.max(c.minX, Math.min(x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
        const dx = x - cx;
        const dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        }
      }
      this._query(this.colHash, this.colStamp, x - r, x + r, z - r, z + r, (i) => {
        const c = this.colliders[i];
        if (c.h < 0.25) return false;
        const cx = Math.max(c.minX, Math.min(x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
        const dx = x - cx;
        const dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            x = cx + (dx / d) * r;
            z = cz + (dz / d) * r;
          } else {
            const pen = [x - c.minX, c.maxX - x, z - c.minZ, c.maxZ - z];
            const k = pen.indexOf(Math.min(...pen));
            if (k === 0) x = c.minX - r;
            else if (k === 1) x = c.maxX + r;
            else if (k === 2) z = c.minZ - r;
            else z = c.maxZ + r;
          }
        }
        return false;
      });
    }
    const b = this.bounds;
    x = Math.max(b.minX + r, Math.min(b.maxX - r, x));
    z = Math.max(b.minZ + r, Math.min(b.maxZ - r, z));
    return { x, z };
  }

  blockedPoint(x, z, r) {
    if (!this.colHash) this.buildHashes();
    const b = this.bounds;
    if (x < b.minX + r || x > b.maxX - r || z < b.minZ + r || z > b.maxZ - r) return true;
    return this._query(this.colHash, this.colStamp, x - r, x + r, z - r, z + r, (i) => {
      const c = this.colliders[i];
      return c.h >= 0.25 && x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r;
    });
  }

  segmentClear(x1, z1, x2, z2, r = 0.3) {
    const d = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(2, Math.ceil(d / 0.25));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (this.blockedPoint(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, r)) return false;
    }
    return true;
  }

  // ---- sight -----------------------------------------------------------
  /** Distance along the ray (o + d*t) to the first sight blocker, or Infinity. d must be normalized. */
  rayHit(ox, oy, oz, dx, dy, dz, maxT, ignore = null) {
    if (!this.occHash) this.buildHashes();
    const ex = ox + dx * maxT;
    const ez = oz + dz * maxT;
    let best = Infinity;
    this._query(this.occHash, this.occStamp, Math.min(ox, ex), Math.max(ox, ex), Math.min(oz, ez), Math.max(oz, ez), (i) => {
      const b = this.occ[i];
      let t0 = 0;
      let t1 = maxT;
      const axes = [
        [ox, dx, b.minX, b.maxX],
        [oy, dy, b.minY, b.maxY],
        [oz, dz, b.minZ, b.maxZ],
      ];
      for (const [o, d, lo, hi] of axes) {
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) return false;
        } else {
          let ta = (lo - o) / d;
          let tb = (hi - o) / d;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) return false;
        }
      }
      if (t0 < best) best = t0;
      return false;
    });
    for (const m of this.movables) {
      if (m === ignore) continue;
      const b = m.box;
      let t0 = 0;
      let t1 = maxT;
      let hit = true;
      for (const [o, d, lo, hi] of [[ox, dx, b.minX, b.maxX], [oy, dy, b.minY, b.maxY], [oz, dz, b.minZ, b.maxZ]]) {
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) hit = false;
        } else {
          let ta = (lo - o) / d;
          let tb = (hi - o) / d;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) hit = false;
        }
        if (!hit) break;
      }
      if (hit && t0 < best) best = t0;
    }
    return best;
  }

  lineOfSight(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return this.rayHit(a.x, a.y, a.z, dx / d, dy / d, dz / d, d - 0.12) === Infinity;
  }

  // ---- navigation ------------------------------------------------------
  buildNav(step = 0.8, r = 0.32) {
    if (!this.colHash) this.buildHashes();
    const b = this.bounds;
    const nx = Math.floor((b.maxX - b.minX) / step);
    const nz = Math.floor((b.maxZ - b.minZ) / step);
    const nodes = [];
    const idx = new Map();
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= nz; j++) {
        const x = b.minX + i * step;
        const z = b.minZ + j * step;
        if (!this.blockedPoint(x, z, r)) {
          idx.set(i * 10000 + j, nodes.length);
          nodes.push({ x, z, i, j, n: [] });
        }
      }
    }
    for (const node of nodes) {
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const k = idx.get((node.i + di) * 10000 + node.j + dj);
          if (k === undefined) continue;
          const o = nodes[k];
          if (di && dj) {
            // diagonal: both orthogonal neighbours must exist
            if (idx.get((node.i + di) * 10000 + node.j) === undefined || idx.get(node.i * 10000 + node.j + dj) === undefined) continue;
          }
          node.n.push(k);
          void o;
        }
      }
    }
    this.nav = { nodes, step, r, idx };
  }

  nearestNode(x, z) {
    const { step, idx, nodes } = this.nav;
    const b = this.bounds;
    const ci = Math.round((x - b.minX) / step);
    const cj = Math.round((z - b.minZ) / step);
    let best = -1;
    let bd = Infinity;
    for (let rad = 0; rad < 8 && best < 0; rad++) {
      for (let di = -rad; di <= rad; di++)
        for (let dj = -rad; dj <= rad; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== rad) continue;
          const k = idx.get((ci + di) * 10000 + cj + dj);
          if (k === undefined) continue;
          const d = (nodes[k].x - x) ** 2 + (nodes[k].z - z) ** 2;
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
    }
    return best;
  }

  findPath(x1, z1, x2, z2) {
    if (Math.hypot(x2 - x1, z2 - z1) < 12 && this.segmentClear(x1, z1, x2, z2, 0.3)) return [{ x: x2, z: z2 }];
    if (!this.nav) return [{ x: x2, z: z2 }];
    const nodes = this.nav.nodes;
    const s = this.nearestNode(x1, z1);
    const g = this.nearestNode(x2, z2);
    if (s < 0 || g < 0) return [{ x: x2, z: z2 }];
    const came = new Map();
    const gS = new Map([[s, 0]]);
    const open = new Heap();
    open.push(s, 0);
    const closed = new Set();
    const gx = nodes[g].x;
    const gz = nodes[g].z;
    let guard = 0;
    while (open.size && guard++ < 20000) {
      const cur = open.pop();
      if (cur === g) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      const cn = nodes[cur];
      for (const nb of cn.n) {
        if (closed.has(nb)) continue;
        const o = nodes[nb];
        const t = gS.get(cur) + (o.x !== cn.x && o.z !== cn.z ? 1.414 : 1);
        if (t < (gS.has(nb) ? gS.get(nb) : Infinity)) {
          came.set(nb, cur);
          gS.set(nb, t);
          open.push(nb, t + Math.hypot(o.x - gx, o.z - gz) / this.nav.step);
        }
      }
    }
    if (!came.has(g) && g !== s) return null; // unreachable: never cut through walls
    const path = [];
    let k = g;
    while (k !== undefined && k !== s) {
      path.unshift({ x: nodes[k].x, z: nodes[k].z });
      k = came.get(k);
    }
    // only step off the grid onto the exact target if nothing is in the way
    const last = path.length ? path[path.length - 1] : nodes[s];
    if (this.segmentClear(last.x, last.z, x2, z2, 0.25)) path.push({ x: x2, z: z2 });
    // String pulling
    const out = [];
    let px = x1;
    let pz = z1;
    let i = 0;
    while (i < path.length) {
      let j = Math.min(path.length - 1, i + 14);
      while (j > i && !this.segmentClear(px, pz, path[j].x, path[j].z, 0.28)) j--;
      out.push(path[j]);
      px = path[j].x;
      pz = path[j].z;
      i = j + 1;
    }
    return out;
  }

  randomFreePoint(rng = Math.random, area = this.bounds) {
    for (let t = 0; t < 60; t++) {
      const x = area.minX + rng() * (area.maxX - area.minX);
      const z = area.minZ + rng() * (area.maxZ - area.minZ);
      if (!this.blockedPoint(x, z, 0.5)) return { x, z };
    }
    return { x: this.spawn.x, z: this.spawn.z };
  }

  update(dt, game) {
    for (const u of this.updaters) u(dt, game);
  }
}

/**
 * Places content authored in a local frame into a level, rotated by a multiple
 * of 90 degrees: world = origin + R(phi) * (x, z - zOff).
 */
export class Frame {
  constructor(L, ox, oz, phi, zOff = 0) {
    this.L = L;
    this.ox = ox;
    this.oz = oz;
    this.phi = phi;
    this.zOff = zOff;
    this.c = Math.round(Math.cos(phi));
    this.s = Math.round(Math.sin(phi));
    this.odd = Math.abs(this.s) === 1;
    const self = this;
    const tp = (arr) => ({ push: (...os) => os.forEach((o) => arr.push(self.tpt(o))) });
    this.pois = {
      get customerSpots() {
        return { push: (...os) => os.forEach((o) => { const t = self.tpt(o); L.pois.customerSpots.push(t); if (t.sit) L.seats.push(t); }) };
      },
      hideSpots: tp((L.pois.hideSpots ||= [])),
      workstations: tp((L.pois.workstations ||= [])),
      wander: tp((L.pois.wander ||= [])),
    };
  }
  tx(x, z) {
    const zz = z - this.zOff;
    return { x: this.ox + x * this.c + zz * this.s, z: this.oz - x * this.s + zz * this.c };
  }
  tpt(o) {
    const p = this.tx(o.x, o.z);
    const r = { ...o, x: p.x, z: p.z };
    if (o.yaw !== undefined) r.yaw = o.yaw + this.phi;
    return r;
  }
  box(x, z, w, d, h, color, opts = {}) {
    const p = this.tx(x, z);
    return this.L.box(p.x, p.z, this.odd ? d : w, this.odd ? w : d, h, color, opts);
  }
  floor(x, z, w, d, color, y) {
    const p = this.tx(x, z);
    return this.L.floor(p.x, p.z, this.odd ? d : w, this.odd ? w : d, color, y);
  }
  label(text, x, y, z, rotY = 0, opts) {
    const p = this.tx(x, z);
    return this.L.label(text, p.x, y, p.z, rotY + this.phi, opts);
  }
  chair(x, z, rotY = 0, color, seat = false) {
    const p = this.tx(x, z);
    this.L.chair(p.x, p.z, rotY + this.phi, color);
    if (seat) return this.L.seat(p.x, p.z, rotY + this.phi);
  }
  seat(x, z, yaw, label) {
    const p = this.tx(x, z);
    return this.L.seat(p.x, p.z, yaw + this.phi, label);
  }
  plant(x, z, s) {
    const p = this.tx(x, z);
    this.L.plant(p.x, p.z, s);
  }
  pickup(kind, x, z, y, rotY = 0) {
    const p = this.tx(x, z);
    return this.L.pickup(kind, p.x, p.z, y, rotY + this.phi);
  }
  hideSpot(x, z, room) {
    const p = this.tx(x, z);
    this.L.hideSpot(p.x, p.z, room);
  }
  interactable(id, x, z, label, opts) {
    const p = this.tx(x, z);
    return this.L.interactable(id, p.x, p.z, label, opts);
  }
  station(tag, x, z, yaw, label, room, opts) {
    const p = this.tx(x, z);
    return this.L.station(tag, p.x, p.z, yaw + this.phi, label, room, opts);
  }
  add(obj) {
    const p = this.tx(obj.position.x, obj.position.z);
    obj.position.x = p.x;
    obj.position.z = p.z;
    obj.rotation.y += this.phi;
    return this.L.add(obj);
  }
  setPoi(name, val) {
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = v && v.x !== undefined ? this.tpt(v) : v;
    this.L.pois[name] = out;
  }
}
