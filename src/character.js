// Characters: imported VRM models (full, or cheap clones of a cached template)
// or a simple built-in "mannequin". All use VRM humanoid bone names, T-pose,
// facing +Z, so one procedural animator drives everything.
//
// Also: facial expressions (incl. on clones), recoloring, wet sheen and
// see-through-when-wet parts, semi-transparency handling, and clothing
// retargeting so one model's clothes can be worn by a different body.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { VRMLoaderPlugin, VRMUtils, VRMHumanoid, VRMExpressionManager, VRMExpression, VRMExpressionMorphTargetBind } from '@pixiv/three-vrm';
import { DYE_HEX, coordinatedColors } from './dyes.js';

// socks, stockings and thigh-highs stay on after a mishap: only pants/skirts/shorts count
export const LEGWEAR_RE = /(bottom|pants|trouser|skirt|short|jean|slack|legging)/i;
const SKIN_RE = /(_skin|skin|body)/i;
const HAIR_RE = /hair/i;
const IRIS_RE = /iris/i;
export const CLOTH_RE = /(cloth|tops|shoe|accessor|onepiece|jacket|shirt|coat|dress)/i;
const MOODS = ['happy', 'angry', 'sad', 'relaxed', 'surprised'];

let EXPR_MAX = 0.7;
export function setExpressionMax(v) {
  EXPR_MAX = Math.max(0, Math.min(1, v));
}
// toon outlines on characters (a setting)
let SHOW_OUTLINES = true;
export function setOutlines(on) {
  SHOW_OUTLINES = on !== false;
}
export const outlinesOn = () => SHOW_OUTLINES;
// how see-through wet clothes can get at most (0 = never, 1 = fully invisible)
let WET_MAX_SEE = 0.5;
export function setWetMaxSee(v) {
  WET_MAX_SEE = Math.max(0, Math.min(0.95, v));
}

function makeLoader() {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  return loader;
}

export function cleanName(n) {
  return (n || '').replace(/ \(Instance\)/g, '').replace(/ \(Outline\)/g, '').trim();
}

/** Parse a VRM and return the list of material names plus a guess of which are legwear. */
export async function inspectVRM(buffer) {
  const gltf = await makeLoader().parseAsync(buffer.slice(0), '');
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('This file is not a valid VRM model.');
  const names = new Set();
  vrm.scene.traverse((o) => {
    if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m && names.add(cleanName(m.name)));
  });
  const list = [...names].filter(Boolean);
  const meta = vrm.meta || {};
  VRMUtils.deepDispose(vrm.scene);
  return { materials: list, autoLegwear: list.filter((n) => LEGWEAR_RE.test(n)), title: meta.name || meta.title || 'VRM model' };
}

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// ---- How things are held. Arm specs are [swingForward, twist, lift, elbowBend] for the left arm;
// the right arm is mirrored. 'at' says which hand(s) the prop follows.
const HOLDS = {
  hugHigh: { both: [-0.7, -0.3, 0.15, 1.05], at: 'both', off: [0, -0.04, -0.06] },
  hugLow: { both: [-0.5, -0.35, 0.2, 0.85], at: 'both', off: [0, 0.03, -0.04] },
  waiter: { both: [-0.2, 0, 0.12, 1.55], at: 'both', off: [0, 0.06, 0.06] },
  shield: { both: [-0.3, -0.45, 0.25, 0.35], at: 'both', off: [0, 0, 0.05], flat: true },
  clutch: { both: [-0.3, -0.5, 0.25, 0.25], at: 'both', off: [0, 0, 0.05], hang: true },
  read: { both: [-0.75, -0.25, 0.15, 1.1], at: 'both', off: [0, -0.12, 0.04], rot: [-0.55, 0, 0], head: 0.35 },
  cradle: { l: [-0.2, -0.9, 0.2, 1.7], at: 'left', off: [-0.06, -0.12, -0.02], rot: [0.12, 0, 0] },
  side: { r: [0.05, 0, 0.14, 0.08], at: 'right', off: [0, 0, 0], hang: true },
  cup: { r: [-0.35, 0.2, 0.15, 1.55], at: 'right', off: [0, 0.05, 0.03] },
  mop: { r: [-0.4, 0.1, 0.15, 0.9], at: 'right', off: [0, 0, 0.03], rot: [0.15, 0, 0] },
  mopFront: { both: [-0.45, -0.3, 0.2, 0.8], at: 'both', off: [0, -0.1, 0.06] },
  umbrella: { r: [-0.55, 0.15, 0.25, 1.6], at: 'right', off: [0, -0.15, 0] },
  push: { both: [-1.2, -0.1, 0.1, 0.25] },
};
/** Pick a grip for an item. 'cover' = the item is hiding your lap, so it's held low in front. */
export function holdFor(kind, cover, push) {
  if (push) return 'push';
  if (!kind) return 'hugHigh';
  if (kind === 'umbrella') return 'umbrella';
  if (kind === 'cup') return 'cup';
  if (cover) {
    if (['box', 'basket', 'laundry', 'pillow', 'towel'].includes(kind)) return 'hugLow';
    if (['bag', 'bucket', 'can', 'sign'].includes(kind)) return 'clutch';
    if (kind === 'mop') return 'mopFront';
    return 'shield';
  }
  if (['box', 'basket', 'laundry'].includes(kind)) return 'hugHigh';
  if (['bag', 'bucket', 'can', 'sign'].includes(kind)) return 'side';
  if (kind === 'tray') return 'waiter';
  if (kind === 'newspaper') return 'read';
  if (kind === 'mop') return 'mop';
  return 'cradle';
}

// ---- What your hands do at a work station or interactable (by station tag or interactable id).
const WORK_KINDS = {
  type: ['computer', 'mydesk', 'terminal', 'reception', 'frontdesk', 'concierge', 'host', 'circ', 'server', 'scanner', 'counter', 'checkout', 'timeclock', 'pass'],
  write: ['schedule', 'readtable', 'fitting', 'queue'],
  sort: ['inbox', 'mail', 'archivebox', 'returncart', 'linen', 'packing', 'luggage', 'wardrobe', 'mailbox', 'dryer', 'washer'],
  press: ['copier', 'printer', 'microwave', 'soda', 'roaster', 'grinder', 'elevator', 'elevator2', 'door', 'aptdoor', 'lobbydoor', 'exit', 'poolgate'],
  pour: ['coffee', 'bar', 'beans', 'kitchen'],
  high: ['shelf', 'supply'],
  low: ['trash', 'dumpster', 'returnbin', 'fridge', 'oven', 'pickup'],
  lift: ['dock', 'pallet', 'conveyor'],
  wipe: ['dish', 'cafetable', 'pastry', 'bench'],
  wash: ['sink', 'shower'],
  mop: ['spill', 'mop'],
  water: ['plant'],
  feed: ['shredder'],
  tinker: ['repair'],
};
const WORK_BY_TAG = {};
for (const [k, tags] of Object.entries(WORK_KINDS)) for (const t of tags) WORK_BY_TAG[t] = k;
export function workKindFor(tagOrId) {
  if (!tagOrId) return null;
  const base = String(tagOrId).split('#')[0].replace(/[0-9]+$/, '');
  return WORK_BY_TAG[base] || null;
}
const TALK_KINDS = ['one', 'one', 'both', 'point', 'shrug', 'hips', 'still'];


// ---------------------------------------------------------------------------
// Template cache: parse a VRM once, clone it many times.
const templates = new Map();
export function clearTemplates() {
  for (const p of templates.values()) p.then((v) => v && VRMUtils.deepDispose(v.scene)).catch(() => {});
  templates.clear();
}
export function getTemplate(key, buffer) {
  if (!templates.has(key)) {
    templates.set(
      key,
      makeLoader()
        .parseAsync(buffer.slice(0), '')
        .then((gltf) => {
          const vrm = gltf.userData.vrm;
          if (!vrm) throw new Error('Not a VRM');
          VRMUtils.removeUnnecessaryVertices(gltf.scene);
          VRMUtils.rotateVRM0(vrm);
          vrm.scene.updateMatrixWorld(true);
          vrm.scene.traverse((o) => {
            if (!o.isMesh) return;
            fixTransparency(o.material);
            // copies are seen small and in crowds: keep their textures small to save memory
            for (const m of Array.isArray(o.material) ? o.material : [o.material]) shrinkTextures(m, 1024);
          });
          return vrm;
        })
    );
  }
  return templates.get(key);
}

// ---------------------------------------------------------------------------
// Semi-transparency: VRoid often exports partly see-through textures with
// MASK alpha, which renders those pixels fully opaque. Switch such materials
// to real blending; anything that can't blend falls back to fully hidden
// pixels (alpha test) rather than opaque ones.
const shrunk = new WeakMap();
function shrinkTextures(m, max) {
  if (!m) return;
  for (const k of Object.keys(m)) {
    const t = m[k];
    if (!t || !t.isTexture || !t.image) continue;
    const img = t.image;
    const w = img.width || 0;
    const h = img.height || 0;
    if (Math.max(w, h) <= max) continue;
    if (shrunk.has(img)) {
      t.image = shrunk.get(img);
      t.needsUpdate = true;
      continue;
    }
    try {
      const sc = max / Math.max(w, h);
      const c = document.createElement('canvas');
      c.width = Math.round(w * sc);
      c.height = Math.round(h * sc);
      c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height);
      shrunk.set(img, c);
      // analyse alpha on the shrunk copy too
      if (alphaCache.has(img)) alphaCache.set(c, alphaCache.get(img));
      if (hasAlphaCache.has(img)) hasAlphaCache.set(c, hasAlphaCache.get(img));
      t.image = c;
      t.needsUpdate = true;
      if (img.close) img.close();
    } catch (_) {}
  }
}

const hasAlphaCache = new WeakMap();
/** Does the texture have any see-through pixels at all? */
function textureHasAlpha(tex) {
  if (!tex || !tex.image) return false;
  if (hasAlphaCache.has(tex.image)) return hasAlphaCache.get(tex.image);
  let res = false;
  try {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(tex.image, 0, 0, 128, 128);
    const d = ctx.getImageData(0, 0, 128, 128).data;
    let clear = 0;
    let solid = 0;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 128) clear++;
      else solid++;
    }
    // a little see-through area inside an otherwise solid texture (eyelash edges, lace...)
    res = clear > 8 && solid > 8;
  } catch (_) {}
  hasAlphaCache.set(tex.image, res);
  return res;
}

const alphaCache = new WeakMap();
function textureHasSemiAlpha(tex) {
  if (!tex || !tex.image) return false;
  if (alphaCache.has(tex.image)) return alphaCache.get(tex.image);
  let res = false;
  try {
    const img = tex.image;
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 96;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 96, 96);
    const d = ctx.getImageData(0, 0, 96, 96).data;
    let semi = 0;
    let solid = 0;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] > 20 && d[i] < 235) semi++;
      else if (d[i] >= 235) solid++;
    }
    res = semi > 30 && semi > (semi + solid) * 0.02;
  } catch (_) {}
  alphaCache.set(tex.image, res);
  return res;
}
const samplers = new WeakMap();
/** Returns (u, v) -> alpha 0..1 for a texture, or null if unreadable. */
function alphaSampler(tex) {
  if (!tex || !tex.image) return null;
  if (samplers.has(tex.image)) return samplers.get(tex.image);
  let fn = null;
  try {
    const N = 256;
    const c = document.createElement('canvas');
    c.width = N;
    c.height = N;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(tex.image, 0, 0, N, N);
    const d = ctx.getImageData(0, 0, N, N).data;
    const flip = tex.flipY;
    fn = (u, v) => {
      u = u - Math.floor(u);
      v = v - Math.floor(v);
      const x = Math.min(N - 1, Math.floor(u * N));
      const y = Math.min(N - 1, Math.floor((flip ? 1 - v : v) * N));
      return d[(y * N + x) * 4 + 3] / 255;
    };
  } catch (_) {}
  samplers.set(tex.image, fn);
  return fn;
}

/** MToon sends its alpha cutoff, opacity and texture offsets to the shader only in update():
 *  call this once after loading and whenever one of those changes (not every frame). */
export function syncMtoon(m) {
  if (m && m.isMToonMaterial && m.update) m.update(0);
}
function syncAllMtoon(ch) {
  ch.scene?.traverse((o) => {
    if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) syncMtoon(m);
  });
}

function fixTransparency(mat) {
  for (const m of Array.isArray(mat) ? mat : [mat]) {
    if (!m || m._fixedAlpha) continue;
    m._fixedAlpha = true;
    if (m.transparent) {
      m.depthWrite = false;
      if (!m.alphaTest) m.alphaTest = 0.01;
      continue;
    }
    if (m.alphaTest > 0 && m.map && textureHasSemiAlpha(m.map)) {
      m.transparent = true;
      m.depthWrite = false;
      m.alphaTest = 0.02;
      m.needsUpdate = true;
    } else if (!m.alphaTest && m.map && textureHasAlpha(m.map)) {
      // marked opaque but the texture has see-through pixels: those would show as black.
      // Blend them when they're soft, otherwise cut them out.
      if (textureHasSemiAlpha(m.map)) {
        m.transparent = true;
        m.depthWrite = false;
        m.alphaTest = 0.02;
      } else m.alphaTest = 0.5;
      m.needsUpdate = true;
    }
  }
}

/**
 * opts: {
 *   vrm: ArrayBuffer|null, key (cache key, enables cloning), full (full parse with hair physics),
 *   legwearMaterials: string[]|null, underwearOverlay, colors: {skin,hair,top,bottom,under,eye},
 *   tintable (apply colors as tints - for the white bundled models), legwearType, tintTop, tintBottom,
 *   randomize (random civilian colors), wetMaterials: string[], gender,
 *   clothes: { vrm, key, legwearMaterials } (wear another model's clothes)
 * }
 */
