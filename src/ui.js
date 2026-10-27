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
    this.screen.innerHTML = html;
    this.screen.classList.toggle('hidden', !html);
    this.screen.classList.toggle('transparent', transparent);
    return this.screen;
  },

  hideScreen() {
    this.screen.innerHTML = '';
    this.screen.classList.add('hidden');
  },

  toast(msg, kind = '', ms = 3500) {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => el.remove(), ms);
  },

  /** Show a modal dialog. options: [{label, value, cls}] -> resolves to value. */
  dialog(title, text, options = [{ label: 'Continue', value: true }]) {
    return new Promise((resolve) => {
      this.dialogOpen = true;
      if (document.pointerLockElement) document.exitPointerLock();
      $('dialog-title').textContent = title;
      $('dialog-text').textContent = text;
      const box = $('dialog-options');
      box.innerHTML = '';
      options.forEach((o, i) => {
        const b = document.createElement('button');
        b.textContent = o.label;
        if (o.cls) b.className = o.cls;
        if (o.disabled) b.disabled = true;
        b.onclick = () => {
          $('dialog').classList.add('hidden');
          this.dialogOpen = false;
          resolve(o.value);
        };
        box.appendChild(b);
        if (i === 0) setTimeout(() => b.focus(), 50);
      });
      $('dialog').classList.remove('hidden');
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
