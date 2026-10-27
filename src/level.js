// Level building blocks: boxes with collision/occlusion, labels, stations,
// fast sight-line tests (box ray casts with a spatial hash), mesh merging,
// and an automatic navigation grid with A* for NPC path finding.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  }

  add(obj) {
    this.group.add(obj);
    return obj;
  }

  /** Box centered at (x,z) with size w (x) by d (z) and height h. */
  box(x, z, w, d, h, color, opts = {}) {
    const y0 = opts.y || 0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), opts.material || mat(color, opts.matOpts));
    m.position.set(x, y0 + h / 2, z);
    if (opts.rotY) m.rotation.y = opts.rotY;
    m.castShadow = opts.shadow !== false;
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
  resolve(x, z, r) {
    if (!this.colHash) this.buildHashes();
    for (let iter = 0; iter < 3; iter++) {
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
  rayHit(ox, oy, oz, dx, dy, dz, maxT) {
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
    if (!came.has(g) && g !== s) return [{ x: x2, z: z2 }];
    const path = [];
    let k = g;
    while (k !== undefined && k !== s) {
      path.unshift({ x: nodes[k].x, z: nodes[k].z });
      k = came.get(k);
    }
    path.push({ x: x2, z: z2 });
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