export async function createCharacter(opts = {}) {
  if (opts.vrm) {
    try {
      const ch = opts.full || !opts.key ? await createFullVRM(opts) : await createClonedVRM(opts);
      if (opts.clothes && opts.clothes.vrm) await wearOtherClothes(ch, opts.clothes);
      if (opts.pieces?.length || opts.hideOwn?.length) await wearPieces(ch, opts.pieces || [], opts.hideOwn || [], opts);
      if (opts.underwear && opts.underwear.panty) {
        try {
          await applyUnderwear(ch, opts.underwear, opts.cfg || {}, opts.underwearRes || 1024);
        } catch (e) {
          console.warn('underwear failed', e);
        }
      }
      syncAllMtoon(ch);
      return ch;
    } catch (e) {
      console.warn('VRM load failed, using default model', e);
    }
  }
  return createMannequin(opts);
}

class CharacterBase {
  constructor() {
    this.root = new THREE.Group();
    this.legwearOn = true;
    this.phase = 0;
    this.crouchS = 0;
    this.sitS = 0;
    this.carryS = 0;
    this.upperLegLen = 0.43;
    this.lowerLegLen = 0.42;
    this.hipRestY = 0.92;
    this.height = 1.65;
    this.eyeHeight = 1.5;
    this.armDown = 1.25;
    this.mood = {};
    this.moodS = {};
    this.blinkT = 2 + Math.random() * 3;
    this.wet = 0;
    this.borrowed = null;
  }
  get hipHeight() {
    return this.hipRestY;
  }
  bone() {
    return null;
  }
  setEmotion() {}
  resetPhysics() {}
  /** mood: {happy, angry, sad, relaxed, surprised} target weights (0..1). */
  setMood(m) {
    this.mood = m || {};
  }
  applyExpressions(dt) {
    const em = this.expressions;
    for (const k of MOODS) {
      this.moodS[k] = damp(this.moodS[k] || 0, Math.min(1, this.mood[k] || 0), 6, dt);
    }
    this.blinkT -= dt;
    let blink = 0;
    if (this.blinkT < 0) {
      blink = Math.max(0, 1 - Math.abs(this.blinkT + 0.07) / 0.07);
      if (this.blinkT < -0.14) this.blinkT = 2 + Math.random() * 4;
    }
    if (em) {
      for (const k of MOODS) {
        try {
          em.setValue(k, this.moodS[k] * EXPR_MAX);
        } catch (_) {}
      }
      // happy/relaxed close the eyes on VRoid faces; don't double up with blinking
      const eyesClosed = (this.moodS.happy + this.moodS.relaxed) * EXPR_MAX;
      try {
        em.setValue('blink', Math.max(0, blink - eyesClosed));
      } catch (_) {}
    } else if (this.blush) {
      const v = (this.moodS.sad || 0) + (this.moodS.surprised || 0);
      this.blush.forEach((b) => (b.visible = v > 0.3));
    }
  }

