// Minimap (heading-up, centered on the player) and a compass strip.
import { STREETS } from './levels/city.js';

const SIZE = 190;

export class Minimap {
  constructor() {
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.compass = document.getElementById('compass');
    this.level = null;
    this.bg = null;
  }

  setLevel(L) {
    if (this.level === L) return;
    this.level = L;
    const city = L.name === 'city';
    const b = L.bounds;
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    const s = (this.scale = city ? 2.2 : Math.max(4, Math.min(10, 150 / span)));
    const w = Math.ceil((b.maxX - b.minX) * s);
    const h = Math.ceil((b.maxZ - b.minZ) * s);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const X = (x) => (x - b.minX) * s;
    const Z = (z) => (z - b.minZ) * s;
    if (city) {
      g.fillStyle = '#b9b9b9';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#4a4a50';
      for (const v of STREETS) {
        g.fillRect(X(v - 5), 0, 10 * s, h);
        g.fillRect(0, Z(v - 5), w, 10 * s);
      }
      for (const o of L.occ) {
        if (o.maxY < 2.5) continue;
        g.fillStyle = '#6d6a75';
        g.fillRect(X(o.minX), Z(o.minZ), (o.maxX - o.minX) * s, (o.maxZ - o.minZ) * s);
      }
      for (const p of L.parks || []) {
        g.fillStyle = '#6ab04c';
        g.fillRect(X(p.x0), Z(p.z0), (p.x1 - p.x0) * s, (p.z1 - p.z0) * s);
      }
      for (const ln of L.lines || [])
        for (const st of ln.stops) {
          g.fillStyle = ln.color;
          g.beginPath();
          g.arc(X(st.x), Z(st.z), 4, 0, Math.PI * 2);
          g.fill();
        }
      g.font = 'bold 13px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const [k, pl] of Object.entries(L.places || {})) {
        const icon = k === 'home' ? '⌂' : k === 'work' ? '★' : '●';
        g.fillStyle = k === 'home' ? '#55efc4' : k === 'work' ? '#ffd36e' : '#ff7eb6';
        g.fillText(icon, X(pl.door.x), Z(pl.door.z));
      }
    } else {
      g.fillStyle = '#20202c';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#c9c4b8';
      const step = L.nav ? L.nav.step : 0.8;
      for (const n of L.nav ? L.nav.nodes : []) g.fillRect(X(n.x - step / 2), Z(n.z - step / 2), step * s + 0.5, step * s + 0.5);
      g.fillStyle = '#5c5a66';
      for (const c2 of L.colliders) {
        if (c2.h < 0.6) continue;
        g.fillRect(X(c2.minX), Z(c2.minZ), Math.max(1, (c2.maxX - c2.minX) * s), Math.max(1, (c2.maxZ - c2.minZ) * s));
      }
      g.font = '10px sans-serif';
      g.textAlign = 'center';
      g.fillStyle = '#2d3436';
      for (const r of L.rooms || []) if (r.label) g.fillText(r.label.slice(0, 14), X(r.cx), Z(r.cz));
    }
    this.bg = c;
  }

  draw(game) {
    const L = game.level;
    if (!L || !this.bg) return;
    const ctx = this.ctx;
    const p = game.player;
    const s = this.scale;
    const b = L.bounds;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#15151f';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.translate(SIZE / 2, SIZE / 2);
    const yaw = game.cam.yaw;
    ctx.rotate(-Math.PI / 2 - Math.atan2(Math.cos(yaw), Math.sin(yaw)));
    const ox = (p.x - b.minX) * s;
    const oz = (p.z - b.minZ) * s;
    ctx.drawImage(this.bg, -ox, -oz);
    const W = (x, z) => [(x - p.x) * s, (z - p.z) * s];
    // buses
    for (const bus of game.buses?.buses || []) {
      const [x, z] = W(bus.x, bus.z);
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(-bus.yaw);
      ctx.fillStyle = bus.line.color;
      ctx.fillRect(-1.4 * s, -5.6 * s, 2.8 * s, 11.2 * s);
      ctx.restore();
    }
    // people
    for (const n of game.npcs) {
      const [x, z] = W(n.x, n.z);
      if (Math.abs(x) > SIZE || Math.abs(z) > SIZE) continue;
      ctx.fillStyle = n.kind === 'manager' ? '#ff4757' : n.kind === 'coworker' ? (n.sneaking ? '#a29bfe' : '#54a0ff') : '#dfe6e9';
      ctx.beginPath();
      ctx.arc(x, z, n.kind === 'coworker' || n.kind === 'manager' ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fill();
      if (n.suspicion > 0.3) {
        ctx.strokeStyle = '#ffd32a';
        ctx.stroke();
      }
    }
    // objective
    const t = game.objectiveTarget();
    if (t) {
      let [x, z] = W(t.x, t.z);
      const d = Math.hypot(x, z);
      const R = SIZE / 2 - 10;
      if (d > R) {
        x = (x / d) * R;
        z = (z / d) * R;
      }
      ctx.fillStyle = '#55efc4';
      ctx.beginPath();
      ctx.arc(x, z, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#003d2e';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
    // player arrow (always pointing up = camera forward; rotate by body vs camera)
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(-(p.yaw - yaw));
    ctx.fillStyle = '#ff7eb6';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
    this.drawCompass(game, t);
  }

  /** Whole-area map, north up, scaled to fit the canvas. */
  drawFull(game, canvas) {
    const L = game.level;
    if (!L || !this.bg || !canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#12121c';
    ctx.fillRect(0, 0, W, H);
    const bw = this.bg.width;
    const bh = this.bg.height;
    const k = Math.min((W - 40) / bw, (H - 70) / bh);
    const ox = (W - bw * k) / 2;
    const oy = (H - bh * k) / 2 + 15;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.bg, ox, oy, bw * k, bh * k);
    const b = L.bounds;
    const s = this.scale * k;
    const P = (x, z) => [ox + (x - b.minX) * s, oy + (z - b.minZ) * s];
    // buses and people
    for (const bus of game.buses?.buses || []) {
      const [x, z] = P(bus.x, bus.z);
      ctx.fillStyle = bus.line.color;
      ctx.beginPath();
      ctx.arc(x, z, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const n of game.npcs) {
      const [x, z] = P(n.x, n.z);
      ctx.fillStyle = n.kind === 'manager' ? '#ff4757' : n.kind === 'coworker' ? (n.sneaking ? '#a29bfe' : '#54a0ff') : '#dfe6e9';
      ctx.beginPath();
      ctx.arc(x, z, n.kind === 'coworker' || n.kind === 'manager' ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // crisp room labels indoors
    if (L.name !== 'city') {
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      for (const r of L.rooms || []) {
        if (!r.label) continue;
        const [x, z] = P(r.cx, r.cz);
        const w = ctx.measureText(r.label).width + 8;
        ctx.fillStyle = 'rgba(20,20,32,.8)';
        ctx.fillRect(x - w / 2, z - 9, w, 16);
        ctx.fillStyle = '#ffeaa7';
        ctx.fillText(r.label, x, z + 3);
      }
    }
    // labels for places in the city
    if (L.name === 'city') {
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      for (const [kk, pl] of Object.entries(L.places || {})) {
        const [x, z] = P(pl.door.x, pl.door.z);
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        const name = kk === 'home' ? 'Home' : kk === 'work' ? 'Work' : kk === 'poolgate' ? 'Pool gate' : pl.label.replace(/^Enter /, '');
        const w = ctx.measureText(name).width + 8;
        ctx.fillRect(x - w / 2, z - 22, w, 15);
        ctx.fillStyle = '#fff';
        ctx.fillText(name, x, z - 11);
      }
    }
    // objective
    const t = game.objectiveTarget();
    if (t) {
      const [x, z] = P(t.x, t.z);
      ctx.strokeStyle = '#55efc4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, z, 10 + Math.sin(performance.now() / 200) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // you
    const p = game.player;
    const [px, pz] = P(p.x, p.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.PI - p.yaw);
    ctx.fillStyle = '#ff7eb6';
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MAP  (M or Esc to close)   N ↑', 16, 26);
  }

  drawCompass(game, t) {
    const el = this.compass;
    const yaw = game.cam.yaw;
    const W = el.clientWidth || 420;
    const span = Math.PI * 0.9; // visible angle
    const rel = (bearing) => {
      let d = bearing - yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    };
    const pos = (bearing) => W / 2 - (rel(bearing) / span) * W;
    // bearings: north = -z (yaw PI), east = +x (yaw PI/2), south = +z (0), west = -x (-PI/2)
    const marks = [['N', Math.PI], ['NE', Math.PI * 0.75], ['E', Math.PI / 2], ['SE', Math.PI / 4], ['S', 0], ['SW', -Math.PI / 4], ['W', -Math.PI / 2], ['NW', -Math.PI * 0.75]];
    let html = '';
    for (const [lbl, br] of marks) {
      const x = pos(br);
      if (x < -20 || x > W + 20) continue;
      html += `<span class="cmark ${lbl.length === 1 ? 'major' : ''}" style="left:${x.toFixed(0)}px">${lbl}</span>`;
    }
    if (t) {
      const br = Math.atan2(t.x - game.player.x, t.z - game.player.z);
      let x = pos(br);
      const off = x < 0 || x > W;
      x = Math.max(8, Math.min(W - 8, x));
      const d = Math.hypot(t.x - game.player.x, t.z - game.player.z);
      html += `<span class="cobj" style="left:${x.toFixed(0)}px">${off ? (x < W / 2 ? '◀' : '▶') : '▼'}<small>${Math.round(d)}m</small></span>`;
    }
    if (el._h !== html) {
      el.innerHTML = html;
      el._h = html;
    }
  }
}
