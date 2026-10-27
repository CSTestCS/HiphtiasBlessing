// Core game: days and phases (apartment, city commute, work, day-off errands,
// shops), player control incl. riding the bus, camera, stealth detection for
// the player and for sneaking coworkers, coworker reactions, manager write-ups,
// Hiphtia's blessing spreading, shame and win/lose conditions.
import * as THREE from 'three';
import { ui, esc } from './ui.js';
import { NPC, angDiff, pick, propMesh } from './npc.js';
import { createCharacter, createMannequin, randomColors, addAngelic, setExpressionMax, borrowLegwear } from './character.js';
import { buildLobby } from './levels/lobby.js';
import { buildHallway, buildPool, buildLaundry } from './levels/building.js';
import { Rain } from './weather.js';
import { Minimap } from './minimap.js';
import { PICKUP_LABELS } from './props.js';
import { modelBuffer, modelKey } from './assets.js';
import { writeSave } from './saves.js';
import { buildApartment } from './levels/apartment.js';
import { buildCity } from './levels/city.js';
import { buildWorkplace } from './levels/workplace.js';
import { buildShop } from './levels/shop.js';
import { BusSystem, DOOR } from './bus.js';
import {
  JOBS, GENERIC_TASKS, STORY, REPORT_REASONS, ERRANDS, PLACES,
  WEEKDAYS, weekday, isWorkday, CELESTI_DAY, ROLE_TASKS, mishapFor, SHAME, weatherFor, WEATHER, pronouns, BUNDLED,
} from './data.js';

