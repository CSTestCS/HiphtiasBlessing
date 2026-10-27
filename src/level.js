// Level building blocks: boxes with collision/occlusion, labels, interactables,
// and an automatic navigation grid for NPC path finding.
import * as THREE from 'three';

const mats = {};
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats[key]) {
    mats[key] = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...opts });
  }
  return mats[key];
}

export function textSprite(text, { color = '#ffffff', bg = 'rgba(0,0,0,0.55)', size = 48, scale = 0.6 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `bold ${size}px sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  c.width = w;
  c.height = size + 20;
  ctx.font = `bold ${size}px sans-serif`;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 12, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set((c.width / c.height) * scale, scale, 1);
  return s;
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
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry((c.width / c.height) * height, height),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  return m;
}

export class Level {
  constructor(name) {
    this.name = name;
    this.group = new THREE.Group();
    this.colliders = []; // {minX,maxX,minZ,maxZ,h}
    this.occluders = []; // meshes that block sight
    this.interactables = new Map(); // id -> {id,x,z,r,label,...}
    this.pois = {}; // named points / lists for NPCs
    this.bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
    this.spawn = { x: 0, z: 0, yaw: 0 };
    this.indoor = true;
    this.updaters = [];
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
    if (opts.collide !== false && y0 < 1.2) {
      this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: y0 + h });
    }
    if (opts.occlude !== false) this.occluders.push(m);
    return m;
  }

  /** Axis-aligned wall from (x1,z1) to (x2,z2). */
  wall(x1, z1, x2, z2, h = 2.8, color = '#e8e2d6', t = 0.2) {
    const w = Math.abs(x2 - x1) || t;
    const d = Math.abs(z2 - z1) || t;
    return this.box((x1 + x2) / 2, (z1 + z2) / 2, w + (x1 !== x2 ? t : 0), d + (z1 !== z2 ? t : 0), h, color);
  }

  floor(x, z, w, d, color, y = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + 0.001, z);
    m.receiveShadow = true;
    this.group.add(m);
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

  /** Simple chair (visual, low collision). */
  chair(x, z, rotY = 0, color = '#6d4c41') {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.45), mat(color));
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.06), mat(color));
    back.position.set(0, 0.72, -0.2);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), mat('#3e2723'));
    legs.position.y = 0.21;
    legs.scale.set(1, 1, 1);
    g.add(seat, back, legs);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.group.add(g);
    return g;
  }

  plant(x, z, s = 1) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.17 * s, 0.4 * s, 12), mat('#a0522d'));
    pot.position.set(x, 0.2 * s, z);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4 * s, 1), mat('#2e8b57'));
    leaves.position.set(x, 0.75 * s, z);
    [pot, leaves].forEach((m) => {
      m.castShadow = true;
      this.group.add(m);
    });
    this.colliders.push({ minX: x - 0.25 * s, maxX: x + 0.25 * s, minZ: z - 0.25 * s, maxZ: z + 0.25 * s, h: 1 });
    this.occluders.push(leaves);
  }

  // ---- collision -------------------------------------------------------

  /** Push a circle (x,z,r) out of all colliders. Returns corrected {x,z}. */
  resolve(x, z, r) {
    for (let iter = 0; iter < 3; iter++) {
      for (const c of this.colliders) {
        if (c.h < 0.25) continue;
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
            // Center inside box: push out along the smallest axis.
            const pen = [x - c.minX, c.maxX - x, z - c.minZ, c.maxZ - z];
            const i = pen.indexOf(Math.min(...pen));
            if (i === 0) x = c.minX - r;
            else if (i === 1) x = c.maxX + r;
            else if (i === 2) z = c.minZ - r;
            else z = c.maxZ + r;
          }
        }
      }
    }
    const b = this.bounds;
    x = Math.max(b.minX + r, Math.min(b.maxX - r, x));
    z = Math.max(b.minZ + r, Math.min(b.maxZ - r, z));
    return { x, z };
  }

  blockedPoint(x, z, r) {
    for (const c of this.colliders) {
      if (c.h < 0.25) continue;
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    const b = this.bounds;
    return x < b.minX + r || x > b.maxX - r || z < b.minZ + r || z > b.maxZ - r;
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

  // ---- navigation ------------------------------------------------------

  buildNav(step = 1.0, r = 0.35) {
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
          idx.set(i + ',' + j, nodes.length);
          nodes.push({ x, z, i, j, n: [] });
        }
      }
    }
    for (const node of nodes) {
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const k = idx.get(node.i + di + ',' + (node.j + dj));
          if (k === undefined) continue;
          const o = nodes[k];
          if (this.segmentClear(node.x, node.z, o.x, o.z, r * 0.9)) node.n.push(k);
        }
      }
    }
    this.nav = { nodes, step, r };
  }

  nearestNode(x, z) {
    let best = -1;
    let bd = Infinity;
    const nodes = this.nav.nodes;
    for (let k = 0; k < nodes.length; k++) {
      const d = (nodes[k].x - x) ** 2 + (nodes[k].z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }

  /** A* path from (x1,z1) to (x2,z2). Returns list of {x,z}. */
  findPath(x1, z1, x2, z2) {
    if (this.segmentClear(x1, z1, x2, z2, 0.3)) return [{ x: x2, z: z2 }];
    if (!this.nav) return [{ x: x2, z: z2 }];
    const nodes = this.nav.nodes;
    const s = this.nearestNode(x1, z1);
    const g = this.nearestNode(x2, z2);
    if (s < 0 || g < 0) return [{ x: x2, z: z2 }];
    const open = new Set([s]);
    const came = new Map();
    const gS = new Map([[s, 0]]);
    const fS = new Map([[s, 0]]);
    const h = (k) => Math.hypot(nodes[k].x - nodes[g].x, nodes[k].z - nodes[g].z);
    let guard = 0;
    while (open.size && guard++ < 6000) {
      let cur = -1;
      let bf = Infinity;
      for (const k of open) {
        const f = fS.get(k);
        if (f < bf) {
          bf = f;
          cur = k;
        }
      }
      if (cur === g) break;
      open.delete(cur);
      for (const nb of nodes[cur].n) {
        const t = gS.get(cur) + Math.hypot(nodes[cur].x - nodes[nb].x, nodes[cur].z - nodes[nb].z);
        if (t < (gS.has(nb) ? gS.get(nb) : Infinity)) {
          came.set(nb, cur);
          gS.set(nb, t);
          fS.set(nb, t + h(nb));
          open.add(nb);
        }
      }
    }
    const path = [];
    let k = g;
    if (!came.has(g) && g !== s) return [{ x: x2, z: z2 }];
    while (k !== undefined && k !== s) {
      path.unshift({ x: nodes[k].x, z: nodes[k].z });
      k = came.get(k);
    }
    path.push({ x: x2, z: z2 });
    // String pulling: skip nodes we can see past.
    const out = [];
    let px = x1;
    let pz = z1;
    let i = 0;
    while (i < path.length) {
      let j = path.length - 1;
      while (j > i && !this.segmentClear(px, pz, path[j].x, path[j].z, 0.3)) j--;
      out.push(path[j]);
      px = path[j].x;
      pz = path[j].z;
      i = j + 1;
    }
    return out;
  }

  randomFreePoint(rng = Math.random, area = this.bounds) {
    for (let t = 0; t < 50; t++) {
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
