// NPCs: coworkers, customers and pedestrians. Each one walks around, looks
// around, and has a cone of vision used for stealth detection.
import * as THREE from 'three';

const coneMatBase = new THREE.MeshBasicMaterial({
  color: 0xfff3a0,
  transparent: true,
  opacity: 0.13,
  depthWrite: false,
  side: THREE.DoubleSide,
});

let uid = 0;
const angDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
export { angDiff };

export class NPC {
  constructor(game, char, o) {
    this.id = ++uid;
    this.game = game;
    this.char = char;
    this.kind = o.kind; // coworker | customer | pedestrian
    this.name = o.name || '';
    this.personality = o.personality || null;
    this.index = o.index ?? -1;
    this.station = o.station || null;
    this.loop = o.loop || null;
    this.loopIdx = o.loopIdx || 0;
    this.spot = o.spot || null;
    this.legwearType = o.legwearType || 'pants';
    this.x = o.x;
    this.z = o.z;
    this.yaw = o.yaw || 0;
    this.lookYaw = this.yaw;
    this.speed = o.speed || 1.25;
    this.range = o.range || 12;
    this.fov = o.fov || (110 * Math.PI) / 180;
    this.eyeH = (char.eyeHeight || 1.5) * 0.98;
    this.suspicion = 0;
    this.noticeCooldown = 0;
    this.state = 'idle';
    this.timer = 1 + Math.random() * 3;
    this.path = [];
    this.seed = Math.random() * 100;
    this.curSpeed = 0;
    this.vision = true;
    this.sitting = false;
    this.removed = false;
    this.onArrive = null;
    char.root.position.set(this.x, 0, this.z);
    char.root.rotation.y = this.yaw;

    const geo = new THREE.CircleGeometry(this.range, 28, -Math.PI / 2 - this.fov / 2, this.fov);
    geo.rotateX(-Math.PI / 2);
    this.coneMat = coneMatBase.clone();
    this.cone = new THREE.Mesh(geo, this.coneMat);
    this.cone.position.y = 0.03;
    this.cone.renderOrder = 2;
    this.cone.visible = false;
    game.scene.add(this.cone);
    game.scene.add(char.root);

    this.el = document.createElement('div');
    this.el.className = 'npc-tag';
    game.ui.tagLayer.appendChild(this.el);
  }

  destroy() {
    this.removed = true;
    this.game.scene.remove(this.cone);
    this.game.scene.remove(this.char.root);
    this.cone.geometry.dispose();
    this.el.remove();
  }

  goTo(x, z, onArrive) {
    const L = this.game.level;
    this.path = L.findPath(this.x, this.z, x, z);
    this.state = 'walk';
    this.sitting = false;
    this.onArrive = onArrive || null;
  }

  // ---- behaviour --------------------------------------------------------
  think() {
    const g = this.game;
    const L = g.level;
    if (this.kind === 'coworker') {
      if (this.station && Math.random() < 0.55) {
        this.goTo(this.station.x, this.station.z, () => {
          this.state = 'idle';
          this.baseYaw = this.station.yaw;
          this.yaw = this.station.yaw;
          this.timer = 7 + Math.random() * 9;
        });
      } else {
        const w = L.pois.wander || [];
        const p = w[Math.floor(Math.random() * w.length)] || L.randomFreePoint();
        this.goTo(p.x, p.z, () => {
          this.state = 'idle';
          this.baseYaw = this.yaw;
          this.timer = 3 + Math.random() * 4;
        });
      }
    } else if (this.kind === 'customer') {
      if (this.leaving) return;
      const e = L.pois.entrance;
      if (!e) return;
      this.leaving = true;
      if (this.spot) this.spot.taken = false;
      this.goTo(e.x, e.z, () => this.game.removeNPC(this));
    } else if (this.kind === 'pedestrian') {
      if (this.loop) {
        this.loopIdx = (this.loopIdx + 1) % this.loop.length;
        const p = this.loop[this.loopIdx];
        this.path = [{ x: p.x + (Math.random() - 0.5) * 0.8, z: p.z + (Math.random() - 0.5) * 0.8 }];
        this.state = 'walk';
        this.onArrive = () => {
          if (Math.random() < 0.25) {
            this.state = 'idle';
            this.baseYaw = this.yaw;
            this.timer = 2 + Math.random() * 4;
          } else this.think();
        };
      } else {
        this.state = 'idle';
        this.timer = 999;
      }
    }
  }

  sitAt(spot, duration) {
    this.spot = spot;
    spot.taken = true;
    this.goTo(spot.x, spot.z, () => {
      this.x = spot.x;
      this.z = spot.z;
      this.yaw = spot.yaw;
      this.baseYaw = spot.yaw;
      this.sitting = !!spot.sit;
      this.state = 'idle';
      this.timer = duration;
    });
  }

