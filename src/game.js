// Core game: phases (apartment, commute, work), player control, camera,
// stealth detection, coworker reactions, shame and win/lose conditions.
import * as THREE from 'three';
import { ui, esc } from './ui.js';
import { NPC, angDiff } from './npc.js';
import { createCharacter, createMannequin, randomColors } from './character.js';
import { buildApartment } from './levels/apartment.js';
import { buildCity } from './levels/city.js';
import { buildOffice, buildRestaurant, buildRetail } from './levels/workplaces.js';
import { JOBS, PERSONALITIES, STORY, TASKS, TASK_QUOTA } from './data.js';
import { storage } from './storage.js';

const WALK = 2.0;
const RUN = 4.3;
const CROUCH = 1.1;
const LEND_TIME = 60;
const DISTRACT_TIME = 14;
const PED_REACTIONS = [
  'Uh... did you forget something?',
  'Wow. Bold fashion choice.',
  'Did you lose a bet?!',
  '*stares in disbelief*',
  'Excuse me... your pants?!',
  'Is this some kind of prank show?',
  '*whispers to a friend and giggles*',
  'Hey! Nice underwear!',
];
const DISTRACT_LINES = [
  'Oh no! I dropped all my papers everywhere!',
  'Whoa! Is that a spider?! Everyone look over here!',
  'Ow! I think I sprained my ankle!',
  'Hey everyone, free donuts over here!',
  'Oops! I spilled coffee all over the floor!',
];

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

export class Game {
  constructor(canvas, profile, save, onEnd) {
    this.canvas = canvas;
    this.profile = profile;
    this.onEnd = onEnd;
    this.job = JOBS[profile.job];
    this.lw = profile.legwearType === 'skirt' ? 'skirt' : 'pants';
    this.lwIs = this.lw === 'skirt' ? 'is' : 'are';
    this.state = {
      day: save?.day || 1,
      shame: save?.shame || 0,
      cw: profile.coworkers.map((_, i) => ({ ally: false, warned: false, ...(save?.cw?.[i] || {}) })),
      eveningShown: !!save?.eveningShown,
    };
    this.ui = ui;
    this.running = false;
    this.paused = false;
    this.keys = new Set();
    this.npcs = [];
    this.levels = {};
    this.cwChars = [];
    this.cwRuntime = profile.coworkers.map(() => ({ lendCd: 0, distractCd: 0 }));

    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8d7b68, 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -22;
    sc.right = sc.top = 22;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);
    this.ray = new THREE.Raycaster();

    this.cam = { yaw: Math.PI, pitch: 0.35, dist: 4.2 };
    this.player = { x: 0, z: 0, yaw: 0, speed: 0, crouch: false, carry: null, inter: null, borrow: null };
    this.composure = 100;
    this.markers = this.makeMarker();
    this.scene.add(this.markers);