const WALK = 2.0;
const RUN = 4.3;
const CROUCH = 1.1;
const LEND_TIME = 90; // seconds per turn in the borrowed legwear
const DISTRACT_TIME = 14;
const MGR_GRACE = 150;
// Things you can tie on as an emergency skirt, and how they fail (like Mika's attempts in the manga)
const MAKESHIFT = {
  box: { name: 'Cardboard skirt', short: 'cardboard skirt', color: '#c8a27a', life: [6, 14], wear: 'Temporary solution. (F to take it off)', fail: 'CRACK. The box splits right down the middle. Back to the drawing board.' },
  basket: { name: 'Basket skirt', short: 'basket', color: '#e84118', life: [8, 16], wear: 'Surprisingly stable... for now. (F to take it off)', fail: 'The basket handle snaps and the whole thing clatters to the floor.' },
  newspaper: { name: 'Paper skirt', short: 'paper skirt', color: '#dfe6e9', life: [10, 22], wind: true, wear: 'Lightweight. Adjustable. Elegant. (F to take it off)', fail: 'FWIP! A gust catches the paper skirt and sends it flying. Why is the air against you?!' },
  folder: { name: 'Folder skirt', short: 'folder skirt', color: '#0984e3', life: [8, 16], wind: true, wear: 'Very professional. (F to take it off)', fail: 'The folders slip out one by one and scatter across the floor.' },
  menu: { name: 'Menu skirt', short: 'menu skirt', color: '#6d214f', life: [8, 16], wind: true, wear: "Today's special. (F to take it off)", fail: 'The menus slide apart. Today\'s special is embarrassment.' },
  clipboard: { name: 'Clipboard skirt', short: 'clipboard', color: '#a1887f', life: [6, 12], wear: 'It covers... some of it. (F to take it off)', fail: 'The clipboard clip snaps open and everything drops.' },
  bag: { name: 'Tote bag skirt', short: 'tote bag', color: '#2d3436', life: [10, 20], wear: 'Two tote bags. One front, one back. Genius. (F to take it off)', fail: 'RRRIP. The tote bag handles give out. You are being personally targeted by office supplies.' },
  towel: { name: 'Towel wrap', short: 'towel', color: '#ffffff', life: [60, 120], snags: true, snagLine: 'The towel catches on a chair leg... THWACK. The chair keeps it.', wear: 'Snug and reliable. Watch out for chairs. (F to take it off)', fail: 'The towel slowly works itself loose and drops.' },
  laundry: { name: 'Tablecloth wrap', short: 'tablecloth', color: '#74b9ff', life: [50, 100], snags: true, snagLine: 'The cloth hooks on a passing chair. THWACK. Plan C has been cancelled.', wear: 'Like a sarong. Mostly. (F to take it off)', fail: 'The knot gives out and the cloth slides to the floor.' },
  pillow: { name: 'Pillowcase skirt', short: 'pillowcase', color: '#ffffff', life: [20, 40], snags: true, snagLine: 'The pillowcase snags on a chair and tears away.', wear: 'Soft. Questionable. (F to take it off)', fail: 'The pillowcase seam splits open.' },
}; // seconds the manager leaves you alone after a talk
const PED_REACTIONS = [
  'Uh... excuse me? Are you okay?', 'Do you need help?', 'Is everything alright?', '*double take*', 'Interesting outfit...',
  "Oh! Um... it's a little cold for that, isn't it?", '*politely pretends not to have noticed*', 'Did something happen? Do you need a jacket?', '*blinks twice and walks a little faster*',
];
const BUS_REACTIONS = ['Interesting outfits...', '*very carefully looks out the window*', "Um... are you okay? You look cold.", '*slowly lowers their phone*', 'Long day?', '...wow.'];
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
    this.settings = Object.assign({ hourSeconds: 240, shameScale: 1, exprMax: 0.7, minimap: true, useBundledCivilians: true }, ctx.settings || {});
    this.hooks = ctx.hooks || {};
    this.slotId = ctx.slotId || null;
    this.extraCivs = ctx.extraCivs || [];
    this.minPerSec = 60 / Math.max(20, this.settings.hourSeconds || 240);
    setExpressionMax(this.settings.exprMax ?? 0.7);
    this.onEnd = onEnd;
    this.jobId = this.profile.job;
    this.job = JOBS[this.jobId];
    const n = this.profile.coworkers.length;
    const base = {
      day: 1, shame: 0, writeups: 0, pendingBless: null, pendingTalks: [], celestiMet: false, eveningShown: false, daily: {},
      cw: [], seed: this.profile.layoutSeed || 1,
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

    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true }));
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
    this.player = {
      x: 0, z: 0, yaw: 0, speed: 0, crouch: false, carry: null, inter: null, borrow: null, bus: null, seat: null, lx: 0, lz: 0,
      sitAt: null, hidden: null, pickup: null, wet: 0,
    };
    this.mgrGrace = 0;
    this.rain = new Rain(this.scene);
    this.minimap = document.getElementById('minimap') ? new Minimap() : null;
    this.minimapT = 0;
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
    this.levels.lobby = buildLobby();
    this.levels.hallway = buildHallway();
    this.levels.pool = buildPool();
    this.levels.laundry = buildLaundry();
    this.levels.city = buildCity({ workplaceName: this.job.workplaceName, jobColor: '#273c75' });
    ui.setScreen('<div class="loading">Building your workplace...</div>');
    await new Promise((r) => setTimeout(r, 30));
    this.levels.work = buildWorkplace(this.jobId, this.job, { coworkers: this.profile.coworkers, seed: this.state.seed });
    ui.setScreen('<div class="loading">Gathering townsfolk...</div>');
    await this.initCivilians();
    ui.hideScreen();
    window.addEventListener('resize', (this._onResize = () => this.resize()));
  }

  async initCivilians() {
    const tpls = [];
    if (this.settings.useBundledCivilians !== false) {
      for (const b of BUNDLED.civilians) {
        const buf = await modelBuffer({ asset: b.asset });
        if (buf) tpls.push({ key: 'asset:' + b.asset, buf, gender: b.gender });
      }
    }
    for (const t of this.settings.civilians || []) {
      const buf = await modelBuffer({ key: t.key });
      if (buf) tpls.push({ key: t.key, buf, gender: t.gender, legwearMaterials: t.legwearMaterials });
    }
    this.civTemplates = tpls;
    // named townsfolk: coworkers from the player's other save slots
    for (const e of this.extraCivs.slice(0, 10)) {
      try {
        const o = e.def.outfits?.[0];
        if (!o) continue;
        const ch = await createCharacter({
          vrm: await modelBuffer(o.model), key: modelKey(o.model), legwearMaterials: o.model?.legwearMaterials || null,
          underwearOverlay: !!o.model?.underwearOverlay, colors: o.colors, tintable: !!o.model?.tintable || !!o.model?.asset,
          legwearType: o.legwearType, gender: e.def.gender, wetMaterials: o.model?.wetMaterials,
        });
        ch.civilian = true;
        ch.civName = e.name;
        ch.gender = e.def.gender;
        this.civPool.push(ch);
      } catch (err) {
        console.warn('extra civilian failed', err);
      }
    }
    const N = 60;
    for (let i = 0; i < N; i++) {
      let ch;
      if (tpls.length) {
        const t = tpls[i % tpls.length];
        ch = await createCharacter({ vrm: t.buf, key: 'civ:' + t.key, randomize: true, underwearOverlay: false, legwearMaterials: t.legwearMaterials || null, gender: t.gender });
        ch.gender = t.gender;
      } else ch = this.makeMannequinCiv();
      ch.civilian = true;
      this.civPool.push(ch);
    }
  }

  makeMannequinCiv() {
    const gender = Math.random() < 0.5 ? 'male' : 'female';
    const ch = createMannequin({ colors: randomColors(), gender, legwearType: gender === 'female' && Math.random() < 0.5 ? 'skirt' : 'pants', scale: 0.92 + Math.random() * 0.14 });
    ch.civilian = true;
    ch.gender = gender;
    return ch;
  }

  /** Load more townsfolk copies in the background when the pool runs low. */
  refillCivilians() {
    if (this._refilling || !this.civTemplates?.length) return;
    this._refilling = true;
    (async () => {
      try {
        for (let i = 0; i < 10 && !this.ended; i++) {
          const t = this.civTemplates[Math.floor(Math.random() * this.civTemplates.length)];
          const ch = await createCharacter({ vrm: t.buf, key: 'civ:' + t.key, randomize: true, underwearOverlay: false, legwearMaterials: t.legwearMaterials || null, gender: t.gender });
          ch.civilian = true;
          ch.gender = t.gender;
          this.civPool.push(ch);
          this.civMade = (this.civMade || 0) + 1;
        }
      } finally {
        this._refilling = false;
      }
    })();
  }

  /** False while waiting for more townsfolk copies to load (so no placeholder figures appear). */
  civAvailable() {
    if (this.civPool.length) return true;
    if (this.civTemplates?.length) {
      this.refillCivilians();
      return false;
    }
    return true;
  }

  acquireCivilian() {
    if (this.civPool.length < 8) this.refillCivilians();
    const ch = this.civPool.length ? this.civPool.splice(Math.floor(Math.random() * this.civPool.length), 1)[0] : this.makeMannequinCiv();
    ch.root.visible = true;
    ch.root.rotation.set(0, 0, 0);
    ch.setLegwear(true);
    ch.setProp(null);
    ch.setMood({});
    ch.setWet(0);
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

  /** home: build the at-home outfit (player only) instead of the outdoor one. */
  async charFromDef(def, key, full, home = false) {
    const { o: base, sel } = this.outfitFor(def, key);
    let o = base;
    let top = sel.top || null;
    let bottom = sel.bottom || null;
    if (home) {
      o = def.outfits[sel.home ?? def.homeOutfit ?? 0] || base;
      top = sel.homeTop || null;
      bottom = sel.homeBottom || null;
    }
    const lt = (home ? sel.homeLegwearType : sel.legwearType) || o.legwearType;
    const clothes = o.clothesFrom ? { vrm: await modelBuffer(o.clothesFrom), key: modelKey(o.clothesFrom), legwearMaterials: o.clothesFrom.legwearMaterials || null } : null;
    const ch = await createCharacter({
      vrm: await modelBuffer(o.model),
      key: modelKey(o.model),
      full,
      legwearMaterials: o.model?.legwearMaterials || null,
      underwearOverlay: !!o.model?.underwearOverlay || (!o.model && o.underwearOverlay !== false),
      colors: o.colors,
      tintable: !!o.model?.tintable || !!o.model?.asset,
      legwearType: lt,
      tintTop: top,
      tintBottom: bottom,
      wetMaterials: o.model?.wetMaterials || [],
      gender: def.gender,
      clothes,
    });
    ch.legwearType = lt === 'skirt' ? 'skirt' : 'pants';
    ch.gender = def.gender;
    return ch;
  }

  /** (Re)build the player, coworker and manager characters for today's outfits. */
  async loadDayChars() {
    ui.setScreen('<div class="loading">Getting everyone dressed...</div>');
    for (const c of [this.playerOut, this.playerHome]) {
      if (!c) continue;
      c.root.removeFromParent();
      c.dispose();
    }
    this.cwChars.forEach((c) => c && c.dispose());
    if (this.mgrChar) this.mgrChar.dispose();
    const p = this.profile;
    this.playerOut = await this.charFromDef(p.player, 'player', true);
    const sel = this.state.daily.player || {};
    const homeIdx = sel.home ?? p.player.homeOutfit;
    const sameHome = (homeIdx === undefined || homeIdx === null || homeIdx === (sel.outfit || 0)) && !sel.homeTop && !sel.homeBottom && !sel.homeLegwearType;
    this.playerHome = sameHome ? this.playerOut : await this.charFromDef(p.player, 'player', true, true);
    this.player.char = this.playerOut;
    this.scene.add(this.player.char.root);
    this.lw = this.playerOut.legwearType;
    this.cwChars = [];
    for (let i = 0; i < p.coworkers.length; i++) {
      this.cwChars[i] = this.state.cw[i].fired ? null : await this.charFromDef(p.coworkers[i], 'cw' + i, false);
    }
    this.mgrChar = await this.charFromDef(p.manager, 'mgr', false);
    ui.hideScreen();
  }

  /** Switch the player between the at-home and the going-out outfit. */
  wear(which, legwearOn) {
    const p = this.player;
    const next = which === 'home' ? this.playerHome || this.playerOut : this.playerOut;
    if (p.char !== next) {
      p.char.setProp(null);
      p.char.root.removeFromParent();
      p.char = next;
      this.scene.add(next.root);
      next.root.position.set(p.x, 0, p.z);
      next.root.rotation.y = p.yaw;
      next.resetPhysics();
    }
    next.setLegwear(legwearOn);
    next.setWet(p.wet);
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
      this.rain.dispose(this.scene);
      if (this.playerHome && this.playerHome !== this.playerOut) this.playerHome.dispose();
      this.playerOut?.dispose();
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
      if (e.code === 'KeyG' && !e.repeat) this.dropItem(true);
      if (e.code === 'KeyF' && !e.repeat) this.toggleMakeshift();
      if (e.code === 'KeyM' && !e.repeat) {
        this.settings.minimap = !this.settings.minimap;
        this.showMinimap();
      }
    };
    this._ku = (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE') this.cancelInteract();
    };
    this._mm = (e) => {
      if (document.pointerLockElement === this.canvas || this.dragging) {
        this.cam.yaw -= e.movementX * 0.0028;
        this.cam.pitch = Math.max(-1.45, Math.min(1.5, this.cam.pitch + e.movementY * 0.0024));
      }
    };
    this._md = (e) => {
      if (ui.dialogOpen || this.paused) return;
      if (e.button === 2) {
        // hold right-click: aim mode (mouse turns the character, A/D strafe)
        this.dragging = true;
        this.aiming = true;
      }
      else if (document.pointerLockElement !== this.canvas) {
        try {
          const pr = this.canvas.requestPointerLock();
          if (pr && pr.catch) pr.catch(() => {});
        } catch (_) {}
      }
    };
    this._mu = (e) => {
      if (e.button === 2) {
        this.dragging = false;
        this.aiming = false;
      }
    };
    this._wh = (e) => (this.cam.dist = Math.max(1.8, Math.min(9, this.cam.dist + Math.sign(e.deltaY) * 0.4)));
    this._plc = () => {
      if (!document.pointerLockElement && this.running && !ui.dialogOpen && !this.paused && !this.transitioning && !this.ended) this.pause();
    };
    this._blur = () => {
      this.keys.clear();
      this.aiming = this.dragging = false;
    };
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
        <p class="note">Progress is saved to this save slot at the start of each day.</p></div>`,
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

  /** Out under the sky (city streets or the pool courtyard). */
  get openAir() {
    return this.outdoors || this.phase === 'pool';
  }

  get outdoors() {
    return ['commute_am', 'commute_pm', 'dayoff'].includes(this.phase);
  }

  async enterPhase(phase, opts = {}) {
    this.transitioning = true;
    this.keys.clear();
    this.cancelInteract();
    if (!opts.first) await ui.fade(true);
    const prev = this.phase;
    if (this.player.bus) this.leaveBus(null, true);
    this.standUp(true);
    this.stopHiding(true);
    this.dropItem(false, true);
    if (this.player.makeshift) {
      this.player.makeshift.mesh.removeFromParent();
      this.player.makeshift = null;
    }
    if (this.level) this.scene.remove(this.level.group);
    this.clearNPCs();
    const outdoor = ['commute_am', 'commute_pm', 'dayoff'].includes(phase);
    if (this.buses && !outdoor && phase !== 'shop') {
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
    this.taskCarrying = null;
    p.carry = null;
    p.char.setProp(null);
    p.crouch = false;
    this.composure = 100;
    this.stamina = 100;
    this.distraction = null;
    this.complaints = this.complaints || 0;
    if (phase === 'lobby') this.lobbyDir = opts.dir || 'out';
    if (phase === 'hallway' || phase === 'pool') this.bldgDir = opts.dir || 'out';
    ui.set('hud-prompt', '');

    let L;
    if (phase === 'morning' || phase === 'evening') L = this.levels.apartment;
    else if (phase === 'lobby') L = this.levels.lobby;
    else if (phase === 'hallway') L = this.levels.hallway;
    else if (phase === 'pool') L = this.levels.pool;
    else if (phase === 'laundry') L = this.levels.laundry;
    else if (phase === 'work') L = this.levels.work;
    else if (phase === 'shop') L = this.shops[opts.place] || (this.shops[opts.place] = buildShop(opts.place));
    else L = this.levels.city;
    this.level = L;
    this.scene.add(L.group);
    // items torn up or worn last time are back (someone tidied up)
    for (const k of L.pickups || []) {
      if (!k.broken && !k.taken) continue;
      k.broken = false;
      k.taken = false;
      k.x = k.home.x;
      k.z = k.home.z;
      k.mesh.position.set(k.home.x, k.home.y + (k.mesh.userData.up < 0 ? 0.3 : 0), k.home.z);
      k.mesh.visible = true;
    }
    let spawn = L.spawn;
    if (phase === 'evening') spawn = L.doorSpawn;
    if (phase === 'lobby') spawn = this.lobbyDir === 'in' ? L.spawnFromStreet : L.spawnFromHome;
    if (outdoor && prev === 'lobby') spawn = L.spawnHome;
    if (outdoor && prev === 'pool') spawn = L.places.poolgate.out;
    if (phase === 'hallway') spawn = opts.from === 'stairs' ? L.spawnFromStairs : opts.from === 'elevator' ? L.spawnFromElevator : L.spawnFromApt;
    if (phase === 'pool') spawn = opts.from === 'stairs' ? L.spawnFromStairs : L.spawnFromGate;
    if (phase === 'lobby' && prev === 'hallway' && this.lobbyDir === 'out') spawn = L.spawnFromHome;
    if (phase === 'commute_pm' && prev === 'work') spawn = L.spawnWork;
    if (phase === 'dayoff' && prev === 'shop') spawn = L.places[this.shopPlace].out;
    p.x = spawn.x;
    p.z = spawn.z;
    p.yaw = spawn.yaw;
    this.cam.yaw = spawn.yaw;
    this.cam.pitch = 0.35;
    this.setLighting(phase);
    this.rain.set((outdoor || phase === 'pool') && this.isRaining);
    ui.showComposure(phase === 'work');
    if (this.minimap) this.minimap.setLevel(L);
    this.showMinimap();

    // which clothes: home outfit in the apartment, the day's outfit everywhere else
    const exposedDay = st.day > 1;
    if (phase === 'morning') this.wear('home', !exposedDay);
    else if (phase === 'evening') this.wear('home', false);
    else if (phase === 'lobby') this.wear('out', this.lobbyDir === 'out' && st.day === 1);
    else if (phase === 'hallway' || phase === 'pool') {
      const d = this.bldgDir;
      if (d === 'out') this.wear('out', st.day === 1);
      else if (d === 'down' || d === 'up') this.wear('home', false);
      else this.wear('out', false);
    } else if (phase === 'laundry') this.wear('home', false);
    else if (phase === 'commute_am') this.wear('out', st.day === 1);
    else if (phase === 'work') this.wear('out', st.day === 1);
    else this.wear('out', false);
    p.char.root.position.set(p.x, 0, p.z);
    p.char.root.rotation.y = p.yaw;
    this.scene.add(p.char.root);

    if (phase === 'morning') {
      this.morning = { wash: false, eat: false, dress: false };
      this.cam.dist = 3.2;
      this.clock = 450;
      p.wet = 0;
    } else if (phase === 'hallway' || phase === 'pool' || phase === 'laundry') {
      if (this.bldgDir === 'out' && phase !== 'laundry') this.clock = Math.max(this.clock, 460);
      if (phase === 'laundry') this.clock = Math.max(this.clock, 1380);
      this.cam.dist = phase === 'pool' ? 4.2 : 3.2;
      this.spawnResidents(phase, prev);
    } else if (phase === 'lobby') {
      if (this.lobbyDir === 'out') this.clock = Math.max(this.clock, 465);
      this.spawnShopPeople();
      this.customerTimer = 6;
      this.cam.dist = 3.6;
    } else if (outdoor) {
      if (phase === 'commute_am') this.clock = Math.max(this.clock, 468);
      if (phase === 'commute_pm' && prev === 'work') this.clock = 1050;
      if (phase === 'dayoff' && prev === 'lobby' && !this.dayoffStarted) {
        this.clock = 600;
        this.dayoffStarted = true;
      }
      if (!this.buses) this.buses = new BusSystem(this, L);
      this.spawnPedestrians(true);
      this.cam.dist = 4.5;
    } else if (phase === 'work') {
      this.lateMins = Math.round(this.clock - 540);
      this.clock = 540;
      this.work = {
        clockedIn: false, clockedOut: false, done: 0, quota: 5 + (st.day % 3), task: null, step: 0, lastTpl: null, sneakT: 0,
        mishapPending: st.day === 1, coverT: 0,
      };
      this.complaints = 0;
      this.mgrGrace = 0;
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
      this.errand = (this.errands || []).find((e) => e.place === opts.place && !e.done) || null;
      this.errandStep = 0;
      this.spawnShopPeople();
      this.customerTimer = 5;
      this.cam.dist = 3.5;
    } else if (phase === 'evening') {
      this.cam.dist = 3.2;
      if (st.day === 1 && !st.eveningShown && !this.night) this.night = { stage: 'gather' };
    }
    if (this.night && this.night.stage === 'carry' && ['evening', 'hallway', 'laundry'].includes(phase)) this.setTaskCarry('laundry');
    p.char.resetPhysics();
    this.updateHUD();
    await ui.fade(false);
    this.transitioning = false;
    this.last = performance.now();
    await this.phaseIntro(phase, prev);
  }

  get isRaining() {
    return this.weather === 'rain';
  }

  showMinimap() {
    const on = this.settings.minimap !== false && !!this.minimap;
    const mm = document.getElementById('minimap');
    const cp = document.getElementById('compass');
    if (mm) mm.style.display = on ? 'block' : 'none';
    if (cp) cp.style.display = on ? 'block' : 'none';
  }

  async prepareMorning() {
    await ui.fade(false);
    if (this.hooks.chooseOutfits) {
      ui.showHUD(false);
      await this.hooks.chooseOutfits(this);
      ui.showHUD(true);
    }
    await this.loadDayChars();
    this.weather = weatherFor(this.state.day, (this.state.seed || 1) % 97);
    this.dayoffStarted = false;
    this.player.wet = 0;
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
      if (st.day === CELESTI_DAY && !st.celestiMet) {
        await this.celestiAppear();
        return;
      }
      let text;
      if (st.day === 1) text = STORY.intro(name);
      else if (!this.isWorkday)
        text = `It's ${wd}! No work today.\n\nBut there are errands to run:\n${this.errands.map((e) => '• ' + e.name + ' — ' + PLACES[e.place].name).join('\n')}\n\nBeing seen in town won't get you fired, but it will add to your Shame. Buses can get you around faster.`;
      else
        text = `${wd} morning. ${name} wakes up and remembers the situation.\n\nGet ready, then head to work. You need to be there by 9:00 AM. The bus is faster than walking, but it doesn't go straight to ${this.job.workplaceName}.`;
      text += `\n\nWeather: ${WEATHER[this.weather].label}.${this.isRaining ? ' Getting soaked makes clothes cling... an umbrella keeps you dry.' : ''}`;
      await this.dialog(`Day ${st.day} — ${wd}`, text);
    } else if (phase === 'lobby') {
      if (this.lobbyDir === 'out') ui.toast('The building lobby. The street door is to the south.', '', 4000);
      else ui.toast('Take the elevator up to your apartment.', '', 4000);
    } else if (phase === 'commute_am') {
      ui.toast(`Get to ${this.job.workplaceName} by 9:00. Bus stops are marked with colored BUS signs.`, '', 6000);
      if (st.day > 1) ui.toast('People who notice you raise your Shame. Hedges, bushes and parks give cover.', 'bad', 6000);
    } else if (phase === 'work') {
      ui.toast('Clock in at the time clock in the locker room (through the STAFF ONLY doors).', '', 6000);
      if (this.isRaining && this.player.wet > 0.3) ui.toast("You're dripping wet from the rain...", '', 4000);
      if (this.lateMins > 0) ui.toast(`You're ${this.lateMins} minutes late!`, 'bad', 5000);
    } else if (phase === 'commute_pm' && prev === 'work') {
      ui.toast('Shift over! Get home to Maple Court Apartments.', '', 5000);
    } else if (phase === 'dayoff' && prev === 'lobby' && this.clock <= 601) {
      ui.toast('Run your errands. Your apartment is at Maple Court, the shops are all over town.', '', 6000);
    } else if (phase === 'shop') {
      if (this.errand) ui.toast(`Errand: ${this.errand.name}`, '', 4000);
      else ui.toast('Nothing to do here today.', '', 3000);
    } else if (phase === 'hallway') {
      const d = this.bldgDir;
      if (d === 'down') ui.toast('Quietly now. Take the elevator down to the basement.', '', 4500);
      else if (d === 'out') ui.toast('Elevator to the lobby, or the back stairs down to the pool and out the side gate.', '', 5000);
      else ui.toast('Your door is 7F-05.', '', 3000);
    } else if (phase === 'pool') {
      if (prev !== 'pool') ui.toast(this.bldgDir === 'in' ? "Almost nobody uses the pool at this hour. The back stairs lead up to your floor." : 'Out through the gate to the street.', '', 5000);
    } else if (phase === 'laundry') {
      ui.toast('Nobody here. Load a washer.', '', 4000);
    } else if (phase === 'evening') {
      if (this.night && this.night.stage === 'gather' && prev !== 'evening') {
        await this.dialog('Home at last', STORY.day1Home(this.lw));
        return;
      }
      if (this.night && this.night.stage !== 'done') return;
      if (st.celestiMet && this.allBlessed()) {
        await this.win();
        return;
      }
      ui.toast('Get some sleep.', '', 4000);
    }
  }

  setLighting(phase) {
    const s = this.scene;
    const outdoor = ['commute_am', 'commute_pm', 'dayoff', 'pool'].includes(phase);
    if (outdoor) {
      const evening = phase === 'commute_pm' || (phase === 'pool' && this.clock > 1000);
      const w = this.weather || 'sunny';
      let sky = evening ? '#f0a46a' : phase === 'dayoff' ? '#9fd3ff' : '#a9d6ff';
      if (w === 'cloudy') sky = evening ? '#b8968a' : '#b9c3cc';
      if (w === 'rain') sky = evening ? '#6d6470' : '#7f8a94';
      s.background = new THREE.Color(sky);
      s.fog = new THREE.Fog(sky, w === 'rain' ? 35 : 60, w === 'rain' ? 120 : 190);
      this.hemi.color.set(evening ? '#ffd2b0' : '#dff1ff');
      this.hemi.groundColor.set(evening ? '#5a4050' : '#7a6a5a');
      this.hemi.intensity = (evening ? 1.0 : 1.25) * (w === 'sunny' ? 1 : 1.1);
      this.sun.color.set(evening ? '#ffb27a' : '#fff2db');
      this.sun.intensity = (evening ? 1.8 : 2.3) * (w === 'sunny' ? 1 : w === 'cloudy' ? 0.5 : 0.3);
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

  /** A coworker's role: home station tag and preferred tasks. */
  role(i) {
    const list = ROLE_TASKS[this.jobId] || ROLE_TASKS.office;
    return list[i % list.length];
  }

  spawnStaff() {
    const L = this.level;
    const ws = [...L.pois.workstations];
    const used = new Set();
    this.profile.coworkers.forEach((c, i) => {
      const cw = this.state.cw[i];
      const ch = this.cwChars[i];
      if (cw.fired || !ch) return;
      const role = this.role(i);
      let st = L.stations.find((s) => s.owner === i);
      if (!st) {
        const cands = L.stationsByTag(role.home).filter((s) => !used.has(s));
        st = cands.length ? pick(cands) : L.stationsByTag(role.home)[0];
      }
      if (!st) st = ws[i % ws.length];
      used.add(st);
      // their own chair: the one at their desk, or a free chair right by their station
      let seat = L.seats.find((x) => x.owner === i);
      if (!seat) {
        seat = L.seats.filter((x) => x.owner === undefined && Math.hypot(x.x - st.x, x.z - st.z) < 1.3).sort((a, b) => Math.hypot(a.x - st.x, a.z - st.z) - Math.hypot(b.x - st.x, b.z - st.z))[0];
        if (seat) seat.owner = i;
      }
      cw.playing = cw.joined && !cw.blessed && Math.random() < 0.6;
      const n = new NPC(this, ch, {
        kind: 'coworker', name: c.name, personality: c.personality, index: i, station: st, legwearType: ch.legwearType,
        x: st.x, z: st.z, yaw: st.yaw, range: 13, speed: 1.25 + Math.random() * 0.15,
      });
      n.gender = c.gender;
      n.role = role;
      n.seat = seat || null;
      // a joined oddball changes in private first; blessed coworkers arrive already without legwear
      this.setSneaking(n, cw.blessed);
      if (cw.playing && !cw.blessed) this.stripPrivately(n, false);
      else n.plan(seat ? this.sitSteps(n, seat, 4 + Math.random() * 8) : [{ work: true, t: 2 + Math.random() * 6, yaw: st.yaw }]);
      this.npcs.push(n);
    });
    const m = L.pois.manager;
    this.mgrChar.setLegwear(true);
    const mgr = new NPC(this, this.mgrChar, {
      kind: 'manager', name: this.profile.manager.name, x: m.desk.x, z: m.desk.z, yaw: m.desk.yaw, range: 14, speed: 1.2,
    });
    mgr.gender = this.profile.manager.gender;
    mgr.plan([{ work: true, t: 10, yaw: m.desk.yaw }]);
    this.manager = mgr;
    this.npcs.push(mgr);
  }

  setSneaking(n, on) {
    n.sneaking = on;
    n.char.setLegwear(!on);
    if (!on && n.heldPickup) {
      // put the cover item back down
      const k = n.heldPickup;
      n.heldPickup = null;
      n.keepCarry = null;
      n.setCarry(null);
      k.taken = false;
      k.x = n.x + 0.4;
      k.z = n.z;
      k.mesh.position.set(k.x, 0.02, k.z);
      k.mesh.visible = true;
    }
  }

  /** Free chairs whose sitter got up or was re-planned. */
  releaseSeats() {
    for (const s of this.level.seats || []) {
      const t = s.taken;
      if (t && t !== 'player' && typeof t === 'object' && (t.removed || !t.sitting)) s.taken = false;
    }
  }

  // ---- brains ----
  /** Steps for a coworker doing a task: walk, work at each station, carrying things between. */
  taskSteps(task, slow = 1) {
    const steps = [];
    for (const s of task.steps) {
      steps.push({ go: s.station });
      steps.push({ work: true, t: (s.time * 2 + 1 + Math.random() * 2) * slow, yaw: s.station.yaw, carry: s.carry, drop: s.drop });
    }
    return steps;
  }

  /** Walk to a chair, sit for a while (the chair counts as taken), then get up. */
  sitSteps(n, seat, t) {
    return [
      { go: seat },
      { sit: true, t, yaw: seat.yaw, call: () => (seat.taken = n), seatRef: seat },
      { t: 0, call: () => seat.taken === n && (seat.taken = false) },
    ];
  }

  /** Steps that end with the coworker back at their own station: seated if they have a chair. */
  homeSteps(n, t) {
    const seat = n.seat;
    if (seat && !seat.taken) return this.sitSteps(n, seat, t);
    if (seat && seat.taken === 'player') {
      // somebody is in their chair...
      return [
        { go: { x: seat.x + Math.sin(seat.yaw) * 0.9, z: seat.z + Math.cos(seat.yaw) * 0.9 } },
        { t: 5, yaw: seat.yaw + Math.PI, call: () => this.seatStolen(n) },
      ];
    }
    return [{ go: n.station }, { work: true, t, yaw: n.station.yaw }];
  }

  /** They came back to their chair and you're in it: they wait, ask, then look closer. */
  seatStolen(n) {
    const p = this.player;
    if (p.sitAt !== n.seat) {
      n.seatComplaints = 0;
      return;
    }
    n.seatComplaints = (n.seatComplaints || 0) + 1;
    const c = n.seatComplaints;
    this.talkMood(n, c > 1 ? { angry: 0.4, surprised: 0.4 } : { surprised: 0.7 }, 5);
    if (c === 1) this.bubble(n, pick(["Um... that's my chair.", `${this.profile.name}? You're in my seat.`, 'Why are you sitting at my desk?']), 4);
    else if (c === 2) this.bubble(n, pick(['Seriously. I need my chair.', 'Could you get up, please?', "I'm waiting..."]), 4);
    else {
      this.bubble(n, 'Okay, what is going on with you?', 4);
      n.seatComplaints = 0;
      if (this.playerExposed() && !this.complicit(n)) return this.caught(n);
      return;
    }
    // keep waiting by the chair
    n.plan(this.homeSteps(n, 4));
  }

  /** Oddballs (and anyone joining in) slip away somewhere private before taking their legwear off. */
  stripPrivately(n, announce = true) {
    const L = this.level;
    const spot = this.privateSpot(n);
    n.stripping = true;
    n.plan([
      { go: spot },
      { hide: true, t: 3 },
      {
        t: 0.5,
        call: () => {
          n.stripping = false;
          this.setSneaking(n, true);
          if (announce) this.bubble(n, pick(['Okay. Game on.', 'Hehe... ready!', 'Stealth mode: activated.']), 3);
        },
      },
    ]);
    void L;
  }

  /** A hiding spot or quiet corner nobody can see right now (falls back to the nearest hiding spot). */
  privateSpot(n) {
    const L = this.level;
    const spots = [...(L.pois.hideSpots || [])];
    const watchers = this.npcs.filter((o) => o !== n && o.kind !== 'pedestrian');
    const ok = spots.filter((h) => watchers.every((o) => !this.level.lineOfSight(o.eye(), new THREE.Vector3(h.x, 0.9, h.z))));
    return this.nearest(ok.length ? ok : spots, n) || n.station;
  }

  coworkerBrain(n) {
    const L = this.level;
    const r = Math.random();
    const home = n.station;
    if (n.stripping) return this.stripPrivately(n);
    // sneakers grab something to hold in front of them first
    if (n.sneaking && !n.keepCarry && Math.random() < 0.8) {
      const pk = (L.pickups || []).filter((k) => !k.taken && Math.hypot(k.x - n.x, k.z - n.z) < 18).sort((a, b) => Math.hypot(a.x - n.x, a.z - n.z) - Math.hypot(b.x - n.x, b.z - n.z))[0];
      if (pk) {
        pk.taken = true;
        return n.plan([
          { go: pk },
          {
            t: 0.6,
            call: () => {
              pk.mesh.visible = false;
              n.keepCarry = pk.kind;
              n.heldPickup = pk;
              n.setCarry(pk.kind);
            },
          },
          ...this.homeSteps(n, 4 + Math.random() * 6),
        ]);
      }
    }
    // sneakers keep to cover and quiet spots more often
    if (n.sneaking && r < 0.22 && L.pois.hideSpots.length) {
      const h = this.nearest(L.pois.hideSpots, n);
      n.plan([{ go: h }, { hide: true, t: 6 + Math.random() * 9 }]);
      return;
    }
    // short breaks: coffee, water, the restroom
    if (r < 0.1) {
      const s = this.nearest([...L.stationsByTag('coffee'), ...L.stationsByTag('fridge'), ...L.stationsByTag('microwave'), ...L.stationsByTag('cooler')], n);
      if (s) return n.plan([{ go: s }, { work: true, t: 5 + Math.random() * 5, yaw: s.yaw }, ...this.homeSteps(n, 6 + Math.random() * 6)]);
    }
    if (r < 0.14) {
      const s = this.nearest(L.stationsByTag('sink'), n);
      if (s) return n.plan([{ go: s }, { work: true, t: 4, yaw: s.yaw }, ...this.homeSteps(n, 6)]);
    }
    // role tasks most of the time, the odd general chore
    if (r < 0.72) {
      const pool = this.taskPool();
      const names = n.role ? n.role.tasks : [];
      const own = pool.filter((t) => names.includes(t.name));
      const tpl = own.length && Math.random() < 0.85 ? pick(own) : pick(pool);
      const task = tpl && this.resolveTask(tpl, n);
      if (task) return n.plan([...this.taskSteps(task, n.sneaking ? 1.2 : 1), ...this.homeSteps(n, 4 + Math.random() * 8)]);
    }
    // back at their own station
    void home;
    n.plan(this.homeSteps(n, 12 + Math.random() * 14));
  }

  nearest(list, from) {
    let best = null;
    let bd = Infinity;
    for (const s of list) {
      const d = Math.hypot(s.x - from.x, s.z - from.z) + Math.random() * 4;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  managerBrain(n) {
    const L = this.level;
    const m = L.pois.manager;
    if (Math.random() < (this.mgrGrace > 0 ? 0.8 : 0.45)) return n.plan([{ go: m.desk }, { work: true, t: 12 + Math.random() * 10, yaw: m.desk.yaw }]);
    // walk the floor: check on staff at their stations
    const staff = this.npcs.filter((o) => o.kind === 'coworker' && o.station);
    const pts = [];
    for (let i = 0; i < 3; i++) pts.push(staff.length && Math.random() < 0.6 ? pick(staff).station : pick(L.pois.wander));
    n.plan(pts.flatMap((p) => [{ go: { x: p.x + (Math.random() - 0.5) * 1.2, z: p.z + (Math.random() - 0.5) * 1.2 } }, { t: 3 + Math.random() * 3 }]));
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
    if (count >= (L.maxCustomers || 4) || !this.civAvailable()) return;
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
    for (const c of L.pois.clerks || []) {
      const n = new NPC(this, this.acquireCivilian(), { kind: 'clerk', name: 'clerk', x: c.x, z: c.z, yaw: c.yaw, range: 10 });
      n.plan([{ work: true, t: 9999, yaw: c.yaw }]);
      this.npcs.push(n);
    }
    (L.pois.queue || []).forEach((q, i) => {
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
      if (n.char.civName) n.name = n.char.civName;
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
    while (count < want && guard++ < 60 && this.civAvailable()) {
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
      this.dressCivilian(n);
      this.npcs.push(n);
      count++;
    }
  }

  /** Names for townsfolk from other saves, umbrellas or wet clothes in the rain. */
  dressCivilian(n) {
    if (n.char.civName) n.name = n.char.civName;
    n.gender = n.char.gender;
    if (this.isRaining && this.outdoors) {
      if (!n.sitting && Math.random() < 0.7) n.setCarry('umbrella');
      else n.char.setWet(0.6 + Math.random() * 0.4);
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
    if (['commute_am', 'commute_pm', 'dayoff', 'shop', 'lobby', 'hallway', 'pool', 'laundry'].includes(this.phase)) this.clock += dt * this.minPerSec;
    if (this.phase === 'laundry') this.updateLaundry(dt);
    this.mgrGrace = Math.max(0, this.mgrGrace - dt);
    if (this.timers && this.timers.length) {
      for (const tm of [...this.timers]) {
        tm.t -= dt;
        if (tm.t <= 0) {
          this.timers.splice(this.timers.indexOf(tm), 1);
          tm.fn();
        }
      }
    }

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
    this.updateWetness(dt);
    this.updateMakeshift(dt);
    const exposed = this.playerExposed();
    const atHome = this.phase === 'morning' || this.phase === 'evening';
    const seated = !!p.seat || !!p.sitAt;
    p.char.update(dt, { speed: p.speed, crouch: (p.crouching && !seated) || !!p.hidden, sit: seated, carry: !!p.carry || !!p.inter });
    if (!p.bus) {
      p.char.root.position.set(p.x, 0, p.z);
      p.char.root.rotation.y = p.yaw;
    }

    if (this.celestiChar) {
      const c = this.celestiChar;
      c.root.position.y = 0.15 + Math.sin(performance.now() / 600) * 0.06;
      // she turns to face you
      const cs = this.levels.apartment.pois.celesti;
      c.root.rotation.y += angDiff(Math.atan2(p.x - cs.x, p.z - cs.z), c.root.rotation.y) * Math.min(1, dt * 3);
      c.update(dt, { speed: 0 });
    }
    L.update(dt, this);
    for (const n of [...this.npcs]) if (!n.removed) n.update(dt, t);
    if (this.buses) this.buses.update(dt);
    for (const r of this.cwRuntime) {
      r.lendCd = Math.max(0, r.lendCd - dt);
      r.distractCd = Math.max(0, r.distractCd - dt);
    }
    if (this.phase === 'work' || this.phase === 'shop' || this.phase === 'lobby') {
      this.customerTimer -= dt;
      if (this.customerTimer <= 0) {
        this.customerTimer = (this.phase === 'lobby' ? 12 : 5) + Math.random() * 9;
        this.spawnCustomer(this.phase === 'work' ? null : this.phase === 'lobby' ? 'resident' : 'shopper');
      }
    }
    if (this.outdoors) {
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
    if (p.borrow) this.updateBorrow(dt); else if (p.bus) {
      const b = p.bus;
      const st = b.currentStop || b.stopAt(b.nextStop);
      ui.borrow(`${b.line.name} — ${b.state === 'dwell' ? 'Stopped at' : 'Next stop:'} ${st.name}`);
    } else ui.borrow(null);

    this.detect(dt);
    this.seatT = (this.seatT || 0) - dt;
    if (this.seatT <= 0) {
      this.seatT = 0.5;
      this.releaseSeats();
    }
    if (this.phase === 'work' && !ui.dialogOpen) {
      for (const n of this.npcs) {
        if (!n.checkingOn) continue;
        if (n.checkingOn < performance.now()) n.checkingOn = 0;
        else if (Math.hypot(n.x - p.x, n.z - p.z) < 2.3) {
          this.excuseCheck(n);
          break;
        }
      }
    }
    if (this.phase === 'work') {
      this.detectSneakers(dt);
      this.updateSneakers(dt);
      this.updateBonding(dt);
    }
    if (p.bus) this.busExposure(dt);
    this.updateMoods(dt, exposed && !atHome);

    const sh = this.state.shame / 100;
    ui.vignette(sh * sh);
    this.updatePrompt();
    this.updateHUD();
  }

  /** Is the player's underwear showing? (borrowed legwear and makeshift skirts count as covered) */
  playerExposed() {
    const p = this.player;
    return !!p.char && !p.char.legwearOn && !p.borrow && !p.makeshift;
  }

  // ---- makeshift skirts (box, paper, towel, tote bag...) ----
  toggleMakeshift() {
    const p = this.player;
    if (p.makeshift) return this.failMakeshift(null, true);
    const k = p.pickup;
    if (!k || p.char.legwearOn || p.borrow || p.bus) return;
    const M = MAKESHIFT[k.kind];
    if (!M) return ui.toast(`You can't really wear a ${PICKUP_LABELS[k.kind] || k.kind}.`, '', 2500);
    p.pickup = null;
    p.carry = null;
    p.char.setProp(null);
    k.taken = true;
    k.broken = true;
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.25, 0.3, 14, 1, true), new THREE.MeshStandardMaterial({ color: M.color, side: THREE.DoubleSide, roughness: 0.9 }));
    const hip = p.char.hipHeight || 0.9;
    g.position.y = hip - 0.12;
    g.scale.set(1.0, 1, 0.82);
    p.char.root.add(g);
    p.makeshift = { kind: k.kind, M, mesh: g, life: M.life[0] + Math.random() * (M.life[1] - M.life[0]), pickup: k };
    ui.toast(`${M.name}. ${M.wear}`, '', 4500);
  }

  updateMakeshift(dt) {
    const p = this.player;
    const m = p.makeshift;
    if (!m) return;
    const moving = p.speed > 0.3;
    let wear = moving ? (p.running ? 2.5 : 1) : 0.15;
    if (m.M.wind && this.outdoors) wear *= 2;
    m.life -= wear * dt;
    // fabric snags on chair legs
    if (m.M.snags && moving && Math.random() < dt * 0.5) {
      const near = (this.level.seats || []).some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 0.9);
      if (near) return this.failMakeshift(m.M.snagLine);
    }
    if (m.life <= 0) this.failMakeshift(m.M.fail);
  }

  failMakeshift(line, voluntary = false) {
    const p = this.player;
    const m = p.makeshift;
    if (!m) return;
    m.mesh.removeFromParent();
    m.mesh.geometry.dispose();
    p.makeshift = null;
    if (voluntary) {
      // take it off and hold it again
      m.pickup.broken = false;
      p.pickup = m.pickup;
      this.holdProp(m.kind);
      ui.toast(`You take off the ${m.M.short}.`, '', 2500);
      return;
    }
    ui.toast(line, 'bad', 4500);
    p.char.setMood({ surprised: 1, sad: 0.5 });
  }

  // ---- facial expressions from feelings ----
  updateMoods(dt, exposed) {
    this.moodT = (this.moodT || 0) - dt;
    if (this.moodT > 0) return;
    this.moodT = 0.2;
    const p = this.player;
    const sh = this.state.shame / 100;
    const seen = this.seenBy > 0;
    if (exposed) {
      p.char.setMood({
        sad: 0.25 + sh * 0.5,
        surprised: seen ? 0.85 : 0.1,
        angry: 0,
        happy: 0,
        relaxed: 0,
      });
    } else if (this.phase === 'evening' || this.phase === 'morning') {
      p.char.setMood({ relaxed: this.phase === 'evening' ? 0.2 : 0, sad: sh * 0.5, happy: this.state.day === 1 && this.phase === 'morning' ? 0.4 : 0 });
    } else p.char.setMood({ happy: p.borrow ? 0.4 : 0.15 * (1 - sh), sad: sh * 0.4 });
    for (const n of this.npcs) {
      if (n.talkMood && n.talkMoodT > 0) {
        n.talkMoodT -= 0.2;
        n.char.setMood(n.talkMood);
        continue;
      }
      n.char.setMood(this.npcMood(n));
    }
  }

  npcMood(n) {
    if (n.sneaking && !n.char.legwearOn) {
      if (n.personality === 'oddball' && !this.state.cw[n.index]?.blessed) return { happy: 0.6, surprised: n.watchedT > 0 ? 0.5 : 0 };
      return { sad: 0.45, surprised: n.watchedT > 0 ? 0.9 : 0.15 };
    }
    if (n.distractT > 0) return { surprised: 0.7 };
    if (n.suspicion > 0.4) return { surprised: Math.min(1, n.suspicion), angry: n.personality === 'strict' || n.kind === 'manager' ? 0.3 : 0 };
    if (n.kind === 'manager') return { angry: this.mgrGrace > 0 ? 0 : 0.05, relaxed: 0.1 };
    if (n.sitting) return { relaxed: 0.35 };
    if (n.personality === 'friend' || n.personality === 'sympathetic') return { happy: 0.25 };
    if (n.personality === 'strict') return { angry: 0.1 };
    return {};
  }

  /** Make an NPC show a feeling for a while (reactions). */
  talkMood(n, mood, t = 5) {
    if (!n) return;
    n.talkMood = mood;
    n.talkMoodT = t;
    n.char.setMood(mood);
  }

  // ---- residents: the neighbor in 7F-06, people at the pool ----
  neighborChar() {
    if (!this._neighbor || this._neighbor.root.parent) {
      // reuse a male townsperson as the neighbor for the whole game
      const i = this.civPool.findIndex((c) => c.gender === 'male');
      this._neighbor = i >= 0 ? this.civPool.splice(i, 1)[0] : this.acquireCivilian();
      this._neighbor.civilian = false;
    }
    const c = this._neighbor;
    c.root.visible = true;
    c.setLegwear(true);
    c.setProp(null);
    return c;
  }

  spawnResidents(phase, prev) {
    const L = this.level;
    const st = this.state;
    st.neighbor = st.neighbor || {};
    if (phase === 'hallway') {
      // he has a habit of opening his door at exactly the wrong moment
      const chance = prev === 'pool' ? 0.8 : this.bldgDir === 'out' ? 0.3 : 0.55;
      if (Math.random() < chance) {
        this.later(2 + Math.random() * 4, () => {
          if (this.phase !== 'hallway') return;
          const d = L.pois.neighborDoor;
          const n = new NPC(this, this.neighborChar(), { kind: 'resident', name: 'Neighbor (7F-06)', x: d.x, z: d.z, yaw: d.yaw, range: 11, gender: 'male' });
          n.isNeighbor = true;
          n.plan([{ t: 5 + Math.random() * 3, yaw: d.yaw - Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1) }, { t: 2, yaw: d.yaw }, { call: () => this.removeNPC(n) }]);
          this.npcs.push(n);
          ui.toast('*click* A door opens down the hall...', 'bad', 2500);
        });
      }
    } else if (phase === 'pool' && !this.isRaining && this.clock < 1200) {
      for (const sp of L.pois.customerSpots.slice(0, 1 + Math.floor(Math.random() * 2))) {
        const n = new NPC(this, this.acquireCivilian(), { kind: 'resident', name: 'resident', x: sp.x, z: sp.z, yaw: sp.yaw, range: 10 });
        n.sitting = !!sp.sit;
        n.plan([{ sit: !!sp.sit, t: 9999, yaw: sp.yaw }]);
        this.npcs.push(n);
      }
    }
  }

  /** Run something after a delay (game time; skipped if the game ended). */
  later(sec, fn) {
    (this.timers ||= []).push({ t: sec, fn });
  }

  /** Talking your way past a neighbor. */
  async residentTalk(n) {
    const st = this.state;
    const p = this.player;
    n.noticeCooldown = 9999;
    n.plan([]);
    n.state = 'talk';
    const nb = (st.neighbor ||= {});
    if (n.talked) return;
    n.talked = true;
    let opts;
    let intro;
    if (n.isNeighbor && this.phase === 'laundry') {
      intro = nb.met ? `"Oh. Hi." The neighbor from 7F-06 again, with a basket of laundry. He looks at you, then at the blinking washer.\n\n(He definitely remembers.)` : `A young man steps out of the elevator with a basket of laundry, and stops dead. "Oh. ...Hi."`;
      opts = [
        { label: '"Laundry."', value: 'laundry' },
        { label: '"The machine locked."', value: 'locked' },
        { label: '"Perfectly fine." (you are shaking)', value: 'fine' },
      ];
    } else if (n.isNeighbor) {
      intro = `The door of 7F-06 opens and your neighbor steps out. He stops. His eyes go down... and come back up very fast.\n\n"...Evening."`;
      opts = [
        { label: '"Swimming."', value: 'swim' },
        { label: '"...Good evening."', value: 'evening' },
        { label: '"Laundry."', value: 'laundry' },
      ];
    } else {
      intro = `A resident lounging by the pool looks up from their phone. "Uh... are you okay?"`;
      opts = [
        { label: '"Swimming!"', value: 'swim' },
        { label: '"Long story."', value: 'story' },
      ];
    }
    p.char.setMood({ surprised: 1, sad: 0.4 });
    this.talkMood(n, { surprised: 0.8 }, 6);
    const v = await this.dialog(n.isNeighbor ? 'Your neighbor' : 'A resident', intro, opts);
    let reply;
    let shame = SHAME.pedestrian;
    const wet = p.wet > 0.3 || this.sayswam;
    if (v === 'swim') {
      reply = wet ? `"Swimming?"\n\n"Yes."\n\nA long pause. He looks at the puddle forming at your feet. "...Right. Have a good evening."` : `"Swimming." He looks at your completely dry hair. "...In the hallway?"`;
      shame *= wet ? 0.4 : 1.2;
    } else if (v === 'laundry' && this.phase === 'laundry') {
      reply = `"Laundry?" He nods slowly. "I figured." He starts loading a machine two down from yours, very carefully not looking over.`;
      shame *= 0.6;
    } else if (v === 'locked') {
      reply = `"Ah. Happens sometimes." He glances at the error light. "Want me to get the building manager?"\n\n"NO! I mean... no, thank you."\n\n"Okay."`;
      shame *= 0.7;
    } else if (v === 'fine') {
      reply = `"You're shaking."\n\n"I'm not."\n\nHe very politely pretends to believe you.`;
    } else if (v === 'story') {
      reply = `"Ah. Okay." They go back to their phone. Then look again. Then back to the phone.`;
      shame *= 0.8;
    } else {
      reply = `"...Evening." He nods once, and very deliberately studies the ceiling until you've passed.`;
      shame *= 0.8;
    }
    if (n.isNeighbor) nb.met = true;
    this.addShame(shame);
    await this.dialog(n.isNeighbor ? 'Your neighbor' : 'A resident', reply);
    if (!n.removed) {
      n.state = 'idle';
      if (n.isNeighbor && this.phase === 'hallway') n.plan([{ t: 1.5 }, { call: () => this.removeNPC(n) }]);
      else if (n.isNeighbor) n.plan([{ work: true, t: 10, yaw: Math.PI, drop: true }, { go: this.level.pois.entrance }, { call: () => this.removeNPC(n) }]);
      else n.plan([{ t: 9999, yaw: n.yaw }]);
    }
  }

  // ---- day 1 night: the laundry room ----
  startWash(id) {
    const nt = this.night;
    nt.stage = 'washing';
    nt.washer = id;
    nt.t = 20;
    this.clearTaskCarry();
    ui.toast('Everything goes in tonight. Clean blouse, clean skirt, normal commute tomorrow...', '', 5000);
  }

  updateLaundry(dt) {
    const nt = this.night;
    if (!nt) return;
    if (nt.stage === 'washing') {
      nt.t -= dt;
      if (nt.t <= 0) {
        nt.stage = 'locked';
        nt.t = 40;
        ui.toast('BEEP. ERROR E03. The door is locked... with everything you own inside. And you are standing in the laundry room.', 'bad', 7000);
        this.player.char.setMood({ surprised: 1, sad: 0.6 });
        // and of course, someone else does laundry at midnight
        this.later(6, () => {
          if (this.phase !== 'laundry') return;
          const L = this.level;
          const e = L.pois.entrance;
          const n = new NPC(this, this.neighborChar(), { kind: 'resident', name: 'Neighbor (7F-06)', x: e.x, z: e.z, yaw: Math.PI / 2, range: 12, gender: 'male' });
          n.isNeighbor = true;
          n.setCarry('laundry');
          const w = L.interactables.get('washer4');
          n.plan([
            { go: { x: w.x, z: w.z } },
            // unless you're hiding, there's no avoiding this conversation
            { t: 0.5, call: () => !n.talked && !this.player.hidden && this.playerExposed() && this.residentTalk(n) },
            { work: true, t: 12, yaw: Math.PI, drop: true },
            { go: e },
            { call: () => this.removeNPC(n) },
          ]);
          this.npcs.push(n);
          ui.toast('*DING* ...the elevator. Someone is coming down.', 'bad', 4000);
        });
      }
    } else if (nt.stage === 'locked') {
      nt.t -= dt;
      if (nt.t <= 0 && !ui.dialogOpen) {
        nt.stage = 'done';
        this.state.eveningShown = true;
        this.dialog('Wardrobe Disaster', STORY.day1Laundry(this.lw));
      }
    }
  }

  // ---- rain and wet clothes ----
  updateWetness(dt) {
    const p = this.player;
    let w = p.wet;
    const umbrella = p.carry === 'umbrella';
    if (this.openAir && this.isRaining && !p.bus && !umbrella) w = Math.min(1, w + dt * 0.035);
    else if (!this.openAir || !this.isRaining || p.bus) {
      // drying off: a couple of minutes indoors, faster at home (towel)
      const home = this.phase === 'morning' || this.phase === 'evening';
      w = Math.max(0, w - dt * (home ? 1 / 40 : this.outdoors ? 1 / 240 : 1 / 150));
    }
    // splashed by a passing car in the rain
    if (this.outdoors && this.isRaining && !p.bus && this.level.cars) {
      for (const c of this.level.cars) {
        const x = c.axis === 'z' ? c.lane : c.pos;
        const z = c.axis === 'z' ? c.pos : c.lane;
        if (Math.hypot(x - p.x, z - p.z) < 3.2 && (!this._splash || performance.now() - this._splash > 9000)) {
          this._splash = performance.now();
          w = Math.min(1, w + 0.5);
          ui.toast('SPLASH! A car drives through a puddle right next to you.', 'bad', 3000);
        }
      }
    }
    p.wet = w;
    // only push to the materials when it changed visibly
    if (Math.abs(w - (p.wetShown ?? -1)) > 0.02 || (w === 0 && p.wetShown !== 0)) {
      p.wetShown = w;
      p.char.setWet(w);
    }
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
    if ((mx || mz) && (p.sitAt || p.hidden)) {
      this.standUp();
      this.stopHiding();
    }
    if ((mx || mz) && !p.inter && !p.sitAt && !p.hidden) {
      const cy = this.cam.yaw;
      let dx = Math.sin(cy) * mz - Math.cos(cy) * mx;
      let dz = Math.cos(cy) * mz + Math.sin(cy) * mx;
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
      speed = crouch ? CROUCH : running ? RUN : WALK;
      if (this.aiming && mz < 0) speed = Math.min(speed, WALK * 0.8); // backing up
      const r = L.resolve(p.x + dx * speed * dt, p.z + dz * speed * dt, 0.3);
      p.x = r.x;
      p.z = r.z;
      if (!this.aiming) p.yaw += angDiff(Math.atan2(dx, dz), p.yaw) * Math.min(1, dt * 12);
    } else running = false;
    // aim mode: the character faces where the camera looks
    if (this.aiming && !p.sitAt && !p.hidden && !p.inter) p.yaw += angDiff(this.cam.yaw, p.yaw) * Math.min(1, dt * 20);
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
    if (this.playerExposed()) {
      this.addShame(SHAME.busDriver);
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
      if (nz < 3.0) nx = Math.max(-1.1, Math.min(0.28, nx)); // seats on one side, standing room on the other
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
      if (!bus.playerSeatOk(s)) continue; // first come, first served
      if (Math.abs(s.z - p.lz) > 0.55) continue;
      if (!best || s.window > best.window) best = s;
    }
    return best;
  }

  busExposure(dt) {
    const p = this.player;
    const bus = p.bus;
    if (!this.playerExposed() || !bus.materialized) return;
    let watchers = 0;
    for (const q of bus.passengers) {
      if (q.delay > 0) continue;
      q.noticedPlayer = Math.max(0, (q.noticedPlayer || 0) - dt);
      const d = Math.hypot(q.x - p.lx, q.z - p.lz);
      // passing each other in the aisle
      if (d < 0.9 && (q.walking || p.moving) && q.noticedPlayer <= 0) {
        q.noticedPlayer = 30;
        this.addShame(SHAME.busPass);
        ui.toast(`Passenger: "${pick(BUS_REACTIONS)}"`, 'bad', 3000);
      }
      // sitting right next to you
      if (p.seat && q.seat && !q.walk.length && q.seat.row === p.seat.row && q.seat.side === p.seat.side) {
        if (!q.neighborNoticed) {
          q.neighborNoticed = true;
          this.addShame(SHAME.busNeighbor);
          ui.toast('The passenger sitting next to you does a slow double take...', 'bad', 3500);
        }
        this.addShame(SHAME.busNeighborRate * dt, true);
      }
      // standing: everyone behind you (facing forward) can see you
      if (!p.seat && !q.walk.length && q.z < p.lz - 0.3 && p.lz - q.z < 8) watchers++;
    }
    if (!p.seat && watchers) {
      this.addShame(Math.min(SHAME.busStandCap, SHAME.busStandRate * watchers) * dt, true);
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
    if (n.kind === 'manager') return this.mgrGrace > 0;
    if (n.kind !== 'coworker') return false;
    const cw = this.state.cw[n.index];
    return cw.blessed || cw.playing || (cw.ally && ['friend', 'sympathetic'].includes(n.personality));
  }

  stealthActive() {
    if (!this.playerExposed() && !this.player.makeshift) return false;
    return ['work', 'commute_am', 'commute_pm', 'dayoff', 'shop', 'lobby', 'hallway', 'pool', 'laundry'].includes(this.phase);
  }

  detect(dt) {
    const p = this.player;
    const work = this.phase === 'work';
    const active = this.stealthActive() && !p.bus && !p.hidden;
    const hip = this.hipPoint();
    const chest = hip.clone();
    chest.y += 0.45;
    let seenBy = 0;
    const watchers = [];
    const L = this.level;
    const rainMul = this.outdoors && this.isRaining ? 0.75 : 1;
    const seated = !!p.sitAt;
    for (const n of this.npcs) {
      n.updateConeVisual(this.stealthActive() && !p.bus);
      if (!active || !n.canSee()) {
        n.suspicion = Math.max(0, n.suspicion - dt);
        continue;
      }
      const dx = p.x - n.x;
      const dz = p.z - n.z;
      const dist = Math.hypot(dx, dz);
      const range = n.range * rainMul;
      let seesHip = false;
      let seesBody = false;
      if (dist < range) {
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
      // sitting at a desk, table or bench hides you completely... unless it's their chair
      if (p.makeshift) covered = true; // covered, just oddly
      const ownChair = seated && n.kind === 'coworker' && p.sitAt.owner === n.index;
      if (seated && !ownChair) covered = true;
      if (ownChair && seesBody && !seesHip && dist < 4) seesHip = true; // they come right up to their chair
      const canNotice = seesHip && !covered && !this.complicit(n) && n.noticeCooldown <= 0;
      if (canNotice) {
        seenBy++;
        let rate = 0.5 * (1.5 - dist / range);
        if (n.kind === 'customer' || n.kind === 'pedestrian') rate *= 0.75;
        if (p.crouching) rate *= 0.7;
        if (p.running) rate *= 1.3;
        if (seated) rate *= 0.45;
        if (n.state === 'walk') rate *= 0.85;
        n.suspicion += rate * dt;
      } else n.suspicion = Math.max(0, n.suspicion - 0.5 * dt);
      if ((n.kind === 'pedestrian' || n.kind === 'clerk') && n.noticeCooldown > 0 && seesHip && !covered) this.addShame(SHAME.pedestrianStare * dt, true);
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
      if (odd.length && p.makeshift) drain = 4; // a cardboard skirt does look strange
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
          n.checkingOn = performance.now() + 25000;
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
        // the same tricks the player uses: sitting hides completely, a carried item covers the front
        if (sees && s.sitting) sees = false;
        if (sees && s.carry && Math.abs(angDiff(Math.atan2(o.x - s.x, o.z - s.z), s.yaw)) < 1.0) sees = false;
        if ((s.graceT || 0) > performance.now()) sees = false;
        let v = o.npcSusp.get(s) || 0;
        if (sees) {
          s.watchedT = 1.2;
          let rate = 0.45 * (1.5 - d / o.range);
          if (s.crouch) rate *= 0.5;
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

  /** People who would get a sneaking coworker in trouble. */
  sneakObservers(s) {
    return this.npcs.filter((o) => {
      if (o === s || o.sneaking || !o.canSee()) return false;
      if (o.kind === 'coworker' && (this.complicit(o) || ['friend', 'sympathetic', 'oddball'].includes(o.personality))) return false;
      return o.kind === 'coworker' || o.kind === 'manager' || o.kind === 'customer';
    });
  }

  /** Sneaking coworkers react to threats: run to cover that blocks every threat's line of sight. */
  updateSneakers(dt) {
    this.work.coverT -= dt;
    if (this.work.coverT > 0) return;
    this.work.coverT = 0.5;
    const L = this.level;
    for (const s of this.npcs) {
      if (s.kind !== 'coworker' || !s.sneaking || s.char.legwearOn || ['talk', 'hiding'].includes(s.state)) continue;
      if (s.coverUntil && s.coverUntil > performance.now()) continue;
      const threats = this.sneakObservers(s).filter((o) => {
        const d = Math.hypot(o.x - s.x, o.z - s.z);
        if (d > o.range + 3) return false;
        const looking = Math.abs(angDiff(Math.atan2(s.x - o.x, s.z - o.z), o.lookYaw)) < o.fov / 2 + 0.3;
        const approaching = o.state === 'walk' && o.path.length && Math.hypot(o.path[o.path.length - 1].x - s.x, o.path[o.path.length - 1].z - s.z) < d;
        return (looking || approaching || d < 5) && L.lineOfSight(o.eye(), s.hip());
      });
      if (!threats.length) continue;
      // already sitting: stay put until it's clear
      if (s.sitting) {
        s.timer = Math.max(s.timer || 0, 2.5);
        continue;
      }
      s.coverUntil = performance.now() + 3500;
      const faceOf = (o) => Math.atan2(o.x - s.x, o.z - s.z);
      const angs = threats.map(faceOf);
      let spread = 0;
      for (const a of angs) for (const b of angs) spread = Math.max(spread, Math.abs(angDiff(a, b)));
      const mean = Math.atan2(angs.reduce((v, a) => v + Math.sin(a), 0), angs.reduce((v, a) => v + Math.cos(a), 0));
      const resume = s.steps.slice();
      const carrying = !!s.carry;
      // surrounded: sit down at the nearest free chair and wait for a better moment
      if (threats.length >= 2 && spread > 1.6) {
        const seat = (L.seats || []).filter((x) => !x.taken && Math.hypot(x.x - s.x, x.z - s.z) < 5).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
        if (seat) {
          seat.taken = s;
          s.plan([{ go: seat, run: true }, { sit: true, t: 4 + Math.random() * 4, yaw: seat.yaw, call: () => (seat.taken = s) }, { t: 0, call: () => seat.taken === s && (seat.taken = false) }, ...resume]);
          continue;
        }
      }
      const c = this.findCover(s, threats);
      const cd = c ? Math.hypot(c.x - s.x, c.z - s.z) : Infinity;
      if (carrying && spread < 1.2 && (!c || cd > 3.5 || Math.random() < 0.5)) {
        // hold the item up and face them
        s.plan([{ t: 2.5 + Math.random() * 2, yaw: mean }, ...resume]);
      } else if (c) {
        // dash behind cover; if holding something, face them from there too
        const away = Math.atan2(c.x - threats[0].x, c.z - threats[0].z);
        const fy = carrying ? Math.atan2(threats[0].x - c.x, threats[0].z - c.z) : away;
        s.plan([{ go: c, run: true, lowCover: !c.tall }, { t: 4 + Math.random() * 4, yaw: fy, lowCover: !c.tall }, ...resume]);
      } else if (carrying) {
        s.plan([{ t: 2.5, yaw: mean }, ...resume]);
      } else {
        // nowhere to hide: back away from the closest threat
        const o = threats[0];
        const a = Math.atan2(s.x - o.x, s.z - o.z);
        const q = L.resolve(s.x + Math.sin(a) * 3, s.z + Math.cos(a) * 3, 0.3);
        s.plan([{ go: q, run: true }, { t: 2, yaw: a }]);
      }
    }
  }

  /** Is this point hidden from all of these watchers (hips height)? */
  coverSafe(pt, threats, crouch) {
    const hip = new THREE.Vector3(pt.x, crouch ? 0.5 : 0.85, pt.z);
    return threats.every((o) => !this.level.lineOfSight(o.eye(), hip));
  }

  findCover(s, threats) {
    const L = this.level;
    const cands = [];
    for (const c of L.coverPoints || []) {
      const d = Math.hypot(c.x - s.x, c.z - s.z);
      if (d < 9) cands.push({ ...c, d });
    }
    for (const h of L.pois.hideSpots || []) {
      const d = Math.hypot(h.x - s.x, h.z - s.z);
      if (d < 14) cands.push({ x: h.x, z: h.z, tall: true, d: d * 0.8, hide: true });
    }
    cands.sort((a, b) => a.d - b.d);
    let best = null;
    let bs = Infinity;
    for (const c of cands.slice(0, 40)) {
      if (!this.coverSafe(c, threats, !c.tall)) continue;
      // closer is better; don't run past a threat
      let score = c.d;
      for (const o of threats) {
        const dt = Math.hypot(o.x - c.x, o.z - c.z);
        if (dt < 3) score += 12;
        else score += 6 / dt;
      }
      if (score < bs) {
        bs = score;
        best = c;
      }
    }
    return best;
  }

  /** A man catching a woman (or the other way round) sometimes just looks away and lets it slide. */
  letsItSlide(o, targetGender) {
    if (!o.gender || !targetGender || o.gender === targetGender) return false;
    if (o.slidOnce) return false; // once per day per person
    if (Math.random() < 0.4) {
      o.slidOnce = true;
      return true;
    }
    return false;
  }

  slideLine(o, nm) {
    this.bubble(o, pick([`...I didn't see anything.`, `*turns bright red and looks at the ceiling*`, `Uh. Carry on, ${nm}.`, '*clears throat and suddenly finds the floor very interesting*']), 4);
    this.talkMood(o, { surprised: 0.6, happy: 0.2 }, 5);
    o.noticeCooldown = 40;
  }

  npcCaught(o, s) {
    const cw = this.state.cw[s.index];
    const rt = this.cwRuntime[s.index];
    s.graceT = performance.now() + 20000; // a moment to get away before anyone else piles on
    if (this.letsItSlide(o, s.gender)) {
      this.slideLine(o, s.name);
      return;
    }
    if (o.kind === 'customer') {
      rt.complaints++;
      this.bubble(o, `Excuse me! That employee isn't wearing ${s.legwearType}!`);
      this.talkMood(o, { angry: 0.6, surprised: 0.6 });
      this.talkMood(s, { sad: 0.8, surprised: 1 });
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
    if (L.pois.hideSpots.length) s.plan([{ go: this.nearest(L.pois.hideSpots, s), run: true }, { hide: true, t: 8 }]);
  }

  writeupNPC(s, msg) {
    const cw = this.state.cw[s.index];
    cw.writeups++;
    s.graceT = performance.now() + 120000; // like the player, the manager leaves them alone for a while after
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
    v *= this.settings.shameScale ?? 1;
    this.state.shame = Math.min(100, this.state.shame + v);
    if (!silent && v >= 0.5) ui.toast(`Shame +${Math.round(v * 10) / 10}`, 'bad', 2200);
    if (this.state.shame >= 100 && !this.ended) {
      this.lose('Overwhelmed', `It's all too much. ${this.profile.name}'s face burns bright red, and they flee home, vowing never to leave the apartment again.\n\nToo much shame.`);
    }
  }

  // =====================================================================
  // Getting caught
  async caught(n) {
    const name = this.profile.name;
    const pg = this.profile.player.gender;
    if (!n.coworkerEncounter && n.kind !== 'resident' && this.letsItSlide(n, pg)) {
      this.slideLine(n, name);
      if (n.kind === 'pedestrian' || n.kind === 'clerk' || n.kind === 'customer') this.addShame(SHAME.pedestrian * 0.3);
      return;
    }
    if (n.kind === 'resident') return this.residentTalk(n);
    if (n.kind === 'pedestrian' || n.kind === 'clerk' || (n.kind === 'customer' && this.phase !== 'work')) {
      if (n.coworkerEncounter) return this.weekendEncounter(n);
      n.noticeCooldown = 25;
      this.bubble(n, pick(PED_REACTIONS));
      this.talkMood(n, pick([{ surprised: 1 }, { happy: 0.6, surprised: 0.4 }, { angry: 0.4, surprised: 0.6 }]), 4);
      this.addShame(n.kind === 'clerk' ? SHAME.clerk : SHAME.pedestrian);
      return;
    }
    this.cancelInteract();
    n.plan([]);
    n.state = 'talk';
    if (n.kind === 'manager') {
      await this.managerTalk('manager');
      return;
    }
    if (n.kind === 'customer') {
      this.complaints++;
      this.talkMood(n, { angry: 0.8, surprised: 0.5 }, 6);
      this.addShame(SHAME.customer);
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
    const pr = pronouns(n.gender);
    const after = () => {
      if (!n.removed && n.state === 'talk') n.plan([{ t: 1.5 }]);
    };
    if (pers === 'oddball') {
      cw.joined = true;
      cw.playing = true;
      this.addShame(SHAME.oddball);
      this.talkMood(n, { happy: 1 }, 8);
      await this.dialog(`${nm} saw you!`, `${nm} stares at you, then breaks into a huge grin.\n\n"${pick(ODDBALL_LINES)}"\n\nBefore you can stop ${pr.them}, ${nm} winks and slips off to find somewhere private to "get ready".\n\n(${nm} will be sneaking around without ${pr.their} ${n.legwearType} too. If ${pr.they} get${pr.they === 'they' ? '' : 's'} caught, ${pr.theyre} the one in trouble.)`);
      if (!n.removed) {
        n.state = 'idle';
        this.stripPrivately(n);
      }
      return;
    }
    if (pers === 'friend') {
      cw.ally = true;
      this.addShame(SHAME.friend);
      this.talkMood(n, { surprised: 0.8, sad: 0.3 }, 8);
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
      this.addShame(SHAME.sympathetic);
      this.talkMood(n, { surprised: 0.6, sad: 0.5 }, 8);
      if (this.ended) return;
      await this.dialog(`${nm} saw you!`, `${nm} blinks, then politely looks away. "I... didn't see anything. That must be awful. Here, let me pull everyone's attention away — go!"\n\n(${nm} is now an ally and can create distractions when you ask.)`);
      after();
      this.startDistraction(n);
      return;
    }
    if (pers === 'neutral' && !cw.warned) {
      cw.warned = true;
      this.addShame(SHAME.neutralWarn);
      this.talkMood(n, { surprised: 1 }, 8);
      if (this.ended) return;
      await this.dialog(`${nm} saw you!`, `${nm} stares for a long, awkward moment. "Uh. Wow. Okay. I'm going to pretend I didn't see that..."\n\n"But if I see it again, I'm going to the manager."`);
      n.noticeCooldown = 15;
      after();
      return;
    }
    const lines = {
      strict: `${nm}'s face hardens. "Absolutely unacceptable. There is a DRESS CODE, ${name}." ${pr.They} march${pr.they === 'they' ? '' : 'es'} straight to the manager's office.`,
      distant: `${nm} looks at you, then at your ${lw}... or lack thereof. Without a word, ${pr.they} head${pr.they === 'they' ? '' : 's'} for the manager's office.`,
      neutral: `${nm} sighs. "I warned you. Sorry, ${name}, I'm not risking my job for this." ${pr.They} head${pr.they === 'they' ? '' : 's'} for the manager.`,
    };
    this.addShame(SHAME.report);
    this.talkMood(n, pers === 'distant' ? { relaxed: 0.2 } : { angry: 0.9 }, 8);
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
    this.standUp(true);
    this.stopHiding(true);
    this.dropItem(false, true);
    p.x = m.stand.x;
    p.z = m.stand.z;
    p.yaw = Math.atan2(m.desk.x - m.stand.x, m.desk.z - m.stand.z);
    this.cancelInteract();
    if (this.manager) {
      this.manager.x = m.desk.x;
      this.manager.z = m.desk.z;
      this.manager.yaw = 0;
      this.manager.plan([]);
      this.manager.state = 'talk';
      this.talkMood(this.manager, { angry: 0.7 }, 10);
    }
    p.char.setMood({ sad: 0.9, surprised: 0.3 });
    this.cam.yaw = p.yaw;
    this.cam.pitch = 0.25;
    this.render();
    await ui.fade(false);
    this.transitioning = false;
    this.addShame(SHAME.managerTalk, true);
    await this.dialog(`${mgrName}'s Office`, STORY.managerTalk(mgrName, this.profile.name, this.lw, Math.min(3, st.writeups), why));
    if (st.writeups >= 3) {
      this.lose('Fired!', `${this.profile.name} is escorted out of ${this.job.workplaceName} by security, holding a cardboard box of belongings strategically in front of them.\n\nThree write-ups. Fired.`);
      return;
    }
    // the manager stays at the desk and lets you go for a while; you leave the office on your own
    this.mgrGrace = MGR_GRACE;
    if (this.manager) {
      this.manager.state = 'idle';
      this.manager.suspicion = 0;
      this.manager.plan([{ work: true, t: 25, yaw: m.desk.yaw }]);
    }
    for (const n of this.npcs) {
      n.suspicion = 0;
      n.noticeCooldown = Math.max(n.noticeCooldown, 6);
    }
    this.last = performance.now();
    ui.toast(`Write-up ${st.writeups}/3. ${this.profile.manager.name} will give you some space for a while.`, 'bad', 6000);
  }

  /** Nobody (except allies) can see the player right now. */
  isPrivate(except = null) {
    const p = this.player;
    const chest = this.hipPoint();
    chest.y += 0.3;
    return this.npcs.every((o) => {
      if (o === except || o.removed || !o.canSee() || this.complicit(o)) return true;
      if (o.kind === 'coworker' && ['friend', 'sympathetic'].includes(o.personality) && this.state.cw[o.index]?.ally) return true;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d > o.range) return true;
      return !this.level.lineOfSight(o.eye(), chest);
    });
  }

  startLend(n) {
    const p = this.player;
    if (p.borrow) return;
    if (!this.isPrivate(n)) {
      this.bubble(n, pick(['Not here! Somewhere private first.', "Everyone would see! Let's find an empty room.", 'Meeting room. Supply closet. Anywhere but here!']), 4);
      ui.toast(`Find somewhere nobody can see you, then ask ${n.name} again to swap.`, '', 4500);
      return;
    }
    p.borrow = { npc: n, t: LEND_TIME, warned: false, due: false, overdue: 0 };
    // the player actually wears the lender's pants/skirt, fitted to their body
    let undo = null;
    try {
      undo = borrowLegwear(n.char, p.char);
    } catch (e) {
      console.warn('borrow fit failed', e);
    }
    p.borrow.undo = undo;
    p.borrow.char = p.char;
    if (!undo) p.char.setLegwear(true);
    // the lender now sneaks around exposed, using the same tricks
    this.setSneaking(n, true);
    n.lending = true;
    this.cwRuntime[n.index].lendCd = 30;
    this.cwRuntime[n.index].bond += 10;
    n.plan([{ t: 1.5 }]);
    this.bubble(n, pick(['Your turn. Then we switch back!', 'Go! I just have to survive a few minutes.', "Just remember I'll need them back."]), 4);
    this.talkMood(n, { sad: 0.4, surprised: 0.4 }, 6);
    ui.toast(`You're wearing ${n.name}'s ${n.legwearType}. ${n.name} is the one sneaking now. Swap back somewhere private when time's up.`, 'good', 6000);
  }

  /** Someone came over to see why you're acting strange: pick an excuse. */
  async excuseCheck(n) {
    n.checkingOn = 0;
    if (this.ended || ui.dialogOpen) return;
    const p = this.player;
    n.plan([]);
    n.state = 'talk';
    const who = n.kind === 'customer' ? `A ${n.name}` : n.name;
    const q = n.kind === 'customer' ? '"Excuse me, are you alright? You look... odd."' : pick([`"${this.profile.name}, what are you doing?"`, '"You look like you\'re playing hide-and-seek."', '"Why are you walking like that?"', '"You\'ve been acting weird all morning."']);
    const all = ['Posture exercise.', 'Workplace ergonomics.', 'Inventory inspection.', 'Strategic positioning.', "I'm embracing efficiency.", 'Just appreciating modern climate control!'];
    const opts = all.sort(() => Math.random() - 0.5).slice(0, 3).map((t) => ({ label: `"${t}"`, value: t }));
    const v = await this.dialog(`${who} came to check on you`, q, opts);
    const chance = { friend: 0.85, sympathetic: 0.8, oddball: 0.9, distant: 0.7, neutral: 0.6, strict: 0.4 }[n.personality] ?? (n.kind === 'manager' ? 0.4 : 0.6);
    if (Math.random() < chance) {
      this.bubble(n, pick(['...Right.', 'Okay then.', 'Sure. Carry on.', 'If you say so.']), 3);
      n.noticeCooldown = 30;
      n.suspicion = 0;
      this.composure = 100;
      ui.toast(`"${v}" ...it worked.`, 'good', 3000);
    } else {
      this.bubble(n, pick(['Hang on. Let me look at you...', 'That makes no sense.', 'Wait a second...']), 3);
      n.suspicion = this.playerExposed() && !p.sitAt && !p.hidden ? 0.85 : 0.3;
      ui.toast(`"${v}" ...they're not buying it!`, 'bad', 3000);
    }
    if (!n.removed) {
      n.state = 'idle';
      n.plan([{ t: 1.2, yaw: Math.atan2(p.x - n.x, p.z - n.z) }]);
    }
  }

  /** Turn-taking: when time's up, the lender comes to find you and you swap back somewhere private. */
  updateBorrow(dt) {
    const p = this.player;
    const b = p.borrow;
    const n = b.npc;
    const their = pronouns(n.gender).their;
    if (n.removed) return this.endBorrow(true);
    b.t -= dt;
    if (b.t <= 10 && !b.warned) {
      b.warned = true;
      ui.toast(`${n.name} needs ${their} ${n.legwearType} back soon!`, 'bad');
    }
    if (b.t > 0) {
      ui.borrow(`Wearing ${n.name}'s ${n.legwearType} — ${Math.ceil(b.t)}s`);
      return;
    }
    if (!b.due) {
      b.due = true;
      ui.toast(`Time's up! Meet ${n.name} somewhere private to swap back.`, 'bad', 5000);
    }
    b.overdue += dt;
    ui.borrow(`Swap back with ${n.name} somewhere private!${b.overdue > 25 ? ' (' + Math.ceil(45 - b.overdue) + 's)' : ''}`);
    // the lender heads your way
    b.followT = (b.followT || 0) - dt;
    const d = Math.hypot(n.x - p.x, n.z - p.z);
    if (b.followT <= 0 && d > 1.6 && !['talk', 'hiding'].includes(n.state)) {
      b.followT = 1.5;
      n.plan([{ go: { x: p.x, z: p.z }, run: d > 6 }, { t: 1, yaw: Math.atan2(p.x - n.x, p.z - n.z) }]);
    }
    if (d < 2.2 && this.isPrivate(n)) {
      this.endBorrow(true);
      this.bubble(n, pick(['Switch! Thanks.', 'My turn to be normal again.', 'Okay, hand them over!']), 3);
      ui.toast(`You swapped back. ${n.name} can lend them again in a bit.`, '', 4000);
    } else if (b.overdue > 45) {
      this.endBorrow();
      this.bubble(n, 'I need them back NOW!', 3);
    }
  }

  endBorrow(silent = false) {
    const p = this.player;
    const b = p.borrow;
    if (!b) return;
    p.borrow = null;
    ui.borrow(null);
    if (b.undo) b.undo();
    else b.char.setLegwear(false);
    b.npc.lending = false;
    const cw = this.state.cw[b.npc.index];
    if (!b.npc.removed) {
      b.npc.char.setLegwear(!(cw.blessed || cw.playing));
      b.npc.sneaking = cw.blessed || cw.playing;
      b.npc.unhide();
    }
    if (!silent) ui.toast(`${b.npc.name} asked for ${pronouns(b.npc.gender).their} ${b.npc.legwearType} back. You're exposed again!`, 'bad', 5000);
  }

  startDistraction(n) {
    this.bubble(n, pick(DISTRACT_LINES), 4);
    this.talkMood(n, { surprised: 0.9 }, DISTRACT_TIME);
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
      this.talkMood(n, { sad: 0.8 }, 5);
      await this.dialog(n.name, `"I'd love to help, but..." ${n.name} glances down at ${pronouns(n.gender).their} own bare legs and turns red. "I can barely keep MYSELF hidden now. Sorry!"`);
      n.plan([{ t: 1 }]);
      return;
    }
    const opts = [];
    if (n.personality === 'friend') {
      opts.push({
        label: rt.lendCd > 0 ? `Swap legwear (${n.name} needs a break: ${Math.ceil(rt.lendCd)}s)` : `Take turns with ${n.name}'s ${n.legwearType} (${LEND_TIME}s, somewhere private)`,
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
      this.addShame(SHAME.encounterFriendly);
      await this.dialog(`You ran into ${nm}!`, `${nm} spots you, freezes, and gives a tiny, knowing nod. "...You too, huh. Let's pretend we never saw each other."`);
    } else if (['friend', 'sympathetic', 'oddball'].includes(n.personality)) {
      this.addShame(SHAME.encounterFriendly);
      await this.dialog(`You ran into ${nm}!`, n.personality === 'oddball' ? `"Whoa, you're playing the no-pants game on your day off too? Dedication! Respect."` : `"${this.profile.name}?! Oh no, even on the weekend?" ${nm} gives you an awkward hug and hurries on, making sure nobody else is looking.`);
      if (n.personality !== 'oddball') cw.ally = true;
    } else {
      this.addShame(SHAME.encounterHostile);
      this.talkMood(n, { angry: 0.8, surprised: 0.6 }, 8);
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
      this.addShame(SHAME.dog);
      ui.toast('Got your bag back! (Everyone saw you chase a dog without pants, though.)', 'good', 5000);
    }
  }

  // =====================================================================
  // Interactions
  findInteraction() {
    const p = this.player;
    if (p.bus) return this.busAction();
    if (p.hidden) return { label: `Come out from ${p.hidden.room || 'hiding'}`, time: 0, run: () => this.stopHiding() };
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
      if (d > it.r + (p.sitAt ? 0.4 : 0)) continue;
      const a = this.actionFor(it);
      if (a && (d < bd || (best && best.disabled && !a.disabled))) {
        bd = d;
        best = a;
      }
    }
    if (best && !best.disabled) return best;
    if (p.sitAt) return { label: `Stand up (sitting: ${p.sitAt.label || 'seat'})`, time: 0, run: () => this.standUp() };
    return this.altAction() || best;
  }

  /** Hide, sit down or pick something up (when nothing more important is nearby). */
  altAction() {
    const p = this.player;
    const L = this.level;
    const near = (o, r) => Math.hypot(o.x - p.x, o.z - p.z) < r;
    const home = this.phase === 'morning' || this.phase === 'evening';
    if (!home) {
      for (const h of L.pois.hideSpots || []) {
        if (near(h, 1.1)) return { label: `Hide ${h.room ? '(' + h.room + ')' : ''}`, time: 0, run: () => this.hideIn(h) };
      }
    }
    let bs = null;
    let bsd = 0.95;
    for (const s of L.seats || []) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bsd && !s.taken) {
        bsd = d;
        bs = s;
      }
    }
    if (bs) return { label: `Sit down (${bs.label || 'seat'})`, time: 0, run: () => this.sitDown(bs) };
    if (!this.taskCarrying) {
      let bp = null;
      let bpd = 1.25;
      for (const k of L.pickups || []) {
        if (k.taken) continue;
        const d = Math.hypot(k.x - p.x, k.z - p.z);
        if (d < bpd) {
          bpd = d;
          bp = k;
        }
      }
      if (bp) return { label: `Pick up the ${PICKUP_LABELS[bp.kind] || bp.kind}${p.pickup ? ' (swap)' : ''}`, time: 0.4, run: () => this.pickUp(bp) };
    }
    return null;
  }

  sitDown(s) {
    const p = this.player;
    this.cancelInteract();
    p.sitAt = s;
    s.taken = 'player';
    p.standFrom = { x: p.x, z: p.z };
    p.x = s.x;
    p.z = s.z;
    p.yaw = s.yaw;
    p.speed = 0;
    if (this.playerExposed()) ui.toast("Sitting down: nobody can tell while you're seated. Move to stand up.", '', 3500);
  }

  standUp(silent = false) {
    const p = this.player;
    const s = p.sitAt;
    if (!s) return;
    s.taken = false;
    p.sitAt = null;
    const f = p.standFrom || { x: s.x + Math.sin(s.yaw) * 0.6, z: s.z + Math.cos(s.yaw) * 0.6 };
    if (this.level && !this.level.blockedPoint(f.x, f.z, 0.28)) {
      p.x = f.x;
      p.z = f.z;
    }
    void silent;
  }

  hideIn(h) {
    const p = this.player;
    this.cancelInteract();
    p.hidden = h;
    p.hideFrom = { x: p.x, z: p.z };
    p.x = h.x;
    p.z = h.z;
    p.speed = 0;
    ui.toast(`Hiding ${h.room ? '(' + h.room + ')' : ''}. Nobody can see you here. Move to come out.`, '', 3000);
  }

  stopHiding(silent = false) {
    const p = this.player;
    if (!p.hidden) return;
    p.hidden = null;
    void silent;
  }

  pickUp(k) {
    const p = this.player;
    if (p.pickup) this.dropItem(false);
    k.taken = true;
    k.mesh.visible = false;
    p.pickup = k;
    this.holdProp(k.kind);
    ui.toast(`Carrying a ${PICKUP_LABELS[k.kind] || k.kind}. Holding it in front of you covers you from people ahead. [G] to put it down.`, 'good', 4000);
  }

  holdProp(kind) {
    const p = this.player;
    p.carry = kind;
    const m = propMesh(kind);
    p.carryCover = m.userData.cover;
    p.char.setProp(m);
  }

  /** Put the carried pickup down here (or back where it came from when leaving). */
  dropItem(announce = false, home = false) {
    const p = this.player;
    const k = p.pickup;
    if (!k) return;
    p.pickup = null;
    if (!this.taskCarrying) {
      p.carry = null;
      p.char.setProp(null);
    }
    k.taken = false;
    k.mesh.visible = true;
    if (home) {
      k.x = k.home.x;
      k.z = k.home.z;
      k.mesh.position.set(k.home.x, k.home.y + (k.mesh.userData.up < 0 ? 0.3 : 0), k.home.z);
    } else {
      const x = p.x + Math.sin(p.yaw) * 0.45;
      const z = p.z + Math.cos(p.yaw) * 0.45;
      k.x = x;
      k.z = z;
      k.mesh.position.set(x, 0.02 + (k.mesh.userData.up < 0 ? 0.3 : 0), z);
    }
    if (announce) ui.toast(`Put down the ${PICKUP_LABELS[k.kind] || k.kind}.`, '', 2000);
  }

  /** Task items take over the hands; a held pickup is set down first. */
  setTaskCarry(kind) {
    if (this.player.pickup) {
      ui.toast('You set down what you were holding to take the task item.', '', 2500);
      this.dropItem(false);
    }
    this.taskCarrying = kind;
    this.holdProp(kind);
  }

  clearTaskCarry() {
    const p = this.player;
    this.taskCarrying = null;
    p.carry = null;
    p.char.setProp(null);
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
    if (s) {
      const taken = s.occ && s.occ !== 'player';
      return {
        label: `Sit down (${s.window ? 'window' : 'aisle'} seat)${taken ? ' — beat them to it!' : ''}`,
        time: 0,
        run: () => {
          if (!bus.playerSeatOk(s)) return;
          if (s.occ) bus.bump(s);
          s.occ = 'player';
          p.seat = s;
          p.speed = 0;
        },
      };
    }
    if (bus.state !== 'dwell' && p.lz > 3.0) return { label: 'Wait for the next stop to get off', disabled: true };
    return null;
  }

  actionFor(it) {
    const st = this.state;
    const ph = this.phase;
    const id = it.id;
    if (ph === 'morning') {
      const m = this.morning;
      if (id === 'celesti') return { label: 'Talk to the winged stranger', time: 0, run: () => this.celestiTalk() };
      if (this.celestiChar) return { label: 'Someone is in your living room!', disabled: true };
      if (id === 'sink' && !m.wash) return { label: 'Wash up', time: 2, run: () => ((m.wash = true), ui.toast('Fresh and clean!', 'good')) };
      if (id === 'kitchen' && !m.eat) return { label: 'Eat breakfast', time: 2.5, run: () => ((m.eat = true), ui.toast('Delicious toast.', 'good')) };
      if (id === 'wardrobe' && !m.dress) {
        if (st.day === 1)
          return { label: 'Get dressed', time: 2, run: () => ((m.dress = true), this.wear('out', true), ui.toast('Looking sharp!', 'good')) };
        return {
          label: 'Look for something to wear', time: 1.5,
          run: async () => {
            m.dress = true;
            this.wear('out', false);
            await this.dialog('The Wardrobe', STORY.morningNoClothes);
          },
        };
      }
      if (id === 'door') {
        const ready = m.wash && m.eat && m.dress;
        if (!ready) return { label: 'Get ready first (wash, eat, get dressed)', disabled: true };
        return { label: this.isWorkday ? 'Leave for work' : 'Head out to run errands', time: 0, run: () => this.enterPhase('hallway', { dir: 'out', from: 'apt' }) };
      }
      if (id === 'bed') return { label: 'No time to sleep in!', disabled: true };
      return null;
    }
    if (ph === 'evening') {
      const nt = this.night;
      if (nt && nt.stage !== 'done') {
        if (id === 'wardrobe' && nt.stage === 'gather') return { label: 'Gather everything for the wash', time: 1.5, run: () => ((nt.stage = 'carry'), this.setTaskCarry('laundry'), ui.toast('Laundry basket in hand. Down to the basement.', '', 3500)) };
        if (id === 'door' && nt.stage === 'carry') return { label: 'Take the laundry down to the basement', time: 0, run: () => this.enterPhase('hallway', { dir: 'down', from: 'apt' }) };
        if (id === 'bed') return { label: 'Do the laundry first', disabled: true };
        return null;
      }
      if (id === 'bed') return { label: 'Go to sleep', time: 0, run: () => this.sleep() };
      return null;
    }
    if (ph === 'hallway') {
      const d = this.bldgDir;
      if (id === 'aptdoor') {
        if (d === 'in' || d === 'up') return { label: 'Go inside your apartment', time: 0, run: () => this.enterPhase('evening') };
        return { label: d === 'down' ? 'Laundry first' : 'No time to go back in!', disabled: true };
      }
      if (id === 'elevator') {
        if (d === 'out') return { label: 'Take the elevator down to the lobby', time: 0, run: () => this.enterPhase('lobby', { dir: 'out' }) };
        if (d === 'down') return { label: 'Take the elevator to the basement', time: 0, run: () => this.enterPhase('laundry') };
        return { label: 'Your door is just down the hall', disabled: true };
      }
      if (id === 'stairs') {
        if (d === 'out') return { label: "Take the back stairs down to the residents' pool", time: 0, run: () => this.enterPhase('pool', { dir: 'out', from: 'stairs' }) };
        return { label: d === 'down' ? 'The laundry room is reached by elevator' : 'Your door is just down the hall', disabled: true };
      }
      return null;
    }
    if (ph === 'pool') {
      const out = this.bldgDir === 'out';
      if (id === 'backstairs') {
        if (!out) return { label: 'Take the back stairs up to the 7th floor', time: 0, run: () => this.enterPhase('hallway', { dir: 'in', from: 'stairs' }) };
        return { label: "You're on your way out", disabled: true };
      }
      if (id === 'poolgate') {
        if (out) return { label: 'Out through the gate to the street', time: 0, run: () => this.enterPhase(this.isWorkday ? 'commute_am' : 'dayoff') };
        return { label: 'Go back out to the street', time: 0, run: () => this.enterPhase(this.streetPhase || 'commute_pm') };
      }
      if (id.startsWith('shower')) {
        return {
          label: 'Rinse off under the shower', time: 1.5,
          run: () => {
            this.player.wet = 1;
            this.player.wetShown = -1;
            this.sayswam = true;
            ui.toast("Soaked. If anyone asks: you were swimming. Convincing enough.", '', 4500);
          },
        };
      }
      return null;
    }
    if (ph === 'laundry') {
      const nt = this.night || { stage: 'done' };
      if (id.startsWith('washer') && nt.stage === 'carry') return { label: 'Load everything into the washer', time: 2, run: () => this.startWash(id) };
      if (id === nt.washer && (nt.stage === 'washing' || nt.stage === 'locked')) return { label: nt.stage === 'locked' ? 'ERROR E03 — the door is locked' : 'Washing...', disabled: true };
      if (id === 'elevator') {
        if (nt.stage === 'done') return { label: 'Take the elevator back up', time: 0, run: () => this.enterPhase('hallway', { dir: 'up', from: 'elevator' }) };
        return { label: "Your clothes are still in the machine", disabled: true };
      }
      return null;
    }
    if (ph === 'lobby') {
      const out = this.lobbyDir === 'out';
      if (id === 'lobbydoor') {
        if (out) return { label: this.isWorkday ? 'Head out to the street (to work)' : 'Head out to the street', time: 0, run: () => this.enterPhase(this.isWorkday ? 'commute_am' : 'dayoff') };
        return { label: 'Go back out to the street', time: 0, run: () => this.enterPhase(this.streetPhase || 'commute_pm') };
      }
      if (id === 'elevator' || id === 'elevator2') {
        if (out) return { label: 'No time to go back up!', disabled: true };
        return { label: 'Take the elevator up to your floor', time: 0, run: () => this.enterPhase('hallway', { dir: 'in', from: 'elevator' }) };
      }
      if (id === 'mailbox') return { label: 'Check your mailbox', time: 1, run: () => ui.toast(pick(['Just bills.', 'A pizza coupon.', 'A catalog... full of pants. How cruel.', 'Nothing today.']), '', 3000) };
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
      if (id === 'poolgate') {
        if (ph === 'commute_am') return { label: "The residents' pool gate", disabled: true };
        if (ph === 'dayoff' && this.errands.some((e) => !e.done)) return { label: 'Finish your errands first', disabled: true };
        return { label: "Slip in through the residents' pool gate (back way)", time: 0, run: () => ((this.streetPhase = ph), this.enterPhase('pool', { dir: 'in', from: 'gate' })) };
      }
      if (ph === 'commute_pm' && id === 'homedoor') return { label: 'Go into Maple Court Apartments', time: 0, run: () => ((this.streetPhase = 'commute_pm'), this.enterPhase('lobby', { dir: 'in' })) };
      if (ph === 'dayoff') {
        if (id === 'homedoor') {
          const left = this.errands.filter((e) => !e.done);
          if (left.length) return { label: `Errands left: ${left.map((e) => e.name).join(', ')}`, disabled: true };
          return { label: 'Go into Maple Court Apartments', time: 0, run: () => ((this.streetPhase = 'dayoff'), this.enterPhase('lobby', { dir: 'in' })) };
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
    if (step.carry) this.setTaskCarry(step.carry);
    if (step.drop) this.clearTaskCarry();
    if (step.tag === 'checkout' && this.playerExposed()) {
      this.addShame(SHAME.clerk);
      const clerk = this.npcs.find((n) => n.kind === 'clerk');
      if (clerk) this.bubble(clerk, pick(["Paper or plastic? ...and maybe some pants?", "I... um... have a nice day!", '*stares at the register very hard*']));
    }
    this.errandStep++;
    if (this.errandStep >= e.steps.length) {
      e.done = true;
      if (this.taskCarrying) this.clearTaskCarry();
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
    if (st.day === 1) ui.toast('Clocked in. Time to get to work!', 'good');
    else ui.toast('Clocked in. Here we go again...', '');
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
        const pr = pronouns(this.profile.coworkers[i].gender);
        const mh = mishapFor(n?.station?.tag);
        if (n) {
          this.setSneaking(n, true);
          if (mh.wet) n.char.setWet(1);
          this.talkMood(n, { surprised: 1, sad: 0.6 }, 10);
        }
        await this.dialog(`Hiphtia's Blessing spreads!`, `A faint golden sparkle drifts through the building...\n\n${mh.fn(nm, lw)}\n\n${nm} has been blessed by Hiphtia! From now on ${pr.theyre} sneaking around without ${lw}, just like you.${['strict', 'distant', 'neutral'].includes(this.profile.coworkers[i].personality) ? ` ${nm} won't dare report you anymore... ${pr.they}'d be caught ${pr.them}sel${pr.they === 'they' ? 'ves' : 'f'}.` : ''}`);
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

  /** near: prefer stations close to this point (coworkers don't cross the building for no reason). */
  resolveTask(tpl, near = null) {
    const L = this.level;
    let remembered = null;
    let prev = near;
    const steps = [];
    for (const s of tpl.steps) {
      let st;
      if (s.tag === '$remembered') st = remembered;
      else {
        let c = L.stationsByTag(s.tag);
        if (s.tag === 'mydesk' && near && near.kind) c = L.stations.filter((x) => x.owner === near.index); // a coworker's own desk
        if (c.length > 1 && prev) c = c.filter((x) => x !== prev);
        if (near && c.length > 1) {
          const ref = prev || near;
          c = [...c].sort((a, b) => Math.hypot(a.x - ref.x, a.z - ref.z) - Math.hypot(b.x - ref.x, b.z - ref.z)).slice(0, Math.max(1, Math.ceil(c.length / 3)));
        }
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
    if (s.carry) this.setTaskCarry(s.carry);
    if (s.drop) this.clearTaskCarry();
    w.step++;
    if (w.mishapPending) {
      w.mishapPending = false;
      this.firstTaskMishap(s);
    }
    if (w.step >= w.task.steps.length) {
      w.done++;
      ui.toast(`Task complete! (${w.done}/${w.quota})`, 'good');
      if (this.taskCarrying) this.clearTaskCarry();
      this.nextTask();
    }
  }

  /** Day 1: the wardrobe disaster strikes during the first task, caused by what you're doing. */
  async firstTaskMishap(step) {
    const p = this.player;
    const mh = mishapFor(step.station?.tag);
    p.char.setMood({ surprised: 1, sad: 0.5 });
    if (mh.wet) {
      p.wet = 1;
      p.char.setWet(1);
    }
    await this.dialog('Wardrobe Malfunction!', `${mh.fn(this.profile.name, this.lw)}\n\nYou stuff what's left of them out of sight... and realize your underwear is now on full display. The shift has only just started. Nobody can find out.`);
    p.char.setLegwear(false);
    ui.toast('Your underwear is exposed! Stay out of the yellow sight cones. Carry things, sit at tables, hide.', 'bad', 7000);
  }

  // =====================================================================
  // Story
  celestiName() {
    return this.settings.celestiName || 'Celesti';
  }

  async makeCelesti() {
    const m = this.settings.celesti && this.settings.celesti.key ? this.settings.celesti : { asset: BUNDLED.celesti };
    let ch;
    const buf = await modelBuffer(m);
    if (buf) {
      ch = await createCharacter({ vrm: buf, full: true, legwearMaterials: m.legwearMaterials || null, underwearOverlay: false, gender: 'female' });
    } else ch = createMannequin({ colors: { skin: '#fbe3d4', hair: '#fff3b0', top: '#ffffff', bottom: '#fdf2c4', eye: '#f1c40f' }, legwearType: 'skirt' });
    addAngelic(ch);
    return ch;
  }

  /** Day after the third shift: Celesti is waiting in the living room. Walk over and talk to her. */
  async celestiAppear() {
    const L = this.levels.apartment;
    const ch = await this.makeCelesti();
    ch.setMood({ happy: 0.5 });
    const s = L.pois.celesti;
    ch.root.position.set(s.x, 0.15, s.z);
    ch.root.rotation.y = s.yaw;
    this.scene.add(ch.root);
    this.celestiChar = ch;
    L.interactable('celesti', s.x, s.z, this.celestiName(), { r: 2.2 });
    const [title, text] = STORY.celesti(this.profile.name, this.celestiName())[0];
    await this.dialog(title, text + `\n\n(Go and see who it is.)`);
  }

  async celestiTalk() {
    const L = this.levels.apartment;
    const ch = this.celestiChar;
    const s = L.pois.celesti;
    const p = this.player;
    p.yaw = Math.atan2(s.x - p.x, s.z - p.z);
    this.cam.yaw = p.yaw;
    this.cam.pitch = 0.15;
    p.char.setMood({ surprised: 1 });
    for (const [title, text] of STORY.celesti(this.profile.name, this.celestiName()).slice(1)) {
      await this.dialog(title, text);
    }
    await ui.fade(true);
    if (ch) {
      this.scene.remove(ch.root);
      ch.dispose();
    }
    this.celestiChar = null;
    L.interactables.delete('celesti');
    await ui.fade(false);
    this.state.celestiMet = true;
  }

  async win() {
    if (this.ended) return;
    const L = this.levels.apartment;
    const ch = await this.makeCelesti();
    ch.setMood({ happy: 0.5 });
    const s = L.pois.celesti;
    ch.root.position.set(s.x, 0.15, s.z);
    ch.root.rotation.y = s.yaw;
    this.scene.add(ch.root);
    await this.dialog(this.celestiName(), STORY.win(this.profile.name, this.celestiName()));
    this.state.done = true;
    await this.saveGame();
    this.ended = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.onEnd({ type: 'win', text: `${this.profile.name} survived ${this.state.day} days. Every coworker shares Hiphtia's blessing.`, shame: this.state.shame, day: this.state.day });
  }

  // =====================================================================
  async sleep() {
    const st = this.state;
    st.day++;
    st.shame = Math.max(0, st.shame - SHAME.sleep);
    this.night = null;
    for (const c of st.cw) c.playing = false;
    this.enterPhase('morning');
  }

  async saveGame() {
    const st = this.state;
    if (!this.slotId) return;
    await writeSave(this.slotId, JSON.parse(JSON.stringify({
      day: st.day, shame: st.shame, writeups: st.writeups, cw: st.cw, pendingBless: st.pendingBless, pendingTalks: st.pendingTalks,
      celestiMet: st.celestiMet, eveningShown: st.eveningShown, daily: st.daily, seed: st.seed, done: !!st.done, savedAt: Date.now(),
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
      if (this.celestiChar) return get('celesti');
      return !m.wash ? get('sink') : !m.eat ? get('kitchen') : !m.dress ? get('wardrobe') : get('door');
    }
    if (ph === 'evening') {
      const nt = this.night;
      if (nt && nt.stage === 'gather') return get('wardrobe');
      if (nt && nt.stage === 'carry') return get('door');
      return get('bed');
    }
    if (ph === 'hallway') return this.bldgDir === 'out' || this.bldgDir === 'down' ? get('elevator') : get('aptdoor');
    if (ph === 'pool') return this.bldgDir === 'out' ? get('poolgate') : get('backstairs');
    if (ph === 'laundry') {
      const nt = this.night || { stage: 'done' };
      return nt.stage === 'carry' ? get('washer2') : nt.stage === 'done' ? get('elevator') : get(nt.washer);
    }
    if (ph === 'lobby') return this.lobbyDir === 'out' ? get('lobbydoor') : get('elevator');
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
    const titles = { hallway: '7th floor', pool: "Residents' pool", laundry: 'Basement laundry room', lobby: 'Building lobby', morning: 'Morning', commute_am: 'Commute to work', work: 'At work', commute_pm: 'Commute home', evening: 'Evening', dayoff: 'Day off', shop: 'Errands' };
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
    if (this.weather && (this.outdoors || ph === 'lobby' || ph === 'morning')) time += ` · ${{ sunny: '☀', cloudy: '☁', rain: '🌧' }[this.weather]} ${WEATHER[this.weather].label}`;
    ui.set('hud-time', time);

    let obj = '';
    const p = this.player;
    if (ph === 'morning') {
      const m = this.morning;
      obj = this.celestiChar ? 'Someone is in the living room...' : !m.wash ? 'Wash up in the bathroom' : !m.eat ? 'Eat breakfast in the kitchen' : !m.dress ? 'Check the wardrobe' : this.isWorkday ? 'Leave for work' : 'Head out to run errands';
    } else if (p.bus) obj = 'Riding the bus. Get off near your destination (walk to the front door when it stops).';
    else if (ph === 'commute_am') obj = `Get to ${this.job.workplaceName}`;
    else if (ph === 'commute_pm') obj = 'Get home to Maple Court Apartments';
    else if (ph === 'evening') obj = this.night?.stage === 'gather' ? 'Gather your laundry from the wardrobe' : this.night?.stage === 'carry' ? 'Take the laundry down to the basement' : 'Go to bed';
    else if (ph === 'hallway') obj = this.bldgDir === 'out' ? 'Head down: elevator to the lobby, or back stairs to the pool' : this.bldgDir === 'down' ? 'Take the elevator to the basement' : 'Get to your door (7F-05)';
    else if (ph === 'pool') obj = this.bldgDir === 'out' ? 'Out through the gate' : 'Take the back stairs up';
    else if (ph === 'laundry') {
      const nt = this.night || { stage: 'done' };
      obj = nt.stage === 'carry' ? 'Load a washer' : nt.stage === 'washing' ? `Wait for the wash (${Math.ceil(nt.t)}s)` : nt.stage === 'locked' ? 'ERROR E03... wait for the door to release' : 'Head back upstairs';
    }
    else if (ph === 'lobby') obj = this.lobbyDir === 'out' ? 'Go out through the front door' : 'Take the elevator up to your apartment';
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
    if (this.targetDist > 25 && !p.bus && this.outdoors && !(this.minimap && this.settings.minimap !== false)) {
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
    if (ph === 'work' && this.mgrGrace > 0) info += ` · <span style="color:#55efc4">Manager backing off: ${Math.ceil(this.mgrGrace)}s</span>`;
    if (p.wet > 0.05) info += ` · Wet: ${Math.round(p.wet * 100)}%`;
    ui.set('hud-complaints', info.includes('<span') ? info : esc(info));
    let status = '';
    const exposed = this.playerExposed();
    if (this.stealthActive() && exposed) {
      if (p.hidden) status = '<span style="color:#55efc4">Hidden — nobody can see you</span>';
      else if (this.seenBy) status = `<span style="color:#ff7675">⚠ ${p.bus ? 'PASSENGERS ARE STARING' : 'SOMEONE IS LOOKING'}! (${this.seenBy})</span>`;
      else if (p.bus) status = p.seat ? (p.seat.window ? 'Seated by the window' : 'Seated on the aisle') : 'Standing in the aisle — very exposed';
      else if (p.sitAt) status = `<span style="color:#55efc4">Seated (${esc(p.sitAt.label || 'seat')}) — nobody can tell</span>`;
      else if (p.carry) status = `Exposed — holding a ${esc(PICKUP_LABELS[p.carry] || p.carry)} in front${p.pickup ? ' [G: put down]' : ''}`;
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
      if (n.char.civName && d < 8) html += `<span class="nm">${esc(n.char.civName)}</span>`;
      else if ((n.kind === 'coworker' || n.kind === 'manager' || n.coworkerEncounter) && d < 10) {
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

  /** Hide people (and bus passengers) that are off-screen or far away; they also skip animation. */
  cullCharacters() {
    const cam = this.camera;
    cam.updateMatrixWorld();
    this._proj = this._proj || new THREE.Matrix4();
    this._frustum = this._frustum || new THREE.Frustum();
    this._sph = this._sph || new THREE.Sphere();
    this._proj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const fr = this._frustum.setFromProjectionMatrix(this._proj);
    const sph = this._sph;
    const cx = cam.position.x;
    const cz = cam.position.z;
    const maxD = this.outdoors ? 75 : 60;
    for (const n of this.npcs) {
      const d = Math.hypot(n.x - cx, n.z - cz);
      sph.center.set(n.x, 0.9, n.z);
      sph.radius = 1.3;
      const vis = d < maxD && fr.intersectsSphere(sph);
      n.inView = vis;
      n.char.root.visible = vis;
    }
    for (const b of this.buses?.buses || []) {
      sph.center.set(b.x, 1.5, b.z);
      sph.radius = 7;
      const d = Math.hypot(b.x - cx, b.z - cz);
      const vis = this.player.bus === b || (d < 55 && fr.intersectsSphere(sph));
      b.inView = vis;
      for (const q of b.passengers) q.char.root.visible = vis && (q.delay <= 0 || q.char.root.visible);
      if (b.driver) b.driver.root.visible = vis;
    }
  }

  render() {
    const p = this.player;
    if (!p.char) return;
    if (this.pendingDog && this.phase === 'dayoff' && !this.transitioning) {
      this.startDog(this.pendingDog);
      this.pendingDog = null;
    }
    const low = p.crouching || p.hidden;
    const target = new THREE.Vector3(p.x, (p.char.height || 1.6) * (low ? 0.62 : p.seat || p.sitAt ? 0.7 : 0.88) + (p.bus ? 0.15 : 0), p.z);
    const c = this.cam;
    const pitch = p.bus ? Math.max(0.65, c.pitch) : c.pitch;
    const dir = new THREE.Vector3(-Math.sin(c.yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(c.yaw) * Math.cos(pitch));
    let dist = p.bus ? Math.min(c.dist, 4.5) : c.dist;
    if (this.level && !p.bus) {
      const hit = this.level.rayHit(target.x, target.y, target.z, dir.x, dir.y, dir.z, dist);
      if (hit < dist) dist = Math.max(0.6, hit - 0.25);
    }
    this.camera.position.copy(target).addScaledVector(dir, dist);
    if (this.camera.position.y < 0.25) this.camera.position.y = 0.25;
    this.camera.lookAt(target);
    const now = performance.now();
    const dt = Math.min(0.05, (now - (this._rt || now)) / 1000);
    this._rt = now;
    this.rain.update(dt, this.camera.position.x, this.camera.position.z);
    if (this.minimap && this.settings.minimap !== false && now - this.minimapT > 50) {
      this.minimapT = now;
      this.minimap.draw(this);
    }
    if (this.sunOffset) {
      this.sun.position.set(p.x + this.sunOffset.x, this.sunOffset.y, p.z + this.sunOffset.z);
      this.sun.target.position.set(p.x, 0, p.z);
    }
    this.cullCharacters();
    this.updateMarker();
    this.updateTags();
    this.renderer.render(this.scene, this.camera);
  }
}

export function controlsTable() {
  return `<table class="controls-table">
    <tr><td>Mouse</td><td>Look around, all the way up or down (click the game to capture the mouse, or hold right button)</td></tr>
    <tr><td>Right-click (hold)</td><td>Aim mode: the character turns with the mouse and A/D strafe</td></tr>
    <tr><td>W A S D</td><td>Move (moving also stands you up / brings you out of hiding)</td></tr>
    <tr><td>Shift</td><td>Run (uses stamina; looks strange at work)</td></tr>
    <tr><td>C / Ctrl</td><td>Crouch toggle / hold — hide your hips behind furniture</td></tr>
    <tr><td>E</td><td>Interact (hold for timed actions): tasks, sit down, hide, pick things up, board/leave buses</td></tr>
    <tr><td>G</td><td>Put down the item you're carrying</td></tr>
    <tr><td>F</td><td>Tie the item you're carrying on as a makeshift skirt (box, paper, tote bag, towel...). It won't last.</td></tr>
    <tr><td>M</td><td>Show/hide the minimap and compass</td></tr>
    <tr><td>Wheel</td><td>Zoom camera</td></tr>
    <tr><td>Esc</td><td>Pause</td></tr>
  </table>
  <p class="note">Yellow cones show where people are looking. Partitions, counters, shelves, hedges, kiosks and parked cars hide your underwear.
  Pick up boxes, trays, bags, newspapers or umbrellas and hold them in front of you. Sitting at a desk, table or bench hides you completely,
  and hiding spots (booths, closets, corners) hide you completely. On the bus, standing is far more exposed than sitting.
  An umbrella keeps you dry in the rain.</p>`;
}
