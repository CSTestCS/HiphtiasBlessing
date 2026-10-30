// Gamepad support (Xbox layout / the browser's "standard" mapping).
//   In play: left stick moves, right stick looks, RT runs, LT aims, A interacts (hold), B crouches,
//   X drops the held item, Y ties on a makeshift skirt, LB holds the item overhead, RB cycles
//   requests, View opens the map, Menu pauses, R3 opens the chat log.
//   In menus and dialogs: D-pad / left stick moves between controls, A selects, B goes back,
//   right stick scrolls, left/right change dropdowns and sliders.
//   Text fields open an on-screen keyboard: A types, X backspace, Y space, LB/RB move the cursor,
//   LT (or L3) shift, Menu or "Done" confirms, B closes.
import { ui } from './ui.js';

const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const KEYMAP = { [BTN.A]: 'KeyE', [BTN.B]: 'KeyC', [BTN.X]: 'KeyG', [BTN.Y]: 'KeyF', [BTN.LB]: 'KeyT', [BTN.RB]: 'Tab', [BTN.VIEW]: 'KeyM', [BTN.R3]: 'KeyL' };
const DEAD = 0.3;

const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));

let pad = null;
export function initGamepad(getGame) {
  pad = new PadInput(getGame);
  window.addEventListener('gamepadconnected', (e) => ui.toast?.(`Controller connected: ${shortName(e.gamepad.id)}`, '', 3000, null));
  return pad;
}

/** What the game currently sees, for the Settings screen. */
export function controllerStatus() {
  let pads = [];
  try {
    pads = [...(navigator.getGamepads?.() || [])].filter((g) => g && g.connected);
  } catch (_) {}
  if (!pads.length) return 'No controller detected. Plug one in and press any button on it.';
  return pads.map((g) => `${g.index === pad?.active ? '▶ ' : ''}${shortName(g.id)}${g.mapping === 'standard' ? '' : ' (unrecognized layout)'}`).join(' · ');
}
function shortName(id) {
  return String(id || 'Controller').replace(/\s*\(.*?Vendor.*?\)\s*/i, ' ').trim().slice(0, 60);
}

class PadInput {
  constructor(getGame) {
    this.getGame = getGame;
    this.prev = [];
    this.moveKeys = new Set();
    this.navT = 0;
    this.last = performance.now();
    this.kb = null; // the on-screen keyboard, when open
    this.used = false;
    this.rest = {};
    this.active = null;
    this.pads = [];
    requestAnimationFrame(this.loop);
  }

