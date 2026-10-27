// Characters: either an imported VRM model or a simple built-in "mannequin".
// Both use the same bone naming (VRM humanoid, T-pose, facing +Z) so one
// procedural animator drives everything.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const LEGWEAR_RE = /(bottom|pants|trouser|skirt|short|jean|slack|legging|tights|kneesock|stocking)/i;

function makeLoader() {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  return loader;
}

function cloneBuffer(buf) {
  // GLTFLoader may detach/transfer buffers; always parse a copy.
  return buf.slice(0);
}

/** Parse a VRM and return the list of material names plus a guess of which are legwear. */
export async function inspectVRM(buffer) {
  const gltf = await makeLoader().parseAsync(cloneBuffer(buffer), '');
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('This file is not a valid VRM model.');
  const names = new Set();
  vrm.scene.traverse((o) => {
    if (o.isMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m && names.add(cleanName(m.name)));
    }
  });
  const list = [...names].filter(Boolean);
  const auto = list.filter((n) => LEGWEAR_RE.test(n));
  const meta = vrm.meta || {};
  VRMUtils.deepDispose(vrm.scene);
  return { materials: list, autoLegwear: auto, title: meta.name || meta.title || 'VRM model' };
}

function cleanName(n) {
  return (n || '').replace(/ \(Instance\)/g, '').trim();
}

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

/**
 * opts: { vrm: ArrayBuffer|null, legwearMaterials: string[]|null, underwearOverlay: bool,
 *         colors: {skin,hair,top,bottom,under}, legwearType: 'pants'|'skirt' }
 */
