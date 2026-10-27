// Core game: days and phases (apartment, city commute, work, day-off errands,
// shops), player control incl. riding the bus, camera, stealth detection for
// the player and for sneaking coworkers, coworker reactions, manager write-ups,
// Hiphtia's blessing spreading, shame and win/lose conditions.
import * as THREE from 'three';
import { ui, esc } from './ui.js';
import { NPC, angDiff, pick, propMesh } from './npc.js';
import { createCharacter, createMannequin, randomColors, addAngelic } from './character.js';
import { buildApartment } from './levels/apartment.js';
import { buildCity } from './levels/city.js';
import { buildWorkplace } from './levels/workplace.js';
import { buildShop } from './levels/shop.js';
import { BusSystem, DOOR } from './bus.js';
import {
  JOBS, GENERIC_TASKS, STORY, MISHAPS, REPORT_REASONS, ERRANDS, PLACES,
  WEEKDAYS, weekday, isWorkday, CELESTI_DAY,
} from './data.js';
import { storage } from './storage.js';

const WALK = 2.0;
const RUN = 4.3;
const CROUCH = 1.1;
const LEND_TIME = 60;
const DISTRACT_TIME = 14;
const MIN_PER_SEC = 0.625; // game minutes per real second outside work
const PED_REACTIONS = [
  'Uh... did you forget something?', 'Wow. Bold fashion choice.', 'Did you lose a bet?!', '*stares in disbelief*',
  'Excuse me... your pants?!', 'Is this some kind of prank show?', '*whispers to a friend and giggles*', 'Hey! Nice underwear!',
];
const BUS_REACTIONS = ['*chokes on their coffee*', "Oh my— I'm not looking. I'm NOT looking.", '*slowly lowers their phone*', 'Excuse me, is this... a costume?', '*scoots as far away as possible*', '...wow.'];
const DISTRACT_LINES = [
  'Oh no! I dropped all my papers everywhere!', 'Whoa! Is that a spider?! Everyone look over here!', 'Ow! I think I sprained my ankle!',
  'Hey everyone, free donuts over here!', 'Oops! I spilled coffee all over the floor!',
];
const ODDBALL_LINES = ['Ooh, a stealth game? I LOVE stealth games. I\'m in!', 'Wait, is this a challenge? Hold my pants. Literally.', 'No way, we\'re doing a no-pants run? Count me in!'];
const fmtClock = (m) => {
  m = Math.floor(m);
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const tmpV = new THREE.Vector3();

export class Game {
  constructor(canvas, ctx, save, onEnd) {
    this.canvas = canvas;
    this.profile = ctx.profile;
    this.settings = ctx.settings || {};
    this.hooks = ctx.hooks || {};
    this.onEnd = onEnd;
    this.jobId = this.profile.job;
    this.job = JOBS[this.jobId];
    const n = this.profile.coworkers.length;
    const base = {
      day: 1, shame: 0, writeups: 0, pendingBless: null, pendingTalks: [], celestiMet: false, eveningShown: false, daily: {},
      cw: [],
    };
    this.state = Object.assign(base, JSON.parse(JSON.stringify(save || {})));
    for (let i = 0; i < n; i++) {
      this.state.cw[i] = Object.assign({ ally: false, warned: false, blessed: false, joined: false, playing: false, writeups: 0, fired: false }, this.state.cw[i] || {});
    }
    this.ui = ui;
    this.running = false;
    this.paused = false;
    this.keys = new Set();
    this.npcs = [];
    this.levels = {};
    this.shops = {};
    this.cwChars = [];
    this.cwRuntime = this.profile.coworkers.map(() => ({ lendCd: 0, distractCd: 0, bond: 0, complaints: 0 }));
    this.civPool = [];
    this.clock = 450;
    this.stamina = 100;

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
    sc.left = sc.bottom = -24;
    sc.right = sc.top = 24;
    sc.near = 1;
    sc.far = 140;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);
    this.cam = { yaw: Math.PI, pitch: 0.35, dist: 4.2 };
    this.player = { x: 0, z: 0, yaw: 0, speed: 0, crouch: false, carry: null, inter: null, borrow: null, bus: null, seat: null, lx: 0, lz: 0 };
    this.composure = 100;
    this.markers = this.makeMarker();
    this.scene.add(this.markers);
    this.bindInput();
    window.__game = this;
  }

  // =====================================================================
  // Loading
  async init() {
    ui.setScreen('<div class="loading">Building the city...</div>');
    await new Promise((r) => setTimeout(r, 30));
    this.levels.apartment = buildApartment();
    this.levels.city = buildCity({ workplaceName: this.job.workplaceName, jobColor: '#273c75' });
    ui.setScreen('<div class="loading">Building your workplace...</div>');
    await new Promise((r) => setTimeout(r, 30));
    this.levels.work = buildWorkplace(this.jobId, this.job, { coworkers: this.profile.coworkers });
    ui.setScreen('<div class="loading">Gathering townsfolk...</div>');
    await this.initCivilians();
    ui.hideScreen();
    window.addEventListener('resize', (this._onResize = () => this.resize()));
  }

  async getBuf(model) {
    return model && model.key ? await storage.getBlob(model.key) : null;
  }

  async initCivilians() {
    const tpls = [];
    for (const t of this.settings.civilians || []) {
      const buf = await storage.getBlob(t.key);
      if (buf) tpls.push({ key: t.key, buf });
    }
    this.civTemplates = tpls;
    const N = 46;
    for (let i = 0; i < N; i++) {
      let ch;
      if (tpls.length && i % 5 < 3) {
        const t = tpls[i % tpls.length];
        ch = await createCharacter({ vrm: t.buf, key: 'civ:' + t.key, randomize: true, underwearOverlay: false });
      } else ch = this.makeMannequinCiv();
      ch.civilian = true;
      this.civPool.push(ch);
    }
  }

  makeMannequinCiv() {
    const ch = createMannequin({ colors: randomColors(), legwearType: Math.random() < 0.4 ? 'skirt' : 'pants', scale: 0.92 + Math.random() * 0.14 });
    ch.civilian = true;
    return ch;
  }

  acquireCivilian() {
    const ch = this.civPool.length ? this.civPool.splice(Math.floor(Math.random() * this.civPool.length), 1)[0] : this.makeMannequinCiv();
    ch.root.visible = true;
    ch.root.rotation.set(0, 0, 0);
    ch.setLegwear(true);
    ch.setProp(null);
    return ch;
  }

  releaseCivilian(ch) {
    if (!ch) return;
    ch.root.removeFromParent();
    ch.setProp(null);
    if (!this.civPool.includes(ch)) this.civPool.push(ch);
  }

  outfitFor(def, key) {
    const sel = this.state.daily[key] || {};
    const o = def.outfits[sel.outfit || 0] || def.outfits[0];
    return { o, sel };
  }

  async charFromDef(def, key, full) {
    const { o, sel } = this.outfitFor(def, key);
    const ch = await createCharacter({
      vrm: await this.getBuf(o.model),
      key: o.model?.key,
      full,
      legwearMaterials: o.model?.legwearMaterials || null,
      underwearOverlay: o.model?.underwearOverlay !== false,
      colors: o.colors,
      legwearType: o.legwearType,
      tintTop: sel.top || null,
      tintBottom: sel.bottom || null,
    });
    ch.legwearType = o.legwearType === 'skirt' ? 'skirt' : 'pants';
    return ch;
  }

  /** (Re)build the player, coworker and manager characters for today's outfits. */
  async loadDayChars() {
    ui.setScreen('<div class="loading">Getting everyone dressed...</div>');
    if (this.player.char) {
      this.player.char.root.removeFromParent();
      this.player.char.dispose();
    }
    this.cwChars.forEach((c) => c && c.dispose());
    if (this.mgrChar) this.mgrChar.dispose();
    const p = this.profile;
    this.player.char = await this.charFromDef(p.player, 'player', true);
    this.scene.add(this.player.char.root);
    this.lw = this.player.char.legwearType;
    this.cwChars = [];
    for (let i = 0; i < p.coworkers.length; i++) {
      this.cwChars[i] = this.state.cw[i].fired ? null : await this.charFromDef(p.coworkers[i], 'cw' + i, false);
    }
    this.mgrChar = await this.charFromDef(p.manager, 'mgr', false);
    ui.hideScreen();
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
    this.enterPhase('morning', { first: true });
  }

  destroy() {
    this.running = false;
    this.unbindInput();
    window.removeEventListener('resize', this._onResize);
    this.clearNPCs();
    if (this.buses) this.buses.dispose();
    ui.showHUD(false);
    ui.borrow(null);
    ui.progress(null);
    ui.tagLayer.innerHTML = '';
    try {
      this.player.char?.dispose();
      this.cwChars.forEach((c) => c && c.dispose());
      this.mgrChar?.dispose();
      this.civPool.forEach((c) => c.dispose());
    } catch (_) {}
    this.renderer.dispose();
  }

  // =====================================================================
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
        this.cam.pitch = Math.max(-0.25, Math.min(1.3, this.cam.pitch + e.movementY * 0.0024));
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
    this._wh = (e) => (this.cam.dist = Math.max(1.8, Math.min(9, this.cam.dist + Math.sign(e.deltaY) * 0.4)));
    this._plc = () => {
      if (!document.pointerLockElement && this.running && !ui.dialogOpen && !this.paused && !this.transitioning && !this.ended) this.pause();
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
      `<div class="panel" style="max-width:420px;text-align:center"><h2>Paused</h2>
        <div class="menu"><button id="p-resume">Resume</button><button id="p-controls" class="secondary">Controls</button>
        <button id="p-quit" class="danger">Quit to Title</button></div>
        <p class="note">Progress is saved at the start of each day.</p></div>`,
      true
    );
    s.querySelector('#p-resume').onclick = () => this.resume();
    s.querySelector('#p-controls').onclick = () => {
      const c = ui.setScreen(`<div class="panel" style="max-width:560px"><h2>Controls</h2>${controlsTable()}<div class="footer"><span></span><button id="c-back">Back</button></div></div>`, true);
      c.querySelector('#c-back').onclick = () => this.pause();
    };
    s.querySelector('#p-quit').onclick = () => {
      this.ended = true;
      this.onEnd({ type: 'quit' });
    };
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

  // =====================================================================
  // Phases
  get isWorkday() {
    return isWorkday(this.state.day);
  }

  async enterPhase(phase, opts = {}) {
    this.transitioning = true;
    this.keys.clear();
    this.cancelInteract();
    if (!opts.first) await ui.fade(true);
    const prev = this.phase;
    if (this.player.bus) this.leaveBus(null, true);
    if (this.level) this.scene.remove(this.level.group);
    this.clearNPCs();
    if (this.buses && !['commute_am', 'commute_pm', 'dayoff'].includes(phase)) {
      this.buses.dispose();
      this.buses = null;
    }
    if (this.dog) {
      this.scene.remove(this.dog.mesh);
      this.dog = null;
    }
    const st = this.state;
    if (phase === 'morning') await this.prepareMorning();
    this.phase = phase;
    const p = this.player;
    p.carry = null;
    p.char.setProp(null);
    p.crouch = false;
    this.composure = 100;
    this.stamina = 100;
    this.distraction = null;
    this.complaints = this.complaints || 0;

    let L;
    if (phase === 'morning' || phase === 'evening') L = this.levels.apartment;
    else if (phase === 'work') L = this.levels.work;
    else if (phase === 'shop') L = this.shops[opts.place] || (this.shops[opts.place] = buildShop(opts.place));
    else L = this.levels.city;
    this.level = L;
    this.scene.add(L.group);
    let spawn = L.spawn;
    if (phase === 'evening') spawn = L.doorSpawn;
    if (phase === 'commute_am' || (phase === 'dayoff' && prev !== 'shop')) spawn = L.spawnHome;
    if (phase === 'commute_pm') spawn = L.spawnWork;
    if (phase === 'dayoff' && prev === 'shop') spawn = L.places[this.shopPlace].out;
    p.x = spawn.x;
    p.z = spawn.z;
    p.yaw = spawn.yaw;
    this.cam.yaw = spawn.yaw;
    this.cam.pitch = 0.35;
    this.setLighting(phase);
    ui.showComposure(phase === 'work');
    p.char.root.position.set(p.x, 0, p.z);
    p.char.root.rotation.y = p.yaw;
    this.scene.add(p.char.root);

    if (phase === 'morning') {
      this.morning = { wash: false, eat: false, dress: false };
      p.char.setLegwear(false);
      this.cam.dist = 3.2;
      this.clock = 450;
    } else if (phase === 'commute_am' || phase === 'commute_pm' || phase === 'dayoff') {
      if (phase === 'commute_am') this.clock = 480;
      if (phase === 'commute_pm') this.clock = 1050;
      if (phase === 'dayoff' && prev !== 'shop') this.clock = 600;
      p.char.setLegwear(phase === 'commute_am' && st.day === 1);
      if (!this.buses) this.buses = new BusSystem(this, L);
      this.spawnPedestrians(true);
      this.cam.dist = 4.5;
    } else if (phase === 'work') {
      this.lateMins = Math.round(this.clock - 540);
      this.clock = 540;
      this.work = { clockedIn: false, clockedOut: false, done: 0, quota: 5 + (st.day % 3), task: null, step: 0, lastTpl: null, sneakT: 0 };
      this.complaints = 0;
      p.char.setLegwear(st.day === 1);
      this.cwRuntime.forEach((r) => {
        r.bond = 0;
        r.complaints = 0;
      });
      this.spawnStaff();
      this.spawnInitialCustomers();
      this.customerTimer = 4;
      this.cam.dist = 3.8;
    } else if (phase === 'shop') {
      this.shopPlace = opts.place;
      p.char.setLegwear(false);
      this.errand = (this.errands || []).find((e) => e.place === opts.place && !e.done) || null;
      this.errandStep = 0;
      this.spawnShopPeople();
      this.customerTimer = 5;
      this.cam.dist = 3.5;
    } else if (phase === 'evening') {
      p.char.setLegwear(false);
      this.cam.dist = 3.2;
    }
    p.char.resetPhysics();
    this.updateHUD();
    await ui.fade(false);
    this.transitioning = false;
    this.last = performance.now();
    await this.phaseIntro(phase, prev);
  }

  async prepareMorning() {
    await ui.fade(false);
    if (this.hooks.chooseOutfits) {
      ui.showHUD(false);
      await this.hooks.chooseOutfits(this);
      ui.showHUD(true);
    }
    await this.loadDayChars();
    if (!this.isWorkday) {
      const pool = [...ERRANDS].sort(() => Math.random() - 0.5);
      this.errands = pool.slice(0, 3).map((e) => ({ ...e, done: false }));
      this.chaos = { encounterAt: 620 + Math.random() * 60, encounterDone: false, dogDone: false };
    } else this.errands = null;
    await this.saveGame();
  }

  async phaseIntro(phase, prev) {
    const st = this.state;
    const name = this.profile.name;
    const wd = WEEKDAYS[weekday(st.day)];
    if (phase === 'morning') {
      if (st.day === CELESTI_DAY && !st.celestiMet) await this.celestiScene();
      let text;
      if (st.day === 1) text = STORY.intro(name);
      else if (!this.isWorkday)
        text = `It's ${wd}! No work today.\n\nBut there are errands to run:\n${this.errands.map((e) => '• ' + e.name + ' — ' + PLACES[e.place].name).join('\n')}\n\nBeing seen in town won't get you fired, but it will add to your Shame. Buses can get you around faster.`;
      else
        text = `${wd} morning. ${name} wakes up and remembers the situation.\n\nGet ready, then head to work. You need to be there by 9:00 AM. The bus is faster than walking, but it doesn't go straight to ${this.job.workplaceName}.`;
      await this.dialog(`Day ${st.day} — ${wd}`, text);
    } else if (phase === 'commute_am') {
      ui.toast(`Get to ${this.job.workplaceName} by 9:00. Bus stops are marked with colored BUS signs.`, '', 6000);
      if (st.day > 1) ui.toast('People who notice you raise your Shame. Hedges, bushes and parks give cover.', 'bad', 6000);
    } else if (phase === 'work') {
      ui.toast('Clock in at the time clock in the locker room (through the STAFF ONLY doors).', '', 6000);
      if (this.lateMins > 0) ui.toast(`You're ${this.lateMins} minutes late!`, 'bad', 5000);
    } else if (phase === 'commute_pm') {
      ui.toast('Shift over! Get home to Maple Court Apartments.', '', 5000);
    } else if (phase === 'dayoff' && prev !== 'shop') {
      ui.toast('Run your errands. Your apartment is at Maple Court, the shops are all over town.', '', 6000);
    } else if (phase === 'shop') {
      if (this.errand) ui.toast(`Errand: ${this.errand.name}`, '', 4000);
      else ui.toast('Nothing to do here today.', '', 3000);
    } else if (phase === 'evening') {
      if (st.day === 1 && !st.eveningShown) {
        st.eveningShown = true;
        await this.dialog('Wardrobe Disaster', STORY.day1Evening(this.lw));
      }
      if (st.celestiMet && this.allBlessed()) {
        await this.win();
        return;
      }
      ui.toast('Get some sleep.', '', 4000);
    }
  }

  setLighting(phase) {
    const s = this.scene;
    const outdoor = ['commute_am', 'commute_pm', 'dayoff'].includes(phase);
    if (outdoor) {
      const evening = phase === 'commute_pm';
      const sky = evening ? '#f0a46a' : phase === 'dayoff' ? '#9fd3ff' : '#a9d6ff';
      s.background = new THREE.Color(sky);
      s.fog = new THREE.Fog(sky, 60, 190);
      this.hemi.color.set(evening ? '#ffd2b0' : '#dff1ff');
      this.hemi.groundColor.set(evening ? '#5a4050' : '#7a6a5a');
      this.hemi.intensity = evening ? 1.0 : 1.25;
      this.sun.color.set(evening ? '#ffb27a' : '#fff2db');
      this.sun.intensity = evening ? 1.8 : 2.3;
      this.sunOffset = evening ? new THREE.Vector3(-25, 14, -10) : new THREE.Vector3(18, 30, 10);
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

  // =====================================================================
  // NPC management
  clearNPCs() {
    for (const n of this.npcs) {
      n.destroy();
      if (n.char.civilian) this.releaseCivilian(n.char);
    }
    this.npcs = [];
  }

  removeNPC(n) {
    n.destroy();
    if (n.char.civilian) this.releaseCivilian(n.char);
    this.npcs = this.npcs.filter((x) => x !== n);
  }

  cwNPC(i) {
    return this.npcs.find((n) => n.kind === 'coworker' && n.index === i);
  }

  spawnStaff() {
    const L = this.level;
    const ws = [...L.pois.workstations];
    this.profile.coworkers.forEach((c, i) => {
      const cw = this.state.cw[i];
      const ch = this.cwChars[i];
      if (cw.fired || !ch) return;
      const st = ws[i % ws.length];
      cw.playing = cw.joined && !cw.blessed && Math.random() < 0.6;
      const n = new NPC(this, ch, {
        kind: 'coworker', name: c.name, personality: c.personality, index: i, station: st, legwearType: ch.legwearType,
        x: st.x, z: st.z, yaw: st.yaw, range: 13, speed: 1.25 + Math.random() * 0.15,
      });
      this.setSneaking(n, cw.blessed || cw.playing);
      n.plan([{ work: true, t: 2 + Math.random() * 6, yaw: st.yaw }]);
      this.npcs.push(n);
    });
    const m = L.pois.manager;
    this.mgrChar.setLegwear(true);
    const mgr = new NPC(this, this.mgrChar, {
      kind: 'manager', name: this.profile.manager.name, x: m.desk.x, z: m.desk.z, yaw: m.desk.yaw, range: 14, speed: 1.2,
    });
    mgr.plan([{ work: true, t: 10, yaw: m.desk.yaw }]);
    this.manager = mgr;
    this.npcs.push(mgr);
  }

  setSneaking(n, on) {
    n.sneaking = on;
    n.char.setLegwear(!on);
  }

  // ---- brains ----
  coworkerBrain(n) {
    const L = this.level;
    const r = Math.random();
    if (n.sneaking && r < 0.3 && L.pois.hideSpots.length) {
      const h = pick(L.pois.hideSpots);
      n.plan([{ go: h }, { hide: true, t: 6 + Math.random() * 9 }]);
      return;
    }
    if (r < 0.12) {
      const s = pick([...L.stationsByTag('coffee'), ...L.stationsByTag('fridge'), ...L.stationsByTag('microwave')]);
      if (s) return n.plan([{ go: s }, { work: true, t: 5 + Math.random() * 5, yaw: s.yaw }]);
    }
    if (r < 0.18) {
      const s = pick(L.stationsByTag('sink'));
      if (s) return n.plan([{ go: s }, { work: true, t: 4, yaw: s.yaw }]);
    }
    if (r < 0.7) {
      const tpl = pick(this.taskPool());
      const task = tpl && this.resolveTask(tpl);
      if (task) {
        const steps = [];
        for (const s of task.steps) {
          steps.push({ go: s.station, carry: undefined });
          steps.push({ work: true, t: s.time * 2 + 1 + Math.random() * 2, yaw: s.station.yaw, carry: s.carry, drop: s.drop });
        }
        return n.plan(steps);
      }
    }
    const st = n.station;
    n.plan([{ go: st }, { work: true, t: 10 + Math.random() * 10, yaw: st.yaw }]);
  }

  managerBrain(n) {
    const L = this.level;
    const m = L.pois.manager;
    if (Math.random() < 0.45) return n.plan([{ go: m.desk }, { work: true, t: 12 + Math.random() * 10, yaw: m.desk.yaw }]);
    const pts = [pick(L.pois.wander), pick(L.pois.wander), pick(L.pois.wander)];
    n.plan(pts.flatMap((p) => [{ go: p }, { t: 3 + Math.random() * 3 }]));
  }

  pedestrianBrain(n) {
    if (n.idleSpot) return n.plan([{ sit: !!n.idleSpot.sit, t: 20 + Math.random() * 40, yaw: n.idleSpot.yaw }]);
    const G = this.level.pedGraph;
    const node = G[n.node];
    let opts = node.n.filter((k) => k !== n.prevNode);
    if (!opts.length) opts = node.n;
    const k = pick(opts);
    n.prevNode = n.node;
    n.node = k;
    const t = G[k];
    const steps = [{ go: { x: t.x + (Math.random() - 0.5), z: t.z + (Math.random() - 0.5) } }];
    if (Math.random() < 0.15) steps.push({ t: 2 + Math.random() * 3 });
    n.plan(steps);
  }

  // ---- customers ----
  freeSpot() {
    const spots = (this.level.pois.customerSpots || []).filter((s) => !s.taken);
    return spots.length ? pick(spots) : null;
  }

  customerPlan(c, first) {
    const visits = 1 + Math.floor(Math.random() * 3);
    const steps = [];
    for (let i = 0; i < visits; i++) {
      const spot = i === 0 && first ? first : this.freeSpot();
      if (!spot) break;
      spot.taken = true;
      steps.push({ go: spot }, { sit: !!spot.sit, t: 15 + Math.random() * 30, yaw: spot.yaw, call: () => {} }, { t: 0, call: () => (spot.taken = false) });
    }
    c.plan(steps);
  }

  spawnInitialCustomers() {
    const L = this.level;
    (L.pois.customerSpots || []).forEach((s) => (s.taken = false));
    const n = Math.ceil((L.maxCustomers || 4) * 0.6);
    for (let i = 0; i < n; i++) {
      const spot = this.freeSpot();
      if (!spot) break;
      const c = new NPC(this, this.acquireCivilian(), { kind: 'customer', name: this.job.customerWord, x: spot.x, z: spot.z, yaw: spot.yaw, range: 9, speed: 1.1 });
      spot.taken = true;
      c.plan([{ sit: !!spot.sit, t: 10 + Math.random() * 40, yaw: spot.yaw }, { t: 0, call: () => (spot.taken = false) }]);
      c.sitting = !!spot.sit;
      this.npcs.push(c);
    }
  }

  spawnCustomer(word) {
    const L = this.level;
    const count = this.npcs.filter((n) => n.kind === 'customer').length;
    if (count >= (L.maxCustomers || 4)) return;
    const spot = this.freeSpot();
    if (!spot) return;
    const e = L.pois.entrance;
    const c = new NPC(this, this.acquireCivilian(), { kind: 'customer', name: word || this.job.customerWord, x: e.x, z: e.z, yaw: Math.PI, range: 9, speed: 1.1 });
    this.customerPlan(c, spot);
    this.npcs.push(c);
  }

  spawnShopPeople() {
    const L = this.level;
    (L.pois.customerSpots || []).forEach((s) => (s.taken = false));
    for (const c of L.pois.clerks) {
      const n = new NPC(this, this.acquireCivilian(), { kind: 'clerk', name: 'clerk', x: c.x, z: c.z, yaw: c.yaw, range: 10 });
      n.plan([{ work: true, t: 9999, yaw: c.yaw }]);
      this.npcs.push(n);
    }
    L.pois.queue.forEach((q, i) => {
      if (i === 0 || Math.random() < 0.3) return;
      const n = new NPC(this, this.acquireCivilian(), { kind: 'customer', name: 'shopper', x: q.x, z: q.z, yaw: Math.PI + 0.01, range: 8 });
      n.plan([{ t: 20 + Math.random() * 30, yaw: Math.PI }]);
      this.npcs.push(n);
    });
    for (let i = 0; i < 4; i++) {
      const spot = this.freeSpot();
      if (!spot) break;
      spot.taken = true;
      const n = new NPC(this, this.acquireCivilian(), { kind: 'customer', name: 'shopper', x: spot.x, z: spot.z, yaw: spot.yaw, range: 9 });
      n.sitting = !!spot.sit;
      n.plan([{ sit: !!spot.sit, t: 10 + Math.random() * 30, yaw: spot.yaw }, { t: 0, call: () => (spot.taken = false) }]);
      this.npcs.push(n);
    }
  }

  // ---- pedestrians (city) ----
  pedTarget() {
    const rush = this.isWorkday && ((this.clock > 470 && this.clock < 560) || (this.clock > 1000 && this.clock < 1110));
    return rush ? 30 : this.isWorkday ? 22 : 26;
  }

  spawnPedestrians(initial) {
    const L = this.level;
    const G = L.pedGraph;
    const p = this.player;
    const peds = this.npcs.filter((n) => n.kind === 'pedestrian');
    // recycle far ones
    for (const n of peds) {
      if (Math.hypot(n.x - p.x, n.z - p.z) > 95 && !n.coworkerEncounter) this.removeNPC(n);
    }
    let count = this.npcs.filter((n) => n.kind === 'pedestrian').length;
    const want = this.pedTarget();
    let guard = 0;
    while (count < want && guard++ < 60) {
      // pick an edge near the player
      const a = Math.floor(Math.random() * G.length);
      const b = pick(G[a].n);
      const t = Math.random();
      const x = G[a].x + (G[b].x - G[a].x) * t;
      const z = G[a].z + (G[b].z - G[a].z) * t;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > 80 || (!initial && d < 30) || (initial && d < 6)) continue;
      const idle = Math.random() < 0.18 ? L.pois.benches.filter((s) => Math.hypot(s.x - p.x, s.z - p.z) < 80 && !s.taken) : null;
      let n;
      if (idle && idle.length) {
        const s = pick(idle);
        s.taken = true;
        n = new NPC(this, this.acquireCivilian(), { kind: 'pedestrian', x: s.x, z: s.z, yaw: s.yaw, range: 12, speed: 1.2 });
        n.idleSpot = s;
        n.sitting = !!s.sit;
      } else {
        n = new NPC(this, this.acquireCivilian(), { kind: 'pedestrian', x, z, range: 13, speed: 1.1 + Math.random() * 0.4 });
        n.node = b;
        n.prevNode = a;
        n.plan([{ go: { x: G[b].x, z: G[b].z } }]);
      }
      this.npcs.push(n);
      count++;
    }
  }

  allBodies() {
    const out = [];
    if (!this.player.bus) out.push({ x: this.player.x, z: this.player.z });
    for (const n of this.npcs) out.push(n);
    if (this.buses) for (const b of this.buses.buses) out.push({ x: b.x, z: b.z, big: true, bus: b });
    return out;
  }

  // =====================================================================
  // Main update
  update(dt) {
    const t = performance.now() / 1000;
    const p = this.player;
    const L = this.level;
    if (!L) return;
    const outdoorOrShop = ['commute_am', 'commute_pm', 'dayoff', 'shop'].includes(this.phase);
    if (outdoorOrShop) this.clock += dt * MIN_PER_SEC;

    if (p.bus) this.updateBusPlayer(dt);
    else this.updateWalking(dt);

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
    const exposed = !p.char.legwearOn;
    const atHome = this.phase === 'morning' || this.phase === 'evening';
    p.char.update(dt, { speed: p.speed, crouch: p.crouching && !p.seat, sit: !!p.seat, carry: !!p.carry || !!p.inter, cover: exposed && !atHome });
    if (!p.bus) {
      p.char.root.position.set(p.x, 0, p.z);
      p.char.root.rotation.y = p.yaw;
    }

    L.update(dt, this);
    for (const n of [...this.npcs]) if (!n.removed) n.update(dt, t);
    if (this.buses) this.buses.update(dt);
    for (const r of this.cwRuntime) {
      r.lendCd = Math.max(0, r.lendCd - dt);
      r.distractCd = Math.max(0, r.distractCd - dt);
    }
    if (this.phase === 'work' || this.phase === 'shop') {
      this.customerTimer -= dt;
      if (this.customerTimer <= 0) {
        this.customerTimer = 5 + Math.random() * 9;
        this.spawnCustomer(this.phase === 'shop' ? 'shopper' : null);
      }
    }
    if (['commute_am', 'commute_pm', 'dayoff'].includes(this.phase)) {
      this.pedTimer = (this.pedTimer || 0) - dt;
      if (this.pedTimer <= 0) {
        this.pedTimer = 1;
        this.spawnPedestrians(false);
      }
      if (this.phase === 'dayoff') this.updateChaos(dt);
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
    } else if (p.bus) {
      const b = p.bus;
      const st = b.currentStop || b.stopAt(b.nextStop);
      ui.borrow(`${b.line.name} — ${b.state === 'dwell' ? 'Stopped at' : 'Next stop:'} ${st.name}`);
    } else ui.borrow(null);

    this.detect(dt);
    if (this.phase === 'work') {
      this.detectSneakers(dt);
      this.updateBonding(dt);
    }
    if (p.bus) this.busExposure(dt);

    const sh = this.state.shame / 100;
    p.char.setEmotion('blush', exposed && !atHome ? 1 : sh);
    p.char.setEmotion('sad', Math.min(0.6, sh * 0.6));
    ui.vignette(sh * sh);
    this.updatePrompt();
    this.updateHUD();
  }

  updateWalking(dt) {
    const p = this.player;
    const L = this.level;
    let mx = 0;
    let mz = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) mz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    const crouch = p.crouch || k.has('ControlLeft');
    let running = (k.has('ShiftLeft') || k.has('ShiftRight')) && !crouch && this.stamina > 1;
    let speed = 0;
    if ((mx || mz) && p.inter) this.cancelInteract();
    if ((mx || mz) && !p.inter) {
      const cy = this.cam.yaw;
      let dx = Math.sin(cy) * mz - Math.cos(cy) * mx;
      let dz = Math.cos(cy) * mz + Math.sin(cy) * mx;
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
      speed = crouch ? CROUCH : running ? RUN : WALK;
      const r = L.resolve(p.x + dx * speed * dt, p.z + dz * speed * dt, 0.3);
      p.x = r.x;
      p.z = r.z;
      p.yaw += angDiff(Math.atan2(dx, dz), p.yaw) * Math.min(1, dt * 12);
    } else running = false;
    this.stamina = running ? Math.max(0, this.stamina - 16 * dt) : Math.min(100, this.stamina + 10 * dt);
    for (const n of this.npcs) {
      const dx = p.x - n.x;
      const dz = p.z - n.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.55 && d > 0.001) {
        p.x = n.x + (dx / d) * 0.55;
        p.z = n.z + (dz / d) * 0.55;
      }
    }
    if (L.cars) this.vehicleCollide();
    p.speed += (speed - p.speed) * Math.min(1, dt * 12);
    p.running = running && speed > 0;
    p.crouching = crouch;
  }

  vehicleCollide() {
    const p = this.player;
    const boxes = this.level.cars.map((c) => ({
      x: c.axis === 'z' ? c.lane : c.pos, z: c.axis === 'z' ? c.pos : c.lane, yaw: c.g.rotation.y, hw: 1.05, hl: 2.3,
    }));
    if (this.buses) for (const b of this.buses.buses) boxes.push({ x: b.x, z: b.z, yaw: b.yaw, hw: 1.5, hl: 5.8 });
    for (const c of boxes) {
      const cs = Math.cos(c.yaw);
      const sn = Math.sin(c.yaw);
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const lx = dx * cs - dz * sn;
      const lz = dx * sn + dz * cs;
      if (Math.abs(lx) < c.hw && Math.abs(lz) < c.hl) {
        let nx = lx;
        let nz = lz;
        if (c.hw - Math.abs(lx) < c.hl - Math.abs(lz)) nx = Math.sign(lx || 1) * c.hw;
        else nz = Math.sign(lz || 1) * c.hl;
        p.x = c.x + nx * cs + nz * sn;
        p.z = c.z - nx * sn + nz * cs;
        if (!this._honk || performance.now() - this._honk > 3000) {
          this._honk = performance.now();
          ui.toast('*HONK!* Watch the road!', 'bad', 2000);
        }
      }
    }
  }

  // =====================================================================
  // Riding the bus
  boardBus(bus) {
    const p = this.player;
    this.cancelInteract();
    p.bus = bus;
    p.seat = null;
    p.lx = DOOR.x + 0.2;
    p.lz = DOOR.z;
    bus.group.add(p.char.root);
    p.char.root.position.set(p.lx, 0.15, p.lz);
    this.cam.pitch = Math.max(this.cam.pitch, 0.7);
    this.cam.dist = Math.min(this.cam.dist, 4.2);
    if (!bus.materialized) bus.materialize();
    if (!p.char.legwearOn) {
      this.addShame(5);
      ui.toast(`Driver: "${pick(['Fare is... uh... wow. Just get on.', 'Ma\'am? Sir? Your... never mind.', '*stares, then looks firmly at the road*'])}"`, 'bad', 4500);
    }
    ui.toast('Walk down the aisle and press E to sit. Window seats are safer.', '', 5000);
  }

  leaveBus(stop, silent = false) {
    const p = this.player;
    const bus = p.bus;
    if (!bus) return;
    if (p.seat) p.seat.occ = null;
    p.seat = null;
    p.bus = null;
    this.scene.add(p.char.root);
    if (stop) {
      p.x = stop.x;
      p.z = stop.z;
      p.yaw = stop.yaw + Math.PI / 2;
    } else {
      const w = bus.localToWorld(-2.2, DOOR.z);
      p.x = w.x;
      p.z = w.z;
    }
    p.char.root.position.set(p.x, 0, p.z);
    if (!silent) ui.toast(`Got off at ${stop ? stop.name : 'the stop'}.`, '', 3000);
  }

  updateBusPlayer(dt) {
    const p = this.player;
    const bus = p.bus;
    const k = this.keys;
    let mx = 0;
    let mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    let speed = 0;
    if (!p.seat && (mx || mz) && !p.inter) {
      const cy = this.cam.yaw - bus.yaw;
      let dx = Math.sin(cy) * mz - Math.cos(cy) * mx;
      let dz = Math.cos(cy) * mz + Math.sin(cy) * mx;
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
      speed = 1.4;
      let nx = p.lx + dx * speed * dt;
      let nz = p.lz + dz * speed * dt;
      nz = Math.max(-5.1, Math.min(4.5, nz));
      if (nz < 3.0) nx = Math.max(-0.28, Math.min(0.28, nx));
      else nx = Math.max(-1.15, Math.min(nz > 4.2 ? 0.3 : 0.9, nx));
      p.lx = nx;
      p.lz = nz;
      p.lyaw = Math.atan2(dx, dz);
    }
    p.speed += (speed - p.speed) * Math.min(1, dt * 12);
    p.moving = speed > 0;
    if (p.seat) {
      p.lx = p.seat.x;
      p.lz = p.seat.z;
      p.lyaw = 0;
    }
    p.char.root.position.set(p.lx, 0.15, p.lz);
    p.char.root.rotation.y = p.lyaw || 0;
    const w = bus.localToWorld(p.lx, p.lz);
    p.x = w.x;
    p.z = w.z;
    p.yaw = bus.yaw + (p.lyaw || 0);
    p.crouching = false;
    p.running = false;
  }

  busSeatOptions() {
    const p = this.player;
    const bus = p.bus;
    let best = null;
    for (const s of bus.seats) {
      if (s.occ) continue;
      if (Math.abs(s.z - p.lz) > 0.55) continue;
      if (!best || s.window > best.window) best = s;
    }
    return best;
  }

  busExposure(dt) {
    const p = this.player;
    const bus = p.bus;
    if (p.char.legwearOn || !bus.materialized) return;
    let watchers = 0;
    for (const q of bus.passengers) {
      if (q.delay > 0) continue;
      q.noticedPlayer = Math.max(0, (q.noticedPlayer || 0) - dt);
      const d = Math.hypot(q.x - p.lx, q.z - p.lz);
      // passing each other in the aisle
      if (d < 0.9 && (q.walking || p.moving) && q.noticedPlayer <= 0) {
        q.noticedPlayer = 30;
        this.addShame(3);
        ui.toast(`Passenger: "${pick(BUS_REACTIONS)}"`, 'bad', 3000);
      }
      // sitting right next to you
      if (p.seat && q.seat && !q.walk.length && q.seat.row === p.seat.row && q.seat.side === p.seat.side) {
        if (!q.neighborNoticed) {
          q.neighborNoticed = true;
          this.addShame(4);
          ui.toast('The passenger sitting next to you does a slow double take...', 'bad', 3500);
        }
        this.addShame(0.15 * dt, true);
      }
      // standing: everyone behind you (facing forward) can see you
      if (!p.seat && !q.walk.length && q.z < p.lz - 0.3 && p.lz - q.z < 8) watchers++;
    }
    if (!p.seat && watchers) {
      this.addShame(Math.min(1.8, 0.12 * watchers) * dt, true);
      this.seenBy = watchers;
    } else this.seenBy = 0;
  }

  busETA(lineId, stop) {
    let best = Infinity;
    for (const b of this.buses?.buses || []) {
      if (b.line.id !== lineId) continue;
      if (b.state === 'dwell' && b.currentStop === stop) return 0;
      const total = b.line.total;
      const ahead = (stop.s - b.s + total) % total;
      const between = b.line.stops.filter((s) => {
        const a = (s.s - b.s + total) % total;
        return a > 0.5 && a < ahead - 0.5;
      }).length;
      best = Math.min(best, ahead / 9 + between * 7);
    }
    return best;
  }

  busFill(bus) {
    const c = this.clock;
    let f;
    if (this.isWorkday && c > 465 && c < 570) f = 0.95 + Math.random() * 0.25;
    else if (this.isWorkday && c > 1000 && c < 1120) f = 0.8 + Math.random() * 0.25;
    else if (this.isWorkday) f = 0.35 + Math.random() * 0.3;
    else f = 0.3 + Math.random() * 0.45;
    if (bus.line.id === 'red') f += 0.08;
    return f;
  }

  // =====================================================================
  // Stealth
  hipPoint() {
    const hb = this.player.char.bone('hips');
    if (hb) {
      hb.getWorldPosition(tmpV);
      tmpV.y -= 0.04;
      return tmpV.clone();
    }
    return new THREE.Vector3(this.player.x, this.player.char.hipHeight, this.player.z);
  }

  /** Does this NPC already know/share the secret (won't report the player)? */
  complicit(n) {
    if (n.kind !== 'coworker') return false;
    const cw = this.state.cw[n.index];
    return cw.blessed || cw.playing || (cw.ally && ['friend', 'sympathetic'].includes(n.personality));
  }

  stealthActive() {
    if (this.player.char.legwearOn) return false;
    if (this.phase === 'work') return true;
    return ['commute_am', 'commute_pm', 'dayoff', 'shop'].includes(this.phase);
  }

  detect(dt) {
    const p = this.player;
    const work = this.phase === 'work';
    const active = this.stealthActive() && !p.bus;
    const hip = this.hipPoint();
    const chest = hip.clone();
    chest.y += 0.45;
    let seenBy = 0;
    const watchers = [];
    const L = this.level;
    for (const n of this.npcs) {
      n.updateConeVisual(active);
      if (!active || !n.canSee()) {
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
          seesHip = L.lineOfSight(eye, hip);
          seesBody = seesHip || L.lineOfSight(eye, chest);
        }
      }
      if (seesBody) watchers.push(n);
      let covered = false;
      if (p.carry && seesHip) {
        const toN = Math.atan2(n.x - p.x, n.z - p.z);
        if (Math.abs(angDiff(toN, p.yaw)) < (p.carryCover || 1)) covered = true;
      }
      const canNotice = seesHip && !covered && !this.complicit(n) && n.noticeCooldown <= 0;
      if (canNotice) {
        seenBy++;
        let rate = 0.55 * (1.5 - dist / n.range);
        if (n.kind === 'customer' || n.kind === 'pedestrian') rate *= 0.8;
        if (p.crouching) rate *= 0.7;
        if (p.running) rate *= 1.3;
        n.suspicion += rate * dt;
      } else n.suspicion = Math.max(0, n.suspicion - 0.5 * dt);
      if ((n.kind === 'pedestrian' || n.kind === 'clerk') && n.noticeCooldown > 0 && seesHip && !covered) this.addShame(0.8 * dt, true);
      if (n.suspicion >= 1) {
        n.suspicion = 0;
        this.caught(n);
        return;
      }
    }
    if (!p.bus) this.seenBy = seenBy;
    if (work && active) {
      const odd = watchers.filter((n) => n.kind !== 'pedestrian' && !this.complicit(n));
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
          this.bubble(n, n.kind === 'coworker' || n.kind === 'manager' ? `${this.profile.name}? You're acting really weird...` : 'What is that employee doing?');
          ui.toast(`You're acting strange! ${n.kind === 'customer' ? 'A ' + n.name : n.name} is coming to check on you.`, 'bad');
        }
      }
    }
  }

  /** NPCs noticing sneaking coworkers (blessed / oddballs / lending friends). */
  detectSneakers(dt) {
    this.work.sneakT -= dt;
    if (this.work.sneakT > 0) return;
    const step = 0.2;
    this.work.sneakT = step;
    const L = this.level;
    const sneakers = this.npcs.filter((n) => n.kind === 'coworker' && n.sneaking && !n.char.legwearOn && n.state !== 'hiding' && n.state !== 'talk');
    if (!sneakers.length) return;
    for (const o of this.npcs) {
      if (!o.canSee() || o.sneaking) continue;
      for (const s of sneakers) {
        if (s === o) continue;
        if (o.kind === 'coworker' && (this.complicit(o) || ['friend', 'sympathetic', 'oddball'].includes(o.personality))) continue;
        const dx = s.x - o.x;
        const dz = s.z - o.z;
        const d = Math.hypot(dx, dz);
        let sees = false;
        if (d < o.range && Math.abs(angDiff(Math.atan2(dx, dz), o.lookYaw)) < o.fov / 2) sees = L.lineOfSight(o.eye(), s.hip());
        let v = o.npcSusp.get(s) || 0;
        if (sees) {
          s.watchedT = 1.2;
          let rate = 0.45 * (1.5 - d / o.range);
          if (s.crouch) rate *= 0.5;
          if (s.carry) rate *= 0.6;
          v += rate * step;
        } else v = Math.max(0, v - 0.5 * step);
        if (v <= 0) o.npcSusp.delete(s);
        else o.npcSusp.set(s, v);
        if (v >= 1) {
          o.npcSusp.delete(s);
          this.npcCaught(o, s);
        }
      }
    }
  }

  npcCaught(o, s) {
    const cw = this.state.cw[s.index];
    const rt = this.cwRuntime[s.index];
    if (o.kind === 'customer') {
      rt.complaints++;
      this.bubble(o, `Excuse me! That employee isn't wearing ${s.legwearType}!`);
      ui.toast(`A ${o.name} spotted ${s.name}! (${rt.complaints}/3 complaints)`, '', 4000);
      if (rt.complaints >= 3) {
        rt.complaints = 0;
        this.writeupNPC(s, `${s.name} got three customer complaints and was called to the manager's office!`);
      } else this.flee(s);
      return;
    }
    if (o.kind === 'manager') {
      this.bubble(o, `${s.name}! My office. NOW.`);
      this.writeupNPC(s, `${o.name} caught ${s.name} without ${s.legwearType}!`);
      return;
    }
    // reporting coworker
    this.bubble(o, `${s.name}?! I'm telling the manager.`);
    this.writeupNPC(s, `${o.name} reported ${s.name} to the manager!`);
    void cw;
  }

  flee(s) {
    const L = this.level;
    if (L.pois.hideSpots.length) s.plan([{ go: pick(L.pois.hideSpots) }, { hide: true, t: 8 }]);
  }

  writeupNPC(s, msg) {
    const cw = this.state.cw[s.index];
    cw.writeups++;
    ui.toast(`${msg} (${s.name}: write-up ${Math.min(3, cw.writeups)}/3)`, 'bad', 5000);
    const m = this.level.pois.manager;
    if (cw.writeups >= 3) {
      cw.fired = true;
      ui.toast(`${s.name} has been FIRED.`, 'bad', 6000);
      const e = this.level.pois.entrance;
      s.plan([{ go: m.stand }, { t: 6, yaw: Math.PI }, { go: e }, { call: () => this.removeNPC(s) }]);
      if (this.player.borrow?.npc === s) this.endBorrow(true);
      return;
    }
    s.plan([{ go: m.stand }, { t: 8, yaw: Math.PI }]);
  }

  updateBonding(dt) {
    if (!this.state.celestiMet || !this.work.clockedIn || this.work.clockedOut) return;
    const p = this.player;
    this.bondT = (this.bondT || 0) - dt;
    if (this.bondT > 0) return;
    this.bondT = 0.25;
    const L = this.level;
    for (const n of this.npcs) {
      if (n.kind !== 'coworker') continue;
      if (this.state.cw[n.index].blessed) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < 4.5 && L.segmentClear(p.x, p.z, n.x, n.z, 0.05)) this.cwRuntime[n.index].bond += 0.25 * (d < 2 ? 1.5 : 1);
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
      this.lose('Overwhelmed', `It's all too much. ${this.profile.name}'s face burns bright red, and they flee home, vowing never to leave the apartment again.\n\nToo much shame.`);
    }
  }

  // =====================================================================
  // Getting caught
  async caught(n) {
    const name = this.profile.name;
    if (n.kind === 'pedestrian' || n.kind === 'clerk' || (n.kind === 'customer' && this.phase === 'shop')) {
      if (n.coworkerEncounter) return this.weekendEncounter(n);
      n.noticeCooldown = 25;
      this.bubble(n, pick(PED_REACTIONS));
      this.addShame(7);
      return;
    }
    this.cancelInteract();
    n.plan([]);
    n.state = 'talk';
    if (n.kind === 'manager') {
      await this.managerTalk('manager');
      if (!n.removed) n.plan([{ t: 2 }]);
      return;
    }
    if (n.kind === 'customer') {
      this.complaints++;
      this.addShame(10);
      if (this.ended) return;
      const c = this.complaints;
      await this.dialog(`A ${this.job.customerWord} noticed!`, `"Excuse me?! Is that... your UNDERWEAR?! I want to speak to a manager!"\n\nThe ${this.job.customerWord} storms off to complain. (${c}/3 complaints today)`);
      if (this.ended || n.removed || this.phase !== 'work') return;
      n.vision = false;
      n.leaving = false;
      n.brain();
      if (c >= 3) {
        this.complaints = 0;
        await this.managerTalk('complaints');
      }
      return;
    }
    // coworker
    const cw = this.state.cw[n.index];
    const pers = n.personality;
    const nm = n.name;
    const lw = this.lw;
    const after = () => {
      if (!n.removed && n.state === 'talk') n.plan([{ t: 1.5 }]);
    };
    if (pers === 'oddball') {
      cw.joined = true;
      cw.playing = true;
      this.addShame(3);
      await this.dialog(`${nm} saw you!`, `${nm} stares at you, then breaks into a huge grin.\n\n"${pick(ODDBALL_LINES)}"\n\nBefore you can stop them, ${nm} wriggles out of their ${n.legwearType}, stuffs them in a drawer and drops into a sneaky crouch.\n\n(${nm} is now sneaking around too. If they get caught, they'll be the one in trouble.)`);
      this.setSneaking(n, true);
      after();
      return;
    }
    if (pers === 'friend') {
      cw.ally = true;
      this.addShame(5);
      if (this.ended) return;
      const v = await this.dialog(
        `${nm} saw you!`,
        `${nm}'s eyes go wide. "${name}! Your ${lw}...! What happened?"\n\nYou quickly explain. ${nm} nods firmly. "I've got your back. Nobody else needs to know."\n\n(${nm} is now an ally. Talk to them any time with E for help.)`,
        [
          { label: `Borrow ${nm}'s ${n.legwearType} for a while`, value: 'lend' },
          { label: 'Ask for a distraction', value: 'distract' },
          { label: 'Just ask them to keep quiet', value: null, cls: 'secondary' },
        ]
      );
      after();
      if (v === 'lend') this.startLend(n);
      else if (v === 'distract') this.startDistraction(n);
      return;
    }
    if (pers === 'sympathetic') {
      cw.ally = true;
      this.addShame(9);
      if (this.ended) return;
      await this.dialog(`${nm} saw you!`, `${nm} blinks, then politely looks away. "I... didn't see anything. That must be awful. Here, let me pull everyone's attention away — go!"\n\n(${nm} is now an ally and can create distractions when you ask.)`);
      after();
      this.startDistraction(n);
      return;
    }
    if (pers === 'neutral' && !cw.warned) {
      cw.warned = true;
      this.addShame(15);
      if (this.ended) return;
      await this.dialog(`${nm} saw you!`, `${nm} stares for a long, awkward moment. "Uh. Wow. Okay. I'm going to pretend I didn't see that..."\n\n"But if I see it again, I'm going to the manager."`);
      n.noticeCooldown = 15;
      after();
      return;
    }
    const lines = {
      strict: `${nm}'s face hardens. "Absolutely unacceptable. There is a DRESS CODE, ${name}." They march straight to the manager's office.`,
      distant: `${nm} looks at you, then at your ${lw}... or lack thereof. Without a word, they head for the manager's office.`,
      neutral: `${nm} sighs. "I warned you. Sorry, ${name}, I'm not risking my job for this." They head for the manager.`,
    };
    this.addShame(6);
    if (this.ended) return;
    await this.dialog(`${nm} saw you!`, lines[pers] || lines.strict);
    after();
    await this.managerTalk('report', nm);
  }

  async managerTalk(reason, who) {
    if (this.ended) return;
    const st = this.state;
    st.writeups++;
    const mgrName = this.profile.manager.name;
    const why =
      reason === 'report' ? REPORT_REASONS.report(who) :
      reason === 'complaints' ? REPORT_REASONS.complaints() :
      reason === 'late' ? REPORT_REASONS.late(who) :
      reason === 'weekend' ? REPORT_REASONS.weekend(who) : REPORT_REASONS.manager();
    if (this.player.borrow) this.endBorrow(true);
    this.transitioning = true;
    await ui.fade(true);
    const m = this.level.pois.manager;
    const p = this.player;
    p.x = m.stand.x;
    p.z = m.stand.z;
    p.yaw = Math.PI;
    p.carry = null;
    p.char.setProp(null);
    this.cancelInteract();
    if (this.manager) {
      this.manager.x = m.desk.x;
      this.manager.z = m.desk.z;
      this.manager.yaw = 0;
      this.manager.plan([]);
      this.manager.state = 'talk';
    }
    this.cam.yaw = Math.PI;
    this.cam.pitch = 0.25;
    this.render();
    await ui.fade(false);
    this.transitioning = false;
    this.addShame(8, true);
    await this.dialog(`${mgrName}'s Office`, STORY.managerTalk(mgrName, this.profile.name, this.lw, Math.min(3, st.writeups), why));
    if (st.writeups >= 3) {
      this.lose('Fired!', `${this.profile.name} is escorted out of ${this.job.workplaceName} by security, holding a cardboard box of belongings strategically in front of them.\n\nThree write-ups. Fired.`);
      return;
    }
    if (this.manager) this.manager.plan([{ work: true, t: 8, yaw: 0 }]);
    p.x = m.door.x;
    p.z = m.door.z;
    ui.toast(`Write-up ${st.writeups}/3. One more than two and you're done.`, 'bad', 5000);
  }

  startLend(n) {
    const p = this.player;
    if (p.borrow) return;
    p.borrow = { npc: n, t: LEND_TIME, warned: false };
    p.char.setLegwear(true);
    n.char.setLegwear(false);
    n.sneaking = true;
    this.cwRuntime[n.index].lendCd = LEND_TIME + 60;
    this.cwRuntime[n.index].bond += 10;
    n.hideAt(pick(this.level.pois.hideSpots) || this.level.pois.lockers);
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
    const cw = this.state.cw[b.npc.index];
    if (!b.npc.removed) {
      b.npc.char.setLegwear(!(cw.blessed || cw.playing));
      b.npc.sneaking = cw.blessed || cw.playing;
      b.npc.unhide();
    }
    if (!silent) ui.toast(`${b.npc.name} asked for their ${b.npc.legwearType} back. You're exposed again!`, 'bad', 5000);
  }

  startDistraction(n) {
    this.bubble(n, pick(DISTRACT_LINES), 4);
    this.distraction = { x: n.x, z: n.z, t: DISTRACT_TIME };
    this.cwRuntime[n.index].distractCd = 50;
    this.cwRuntime[n.index].bond += 6;
    for (const o of this.npcs) {
      if (o === n) continue;
      if (Math.hypot(o.x - n.x, o.z - n.z) < 32) {
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
    rt.bond += 3;
    if (cw.blessed) {
      n.plan([]);
      n.state = 'talk';
      await this.dialog(n.name, `"I'd love to help, but..." ${n.name} glances down at their own bare legs and turns red. "I can barely keep MYSELF hidden now. Sorry!"`);
      n.plan([{ t: 1 }]);
      return;
    }
    const opts = [];
    if (n.personality === 'friend') {
      opts.push({
        label: rt.lendCd > 0 ? `Borrow ${n.legwearType} (${n.name} needs a break: ${Math.ceil(rt.lendCd)}s)` : `Borrow ${n.name}'s ${n.legwearType} (${LEND_TIME}s)`,
        value: 'lend',
        disabled: rt.lendCd > 0 || !!p.borrow,
      });
    }
    opts.push({ label: rt.distractCd > 0 ? `Ask for a distraction (ready in ${Math.ceil(rt.distractCd)}s)` : 'Ask for a distraction', value: 'distract', disabled: rt.distractCd > 0 });
    opts.push({ label: 'Never mind', value: null, cls: 'secondary' });
    n.plan([]);
    n.state = 'talk';
    const v = await this.dialog(n.name, `"Need a hand, ${this.profile.name}?" ${n.name} whispers.`, opts);
    n.plan([{ t: 1 }]);
    if (v === 'lend') this.startLend(n);
    else if (v === 'distract') this.startDistraction(n);
  }

  // =====================================================================
  // Day off chaos
  updateChaos(dt) {
    const c = this.chaos;
    if (!c) return;
    const p = this.player;
    if (!c.encounterDone && this.clock > c.encounterAt && !p.bus) {
      c.encounterDone = true;
      this.spawnCoworkerEncounter();
    }
    if (this.dog) this.updateDog(dt);
  }

  spawnCoworkerEncounter() {
    const idx = this.profile.coworkers.map((_, i) => i).filter((i) => !this.state.cw[i].fired && this.cwChars[i]);
    if (!idx.length) return;
    const i = pick(idx);
    const G = this.level.pedGraph;
    const p = this.player;
    let best = null;
    for (let k = 0; k < G.length; k++) {
      const d = Math.hypot(G[k].x - p.x, G[k].z - p.z);
      if (d > 25 && d < 55 && (!best || Math.random() < 0.3)) best = k;
    }
    if (best === null) return;
    const c = this.profile.coworkers[i];
    const ch = this.cwChars[i];
    ch.setLegwear(!this.state.cw[i].blessed);
    const n = new NPC(this, ch, { kind: 'pedestrian', name: c.name, personality: c.personality, index: i, x: G[best].x, z: G[best].z, range: 14, legwearType: ch.legwearType });
    n.coworkerEncounter = true;
    n.node = best;
    n.prevNode = best;
    n.plan([{ go: { x: p.x, z: p.z } }]);
    this.npcs.push(n);
    ui.toast(`Uh oh... isn't that ${c.name} from work, coming down the street?!`, 'bad', 6000);
  }

  async weekendEncounter(n) {
    n.noticeCooldown = 9999;
    n.coworkerEncounter = false;
    const cw = this.state.cw[n.index];
    const nm = n.name;
    n.plan([]);
    n.state = 'talk';
    if (cw.blessed || cw.joined) {
      this.addShame(4);
      await this.dialog(`You ran into ${nm}!`, `${nm} spots you, freezes, and gives a tiny, knowing nod. "...You too, huh. Let's pretend we never saw each other."`);
    } else if (['friend', 'sympathetic', 'oddball'].includes(n.personality)) {
      this.addShame(6);
      await this.dialog(`You ran into ${nm}!`, n.personality === 'oddball' ? `"Whoa, you're playing the no-pants game on your day off too? Dedication! Respect."` : `"${this.profile.name}?! Oh no, even on the weekend?" ${nm} gives you an awkward hug and hurries on, making sure nobody else is looking.`);
      if (n.personality !== 'oddball') cw.ally = true;
    } else {
      this.addShame(8);
      this.state.pendingTalks.push({ reason: 'weekend', who: nm });
      await this.dialog(`You ran into ${nm}!`, `${nm} stops dead. Their eyes travel down... and back up. "Unbelievable. Even in PUBLIC?"\n\n"I'll be mentioning this to ${this.profile.manager.name} on Monday."`);
    }
    if (!n.removed) {
      n.kind = 'pedestrian';
      n.plan([{ t: 1 }]);
    }
  }

  startDog(errand) {
    if (this.dog) return;
    const p = this.player;
    const g = new THREE.Group();
    const M = (c) => new THREE.MeshStandardMaterial({ color: c });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.7), M('#a0522d'));
    body.position.y = 0.45;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.3), M('#8b4513'));
    head.position.set(0, 0.65, 0.42);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.2), M('#e84118'));
    bag.position.set(0, 0.5, 0.62);
    g.add(body, head, bag);
    for (const [x, z] of [[0.1, 0.25], [-0.1, 0.25], [0.1, -0.25], [-0.1, -0.25]]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.08), M('#5d4037'));
      l.position.set(x, 0.16, z);
      g.add(l);
    }
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    this.scene.add(g);
    const G = this.level.pedGraph;
    let node = 0;
    let bd = Infinity;
    G.forEach((nd, k) => {
      const d = Math.hypot(nd.x - p.x, nd.z - p.z);
      if (d < bd) {
        bd = d;
        node = k;
      }
    });
    this.dog = { mesh: g, x: p.x + 1.5, z: p.z + 1.5, node, errand, t: 0 };
    errand.done = false;
    errand.stolen = true;
    ui.toast('A stray dog snatches your shopping bag and bolts! Catch it!', 'bad', 6000);
  }

  updateDog(dt) {
    const d = this.dog;
    const p = this.player;
    const G = this.level.pedGraph;
    d.t += dt;
    const tgt = G[d.node];
    const dx = tgt.x - d.x;
    const dz = tgt.z - d.z;
    const dist = Math.hypot(dx, dz);
    const pd = Math.hypot(p.x - d.x, p.z - d.z);
    const speed = pd < 8 ? 3.7 : pd > 25 ? 0 : 2.2;
    if (dist < 0.5) {
      // pick the neighbour furthest from the player
      let best = d.node;
      let bd = -1;
      for (const k of G[d.node].n) {
        const s = Math.hypot(G[k].x - p.x, G[k].z - p.z) + Math.random() * 10;
        if (s > bd) {
          bd = s;
          best = k;
        }
      }
      d.node = best;
    } else if (speed > 0) {
      const step = Math.min(dist, speed * dt);
      d.x += (dx / dist) * step;
      d.z += (dz / dist) * step;
      d.mesh.rotation.y = Math.atan2(dx, dz);
    }
    d.mesh.position.set(d.x, Math.abs(Math.sin(d.t * 12)) * 0.08 * (speed > 0 ? 1 : 0), d.z);
    if (pd < 1.3 && !p.bus) {
      this.scene.remove(d.mesh);
      d.errand.done = true;
      d.errand.stolen = false;
      this.dog = null;
      this.addShame(3);
      ui.toast('Got your bag back! (Everyone saw you chase a dog without pants, though.)', 'good', 5000);
    }
  }

  // =====================================================================
  // Interactions
  findInteraction() {
    const p = this.player;
    if (p.bus) return this.busAction();
    let best = null;
    let bd = Infinity;
    if (this.phase === 'work' && this.work.clockedIn && !this.work.clockedOut) {
      for (const n of this.npcs) {
        if (n.kind !== 'coworker' || !this.state.cw[n.index].ally) continue;
        if (['hiding', 'talk'].includes(n.state) || n.cur?.hide) continue;
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
      if (a && (d < bd || (best && best.disabled && !a.disabled))) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  busAction() {
    const p = this.player;
    const bus = p.bus;
    if (p.seat) return { label: 'Stand up', time: 0, run: () => ((p.seat.occ = null), (p.seat = null), (p.lx = 0)) };
    if (bus.state === 'dwell' && p.lz > 3.0 && p.lx < -0.1) {
      const st = bus.currentStop;
      return { label: `Get off at ${st.name}`, time: 0, run: () => this.leaveBus(st) };
    }
    const s = this.busSeatOptions();
    if (s) return { label: `Sit down (${s.window ? 'window' : 'aisle'} seat)`, time: 0, run: () => ((p.seat = s), (s.occ = 'player'), (p.speed = 0)) };
    if (bus.state !== 'dwell' && p.lz > 3.0) return { label: 'Wait for the next stop to get off', disabled: true };
    return null;
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
          return { label: 'Get dressed', time: 2, run: () => ((m.dress = true), this.player.char.setLegwear(true), ui.toast('Looking sharp!', 'good')) };
        return { label: 'Look for something to wear', time: 1.5, run: async () => ((m.dress = true), await this.dialog('The Wardrobe', STORY.morningNoClothes)) };
      }
      if (id === 'door') {
        const ready = m.wash && m.eat && m.dress;
        if (!ready) return { label: 'Get ready first (wash, eat, get dressed)', disabled: true };
        return this.isWorkday ? { label: 'Leave for work', time: 0, run: () => this.enterPhase('commute_am') } : { label: 'Head out to run errands', time: 0, run: () => this.enterPhase('dayoff') };
      }
      if (id === 'bed') return { label: 'No time to sleep in!', disabled: true };
      return null;
    }
    if (ph === 'evening') {
      if (id === 'bed') return { label: 'Go to sleep', time: 0, run: () => this.sleep() };
      return null;
    }
    if (ph === 'commute_am' || ph === 'commute_pm' || ph === 'dayoff') {
      if (it.stop) {
        const line = this.level.lines.find((l) => l.id === it.lineId);
        const bus = this.buses?.buses.find((b) => b.line.id === it.lineId && b.state === 'dwell' && b.currentStop === it.stop);
        if (bus) return { label: `Board the ${line.name}`, time: 0, run: () => this.boardBus(bus) };
        const eta = this.busETA(it.lineId, it.stop);
        return { label: `${line.name} stop: ${it.stop.name} — next bus in ~${Math.max(1, Math.round(eta))}s`, disabled: true };
      }
      if (ph === 'commute_am' && id === 'workdoor') return { label: `Go inside ${this.job.workplaceName}`, time: 0, run: () => this.enterPhase('work') };
      if (ph === 'commute_pm' && id === 'homedoor') return { label: 'Go home', time: 0, run: () => this.enterPhase('evening') };
      if (ph === 'dayoff') {
        if (id === 'homedoor') {
          const left = this.errands.filter((e) => !e.done);
          if (left.length) return { label: `Errands left: ${left.map((e) => e.name).join(', ')}`, disabled: true };
          return { label: 'Go home', time: 0, run: () => this.enterPhase('evening') };
        }
        if (id.startsWith('place:')) {
          const place = id.slice(6);
          const e = this.errands.find((x) => x.place === place && !x.done && !x.stolen);
          return { label: e ? `Go into ${PLACES[place].name} (${e.name})` : `Go into ${PLACES[place].name}`, time: 0, run: () => this.enterPhase('shop', { place }) };
        }
      }
      return null;
    }
    if (ph === 'shop') {
      if (id === 'exit') return { label: 'Leave', time: 0, run: () => this.enterPhase('dayoff') };
      const e = this.errand;
      if (e && !e.done) {
        const step = e.steps[this.errandStep];
        if (step && it.station && it.station.tag === step.tag) {
          return { label: step.label.replace('{label}', it.station.label), time: step.time, run: () => this.advanceErrand() };
        }
      }
      return null;
    }
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
        return { label: w.clockedIn ? 'Your shift is not over yet' : 'Clock in first', disabled: true };
      }
      const step = this.currentStep();
      if (step && step.target === id) return { label: step.label, time: step.time, run: () => this.advanceTask() };
    }
    return null;
  }

  advanceErrand() {
    const e = this.errand;
    const step = e.steps[this.errandStep];
    if (step.carry) {
      this.player.carry = step.carry;
      const m = propMesh(step.carry);
      this.player.carryCover = m.userData.cover;
      this.player.char.setProp(m);
    }
    if (step.drop) {
      this.player.carry = null;
      this.player.char.setProp(null);
    }
    if (step.tag === 'checkout' && !this.player.char.legwearOn) {
      this.addShame(5);
      const clerk = this.npcs.find((n) => n.kind === 'clerk');
      if (clerk) this.bubble(clerk, pick(["Paper or plastic? ...and maybe some pants?", "I... um... have a nice day!", '*stares at the register very hard*']));
    }
    this.errandStep++;
    if (this.errandStep >= e.steps.length) {
      e.done = true;
      this.player.carry = null;
      this.player.char.setProp(null);
      ui.toast(`Errand done: ${e.name}!`, 'good', 4000);
      if (e.id === 'grocery' && !this.chaos.dogDone && Math.random() < 0.7) {
        this.chaos.dogDone = true;
        this.pendingDog = e;
      }
    }
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

  // =====================================================================
  // Work tasks
  async clockIn() {
    const w = this.work;
    const st = this.state;
    w.clockedIn = true;
    if (st.day === 1) {
      await this.dialog('Wardrobe Malfunction!', `${pick(MISHAPS)(this.profile.name, this.lw)}\n\nYou stuff what's left into your locker... and realize your underwear is now on full display. Your shift starts now. Nobody can find out.`);
      this.player.char.setLegwear(false);
      ui.toast("Your underwear is exposed! Stay out of the yellow sight cones.", 'bad', 7000);
    } else ui.toast('Clocked in. Here we go again...', '');
    if (this.lateMins > 10) st.pendingTalks.unshift({ reason: 'late', who: this.lateMins });
    while (st.pendingTalks.length && !this.ended) {
      const t = st.pendingTalks.shift();
      await this.dialog('Uh oh', `"${this.profile.name}! My office, please." ${this.profile.manager.name} is waiting at the locker room door.`);
      await this.managerTalk(t.reason, t.who);
    }
    if (this.ended) return;
    if (st.pendingBless !== null && st.pendingBless !== undefined) {
      const i = st.pendingBless;
      st.pendingBless = null;
      const cw = st.cw[i];
      const n = this.cwNPC(i);
      if (cw && !cw.fired && !cw.blessed) {
        cw.blessed = true;
        cw.playing = false;
        const nm = this.profile.coworkers[i].name;
        const lw = n ? n.legwearType : 'pants';
        if (n) this.setSneaking(n, true);
        await this.dialog(`Hiphtia's Blessing spreads!`, `A faint golden sparkle drifts through the building...\n\n${pick(MISHAPS)(nm, lw)}\n\n${nm} has been blessed by Hiphtia! From now on they're sneaking around without ${lw}, just like you.${['strict', 'distant', 'neutral'].includes(this.profile.coworkers[i].personality) ? ` ${nm} won't dare report you anymore... they'd be caught themselves.` : ''}`);
        ui.toast(`Blessed coworkers: ${this.blessedCount()}/${this.activeCoworkers().length}`, 'good', 5000);
      }
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
    if (this.state.celestiMet) {
      const cands = this.activeCoworkers().filter((i) => !this.state.cw[i].blessed);
      if (cands.length) {
        cands.sort((a, b) => this.cwRuntime[b].bond - this.cwRuntime[a].bond);
        const i = this.cwRuntime[cands[0]].bond > 0 ? cands[0] : pick(cands);
        this.state.pendingBless = i;
        ui.toast(`You spent the most time with ${this.profile.coworkers[i].name} today... ${this.celestiName()}'s warning echoes in your mind.`, '', 7000);
      }
    }
  }

  activeCoworkers() {
    return this.profile.coworkers.map((_, i) => i).filter((i) => !this.state.cw[i].fired);
  }

  blessedCount() {
    return this.activeCoworkers().filter((i) => this.state.cw[i].blessed).length;
  }

  allBlessed() {
    return this.activeCoworkers().every((i) => this.state.cw[i].blessed);
  }

  taskPool() {
    const L = this.level;
    return [...this.job.tasks, ...GENERIC_TASKS].filter((t) => t.steps.every((s) => s.tag === '$remembered' || L.stationsByTag(s.tag).length));
  }

  resolveTask(tpl) {
    const L = this.level;
    let remembered = null;
    let prev = null;
    const steps = [];
    for (const s of tpl.steps) {
      let st;
      if (s.tag === '$remembered') st = remembered;
      else {
        let c = L.stationsByTag(s.tag);
        if (c.length > 1 && prev) c = c.filter((x) => x !== prev);
        st = pick(c);
      }
      if (!st) return null;
      if (s.remember) remembered = st;
      steps.push({ ...s, station: st, target: st.id, label: s.label.replace('{label}', st.label) });
      prev = st;
    }
    return { name: tpl.name, steps };
  }

  nextTask() {
    const w = this.work;
    if (w.done >= w.quota) {
      w.task = null;
      ui.toast('All tasks done! Clock out at the time clock.', 'good', 5000);
      return;
    }
    const pool = this.taskPool();
    let tpl;
    let guard = 0;
    do tpl = pick(pool);
    while (pool.length > 1 && tpl === w.lastTpl && guard++ < 10);
    w.lastTpl = tpl;
    w.task = this.resolveTask(tpl);
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
    const p = this.player;
    if (s.carry) {
      p.carry = s.carry;
      const m = propMesh(s.carry);
      p.carryCover = m.userData.cover;
      p.char.setProp(m);
    }
    if (s.drop) {
      p.carry = null;
      p.char.setProp(null);
    }
    w.step++;
    if (w.step >= w.task.steps.length) {
      w.done++;
      ui.toast(`Task complete! (${w.done}/${w.quota})`, 'good');
      p.carry = null;
      p.char.setProp(null);
      this.nextTask();
    }
  }

  // =====================================================================
  // Story
  celestiName() {
    return this.settings.celestiName || 'Celesti';
  }

  async makeCelesti() {
    const m = this.settings.celesti;
    let ch;
    if (m && m.key) {
      const buf = await storage.getBlob(m.key);
      ch = await createCharacter({ vrm: buf, full: true, legwearMaterials: m.legwearMaterials, underwearOverlay: false });
    } else ch = createMannequin({ colors: { skin: '#fbe3d4', hair: '#fff3b0', top: '#ffffff', bottom: '#fdf2c4', eye: '#f1c40f' }, legwearType: 'skirt' });
    addAngelic(ch);
    return ch;
  }

  async celestiScene() {
    const L = this.levels.apartment;
    const ch = await this.makeCelesti();
    const s = L.pois.celesti;
    ch.root.position.set(s.x, 0.15, s.z);
    ch.root.rotation.y = s.yaw;
    this.scene.add(ch.root);
    const tick = () => {
      if (!ch.root.parent) return;
      ch.root.position.y = 0.15 + Math.sin(performance.now() / 600) * 0.06;
      ch.update(1 / 60, { speed: 0 });
      requestAnimationFrame(tick);
    };
    tick();
    this.cam.yaw = Math.atan2(s.x - this.player.x, s.z - this.player.z);
    for (const [title, text] of STORY.celesti(this.profile.name, this.celestiName())) {
      await this.dialog(title, text);
    }
    await ui.fade(true);
    this.scene.remove(ch.root);
    ch.dispose();
    await ui.fade(false);
    this.state.celestiMet = true;
  }

  async win() {
    if (this.ended) return;
    const L = this.levels.apartment;
    const ch = await this.makeCelesti();
    const s = L.pois.celesti;
    ch.root.position.set(s.x, 0.15, s.z);
    ch.root.rotation.y = s.yaw;
    this.scene.add(ch.root);
    await this.dialog(this.celestiName(), STORY.win(this.profile.name, this.celestiName()));
    this.ended = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.onEnd({ type: 'win', text: `${this.profile.name} survived ${this.state.day} days. Every coworker shares Hiphtia's blessing.`, shame: this.state.shame, day: this.state.day });
  }

  // =====================================================================
  async sleep() {
    const st = this.state;
    st.day++;
    st.shame = Math.max(0, st.shame - 20);
    for (const c of st.cw) c.playing = false;
    this.enterPhase('morning');
  }

  async saveGame() {
    const st = this.state;
    await storage.set('save', JSON.parse(JSON.stringify({
      day: st.day, shame: st.shame, writeups: st.writeups, cw: st.cw, pendingBless: st.pendingBless, pendingTalks: st.pendingTalks,
      celestiMet: st.celestiMet, eveningShown: st.eveningShown, daily: st.daily, savedAt: Date.now(),
    })));
  }

  lose(title, text) {
    if (this.ended) return;
    this.ended = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.onEnd({ type: 'lose', title, text, day: this.state.day });
  }

  // =====================================================================
  // Visual helpers
  makeMarker() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32), new THREE.MeshBasicMaterial({ color: 0x55efc4, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
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

  objectiveTarget() {
    const L = this.level;
    if (!L) return null;
    const get = (id) => L.interactables.get(id);
    const ph = this.phase;
    if (ph === 'morning') {
      const m = this.morning;
      return !m.wash ? get('sink') : !m.eat ? get('kitchen') : !m.dress ? get('wardrobe') : get('door');
    }
    if (ph === 'evening') return get('bed');
    if (this.player.bus) return null;
    if (ph === 'commute_am') return get('workdoor');
    if (ph === 'commute_pm') return get('homedoor');
    if (ph === 'dayoff') {
      if (this.dog) return { x: this.dog.x, z: this.dog.z };
      const e = this.errands.find((x) => !x.done && !x.stolen);
      return e ? get('place:' + e.place) : get('homedoor');
    }
    if (ph === 'shop') {
      const e = this.errand;
      if (!e || e.done) return get('exit');
      const step = e.steps[this.errandStep];
      const cands = L.stationsByTag(step.tag);
      const p = this.player;
      return cands.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    }
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
    // compass hint when the target is far (city)
    const d = Math.hypot(target.x - this.player.x, target.z - this.player.z);
    this.targetDist = d;
    this.targetDir = Math.atan2(target.x - this.player.x, target.z - this.player.z);
  }

  updateHUD() {
    const st = this.state;
    const ph = this.phase;
    const wd = WEEKDAYS[weekday(st.day)];
    const titles = { morning: 'Morning', commute_am: 'Commute to work', work: 'At work', commute_pm: 'Commute home', evening: 'Evening', dayoff: 'Day off', shop: 'Errands' };
    ui.set('hud-day', `Day ${st.day} · ${wd} · ${esc(titles[ph] || '')}`);
    let time = fmtClock(this.clock);
    if (ph === 'work') {
      const w = this.work;
      const steps = w.task ? w.step / w.task.steps.length : 0;
      const frac = w.clockedIn ? Math.min(1, (w.done + steps) / w.quota) : 0;
      this.clock = 540 + frac * 480;
      time = `${fmtClock(this.clock)} · ${esc(this.job.workplaceName)}`;
    } else if (ph === 'commute_am') {
      const late = this.clock - 540;
      time = `${fmtClock(this.clock)} · ${late > 0 ? `<span style="color:#ff7675">${Math.round(late)} min LATE</span>` : `be at work by 9:00`}`;
    } else if (ph === 'shop') time += ` · ${esc(PLACES[this.shopPlace].name)}`;
    ui.set('hud-time', time);

    let obj = '';
    const p = this.player;
    if (ph === 'morning') {
      const m = this.morning;
      obj = !m.wash ? 'Wash up in the bathroom' : !m.eat ? 'Eat breakfast in the kitchen' : !m.dress ? 'Check the wardrobe' : this.isWorkday ? 'Leave for work' : 'Head out to run errands';
    } else if (p.bus) obj = 'Riding the bus. Get off near your destination (walk to the front door when it stops).';
    else if (ph === 'commute_am') obj = `Get to ${this.job.workplaceName}`;
    else if (ph === 'commute_pm') obj = 'Get home to Maple Court Apartments';
    else if (ph === 'evening') obj = 'Go to bed';
    else if (ph === 'dayoff') {
      if (this.dog) obj = 'Catch the dog that stole your bag!';
      else {
        const e = this.errands.find((x) => !x.done && !x.stolen);
        obj = e ? `${e.name} at ${PLACES[e.place].name}` : 'All errands done! Go home.';
      }
    } else if (ph === 'shop') {
      const e = this.errand;
      const tgt = e && !e.done ? this.objectiveTarget() : null;
      obj = !e ? 'Nothing to do here. Leave.' : e.done ? 'Errand done. Leave the shop.' : e.steps[this.errandStep].label.replace('{label}', tgt?.label || 'the counter');
    } else if (ph === 'work') {
      const w = this.work;
      obj = !w.clockedIn ? 'Clock in at the time clock (locker room)' : w.clockedOut ? 'Leave through the front entrance' : w.done >= w.quota ? 'Clock out at the time clock' : this.currentStep()?.label || '';
    }
    if (this.targetDist > 25 && !p.bus && ['commute_am', 'commute_pm', 'dayoff'].includes(ph)) {
      const rel = angDiff(this.targetDir, this.cam.yaw);
      const arrows = ['↑', '↖', '←', '↙', '↓', '↘', '→', '↗'];
      const idx = Math.round(((rel + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
      obj += ` <span style="color:#ffd36e">${arrows[idx]} ${Math.round(this.targetDist)} m</span>`;
    }
    ui.set('hud-objective', '▶ ' + (obj.includes('<span') ? obj : esc(obj)));

    ui.meter('m-shame', st.shame / 100);
    ui.meter('m-comp', this.composure / 100);
    ui.meter('m-stam', this.stamina / 100);
    let info = `Write-ups: ${st.writeups}/3`;
    if (ph === 'work') info += ` · Complaints: ${this.complaints || 0}/3`;
    if (st.celestiMet) info += ` · Blessed: ${this.blessedCount()}/${this.activeCoworkers().length}`;
    ui.set('hud-complaints', info);
    let status = '';
    const exposed = p.char && !p.char.legwearOn;
    if (this.stealthActive() && exposed) {
      if (this.seenBy) status = `<span style="color:#ff7675">⚠ ${p.bus ? 'PASSENGERS ARE STARING' : 'SOMEONE IS LOOKING'}! (${this.seenBy})</span>`;
      else if (p.bus) status = p.seat ? (p.seat.window ? 'Seated by the window' : 'Seated on the aisle') : 'Standing in the aisle — very exposed';
      else if (p.carry) status = `Exposed — holding a ${p.carry} in front`;
      else status = 'Exposed — stay out of sight';
      if (this.distraction) status += `<br><span style="color:#55efc4">Distraction: ${Math.ceil(this.distraction.t)}s</span>`;
    }
    ui.set('hud-status', status);

    let side = '';
    if (ph === 'work' && this.work.clockedIn) {
      const w = this.work;
      side = `<b>Tasks: ${w.done}/${w.quota}</b>`;
      if (w.task) {
        side += `<div style="margin-top:6px">${esc(w.task.name)}</div>`;
        w.task.steps.forEach((s, i) => (side += `<div class="${i < w.step ? 'done' : i === w.step ? 'cur' : ''}">${i === w.step ? '▶ ' : '• '}${esc(s.label)}</div>`));
      } else if (!w.clockedOut) side += `<div class="cur">▶ Clock out</div>`;
      const allies = this.profile.coworkers.filter((_, i) => st.cw[i].ally && !st.cw[i].blessed && !st.cw[i].fired).map((c) => c.name);
      if (allies.length) side += `<div style="margin-top:8px;color:#a29bfe">Allies: ${esc(allies.join(', '))}</div>`;
      if (st.celestiMet) {
        const cands = this.activeCoworkers().filter((i) => !st.cw[i].blessed);
        if (cands.length) {
          cands.sort((a, b) => this.cwRuntime[b].bond - this.cwRuntime[a].bond);
          const top = cands[0];
          if (this.cwRuntime[top].bond > 0) side += `<div style="margin-top:6px;color:#ffd36e">Closest today: ${esc(this.profile.coworkers[top].name)}</div>`;
        }
      }
    } else if (ph === 'dayoff' || ph === 'shop') {
      side = '<b>Errands</b>' + (this.errands || []).map((e) => `<div class="${e.done ? 'done' : ''}">${e.done ? '✓' : '•'} ${esc(e.name)} — ${esc(PLACES[e.place].name)}</div>`).join('');
    } else if (p.bus) {
      const b = p.bus;
      side = `<b>${esc(b.line.name)}</b>`;
      for (let i = 0; i < 6; i++) {
        const s = b.stopAt(b.nextStop + i);
        side += `<div class="${i === 0 ? 'cur' : ''}">${i === 0 ? (b.state === 'dwell' ? '■ ' : '▶ ') : '• '}${esc(s.name)}${this.stopHint(s)}</div>`;
      }
    }
    ui.set('hud-tasks', side);
  }

  stopHint(s) {
    const L = this.levels.city;
    const near = (pl) => pl && Math.hypot(pl.door.x - s.x, pl.door.z - s.z) < 75;
    const tags = [];
    if (near(L.places.work)) tags.push('★ work');
    if (near(L.places.home)) tags.push('⌂ home');
    for (const e of this.errands || []) if (!e.done && near(L.places[e.place])) tags.push(PLACES[e.place].name);
    return tags.length ? ` <span style="color:#ffd36e">(${esc(tags.join(', '))})</span>` : '';
  }

  updateTags() {
    const cam = this.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const p = this.player;
    for (const n of this.npcs) {
      const el = n.el;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      let html = '';
      if (n.bubbleT > 0) html += `<span class="bubble">${esc(n.bubbleText)}</span>`;
      let s = n.suspicion;
      if (s > 0.05) html += `<span style="color:${s > 0.65 ? '#ff4757' : '#ffd32a'}">${s > 0.65 ? '!' : '?'}</span>`;
      if ((n.kind === 'coworker' || n.kind === 'manager' || n.coworkerEncounter) && d < 10) {
        let icon = '';
        if (n.kind === 'coworker') {
          const cw = this.state.cw[n.index];
          icon = cw.blessed ? ' ✦' : cw.playing ? ' ☆' : cw.ally ? ' ♥' : '';
        }
        html += `<span class="nm">${esc(n.name)}${n.kind === 'manager' ? ' (Manager)' : ''}${icon}</span>`;
      }
      if (!html) {
        el.style.display = 'none';
        continue;
      }
      tmpV.set(n.x, (n.char.height || 1.7) + 0.25, n.z).project(cam);
      if (tmpV.z > 1 || d > 35) {
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
    if (this.pendingDog && this.phase === 'dayoff' && !this.transitioning) {
      this.startDog(this.pendingDog);
      this.pendingDog = null;
    }
    const target = new THREE.Vector3(p.x, (p.char.height || 1.6) * (p.crouching ? 0.62 : p.seat ? 0.7 : 0.88) + (p.bus ? 0.15 : 0), p.z);
    const c = this.cam;
    const pitch = p.bus ? Math.max(0.65, c.pitch) : c.pitch;
    const dir = new THREE.Vector3(-Math.sin(c.yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(c.yaw) * Math.cos(pitch));
    let dist = p.bus ? Math.min(c.dist, 4.5) : c.dist;
    if (this.level && !p.bus) {
      const hit = this.level.rayHit(target.x, target.y, target.z, dir.x, dir.y, dir.z, dist);
      if (hit < dist) dist = Math.max(0.6, hit - 0.25);
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
    <tr><td>Shift</td><td>Run (uses stamina; looks strange at work)</td></tr>
    <tr><td>C / Ctrl</td><td>Crouch toggle / hold — hide your hips behind furniture</td></tr>
    <tr><td>E</td><td>Interact (hold for timed actions), board/leave buses, sit</td></tr>
    <tr><td>Wheel</td><td>Zoom camera</td></tr>
    <tr><td>Esc</td><td>Pause</td></tr>
  </table>
  <p class="note">Yellow cones show where people are looking. Partitions, counters, shelves and hedges hide your underwear. Crouch behind desks.
  Carried trays, boxes and folders cover you from the front. On the bus, standing is far more exposed than sitting, and a window seat is safer than the aisle.</p>`;
}