  startInvestigate(x, z) {
    if (this.state === 'hiding' || this.state === 'talk') return;
    this.sitting = false;
    this.goTo(x, z, () => {
      this.state = 'idle';
      this.baseYaw = this.yaw;
      this.timer = 3;
    });
    this.state = 'investigate';
    this.speedMul = 1.35;
  }

  distract(x, z, t) {
    if (this.state === 'hiding' || this.state === 'talk') return;
    this.distractPoint = { x, z };
    this.prevState = this.state === 'distracted' ? this.prevState : this.state;
    this.state = 'distracted';
    this.timer = t;
  }

  hideAt(p) {
    this.vision = false;
    this.goTo(p.x, p.z, () => {
      this.state = 'hiding';
      this.timer = 9999;
    });
    this.state = 'goHide';
  }

  unhide() {
    this.vision = true;
    this.state = 'idle';
    this.timer = 0.5;
  }

  // ---- per-frame -------------------------------------------------------
  update(dt, t) {
    const g = this.game;
    this.noticeCooldown = Math.max(0, this.noticeCooldown - dt);
    let moving = false;
    const p = g.player;
    const dxp = p.x - this.x;
    const dzp = p.z - this.z;
    const toPlayer = Math.atan2(dxp, dzp);
    const alerted = this.suspicion > 0.22 && this.vision && this.state !== 'talk';

    if (this.state === 'talk') {
      this.lookYaw = toPlayer;
      this.yaw += angDiff(toPlayer, this.yaw) * Math.min(1, dt * 6);
    } else if (this.state === 'distracted') {
      const d = this.distractPoint;
      const a = Math.atan2(d.x - this.x, d.z - this.z);
      this.lookYaw = a + Math.sin(t * 0.7 + this.seed) * 0.15;
      this.yaw += angDiff(a, this.yaw) * Math.min(1, dt * 4);
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = this.path.length ? 'walk' : 'idle';
        this.timer = 1;
      }
    } else if (alerted) {
      // Something caught their eye: stop and stare.
      this.lookYaw = toPlayer;
      this.yaw += angDiff(toPlayer, this.yaw) * Math.min(1, dt * 3);
    } else if ((this.state === 'walk' || this.state === 'investigate' || this.state === 'goHide') && this.path.length) {
      const wp = this.path[0];
      const dx = wp.x - this.x;
      const dz = wp.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25) {
        this.path.shift();
        if (!this.path.length) {
          this.speedMul = 1;
          const cb = this.onArrive;
          this.onArrive = null;
          if (this.state === 'walk' || this.state === 'investigate' || this.state === 'goHide') this.state = 'idle';
          if (cb) cb();
          else this.timer = 2;
        }
      } else {
        const sp = this.speed * (this.speedMul || 1);
        const step = Math.min(d, sp * dt);
        this.x += (dx / d) * step;
        this.z += (dz / d) * step;
        const a = Math.atan2(dx, dz);
        this.yaw += angDiff(a, this.yaw) * Math.min(1, dt * 8);
        this.lookYaw = this.yaw + Math.sin(t * 0.9 + this.seed) * 0.25;
        moving = true;
      }
    } else if (this.state === 'hiding') {
      this.lookYaw = this.yaw;
    } else {
      // idle: look around
      if (this.baseYaw === undefined) this.baseYaw = this.yaw;
      this.lookYaw = this.baseYaw + Math.sin(t * 0.45 + this.seed) * 1.0;
      this.yaw += angDiff(this.sitting ? this.baseYaw : this.lookYaw, this.yaw) * Math.min(1, dt * 2);
      this.timer -= dt;
      if (this.timer <= 0) this.think();
    }

    this.curSpeed += ((moving ? this.speed * (this.speedMul || 1) : 0) - this.curSpeed) * Math.min(1, dt * 10);
    this.char.root.position.set(this.x, 0, this.z);
    this.char.root.rotation.y = this.yaw;
    this.char.update(dt, { speed: this.curSpeed, sit: this.sitting && !moving, crouch: false, carry: false, cover: !this.char.legwearOn });
    this.cone.position.x = this.x;
    this.cone.position.z = this.z;
    this.cone.rotation.y = this.lookYaw;
  }

  eye() {
    const h = this.sitting ? this.eyeH * 0.72 : this.eyeH;
    return new THREE.Vector3(this.x, h, this.z);
  }

  updateConeVisual(show) {
    this.cone.visible = show && this.vision && this.state !== 'hiding' && this.state !== 'goHide';
    const s = Math.min(1, this.suspicion);
    this.coneMat.color.setRGB(1, 0.95 - s * 0.75, 0.62 - s * 0.6);
    this.coneMat.opacity = 0.11 + s * 0.22;
  }
}