export async function createCharacter(opts = {}) {
  if (opts.vrm) {
    try {
      return await createVRMCharacter(opts);
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
    this.coverS = 0;
    this.bob = 0;
    this.legLen = 0.85;
    this.upperLegLen = 0.43;
    this.lowerLegLen = 0.42;
    this.hipRestY = 0.92;
    this.height = 1.65;
  }
  /** Height of the hips (where the underwear is) when standing. */
  get hipHeight() {
    return this.hipRestY;
  }
  bone() {
    return null;
  }
  setEmotion() {}
  resetPhysics() {}

  animate(dt, a) {
    const speed = a.speed || 0;
    this.crouchS = damp(this.crouchS, a.crouch ? 1 : 0, 10, dt);
    this.sitS = damp(this.sitS, a.sit ? 1 : 0, 8, dt);
    this.carryS = damp(this.carryS, a.carry ? 1 : 0, 10, dt);
    // When exposed and not carrying, the character instinctively tries to cover up.
    this.coverS = damp(this.coverS, a.cover && !a.carry && !a.sit ? 1 : 0, 6, dt);
    const amp = Math.min(speed / 1.6, 1.4);
    this.phase += dt * speed * 3.4;
    const s = Math.sin(this.phase);
    const c = this.crouchS;
    const sit = this.sitS;
    const carry = this.carryS;
    const cover = this.coverS;

    const B = (n) => this.bone(n);
    const set = (n, x = 0, y = 0, z = 0) => {
      const b = B(n);
      if (b) b.rotation.set(x, y, z);
    };

    // Legs
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

    // Torso
    const t = performance.now() / 1000;
    const breathe = Math.sin(t * 1.8) * 0.02;
    set('spine', 0.35 * c + 0.05 * amp + 0.12 * cover, Math.sin(this.phase) * 0.06 * amp, 0);
    set('chest', breathe, 0, 0);
    set('neck', -0.15 * c, 0, 0);
    set('head', -0.1 * c - 0.15 * cover, 0, 0);

    // Arms: lower from T-pose, swing while walking, reach forward when carrying,
    // hands in front of the hips when trying to cover up.
    const down = this.armDown || 1.25;
    const armSwing = s * 0.45 * amp * (1 - carry) * (1 - cover * 0.8);
    const carryFwd = -1.0 * carry;
    const coverFwd = -0.45 * cover;
    const coverIn = 0.35 * cover;
    set('leftUpperArm', -armSwing + carryFwd + coverFwd, -coverIn, -down + 0.15 * c + 0.1 * carry + 0.2 * cover);
    set('rightUpperArm', armSwing + carryFwd + coverFwd, coverIn, down - 0.15 * c - 0.1 * carry - 0.2 * cover);
    const elbow = 0.25 + 0.9 * carry + 0.6 * cover;
    set('leftLowerArm', 0, -elbow, 0);
    set('rightLowerArm', 0, elbow, 0);

    // Hip height
    const a1 = crouchThigh + sitThigh;
    const a2 = crouchKnee + sitKnee;
    const h = this.upperLegLen * Math.cos(a1) + this.lowerLegLen * Math.cos(a2 + a1);
    let drop = this.upperLegLen + this.lowerLegLen - h;
    drop += Math.abs(Math.cos(this.phase)) * 0.025 * amp * (1 - sit) - 0.02 * amp;
    if (sit > 0.01) drop = drop * (1 - sit) + (this.hipRestY - 0.5) * sit;
    const hips = B('hips');
    if (hips) {
      hips.position.y = this.hipBaseY - drop;
      hips.rotation.set(0, 0, 0);
    }
  }
}

// ---------------------------------------------------------------------------
// VRM character

async function createVRMCharacter(opts) {
  const gltf = await makeLoader().parseAsync(cloneBuffer(opts.vrm), '');
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('Not a VRM');
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  const ch = new CharacterBase();
  ch.vrm = vrm;
  ch.root.add(vrm.scene);

  const legwearSet = new Set(
    (opts.legwearMaterials && opts.legwearMaterials.length ? opts.legwearMaterials : null) || []
  );
  const useAuto = !opts.legwearMaterials;
  ch.legwearMeshes = [];
  vrm.scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const isLeg = mats.some((m) => {
        const n = cleanName(m && m.name);
        return useAuto ? LEGWEAR_RE.test(n) : legwearSet.has(n);
      });
      if (isLeg) ch.legwearMeshes.push(o);
    }
  });

  const hum = vrm.humanoid;
  ch.bone = (n) => hum.getNormalizedBoneNode(n);
  vrm.scene.updateMatrixWorld(true);
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
  ch.armDown = 1.38;
  ch.hipRestY = hipsP ? hipsP.y : 0.9;
  if (lul && lll && lf) {
    ch.upperLegLen = lul.distanceTo(lll);
    ch.lowerLegLen = lll.distanceTo(lf);
  }
  ch.height = head ? head.y + 0.12 : 1.6;
  ch.eyeHeight = head ? head.y + 0.05 : 1.5;

  // Optional simple underwear overlay (for models whose body texture has none).
  if (opts.underwearOverlay !== false && lul && rul && hipsP) {
    const hipW = lul.distanceTo(rul);
    const r = hipW * 0.62 + 0.05;
    const top = hipsP.y + 0.04;
    const bottom = lul.y - 0.07;
    const hgt = Math.max(0.08, top - bottom);
    const mat = new THREE.MeshToonMaterial({ color: new THREE.Color(opts.colors?.under || '#ff9ff3') });
    const g = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, hgt, 20, 1, true), mat);
    cyl.position.y = (top + bottom) / 2;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat);
    cap.scale.y = 0.45;
    cap.position.y = bottom;
    g.add(cyl, cap);
    g.scale.z = 0.78;
    g.position.set(hipsP.x, 0, hipsP.z);
    mat.side = THREE.DoubleSide;
    g.traverse((o) => (o.castShadow = true));
    vrm.scene.add(g);
    g.updateMatrixWorld(true);
    const rawHips = hum.getRawBoneNode('hips');
    rawHips.attach(g);
    ch.underwearMesh = g;
    g.visible = false;
  }

  ch.setLegwear = (on) => {
    ch.legwearOn = on;
    ch.legwearMeshes.forEach((m) => (m.visible = on));
    if (ch.underwearMesh) ch.underwearMesh.visible = !on;
  };
  ch.setEmotion = (name, v) => {
    try {
      vrm.expressionManager?.setValue(name, v);
    } catch (_) {}
  };
  ch.resetPhysics = () => {
    try {
      vrm.springBoneManager?.reset();
    } catch (_) {}
  };
  ch.update = (dt, a) => {
    ch.animate(dt, a);
    vrm.update(Math.min(dt, 1 / 20));
  };
  ch.dispose = () => VRMUtils.deepDispose(vrm.scene);
  ch.isVRM = true;
  ch.setLegwear(true);
  return ch;
}