  /**
   * Procedural animation. a: {speed, crouch, sit, carry, lookDown, headYaw, talk, work, busy}
   * Layers: locomotion (walk/run/crouch-walk), idle behaviors, work and talk gestures, sitting variants,
   * and mood posture. Bone rotations are blended so switching between them looks smooth.
   */
  animate(dt, a) {
    const speed = a.speed || 0;
    this.sitS = damp(this.sitS, a.sit ? 1 : 0, 8, dt);
    this.carryS = damp(this.carryS, a.carry ? 1 : 0, 10, dt);
    // some work is done bent over or squatting; lifting bobs up and down
    const wk = a.work && !a.carry ? (a.sit ? 'type' : a.workKind || 'type') : null;
    const lowWork = wk === 'low' ? 0.6 : wk === 'lift' ? 0.35 + 0.35 * Math.sin(performance.now() / 650) : wk === 'water' ? 0.25 : 0;
    this.crouchS = damp(this.crouchS, a.crouch ? 1 : lowWork, a.crouch ? 10 : 4, dt);
    this.runS = damp(this.runS || 0, speed > 3 ? 1 : 0, 6, dt);
    this.moveS = damp(this.moveS || 0, speed > 0.15 ? 1 : 0, 8, dt);
    const amp = Math.min(speed / 1.8, 1.25);
    this.phase += dt * (speed * 3.1 + (speed > 0.1 ? 1.2 : 0));
    const s = Math.sin(this.phase);
    const cph = Math.cos(this.phase);
    const c = this.crouchS * (1 - this.sitS);
    const sit = this.sitS;
    const carry = this.carryS;
    const run = this.runS;
    const move = this.moveS;
    const t = performance.now() / 1000;
    const seed = this.root.id * 1.37;
    const sad = Math.min(1, (this.moodS.sad || 0) + (this.moodS.surprised || 0) * 0.4);
    const happy = this.moodS.happy || 0;
    const surprised = this.moodS.surprised || 0;
    const T = {};
    const put = (n, x = 0, y = 0, z = 0) => (T[n] = [x, y, z]);

    // ---- pick an idle behavior now and then (only standing still with free hands)
    const idleOK = !a.pose && speed < 0.15 && sit < 0.5 && !a.work && !a.talk && !a.carry && c < 0.5;
    if (!this.idle || (this.idle.t -= dt) <= 0) {
      const kinds = ['breathe', 'breathe', 'shift', 'look', 'phone', 'armsCross', 'clasp', 'scratch', 'stretch', 'fidget', 'look', 'shift'];
      const k = idleOK ? kinds[Math.floor(Math.random() * kinds.length)] : 'breathe';
      this.idle = { kind: k, t: k === 'breathe' ? 2 + Math.random() * 4 : 3 + Math.random() * 5, side: Math.random() < 0.5 ? 1 : -1 };
      this.sitKind = Math.random() < 0.5 ? 'lap' : Math.random() < 0.5 ? 'lean' : 'crossed';
    }
    const idle = idleOK ? this.idle.kind : 'breathe';
    const side = this.idle.side;

    // ---- legs
    const crouchThigh = -1.15 * c;
    const crouchKnee = 1.9 * c;
    const sitThigh = -1.5 * sit;
    const sitKnee = 1.5 * sit;
    const stride = (0.5 + 0.25 * run) * amp * (1 - sit);
    const lift = 0.9 + 0.6 * run;
    const lKnee = Math.max(0, -cph) * lift * amp + 0.08 * amp;
    const rKnee = Math.max(0, cph) * lift * amp + 0.08 * amp;
    // idle weight shift: one hip drops, that knee bends a little
    const shift = idle === 'shift' || idle === 'fidget' ? side * (0.5 + 0.5 * Math.sin(t * 0.7 + seed)) : side * 0.25 * (1 - move);
    const fidget = idle === 'fidget' ? Math.max(0, Math.sin(t * 4 + seed)) * 0.25 : 0;
    const sitCross = sit * (this.sitKind === 'crossed' ? 1 : 0);
    put('leftUpperLeg', crouchThigh + sitThigh + s * stride - fidget * (side > 0 ? 1 : 0), -0.1 * sitCross, (shift > 0 ? 0.04 : 0) * (1 - move) - 0.25 * sitCross);
    put('rightUpperLeg', crouchThigh + sitThigh - s * stride - fidget * (side < 0 ? 1 : 0), 0, (shift < 0 ? -0.04 : 0) * (1 - move));
    put('leftLowerLeg', crouchKnee + sitKnee + lKnee * (1 - sit) + (shift > 0 ? 0.12 : 0) * (1 - move) * (1 - sit) + fidget * 1.5 * (side > 0 ? 1 : 0));
    put('rightLowerLeg', crouchKnee + sitKnee + rKnee * (1 - sit) + (shift < 0 ? 0.12 : 0) * (1 - move) * (1 - sit) + fidget * 1.5 * (side < 0 ? 1 : 0));
    // feet roll heel-to-toe while walking
    put('leftFoot', -0.4 * c + Math.max(0, s) * 0.35 * amp * (1 - sit) - 0.15 * Math.max(0, -s) * amp);
    put('rightFoot', -0.4 * c + Math.max(0, -s) * 0.35 * amp * (1 - sit) - 0.15 * Math.max(0, s) * amp);

    // ---- torso: lean into runs, sway with steps, slump when sad, bounce when happy
    const breath = Math.sin(t * 1.6 + seed) * 0.025;
    const lean = 0.06 * amp + 0.22 * run + 0.35 * c + 0.08 * sad - 0.05 * happy;
    const sitLean = sit * (this.sitKind === 'lean' ? -0.15 : 0.05);
    put('spine', lean + sitLean + (idle === 'stretch' ? -0.12 : 0), s * 0.07 * amp * (1 - sit), -shift * 0.05);
    put('chest', breath + (a.work ? 0.08 : 0), -s * 0.1 * amp * (1 - sit), 0);
    put('upperChest', breath * 0.5, -s * 0.05 * amp, 0);
    // shoulders: hunched when sad, a small shrug on surprise
    const hunch = 0.12 * sad + 0.15 * surprised * (1 - move);
    put('leftShoulder', 0, 0, hunch);
    put('rightShoulder', 0, 0, -hunch);

    // ---- head: looks where they look, bobs a little, glances around when idle
    let headYaw = a.headYaw || 0;
    let headPitch = -0.1 * c + 0.12 * sad + (a.lookDown ? 0.3 : 0) - 0.05 * run;
    if (idle === 'look') headYaw += Math.sin(t * 0.9 + seed) * 0.7;
    if (idle === 'phone') headPitch += 0.45;
    if (a.work) headPitch += 0.15 + Math.sin(t * 0.8 + seed) * 0.05;
    if (a.talk) {
      headPitch += Math.sin(t * 5 + seed) * 0.04;
      headYaw += Math.sin(t * 1.3 + seed) * 0.08;
    }
    if (sit && this.sitKind === 'lean') headPitch -= 0.08;
    put('neck', -0.15 * c + headPitch * 0.3, headYaw * 0.4, 0);
    put('head', headPitch * 0.7 + Math.abs(s) * 0.02 * amp, headYaw * 0.6, -shift * 0.03);

    // ---- arms
    const down = this.armDown;
    const swing = (0.4 + 0.25 * run) * amp * (1 - sit);
    const runElbow = 0.25 + 0.15 * amp + 1.1 * run;
    let lua = [-s * swing, 0, -down + 0.15 * c];
    let rua = [s * swing, 0, down - 0.15 * c];
    let lla = [0, -(runElbow * move + 0.12), 0];
    let rla = [0, runElbow * move + 0.12, 0];
    // carrying: the grip depends on the item and on whether it's covering you
    const holdName = carry > 0.01 && !a.overHead ? holdFor(this.prop?.userData.kind, a.cover, a.push) : null;
    this.hold = a.carry && !a.overHead ? holdName : null;
    if (holdName) {
      const H = HOLDS[holdName];
      const k = carry;
      const bob = s * 0.05 * amp;
      const mixArm = (ua, la, spec, sign) => {
        const tgU = [spec[0] + bob, sign * spec[1], sign * (-down + spec[2])];
        for (let i = 0; i < 3; i++) ua[i] = ua[i] * (1 - k) + tgU[i] * k;
        la[1] = la[1] * (1 - k) + sign * -spec[3] * k;
      };
      if (H.both || H.l) mixArm(lua, lla, H.both || H.l, 1);
      if (H.both || H.r) mixArm(rua, rla, H.both || H.r, -1);
      if (H.head) T.__head = H.head * k;
    }
    // working: what the hands do depends on the station
    if (wk) {
      const L = (x, y, lift, e) => { lua = [x, y, -down + lift]; lla = [0, -e, 0]; };
      const R = (x, y, lift, e) => { rua = [x, -y, down - lift]; rla = [0, e, 0]; };
      const cyc = (t * 0.25 + seed) % 1;
      if (wk === 'type') {
        const tk = Math.sin(t * 9 + seed);
        L(-0.25, -0.3, 0.25, 1.25 + tk * 0.08);
        R(-0.25, -0.3, 0.25, 1.25 + Math.sin(t * 8.3 + seed) * 0.08);
        if (Math.sin(t * 0.4 + seed) > 0.6) R(-0.9 + Math.sin(t * 2.2) * 0.12, -0.1, 0.2, 0.35); // reach for the mouse/phone
      } else if (wk === 'write') {
        L(-0.6, -0.4, 0.2, 1.6);
        R(-0.55 + Math.sin(t * 11) * 0.04, -0.3, 0.25, 1.5 + Math.sin(t * 13 + seed) * 0.1);
        T.__head = 0.3;
      } else if (wk === 'sort') {
        const sw2 = Math.sin(t * 3 + seed);
        L(-0.8 + 0.18 * sw2, -0.2, 0.2, 0.9 + 0.2 * Math.max(0, -sw2));
        R(-0.8 - 0.18 * sw2, -0.2, 0.2, 0.9 + 0.2 * Math.max(0, sw2));
        T.__twist = 0.18 * Math.sin(t * 1.5 + seed);
        T.__head = 0.2;
      } else if (wk === 'press') {
        if (cyc < 0.35) {
          R(-1.15 + 0.1 * Math.max(0, Math.sin(t * 7)), -0.1, 0.15, 0.3);
          T.__head = 0.05;
        } else if (cyc < 0.7) {
          // waiting on the machine: hand on hip, tapping a foot
          L(0.6, -0.6, 0.55, 1.5);
          T.__tap = Math.max(0, Math.sin(t * 6)) * 0.25;
        } else {
          L(-0.35, -0.95, 0.2, 1.75);
          R(-0.35, -0.95, 0.2, 1.75);
        }
      } else if (wk === 'pour') {
        R(-1.0, -0.1, 0.2, 0.6);
        L(-0.7, -0.3, 0.2, 1.25);
        T.__wrist = -0.7 * Math.max(0, Math.sin(t * 0.8 + seed));
        T.__head = 0.25;
      } else if (wk === 'high') {
        const alt = Math.sin(t * 0.6 + seed) > 0;
        if (alt) R(-2.6 + Math.sin(t * 2) * 0.1, 0.1, 0.2, 0.25);
        else L(-2.6 + Math.sin(t * 2) * 0.1, 0.1, 0.2, 0.25);
        (alt ? L : R)(-0.3, -0.2, 0.1, 0.4);
        T.__head = -0.35;
        T.__tiptoe = 0.25;
      } else if (wk === 'low') {
        L(-0.9 + Math.sin(t * 2.5) * 0.1, 0, 0.1, 0.2);
        R(-0.9 - Math.sin(t * 2.5) * 0.1, 0, 0.1, 0.2);
        T.__bend = 0.45;
        T.__head = 0.3;
      } else if (wk === 'lift') {
        const up = 0.5 + 0.5 * Math.sin(performance.now() / 650);
        L(-0.6 - 0.5 * up, -0.3, 0.15, 0.6 + 0.4 * up);
        R(-0.6 - 0.5 * up, -0.3, 0.15, 0.6 + 0.4 * up);
        T.__bend = 0.35 * (1 - up);
      } else if (wk === 'wipe') {
        R(-0.95 + 0.15 * Math.sin(t * 5), -0.15 - 0.25 * Math.cos(t * 5), 0.1, 0.5);
        L(-0.7, 0, 0.05, 0.3);
        T.__bend = 0.3;
        T.__head = 0.2;
      } else if (wk === 'wash') {
        L(-0.8, -0.3, 0.15, 0.7 + 0.18 * Math.sin(t * 8));
        R(-0.8, -0.3, 0.15, 0.7 + 0.18 * Math.sin(t * 8 + Math.PI));
        T.__bend = 0.2;
        T.__head = 0.25;
      } else if (wk === 'mop') {
        L(-0.6, -0.2, 0.25, 0.6);
        R(-0.9, -0.2, 0.25, 0.9);
        T.__twist = 0.35 * Math.sin(t * 2.5);
        T.__bend = 0.15;
      } else if (wk === 'water') {
        R(-0.85, -0.1, 0.2, 0.4);
        L(-0.6, -0.2, 0.2, 0.9);
        T.__wrist = -0.5 - 0.2 * Math.sin(t * 1.3);
        T.__head = 0.35;
      } else if (wk === 'feed') {
        const push = Math.max(0, Math.sin(t * 2.5 + seed));
        L(-0.9 + 0.25 * push, -0.15, 0.2, 0.7 - 0.3 * push);
        R(-0.9 + 0.25 * push, -0.15, 0.2, 0.7 - 0.3 * push);
        T.__head = 0.2;
      } else if (wk === 'tinker') {
        L(-0.7 + Math.sin(t * 11) * 0.05, -0.3, 0.15, 1.0 + Math.sin(t * 7) * 0.1);
        R(-0.7 + Math.sin(t * 9 + 1) * 0.05, -0.3, 0.15, 1.0 + Math.sin(t * 12) * 0.12);
        T.__bend = 0.3;
        T.__head = 0.35;
      } else if (wk === 'watch') {
        // gawking at something: hand to mouth, arms crossed or hands on hips
        const v = Math.floor(seed * 3) % 3;
        if (v === 0) { L(-0.35, -0.95, 0.2, 1.75); R(-0.35, -0.95, 0.2, 1.75); }
        else if (v === 1) { R(-1.5, -0.4, 0.3, 2.1); L(-0.35, -0.9, 0.2, 1.7); }
        else { L(0.6, -0.6, 0.55, 1.5); R(0.6, -0.6, 0.55, 1.5); }
      }
    }
    // sitting: hands on the lap or knees
    if (sit > 0.5 && !a.work && !a.carry) {
      if (this.sitKind === 'lean') {
        lua = [0.2, 0, -down + 0.05];
        rua = [0.2, 0, down - 0.05];
        lla = [0, -0.3, 0];
        rla = [0, 0.3, 0];
      } else {
        lua = [-0.45, -0.3, -down + 0.15];
        rua = [-0.45, 0.3, down - 0.15];
        lla = [0, -0.85, 0];
        rla = [0, 0.85, 0];
      }
    }
    // idle behaviors (hands free, standing)
    if (idleOK && carry < 0.1) {
      if (idle === 'armsCross') {
        lua = [-0.35, -0.95, -down + 0.2];
        rua = [-0.35, 0.95, down - 0.2];
        lla = [0, -1.75, 0];
        rla = [0, 1.75, 0];
      } else if (idle === 'clasp') {
        lua = [0.1, -1.4, -down + 0.6];
        rua = [0.1, 1.4, down - 0.6];
        lla = [0, -1.6, 0];
        rla = [0, 1.6, 0];
      } else if (idle === 'handsBack') {
        lua = [0.4, 1.4, -down + 0.15];
        rua = [0.4, -1.4, down - 0.15];
        lla = [0, -1.1, 0];
        rla = [0, 1.1, 0];
      } else if (idle === 'phone') {
        rua = [-0.6, 0.5, down - 0.2];
        rla = [0, 2.0, 0];
        lua = [-0.35, -0.5, -down + 0.15];
        lla = [0, -1.3, 0];
      } else if (idle === 'scratch') {
        const arm = side > 0 ? 'r' : 'l';
        const wig = Math.sin(t * 10) * 0.08;
        if (arm === 'r') {
          rua = [-2.2, -0.3, down - 1.0];
          rla = [0, 2.2 + wig, 0];
        } else {
          lua = [-2.2, 0.3, -down + 1.0];
          lla = [0, -2.2 - wig, 0];
        }
      } else if (idle === 'stretch') {
        const up = 0.5 + 0.5 * Math.sin(Math.min(1, (5 - this.idle.t) / 2) * Math.PI - Math.PI / 2);
        // arms swing up overhead (up = z, since the arms rotate out of the T-pose)
        lua = [0, 0, -down + (down + 1.25) * up];
        rua = [0, 0, down - (down + 1.25) * up];
        lla = [0, -0.2, 0];
        rla = [0, 0.2, 0];
      } else {
        // relaxed arms with a slight sway
        lua[0] += Math.sin(t * 0.8 + seed) * 0.03;
        rua[0] += Math.sin(t * 0.8 + seed + 1) * 0.03;
      }
    }
    // talking: each conversation gets its own gesture style
    if (!a.talk) this.talkKind = null;
    else if (!this.talkKind) this.talkKind = TALK_KINDS[Math.floor(Math.random() * TALK_KINDS.length)];
    if (a.talk && !a.carry && sit < 0.5 && !wk) {
      const g = Math.sin(t * 3.1 + seed);
      const tk = this.talkKind;
      if (tk === 'one' || tk === 'both') {
        rua = [-0.5 + g * 0.15, -0.3, down - 0.35];
        rla = [0, 1.3 + Math.sin(t * 4.3) * 0.25, 0];
        if (tk === 'both' || Math.sin(t * 0.7 + seed) > 0.3) {
          lua = [-0.45 - g * 0.12, 0.3, -down + 0.35];
          lla = [0, -1.2 - Math.sin(t * 3.7) * 0.2, 0];
        }
      } else if (tk === 'point') {
        const on = Math.sin(t * 0.9 + seed) > -0.2;
        if (on) {
          rua = [-1.35, -0.1, down - 0.2];
          rla = [0, 0.15 + 0.1 * Math.max(0, Math.sin(t * 6)), 0];
        }
        lua = [0.15, 0.9, -down + 0.45];
        lla = [0, -1.6, 0];
      } else if (tk === 'shrug') {
        const sh = Math.max(0, Math.sin(t * 1.4 + seed));
        lua = [-0.3, 0.4, -down + 0.35 + 0.25 * sh];
        rua = [-0.3, -0.4, down - 0.35 - 0.25 * sh];
        lla = [0, -1.3, 0];
        rla = [0, 1.3, 0];
        T.__shrug = 0.15 * sh;
      } else if (tk === 'hips') {
        lua = [0.6, -0.6, -down + 0.55];
        lla = [0, -1.5, 0];
        rua = [-0.5 + g * 0.2, -0.3, down - 0.35];
        rla = [0, 1.2 + Math.sin(t * 4.3) * 0.3, 0];
      }
    }
    // startled: hands come up a little
    if (surprised > 0.6 && !a.carry && sit < 0.5) {
      const k = (surprised - 0.6) * 2;
      lua = [lua[0] - 0.4 * k, lua[1], lua[2] + 0.2 * k];
      rua = [rua[0] - 0.4 * k, rua[1], rua[2] - 0.2 * k];
    }
    // holding something over your head against the rain
    if (a.overHead) {
      lua = [-0.3, 0, -down + (down + 0.9)];
      rua = [-0.3, 0, down - (down + 0.9)];
      lla = [0, -1.0, 0];
      rla = [0, 1.0, 0];
    }
    // posed moments (dialog portraits, title screen): these override everything above
    if (a.pose) {
      const L = (x, y, lift, e) => { lua = [x, y, -down + lift]; lla = [0, -e, 0]; };
      const R = (x, y, lift, e) => { rua = [x, -y, down - lift]; rla = [0, e, 0]; };
      const hipL = () => L(0.6, -0.6, 0.55, 1.5);
      const hipR = () => R(0.6, -0.6, 0.55, 1.5);
      L(0, 0, 0.05, 0.15);
      R(0, 0, 0.05, 0.15);
      const P = (T.__pose = {});
      switch (a.pose) {
        case 'startled':
          L(-0.9, -0.3, 0.6, 1.75);
          R(-0.9, -0.3, 0.6, 1.75);
          Object.assign(P, { spine: -0.2, head: -0.12, shrug: 0.15, stepBack: 0.25 });
          break;
        case 'cover':
          L(-0.35, -0.6, -0.25, 0.6);
          R(-0.35, -0.6, -0.25, 0.6);
          Object.assign(P, { spine: 0.15, head: 0.3, knees: 0.3, shrug: 0.1 });
          break;
        case 'point':
          R(-1.45, -0.1, 0.25, 0.1);
          hipL();
          Object.assign(P, { spine: 0.06, twist: -0.12 });
          break;
        case 'hips':
          hipL();
          hipR();
          Object.assign(P, { spine: -0.05, head: -0.05 });
          break;
        case 'shrug':
          L(-0.3, 0.4, 0.6, 1.3);
          R(-0.3, 0.4, 0.6, 1.3);
          Object.assign(P, { shrug: 0.18, tilt: 0.12 });
          break;
        case 'chin':
          rua = [-1.3, 0.5, down - 0.5];
          rla = [0, 2.3, 0];
          L(-0.35, -0.9, 0.2, 1.75);
          Object.assign(P, { head: 0.05, tilt: 0.1 });
          break;
        case 'wave':
          rua = [-0.2, 0, -0.6];
          rla = [0, 1.2, 0];
          Object.assign(P, { tilt: -0.1 });
          break;
        case 'fist':
          rua = [-1.0, 0.3, down - 0.6];
          rla = [0, 2.0, 0];
          hipL();
          Object.assign(P, { spine: -0.08, head: -0.08, stepBack: -0.15 });
          break;
        case 'clasp':
          L(-0.65, -0.6, 0.3, 1.8);
          R(-0.65, -0.6, 0.3, 1.8);
          Object.assign(P, { head: 0.12, tilt: 0.12, shrug: 0.06 });
          break;
        case 'arms':
          L(-0.35, -0.95, 0.2, 1.75);
          R(-0.35, -0.95, 0.2, 1.75);
          Object.assign(P, { spine: -0.06, head: -0.04 });
          break;
        case 'facepalm':
          rua = [-2.0, 0.3, down - 0.8];
          rla = [0, 2.3, 0];
          hipL();
          Object.assign(P, { head: 0.25, spine: 0.1 });
          break;
        case 'bow':
          L(-0.25, -0.4, 0.15, 0.3);
          R(-0.25, -0.4, 0.15, 0.3);
          Object.assign(P, { spine: 0.55, head: 0.2 });
          break;
        case 'float':
          L(-0.25, 0.25, 0.6, 0.35);
          R(-0.25, 0.25, 0.6, 0.35);
          Object.assign(P, { head: -0.05, tilt: 0.1, float: 1 });
          break;
        case 'bless':
          // one hand raised in blessing, the other open at the side
          rua = [-1.6, 0.2, down - 0.4];
          rla = [0, 0.5, 0];
          L(-0.25, 0.25, 0.6, 0.35);
          Object.assign(P, { head: -0.08, tilt: -0.08, float: 1 });
          break;
        default:
          break;
      }
    }
    put('leftUpperArm', ...lua);
    put('rightUpperArm', ...rua);
    put('leftLowerArm', ...lla);
    put('rightLowerArm', ...rla);
    put('leftHand', 0, 0, carry * 0.2);
    put('rightHand', T.__wrist || 0, 0, -carry * 0.2 + (T.__wrist || 0) * 0.5);
    // per-action body tweaks: bending over, twisting, looking down at the work, tiptoes, shrugs, foot taps
    if (T.__bend) T.spine[0] += T.__bend;
    if (T.__twist) T.chest[1] += T.__twist;
    if (T.__head) { T.head[0] += T.__head * 0.7; T.neck[0] += T.__head * 0.3; }
    if (T.__tiptoe) { T.leftFoot[0] += T.__tiptoe; T.rightFoot[0] += T.__tiptoe; }
    if (T.__shrug) { T.leftShoulder[2] += T.__shrug; T.rightShoulder[2] -= T.__shrug; }
    if (T.__tap) T.rightFoot[0] -= T.__tap;
    const PO = T.__pose;
    if (PO) {
      if (PO.spine) T.spine[0] += PO.spine;
      if (PO.twist) T.chest[1] += PO.twist;
      if (PO.head) { T.head[0] += PO.head * 0.7; T.neck[0] += PO.head * 0.3; }
      if (PO.tilt) T.head[2] += PO.tilt;
      if (PO.shrug) { T.leftShoulder[2] += PO.shrug; T.rightShoulder[2] -= PO.shrug; }
      if (PO.stepBack) { T.rightUpperLeg[0] += PO.stepBack; T.rightLowerLeg[0] += Math.abs(PO.stepBack) * 0.4; }
      if (PO.knees) {
        // knock-kneed and shy: thighs turn in, knees bend a little
        T.leftUpperLeg[1] -= PO.knees * 0.5; T.rightUpperLeg[1] += PO.knees * 0.5;
        T.leftUpperLeg[0] -= PO.knees * 0.3; T.rightUpperLeg[0] -= PO.knees * 0.3;
        T.leftLowerLeg[0] += PO.knees * 0.6; T.rightLowerLeg[0] += PO.knees * 0.6;
      }
      if (PO.float) {
        // hovering: toes pointed, one knee drawn back
        T.leftFoot[0] += 0.6; T.rightFoot[0] += 0.6;
        T.leftLowerLeg[0] += 0.55; T.leftUpperLeg[0] -= 0.1;
        T.rightUpperLeg[0] -= 0.05; T.rightLowerLeg[0] += 0.12;
      }
    }
    for (const k of ['__wrist', '__bend', '__twist', '__head', '__tiptoe', '__shrug', '__tap', '__pose']) delete T[k];

    // ---- apply, blended
    const P = (this.poseS ||= {});
    const k = 1 - Math.exp(-14 * dt);
    for (const n in T) {
      const b = this.bone(n);
      if (!b) continue;
      const cur = P[n] || (P[n] = [0, 0, 0]);
      const tg = T[n];
      cur[0] += (tg[0] - cur[0]) * k;
      cur[1] += (tg[1] - cur[1]) * k;
      cur[2] += (tg[2] - cur[2]) * k;
      b.rotation.set(cur[0], cur[1], cur[2]);
    }
    // hips: drop for crouching/sitting, bob and sway with the steps
    const a1 = (P.leftUpperLeg ? (P.leftUpperLeg[0] + P.rightUpperLeg[0]) / 2 : 0) - s * 0;
    const a2 = P.leftLowerLeg ? (P.leftLowerLeg[0] + P.rightLowerLeg[0]) / 2 : 0;
    const legBend = crouchThigh + sitThigh;
    const kneeBend = crouchKnee + sitKnee;
    void a1;
    void a2;
    const h = this.upperLegLen * Math.cos(legBend) + this.lowerLegLen * Math.cos(kneeBend + legBend);
    let drop = this.upperLegLen + this.lowerLegLen - h;
    drop += Math.abs(cph) * (0.03 + 0.03 * run) * amp * (1 - sit) - 0.02 * amp + 0.015 * Math.abs(shift) * (1 - move);
    if (wk === 'high') drop -= 0.04;
    if (sit > 0.01) drop = drop * (1 - sit) + (this.hipRestY / (this.root.scale.y || 1) - 0.5) * sit;
    const hips = this.bone('hips');
    if (hips) {
      hips.position.y = this.hipBaseY - drop;
      hips.rotation.set(0, s * 0.12 * amp * (1 - sit), cph * 0.05 * amp * (1 - sit) + shift * 0.05 * (1 - move));
    }
    this.applyExpressions(dt);
  }

