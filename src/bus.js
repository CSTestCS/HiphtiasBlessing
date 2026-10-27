// Buses: follow their line's loop, stop at every stop, passengers get on and off.
// Passengers are only spawned as 3D characters when the bus is near the player.
import * as THREE from 'three';
import { mat } from './level.js';
import { angDiff } from './npc.js';

const ROWS = 9;
// double seats along one side only; the other side is standing room (keeps buses light)
const SEAT_X = [1.05, 0.55];
const DOOR = { x: -1.05, z: 3.9 };
const CAPACITY = ROWS * SEAT_X.length;
const MAX_STANDING = 7;

export class BusSystem {
  constructor(game, city) {
    this.game = game;
    this.city = city;
    this.buses = [];
    for (const line of city.lines) {
      for (let k = 0; k < 2; k++) {
        const b = new Bus(game, line, (line.total / 2) * k + Math.random() * 40);
        this.buses.push(b);
      }
    }
  }
  update(dt) {
    for (const b of this.buses) b.update(dt);
  }
  dispose() {
    for (const b of this.buses) b.dispose();
    this.buses = [];
  }
}

export class Bus {
  constructor(game, line, s) {
    this.game = game;
    this.line = line;
    this.s = s;
    this.speed = 0;
    this.maxSpeed = 11;
    this.state = 'drive';
    this.dwell = 0;
    this.blockedT = 0;
    this.ignoreT = 0;
    this.nextStop = line.stops.findIndex((st) => st.s > s);
    if (this.nextStop < 0) this.nextStop = 0;
    this.pax = Math.floor(CAPACITY * 0.5);
    this.standing = 0;
    this.passengers = []; // materialized: {char, seat, stand, x, z, walk:[], mode}
    this.materialized = false;
    this.seats = [];
    for (let r = 0; r < ROWS; r++) {
      const z = 2.4 - r * 0.95;
      SEAT_X.forEach((x, i) => this.seats.push({ x, z, row: r, side: 'L', window: i === 0, occ: null }));
    }
    this.buildMesh();
    const p = line.at(s);
    this.group.position.set(p.x, 0, p.z);
    this.group.rotation.y = p.yaw;
    this.x = p.x;
    this.z = p.z;
    this.yaw = p.yaw;
  }

