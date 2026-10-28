// Title screen backdrop: Celesti floating in a holy glow, and the player character from the last
// played save caught completely off guard. Runs its own small renderer behind the menu and shuts
// itself down as soon as the title menu goes away.
import * as THREE from 'three';
import { createCharacter, addAngelic } from './character.js';
import { sound } from './audio.js';

let active = null;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,248,220,1)');
  grd.addColorStop(0.35, 'rgba(255,225,150,.55)');
  grd.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  // soft rays
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    g.strokeStyle = 'rgba(255,230,170,.08)';
    g.lineWidth = 10 + (i % 3) * 6;
    g.beginPath();
    g.moveTo(128, 128);
    g.lineTo(128 + Math.cos(a) * 180, 128 + Math.sin(a) * 180);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sparkleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,236,170,.9)');
  grd.addColorStop(1, 'rgba(255,220,140,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Show the title backdrop. celesti / player: createCharacter options (player may be null).
 * isTitleUp(): returns false once the title menu is gone, which stops and frees the scene.
 */
export async function startTitleScene({ celesti, player, isTitleUp }) {
  stopTitleScene();
  const me = { running: true, chars: [] };
  active = me;
  const canvas = document.createElement('canvas');
  canvas.id = 'title-canvas';
  document.body.appendChild(canvas);
  me.canvas = canvas;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  me.renderer = r;
  r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  r.setSize(window.innerWidth, window.innerHeight, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 50);
  const placeCam = () => {
    const aspect = window.innerWidth / window.innerHeight;
    cam.aspect = aspect;
    // pull back on narrow windows so both characters stay in frame
    // wide screens: the menu sits on the left, so frame the pair right of center
    const wide = aspect >= 1.2;
    const dist = wide ? 5.6 : 7.2;
    const cx = wide ? -0.55 : 0.6;
    cam.position.set(cx, 1.2, dist);
    cam.lookAt(cx, 1.12, 0);
    cam.updateProjectionMatrix();
    r.setSize(window.innerWidth, window.innerHeight, false);
  };
  placeCam();
  me.onResize = placeCam;
  window.addEventListener('resize', placeCam);
  scene.add(new THREE.HemisphereLight(0xfff6ee, 0x6a5a88, 1.5));
  const keyL = new THREE.DirectionalLight(0xffffff, 1.6);
  keyL.position.set(-1.5, 2.5, 3);
  scene.add(keyL);
  const holy = new THREE.PointLight(0xffd98a, 2.5, 6, 1.5);
  holy.position.set(1.3, 2.4, 0.8);
  scene.add(holy);

  // holy glow behind Celesti, and drifting sparkles
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.set(1.3, 1.55, -0.9);
  glow.material.opacity = 0.6;
  scene.add(glow);
  const N = 70;
  const pos = new Float32Array(N * 3);
  const seeds = [];
  for (let i = 0; i < N; i++) {
    seeds.push({ a: Math.random() * Math.PI * 2, r: 0.3 + Math.random() * 1.1, y: Math.random() * 2.6, s: 0.15 + Math.random() * 0.4 });
  }
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sparkles = new THREE.Points(spGeo, new THREE.PointsMaterial({ map: sparkleTexture(), size: 0.09, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff }));
  scene.add(sparkles);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ color: 0x2a2140, transparent: true, opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  let cel = null;
  let pl = null;
  try {
    cel = await createCharacter(celesti);
    addAngelic(cel);
    cel.root.position.set(1.3, 0.4, -0.1);
    cel.root.rotation.y = -0.6;
    cel.setMood({ happy: 0.7 });
    scene.add(cel.root);
    me.chars.push(cel);
  } catch (e) {
    console.warn('title: Celesti failed to load', e);
  }
  if (!me.running) return;
  if (player) {
    try {
      pl = await createCharacter(player);
      pl.setLegwear(false);
      pl.root.position.set(-0.05, 0, 0.35);
      pl.root.rotation.y = 0.4;
      pl.setMood({ surprised: 1, sad: 0.35 });
      scene.add(pl.root);
      me.chars.push(pl);
    } catch (e) {
      console.warn('title: player failed to load', e);
    }
  }
  if (!me.running) {
    for (const c of me.chars) c.dispose?.();
    return;
  }
  let last = performance.now();
  const t0 = last;
  const loop = () => {
    if (!me.running) return;
    if (isTitleUp && !isTitleUp()) {
      stopTitleScene();
      return;
    }
    requestAnimationFrame(loop);
    sound.loop('title', 1);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    if (cel) {
      cel.root.position.y = 0.4 + Math.sin(t * 1.1) * 0.07;
      cel.root.rotation.y = -0.6 + Math.sin(t * 0.4) * 0.06;
      // now and then she raises a hand in blessing
      cel.update(dt, { speed: 0, pose: Math.sin(t * 0.35) > 0.55 ? 'bless' : 'float' });
    }
    if (pl) {
      // frozen in shock, with the odd flinch toward covering up
      const flinch = Math.sin(t * 0.5 + 1) > 0.75;
      pl.update(dt, { speed: 0, pose: flinch ? 'cover' : 'startled', headYaw: flinch ? -0.2 : 0.6 });
      pl.root.position.x = -0.05 + Math.sin(t * 23) * 0.002; // trembling
    }
    glow.material.opacity = 0.55 + Math.sin(t * 1.3) * 0.1;
    for (let i = 0; i < N; i++) {
      const s = seeds[i];
      const y = (s.y + t * s.s) % 2.8;
      const a = s.a + t * 0.3;
      pos[i * 3] = 1.3 + Math.cos(a) * s.r;
      pos[i * 3 + 1] = 0.2 + y;
      pos[i * 3 + 2] = Math.sin(a) * s.r * 0.6;
    }
    spGeo.attributes.position.needsUpdate = true;
    r.render(scene, cam);
  };
  loop();
}

export function stopTitleScene() {
  const me = active;
  if (!me) return;
  active = null;
  me.running = false;
  sound.loop('title', 0);
  window.removeEventListener('resize', me.onResize);
  for (const c of me.chars) {
    try {
      c.dispose?.();
    } catch (_) {}
  }
  me.renderer?.dispose();
  me.canvas?.remove();
}