  setProp(mesh) {
    if (this.prop) this.prop.removeFromParent();
    this.prop = mesh || null;
    if (mesh) this.root.add(mesh);
  }
  updateProp() {
    if (!this.prop) return;
    const s = this.root.scale.y || 1;
    const u = this.prop.userData;
    if (this.propOverHead) {
      this.prop.position.set(0, (this.height + 0.08) / s, 0.02);
      this.prop.rotation.set(0, 0, 0);
      return;
    }
    // follow the hands, so the item moves with the arms
    const H = this.hold && HOLDS[this.hold];
    const lh = this.bone('leftHand');
    const rh = this.bone('rightHand');
    if (H && H.at && lh && rh) {
      if (H.at === 'both') {
        lh.updateWorldMatrix(true, false);
        rh.updateWorldMatrix(true, false);
        lh.getWorldPosition(_v);
        rh.getWorldPosition(_v2);
        _v.add(_v2).multiplyScalar(0.5);
      } else {
        const b = H.at === 'left' ? lh : rh;
        b.updateWorldMatrix(true, false);
        b.getWorldPosition(_v);
      }
      this.root.worldToLocal(_v);
      const oy = H.hang ? -((u.h || 0.3) / 2 + 0.03) : H.off[1];
      this.prop.position.set(_v.x + H.off[0] / s, _v.y + oy / s, _v.z + H.off[2] / s);
      const r = H.flat && u.flatRot ? u.flatRot : H.rot || [0, 0, 0];
      this.prop.rotation.set(r[0], r[1], r[2]);
      return;
    }
    const hips = this.bone('hips');
    let y = this.hipRestY;
    if (hips) {
      hips.getWorldPosition(_v);
      y = _v.y - this.root.getWorldPosition(_v2).y;
    }
    this.prop.rotation.set(0, 0, 0);
    this.prop.position.set(0, (y + (u.up || 0)) / s, (u.fwd ?? 0.4) / s);
  }

  /** Wetness 0..1: adds a sheen, darkens fabric, and makes chosen parts see-through. */
  setWet(w) {
    w = Math.max(0, Math.min(1, w));
    if (Math.abs(w - this.wet) < 0.02 && w !== 0 && w !== 1) return;
    this.wet = w;
    for (const e of this.mats || []) {
      const m = e.m;
      if (!m || /outline/i.test(m.name || '')) continue;
      if (!e.orig) {
        e.orig = {
          color: m.color ? m.color.clone() : null,
          rim: m.parametricRimColorFactor ? m.parametricRimColorFactor.clone() : null,
          rimPow: m.parametricRimFresnelPowerFactor,
          transparent: m.transparent,
          opacity: m.opacity,
          alphaTest: m.alphaTest,
          depthWrite: m.depthWrite,
        };
      }
      const o = e.orig;
      const isSkin = SKIN_RE.test(e.name);
      const isHair = HAIR_RE.test(e.name);
      if (o.color && m.color) m.color.copy(o.color).multiplyScalar(1 - (isSkin ? 0.03 : isHair ? 0.25 : 0.18) * w);
      if (o.rim && m.parametricRimColorFactor) {
        m.parametricRimColorFactor.copy(o.rim).lerp(new THREE.Color(0.55, 0.6, 0.65), w * (isSkin ? 0.3 : isHair ? 0.22 : 0.6));
        if (o.rimPow !== undefined) m.parametricRimFresnelPowerFactor = o.rimPow + (2.5 - o.rimPow) * w;
      }
      if (this.wetSet && this.wetSet.has(e.name)) {
        const see = Math.max(0, (w - 0.3) / 0.7);
        const want = see > 0.02;
        if (want !== m.transparent) {
          m.transparent = want || o.transparent;
          m.depthWrite = want ? false : o.depthWrite;
          m.needsUpdate = true;
        }
        m.opacity = (o.opacity ?? 1) * (1 - WET_MAX_SEE * see); // capped by the 'soaked see-through' setting
        // cut-out (MASK) materials would discard everything below the cutoff, making the part vanish
        m.alphaTest = want ? Math.min(o.alphaTest || 0, 0.04) : o.alphaTest;
        syncMtoon(m);
      }
    }
    if (this.mannequinWet) this.mannequinWet(w);
  }
}
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// ---------------------------------------------------------------------------
function setupVRMChar(ch, scene, hum, opts) {
  const legwearSet = new Set(opts.legwearMaterials || []);
  const useAuto = !opts.legwearMaterials;
  ch.legwearMeshes = [];
  ch.mats = [];
  ch.scene = scene;
  ch.humanoid = hum;
  // wet see-through parts; null means "pick sensible defaults" (blouses, shirts, tops)
  ch.wetAuto = opts.wetMaterials == null;
  ch.wetSet = new Set(opts.wetMaterials || []);
  // parts that stay on in underwear, at home and at the pool (glasses, important accessories)
  ch.keepSet = new Set([...(opts.keepMaterials || []), ...(opts.cfg?.keep || [])]);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false;
    fixTransparency(o.material);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const isLeg = mats.some((m) => {
      const n = cleanName(m && m.name);
      return useAuto ? LEGWEAR_RE.test(n) : legwearSet.has(n);
    });
    if (isLeg) ch.legwearMeshes.push(o);
    o.userData.isLegwear = isLeg;
    mats.forEach((m) => m && ch.mats.push({ m, leg: isLeg, name: cleanName(m.name), base: m.color?.clone(), baseShade: m.shadeColorFactor?.clone() }));
    // parts this model takes off at home and at the pool (shoes, jackets...)
    if (opts.cfg?.homeHide?.length && mats.some((m) => m && opts.cfg.homeHide.includes(cleanName(m.name))) && !mats.some((m) => m && ch.keepSet.has(cleanName(m.name)))) (ch.homeHideMeshes ||= []).push(o);
  });
  if (ch.wetAuto) for (const e of ch.mats) if (/(tops|shirt|blouse|onepiece|dress)/i.test(e.name) && !e.leg) ch.wetSet.add(e.name);
  for (const e of ch.mats) if (/outline/i.test(e.m.name || '')) e.m.visible = SHOW_OUTLINES;
  ch.setHomeMode = (on) => {
    ch.homeMode = on;
    for (const m of ch.homeHideMeshes || []) m.visible = !on;
  };
  // barefoot indoors: shoes and boots come off
  const shoeSlots = opts.cfg?.slots || null;
  ch.shoeMeshes = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    if (ms.some((m) => m && ch.keepSet?.has(cleanName(m.name)))) return;
    if (ms.some((m) => m && (shoeSlots ? shoeSlots[cleanName(m.name)] === 'shoe' : /shoe|boot/i.test(cleanName(m.name))))) ch.shoeMeshes.push(o);
  });
  ch.setShoes = (on) => {
    ch.shoesOff = !on;
    for (const m of ch.shoeMeshes) m.visible = !!on;
  };
  ch.bone = (n) => hum.getNormalizedBoneNode(n);
  scene.updateMatrixWorld(true);
  const wp = (n) => {
    const b = hum.getRawBoneNode(n);
    return b ? b.getWorldPosition(new THREE.Vector3()) : null;
  };
  const hipsP = wp('hips');
  const lul = wp('leftUpperLeg');
  const rul = wp('rightUpperLeg');
  const lll = wp('leftLowerLeg');
  const lf = wp('leftFoot');
  const head = wp('head');
  ch.hipBaseY = hum.getNormalizedBoneNode('hips').position.y;
  ch.hipRestY = hipsP ? hipsP.y : 0.9;
  if (lul && lll && lf) {
    ch.upperLegLen = lul.distanceTo(lll);
    ch.lowerLegLen = lll.distanceTo(lf);
  }
  ch.height = head ? head.y + 0.12 : 1.6;
  ch.eyeHeight = head ? head.y + 0.05 : 1.5;
  ch.armDown = 1.3;
  if (opts.underwearOverlay && lul && rul && hipsP) {
    const hipW = lul.distanceTo(rul);
    const r = hipW * 0.62 + 0.05;
    const top = hipsP.y + 0.04;
    const bottom = lul.y - 0.07;
    const mat = new THREE.MeshToonMaterial({ color: new THREE.Color(opts.colors?.under || '#ff9ff3'), side: THREE.DoubleSide });
    const g = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, Math.max(0.08, top - bottom), 20, 1, true), mat);
    cyl.position.y = (top + bottom) / 2;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat);
    cap.scale.y = 0.45;
    cap.position.y = bottom;
    g.add(cyl, cap);
    g.scale.z = 0.78;
    g.position.set(hipsP.x, 0, hipsP.z);
    scene.add(g);
    g.updateMatrixWorld(true);
    hum.getRawBoneNode('hips').attach(g);
    ch.underwearMesh = g;
    g.visible = false;
  }
  ch.setLegwear = (on) => {
    ch.legwearOn = on;
    ch.legwearMeshes.forEach((m) => (m.visible = on && !ch.undressed && !m.userData.hiddenByClothes));
    if (ch.underwearMesh) ch.underwearMesh.visible = (!on || ch.undressed) && !ch.borrowed;
    if (ch._bodyHidden || ch.borrowed) refreshBodyHiding(ch);
  };
  // down to underwear: every clothing part (own or borrowed-fit) is hidden
  ch.setUndressed = (on) => {
    on = !!on;
    if (on === !!ch.undressed) return;
    ch.undressed = on;
    ch.scene.traverse((o) => {
      if (!o.isMesh || o.userData.isLegwear) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      if (ms.some((m) => m && ch.keepSet?.has(cleanName(m.name)))) return;
      const cloth = ms.some((m) => {
        const n = cleanName(m && m.name);
        return (CLOTH_RE.test(n) || LEGWEAR_RE.test(n)) && !SKIN_RE.test(n);
      });
      if (!cloth) return;
      if (on) {
        o.userData.undressWas = o.visible;
        o.visible = false;
      } else if (o.userData.undressWas !== undefined) {
        o.visible = o.userData.undressWas && !o.userData.hiddenByClothes;
        delete o.userData.undressWas;
      }
    });
    ch.setLegwear(ch.legwearOn);
  };
  applyTints(ch, opts);
  // trying on the same clothes in other colors (fitting rooms): skin, hair and eyes stay as they are
  const slots = opts.cfg?.slots || null;
  ch.retint = () => {
    const r = coordinatedColors();
    const accent = r.accent;
    for (const { m, leg, name, base, baseShade } of ch.mats) {
      if (/outline/i.test(m.name || '')) continue;
      const slot = slots && slots[name];
      if (slot ? ['none', 'skin', 'hair', 'eye'].includes(slot) : SKIN_RE.test(name) || HAIR_RE.test(name) || IRIS_RE.test(name)) continue;
      const shoe = slot === 'shoe' || (!slot && /shoe|boot/i.test(name));
      const bottom = slot === 'bottom' || (!slot && leg);
      if (!slot && !leg && !shoe && !CLOTH_RE.test(name)) continue;
      if (base && m.color) m.color.copy(base);
      if (baseShade && m.shadeColorFactor) m.shadeColorFactor.copy(baseShade);
      mulColor(m, shoe ? r.shoe : bottom ? r.bottom : slot === 'accent' ? accent : r.top, true);
    }
  };
}

function mulColor(m, c, raw) {
  if (!c) return;
  const col = new THREE.Color(c);
  if (!raw) {
    const mx = Math.max(col.r, col.g, col.b, 0.05);
    col.multiplyScalar(1 / mx).multiplyScalar(Math.min(1, mx * 1.2 + 0.2));
  }
  if (m.color) m.color.multiply(col);
  if (m.shadeColorFactor) m.shadeColorFactor.multiply(col);
}