  buildMesh() {
    const g = (this.group = new THREE.Group());
    const add = (w, h, d, x, y, z, color, opts = {}) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), opts.material || mat(color));
      m.position.set(x, y, z);
      m.castShadow = opts.shadow !== false;
      m.receiveShadow = true;
      if (m.material.transparent) m.renderOrder = 5;
      g.add(m);
      return m;
    };
    const col = this.line.color;
    add(2.9, 0.15, 11.4, 0, 0.12, 0, '#555555'); // floor
    // lower walls
    add(0.1, 0.9, 11.4, 1.42, 0.65, 0, col);
    add(0.1, 0.9, 7.8, -1.42, 0.65, -1.8, col); // right wall up to the door
    add(0.1, 0.9, 0.9, -1.42, 0.65, 5.25, col);
    add(2.9, 2.5, 0.1, 0, 1.3, -5.7, col); // back
    // windows (transparent)
    const glass = new THREE.MeshStandardMaterial({ color: '#aed6f1', transparent: true, opacity: 0.25, roughness: 0.1, depthWrite: false });
    add(0.05, 1.3, 11.4, 1.42, 1.75, 0, null, { material: glass, shadow: false });
    add(0.05, 1.3, 7.8, -1.42, 1.75, -1.8, null, { material: glass, shadow: false });
    add(2.9, 1.6, 0.05, 0, 1.6, 5.7, null, { material: glass, shadow: false }); // windshield
    add(2.9, 0.6, 0.1, 0, 0.5, 5.7, col);
    this.roof = add(2.95, 0.15, 11.5, 0, 2.48, 0, '#ecf0f1');
    // pillars
    for (const z of [-5.6, -2.8, 0, 2.8, 5.6]) {
      add(0.12, 2.4, 0.12, 1.42, 1.2, z, '#2d3436', { shadow: false });
      if (z < 3) add(0.12, 2.4, 0.12, -1.42, 1.2, z, '#2d3436', { shadow: false });
    }
    // wheels
    for (const [x, z] of [[1.3, 3.8], [-1.3, 3.8], [1.3, -3.8], [-1.3, -3.8]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12), mat('#111111'));
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.3, z);
      g.add(w);
    }
    // seats
    for (const s of this.seats) {
      add(0.45, 0.45, 0.45, s.x, 0.4, s.z, '#3d3d6b', { shadow: false });
      add(0.45, 0.55, 0.08, s.x, 0.85, s.z - 0.22, '#3d3d6b', { shadow: false });
    }
    // driver area
    add(0.5, 0.45, 0.5, 0.75, 0.4, 4.7, '#2d3436');
    add(0.9, 0.9, 0.3, 0.75, 0.6, 5.35, '#2d3436');
    // destination sign
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = '#ffb142';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.line.name.toUpperCase(), 256, 46);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.3), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(0, 2.25, 5.73);
    g.add(sign);
    this.game.scene.add(g);
  }

  dispose() {
    this.dematerialize();
    this.game.scene.remove(this.group);
  }

  get world() {
    return { x: this.x, z: this.z, yaw: this.yaw };
  }

  localToWorld(lx, lz) {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { x: this.x + lx * c + lz * s, z: this.z - lx * s + lz * c };
  }

  worldToLocal(x, z) {
    const dx = x - this.x;
    const dz = z - this.z;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  }

  stopAt(i) {
    return this.line.stops[((i % this.line.stops.length) + this.line.stops.length) % this.line.stops.length];
  }

  get currentStop() {
    return this.state === 'dwell' ? this.stopAt(this.nextStop) : null;
  }

  occupied() {
    return this.materialized ? this.passengers.length : this.pax + this.standing;
  }

  // ---- movement -------------------------------------------------------
  update(dt) {
    const g = this.game;
    const total = this.line.total;
    const player = g.player;
    const riding = player.bus === this;
    if (this.state === 'dwell') {
      this.dwell -= dt;
      // hold the doors a bit if the player is waiting at this stop
      const st = this.stopAt(this.nextStop);
      const waiting = !player.bus && Math.hypot(player.x - st.x, player.z - st.z) < 4.5;
      if (waiting && this.dwellHeld < 10) {
        this.dwellHeld += dt;
        this.dwell = Math.max(this.dwell, 0.5);
      }
      const busy = this.passengers.some((p) => p.walk.length);
      if (this.dwell <= 0 && !busy) {
        this.state = 'drive';
        this.nextStop = (this.nextStop + 1) % this.line.stops.length;
      }
    } else {
      const st = this.stopAt(this.nextStop);
      let ahead = (st.s - this.s + total) % total;
      if (ahead > total - 1) ahead = 0;
      let target = this.maxSpeed;
      if (ahead < 22) target = Math.max(1.2, Math.min(this.maxSpeed, ahead * 0.7));
      // blockers ahead (people, cars)
      if (this.ignoreT > 0) this.ignoreT -= dt;
      else if (this.blocked()) {
        target = 0;
        this.blockedT += dt;
        if (this.blockedT > 4) {
          this.ignoreT = 2;
          this.blockedT = 0;
        }
      } else this.blockedT = 0;
      this.speed += (target - this.speed) * Math.min(1, dt * (target < this.speed ? 3 : 1));
      const step = this.speed * dt;
      if (ahead <= step + 0.05 && ahead < 22) {
        this.s = st.s;
        this.speed = 0;
        this.arrive();
      } else this.s = (this.s + step) % total;
    }
    const p = this.line.at(this.s);
    this.x = p.x;
    this.z = p.z;
    this.yaw += angDiff(p.yaw, this.yaw) * Math.min(1, dt * 4);
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.yaw;
    this.roof.visible = !riding;

    // materialize passengers near the player
    const d = Math.hypot(player.x - this.x, player.z - this.z);
    if (!this.materialized && (riding || d < 38)) this.materialize();
    else if (this.materialized && !riding && d > 55) this.dematerialize();
    if (this.materialized) this.updatePassengers(dt);
  }

  blocked() {
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    for (const b of this.game.allBodies()) {
      if (b === this) continue;
      const dx = b.x - this.x;
      const dz = b.z - this.z;
      const along = dx * fx + dz * fz;
      if (along < 5.5 || along > 13) continue;
      const side = Math.abs(dx * fz - dz * fx);
      if (side < 1.8) return true;
    }
    for (const c of this.game.level.cars || []) {
      const cx = c.axis === 'z' ? c.lane : c.pos;
      const cz = c.axis === 'z' ? c.pos : c.lane;
      const dx = cx - this.x;
      const dz = cz - this.z;
      const along = dx * fx + dz * fz;
      if (along < 5 || along > 12) continue;
      if (Math.abs(dx * fz - dz * fx) < 1.6) return true;
    }
    return false;
  }

  arrive() {
    this.state = 'dwell';
    this.dwell = 5 + Math.random() * 2;
    this.dwellHeld = 0;
    const fill = this.game.busFill(this);
    const cap = CAPACITY + MAX_STANDING;
    const want = Math.max(0, Math.min(cap, Math.round(cap * fill * (0.85 + Math.random() * 0.3) * (CAPACITY / cap))));
    const occ = this.occupied();
    const alight = Math.floor(occ * (0.15 + Math.random() * 0.3));
    const board = Math.max(0, want - (occ - alight));
    if (!this.materialized) {
      let total = Math.max(0, occ - alight) + board;
      total = Math.min(cap, total);
      this.pax = Math.min(CAPACITY - (this.game.player.bus === this ? 1 : 0), total);
      this.standing = Math.max(0, total - this.pax);
      return;
    }
    // animate: alighting passengers walk to the door, boarders walk in
    const seated = this.passengers.filter((p) => !p.walk.length && !p.leaving);
    seated.sort(() => Math.random() - 0.5);
    for (let i = 0; i < alight && i < seated.length; i++) this.sendOff(seated[i]);
    for (let i = 0; i < board; i++) this.addPassenger(true, i * 0.9);
  }

  freeSeats() {
    return this.seats.filter((s) => !s.occ);
  }

  /** Seats the player may take: empty, or only "reserved" by someone still walking to it. */
  playerSeatOk(s) {
    return !s.occ || (s.occ !== 'player' && s.occ.walk && s.occ.walk.length && !s.occ.leaving);
  }

  /** The player took a seat a passenger was heading for: send them elsewhere. */
  bump(seat) {
    const p = seat.occ;
    if (!p || p === 'player' || !p.walk) return;
    seat.occ = 'player';
    p.seat = null;
    const free = this.freeSeats();
    const next = free[0] || null;
    let tgt;
    if (next) {
      next.occ = p;
      p.seat = next;
      tgt = next;
    } else {
      p.stand = this.standSpot() || { x: 0, z: p.z };
      tgt = p.stand;
    }
    p.walk = [{ x: 0, z: p.z }, { x: 0, z: tgt.z }, { x: tgt.x, z: tgt.z }];
  }

  materialize() {
    this.materialized = true;
    const seats = this.freeSeats().sort(() => Math.random() - 0.5);
    const n = Math.min(this.pax, seats.length);
    for (let i = 0; i < n; i++) this.addPassenger(false, 0, seats[i]);
    for (let i = 0; i < this.standing; i++) this.addPassenger(false, 0, null);
    // driver
    this.driver = this.game.acquireCivilian();
    this.driver.root.position.set(0.75, 0.15, 4.75);
    this.driver.root.rotation.y = 0;
    this.group.add(this.driver.root);
  }

  dematerialize() {
    if (!this.materialized) return;
    this.pax = this.passengers.filter((p) => p.seat).length;
    this.standing = this.passengers.length - this.pax;
    for (const p of this.passengers) {
      if (p.seat) p.seat.occ = null;
      this.group.remove(p.char.root);
      this.game.releaseCivilian(p.char);
    }
    this.passengers = [];
    if (this.driver) {
      this.group.remove(this.driver.root);
      this.game.releaseCivilian(this.driver);
      this.driver = null;
    }
    this.materialized = false;
  }

  standSpot() {
    const key = (s) => s.x.toFixed(1) + ':' + s.z.toFixed(1);
    const used = new Set(this.passengers.filter((p) => p.stand).map((p) => key(p.stand)));
    const spots = [];
    for (let z = 2.2; z > -4.8; z -= 0.8) spots.push({ x: 0, z }, { x: -0.85, z: z - 0.4 });
    spots.push({ x: -0.6, z: 3.4 }, { x: 0.2, z: 3.4 });
    const free = spots.filter((s) => !used.has(key(s)));
    return free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  addPassenger(walkIn, delay = 0, seat) {
    if (this.game.civAvailable && !this.game.civAvailable()) return;
    const char = this.game.acquireCivilian();
    if (seat === undefined) {
      const free = this.freeSeats();
      // passengers prefer an empty row, then a window seat
      free.sort((a, b) => this.rowCount(a.row) - this.rowCount(b.row) + (b.window - a.window) * 0.5 + (Math.random() - 0.5) * 0.6);
      seat = free[0] || null;
    }
    let stand = null;
    if (!seat) {
      stand = this.standSpot();
      if (!stand) {
        this.game.releaseCivilian(char);
        return;
      }
    }
    if (seat) seat.occ = 'reserved';
    const p = { char, seat, stand, x: 0, z: 0, walk: [], delay, noticedPlayer: 0 };
    if (seat) seat.occ = p;
    if (walkIn) {
      p.x = DOOR.x;
      p.z = DOOR.z;
      const tgt = seat || stand;
      p.walk = [{ x: 0, z: 3.6 }, { x: 0, z: tgt.z }, { x: tgt.x, z: tgt.z }];
      char.root.visible = delay <= 0;
    } else {
      const tgt = seat || stand;
      p.x = tgt.x;
      p.z = tgt.z;
    }
    char.root.position.set(p.x, 0.15, p.z);
    this.group.add(char.root);
    this.passengers.push(p);
  }

  rowCount(r) {
    return this.seats.filter((s) => s.row === r && s.occ).length;
  }

  sendOff(p) {
    p.leaving = true;
    if (p.seat) {
      p.seat.occ = null;
      p.seat = null;
    }
    p.stand = null;
    p.walk = [{ x: 0, z: p.z }, { x: 0, z: 3.6 }, { x: DOOR.x, z: DOOR.z }];
  }

  updatePassengers(dt) {
    for (const p of [...this.passengers]) {
      if (p.delay > 0) {
        p.delay -= dt;
        if (p.delay <= 0) p.char.root.visible = true;
        continue;
      }
      let moving = false;
      if (p.walk.length) {
        const w = p.walk[0];
        const dx = w.x - p.x;
        const dz = w.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.08) {
          p.walk.shift();
          if (!p.walk.length && p.leaving) {
            this.group.remove(p.char.root);
            this.game.releaseCivilian(p.char);
            this.passengers = this.passengers.filter((q) => q !== p);
            continue;
          }
        } else {
          // don't walk through the player
          const pl = this.game.player;
          let blocked = false;
          if (pl.bus === this && !pl.seat) {
            const nx = p.x + (dx / d) * 0.35;
            const nz = p.z + (dz / d) * 0.35;
            if (Math.hypot(nx - pl.lx, nz - pl.lz) < 0.3 && Math.hypot(p.x - pl.lx, p.z - pl.lz) > 0.3) {
              p.squeeze = (p.squeeze || 0) + dt;
              blocked = p.squeeze < 1.2;
            }
          }
          if (!blocked) {
            const step = Math.min(d, 1.1 * dt);
            p.x += (dx / d) * step;
            p.z += (dz / d) * step;
            p.char.root.rotation.y = Math.atan2(dx, dz);
            moving = true;
          }
        }
      } else if (!p.leaving) p.char.root.rotation.y = 0;
      p.walking = moving;
      p.char.root.position.set(p.x, 0.15, p.z);
      if (this.inView !== false) p.char.update(dt, { speed: moving ? 1.1 : 0, sit: !!p.seat && !p.walk.length });
    }
    if (this.driver) this.driver.update(dt, { speed: 0, sit: true, carry: true });
  }
}

export { CAPACITY, ROWS, SEAT_X, DOOR };