    this.bindInput();
    window.__game = this;
  }

  // ---------------------------------------------------------------------
  async init() {
    const p = this.profile;
    const loadModel = async (m) => (m && m.key ? await storage.getBlob(m.key) : null);
    ui.setScreen('<div class="loading">Loading characters...</div>');
    const pc = await createCharacter({
      vrm: await loadModel(p.model),
      legwearMaterials: p.model?.legwearMaterials || null,
      underwearOverlay: p.model?.underwearOverlay !== false,
      colors: p.colors,
      legwearType: p.legwearType,
    });
    this.player.char = pc;
    this.scene.add(pc.root);
    for (const c of p.coworkers) {
      const ch = await createCharacter({
        vrm: await loadModel(c.model),
        legwearMaterials: c.model?.legwearMaterials || null,
        underwearOverlay: c.model?.underwearOverlay !== false,
        colors: c.colors,
        legwearType: c.legwearType,
      });
      this.cwChars.push(ch);
    }
    ui.setScreen('<div class="loading">Building the city...</div>');
    await new Promise((r) => setTimeout(r, 30));
    this.levels.apartment = buildApartment();
    this.levels.city = buildCity({ workplaceName: this.job.workplaceName });
    const coworkers = p.coworkers;
    this.levels.work =
      p.job === 'office' ? buildOffice({ coworkers }) : p.job === 'restaurant' ? buildRestaurant() : buildRetail();
    ui.hideScreen();
    window.addEventListener('resize', (this._onResize = () => this.resize()));
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.running = true;
    ui.showHUD(true);
    this.last = performance.now();
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused && !ui.dialogOpen && !this.transitioning && !this.ended) this.update(dt);
      this.render();
    };
    requestAnimationFrame(loop);
    this.enterPhase('morning', true);
  }

  destroy() {
    this.running = false;
    this.unbindInput();
    window.removeEventListener('resize', this._onResize);
    this.clearNPCs();
    ui.showHUD(false);
    ui.borrow(null);
    ui.progress(null);
    ui.tagLayer.innerHTML = '';
    try {
      this.player.char?.dispose();
      this.cwChars.forEach((c) => c.dispose());
    } catch (_) {}
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------------
  // Input
  bindInput() {
    this._kd = (e) => {
      if (ui.dialogOpen) return;
      if (e.code === 'Escape') {
        if (this.paused) this.resume();
        else this.pause();
        return;
      }
      if (this.paused) return;
      this.keys.add(e.code);
      if (e.code === 'KeyC') this.player.crouch = !this.player.crouch;
      if (e.code === 'KeyE' && !e.repeat) this.tryInteract();
    };
    this._ku = (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE') this.cancelInteract();
    };
    this._mm = (e) => {
      if (document.pointerLockElement === this.canvas || this.dragging) {
        this.cam.yaw -= e.movementX * 0.0028;
        this.cam.pitch = Math.max(-0.25, Math.min(1.25, this.cam.pitch + e.movementY * 0.0024));
      }
    };
    this._md = (e) => {
      if (ui.dialogOpen || this.paused) return;
      if (e.button === 2) this.dragging = true;
      else if (document.pointerLockElement !== this.canvas) {
        try {
          const pr = this.canvas.requestPointerLock();
          if (pr && pr.catch) pr.catch(() => {});
        } catch (_) {}
      }
    };
    this._mu = () => (this.dragging = false);
    this._wh = (e) => {
      this.cam.dist = Math.max(1.8, Math.min(8, this.cam.dist + Math.sign(e.deltaY) * 0.4));
    };
    this._plc = () => {
      if (!document.pointerLockElement && this.running && !ui.dialogOpen && !this.paused && !this.transitioning && !this.ended) {
        this.pause();
      }
    };
    this._blur = () => this.keys.clear();
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('mousemove', this._mm);
    this.canvas.addEventListener('mousedown', this._md);
    window.addEventListener('mouseup', this._mu);
    window.addEventListener('wheel', this._wh);
    window.addEventListener('blur', this._blur);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this._plc);
  }

  unbindInput() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('mousemove', this._mm);
    this.canvas.removeEventListener('mousedown', this._md);
    window.removeEventListener('mouseup', this._mu);
    window.removeEventListener('wheel', this._wh);
    window.removeEventListener('blur', this._blur);
    document.removeEventListener('pointerlockchange', this._plc);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  pause() {
    if (this.ended) return;
    this.paused = true;
    this.keys.clear();
    this.cancelInteract();
    const s = ui.setScreen(
      `<div class="panel" style="max-width:420px;text-align:center">
        <h2>Paused</h2>
        <div class="menu">
          <button id="p-resume">Resume</button>
          <button id="p-controls" class="secondary">Controls</button>
          <button id="p-quit" class="danger">Quit to Title</button>
        </div>
        <p class="note">Progress is saved at the start of each day.</p>
      </div>`,
      true
    );
    s.querySelector('#p-resume').onclick = () => this.resume();
    s.querySelector('#p-controls').onclick = () => this.showControls();
    s.querySelector('#p-quit').onclick = () => {
      this.ended = true;
      this.onEnd({ type: 'quit' });
    };
  }

  showControls() {
    const s = ui.setScreen(
      `<div class="panel" style="max-width:520px">
        <h2>Controls</h2>${controlsTable()}
        <div class="footer"><span></span><button id="c-back">Back</button></div></div>`,
      true
    );
    s.querySelector('#c-back').onclick = () => this.pause();
  }

  resume() {
    ui.hideScreen();
    this.paused = false;
    this.last = performance.now();
  }

  async dialog(title, text, options) {
    this.keys.clear();
    this.cancelInteract();
    const v = await ui.dialog(title, text, options);
    this.last = performance.now();
    return v;
  }

  // ---------------------------------------------------------------------
  // Phases
  async enterPhase(phase, first = false) {
    this.transitioning = true;
    this.keys.clear();
    this.cancelInteract();
    if (!first) await ui.fade(true);
    if (this.level) this.scene.remove(this.level.group);
    this.clearNPCs();
    this.phase = phase;
    const st = this.state;
    const p = this.player;
    p.carry = null;
    this.setCarryMesh(null);
    p.crouch = false;
    this.composure = 100;
    this.distraction = null;

    let L;
    if (phase === 'morning' || phase === 'evening') L = this.levels.apartment;
    else if (phase === 'commute_am' || phase === 'commute_pm') L = this.levels.city;
    else L = this.levels.work;
    this.level = L;
    this.scene.add(L.group);

    let spawn = L.spawn;
    if (phase === 'evening') spawn = L.doorSpawn;
    if (phase === 'commute_am') spawn = L.spawnHome;
    if (phase === 'commute_pm') spawn = L.spawnWork;
    p.x = spawn.x;
    p.z = spawn.z;
    p.yaw = spawn.yaw;
    this.cam.yaw = spawn.yaw;
    this.cam.pitch = 0.35;

    this.setLighting(phase);
    this.stealth = false;
    ui.showComposure(phase === 'work');

    if (phase === 'morning') {
      this.morning = { wash: false, eat: false, dress: false };
      p.char.setLegwear(false);
      this.cam.dist = 3.2;
    } else if (phase === 'commute_am') {
      this.stealth = st.day > 1;
      p.char.setLegwear(st.day === 1);
      this.spawnPedestrians();
      this.cam.dist = 4.5;
    } else if (phase === 'work') {
      this.work = { clockedIn: false, clockedOut: false, done: 0, quota: TASK_QUOTA[st.day - 1] || 6, task: null, step: 0, lastTpl: null };
      p.char.setLegwear(st.day === 1);
      this.spawnCoworkers();
      this.spawnInitialCustomers();
      this.customerTimer = 4;
      this.cam.dist = 3.8;
    } else if (phase === 'commute_pm') {
      this.stealth = true;
      p.char.setLegwear(false);
      this.spawnPedestrians();
      this.cam.dist = 4.5;
    } else if (phase === 'evening') {
      p.char.setLegwear(false);
      this.cam.dist = 3.2;
    }
    p.char.root.position.set(p.x, 0, p.z);
    p.char.root.rotation.y = p.yaw;
    p.char.resetPhysics();
    this.npcs.forEach((n) => n.char.resetPhysics());
    this.updateHUD();
    await ui.fade(false);
    this.transitioning = false;
    this.last = performance.now();
    await this.phaseIntro(phase);
  }

  async phaseIntro(phase) {
    const st = this.state;
    const name = this.profile.name;
    if (phase === 'morning') {
      await this.dialog(`Day ${st.day} — Morning`, st.day === 1 ? STORY.intro(name) : `Day ${st.day}. ${name} wakes up and remembers the situation.\n\nGet ready, then head out. Being seen on the street without ${this.lw} won't get you fired... but it will be embarrassing.`);
    } else if (phase === 'commute_am') {
      if (st.day === 1) {
        ui.toast(`Walk to ${this.job.workplaceName} at the far end of the street, on the other side of the road.`, '', 6000);
      } else {
        ui.toast('Pedestrians who notice you raise your Shame. Use hedges, bushes and the park for cover.', 'bad', 6000);
      }
    } else if (phase === 'work') {
      ui.toast('Clock in at the time clock first.', '', 5000);
      if (st.day > 1) ui.toast(`Stay out of everyone's sight cones. Crouch behind desks and counters, and keep carried items in front of you.`, '', 7000);
    } else if (phase === 'commute_pm') {
      ui.toast('Shift over! Get home without too many people seeing you.', '', 5000);
    } else if (phase === 'evening') {
      if (st.day >= 3) {
        this.win();
        return;
      }
      if (st.day === 1 && !st.eveningShown) {
        st.eveningShown = true;
        await this.dialog('Wardrobe Disaster', STORY.day1Evening(this.lw));
      }
      ui.toast('Get some sleep. Tomorrow is another workday.', '', 5000);
    }
  }

  setLighting(phase) {
    const s = this.scene;
    if (phase === 'commute_am') {
      s.background = new THREE.Color('#a9d6ff');
      s.fog = new THREE.Fog('#a9d6ff', 45, 150);
      this.hemi.color.set('#dff1ff');
      this.hemi.groundColor.set('#7a6a5a');
      this.hemi.intensity = 1.25;
      this.sun.color.set('#fff2db');
      this.sun.intensity = 2.3;
      this.sunOffset = new THREE.Vector3(18, 30, 10);
    } else if (phase === 'commute_pm') {
      s.background = new THREE.Color('#f0a46a');
      s.fog = new THREE.Fog('#e79a6b', 40, 140);
      this.hemi.color.set('#ffd2b0');
      this.hemi.groundColor.set('#5a4050');
      this.hemi.intensity = 1.0;
      this.sun.color.set('#ffb27a');
      this.sun.intensity = 1.8;
      this.sunOffset = new THREE.Vector3(-25, 14, -10);
    } else {
      s.background = new THREE.Color(phase === 'evening' ? '#141428' : '#1d1d2b');
      s.fog = null;
      this.hemi.color.set('#ffffff');
      this.hemi.groundColor.set('#9a8a7a');
      this.hemi.intensity = phase === 'evening' ? 1.3 : 1.7;
      this.sun.color.set(phase === 'evening' ? '#c9b8ff' : '#fff8ee');
      this.sun.intensity = phase === 'evening' ? 1.1 : 1.6;
      this.sunOffset = new THREE.Vector3(6, 22, 8);
    }
  }

  clearNPCs() {
    this.npcs.forEach((n) => n.destroy());
    this.npcs = [];
  }

  removeNPC(n) {
    n.destroy();
    this.npcs = this.npcs.filter((x) => x !== n);
  }

  spawnCoworkers() {
    const L = this.level;
    this.profile.coworkers.forEach((c, i) => {
      const ch = this.cwChars[i];
      ch.setLegwear(true);
      const st = L.pois.stations[i] || L.pois.wander[i % L.pois.wander.length];
      const n = new NPC(this, ch, {
        kind: 'coworker',
        name: c.name,
        personality: c.personality,
        index: i,
        station: st,
        legwearType: c.legwearType,
        x: st.x,
        z: st.z,
        yaw: st.yaw || 0,
        range: 13,
        speed: 1.3,
      });
      n.timer = 2 + Math.random() * 8;
      this.npcs.push(n);
    });
  }

  makeCustomer() {
    const ch = createMannequin({ colors: randomColors(), legwearType: Math.random() < 0.4 ? 'skirt' : 'pants', scale: 0.93 + Math.random() * 0.12 });
    return ch;
  }

  freeSpot() {
    const spots = (this.level.pois.customerSpots || []).filter((s) => !s.taken);
    return spots.length ? spots[Math.floor(Math.random() * spots.length)] : null;
  }

  spawnInitialCustomers() {
    const L = this.level;
    (L.pois.customerSpots || []).forEach((s) => (s.taken = false));
    const n = Math.ceil((L.maxCustomers || 3) * 0.6);
    for (let i = 0; i < n; i++) {
      const spot = this.freeSpot();
      if (!spot) break;
      const c = new NPC(this, this.makeCustomer(), {
        kind: 'customer',
        name: this.job.customerWord,
        x: spot.x,
        z: spot.z,
        yaw: spot.yaw,
        range: 9,
        speed: 1.1,
        spot,
      });
      spot.taken = true;
      c.sitting = !!spot.sit;
      c.baseYaw = spot.yaw;
      c.timer = 15 + Math.random() * 40;
      this.npcs.push(c);
    }
  }

  spawnCustomer() {
    const L = this.level;
    const count = this.npcs.filter((n) => n.kind === 'customer').length;
    if (count >= (L.maxCustomers || 3)) return;
    const spot = this.freeSpot();
    if (!spot) return;
    const e = L.pois.entrance;
    const c = new NPC(this, this.makeCustomer(), {
      kind: 'customer',
      name: this.job.customerWord,
      x: e.x,
      z: e.z,
      yaw: Math.PI,
      range: 9,
      speed: 1.1,
    });
    c.sitAt(spot, 20 + Math.random() * 35);
    this.npcs.push(c);
  }

  spawnPedestrians() {
    const L = this.level;
    const paths = L.pois.pedPaths;
    const plan = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 3, 4, 5];
    plan.forEach((pi) => {
      const loop = paths[pi];
      const idx = Math.floor(Math.random() * loop.length);
      const a = loop[idx];
      const b = loop[(idx + 1) % loop.length];
      const t = Math.random();
      const n = new NPC(this, this.makeCustomer(), {
        kind: 'pedestrian',
        loop,
        loopIdx: idx,
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        range: 13,
        speed: 1.1 + Math.random() * 0.4,
      });
      n.path = [{ x: b.x, z: b.z }];
      n.loopIdx = (idx + 1) % loop.length;
      n.state = 'walk';
      n.onArrive = () => n.think();
      this.npcs.push(n);
    });
    for (const s of L.pois.idleSpots) {
      const n = new NPC(this, this.makeCustomer(), { kind: 'pedestrian', x: s.x, z: s.z, yaw: s.yaw, range: 12 });
      n.sitting = !!s.sit;
      n.baseYaw = s.yaw;
      n.timer = 9999;
      this.npcs.push(n);
    }
  }

  allBodies() {
    const out = [{ x: this.player.x, z: this.player.z }];
    for (const n of this.npcs) out.push(n);
    return out;
  }

  // ---------------------------------------------------------------------
  // Main update
  update(dt) {
    const t = performance.now() / 1000;
    const p = this.player;
    const L = this.level;
    if (!L) return;

    // --- movement
    let mx = 0;
    let mz = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) mz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    const crouch = p.crouch || k.has('ControlLeft');
    const running = (k.has('ShiftLeft') || k.has('ShiftRight')) && !crouch;
    let speed = 0;
    if ((mx || mz) && p.inter) this.cancelInteract();
    if ((mx || mz) && !p.inter) {
      const cy = this.cam.yaw;
      const fx = Math.sin(cy);
      const fz = Math.cos(cy);
      const rx = -Math.cos(cy);
      const rz = Math.sin(cy);
      let dx = fx * mz + rx * mx;
      let dz = fz * mz + rz * mx;
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
      speed = crouch ? CROUCH : running ? RUN : WALK;
      const nx = p.x + dx * speed * dt;
      const nz = p.z + dz * speed * dt;
      const r = L.resolve(nx, nz, 0.3);
      p.x = r.x;
      p.z = r.z;
      const target = Math.atan2(dx, dz);
      p.yaw += angDiff(target, p.yaw) * Math.min(1, dt * 12);
    }
    // push out of NPCs and cars
    for (const n of this.npcs) {
      const dx = p.x - n.x;
      const dz = p.z - n.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.55 && d > 0.001) {
        p.x = n.x + (dx / d) * 0.55;
        p.z = n.z + (dz / d) * 0.55;
      }
    }
    if (L.cars) this.carCollide();
    p.speed += (speed - p.speed) * Math.min(1, dt * 12);
    p.running = running && speed > 0;
    p.crouching = crouch;

    // --- interaction progress
    if (p.inter) {
      p.inter.t += dt;
      ui.progress(p.inter.t / p.inter.time);
      if (p.inter.t >= p.inter.time) {
        const a = p.inter.action;
        p.inter = null;
        ui.progress(null);
        a.run();
      }
    }

    // --- character animation
    const exposed = !p.char.legwearOn;
    p.char.root.position.set(p.x, 0, p.z);
    p.char.root.rotation.y = p.yaw;
    p.char.update(dt, { speed: p.speed, crouch, carry: !!p.carry || !!p.inter, cover: exposed && this.phase !== 'morning' && this.phase !== 'evening' });
    this.updateCarryMesh();

    // --- level, NPCs
    L.update(dt, this);
    for (const n of [...this.npcs]) n.update(dt, t);
    for (const r of this.cwRuntime) {
      r.lendCd = Math.max(0, r.lendCd - dt);
      r.distractCd = Math.max(0, r.distractCd - dt);
    }
    if (this.phase === 'work') {
      this.customerTimer -= dt;
      if (this.customerTimer <= 0) {
        this.customerTimer = 6 + Math.random() * 10;
        this.spawnCustomer();
      }
    }
    if (this.distraction) {
      this.distraction.t -= dt;
      if (this.distraction.t <= 0) this.distraction = null;
    }
    if (p.borrow) {
      p.borrow.t -= dt;
      if (p.borrow.t <= 10 && !p.borrow.warned) {
        p.borrow.warned = true;
        ui.toast(`${p.borrow.npc.name} needs their ${p.borrow.npc.legwearType} back soon!`, 'bad');
      }
      ui.borrow(`Wearing ${p.borrow.npc.name}'s ${p.borrow.npc.legwearType} — ${Math.ceil(p.borrow.t)}s`);
      if (p.borrow.t <= 0) this.endBorrow();
    }

    // --- stealth
    this.detect(dt);

    // --- emotions
    const sh = this.state.shame / 100;
    p.char.setEmotion('blush', exposed && this.phase !== 'morning' && this.phase !== 'evening' ? 1 : sh);
    p.char.setEmotion('sad', Math.min(0.6, sh * 0.6));
    ui.vignette(sh * sh);

    this.updatePrompt();
    this.updateHUD();
  }

  carCollide() {
    const p = this.player;
    for (const c of this.level.cars) {
      const lx = c.axis === 'z' ? p.x - c.lane : p.x - c.pos;
      const lz = c.axis === 'z' ? p.z - c.pos : p.z - c.lane;
      const hw = c.axis === 'z' ? 1.2 : 2.4;
      const hl = c.axis === 'z' ? 2.4 : 1.2;
      if (Math.abs(lx) < hw && Math.abs(lz) < hl) {
        const px = hw - Math.abs(lx);
        const pz = hl - Math.abs(lz);
        if (px < pz) p.x += Math.sign(lx || 1) * px;
        else p.z += Math.sign(lz || 1) * pz;
        if (!this._honk || performance.now() - this._honk > 3000) {
          this._honk = performance.now();
          ui.toast('*HONK!* Watch the road!', 'bad', 2000);
        }
      }
    }
  }

  hipPoint() {
    const hb = this.player.char.bone('hips');
    if (hb) {
      hb.getWorldPosition(tmpV);
      tmpV.y -= 0.04;
      return tmpV;
    }
    return tmpV.set(this.player.x, this.player.char.hipHeight * (this.player.crouching ? 0.55 : 1), this.player.z);
  }

  lineOfSight(from, to) {
    tmpV2.subVectors(to, from);
    const d = tmpV2.length();
    tmpV2.divideScalar(d);
    this.ray.set(from, tmpV2);
    this.ray.far = d - 0.15;
    const hits = this.ray.intersectObjects(this.level.occluders, false);
    return hits.length === 0;
  }

  npcKnows(n) {
    if (n.kind !== 'coworker') return false;
    return this.state.cw[n.index].ally;
  }

  detect(dt) {
    const p = this.player;
    const work = this.phase === 'work';
    const active = work ? this.work.clockedIn && !this.work.clockedOut : this.stealth;
    const exposed = !p.char.legwearOn;
    const hip = this.hipPoint().clone();
    const chest = hip.clone();
    chest.y += 0.45;
    let seenBy = 0;
    let watchers = [];
    for (const n of this.npcs) {
      n.updateConeVisual(active && exposed);
      if (!active || !n.vision || n.state === 'talk') {
        n.suspicion = Math.max(0, n.suspicion - dt);
        continue;
      }
      const dx = p.x - n.x;
      const dz = p.z - n.z;
      const dist = Math.hypot(dx, dz);
      let seesHip = false;
      let seesBody = false;
      if (dist < n.range) {
        const a = Math.atan2(dx, dz);
        if (Math.abs(angDiff(a, n.lookYaw)) < n.fov / 2 || dist < 1.2) {
          const eye = n.eye();
          seesHip = this.lineOfSight(eye, hip);
          seesBody = seesHip || this.lineOfSight(eye, chest);
        }
      }
      if (seesBody) watchers.push(n);
      // Carried items cover the front.
      let covered = false;
      if (p.carry && seesHip) {
        const toN = Math.atan2(n.x - p.x, n.z - p.z);
        const lim = p.carry === 'box' ? 1.35 : p.carry === 'tray' ? 1.1 : 0.8;
        if (Math.abs(angDiff(toN, p.yaw)) < lim) covered = true;
      }
      const canNotice = exposed && seesHip && !covered && !this.npcKnows(n) && n.noticeCooldown <= 0;
      if (canNotice) {
        seenBy++;
        const prox = 1.5 - dist / n.range;
        let rate = 0.55 * prox;
        if (n.kind === 'customer') rate *= 0.85;
        if (p.crouching) rate *= 0.7;
        if (p.running) rate *= 1.3;
        if (n.kind === 'pedestrian') rate *= 0.8;
        n.suspicion += rate * dt;
      } else {
        n.suspicion = Math.max(0, n.suspicion - 0.5 * dt);
      }
      // Pedestrians who already noticed keep staring: slow shame build.
      if (n.kind === 'pedestrian' && n.noticeCooldown > 0 && exposed && seesHip && !covered) {
        this.addShame(1.0 * dt, true);
      }
      if (n.suspicion >= 1) {
        n.suspicion = 0;
        this.caught(n);
        return;
      }
    }
    this.seenBy = seenBy;

    // Looking strange: sneaking or running around in front of people at work.
    if (work && active) {
      const odd = watchers.filter((n) => n.kind !== 'pedestrian');
      let drain = 0;
      if (odd.length) {
        if (p.crouching && p.speed > 0.2) drain = 13;
        else if (p.crouching) drain = 6;
        else if (p.running) drain = 11;
      }
      if (drain) this.composure -= drain * dt * Math.min(2, odd.length);
      else this.composure = Math.min(100, this.composure + 7 * dt);
      if (this.composure <= 0) {
        this.composure = 45;
        const n = odd.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
        if (n) {
          n.startInvestigate(p.x, p.z);
          this.bubble(n, n.kind === 'coworker' ? `${this.profile.name}? You're acting really weird...` : 'What is that employee doing?');
          ui.toast(`You're acting strange! ${n.kind === 'coworker' ? n.name : 'A ' + n.name} is coming to check on you.`, 'bad');
        }
      }
    }
  }

  bubble(n, text, time = 3.5) {
    n.bubbleText = text;
    n.bubbleT = time;
  }

  addShame(v, silent = false) {
    this.state.shame = Math.min(100, this.state.shame + v);
    if (!silent && v >= 1) ui.toast(`Shame +${Math.round(v)}`, 'bad', 2200);
    if (this.state.shame >= 100 && !this.ended) {
      this.lose(
        'Overwhelmed',
        `It's all too much. ${this.profile.name}'s face burns bright red, and they flee home, vowing never to leave the apartment again.\n\nToo much shame.`
      );
    }
  }

  // ---------------------------------------------------------------------
  // Getting caught
  async caught(n) {
    const p = this.player;
    const name = this.profile.name;
    if (n.kind === 'pedestrian') {
      n.noticeCooldown = 25;
      this.bubble(n, PED_REACTIONS[Math.floor(Math.random() * PED_REACTIONS.length)]);
      this.addShame(7);
      return;
    }
    this.cancelInteract();
    const prev = n.state;
    n.state = 'talk';
    n.path = [];
    if (n.kind === 'customer') {
      this.state.complaints = (this.state.complaints || 0) + 1;
      this.addShame(12);
      if (this.ended) return;
      const c = this.state.complaints;
      await this.dialog(
        `A ${this.job.customerWord} noticed!`,
        `"Excuse me?! Is that... your UNDERWEAR?! I want to speak to a manager!"\n\nThe ${this.job.customerWord} storms off to file a complaint. (${c}/3 complaints)`
      );
      if (this.ended || n.removed || this.phase !== 'work') return;
      if (c >= 3) {
        this.lose('Fired!', `Management received three complaints about an employee "working in their underwear".\n\n${name} is escorted out of ${this.job.workplaceName}. Fired.`);
        return;
      }
      n.state = 'idle';
      n.leaving = false;
      n.vision = false;
      n.think();
      return;
    }
    // Coworker
    const cw = this.state.cw[n.index];
    const pers = n.personality;
    const nm = n.name;
    const lw = this.lw;
    if (pers === 'friend') {
      cw.ally = true;
      this.addShame(5);
      if (this.ended) return;
      const opts = [
        { label: `Borrow ${nm}'s ${n.legwearType} for a while`, value: 'lend' },
        { label: 'Ask for a distraction', value: 'distract' },
        { label: 'Just ask them to keep quiet', value: null, cls: 'secondary' },
      ];
      const v = await this.dialog(
        `${nm} saw you!`,
        `${nm}'s eyes go wide. "${name}! Your ${lw}...! Oh my gosh, what happened?"\n\nYou quickly explain. ${nm} nods firmly. "Don't worry, I've got your back. Nobody else needs to know."\n\n(${nm} is now an ally. Talk to them any time with E for help.)`,
        opts
      );
      if (n.removed) return;
      n.state = 'idle';
      n.timer = 2;
      if (v === 'lend') this.startLend(n);
      else if (v === 'distract') this.startDistraction(n);
    } else if (pers === 'sympathetic') {
      cw.ally = true;
      this.addShame(10);
      if (this.ended) return;
      await this.dialog(
        `${nm} saw you!`,
        `${nm} blinks, then politely looks away. "I... didn't see anything. That must be awful. Here, let me pull everyone's attention away — go!"\n\n(${nm} is now an ally and can create distractions when you ask.)`
      );
      n.state = 'idle';
      this.startDistraction(n);
    } else if (pers === 'neutral' && !cw.warned) {
      cw.warned = true;
      this.addShame(18);
      if (this.ended) return;
      await this.dialog(
        `${nm} saw you!`,
        `${nm} stares for a long, awkward moment. "Uh. Wow. Okay. I'm going to pretend I didn't see that..."\n\n"But if I see it again, I'm telling the manager. I'm not getting dragged into this."\n\n(One more slip in front of ${nm} and you're reported.)`
      );
      n.state = 'idle';
      n.noticeCooldown = 12;
      n.timer = 1;
    } else {
      // strict, distant, or neutral on the second strike
      const lines = {
        strict: `${nm}'s face hardens. "Absolutely unacceptable. There is a DRESS CODE, ${name}." They march straight to the manager's office.`,
        distant: `${nm} looks at you, then at your ${lw}... or lack thereof. Without a word, they pull out their phone and email HR.`,
        neutral: `${nm} sighs. "I warned you. Sorry, ${name}, I'm not risking my job for this." They head for the manager.`,
      };
      await this.dialog(`${nm} saw you!`, lines[pers] || lines.strict);
      this.lose('Fired!', `Ten minutes later, ${name} is called into the manager's office. Reported for violating the dress code, they are fired on the spot.\n\nMaybe a friendlier set of coworkers would have helped...`);
    }
    void prev;
  }

  startLend(n) {
    const p = this.player;
    if (p.borrow) return;
    p.borrow = { npc: n, t: LEND_TIME, warned: false };
    p.char.setLegwear(true);
    n.char.setLegwear(false);
    this.cwRuntime[n.index].lendCd = LEND_TIME + 60;
    n.hideAt(this.level.pois.hide);
    this.bubble(n, "Quick, take them! I'll hide in the back.");
    ui.toast(`You're wearing ${n.name}'s ${n.legwearType}. Move freely while it lasts!`, 'good', 5000);
  }

  endBorrow(silent = false) {
    const p = this.player;
    const b = p.borrow;
    if (!b) return;
    p.borrow = null;
    ui.borrow(null);
    p.char.setLegwear(false);
    b.npc.char.setLegwear(true);
    b.npc.unhide();
    if (!silent) ui.toast(`${b.npc.name} asked for their ${b.npc.legwearType} back. You're exposed again!`, 'bad', 5000);
  }

  startDistraction(n) {
    const line = DISTRACT_LINES[Math.floor(Math.random() * DISTRACT_LINES.length)];
    this.bubble(n, line, 4);
    this.distraction = { x: n.x, z: n.z, t: DISTRACT_TIME };
    this.cwRuntime[n.index].distractCd = 50;
    for (const o of this.npcs) {
      if (o === n) continue;
      if (Math.hypot(o.x - n.x, o.z - n.z) < 30) {
        o.distract(n.x, n.z, DISTRACT_TIME);
        o.suspicion = 0;
      }
    }
    ui.toast(`Everyone is looking at ${n.name}! Move now!`, 'good', 4000);
  }

  async askAlly(n) {
    const cw = this.state.cw[n.index];
    const rt = this.cwRuntime[n.index];
    const p = this.player;
    const opts = [];
    if (n.personality === 'friend') {
      opts.push({
        label: rt.lendCd > 0 ? `Borrow ${n.legwearType} (${n.name} needs a break: ${Math.ceil(rt.lendCd)}s)` : `Borrow ${n.name}'s ${n.legwearType} (${LEND_TIME}s)`,
        value: 'lend',
        disabled: rt.lendCd > 0 || !!p.borrow,
      });
    }
    opts.push({
      label: rt.distractCd > 0 ? `Ask for a distraction (ready in ${Math.ceil(rt.distractCd)}s)` : 'Ask for a distraction',
      value: 'distract',
      disabled: rt.distractCd > 0,
    });
    opts.push({ label: 'Never mind', value: null, cls: 'secondary' });
    n.state = 'talk';
    const v = await this.dialog(n.name, `"Need a hand, ${this.profile.name}?" ${n.name} whispers.`, opts);
    n.state = 'idle';
    n.timer = 1;
    if (v === 'lend') this.startLend(n);
    else if (v === 'distract') this.startDistraction(n);
    void cw;
  }

  // ---------------------------------------------------------------------
  // Interactions
  findInteraction() {
    const p = this.player;
    let best = null;
    let bd = Infinity;
    if (this.phase === 'work' && this.work.clockedIn && !this.work.clockedOut) {
      for (const n of this.npcs) {
        if (n.kind !== 'coworker' || !this.state.cw[n.index].ally) continue;
        if (['hiding', 'goHide', 'talk'].includes(n.state)) continue;
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        if (d < 1.8 && d < bd) {
          bd = d;
          best = { label: `Ask ${n.name} for help`, time: 0, run: () => this.askAlly(n) };
        }
      }
    }
    for (const it of this.level.interactables.values()) {
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d > it.r) continue;
      const a = this.actionFor(it);
      if (a && d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  actionFor(it) {
    const st = this.state;
    const ph = this.phase;
    const id = it.id;
    if (ph === 'morning') {
      const m = this.morning;
      if (id === 'sink' && !m.wash) return { label: 'Wash up', time: 2, run: () => ((m.wash = true), ui.toast('Fresh and clean!', 'good')) };
      if (id === 'kitchen' && !m.eat) return { label: 'Eat breakfast', time: 2.5, run: () => ((m.eat = true), ui.toast('Delicious toast.', 'good')) };
      if (id === 'wardrobe' && !m.dress) {
        if (st.day === 1)
          return {
            label: 'Get dressed for work',
            time: 2,
            run: () => {
              m.dress = true;
              this.player.char.setLegwear(true);
              ui.toast('Looking sharp!', 'good');
            },
          };
        return {
          label: 'Look for something to wear',
          time: 1.5,
          run: async () => {
            m.dress = true;
            await this.dialog('The Wardrobe', STORY.morningNoClothes);
          },
        };
      }
      if (id === 'door') {
        const ready = m.wash && m.eat && m.dress;
        return ready ? { label: 'Leave for work', time: 0, run: () => this.enterPhase('commute_am') } : { label: 'Get ready first (wash, eat, get dressed)', disabled: true };
      }
      if (id === 'bed') return { label: 'No time to sleep in!', disabled: true };
      return null;
    }
    if (ph === 'evening') {
      if (id === 'bed') return { label: 'Go to sleep', time: 0, run: () => this.sleep() };
      if (id === 'door') return { label: "You're home. Time to rest.", disabled: true };
      return null;
    }
    if (ph === 'commute_am' && id === 'workdoor') return { label: `Go inside ${this.job.workplaceName}`, time: 0, run: () => this.enterPhase('work') };
    if (ph === 'commute_pm' && id === 'homedoor') return { label: 'Go home', time: 0, run: () => this.enterPhase('evening') };
    if (ph === 'work') {
      const w = this.work;
      if (id === 'timeclock') {
        if (!w.clockedIn) return { label: 'Clock in', time: 1, run: () => this.clockIn() };
        if (w.done >= w.quota && !w.clockedOut) return { label: 'Clock out', time: 1, run: () => this.clockOut() };
        if (!w.clockedOut) return { label: `Finish your tasks first (${w.done}/${w.quota})`, disabled: true };
        return null;
      }
      if (id === 'exit') {
        if (w.clockedOut) return { label: 'Head home', time: 0, run: () => this.enterPhase('commute_pm') };
        if (!w.clockedIn) return { label: 'Clock in first', disabled: true };
        return { label: 'Your shift is not over yet', disabled: true };
      }
      const step = this.currentStep();
      if (step && step.target === id) {
        return { label: step.label, time: step.time, run: () => this.advanceTask() };
      }
    }
    return null;
  }

  updatePrompt() {
    const p = this.player;
    if (p.inter) {
      ui.set('hud-prompt', esc(p.inter.action.label) + '...');
      return;
    }
    const a = (this.curAction = this.findInteraction());
    if (!a) ui.set('hud-prompt', '');
    else if (a.disabled) ui.set('hud-prompt', `<span style="color:#aaa">${esc(a.label)}</span>`);
    else ui.set('hud-prompt', `<b>[E]</b> ${esc(a.label)}${a.time ? ' <span style="color:#aaa">(hold)</span>' : ''}`);
  }

  tryInteract() {
    const a = this.curAction;
    if (!a || a.disabled || this.player.inter) return;
    if (a.time > 0) this.player.inter = { action: a, t: 0, time: a.time };
    else a.run();
  }

  cancelInteract() {
    if (this.player && this.player.inter) {
      this.player.inter = null;
      ui.progress(null);
    }
  }

  // ---------------------------------------------------------------------
  // Work tasks
  async clockIn() {
    const w = this.work;
    w.clockedIn = true;
    if (this.state.day === 1) {
      await this.dialog('Wardrobe Malfunction!', this.job.mishap(this.lw));
      this.player.char.setLegwear(false);
      ui.toast(`Your underwear is exposed! Don't let anyone see. Stay out of the yellow sight cones.`, 'bad', 7000);
    } else {
      ui.toast('Clocked in. Here we go again...', '');
    }
    this.nextTask();
  }

  clockOut() {
    const w = this.work;
    w.clockedOut = true;
    if (this.player.borrow) {
      this.endBorrow(true);
      ui.toast('You return the borrowed legwear with a grateful hug.', 'good');
    }
    ui.toast('Clocked out! Now get out of here.', 'good');
  }

  nextTask() {
    const w = this.work;
    if (w.done >= w.quota) {
      w.task = null;
      ui.toast('All tasks done! Clock out at the time clock.', 'good', 5000);
      return;
    }
    const tpls = TASKS[this.profile.job];
    let tpl;
    do tpl = tpls[Math.floor(Math.random() * tpls.length)];
    while (tpls.length > 1 && tpl === w.lastTpl);
    // Office deliveries need coworkers
    const opts = this.level.taskOptions || {};
    if (tpl.steps.some((s) => s.target.includes('{desk}')) && !(opts.desk && opts.desk.length)) tpl = tpls[1];
    w.lastTpl = tpl;
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const desk = opts.desk && opts.desk.length ? pick(opts.desk) : null;
    const sub = {
      '{table}': opts.table ? pick(opts.table) : '',
      '{shelf}': opts.shelf ? pick(opts.shelf) : '',
      '{cab}': opts.cab ? pick(opts.cab) : '',
      '{desk}': desk ? desk.id : '',
      '{deskName}': desk ? desk.name : '',
    };
    const fill = (s) => s.replace(/\{\w+\}/g, (m) => (m in sub ? sub[m] : m));
    w.task = { name: fill(tpl.name), steps: tpl.steps.map((s) => ({ ...s, target: fill(s.target), label: fill(s.label) })) };
    w.step = 0;
    ui.toast('New task: ' + w.task.name, '', 3500);
  }

  currentStep() {
    const w = this.work;
    return w && w.task ? w.task.steps[w.step] : null;
  }

  advanceTask() {
    const w = this.work;
    const s = this.currentStep();
    if (!s) return;
    if (s.carry) {
      this.player.carry = s.carry;
      this.setCarryMesh(s.carry);
    }
    if (s.drop) {
      this.player.carry = null;
      this.setCarryMesh(null);
    }
    w.step++;
    if (w.step >= w.task.steps.length) {
      w.done++;
      ui.toast(`Task complete! (${w.done}/${w.quota})`, 'good');
      this.player.carry = null;
      this.setCarryMesh(null);
      this.nextTask();
    }
  }

  // ---------------------------------------------------------------------
  async sleep() {
    const st = this.state;
    st.day++;
    st.shame = Math.max(0, st.shame - 20);
    st.complaints = 0;
    await this.saveGame();
    this.enterPhase('morning');
  }

  async saveGame() {
    const st = this.state;
    await storage.set('save', { day: st.day, shame: st.shame, cw: st.cw, eveningShown: st.eveningShown, savedAt: Date.now() });
  }

  win() {
    if (this.ended) return;
    this.ended = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.onEnd({ type: 'win', text: STORY.win(this.profile.name), shame: this.state.shame });
  }

  lose(title, text) {
    if (this.ended) return;
    this.ended = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.onEnd({ type: 'lose', title, text, day: this.state.day });
  }

  // ---------------------------------------------------------------------
  // Visual helpers
  makeMarker() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.6, 32),
      new THREE.MeshBasicMaterial({ color: 0x55efc4, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 12), new THREE.MeshBasicMaterial({ color: 0x55efc4 }));
    arrow.rotation.x = Math.PI;
    arrow.position.y = 2.3;
    g.add(ring, arrow);
    g.userData.arrow = arrow;
    g.visible = false;
    return g;
  }

  updateMarker() {
    const target = this.objectiveTarget();
    const m = this.markers;
    if (!target) {
      m.visible = false;
      return;
    }
    m.visible = true;
    m.position.set(target.x, 0, target.z);
    m.userData.arrow.position.y = 2.3 + Math.sin(performance.now() / 300) * 0.12;
  }

  objectiveTarget() {
    const L = this.level;
    if (!L) return null;
    const get = (id) => L.interactables.get(id);
    const ph = this.phase;
    if (ph === 'morning') {
      const m = this.morning;
      if (!m.wash) return get('sink');
      if (!m.eat) return get('kitchen');
      if (!m.dress) return get('wardrobe');
      return get('door');
    }
    if (ph === 'evening') return get('bed');
    if (ph === 'commute_am') return get('workdoor');
    if (ph === 'commute_pm') return get('homedoor');
    if (ph === 'work') {
      const w = this.work;
      if (!w.clockedIn) return get('timeclock');
      if (w.clockedOut) return get('exit');
      if (w.done >= w.quota) return get('timeclock');
      const s = this.currentStep();
      return s ? get(s.target) : null;
    }
    return null;
  }

  setCarryMesh(kind) {
    const p = this.player;
    if (p.carryMesh) {
      p.carryMesh.removeFromParent();
      p.carryMesh = null;
    }
    if (!kind) return;
    let m;
    if (kind === 'tray') {
      m = new THREE.Group();
      const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 20), new THREE.MeshStandardMaterial({ color: '#b2bec3' }));
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.04, 16), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
      plate.position.set(0.08, 0.03, 0);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.14, 12), new THREE.MeshStandardMaterial({ color: '#e17055' }));
      cup.position.set(-0.12, 0.08, 0.05);
      m.add(tray, plate, cup);
    } else if (kind === 'box') {
      m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.38), new THREE.MeshStandardMaterial({ color: '#c8a27a' }));
    } else {
      m = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.04), new THREE.MeshStandardMaterial({ color: '#0984e3' }));
    }
    m.traverse((o) => o.isMesh && (o.castShadow = true));
    p.carryMesh = m;
    this.scene.add(m);
  }

  updateCarryMesh() {
    const p = this.player;
    if (!p.carryMesh) return;
    const hip = this.hipPoint();
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const fwd = p.carry === 'box' ? 0.4 : 0.38;
    const up = p.carry === 'tray' ? 0.3 : p.carry === 'box' ? 0.12 : 0.05;
    p.carryMesh.position.set(p.x + fx * fwd, hip.y + up, p.z + fz * fwd);
    p.carryMesh.rotation.y = p.yaw;
  }

  // ---------------------------------------------------------------------
  updateHUD() {
    const st = this.state;
    const ph = this.phase;
    const titles = { morning: 'Morning', commute_am: 'Commute to work', work: 'At work', commute_pm: 'Commute home', evening: 'Evening' };
    ui.set('hud-day', `Day ${st.day} of 3 · ${esc(titles[ph] || '')}`);
    let time = '';
    if (ph === 'morning') time = '7:30 AM';
    else if (ph === 'commute_am') time = '8:30 AM';
    else if (ph === 'work') {
      const w = this.work;
      const steps = w.task ? w.step / w.task.steps.length : 0;
      const frac = w.clockedIn ? Math.min(1, (w.done + steps) / w.quota) : 0;
      const mins = 9 * 60 + Math.round(frac * 8 * 60);
      const h = Math.floor(mins / 60);
      const mm = String(mins % 60).padStart(2, '0');
      time = `${h > 12 ? h - 12 : h}:${mm} ${h >= 12 ? 'PM' : 'AM'} · ${esc(this.job.workplaceName)}`;
    } else if (ph === 'commute_pm') time = '5:30 PM';
    else time = '9:00 PM';
    ui.set('hud-time', time);

    let obj = '';
    if (ph === 'morning') {
      const m = this.morning;
      obj = !m.wash ? 'Wash up in the bathroom' : !m.eat ? 'Eat breakfast in the kitchen' : !m.dress ? 'Get dressed at the wardrobe' : 'Leave through the front door';
    } else if (ph === 'commute_am') obj = `Walk to ${this.job.workplaceName} (far end of the street, across the road)`;
    else if (ph === 'commute_pm') obj = 'Walk home to Maple Court Apartments';
    else if (ph === 'evening') obj = 'Go to bed';
    else if (ph === 'work') {
      const w = this.work;
      if (!w.clockedIn) obj = 'Clock in at the time clock';
      else if (w.clockedOut) obj = 'Leave through the front entrance';
      else if (w.done >= w.quota) obj = 'Clock out at the time clock';
      else obj = this.currentStep()?.label || '';
    }
    ui.set('hud-objective', '▶ ' + esc(obj));

    ui.meter('m-shame', st.shame / 100);
    ui.meter('m-comp', this.composure / 100);
    ui.set('hud-complaints', ph === 'work' ? `Complaints: ${st.complaints || 0}/3` : '');
    const p = this.player;
    let status = '';
    const exposed = p.char && !p.char.legwearOn;
    const atRisk = (ph === 'work' && this.work.clockedIn && !this.work.clockedOut) || this.stealth;
    if (atRisk && exposed) {
      if (this.seenBy) status = `<span style="color:#ff7675">⚠ SOMEONE IS LOOKING! (${this.seenBy})</span>`;
      else if (p.carry) status = `Exposed — holding a ${p.carry} in front`;
      else status = 'Exposed — stay out of sight';
      if (this.distraction) status += `<br><span style="color:#55efc4">Distraction: ${Math.ceil(this.distraction.t)}s</span>`;
    }
    ui.set('hud-status', status);

    if (ph === 'work' && this.work.clockedIn) {
      const w = this.work;
      let html = `<b>Tasks: ${w.done}/${w.quota}</b>`;
      if (w.task) {
        html += `<div style="margin-top:6px">${esc(w.task.name)}</div>`;
        w.task.steps.forEach((s, i) => {
          html += `<div class="${i < w.step ? 'done' : i === w.step ? 'cur' : ''}">${i === w.step ? '▶ ' : '• '}${esc(s.label)}</div>`;
        });
      } else if (!w.clockedOut) html += `<div class="cur">▶ Clock out</div>`;
      const allies = this.profile.coworkers.filter((_, i) => st.cw[i].ally).map((c) => c.name);
      if (allies.length) html += `<div style="margin-top:8px;color:#a29bfe">Allies: ${esc(allies.join(', '))}</div>`;
      ui.set('hud-tasks', html);
    } else ui.set('hud-tasks', '');
  }

  updateTags() {
    const cam = this.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const p = this.player;
    const dt = 1 / 60;
    for (const n of this.npcs) {
      const el = n.el;
      if (n.bubbleT > 0) n.bubbleT -= dt;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      let html = '';
      if (n.bubbleT > 0) html += `<span class="bubble">${esc(n.bubbleText)}</span>`;
      if (n.suspicion > 0.05) {
        const s = n.suspicion;
        html += `<span style="color:${s > 0.65 ? '#ff4757' : '#ffd32a'}">${s > 0.65 ? '!' : '?'}</span>`;
      }
      if (n.kind === 'coworker' && d < 9) {
        const ally = this.state.cw[n.index].ally;
        html += `<span class="nm">${esc(n.name)}${ally ? ' ♥' : ''}</span>`;
      }
      if (!html) {
        el.style.display = 'none';
        continue;
      }
      tmpV.set(n.x, (n.char.height || 1.7) + 0.25, n.z).project(cam);
      if (tmpV.z > 1 || d > 30) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = 'block';
      el.style.left = ((tmpV.x + 1) / 2) * w + 'px';
      el.style.top = ((1 - tmpV.y) / 2) * h + 'px';
      if (el._h !== html) {
        el.innerHTML = html;
        el._h = html;
      }
    }
  }

  render() {
    const p = this.player;
    if (!p.char) return;
    // Camera orbit with collision
    const target = new THREE.Vector3(p.x, (p.char.height || 1.6) * (p.crouching ? 0.62 : 0.88), p.z);
    const c = this.cam;
    const dir = new THREE.Vector3(-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch));
    let dist = c.dist;
    if (this.level) {
      this.ray.set(target, dir);
      this.ray.far = dist;
      const hits = this.ray.intersectObjects(this.level.occluders, false);
      if (hits.length) dist = Math.max(0.6, hits[0].distance - 0.25);
    }
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.lookAt(target);
    if (this.sunOffset) {
      this.sun.position.set(p.x + this.sunOffset.x, this.sunOffset.y, p.z + this.sunOffset.z);
      this.sun.target.position.set(p.x, 0, p.z);
    }
    this.updateMarker();
    this.updateTags();
    this.renderer.render(this.scene, this.camera);
  }
}

export function controlsTable() {
  return `<table class="controls-table">
    <tr><td>Mouse</td><td>Look around (click the game to capture the mouse, or hold right button)</td></tr>
    <tr><td>W A S D</td><td>Move</td></tr>
    <tr><td>Shift</td><td>Run (looks strange at work)</td></tr>
    <tr><td>C / Ctrl</td><td>Crouch toggle / hold — hide your hips behind furniture</td></tr>
    <tr><td>E</td><td>Interact (hold for timed actions)</td></tr>
    <tr><td>Wheel</td><td>Zoom camera</td></tr>
    <tr><td>Esc</td><td>Pause</td></tr>
  </table>
  <p class="note">Stealth tips: yellow cones show where people are looking. Partitions, counters, shelves and hedges hide your underwear.
  Crouch behind desks. Carrying a tray, box or folder covers you from the front. Crouching or running in plain view drains Composure — at zero someone comes to check on you.</p>`;
}