function applyTints(ch, opts) {
  const rnd = opts.randomize ? randomCivilianTints() : null;
  const col = opts.tintable ? opts.colors || {} : {};
  const raw = !!(opts.tintable || opts.randomize);
  const slots = opts.cfg?.slots || null;
  const accent = rnd ? randomCivilianTints().top : null;
  for (const { m, leg, name } of ch.mats) {
    if (/outline/i.test(m.name || '')) continue;
    const slot = slots && slots[name];
    if (slot) {
      // set by hand in the model settings
      if (slot === 'none') continue;
      const c =
        slot === 'bottom' ? opts.tintBottom || rnd?.bottom || col.bottom
        : slot === 'top' ? opts.tintTop || rnd?.top || col.top
        : slot === 'shoe' ? opts.tintShoe || rnd?.shoe || col.shoe
        : slot === 'accent' ? opts.tintAccent || accent || col.accent
        : rnd?.[slot] || col[slot];
      const picked = (slot === 'top' && opts.tintTop) || (slot === 'bottom' && opts.tintBottom) || (slot === 'shoe' && opts.tintShoe) || (slot === 'accent' && opts.tintAccent);
      mulColor(m, c, raw && !picked);
      continue;
    }
    if (leg) mulColor(m, opts.tintBottom || rnd?.bottom || col.bottom, raw && !opts.tintBottom);
    else if (SKIN_RE.test(name) || /faceeyeline/i.test(name)) mulColor(m, rnd?.skin || col.skin, raw); // the eyeline shading is skin too
    else if (HAIR_RE.test(name)) mulColor(m, rnd?.hair || col.hair, raw);
    else if (IRIS_RE.test(name)) mulColor(m, rnd?.eye || col.eye, raw);
    else if (/shoe|boot/i.test(name)) mulColor(m, opts.tintShoe || rnd?.shoe || col.shoe, raw && !opts.tintShoe);
    else if (/accessor/i.test(name) && (opts.tintAccent || accent || col.accent)) mulColor(m, opts.tintAccent || accent || col.accent, raw && !opts.tintAccent);
    else if (CLOTH_RE.test(name)) mulColor(m, opts.tintTop || rnd?.top || col.top, raw && !opts.tintTop);
  }
}

export const SKIN_TONES = ['#ffe3cf', '#f6d1b6', '#e8b98f', '#d29a6e', '#b07a52', '#8a5a3a', '#6b4430'];
function randomCivilianTints() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return { skin: pick(SKIN_TONES), hair: pick(DYE_HEX), eye: pick(DYE_HEX), ...coordinatedColors() };
}

function finishVRMChar(ch) {
  ch.isVRM = true;
  ch.setEmotion = () => {};
  ch.setLegwear(true);
}

/**
 * VRM models split one body into many skinned pieces, and each piece carries its own copy of the
 * skeleton, so every frame the same bone matrices were computed and uploaded ~15 times per person.
 * Pieces that use the same bones with the same bind pose now share a single skeleton.
 */
function shareSkeletons(root) {
  const byKey = new Map();
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton) return;
    const sk = o.skeleton;
    let key = sk.bones.map((b) => b.id).join(',') + '|';
    for (const m of sk.boneInverses) for (const v of m.elements) key += Math.round(v * 1e4) + ',';
    const shared = byKey.get(key);
    if (shared && shared !== sk) o.bind(shared, o.bindMatrix);
    else if (!shared) byKey.set(key, sk);
  });
}

async function createFullVRM(opts) {
  const gltf = await makeLoader().parseAsync(opts.vrm.slice(0), '');
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('Not a VRM');
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  const ch = new CharacterBase();
  ch.vrm = vrm;
  shareSkeletons(vrm.scene);
  ch.root.add(vrm.scene);
  setupVRMChar(ch, vrm.scene, vrm.humanoid, opts);
  ch.expressions = vrm.expressionManager || null;
  ch.resetPhysics = () => {
    try {
      vrm.springBoneManager?.reset();
    } catch (_) {}
  };
  // materials are synced on load and when they change (syncMtoon), not every frame
  vrm.materials = undefined;
  ch.update = (dt, a) => {
    ch.animate(dt, a);
    ch.updateProp();
    vrm.update(Math.min(dt, 1 / 20));
  };
  ch.dispose = () => VRMUtils.deepDispose(vrm.scene);
  finishVRMChar(ch);
  if (opts.scale) ch.root.scale.setScalar(opts.scale);
  return ch;
}

async function createClonedVRM(opts) {
  const tpl = await getTemplate(opts.key, opts.vrm);
  const scene = skeletonClone(tpl.scene);
  shareSkeletons(scene);
  const map = new Map();
  const walk = (a, b) => {
    map.set(a, b);
    for (let i = 0; i < a.children.length; i++) if (b.children[i]) walk(a.children[i], b.children[i]);
  };
  walk(tpl.scene, scene);
  const oldRig = map.get(tpl.humanoid.normalizedHumanBonesRoot);
  if (oldRig) oldRig.removeFromParent();
  const humanBones = {};
  for (const [name, hb] of Object.entries(tpl.humanoid.rawHumanBones)) {
    if (hb && hb.node && map.get(hb.node)) humanBones[name] = { node: map.get(hb.node) };
  }
  const hum = new VRMHumanoid(humanBones);
  scene.add(hum.normalizedHumanBonesRoot);
  scene.traverse((o) => {
    if (o.isMesh) {
      if (Array.isArray(o.material)) o.material = o.material.map((m) => m.clone());
      else o.material = o.material.clone();
      if (o.morphTargetInfluences) o.morphTargetInfluences = o.morphTargetInfluences.slice();
    }
  });
  // rebuild facial expressions against the cloned meshes
  let em = null;
  if (tpl.expressionManager) {
    em = new VRMExpressionManager();
    for (const ex of tpl.expressionManager.expressions) {
      const nx = new VRMExpression(ex.expressionName);
      nx.isBinary = ex.isBinary;
      nx.overrideBlink = ex.overrideBlink;
      nx.overrideLookAt = ex.overrideLookAt;
      nx.overrideMouth = ex.overrideMouth;
      for (const b of ex._binds || []) {
        if (!b.primitives) continue;
        const prims = b.primitives.map((p) => map.get(p)).filter(Boolean);
        if (prims.length) nx.addBind(new VRMExpressionMorphTargetBind({ primitives: prims, index: b.index, weight: b.weight }));
      }
      em.registerExpression(nx);
    }
    em.blinkExpressionNames = tpl.expressionManager.blinkExpressionNames;
    em.mouthExpressionNames = tpl.expressionManager.mouthExpressionNames;
    em.lookAtExpressionNames = tpl.expressionManager.lookAtExpressionNames;
  }
  const ch = new CharacterBase();
  ch.root.add(scene);
  setupVRMChar(ch, scene, hum, opts);
  ch.expressions = em;
  ch.update = (dt, a) => {
    ch.animate(dt, a);
    ch.updateProp();
    hum.update();
    if (em) em.update();
  };
  ch.dispose = () => {
    scene.traverse((o) => {
      if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  };
  finishVRMChar(ch);
  if (opts.scale) ch.root.scale.setScalar(opts.scale);
  return ch;
}

// ---------------------------------------------------------------------------
// Clothing retargeting: copy skinned clothing meshes from one VRoid-style
// model onto another body. Each vertex is moved from its source bones to the
// matching target bones, with limb length and body girth rescaled so the
// clothes hug the new body instead of floating or clipping.

/** Which vertices of a (possibly shared) vertex buffer this mesh's triangles actually use. */
function usedVerts(mesh) {
  const g = mesh.geometry;
  const n = g.attributes.position.count;
  const used = new Uint8Array(n);
  if (!g.index) {
    used.fill(1);
    return used;
  }
  const a = g.index.array;
  const groups = g.groups && g.groups.length ? g.groups : [{ start: 0, count: a.length }];
  for (const gr of groups) for (let i = gr.start; i < gr.start + gr.count; i++) used[a[i]] = 1;
  return used;
}

const LIMB = new Set(['leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftFoot', 'rightFoot']);
const CHILD = { leftUpperLeg: 'leftLowerLeg', rightUpperLeg: 'rightLowerLeg', leftLowerLeg: 'leftFoot', rightLowerLeg: 'rightFoot', leftUpperArm: 'leftLowerArm', rightUpperArm: 'rightLowerArm', leftLowerArm: 'leftHand', rightLowerArm: 'rightHand', leftFoot: 'leftToes', rightFoot: 'rightToes' };

function skinInfo(scene, hum) {
  if (scene.userData.skinInfo) return scene.userData.skinInfo;
  scene.updateMatrixWorld(true);
  const bones = new Map(); // bone -> {name, pos (bind space), inverse, hname}
  const byName = new Map();
  const hnameOf = new Map();
  for (const [hn, hb] of Object.entries(hum.rawHumanBones || {})) if (hb?.node) hnameOf.set(hb.node, hn);
  let body = null;
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const sk = o.skeleton;
    sk.bones.forEach((b, i) => {
      if (bones.has(b)) return;
      const inv = sk.boneInverses[i];
      const bm = inv.clone().invert();
      const info = { bone: b, name: b.name, pos: new THREE.Vector3().setFromMatrixPosition(bm), inverse: inv.clone(), hname: hnameOf.get(b) };
      bones.set(b, info);
      if (!byName.has(b.name)) byName.set(b.name, info);
    });
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!body && mats.some((m) => /body/i.test(m.name || '') && SKIN_RE.test(m.name || ''))) body = o;
  });
  const byH = new Map();
  for (const info of bones.values()) if (info.hname) byH.set(info.hname, info);
  // limb axes / lengths
  for (const [hn, info] of byH) {
    const ch = byH.get(CHILD[hn]);
    if (ch) {
      info.axis = ch.pos.clone().sub(info.pos);
      info.len = info.axis.length();
      info.axis.normalize();
    }
  }
  // body girth per bone (average distance of body skin from the bone)
  if (body) {
    const geo = body.geometry;
    const pos = geo.attributes.position;
    const si = geo.attributes.skinIndex;
    const sw = geo.attributes.skinWeight;
    const acc = new Map();
    const v = new THREE.Vector3();
    const bodyUsed = usedVerts(body);
    for (let i = 0; i < pos.count; i += 2) {
      if (!bodyUsed[i]) continue;
      let bi = 0;
      let bw = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (w > bw) {
          bw = w;
          bi = si.getComponent(i, k);
        }
      }
      if (bw < 0.6) continue;
      const info = bones.get(body.skeleton.bones[bi]);
      if (!info) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(body.bindMatrix);
      const l = v.sub(info.pos);
      let r;
      if (info.axis && LIMB.has(info.hname)) r = l.clone().sub(info.axis.clone().multiplyScalar(l.dot(info.axis))).length();
      else r = Math.hypot(l.x, l.z);
      const a = acc.get(info) || [0, 0];
      a[0] += r;
      a[1]++;
      acc.set(info, a);
    }
    for (const [info, [s, n]] of acc) if (n > 8) info.girth = s / n;
    // spatial hash of the body surface (bind space) for shrink-wrapping clothes
    const nrm = geo.attributes.normal;
    const CELLS = 0.04;
    const grid = new Map();
    const pts = [];
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    const pts_index = new Int32Array(pos.count).fill(-1);
    for (let i = 0; i < pos.count; i++) {
      if (!bodyUsed[i]) continue;
      p.fromBufferAttribute(pos, i).applyMatrix4(body.bindMatrix);
      q.fromBufferAttribute(nrm, i).transformDirection(body.bindMatrix);
      const idx = pts.length;
      pts_index[i] = idx;
      const w = [];
      for (let k = 0; k < 4; k++) w.push([body.skeleton.bones[si.getComponent(i, k)], sw.getComponent(i, k)]);
      pts.push({ p: p.clone(), n: q.clone(), w });
      const key = Math.floor(p.x / CELLS) + ',' + Math.floor(p.y / CELLS) + ',' + Math.floor(p.z / CELLS);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(idx);
    }
    var surface = { grid, pts, cell: CELLS, vindex: pts_index };
  }
  const res = { bones, byName, byH, body, surface: typeof surface !== 'undefined' ? surface : null };
  scene.userData.skinInfo = res;
  return res;
}

const tmpA = new THREE.Vector3();
function nearestSurface(S, p) {
  const cx = Math.floor(p.x / S.cell);
  const cy = Math.floor(p.y / S.cell);
  const cz = Math.floor(p.z / S.cell);
  let best = null;
  let bd = Infinity;
  for (let r = 0; r <= 6 && !best; r++) {
    for (let x = cx - r; x <= cx + r; x++)
      for (let y = cy - r; y <= cy + r; y++)
        for (let z = cz - r; z <= cz + r; z++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) !== r) continue;
          const l = S.grid.get(x + ',' + y + ',' + z);
          if (!l) continue;
          for (const i of l) {
            const d = S.pts[i].p.distanceToSquared(p);
            if (d < bd) {
              bd = d;
              best = S.pts[i];
            }
          }
        }
    // keep searching one more ring once something is found, for accuracy
    if (best && r < 6) {
      const r2 = r + 1;
      for (let x = cx - r2; x <= cx + r2; x++)
        for (let y = cy - r2; y <= cy + r2; y++)
          for (let z = cz - r2; z <= cz + r2; z++) {
            if (Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) !== r2) continue;
            const l = S.grid.get(x + ',' + y + ',' + z);
            if (!l) continue;
            for (const i of l) {
              const d = S.pts[i].p.distanceToSquared(p);
              if (d < bd) {
                bd = d;
                best = S.pts[i];
              }
            }
          }
    }
  }
  return best && bd < 0.28 * 0.28 ? best : null;
}