// ---------------------------------------------------------------------------
// Built-in mannequin (used when no VRM is imported, and for customers/pedestrians)

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
  const col = Object.assign(
    { skin: '#f3d2b8', hair: '#2a1d16', top: '#ffffff', bottom: '#2d3436', under: '#ff9ff3' },
    opts.colors || {}
  );
  const scale = opts.scale || 1;
  const skirt = opts.legwearType === 'skirt';
  const ch = new CharacterBase();
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
  const lua = mk('leftUpperArm', chest, 0.19, 0.18, 0);
  const lla = mk('leftLowerArm', lua, 0.27, 0, 0);
  const rua = mk('rightUpperArm', chest, -0.19, 0.18, 0);
  const rla = mk('rightLowerArm', rua, -0.27, 0, 0);
  const lul = mk('leftUpperLeg', hips, 0.1, -0.04, 0);
  const lll = mk('leftLowerLeg', lul, 0, -0.43, 0);
  const lft = mk('leftFoot', lll, 0, -0.42, 0);
  const rul = mk('rightUpperLeg', hips, -0.1, -0.04, 0);
  const rll = mk('rightLowerLeg', rul, 0, -0.43, 0);
  const rft = mk('rightFoot', rll, 0, -0.42, 0);

  // Torso
  const pelvis = add(hips, new THREE.SphereGeometry(0.17, 16, 10), skirt ? col.under : col.bottom, 0, 0, 0);
  pelvis.scale.set(1.05, 0.62, 0.75);
  const belly = add(spine, capsule(0.15, 0.12), col.top, 0, 0.1, 0);
  belly.scale.z = 0.75;
  const torso = add(chest, capsule(0.17, 0.14), col.top, 0, 0.1, 0);
  torso.scale.set(1.05, 1, 0.72);
  add(neck, capsule(0.05, 0.06), col.skin, 0, 0.03, 0);
  add(head, new THREE.SphereGeometry(0.12, 18, 14), col.skin, 0, 0.11, 0.01);
  const hair = add(head, new THREE.SphereGeometry(0.13, 18, 14), col.hair, 0, 0.14, -0.015);
  hair.scale.set(1.02, 0.9, 1.02);
  const hairBack = add(head, capsule(0.11, 0.12), col.hair, 0, 0.05, -0.05);
  hairBack.scale.z = 0.7;
  const eyeGeo = new THREE.SphereGeometry(0.016, 8, 6);
  add(head, eyeGeo, '#1b1b2f', 0.042, 0.115, 0.11);
  add(head, eyeGeo, '#1b1b2f', -0.042, 0.115, 0.11);
  ch.blush = [
    add(head, new THREE.SphereGeometry(0.022, 8, 6), '#ff6b81', 0.065, 0.085, 0.1),
    add(head, new THREE.SphereGeometry(0.022, 8, 6), '#ff6b81', -0.065, 0.085, 0.1),
  ];
  ch.blush.forEach((b) => (b.visible = false));

  // Arms (T-pose along X)
  add(lua, capsule(0.05, 0.2), col.top, 0.13, 0, 0, Math.PI / 2);
  add(lla, capsule(0.042, 0.19), col.skin, 0.12, 0, 0, Math.PI / 2);
  add(rua, capsule(0.05, 0.2), col.top, -0.13, 0, 0, Math.PI / 2);
  add(rla, capsule(0.042, 0.19), col.skin, -0.12, 0, 0, Math.PI / 2);

  // Legs
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
  ch.upperLegLen = 0.43;
  ch.lowerLegLen = 0.42;
  ch.height = 1.68 * scale;
  ch.eyeHeight = 1.55 * scale;

  ch.setLegwear = (on) => {
    ch.legwearOn = on;
    if (skirt) {
      skirtMesh.visible = on;
    } else {
      pelvis.material = toon(on ? col.bottom : col.under);
      legMeshes.forEach((m) => (m.material = toon(on ? col.bottom : col.skin)));
    }
  };
  ch.setEmotion = (name, v) => {
    if (name === 'blush') ch.blush.forEach((b) => (b.visible = v > 0.3));
  };
  ch.update = (dt, a) => ch.animate(dt, a);
  ch.dispose = () => {};
  ch.setLegwear(true);
  return ch;
}

export function randomColors(rng = Math.random) {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  return {
    skin: pick(['#f3d2b8', '#e8b98f', '#c98e62', '#8d5a3b', '#5c3a24']),
    hair: pick(['#2a1d16', '#5a3a22', '#b98a4a', '#e6c87a', '#7b3f00', '#999999', '#c0392b']),
    top: pick(['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#ecf0f1', '#34495e', '#e67e22', '#1abc9c']),
    bottom: pick(['#2d3436', '#34495e', '#1e3799', '#6d4c41', '#7f8c8d', '#2c2c54']),
    under: '#ffffff',
  };
}