  loop = () => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const gp = this.pickPad();
    if (!gp) return;
    const raw = read(gp);
    const b = raw.b;
    const down = (i) => b[i] && !this.prev[i];
    const up = (i) => !b[i] && this.prev[i];
    const dz = (v) => (Math.abs(v) > DEAD ? v : 0);
    const lx = dz(raw.lx);
    const ly = dz(raw.ly);
    const rx = dz(raw.rx);
    const ry = dz(raw.ry);
    if (b.some(Boolean) || lx || ly || rx || ry) this.used = true;
    if (!this.used) return (this.prev = b);
    const game = this.getGame();
    const menus = !!this.kb || ui.dialogOpen || !ui.screen.classList.contains('hidden') || !game || !game.running || game.paused || game.ended;
    if (this.kb) this.keyboard(b, down, lx, ly, dt);
    else if (menus) {
      this.releasePlay(game);
      this.navigate(b, down, lx, ly, ry, dt, game);
    } else {
      this.lastFocus = null; // menus opened later start at their top
      this.play(game, b, down, up, lx, ly, rx, ry, dt);
    }
    this.prev = b;
  };

  /**
   * Windows often lists more than one "controller" (Steam's virtual pad, a duplicate driver entry,
   * a keyboard or headset with a gamepad interface...), and the first one may never send anything.
   * Follow whichever one was last actually pressed or moved; until then prefer a standard layout.
   */
  pickPad() {
    let pads = [];
    try {
      pads = [...(navigator.getGamepads?.() || [])].filter((g) => g && g.connected);
    } catch (_) {}
    this.pads = pads;
    if (!pads.length) return null;
    for (const g of pads) {
      const r = read(g);
      const rest = (this.rest[g.index] ||= r.axes.slice());
      // an axis that sits off-center from the start (some devices report triggers or a hat as -1)
      // only counts as movement once it changes
      const moved = r.axes.some((v, i) => Math.abs(v - rest[i]) > 0.5 && Math.abs(v) > 0.5);
      if (r.b.some(Boolean) || moved) {
        if (this.active !== g.index) this.prev = r.b.map(() => false);
        this.active = g.index;
        break;
      }
    }
    return pads.find((g) => g.index === this.active) || pads.find((g) => g.mapping === 'standard') || pads[0];
  }

  // ---- in play ------------------------------------------------------------------------------
  play(game, b, down, up, lx, ly, rx, ry, dt) {
    // left stick: walk (pushed far = run, like holding Shift)
    const want = new Set();
    if (ly < -DEAD) want.add('KeyW');
    if (ly > DEAD) want.add('KeyS');
    if (lx < -DEAD) want.add('KeyA');
    if (lx > DEAD) want.add('KeyD');
    if (b[BTN.RT] || b[BTN.L3]) want.add('ShiftLeft');
    for (const k of this.moveKeys) if (!want.has(k)) game.keys.delete(k);
    for (const k of want) game.keys.add(k);
    this.moveKeys = want;
    // right stick: look around
    if (rx || ry) {
      game.cam.yaw -= rx * 2.6 * dt;
      game.cam.pitch = Math.max(-1.45, Math.min(1.5, game.cam.pitch + ry * 1.8 * dt));
    }
    // LT: aim (the character turns with the camera)
    if (down(BTN.LT)) game.aiming = true;
    if (up(BTN.LT)) game.aiming = false;
    for (const [i, code] of Object.entries(KEYMAP)) {
      if (down(+i)) key('keydown', code);
      if (up(+i)) key('keyup', code);
    }
    if (down(BTN.MENU)) key('keydown', 'Escape');
  }

  releasePlay(game) {
    if (!game) return;
    for (const k of this.moveKeys) game.keys.delete(k);
    this.moveKeys.clear();
    if (this.prev[BTN.A]) key('keyup', 'KeyE');
  }

  // ---- menus and dialogs ----------------------------------------------------------------------
  controls() {
    if (ui.dialogOpen) return [...document.querySelectorAll('#dialog-options button:not([disabled])')];
    const root = ui.screen;
    return [...root.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]):not([type=hidden]), summary, .swatches .swatch')].filter(visible);
  }

  navigate(b, down, lx, ly, ry, dt, game) {
    const list = this.controls();
    if (!list.length) return;
    let cur = list.includes(document.activeElement) ? document.activeElement : null;
    // a new menu or dialog: highlight its first control so A works straight away
    // (after an editor redraws itself, the same control again, or the one nearest where it was,
    // without scrolling the page)
    const view = ui.dialogOpen ? 'dialog' : viewName();
    if (!cur) {
      const last = this.lastFocus && this.lastFocus.view === view ? this.lastFocus : null;
      let pick = last && last.key && list.find((e) => focusKey(e) === last.key);
      if (!pick && last && !ui.dialogOpen) {
        let bd = Infinity;
        for (const e of list) {
          const r = e.getBoundingClientRect();
          if (r.bottom < 0 || r.top > innerHeight) continue;
          const d = Math.hypot(r.left + r.width / 2 - last.x, r.top + r.height / 2 - last.y);
          if (d < bd) ((bd = d), (pick = e));
        }
      }
      const safe = (e) => e.tagName === 'BUTTON' && !e.classList.contains('secondary') && !e.classList.contains('danger') && inView(e);
      cur = pick || (ui.dialogOpen && list[0]) || list.find(safe) || list.find(inView) || list[0];
      focusEl(cur, !pick);
      // this press only lit up the menu: don't also move or click on it
      this.navT = 0.32;
      this.navDir = b[BTN.UP] || ly < -0.6 ? 'up' : b[BTN.DOWN] || ly > 0.6 ? 'down' : b[BTN.LEFT] || lx < -0.6 ? 'left' : b[BTN.RIGHT] || lx > 0.6 ? 'right' : null;
      if (down(BTN.A)) return;
    }
    {
      const r = cur.getBoundingClientRect();
      this.lastFocus = { view, key: focusKey(cur), x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    // direction from the D-pad or the stick (repeats while held)
    let dir = null;
    if (b[BTN.UP] || ly < -0.6) dir = 'up';
    else if (b[BTN.DOWN] || ly > 0.6) dir = 'down';
    else if (b[BTN.LEFT] || lx < -0.6) dir = 'left';
    else if (b[BTN.RIGHT] || lx > 0.6) dir = 'right';
    this.navT -= dt;
    if (!dir) this.navT = 0;
    if (dir && this.navT <= 0) {
      this.navT = this.navDir === dir ? 0.12 : 0.32;
      this.navDir = dir;
      // dropdowns and sliders change with left/right
      if (cur && (dir === 'left' || dir === 'right') && (cur.tagName === 'SELECT' || cur.type === 'range')) adjust(cur, dir === 'right' ? 1 : -1);
      else focusEl(spatial(cur, list, dir) || cur);
    }
    if (!dir) this.navDir = null;
    // right stick scrolls the panel
    if (ry) {
      const panel = (document.activeElement && document.activeElement.closest('.panel, .mflow')) || ui.screen.querySelector('.panel') || document.querySelector('.mflow');
      if (panel) panel.scrollTop += ry * 900 * dt;
    }
    if (down(BTN.A)) {
      if (cur.tagName === 'INPUT' && /^(text|search|)$/.test(cur.type || '')) return this.openKeyboard(cur);
      if (cur.tagName === 'SELECT') return adjust(cur, 1);
      cur.click();
    }
    if (down(BTN.B)) {
      if (ui.dialogOpen) return;
      if (game && game.paused && game.running) return key('keydown', 'Escape');
      const back = [...ui.screen.querySelectorAll('button')].find((e) => /back|cancel|close/i.test(e.id + ' ' + e.textContent) && visible(e));
      if (back) back.click();
    }
    if (down(BTN.MENU) && game && game.running && !ui.dialogOpen) key('keydown', 'Escape');
  }

  // ---- on-screen keyboard -------------------------------------------------------------------
  openKeyboard(input) {
    const rows = ['1234567890', 'qwertyuiop', "asdfghjkl'", 'zxcvbnm,.-'];
    const el = document.createElement('div');
    el.id = 'vkb';
    el.innerHTML = `<div class="vkb-box"><div class="vkb-text"></div><div class="vkb-keys"></div>
      <div class="vkb-help">A type · X backspace · Y space · LB/RB move cursor · LT shift · Menu done · B close</div></div>`;
    document.body.appendChild(el);
    const keys = [...rows.map((r) => [...r]), ['shift', 'space', 'back', 'done']];
    this.kb = { input, el, keys, r: 1, c: 0, shift: false, pos: input.value.length };
    this.drawKeyboard();
  }

  drawKeyboard() {
    const k = this.kb;
    const label = (ch) => ({ shift: '⇧ Shift', space: 'Space', back: '⌫', done: 'Done' }[ch] || (k.shift ? ch.toUpperCase() : ch));
    k.el.querySelector('.vkb-keys').innerHTML = k.keys
      .map((row, r) => `<div class="vkb-row">${row.map((ch, c) => `<span class="vkb-key ${r === k.r && c === k.c ? 'on' : ''} ${ch.length > 1 ? 'wide' : ''} ${ch === 'shift' && k.shift ? 'lit' : ''}">${label(ch)}</span>`).join('')}</div>`)
      .join('');
    const v = k.input.value;
    k.el.querySelector('.vkb-text').innerHTML = `${esc(v.slice(0, k.pos))}<span class="vkb-caret"></span>${esc(v.slice(k.pos))}`;
  }

  keyboard(b, down, lx, ly, dt) {
    const k = this.kb;
    const type = (s) => {
      const v = k.input.value;
      const max = k.input.maxLength > 0 ? k.input.maxLength : 40;
      if (v.length >= max) return;
      k.input.value = v.slice(0, k.pos) + s + v.slice(k.pos);
      k.pos += s.length;
      k.input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const backspace = () => {
      if (!k.pos) return;
      const v = k.input.value;
      k.input.value = v.slice(0, k.pos - 1) + v.slice(k.pos);
      k.pos--;
      k.input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    let dir = null;
    if (b[BTN.UP] || ly < -0.6) dir = [-1, 0];
    else if (b[BTN.DOWN] || ly > 0.6) dir = [1, 0];
    else if (b[BTN.LEFT] || lx < -0.6) dir = [0, -1];
    else if (b[BTN.RIGHT] || lx > 0.6) dir = [0, 1];
    this.navT -= dt;
    if (!dir) this.navT = 0;
    if (dir && this.navT <= 0) {
      this.navT = 0.16;
      k.r = (k.r + dir[0] + k.keys.length) % k.keys.length;
      k.c = Math.min(k.keys[k.r].length - 1, Math.max(0, dir[0] ? Math.round((k.c / Math.max(1, k.keys[k.r - dir[0]]?.length || 10)) * k.keys[k.r].length) : (k.c + dir[1] + k.keys[k.r].length) % k.keys[k.r].length));
    }
    if (down(BTN.A)) {
      const ch = k.keys[k.r][k.c];
      if (ch === 'shift') k.shift = !k.shift;
      else if (ch === 'space') type(' ');
      else if (ch === 'back') backspace();
      else if (ch === 'done') return this.closeKeyboard(true);
      else {
        type(k.shift ? ch.toUpperCase() : ch);
        if (k.shift) k.shift = false;
      }
    }
    if (down(BTN.X)) backspace();
    if (down(BTN.Y)) type(' ');
    if (down(BTN.LB)) k.pos = Math.max(0, k.pos - 1);
    if (down(BTN.RB)) k.pos = Math.min(k.input.value.length, k.pos + 1);
    if (down(BTN.LT) || down(BTN.L3)) k.shift = !k.shift;
    if (down(BTN.MENU)) return this.closeKeyboard(true);
    if (down(BTN.B)) return this.closeKeyboard(false);
    this.drawKeyboard();
  }

  closeKeyboard() {
    const k = this.kb;
    k.el.remove();
    k.input.dispatchEvent(new Event('change', { bubbles: true }));
    this.kb = null;
    focusEl(k.input);
  }
}

// ---- helpers ------------------------------------------------------------------------------------
/**
 * Buttons and sticks in the standard (Xbox) layout. Controllers the browser doesn't recognize
 * usually still put the face buttons first and the left stick on axes 0/1; their right stick is
 * on axes 2/5 or 3/4, and the D-pad is often a "hat" axis.
 */
function read(g) {
  const b = [...g.buttons].map((x) => !!x && (x.pressed || x.value > 0.5));
  const axes = [...g.axes];
  if (g.mapping === 'standard') return { b, axes, lx: axes[0] || 0, ly: axes[1] || 0, rx: axes[2] || 0, ry: axes[3] || 0 };
  while (b.length < 16) b.push(false);
  let rx = axes[2] || 0;
  let ry = axes[3] || 0;
  if (axes.length >= 6) ((rx = axes[2] || 0), (ry = axes[5] || 0));
  // a hat axis: 8 positions spread over -1..1, and a value above 1 when centered
  const hat = axes.length > 9 ? axes[9] : null;
  if (hat != null && Math.abs(hat) <= 1) {
    const p = Math.round((hat + 1) * 3.5); // 0 = up, clockwise
    if (p === 7 || p === 0 || p === 1) b[12] = true;
    if (p >= 1 && p <= 3) b[15] = true;
    if (p >= 3 && p <= 5) b[13] = true;
    if (p >= 5 && p <= 7) b[14] = true;
  }
  return { b, axes, lx: axes[0] || 0, ly: axes[1] || 0, rx, ry };
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
function visible(e) {
  const r = e.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  // inside a folded <details>? (its summary is still reachable)
  const d = e.closest('details');
  if (d && !d.open && !e.closest('summary') && e.tagName !== 'SUMMARY') return false;
  return true;
}
function focusKey(e) {
  if (e.id) return '#' + e.id;
  const a = [...e.attributes].filter((x) => x.name.startsWith('data-')).map((x) => `${x.name}=${x.value}`).join(',');
  return a ? e.tagName + '[' + a + ']' : null;
}
function viewName() {
  const v = ui.screen.querySelector('[data-view]');
  if (v) return 'v:' + v.getAttribute('data-view');
  const h = ui.screen.querySelector('h1, h2');
  return 'h:' + (h ? h.textContent.trim() : '');
}
function inView(e) {
  const r = e.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight;
}
function focusEl(e, scroll = true) {
  if (!e) return;
  document.querySelectorAll('.padfocus').forEach((x) => x.classList.remove('padfocus'));
  e.classList.add('padfocus');
  if (!e.hasAttribute('tabindex') && !/^(BUTTON|INPUT|SELECT|SUMMARY)$/.test(e.tagName)) e.setAttribute('tabindex', '-1');
  e.focus({ preventScroll: true });
  if (scroll) e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
/** The control in that direction: nearest along it, preferring ones roughly in line. */
function spatial(cur, list, dir) {
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best = null;
  let bs = Infinity;
  for (const e of list) {
    if (e === cur) continue;
    const r = e.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const dx = x - ax;
    const dy = y - ay;
    const main = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    const side = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    if (main <= 2) continue;
    const s = main + side * 2.5;
    if (s < bs) ((bs = s), (best = e));
  }
  return best;
}
function adjust(el, d) {
  if (el.tagName === 'SELECT') {
    const n = el.options.length;
    if (!n) return;
    el.selectedIndex = (el.selectedIndex + d + n) % n;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el.type === 'range') {
    const step = +el.step || 1;
    el.value = String(Math.min(+el.max, Math.max(+el.min, +el.value + d * step)));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