/** Which body vertices sit right under this piece of clothing. */
function coverMask(S, pts) {
  const cell = 0.035;
  const grid = new Map();
  for (let i = 0; i < pts.length; i += 4) {
    const k = Math.floor(pts[i] / cell) + ',' + Math.floor(pts[i + 1] / cell) + ',' + Math.floor(pts[i + 2] / cell);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const mask = new Uint8Array(S.pts.length);
  for (let v = 0; v < S.pts.length; v++) {
    const { p, n } = S.pts[v];
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    const cz = Math.floor(p.z / cell);
    let hit = false;
    for (let x = cx - 2; x <= cx + 2 && !hit; x++)
      for (let y = cy - 2; y <= cy + 2 && !hit; y++)
        for (let z = cz - 2; z <= cz + 2 && !hit; z++) {
          const l = grid.get(x + ',' + y + ',' + z);
          if (!l) continue;
          for (const i of l) {
            const dx = pts[i] - p.x;
            const dy = pts[i + 1] - p.y;
            const dz = pts[i + 2] - p.z;
            const r = pts[i + 3];
            if (dx * dx + dy * dy + dz * dz < r * r && dx * n.x + dy * n.y + dz * n.z > -0.002) {
              hit = true;
              break;
            }
          }
        }
    if (hit) mask[v] = 1;
  }
  return mask;
}

/** Hide body triangles that are fully covered by visible fitted clothing (stops poke-through). */
export function refreshBodyHiding(ch) {
  const fitted = [];
  ch.scene?.traverse((o) => o.userData?.covers && fitted.push(o));
  for (const m of ch.borrowed || []) if (m.userData?.covers && !fitted.includes(m)) fitted.push(m);
  if (!fitted.length && !ch._bodyHidden) return;
  const body = (fitted[0] && fitted[0].userData.body) || ch._bodyHidden;
  if (!body || !body.geometry.index) return;
  if (!body.userData.ownGeo) {
    body.geometry = body.geometry.clone();
    body.userData.ownGeo = true;
    body.userData.origIndex = body.geometry.index.array.slice();
    body.userData.origGroups = body.geometry.groups.map((g) => ({ ...g }));
  }
  const orig = body.userData.origIndex;
  const visible = fitted.filter((m) => m.visible && m.parent);
  const n = body.geometry.attributes.position.count;
  const cov = new Uint8Array(n);
  const vindex = fitted[0]?.userData.vindex;
  for (const m of visible) {
    const c = m.userData.covers;
    for (let i = 0; i < n; i++) {
      const k = vindex ? vindex[i] : i;
      if (k >= 0 && c[k]) cov[i] = 1;
    }
  }
  // filter triangles group by group so multi-material meshes (toon + outline) keep working
  const groups = body.userData.origGroups.length ? body.userData.origGroups : [{ start: 0, count: orig.length, materialIndex: 0 }];
  const keep = [];
  const newGroups = [];
  for (const g of groups) {
    const start = keep.length;
    for (let t = g.start; t < g.start + g.count; t += 3) {
      if (cov[orig[t]] && cov[orig[t + 1]] && cov[orig[t + 2]]) continue;
      keep.push(orig[t], orig[t + 1], orig[t + 2]);
    }
    newGroups.push({ start, count: keep.length - start, materialIndex: g.materialIndex });
  }
  const Arr = orig.constructor;
  body.geometry.setIndex(new THREE.BufferAttribute(new Arr(keep), 1));
  body.geometry.clearGroups();
  if (body.userData.origGroups.length) for (const g of newGroups) body.geometry.addGroup(g.start, g.count, g.materialIndex);
  ch._bodyHidden = body;
}

/** Copy the meshes of `src` selected by `filter(mesh)` onto character `dst`. Returns the new meshes. */
export function fitClothing(srcScene, srcHum, dst, filter) {
  if (!dst.scene || !dst.humanoid) return [];
  const S = skinInfo(srcScene, srcHum);
  const D = skinInfo(dst.scene, dst.humanoid);
  if (!D.body) return [];
  const findDst = (info) => {
    let cur = info.bone;
    while (cur) {
      const si = S.bones.get(cur);
      if (si) {
        const d = D.byName.get(si.name) || (si.hname && D.byH.get(si.hname));
        if (d) return { s: si, d };
      }
      cur = cur.parent;
    }
    return null;
  };
  const out = [];
  srcScene.traverse((o) => {
    if (!o.isSkinnedMesh || !filter(o)) return;
    const g0 = o.geometry;
    const geo = g0.clone();
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const si = geo.attributes.skinIndex;
    const sw = geo.attributes.skinWeight;
    const dstBones = [];
    const dstIdx = new Map();
    const idxOf = (d) => {
      if (!dstIdx.has(d)) {
        dstIdx.set(d, dstBones.length);
        dstBones.push(d);
      }
      return dstIdx.get(d);
    };
    const pairCache = new Map();
    const clothIdx = [];
    // only opaque parts of the clothing texture count as covering the body
    const uv = geo.attributes.uv;
    const firstMat = Array.isArray(o.material) ? o.material[0] : o.material;
    const samp = firstMat && firstMat.map ? alphaSampler(firstMat.map) : null;
    const blendLow = firstMat && firstMat.transparent && (firstMat.opacity ?? 1) < 0.9;
    const opaqueAt = (i) => !blendLow && (!samp || !uv || samp(uv.getX(i), uv.getY(i)) > 0.6);
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const acc = new THREE.Vector3();
    const l = new THREE.Vector3();
    const used = usedVerts(o);
    for (let i = 0; i < pos.count; i++) {
      if (!used[i]) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix);
      acc.set(0, 0, 0);
      let wsum = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        const sb = o.skeleton.bones[si.getComponent(i, k)];
        if (w <= 0 || !sb) {
          si.setComponent(i, k, 0);
          continue;
        }
        let pair = pairCache.get(sb);
        if (pair === undefined) {
          pair = findDst(S.bones.get(sb) || { bone: sb });
          pairCache.set(sb, pair);
        }
        if (!pair) {
          sw.setComponent(i, k, 0);
          continue;
        }
        const { s, d } = pair;
        l.copy(v).sub(s.pos);
        const limb = LIMB.has(s.hname) && s.axis && d.axis;
        const gr = s.girth && d.girth ? Math.max(0.6, Math.min(1.8, d.girth / s.girth)) : 1;
        if (limb) {
          const along = l.dot(s.axis);
          const rad = l.clone().sub(s.axis.clone().multiplyScalar(along)).multiplyScalar(gr);
          l.copy(d.axis).multiplyScalar(along * (d.len / s.len)).add(rad);
        } else {
          l.x *= gr;
          l.z *= gr;
        }
        acc.addScaledVector(l.add(d.pos), w);
        wsum += w;
        si.setComponent(i, k, idxOf(d));
      }
      if (wsum > 0) {
        acc.multiplyScalar(1 / wsum);
        n.fromBufferAttribute(nrm, i);
        acc.addScaledVector(n, 0.004);
        // shrink-wrap: never let the body poke through
        const near = D.surface && nearestSurface(D.surface, acc);
        if (near) {
          const dd = tmpA.copy(acc).sub(near.p).dot(near.n);
          const want = 0.007;
          if (dd < want) {
            acc.addScaledVector(near.n, want - dd);
            if (want - dd > 0.008) {
              // follow the body's own bones here
              for (let k = 0; k < 4; k++) {
                const [bb, ww] = near.w[k];
                const di = bb && D.bones.get(bb);
                si.setComponent(i, k, di ? idxOf(di) : 0);
                sw.setComponent(i, k, di ? ww : 0);
              }
            }
          }
        }
        // positions live in the target body's bind space
        pos.setXYZ(i, acc.x, acc.y, acc.z);
        if (opaqueAt(i)) clothIdx.push(i);
      }
    }
    // per-vertex coverage radius from the (stretched) triangle edges around it
    const maxEdge = new Float32Array(pos.count);
    if (geo.index) {
      const ia = geo.index.array;
      const grs = geo.groups && geo.groups.length ? geo.groups : [{ start: 0, count: ia.length }];
      const A = new THREE.Vector3();
      const B = new THREE.Vector3();
      for (const gr of grs)
        for (let t = gr.start; t < gr.start + gr.count; t += 3)
          for (let e = 0; e < 3; e++) {
            const i0 = ia[t + e];
            const i1 = ia[t + ((e + 1) % 3)];
            const d = A.fromBufferAttribute(pos, i0).distanceTo(B.fromBufferAttribute(pos, i1));
            if (d > maxEdge[i0]) maxEdge[i0] = d;
            if (d > maxEdge[i1]) maxEdge[i1] = d;
          }
    }
    const clothPts = [];
    for (const i of clothIdx) clothPts.push(pos.getX(i), pos.getY(i), pos.getZ(i), Math.max(0.022, Math.min(0.07, maxEdge[i] * 0.7)));
    // the body's rest-pose matrix (bindMatrixInverse follows the character around the world in
    // 'attached' mode, which would throw the clothes off the body wherever it isn't at the origin)
    const inv = D.body.bindMatrix.clone().invert();
    geo.applyMatrix4(inv);
    pos.needsUpdate = true;
    si.needsUpdate = true;
    sw.needsUpdate = true;
    const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => {
      const c = m.clone();
      fixTransparency(c);
      // without this sync the copy keeps no alpha cutoff and its cut-out parts draw as black shapes
      syncMtoon(c);
      return c;
    });
    const mesh = new THREE.SkinnedMesh(geo, Array.isArray(o.material) ? mats : mats[0]);
    const skel = new THREE.Skeleton(dstBones.map((d) => d.bone), dstBones.map((d) => d.inverse));
    D.body.parent.add(mesh);
    mesh.position.copy(D.body.position);
    mesh.quaternion.copy(D.body.quaternion);
    mesh.scale.copy(D.body.scale);
    mesh.updateMatrixWorld(true);
    mesh.bind(skel, D.body.bindMatrix);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.userData.covers = D.surface ? coverMask(D.surface, clothPts) : null;
    mesh.userData.body = D.body;
    mesh.userData.vindex = D.surface ? D.surface.vindex : null;
    out.push(mesh);
  });
  return out;
}

/** Hide this body's own clothes and wear the clothes of another model. */
async function wearOtherClothes(ch, clothes) {
  const key = clothes.key || 'clothes:' + Math.random();
  const tpl = await getTemplate(key, clothes.vrm);
  const legSet = clothes.legwearMaterials ? new Set(clothes.legwearMaterials) : null;
  const isCloth = (n) => CLOTH_RE.test(n) || LEGWEAR_RE.test(n);
  // hide own clothing
  ch.scene.traverse((o) => {
    if (!o.isMesh || o.userData.fitted) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((m) => isCloth(cleanName(m.name)) && !SKIN_RE.test(cleanName(m.name)))) {
      o.visible = false;
      o.userData.hiddenByClothes = true;
    }
  });
  const meshes = fitClothing(tpl.scene, tpl.humanoid, ch, (o) => {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    return mats.some((m) => isCloth(cleanName(m.name)));
  });
  for (const m of meshes) {
    m.userData.fitted = true;
    m.userData.covers = null; // keep the body (and its underwear) under the clothes
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const nm = cleanName(mats[0].name);
    const isLeg = legSet ? legSet.has(nm) : LEGWEAR_RE.test(nm);
    m.userData.isLegwear = isLeg;
    if (isLeg) ch.legwearMeshes.push(m);
    mats.forEach((mm) => ch.mats.push({ m: mm, leg: isLeg, name: cleanName(mm.name) }));
  }
  ch.legwearMeshes = ch.legwearMeshes.filter((m) => !m.userData.hiddenByClothes);
  ch.setLegwear(ch.legwearOn);
  refreshBodyHiding(ch);
}

/**
 * Mix and match: hide some of this body's own clothing parts and put on single pieces from other
 * models. pieces: [{ vrm, key, mats: string[] ('*' = all their clothes), legwearMaterials }].
 * Nothing on the body underneath is cut away, so underwear and skin stay where they are.
 */
async function wearPieces(ch, pieces, hideOwn, opts = {}) {
  const isCloth = (n) => (CLOTH_RE.test(n) || LEGWEAR_RE.test(n)) && !SKIN_RE.test(n);
  const hideAll = hideOwn.includes('*');
  const hide = new Set(hideOwn);
  ch.scene.traverse((o) => {
    if (!o.isMesh || o.userData.fitted) return;
    const names = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => cleanName(m && m.name));
    if (names.some((n) => hide.has(n) || (hideAll && isCloth(n)))) {
      o.visible = false;
      o.userData.hiddenByClothes = true;
    }
  });
  ch.legwearMeshes = ch.legwearMeshes.filter((m) => !m.userData.hiddenByClothes);
  for (const pc of pieces) {
    if (!pc.vrm) continue;
    try {
      const tpl = await getTemplate(pc.key || 'piece:' + Math.random(), pc.vrm);
      const all = !pc.mats || pc.mats.includes('*');
      const want = new Set(pc.mats || []);
      const legSet = pc.legwearMaterials?.length ? new Set(pc.legwearMaterials) : null;
      const meshes = fitClothing(tpl.scene, tpl.humanoid, ch, (o) => {
        const names = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => cleanName(m && m.name));
        return names.some((n) => (all ? isCloth(n) : want.has(n)));
      });
      for (const m of meshes) {
        m.userData.fitted = true;
        m.userData.covers = null; // keep the body (and its underwear) under it
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const nm = cleanName(mats[0].name);
        const isLeg = legSet ? legSet.has(nm) : LEGWEAR_RE.test(nm);
        m.userData.isLegwear = isLeg;
        if (isLeg) ch.legwearMeshes.push(m);
        if (/shoe|boot/i.test(nm)) ch.shoeMeshes?.push(m);
        const added = mats.map((mm) => ({ m: mm, leg: isLeg, name: cleanName(mm.name), base: mm.color?.clone(), baseShade: mm.shadeColorFactor?.clone() }));
        ch.mats.push(...added);
        // a borrowed top goes see-through when soaked, like the body's own would
        if (ch.wetAuto) for (const e of added) if (/(tops|shirt|blouse|onepiece|dress)/i.test(e.name) && !e.leg) ch.wetSet.add(e.name);
        // the outfit's colors reach the borrowed piece too (bundled bodies' white clothes take them fully)
        applyTints({ mats: added }, { ...opts, tintable: !!pc.tintable && !!opts.tintable, cfg: null, randomize: false });
      }
    } catch (e) {
      console.warn('could not fit a clothing piece', e);
    }
  }
  ch.setLegwear(ch.legwearOn);
}

/**
 * What an outfit borrows from other models, ready for createCharacter: { pieces, hideOwn }.
 * Outfits store pieces as [{ src: model ref, mat: material name or '*' }]; the older
 * clothesFrom (a whole other outfit) means all of that model's clothes instead of your own.
 */
