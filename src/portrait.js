// Dialog portraits: a quick posed snapshot of a character, drawn into a 2D canvas.
// Uses the game's own renderer (no second WebGL context): the character is moved into a small
// studio scene for one frame, rendered into a corner of the main canvas, copied out, and put back.
import * as THREE from 'three';

const studio = new THREE.Scene();
studio.add(new THREE.HemisphereLight(0xffffff, 0x8a8aa8, 1.5));
const key = new THREE.DirectionalLight(0xffffff, 1.7);
key.position.set(1.5, 2.5, 3);
// characters already drawn in the shadowed game world only render correctly when this scene also
// has a shadow-casting light (shader state has to match), so the key light casts a tiny shadow
key.castShadow = true;
key.shadow.mapSize.set(256, 256);
studio.add(key);
const rim = new THREE.DirectionalLight(0xffe9f2, 0.9);
rim.position.set(-2, 2, -2);
studio.add(rim);
const cam = new THREE.PerspectiveCamera(26, 0.75, 0.05, 30);
const bgCache = new Map();

/** Manga panel backgrounds: speed lines for shock, screentone dots, a holy glow, or plain paper. */
function background(kind) {
  if (bgCache.has(kind)) return bgCache.get(kind);
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 512;
  const g = c.getContext('2d', { willReadFrequently: true });
  const W = c.width;
  const H = c.height;
  g.fillStyle = kind === 'holy' ? '#fff8e6' : kind === 'dark' ? '#e3e0ea' : '#fbfaf6';
  g.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H * 0.42;
  if (kind === 'speed' || kind === 'dark') {
    // radial speed lines converging on the face
    g.strokeStyle = kind === 'dark' ? 'rgba(40,30,60,.55)' : 'rgba(0,0,0,.5)';
    for (let i = 0; i < 150; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = 110 + Math.random() * 90;
      g.lineWidth = 0.6 + Math.random() * 2.2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * 600, cy + Math.sin(a) * 600);
      g.stroke();
    }
  } else if (kind === 'tone') {
    // halftone gradient at the bottom of the panel
    for (let y = 0; y < H; y += 8) {
      const k = Math.max(0, (y - H * 0.45) / (H * 0.55));
      if (k <= 0) continue;
      g.fillStyle = 'rgba(70,70,90,.35)';
      for (let x = (y / 8) % 2 ? 4 : 0; x < W; x += 8) {
        g.beginPath();
        g.arc(x, y, 0.4 + k * 2.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (kind === 'holy') {
    const grd = g.createRadialGradient(cx, H * 0.3, 10, cx, H * 0.3, H * 0.7);
    grd.addColorStop(0, 'rgba(255,236,170,1)');
    grd.addColorStop(1, 'rgba(255,248,230,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,205,110,.35)';
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      g.lineWidth = 6 + (i % 3) * 5;
      g.beginPath();
      g.moveTo(cx, H * 0.3);
      g.lineTo(cx + Math.cos(a) * 700, H * 0.3 + Math.sin(a) * 700);
      g.stroke();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,${200 + Math.random() * 55},120,${0.5 + Math.random() * 0.5})`;
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = 1 + Math.random() * 3;
      g.beginPath();
      g.moveTo(x, y - r * 2);
      g.lineTo(x + r * 0.5, y);
      g.lineTo(x, y + r * 2);
      g.lineTo(x - r * 0.5, y);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  bgCache.set(kind, t);
  return t;
}

/**
 * Draw char into canvas2d posed as described.
 * look: { pose, mood, frame: 'bust' | 'full', bg, turn }
 * restore: called afterwards to put the main view back (usually game.render()).
 */
let portraitRT = null;
let portraitBuf = null;
export function drawPortrait(renderer, char, look, canvas2d, restore) {
  if (!char || !char.root) return false;
  const root = char.root;
  const saved = {
    parent: root.parent,
    pos: root.position.clone(),
    rot: root.rotation.clone(),
    visible: root.visible,
    mood: { ...(char.mood || {}) },
    propVis: char.prop ? char.prop.visible : null,
    overHead: char.propOverHead,
  };
  try {
    studio.background = background(look.bg || 'plain');
    studio.add(root);
    root.position.set(0, look.frame === 'full' && look.pose === 'float' ? 0.12 : 0, 0);
    root.rotation.set(0, look.turn ?? 0.45, 0);
    root.visible = true;
    if (char.prop) char.prop.visible = false;
    char.setMood(look.mood || {});
    // settle into the pose and expression
    for (let i = 0; i < 45; i++) char.update(1 / 30, { speed: 0, pose: look.pose || null });
    root.updateMatrixWorld(true);
    const h = char.height || 1.6;
    const W = canvas2d.width;
    const H = canvas2d.height;
    cam.aspect = W / H;
    if (look.frame === 'full') {
      cam.fov = 24;
      const d = (h * 0.62) / Math.tan((cam.fov * Math.PI) / 360);
      cam.position.set(0, h * 0.55, d);
      cam.lookAt(0, h * 0.5, 0);
    } else {
      cam.fov = 22;
      const d = (h * 0.3) / Math.tan((cam.fov * Math.PI) / 360);
      cam.position.set(0, h * 0.86, d);
      cam.lookAt(0, h * 0.8, 0);
    }
    cam.updateProjectionMatrix();
    // render off-screen and copy the pixels through the CPU: this keeps working after a GPU reset
    // (which wipes GPU-backed 2D canvases and can leave the main canvas' buffer unreadable)
    if (renderer.getContext().isContextLost()) return false;
    if (!portraitRT || portraitRT.width !== W || portraitRT.height !== H) {
      portraitRT?.dispose();
      portraitRT = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
      portraitRT.texture.colorSpace = THREE.SRGBColorSpace;
      portraitBuf = new Uint8Array(W * H * 4);
    }
    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(portraitRT);
    renderer.shadowMap.needsUpdate = true;
    renderer.clear();
    renderer.render(studio, cam);
    renderer.readRenderTargetPixels(portraitRT, 0, 0, W, H, portraitBuf);
    renderer.setRenderTarget(prevRT);
    const ctx = canvas2d.getContext('2d', { willReadFrequently: true });
    const img = ctx.createImageData(W, H);
    const row = W * 4;
    // WebGL rows run bottom-up
    for (let y = 0; y < H; y++) img.data.set(portraitBuf.subarray((H - 1 - y) * row, (H - y) * row), y * row);
    ctx.putImageData(img, 0, 0);
    return true;
  } catch (e) {
    console.warn('portrait failed', e);
    return false;
  } finally {
    if (saved.parent) saved.parent.add(root);
    else studio.remove(root);
    root.position.copy(saved.pos);
    root.rotation.copy(saved.rot);
    root.visible = saved.visible;
    if (char.prop && saved.propVis != null) char.prop.visible = saved.propVis;
    char.setMood(saved.mood);
    char.resetPhysics?.();
    if (restore) restore();
  }
}
