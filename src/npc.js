// NPCs: coworkers, the manager, customers and pedestrians. Each one runs a
// queue of activity steps (walk somewhere, work at a station, sit, hide...),
// looks around, and has a cone of vision used for stealth detection.
import * as THREE from 'three';
import { propMesh } from './props.js';
export { propMesh };

const coneMatBase = new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide });
const CONE_RAYS = 28;

let uid = 0;
export const angDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const angDiffLocal = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class NPC {
  constructor(game, char, o) {
    this.id = ++uid;
    this.game = game;
    this.char = char;
    this.kind = o.kind;
    this.name = o.name || '';
    this.personality = o.personality || null;
    this.gender = o.gender || char.gender || null;
    this.index = o.index ?? -1;
    this.station = o.station || null;
    this.legwearType = o.legwearType || 'pants';
    this.x = o.x;
    this.z = o.z;
    this.yaw = o.yaw || 0;
    this.lookYaw = this.yaw;
    this.baseYaw = this.yaw;
    this.speed = o.speed || 1.6;
    this.range = o.range || 12;
    this.fov = o.fov || Math.PI; // 180 degrees
    this.eyeH = (char.eyeHeight || 1.5) * 0.98;
    this.suspicion = 0; // toward the player
    this.npcSusp = new Map(); // toward sneaking NPCs
    this.noticeCooldown = 0;
    this.steps = [];
    this.cur = null;
    this.path = [];
    this.seed = Math.random() * 100;
    this.curSpeed = 0;
    this.vision = o.vision !== false;
    this.sitting = false;
    this.crouch = false;
    this.working = false;
    this.removed = false;
    this.sneaking = false;
    this.watchedT = 0;
    this.glanceT = 2 + Math.random() * 5;
    this.bubbleT = 0;
    this.carry = null;
    this.state = 'idle';
    char.root.position.set(this.x, 0, this.z);
    char.root.rotation.y = this.yaw;
    if (this.vision) {
      // fan of triangles whose edge is clipped by walls (rebuilt while visible)
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CONE_RAYS + 2) * 3), 3));
      const idx = [];
      for (let i = 0; i < CONE_RAYS; i++) idx.push(0, i + 1, i + 2);
      geo.setIndex(idx);
      this.coneMat = coneMatBase.clone();
      this.cone = new THREE.Mesh(geo, this.coneMat);
      this.cone.frustumCulled = false;
      this.coneT = 0;
      this.cone.position.y = 0.03;
      this.cone.renderOrder = 2;
      this.cone.visible = false;
      game.scene.add(this.cone);
    }
    game.scene.add(char.root);
    this.el = document.createElement('div');
    this.el.className = 'npc-tag';
    game.ui.tagLayer.appendChild(this.el);
  }

  /** Replace this person's body (used when a stand-in is swapped for a loaded model). */
  swapChar(ch) {
    const old = this.char;
    old.root.removeFromParent();
    old.setProp(null);
    this.char = ch;
    if (!this.gender || old.placeholder) this.gender = ch.gender || this.gender;
    this.eyeH = (ch.eyeHeight || 1.5) * 0.98;
    ch.root.position.set(this.x, 0, this.z);
    ch.root.rotation.y = this.yaw;
    if (this.carry) ch.setProp(propMesh(this.carry));
    if (old.mood) ch.setMood(old.mood);
    this.game.scene.add(ch.root);
    old.dispose?.();
  }

  destroy() {
    this.removed = true;
    if (this.cone) {
      this.game.scene.remove(this.cone);
      this.cone.geometry.dispose();
    }
    this.game.scene.remove(this.char.root);
    this.char.setProp(null);
    this.el.remove();
  }

  // ---- activity queue ----------------------------------------------------
  plan(steps) {
    // let go of a cart if the new plan doesn't involve pushing it
    if (this.pushing && !(steps[0] && (steps[0].keepPush || steps[0].call))) {
      this.pushing.holder = null;
      this.pushing = null;
    }
    this.steps = steps;
    this.cur = null;
    this.path = [];
    this.next();
  }

  next() {
    this.cur = this.steps.shift() || null;
    this.sitting = false;
    this.working = false;
    if (!this.cur) {
      this.brain();
      return;
    }
    const s = this.cur;
    if (s.go && !s.evade && this.sneaking && this.game.sneakDestBad?.(this, s.go)) {
      // somewhere a watcher would see: skip this errand (up to the next destination)
      this.skips = (this.skips || 0) + 1;
      if (this.skips < 4) {
        const k = this.steps.findIndex((x) => x.go);
        this.steps = k >= 0 ? this.steps.slice(k) : [];
        return this.next();
      }
    } else if (s.go) this.skips = 0;
    if (s.go) {
      const path = this.game.level.findPath(this.x, this.z, s.go.x, s.go.z);
      if (!path) {
        // can't get there from here: skip this step instead of walking through walls
        this.path = [];
        this.state = 'idle';
        this.timer = 0.3;
        this.cur = { t: 0.3 };
        return;
      }
      this.path = path;
      this.state = 'walk';
    } else {
      this.state = s.sit ? 'sit' : s.hide ? 'hiding' : s.work ? 'work' : 'idle';
      this.timer = s.t ?? 2;
      if (s.yaw !== undefined) this.baseYaw = s.yaw;
      if (s.sit) this.sitting = true;
      if (s.work) {
        this.working = true;
        this.workKind = s.act || this.game.workKindAt(this.x, this.z);
      }
      if (s.hide) this.vision = false;
    }
    if (s.carry) this.setCarry(s.carry);
    this.lowCover = !!s.lowCover;
    if (s.run) this.speedMul = 1.45;
    else if (s.go && this.speedMul === 1.45) this.speedMul = 1;
    if (s.call) s.call();
  }

  setCarry(kind) {
    this.carry = kind || null;
    this.char.setProp(kind ? propMesh(kind) : null);
  }

  brain() {
    const g = this.game;
    const L = g.level;
    // carrying a request to the player: the game's delivery logic decides the next move
    if (this.delivering && !(this.delivering.waitT > 0)) return this.plan([{ t: 0.1 }]);
    if (this.checkingIn) return this.plan([{ t: 0.1 }]);
    if (this.kind === 'coworker') return g.coworkerBrain(this);
    if (this.kind === 'manager') return g.managerBrain(this);
    if (this.kind === 'customer') {
      if (this.leaving) return;
      this.leaving = true;
      if (this.spot) this.spot.taken = false;
      const e = L.pois.entrance;
      if (!e) return;
      this.plan([{ go: e }, { call: () => g.removeNPC(this) }]);
      return;
    }
    if (this.kind === 'pedestrian') return g.pedestrianBrain(this);
    this.plan([{ t: 3 }]);
  }

  goTo(x, z, then = []) {
    this.plan([{ go: { x, z } }, ...then]);
  }

  startInvestigate(x, z) {
    if (['hiding', 'talk'].includes(this.state) || this.sneaking) return;
    this.speedMul = 1.35;
    this.plan([{ go: { x, z } }, { t: 3, call: () => (this.speedMul = 1) }]);
  }

  distract(x, z, t) {
    if (['hiding', 'talk'].includes(this.state)) return;
    this.distractPoint = { x, z };
    this.distractT = t;
  }

  hideAt(p, t = 9999) {
    this.plan([{ go: p }, { hide: true, t }]);
  }

  unhide() {
    this.vision = true;
    this.plan([{ t: 0.5 }]);
  }

  // ---- per-frame -------------------------------------------------------
  update(dt, t) {
    const g = this.game;
    this.noticeCooldown = Math.max(0, this.noticeCooldown - dt);
    this.watchedT = Math.max(0, this.watchedT - dt);
    if (this.bubbleT > 0) this.bubbleT -= dt;
    let moving = false;
    const p = g.player;
    // most suspicious target (player or a sneaking coworker)
    let tgt = null;
    let ts = 0.22;
    if (this.suspicion > ts) {
      tgt = p;
      ts = this.suspicion;
    }
    for (const [n, s] of this.npcSusp) if (s > ts && !n.removed) {
      tgt = n;
      ts = s;
    }
    const toT = tgt ? Math.atan2(tgt.x - this.x, tgt.z - this.z) : 0;
    const s = this.cur;

    if (this.state === 'talk') {
      const a = Math.atan2(p.x - this.x, p.z - this.z);
      this.lookYaw = a;
      this.yaw += angDiff(a, this.yaw) * Math.min(1, dt * 6);
    } else if (this.distractT > 0) {
      this.distractT -= dt;
      const d = this.distractPoint;
      const a = Math.atan2(d.x - this.x, d.z - this.z);
      this.lookYaw = a + Math.sin(t * 0.7 + this.seed) * 0.15;
      this.yaw += angDiff(a, this.yaw) * Math.min(1, dt * 4);
    } else if (tgt && this.vision && !this.sneaking) {
      this.lookYaw = toT;
      this.yaw += angDiff(toT, this.yaw) * Math.min(1, dt * 3);
    } else if (this.state === 'walk' && this.path.length) {
      // sneakers freeze and crouch while someone is watching them
      {
        const wp = this.path[0];
        const dx = wp.x - this.x;
        const dz = wp.z - this.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.25) {
          this.path.shift();
          if (!this.path.length) this.next();
        } else {
          const sp = this.speed * (this.speedMul || 1) * (this.crouch ? 0.55 : 1) * (this.faceYaw != null ? 0.7 : 1);
          const step = Math.min(d, sp * dt);
          this.x += (dx / d) * step;
          this.z += (dz / d) * step;
          // a sneaker carrying something keeps it toward whoever might see, walking sideways if need be
          const a = this.faceYaw != null ? this.faceYaw : Math.atan2(dx, dz);
          this.yaw += angDiff(a, this.yaw) * Math.min(1, dt * 8);
          this.lookYaw = this.yaw + Math.sin(t * 0.9 + this.seed) * 0.3;
          moving = true;
        }
      }
    } else if (this.state === 'walk') {
      this.next();
    } else {
      // stationary step: work / sit / idle / hiding
      if (s && s.yaw !== undefined) this.yaw += angDiff(s.yaw, this.yaw) * Math.min(1, dt * 5);
      if (this.working) {
        // eyes on the work, with an occasional glance around
        this.glanceT -= dt;
        if (this.glanceT < 0) {
          const k = -this.glanceT;
          this.lookYaw = this.baseYaw + Math.sin(k * 2.2) * 1.3;
          if (k > 1.6) this.glanceT = 3 + Math.random() * 5;
        } else this.lookYaw = this.baseYaw;
      } else if (this.state === 'hiding') {
        this.lookYaw = this.yaw;
      } else {
        this.lookYaw = this.baseYaw + Math.sin(t * 0.45 + this.seed) * 1.0;
        if (!this.sitting) this.yaw += angDiff(this.lookYaw, this.yaw) * Math.min(1, dt * 1.5);
      }
      this.timer -= dt;
      if (this.timer <= 0) {
        if (s && s.hide) this.vision = true;
        if (s && s.drop) this.setCarry(this.keepCarry || null);
        this.next();
      }
    }

    // sneakers crouch only where it helps: behind low cover or while hiding
    this.crouch = this.sneaking && ((this.lowCover && !moving) || this.state === 'hiding' || (this.lowCover && this.cur && this.cur.go && this.path.length <= 1) || (this.sneakCrouch && moving && !(this.cur && this.cur.run)));
    this.curSpeed += ((moving ? this.speed * (this.speedMul || 1) * (this.crouch ? 0.55 : 1) * (this.faceYaw != null ? 0.7 : 1) : 0) - this.curSpeed) * Math.min(1, dt * 10);
    if (this.pushing && moving) {
      const m = this.pushing;
      const tg = g.level.pushTarget(m, this.x, this.z, this.yaw);
      g.level.placeMovable(m, tg.x, tg.z, tg.yaw);
    }
    this.char.root.position.set(this.x, 0, this.z);
    this.char.root.rotation.y = this.yaw;
    // off-screen characters keep thinking but skip skinning/animation work
    if (this.inView !== false) this.char.update(dt, {
      speed: this.curSpeed,
      sit: this.sitting && !moving,
      crouch: this.crouch,
      carry: !!this.carry || !!this.pushing,
      work: this.working && !moving && !this.carry,
      workKind: this.workKind,
      push: !!this.pushing,
      talk: this.bubbleT > 0 || this.state === 'talk',
      headYaw: Math.max(-1, Math.min(1, angDiffLocal(this.lookYaw, this.yaw))),
      cover: !this.char.legwearOn,
    });
    if (this.cone && this.cone.visible) {
      this.cone.position.x = this.x;
      this.cone.position.z = this.z;
      this.coneT -= dt;
      if (this.coneT <= 0) {
        this.coneT = 0.12;
        this.rebuildCone();
      }
    }
  }

  /** Rays from the eyes (at about hip height) out to the view range, stopped by walls and tall furniture. */
  rebuildCone() {
    const L = this.game.level;
    const pos = this.cone.geometry.attributes.position;
    const a = pos.array;
    a[0] = a[1] = a[2] = 0;
    const range = this.range * (this.game.outdoors && this.game.isRaining ? 0.75 : 1);
    for (let i = 0; i <= CONE_RAYS; i++) {
      const ang = this.lookYaw - this.fov / 2 + (this.fov * i) / CONE_RAYS;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      let d = L ? L.rayHit(this.x, 1.05, this.z, dx, 0, dz, range) : range;
      if (!(d < range)) d = range;
      const o = (i + 1) * 3;
      a[o] = dx * d;
      a[o + 1] = 0;
      a[o + 2] = dz * d;
    }
    pos.needsUpdate = true;
    this.cone.geometry.computeBoundingSphere();
  }

  eye() {
    const h = this.sitting ? this.eyeH * 0.72 : this.crouch ? this.eyeH * 0.62 : this.eyeH;
    return new THREE.Vector3(this.x, h, this.z);
  }

  hip() {
    return new THREE.Vector3(this.x, this.char.hipHeight * (this.crouch ? 0.55 : this.sitting ? 0.55 : 1), this.z);
  }

  canSee() {
    return this.vision && this.state !== 'hiding' && this.state !== 'talk';
  }

  updateConeVisual(show) {
    if (!this.cone) return;
    this.cone.visible = show && this.canSee();
    let s = this.suspicion;
    for (const v of this.npcSusp.values()) s = Math.max(s, v * 0.6);
    s = Math.min(1, s);
    this.coneMat.color.setRGB(1, 0.95 - s * 0.75, 0.62 - s * 0.6);
    this.coneMat.opacity = 0.1 + s * 0.22;
  }
}

export { pick };