export async function outfitClothes(o, load, keyOf) {
  let list = o.pieces || [];
  let hideOwn = o.hideOwn || [];
  if (o.clothesFrom && !o.pieces) {
    list = [{ src: o.clothesFrom, mat: '*' }];
    hideOwn = ['*'];
  }
  const groups = new Map();
  for (const pc of list) {
    const k = keyOf(pc.src);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, { src: pc.src, mats: [] });
    groups.get(k).mats.push(pc.mat);
  }
  const pieces = [];
  for (const [key, g] of groups) {
    const vrm = await load(g.src);
    if (vrm) pieces.push({ vrm, key, mats: g.mats, legwearMaterials: g.src.legwearMaterials || null, tintable: !!g.src.asset || !!g.src.tintable });
  }
  return { pieces, hideOwn };
}

/** Put the lender's legwear on the borrower. Returns an undo function. */
export function borrowLegwear(lender, borrower) {
  let meshes = [];
  if (lender.isVRM && borrower.isVRM) {
    const set = new Set(lender.legwearMeshes);
    meshes = fitClothing(lender.scene, lender.humanoid, borrower, (o) => set.has(o));
  } else if (borrower.makeLegwear) {
    meshes = borrower.makeLegwear(lender.bottomColor || '#2d3436', lender.legwearType);
  } else if (borrower.isVRM) {
    meshes = simplePants(borrower, lender.bottomColor || '#2d3436', lender.legwearType);
  }
  borrower.borrowed = meshes;
  if (borrower.underwearMesh) borrower.underwearMesh.visible = false;
  if (borrower.isVRM) refreshBodyHiding(borrower);
  return () => {
    meshes.forEach((m) => {
      m.removeFromParent();
      m.geometry?.dispose?.();
    });
    borrower.borrowed = null;
    borrower.setLegwear(borrower.legwearOn);
    if (borrower.isVRM) refreshBodyHiding(borrower);
  };
}

/** Procedural pants/skirt attached to a VRM's bones (fallback when lender is a built-in figure). */
function simplePants(ch, color, type) {
  const mat = new THREE.MeshToonMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide });
  const out = [];
  const hum = ch.humanoid;
  const hips = hum.getRawBoneNode('hips');
  const D = skinInfo(ch.scene, hum);
  const hg = D.byH.get('hips')?.girth || 0.13;
  if (type === 'skirt') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(hg * 1.05, hg * 1.7, 0.4, 20, 1, true), mat);
    m.position.set(0, -0.15, 0);
    hips.add(m);
    out.push(m);
    return out;
  }
  const top = new THREE.Mesh(new THREE.CylinderGeometry(hg * 1.08, hg * 1.05, 0.2, 20, 1, false), mat);
  top.position.y = -0.04;
  top.scale.z = 0.8;
  hips.add(top);
  out.push(top);
  for (const side of ['left', 'right']) {
    for (const seg of ['UpperLeg', 'LowerLeg']) {
      const info = D.byH.get(side + seg);
      const b = hum.getRawBoneNode(side + seg);
      if (!info || !b) continue;
      const r = (info.girth || 0.06) * 1.12;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, info.len || 0.4, 14, 1, true), mat);
      m.position.y = -(info.len || 0.4) / 2;
      b.add(m);
      out.push(m);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Built-in mannequin

const geoCache = {};
function capsule(r, len) {
  const k = r + ':' + len;
  return (geoCache[k] ||= new THREE.CapsuleGeometry(r, len, 4, 10));
}
const matCache = {};
function toon(color) {
  return (matCache[color] ||= new THREE.MeshToonMaterial({ color: new THREE.Color(color) }));
}

export function createMannequin(opts = {}) {
  const col = Object.assign({ skin: '#f3d2b8', hair: '#2a1d16', top: '#ffffff', bottom: '#2d3436', under: '#ff9ff3', eye: '#1b1b2f' }, opts.colors || {});
  if (opts.tintTop) col.top = opts.tintTop;
  if (opts.tintBottom) col.bottom = opts.tintBottom;
  const male = opts.gender === 'male';
  const scale = (opts.scale || 1) * (male ? 1.06 : 1);
  const skirt = opts.legwearType === 'skirt';
  const ch = new CharacterBase();
  ch.bottomColor = col.bottom;
  ch.legwearType = skirt ? 'skirt' : 'pants';
  const bones = {};
  const mk = (name, parent, x, y, z) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    (parent || ch.root).add(o);
    bones[name] = o;
    return o;
  };
  const add = (bone, geo, color, px = 0, py = 0, pz = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, toon(color));
    m.position.set(px, py, pz);
    m.rotation.z = rz;
    m.castShadow = true;
    bone.add(m);
    return m;
  };
  const hips = mk('hips', null, 0, 0.92, 0);
  const spine = mk('spine', hips, 0, 0.08, 0);
  const chest = mk('chest', spine, 0, 0.2, 0);
  const neck = mk('neck', chest, 0, 0.24, 0);
  const head = mk('head', neck, 0, 0.07, 0);
  const sw = male ? 0.22 : 0.19;
  const lua = mk('leftUpperArm', chest, sw, 0.18, 0);
  const lla = mk('leftLowerArm', lua, 0.27, 0, 0);
  const rua = mk('rightUpperArm', chest, -sw, 0.18, 0);
  const rla = mk('rightLowerArm', rua, -0.27, 0, 0);
  mk('leftHand', lla, 0.25, 0, 0);
  mk('rightHand', rla, -0.25, 0, 0);
  const lul = mk('leftUpperLeg', hips, 0.1, -0.04, 0);
  const lll = mk('leftLowerLeg', lul, 0, -0.43, 0);
  const lft = mk('leftFoot', lll, 0, -0.42, 0);
  const rul = mk('rightUpperLeg', hips, -0.1, -0.04, 0);
  const rll = mk('rightLowerLeg', rul, 0, -0.43, 0);
  const rft = mk('rightFoot', rll, 0, -0.42, 0);
  const pelvis = add(hips, new THREE.SphereGeometry(0.17, 16, 10), skirt ? col.under : col.bottom);
  pelvis.scale.set(male ? 0.95 : 1.08, 0.62, 0.75);
  const belly = add(spine, capsule(0.15, 0.12), col.top, 0, 0.1, 0);
  belly.scale.z = 0.75;
  const torso = add(chest, capsule(0.17, 0.14), col.top, 0, 0.1, 0);
  torso.scale.set(male ? 1.2 : 1.05, 1, 0.72);
  add(neck, capsule(0.05, 0.06), col.skin, 0, 0.03, 0);
  add(head, new THREE.SphereGeometry(0.12, 18, 14), col.skin, 0, 0.11, 0.01);
  const hair = add(head, new THREE.SphereGeometry(0.13, 18, 14), col.hair, 0, 0.14, -0.015);
  hair.scale.set(1.02, 0.9, 1.02);
  if (!male) {
    const hairBack = add(head, capsule(0.11, 0.12), col.hair, 0, 0.05, -0.05);
    hairBack.scale.z = 0.7;
  }
  const eyeGeo = new THREE.SphereGeometry(0.016, 8, 6);
  add(head, eyeGeo, col.eye, 0.042, 0.115, 0.11);
  add(head, eyeGeo, col.eye, -0.042, 0.115, 0.11);
  ch.blush = [
    add(head, new THREE.SphereGeometry(0.022, 8, 6), '#ff6b81', 0.065, 0.085, 0.1),
    add(head, new THREE.SphereGeometry(0.022, 8, 6), '#ff6b81', -0.065, 0.085, 0.1),
  ];
  ch.blush.forEach((b) => (b.visible = false));
  add(lua, capsule(0.05, 0.2), col.top, 0.13, 0, 0, Math.PI / 2);
  add(lla, capsule(0.042, 0.19), col.skin, 0.12, 0, 0, Math.PI / 2);
  add(rua, capsule(0.05, 0.2), col.top, -0.13, 0, 0, Math.PI / 2);
  add(rla, capsule(0.042, 0.19), col.skin, -0.12, 0, 0, Math.PI / 2);
  const legMeshes = [];
  legMeshes.push(add(lul, capsule(0.075, 0.3), skirt ? col.skin : col.bottom, 0, -0.21, 0));
  legMeshes.push(add(rul, capsule(0.075, 0.3), skirt ? col.skin : col.bottom, 0, -0.21, 0));
  legMeshes.push(add(lll, capsule(0.058, 0.32), skirt ? col.skin : col.bottom, 0, -0.2, 0));
  legMeshes.push(add(rll, capsule(0.058, 0.32), skirt ? col.skin : col.bottom, 0, -0.2, 0));
  const shoeGeo = new THREE.BoxGeometry(0.1, 0.07, 0.22);
  add(lft, shoeGeo, '#222222', 0, -0.03, 0.05);
  add(rft, shoeGeo, '#222222', 0, -0.03, 0.05);
  let skirtMesh = null;
  if (skirt) {
    skirtMesh = add(hips, new THREE.CylinderGeometry(0.17, 0.27, 0.36, 18, 1, true), col.bottom, 0, -0.14, 0);
    skirtMesh.material = skirtMesh.material.clone();
    skirtMesh.material.side = THREE.DoubleSide;
  }
  ch.root.scale.setScalar(scale);
  ch.bone = (n) => bones[n] || null;
  ch.hipBaseY = 0.92;
  ch.hipRestY = 0.92 * scale;
  ch.height = 1.68 * scale;
  ch.eyeHeight = 1.55 * scale;
  let borrowedColor = null;
  let borrowedType = null;
  const paint = () => {
    const on = ch.legwearOn || !!borrowedColor;
    const bc = borrowedColor || col.bottom;
    const asSkirt = borrowedColor ? borrowedType === 'skirt' : skirt;
    if (skirtMesh) skirtMesh.visible = on && asSkirt;
    if (asSkirt) {
      pelvis.material = toon(col.under);
      legMeshes.forEach((m) => (m.material = toon(col.skin)));
      if (on && !skirtMesh) {
        // borrowed a skirt without having one: show it on the legs color-only
        pelvis.material = toon(bc);
      } else if (on && skirtMesh) skirtMesh.material.color.set(bc);
    } else {
      pelvis.material = toon(on ? bc : col.under);
      legMeshes.forEach((m) => (m.material = toon(on ? bc : col.skin)));
    }
  };
  ch.setLegwear = (on) => {
    ch.legwearOn = on;
    paint();
  };
  ch.makeLegwear = (color, type) => {
    borrowedColor = color;
    borrowedType = type;
    paint();
    return [{ removeFromParent: () => ((borrowedColor = null), paint()) }];
  };
  ch.update = (dt, a) => {
    ch.animate(dt, a);
    ch.updateProp();
  };
  ch.dispose = () => {};
  ch.setLegwear(true);
  return ch;
}

export function randomColors(rng = Math.random) {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  return { skin: pick(SKIN_TONES), hair: pick(DYE_HEX), under: pick(DYE_HEX), eye: pick(DYE_HEX), ...coordinatedColors(rng) };
}

/** Halo and wings for Celesti (works for VRM or mannequin). No light: she doesn't glow. */
export function addAngelic(ch) {
  const head = ch.bone('head');
  const chest = ch.bone('chest') || ch.bone('spine');
  const gold = new THREE.MeshToonMaterial({ color: 0xffd966 });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.016, 8, 32), gold);
  halo.rotation.x = Math.PI / 2;
  halo.position.set(0, 0.34, -0.02);
  head?.add(halo);
  const wingMat = new THREE.MeshToonMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.35, 0.45, 0.75, 0.55);
  shape.quadraticCurveTo(0.6, 0.2, 0.7, -0.05);
  shape.quadraticCurveTo(0.45, -0.1, 0.5, -0.35);
  shape.quadraticCurveTo(0.25, -0.2, 0, 0);
  const geo = new THREE.ShapeGeometry(shape);
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(geo, wingMat);
    w.scale.set(side, 1, 1);
    w.position.set(side * 0.05, 0.12, -0.18);
    w.rotation.y = side * 0.5;
    chest?.add(w);
  }
}

// ---------------------------------------------------------------------------
// Underwear: tinted panty / bra designs painted into the body texture (or replacing a separate
// underwear mesh's texture). The designs share the VRoid body texture layout.
let UW_BASE = 'underwear/';
export function setUnderwearBase(url) {
  UW_BASE = url;
}
const uwImages = new Map();
function loadOverlay(kind, name) {
  const key = kind + '/' + name;
  if (!uwImages.has(key)) {
    uwImages.set(
      key,
      fetch(UW_BASE + key + '.png')
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('missing ' + key))))
        .then((b) => createImageBitmap(b, { resizeWidth: 1024, resizeHeight: 1024, resizeQuality: 'high' }))
    );
  }
  return uwImages.get(key);
}
const unionMasks = new Map();
/** Everywhere any design can cover (where a model's own painted underwear would be), precomputed. */
async function unionMask(R) {
  if (unionMasks.has(R)) return unionMasks.get(R);
  const p = (async () => {
    const img = await fetch(UW_BASE + 'union.png').then((r) => r.blob()).then((b) => createImageBitmap(b));
    const c = document.createElement('canvas');
    c.width = c.height = R;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, R, R);
    const d = g.getImageData(0, 0, R, R).data;
    const m = new Uint8Array(R * R);
    for (let i = 0; i < R * R; i++) m[i] = d[i * 4] > 127 ? 1 : 0;
    return m;
  })();
  unionMasks.set(R, p);
  return p;
}

/** A print mask: the pattern's brightness becomes alpha (white = accent shows). */
const patternMasks = new Map();
function patternMask(name, R) {
  const key = name + '|' + R;
  if (!patternMasks.has(key)) {
    patternMasks.set(
      key,
      fetch(UW_BASE + 'patterns/' + name + '.png')
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('missing pattern ' + name))))
        .then((b) => createImageBitmap(b))
        .then((img) => {
          const c = document.createElement('canvas');
          c.width = c.height = R;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0, R, R);
          const id = g.getImageData(0, 0, R, R);
          const d = id.data;
          for (let i = 0; i < d.length; i += 4) {
            d[i + 3] = d[i];
            d[i] = d[i + 1] = d[i + 2] = 255;
          }
          g.putImageData(id, 0, 0);
          return c;
        })
    );
  }
  return patternMasks.get(key);
}

