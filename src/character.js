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
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
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

  /** a: {speed, crouch, sit, carry, lookDown} */
  animate(dt, a) {
    const speed = a.speed || 0;
    this.crouchS = damp(this.crouchS, a.crouch ? 1 : 0, 10, dt);
    this.sitS = damp(this.sitS, a.sit ? 1 : 0, 8, dt);
    this.carryS = damp(this.carryS, a.carry ? 1 : 0, 10, dt);
    const amp = Math.min(speed / 1.6, 1.4);
    this.phase += dt * speed * 3.4;
    const s = Math.sin(this.phase);
    const c = this.crouchS * (1 - this.sitS);
    const sit = this.sitS;
    const carry = this.carryS;
    const set = (n, x = 0, y = 0, z = 0) => {
      const b = this.bone(n);
      if (b) b.rotation.set(x, y, z);
    };
    const crouchThigh = -1.15 * c;
    const crouchKnee = 1.9 * c;
    const sitThigh = -1.5 * sit;
    const sitKnee = 1.5 * sit;
    const swing = 0.55 * amp * (1 - sit);
    const lKnee = Math.max(0, -Math.cos(this.phase)) * 0.9 * amp;
    const rKnee = Math.max(0, Math.cos(this.phase)) * 0.9 * amp;
    set('leftUpperLeg', crouchThigh + sitThigh + s * swing, 0, 0);
    set('rightUpperLeg', crouchThigh + sitThigh - s * swing, 0, 0);
    set('leftLowerLeg', crouchKnee + sitKnee + lKnee * (1 - sit), 0, 0);
    set('rightLowerLeg', crouchKnee + sitKnee + rKnee * (1 - sit), 0, 0);
    set('leftFoot', -0.4 * c, 0, 0);
    set('rightFoot', -0.4 * c, 0, 0);
    const t = performance.now() / 1000;
    const shy = Math.min(1, (this.moodS.sad || 0) + (this.moodS.surprised || 0) * 0.5);
    set('spine', 0.35 * c + 0.05 * amp + 0.05 * shy, Math.sin(this.phase) * 0.06 * amp, 0);
    set('chest', Math.sin(t * 1.8 + this.root.id) * 0.02, 0, 0);
    set('neck', -0.15 * c, 0, 0);
    set('head', -0.1 * c + 0.12 * shy + (a.lookDown ? 0.3 : 0), a.headYaw || 0, 0);
    // arms: relaxed at the sides, swing while walking, forward when carrying/working
    const down = this.armDown;
    const armSwing = s * 0.45 * amp * (1 - carry);
    const carryFwd = -0.75 * carry;
    set('leftUpperArm', -armSwing + carryFwd, 0, -down + 0.15 * c + 0.1 * carry);
    set('rightUpperArm', armSwing + carryFwd, 0, down - 0.15 * c - 0.1 * carry);
    const elbow = 0.2 + 0.9 * carry;
    set('leftLowerArm', 0, -elbow, 0);
    set('rightLowerArm', 0, elbow, 0);
    const a1 = crouchThigh + sitThigh;
    const a2 = crouchKnee + sitKnee;
    const h = this.upperLegLen * Math.cos(a1) + this.lowerLegLen * Math.cos(a2 + a1);
    let drop = this.upperLegLen + this.lowerLegLen - h;
    drop += Math.abs(Math.cos(this.phase)) * 0.025 * amp * (1 - sit) - 0.02 * amp;
    if (sit > 0.01) drop = drop * (1 - sit) + (this.hipRestY / (this.root.scale.y || 1) - 0.5) * sit;
    const hips = this.bone('hips');
    if (hips) {
      hips.position.y = this.hipBaseY - drop;
      hips.rotation.set(0, 0, 0);
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
    const hips = this.bone('hips');
    let y = this.hipRestY;
    if (hips) {
      hips.getWorldPosition(_v);
      y = _v.y - this.root.getWorldPosition(_v2).y;
    }
    const s = this.root.scale.y || 1;
    const u = this.prop.userData;
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
          depthWrite: m.depthWrite,
        };
      }
      const o = e.orig;
      const isSkin = SKIN_RE.test(e.name);
      const isHair = HAIR_RE.test(e.name);
      if (o.color && m.color) m.color.copy(o.color).multiplyScalar(1 - (isSkin ? 0.03 : isHair ? 0.25 : 0.18) * w);
      if (o.rim && m.parametricRimColorFactor) {
        m.parametricRimColorFactor.copy(o.rim).lerp(new THREE.Color(0.55, 0.6, 0.65), w * (isSkin ? 0.55 : 0.8));
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
        m.opacity = (o.opacity ?? 1) * (1 - 0.8 * see); // never below 20% opacity
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
  ch.wetSet = new Set(opts.wetMaterials || []);
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
    mats.forEach((m) => m && ch.mats.push({ m, leg: isLeg, name: cleanName(m.name) }));
  });
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
    ch.legwearMeshes.forEach((m) => (m.visible = on && !m.userData.hiddenByClothes));
    if (ch.underwearMesh) ch.underwearMesh.visible = !on && !ch.borrowed;
    if (ch._bodyHidden || ch.borrowed) refreshBodyHiding(ch);
  };
  applyTints(ch, opts);
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
  for (const { m, leg, name } of ch.mats) {
    if (/outline/i.test(m.name || '')) continue;
    if (leg) mulColor(m, opts.tintBottom || rnd?.bottom || col.bottom, raw && !opts.tintBottom);
    else if (SKIN_RE.test(name)) mulColor(m, rnd?.skin || col.skin, raw);
    else if (HAIR_RE.test(name)) mulColor(m, rnd?.hair || col.hair, raw);
    else if (IRIS_RE.test(name)) mulColor(m, rnd?.eye || col.eye, raw);
    else if (CLOTH_RE.test(name) && !/shoe/i.test(name)) mulColor(m, opts.tintTop || rnd?.top || col.top, raw && !opts.tintTop);
    else if (/shoe/i.test(name)) mulColor(m, rnd?.shoe || col.shoe, raw);
  }
}

