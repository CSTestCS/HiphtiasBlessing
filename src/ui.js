import { sound } from './audio.js';
// HUD and dialog helpers.
const $ = (id) => document.getElementById(id);

export const ui = {
  hud: $('hud'),
  screen: $('screen'),
  tagLayer: $('tag-layer'),
  dialogOpen: false,

  showHUD(on) {
    this.hud.classList.toggle('hidden', !on);
    this.tagLayer.classList.toggle('hidden', !on);
  },

  setScreen(html, transparent = false) {
    // menus need the mouse cursor back
    if (html && document.pointerLockElement) document.exitPointerLock();
    // redrawing the same screen (an editor refreshing itself) keeps where you were scrolled to and
    // which sections were open
    const title = (h) => (/data-view="([^"]*)"/.exec(h || '') || /<h[12][^>]*>([^<]*)/.exec(h || '') || [])[1] || null;
    const same = html && title(html) && title(html) === title(this.screen.innerHTML);
    const scrollers = () => [this.screen, ...this.screen.querySelectorAll('.panel, .matlist')];
    const opens = () => [...this.screen.querySelectorAll('details:not(.swpick)')];
    const prevScroll = same ? scrollers().map((e) => e.scrollTop) : null;
    const prevOpen = same ? opens().map((d) => d.open) : null;
    this.screen.innerHTML = html;
    if (same) {
      const od = opens();
      if (od.length === prevOpen.length) od.forEach((d, i) => (d.open = prevOpen[i]));
      scrollers().forEach((e, i) => {
        if (prevScroll[i] != null) e.scrollTop = prevScroll[i];
      });
    }
    this.screen.classList.toggle('hidden', !html);
    this.screen.classList.toggle('transparent', transparent);
    this.screen.classList.remove('titlebg');
    return this.screen;
  },

  hideScreen() {
    this.screen.innerHTML = '';
    this.screen.classList.add('hidden');
  },

  toast(msg, kind = '', ms = 3500, sfx) {
    if (sfx !== null) sound.play(sfx || (kind === 'good' ? 'toastGood' : kind === 'bad' ? 'toastBad' : 'toast'), { minGap: 150 });
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => el.remove(), ms);
  },

  /**
   * Show a modal dialog laid out like a manga panel. options: [{label, value, cls}] -> resolves to value.
   * look: { name, draw(canvas) -> bool } draws the speaker's portrait; without it the panel is text only.
   */
  dialog(title, text, options = [{ label: 'Continue', value: true }], look = null) {
    return new Promise((resolve) => {
      this.dialogOpen = true;
      if (document.pointerLockElement) document.exitPointerLock();
      $('dialog-title').textContent = title;
      this.mangaText($('dialog-text'), text || '');
      let drawn = false;
      if (look && look.draw) {
        try {
          drawn = look.draw($('dialog-portrait'));
        } catch (e) {
          console.warn(e);
        }
      }
      $('dialog-panel').classList.toggle('noportrait', !drawn);
      $('dialog-who').textContent = drawn && look.name ? look.name : '';
      const box = $('dialog-options');
      box.innerHTML = '';
      if (!options || !options.length) options = [{ label: 'Continue', value: true }];
      options.forEach((o, i) => {
        const b = document.createElement('button');
        b.textContent = o.label;
        b.className = (o.cls || '') + (/^["“*]/.test(o.label) ? ' say' : '');
        if (o.disabled) b.disabled = true;
        b.onclick = () => {
          $('dialog').classList.add('hidden');
          this.dialogOpen = false;
          resolve(o.value);
          // still inside the click: the game may take the mouse back (unless another panel follows)
          if (this.onDialogClosed) this.onDialogClosed();
        };
        box.appendChild(b);
        if (i === 0) setTimeout(() => b.focus(), 50);
      });
      $('dialog').classList.remove('hidden');
      sound.play('panel');
    });
  },

  /** Chat log: everything said in the game. who: speaker name (or null for narration). */
  chat(who, text, opts = {}) {
    const box = $('chat-lines');
    if (!box || !text) return;
    const el = document.createElement('div');
    el.className = 'cl' + (who ? '' : ' narr') + (opts.you ? ' you' : '');
    const t = opts.time ? `<span class="t">${esc(opts.time)}</span>` : '';
    el.innerHTML = t + (who ? `<b>${esc(who)}:</b> ` : '') + esc(text).replace(/\n+/g, ' ');
    box.appendChild(el);
    while (box.children.length > 200) box.firstChild.remove();
    // older lines fade a little
    const n = box.children.length;
    for (let i = Math.max(0, n - 12); i < n; i++) box.children[i].classList.toggle('old', i < n - 4);
    if ($('chatlog').classList.contains('open')) box.scrollTop = box.scrollHeight;
  },

  /** Split text into narration boxes, speech bubbles (quoted lines) and hints (parenthesized). */
  mangaText(el, text) {
    el.innerHTML = '';
    const add = (cls, t) => {
      t = t.trim();
      if (!t) return;
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = t;
      if (cls.startsWith('mbub')) {
        if (t.length > 70) d.classList.add('long');
        if (/!\W*$/.test(t) && (t.match(/[A-Z]{3,}/) || t.split('!').length > 2)) d.classList.add('shout');
      }
      el.appendChild(d);
    };
    for (const para of text.split(/\n\s*\n/)) {
      const p = para.trim();
      if (!p) continue;
      if (/^\(.*\)$/s.test(p)) {
        add('mhint', p.slice(1, -1));
        continue;
      }
      let last = 0;
      const re = /“([^”]+)”|"([^"]+)"/g;
      let m;
      let narr = '';
      while ((m = re.exec(p))) {
        narr += p.slice(last, m.index);
        add('mcap', narr);
        narr = '';
        add('mbub', m[1] || m[2]);
        last = re.lastIndex;
      }
      add('mcap', narr + p.slice(last));
    }
  },

  clearChat() {
    const box = $('chat-lines');
    if (box) box.innerHTML = '';
  },

  toggleChat() {
    const c = $('chatlog');
    c.classList.toggle('open');
    $('chat-hint').textContent = c.classList.contains('open') ? 'L: close chat log' : 'L: expand chat log';
    const box = $('chat-lines');
    box.scrollTop = box.scrollHeight;
  },

  fade(on) {
    $('fade').classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, 420));
  },

  set(id, html) {
    const el = $(id);
    if (el && el._v !== html) {
      el.innerHTML = html;
      el._v = html;
    }
  },

  meter(id, frac) {
    $(id).style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
  },

  progress(frac) {
    $('hud-progress').classList.toggle('hidden', frac == null);
    if (frac != null) $('hud-progress-fill').style.width = frac * 100 + '%';
  },

  borrow(text) {
    $('hud-borrow').classList.toggle('hidden', !text);
    if (text) $('hud-borrow').textContent = text;
  },

  vignette(v) {
    $('vignette').style.boxShadow = `inset 0 0 160px 40px rgba(232,67,147,${(v * 0.6).toFixed(2)})`;
  },

  showComposure(on) {
    $('meter-composure').classList.toggle('hidden', !on);
  },
};

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