/**
 * A design colored for this character. A plain design takes `color`; with a pattern, the pattern's
 * white parts take `accent` instead. The design's own alpha cuts everything, so prints never reach skin.
 */
function tintedOverlay(img, color, R, mask = null, accent = null) {
  const c = document.createElement('canvas');
  c.width = c.height = R;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, R, R);
  if (color) {
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = color;
    g.fillRect(0, 0, R, R);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(img, 0, 0, R, R);
  }
  if (color && mask && accent) {
    // the accent-colored copy, cut to the design, then to the pattern's white parts
    const a = document.createElement('canvas');
    a.width = a.height = R;
    const ag = a.getContext('2d', { willReadFrequently: true });
    ag.drawImage(img, 0, 0, R, R);
    ag.globalCompositeOperation = 'multiply';
    ag.fillStyle = accent;
    ag.fillRect(0, 0, R, R);
    ag.globalCompositeOperation = 'destination-in';
    ag.drawImage(img, 0, 0, R, R);
    ag.drawImage(mask, 0, 0, R, R);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(a, 0, 0);
  }
  g.globalCompositeOperation = 'source-over';
  return c;
}

const uvMaskCache = new Map();

/** Where this material's UV islands lie on its texture (1 = used), so seams can be padded. */
function uvIslandMask(ch, m, R, flipY) {
  const key = (ch.tplKey || m.map?.uuid || '') + '|' + m.name + '|' + R;
  if (uvMaskCache.has(key)) return uvMaskCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = R;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  let any = false;
  ch.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.uv) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const geo = o.geometry;
    const uv = geo.attributes.uv;
    const idx = geo.index ? geo.index.array : null;
    const groups = geo.groups?.length ? geo.groups : [{ start: 0, count: idx ? idx.length : uv.count, materialIndex: 0 }];
    for (const gr of groups) {
      const mm = mats[gr.materialIndex ?? 0];
      if (!mm || (mm !== m && mm.map !== m.map)) continue;
      const path = new Path2D();
      for (let i = gr.start; i + 2 < gr.start + gr.count; i += 3) {
        for (let k = 0; k < 3; k++) {
          const v = idx ? idx[i + k] : i + k;
          const x = uv.getX(v) * R;
          const y = (flipY ? 1 - uv.getY(v) : uv.getY(v)) * R;
          if (k === 0) path.moveTo(x, y);
          else path.lineTo(x, y);
        }
        path.closePath();
      }
      g.fill(path);
      // a hairline stroke so thin triangles still count
      g.strokeStyle = '#fff';
      g.lineWidth = 1;
      g.stroke(path);
      any = true;
    }
  });
  let mask = null;
  if (any) {
    const d = g.getImageData(0, 0, R, R).data;
    mask = new Uint8Array(R * R);
    for (let i = 0; i < R * R; i++) mask[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  }
  uvMaskCache.set(key, mask);
  return mask;
}

/** Bleed island edge colors outward so filtering at UV seams never picks up the background. */
function padIslands(id, mask, R, passes = 8) {
  if (!mask) return;
  const d = id.data;
  let have = mask.slice();
  // only the band of pixels just outside the islands needs work
  let front = [];
  for (let i = 0; i < R * R; i++) if (!have[i]) {
    const x = i % R;
    if ((x > 0 && have[i - 1]) || (x < R - 1 && have[i + 1]) || (i >= R && have[i - R]) || (i < R * R - R && have[i + R])) front.push(i);
  }
  for (let p = 0; p < passes && front.length; p++) {
    const done = [];
    for (const i of front) {
      if (have[i]) continue;
      const x = i % R;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      const add = (j) => {
        r += d[j * 4];
        g += d[j * 4 + 1];
        b += d[j * 4 + 2];
        n++;
      };
      if (x > 0 && have[i - 1]) add(i - 1);
      if (x < R - 1 && have[i + 1]) add(i + 1);
      if (i >= R && have[i - R]) add(i - R);
      if (i < R * R - R && have[i + R]) add(i + R);
      if (!n) continue;
      d[i * 4] = r / n;
      d[i * 4 + 1] = g / n;
      d[i * 4 + 2] = b / n;
      d[i * 4 + 3] = 255;
      done.push(i);
    }
    for (const i of done) have[i] = 2;
    const next = [];
    for (const i of done) {
      const x = i % R;
      for (const j of [x > 0 ? i - 1 : -1, x < R - 1 ? i + 1 : -1, i >= R ? i - R : -1, i < R * R - R ? i + R : -1]) if (j >= 0 && !have[j]) next.push(j);
    }
    front = next;
  }
}

/** Most common opaque color of an image (the bare skin of a body texture). */
function dominantColor(d) {
  const hist = new Map();
  for (let i = 0; i < d.length; i += 4 * 97) {
    if (d[i + 3] < 200) continue;
    const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
    hist.set(k, (hist.get(k) || 0) + 1);
  }
  let best = 0;
  let bk = 0;
  for (const [k, v] of hist) if (v > best) ((best = v), (bk = k));
  return [((bk >> 10) & 31) * 8 + 4, ((bk >> 5) & 31) * 8 + 4, (bk & 31) * 8 + 4];
}

const cleanCache = new Map();
/**
 * A model's skin textures with its own underwear cleared to bare skin and the UV seams padded.
 * Depends only on the model, so it's computed once and shared by every copy of that model.
 */
function cleanSkin(ch, e, map, shadeTex, normTex, paint, islands, R) {
  const key = [ch.tplKey || map.uuid, e.name, paint ? 1 : 0, shadeTex ? shadeTex.uuid && 1 : 0, normTex ? 1 : 0, R].join('|');
  if (cleanCache.has(key)) return cleanCache.get(key);
  const job = (async () => {
    let erase = null;
    if (paint) {
      const c = document.createElement('canvas');
      c.width = c.height = R;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(map.image, 0, 0, R, R);
      const d = g.getImageData(0, 0, R, R).data;
      const [sr, sg, sb] = dominantColor(d);
      const mask = await unionMask(R);
      erase = new Uint8Array(R * R);
      for (let p = 0; p < R * R; p++) {
        if (!mask[p]) continue;
        const i = p * 4;
        if (Math.abs(d[i] - sr) + Math.abs(d[i + 1] - sg) + Math.abs(d[i + 2] - sb) > 45) erase[p] = 1;
      }
      // grow by a few pixels to take the soft, anti-aliased rim with it
      for (let pass = 0; pass < 3; pass++) {
        const grown = erase.slice();
        for (let y = 1; y < R - 1; y++)
          for (let x = 1; x < R - 1; x++) {
            const p = y * R + x;
            if (!erase[p] && mask[p] && (erase[p - 1] || erase[p + 1] || erase[p - R] || erase[p + R])) grown[p] = 1;
          }
        erase = grown;
      }
    }
    const one = (img, normal = false) => {
      const c = document.createElement('canvas');
      c.width = c.height = R;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, R, R);
      if (!erase && !islands) return c;
      const id = g.getImageData(0, 0, R, R);
      const d = id.data;
      if (erase) {
        const [sr, sg, sb] = normal ? [128, 128, 255] : dominantColor(d);
        for (let p = 0; p < R * R; p++) {
          if (!erase[p]) continue;
          const i = p * 4;
          d[i] = sr;
          d[i + 1] = sg;
          d[i + 2] = sb;
          d[i + 3] = 255;
        }
      }
      padIslands(id, islands, R);
      g.putImageData(id, 0, 0);
      return c;
    };
    const res = { map: one(map.image) };
    if (shadeTex) res.shade = one(shadeTex.image);
    if (normTex) {
      const t = new THREE.CanvasTexture(one(normTex.image, true));
      t.colorSpace = normTex.colorSpace;
      t.flipY = normTex.flipY;
      t.wrapS = normTex.wrapS;
      t.wrapT = normTex.wrapT;
      res.normal = t;
    }
    return res;
  })();
  cleanCache.set(key, job);
  return job;
}

/**
 * uw: { panty, bra, color }. cfg.underwear / cfg.bra: material names that hold the underwear (a body
 * skin material is painted over; any other material is replaced outright). R: texture resolution.
 * On a painted body, the old underwear is cleared from the color, shade and normal textures alike.
 */
export async function applyUnderwear(ch, uw, cfg = {}, R = 1024) {
  if (!ch.mats || !uw?.panty) return;
  const isSkin = (e) => SKIN_RE.test(e.name) && /body/i.test(e.name);
  const find = (nm) => nm && ch.mats.find((e) => e.name === nm && !/outline/i.test(e.m.name || ''));
  const body = ch.mats.find((e) => isSkin(e) && !/outline/i.test(e.m.name || '') && e.m.map);
  const auto = ch.mats.find((e) => /(under|inner|panty|panties|lingerie|bikini)/i.test(e.name) && !/outline/i.test(e.m.name || '') && e.m.map);
  const pantyMat = find(cfg.underwear) || auto || body;
  const braMat = uw.bra ? find(cfg.bra) || (cfg.bra ? null : auto && /bra|top|inner|under/i.test(auto.name) ? auto : null) || pantyMat : null;
  const targets = new Map();
  if (pantyMat) targets.set(pantyMat, ['panty']);
  if (braMat) targets.set(braMat, [...(targets.get(braMat) || []), 'bra']);
  const ratio = (cur, base) => {
    const t = new THREE.Color(1, 1, 1);
    if (cur && base) t.setRGB(cur.r / Math.max(1e-3, base.r), cur.g / Math.max(1e-3, base.g), cur.b / Math.max(1e-3, base.b));
    return t;
  };
  // drop the textures from a previous design on this character
  for (const t of ch._uwTex || []) t.dispose();
  ch._uwTex = [];
  for (const [e, parts] of targets) {
    const m = e.m;
    const map = m.map;
    if (!map || !map.image) continue;
    const paint = isSkin(e); // painted on the skin: keep the skin, clear the old underwear
    // the skin tint currently multiplied into the material colors gets baked into the textures instead
    const tint = paint ? ratio(m.color, e.base) : new THREE.Color(1, 1, 1);
    const shadeTex = paint && m.shadeMultiplyTexture && m.shadeMultiplyTexture !== map && m.shadeMultiplyTexture.image ? m.shadeMultiplyTexture : null;
    const shadeTint = paint ? ratio(m.shadeColorFactor, e.baseShade) : null;
    const normTex = paint && m.normalMap?.image ? m.normalMap : null;
    const islands = uvIslandMask(ch, m, R, map.flipY);
    // the slow part (finding and clearing the old underwear, padding seams) happens once per model
    const clean = await cleanSkin(ch, e, map, shadeTex, normTex, paint, islands, R);
    const overlays = [];
    for (const part of parts) {
      const name = part === 'panty' ? uw.panty : uw.bra;
      const img = await loadOverlay(part === 'panty' ? 'panties' : 'bras', name);
      const plain = /LegoBlack$/.test(name);
      const mask = plain && uw.pattern && uw.accent ? await patternMask(uw.pattern, R).catch(() => null) : null;
      overlays.push(tintedOverlay(img, plain ? uw.color : null, R, mask, uw.accent));
    }
    // per character: just the skin tint and the new design on top of the cleaned texture
    const build = (src, tintCol) => {
      const c = document.createElement('canvas');
      c.width = c.height = R;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(src, 0, 0, R, R);
      if (tintCol && tintCol.getHex() !== 0xffffff) {
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = '#' + tintCol.getHexString();
        g.fillRect(0, 0, R, R);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(src, 0, 0, R, R);
        g.globalCompositeOperation = 'source-over';
      }
      for (const ov of overlays) g.drawImage(ov, 0, 0);
      // bleed the finished colors (underwear included) well past the UV seams: zoomed out, the
      // smaller mip levels average across them and would otherwise show a skin-colored split
      if (islands && overlays.length) {
        const id = g.getImageData(0, 0, R, R);
        padIslands(id, islands, R, 16);
        g.putImageData(id, 0, 0);
      }
      return c;
    };
    const mk = (c, like) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = like.colorSpace;
      t.flipY = like.flipY;
      t.wrapS = like.wrapS;
      t.wrapT = like.wrapT;
      t.anisotropy = 4;
      (ch._uwTex ||= []).push(t);
      return t;
    };
    const set = { map: mk(build(clean.map, paint ? tint : null), map) };
    if (clean.shade) set.shade = mk(build(clean.shade, shadeTint), shadeTex);
    if (clean.normal) set.normal = clean.normal; // shared, never changes
    if (!ch._uwDispose) {
      ch._uwDispose = true;
      const prev = ch.dispose;
      ch.dispose = () => {
        prev?.();
        for (const t of ch._uwTex || []) t.dispose();
        ch._uwTex = [];
      };
    }
    const shadeSame = m.shadeMultiplyTexture && m.shadeMultiplyTexture === map;
    const shadeOld = m.shadeMultiplyTexture;
    const normOld = m.normalMap;
    for (const x of ch.mats) {
      // the outline material shares the texture
      if (x.m.map !== map) continue;
      x.m.map = set.map;
      if (shadeSame && x.m.shadeMultiplyTexture === map) x.m.shadeMultiplyTexture = set.map;
      else if (set.shade && x.m.shadeMultiplyTexture === shadeOld) x.m.shadeMultiplyTexture = set.shade;
      if (set.normal && x.m.normalMap === normOld) x.m.normalMap = set.normal;
      if (paint) {
        if (x.base && x.m.color) x.m.color.copy(x.base);
        if ((shadeSame || set.shade) && x.baseShade && x.m.shadeColorFactor) x.m.shadeColorFactor.copy(x.baseShade);
      } else {
        // a separate underwear mesh: the design's own shape and alpha decide what shows
        if (x.m.color) x.m.color.setRGB(1, 1, 1);
        x.m.transparent = false;
        x.m.alphaTest = 0.5;
      }
      x.m.needsUpdate = true;
      syncMtoon(x.m);
    }
  }
  ch.underwear = uw;
}