export const SKIN_TONES = ['#ffe3cf', '#f6d1b6', '#e8b98f', '#d29a6e', '#b07a52', '#8a5a3a', '#6b4430'];
function randomCivilianTints() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return {
    skin: pick(SKIN_TONES),
    hair: pick(['#3b2a20', '#5a3a22', '#2a1d16', '#e6c87a', '#b5651d', '#c0392b', '#a29bfe', '#ff9ff3', '#9e9e9e', '#1a1a1a', '#d9b380']),
    eye: pick(['#3498db', '#27ae60', '#8e44ad', '#e67e22', '#795548', '#5d4037', '#2c3e50']),
    top: pick(['#ff7675', '#74b9ff', '#55efc4', '#ffeaa7', '#a29bfe', '#fd79a8', '#636e72', '#ffffff', '#2d3436', '#e17055', '#00b894']),
    bottom: pick(['#2d3436', '#34495e', '#1e3799', '#6d4c41', '#b33939', '#7f8c8d', '#c8a27a']),
    shoe: pick(['#2d3436', '#ffffff', '#6d4c41', '#b33939']),
  };
}

function finishVRMChar(ch) {
  ch.isVRM = true;
  ch.setEmotion = () => {};
  ch.setLegwear(true);
}

async function createFullVRM(opts) {
  const gltf = await makeLoader().parseAsync(opts.vrm.slice(0), '');
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('Not a VRM');
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  const ch = new CharacterBase();
  ch.vrm = vrm;
  ch.root.add(vrm.scene);
  setupVRMChar(ch, vrm.scene, vrm.humanoid, opts);
  ch.expressions = vrm.expressionManager || null;
  ch.resetPhysics = () => {
    try {
      vrm.springBoneManager?.reset();
    } catch (_) {}
  };
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
  // MToon only uploads alphaTest/opacity uniforms in material.update(); copies must call it too,
  // otherwise cut-out parts of clothes render as solid (black) polygons
  const mtoons = [];
  scene.traverse((o) => {
    if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && m.isMToonMaterial && m.update) mtoons.push(m);
  });
  ch.update = (dt, a) => {
    ch.animate(dt, a);
    ch.updateProp();
    hum.update();
    if (em) em.update();
    for (const m of mtoons) m.update(dt);
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
    const inv = D.body.bindMatrixInverse;
    geo.applyMatrix4(inv);
    pos.needsUpdate = true;
    si.needsUpdate = true;
    sw.needsUpdate = true;
    const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => {
      const c = m.clone();
      fixTransparency(c);
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
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const nm = cleanName(mats[0].name);
    const isLeg = legSet ? legSet.has(nm) : LEGWEAR_RE.test(nm);
    if (isLeg) ch.legwearMeshes.push(m);
    mats.forEach((mm) => ch.mats.push({ m: mm, leg: isLeg, name: cleanName(mm.name) }));
  }
  ch.legwearMeshes = ch.legwearMeshes.filter((m) => !m.userData.hiddenByClothes);
  ch.setLegwear(ch.legwearOn);
  refreshBodyHiding(ch);
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
  return {
    skin: pick(SKIN_TONES),
    hair: pick(['#2a1d16', '#5a3a22', '#b98a4a', '#e6c87a', '#7b3f00', '#999999', '#c0392b', '#6c5ce7', '#ff7eb6']),
    top: pick(['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#ecf0f1', '#34495e', '#e67e22', '#1abc9c']),
    bottom: pick(['#2d3436', '#34495e', '#1e3799', '#6d4c41', '#7f8c8d', '#2c2c54']),
    under: pick(['#ffffff', '#ff9ff3', '#74b9ff', '#ffeaa7', '#2d3436']),
    eye: pick(['#1b1b2f', '#2980b9', '#27ae60', '#8e44ad', '#6d4c41']),
  };
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
