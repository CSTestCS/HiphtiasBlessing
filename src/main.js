// App shell: title screen, civilian & Celesti model managers, the character /
// job / coworker creator, the daily outfit screen, save/continue and end screens.
import * as THREE from 'three';
import { ui, esc } from './ui.js';
import { storage, newId } from './storage.js';
import { JOBS, PERSONALITIES, DEFAULT_COWORKER_NAMES, DEFAULT_PERSONALITIES, COLORS, ROLE_NAMES, WEEKDAYS, weekday, DEFAULT_SETTINGS, BUNDLED } from './data.js';
import { createCharacter, inspectVRM, randomColors, addAngelic, clearTemplates } from './character.js';
import { Game, controlsTable } from './game.js';
import { listSlots, loadSlot, createSlot, writeProfile, deleteSlot, otherSlotPeople } from './saves.js';
import { modelBuffer, modelKey } from './assets.js';
import { startTitleScene, stopTitleScene } from './title.js';
import { sound, applyVolumeSettings, volumeSlidersHTML, bindVolumeSliders } from './audio.js';

const blobCache = new Map();
let game = null;

/** Model buffer for {asset} (bundled) or {key} (imported) models. */
async function getModel(model) {
  const k = modelKey(model);
  if (!k) return null;
  if (blobCache.has(k)) return blobCache.get(k);
  const b = await modelBuffer(model);
  if (b) blobCache.set(k, b);
  return b;
}

async function getSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, (await storage.get('settings')) || {});
}
async function putSettings(s) {
  await storage.set('settings', s);
}

// ---------------------------------------------------------------------------
// Profile helpers
/** A bundled body for a gender (white-textured models that take color tints). */
function bundledBody(gender, older = false) {
  const list = BUNDLED.bodies.filter((b) => !gender || b.gender === gender);
  const b = list.find((x) => /old/i.test(x.asset) === older) || list[0] || BUNDLED.bodies[0];
  return { asset: b.asset, title: b.title, tintable: true, legwearMaterials: null, underwearOverlay: false, wetMaterials: null };
}

function newOutfit(legwearType = 'pants', colors = randomColors(), gender = null, older = false) {
  return { model: gender ? bundledBody(gender, older) : null, legwearType, colors };
}

const randGender = () => (Math.random() < 0.5 ? 'female' : 'male');

/** Upgrade profiles from v0.1 (single model per character, no manager). */
function migrateProfile(p) {
  if (!p) return p;
  if (p.player) {
    for (const d of [p.player, p.manager, ...(p.coworkers || [])]) if (d && !d.gender) d.gender = null;
    return p;
  }
  const wrap = (src) => ({ model: src.model || null, legwearType: src.legwearType || 'pants', colors: src.colors || randomColors() });
  return {
    name: p.name,
    job: p.job,
    player: { outfits: [wrap(p)] },
    coworkers: (p.coworkers || []).map((c) => ({ name: c.name, personality: c.personality, outfits: [wrap(c)] })),
    manager: { name: 'Ms. Harper', outfits: [newOutfit('skirt', { ...randomColors(), top: '#2d3436', bottom: '#2d3436' })] },
  };
}

// ---------------------------------------------------------------------------
// Preview renderer (used in creator, outfit screen and model managers)
class Previewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, canvas.clientWidth / canvas.clientHeight, 0.1, 50);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 1.8);
    d.position.set(2, 3, 4);
    this.scene.add(d);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x3d3d6b }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.char = null;
    this.rot = 0;
    this.legwear = true;
    this.running = true;
    this.token = 0;
    this.last = performance.now();
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.rot += dt * 0.6;
      if (this.char) {
        this.char.root.rotation.y = Math.sin(this.rot) * 0.9;
        this.char.update(dt, { speed: 0 });
      }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
  async show(opts, extra) {
    const tok = ++this.token;
    const ch = await createCharacter(opts);
    if (tok !== this.token) {
      ch.dispose();
      return;
    }
    if (extra) extra(ch);
    if (this.char) {
      this.scene.remove(this.char.root);
      this.char.dispose();
    }
    this.char = ch;
    ch.setLegwear(this.legwear);
    this.scene.add(ch.root);
    const h = ch.height || 1.65;
    this.camera.position.set(0, h * 0.6, h * 2.6);
    this.camera.lookAt(0, h * 0.52, 0);
  }
  setLegwear(on) {
    this.legwear = on;
    if (this.char) this.char.setLegwear(on);
  }
  dispose() {
    this.running = false;
    if (this.char) this.char.dispose();
    this.renderer.dispose();
  }
}
let previewer = null;
function killPreview() {
  if (previewer) previewer.dispose();
  previewer = null;
}

async function outfitOpts(o, tint = {}, gender = null) {
  const m = o.model;
  return {
    vrm: m ? await getModel(m) : null,
    full: true,
    legwearMaterials: m ? m.legwearMaterials || null : null,
    underwearOverlay: m ? !!m.underwearOverlay : true,
    colors: o.colors,
    tintable: !!(m && (m.tintable || m.asset)),
    legwearType: tint.legwearType || o.legwearType,
    tintTop: tint.top || null,
    tintBottom: tint.bottom || null,
    wetMaterials: m?.wetMaterials || [],
    gender,
    clothes: o.clothesFrom ? { vrm: await getModel(o.clothesFrom), key: modelKey(o.clothesFrom), legwearMaterials: o.clothesFrom.legwearMaterials || null } : null,
  };
}

async function importVRM(file) {
  const buf = await file.arrayBuffer();
  const info = await inspectVRM(buf);
  const key = 'vrm-' + newId();
  await storage.putBlob(key, buf);
  blobCache.set(key, buf);
  // a VRoid model normally has underwear in its body texture, so no overlay by default
  return { key, title: info.title || file.name, file: file.name, materials: info.materials, legwearMaterials: info.autoLegwear, underwearOverlay: false, wetMaterials: [] };
}

/** Fill in the material list of a bundled model (for the parts checkboxes). */
async function ensureMaterials(model) {
  if (!model || model.materials) return;
  const info = await inspectVRM(await getModel(model));
  model.materials = info.materials;
  if (!model.legwearMaterials) model.legwearMaterials = info.autoLegwear;
}

function pickFiles(multiple = false) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.vrm,.glb';
    inp.multiple = multiple;
    inp.onchange = () => resolve([...inp.files]);
    inp.click();
  });
}

function swatches(kind, current, attr, list = COLORS[kind]) {
  return `<div class="swatches">${list
    .map((c) => `<div class="swatch ${c === current ? 'on' : ''}" style="background:${c || 'repeating-linear-gradient(45deg,#888 0 4px,#ccc 4px 8px)'}" data-${attr}="${c || ''}" title="${c ? '' : 'Original colors'}"></div>`)
    .join('')}</div>`;
}

function matList(model, prefix, field = 'legwearMaterials') {
  if (!model || !model.materials) return '';
  const cur = model[field] || [];
  return `<div class="matlist">${model.materials
    .map((m, i) => `<label><input type="checkbox" data-${prefix}="${i}" ${cur.includes(m) ? 'checked' : ''}/> ${esc(m)}</label>`)
    .join('')}</div>`;
}

function bindMatList(s, model, prefix, onChange, field = 'legwearMaterials') {
  s.querySelectorAll(`[data-${prefix}]`).forEach((el) => {
    el.onchange = () => {
      const name = model.materials[+el.getAttribute('data-' + prefix)];
      const set = new Set(model[field] || []);
      if (el.checked) set.add(name);
      else set.delete(name);
      model[field] = [...set];
      onChange();
    };
  });
}

// ---------------------------------------------------------------------------
// Title
const slotLine = (m) => `${esc(m.name)} · ${esc(JOBS[m.job]?.label || m.job)} · Day ${m.day} (${WEEKDAYS[weekday(m.day)]})${m.done ? ' · ✦ won' : ''}`;

async function showTitle() {
  killPreview();
  ui.showHUD(false);
  let slots = [];
  try {
    slots = await listSlots();
  } catch (e) {
    console.warn(e);
  }
  const latest = slots.find((m) => !m.done) || null;
  const s = ui.setScreen(`
    <div class="title-wrap">
      <h1>Hiphtia's Blessing</h1>
      <div class="sub">A workplace stealth comedy. No pants. No one can know.</div>
      <div class="menu">
        ${latest ? `<button id="t-continue">Continue<br><span style="font-size:13px;font-weight:500">${slotLine(latest)}</span></button>` : ''}
        ${slots.length ? `<button id="t-load" class="secondary">Load Game (${slots.length})</button>` : ''}
        <button id="t-new" class="${latest ? 'secondary' : ''}">New Game</button>
        <button id="t-set" class="secondary">Settings</button>
        <button id="t-civ" class="secondary">Civilian Models</button>
        <button id="t-cel" class="secondary">Celesti's Model</button>
        <button id="t-controls" class="secondary">How to Play</button>
        <button id="t-quit" class="secondary">Quit</button>
      </div>
    </div>`);
  if (latest) s.querySelector('#t-continue').onclick = () => startGame(latest.id);
  if (slots.length) s.querySelector('#t-load').onclick = showLoad;
  s.querySelector('#t-new').onclick = showCreator;
  s.querySelector('#t-set').onclick = showSettings;
  s.querySelector('#t-civ').onclick = showCivilians;
  s.querySelector('#t-cel').onclick = showCelesti;
  s.querySelector('#t-controls').onclick = showHowTo;
  s.querySelector('#t-quit').onclick = () => (window.gameAPI ? window.gameAPI.quit() : window.close());
  s.classList.add('titlebg');
  showTitleScene(slots[0] || null).catch((e) => console.warn('title scene', e));
}

/** The backdrop: Celesti floating in, and the main character of the last played save, startled. */
async function showTitleScene(lastSlot) {
  const settings = await getSettings();
  const cm = settings.celesti && settings.celesti.key ? settings.celesti : { asset: BUNDLED.celesti };
  const celesti = { vrm: await getModel(cm), full: true, legwearMaterials: cm.legwearMaterials || null, underwearOverlay: false, gender: 'female' };
  let player = null;
  try {
    if (lastSlot) {
      const { profile: raw } = await loadSlot(lastSlot.id);
      const profile = migrateProfile(raw);
      const o = profile?.player?.outfits?.[0];
      if (o) player = await outfitOpts(o, {}, profile.player.gender);
    }
  } catch (e) {
    console.warn('title: could not load last save', e);
  }
  if (!player) player = await outfitOpts(newOutfit('skirt', randomColors(), 'female'), {}, 'female');
  if (!document.querySelector('.title-wrap')) return;
  await startTitleScene({ celesti, player, isTitleUp: () => !!document.querySelector('.title-wrap') });
}

async function showLoad() {
  const slots = await listSlots();
  const s = ui.setScreen(`
    <div class="panel" style="max-width:640px">
      <h2>Load Game</h2>
      <p class="note" style="margin-top:0">Each save slot is its own game with its own character, job and coworkers. Coworkers from your other saves show up around town.</p>
      ${slots
        .map((m) => `<div class="row" style="margin:8px 0;justify-content:space-between"><span>${slotLine(m)}<br><span class="note">${new Date(m.updated || 0).toLocaleString()}</span></span>
          <span class="row"><button data-lplay="${m.id}" ${m.done ? 'disabled' : ''}>Play</button><button class="danger" data-ldel="${m.id}">Delete</button></span></div>`)
        .join('') || '<p>No saves.</p>'}
      <div class="footer"><button class="secondary" id="l-back">Back</button><span></span></div>
    </div>`);
  s.querySelectorAll('[data-lplay]').forEach((b) => (b.onclick = () => startGame(b.dataset.lplay)));
  s.querySelectorAll('[data-ldel]').forEach(
    (b) =>
      (b.onclick = async () => {
        const ok = await ui.dialog('Delete this save?', 'This cannot be undone.', [
          { label: 'Delete', value: true, cls: 'danger' },
          { label: 'Cancel', value: false, cls: 'secondary' },
        ]);
        if (!ok) return;
        await deleteSlot(b.dataset.ldel);
        blobCache.clear();
        showLoad();
      })
  );
  s.querySelector('#l-back').onclick = showTitle;
}

async function showSettings() {
  const st = await getSettings();
  const s = ui.setScreen(`
    <div class="panel" style="max-width:620px">
      <h2>Settings</h2>
      <label>Length of an in-game hour: <b id="v-hour"></b></label>
      <input type="range" id="s-hour" min="60" max="600" step="10" value="${st.hourSeconds}" />
      <p class="note">How many real seconds one in-game hour lasts while commuting and running errands. Longer = more time to get to work.</p>
      <label>Shame buildup: <b id="v-shame"></b></label>
      <input type="range" id="s-shame" min="0.25" max="2" step="0.05" value="${st.shameScale}" />
      <p class="note">Multiplies all shame gained.</p>
      <label>How fast people notice you: <b id="v-detect"></b></label>
      <input type="range" id="s-detect" min="0.25" max="2" step="0.05" value="${st.detectScale ?? 1}" />
      <p class="note">How quickly someone who can see your underwear realizes what they're looking at.</p>
      <label><input type="checkbox" id="s-sleep" ${st.sleepRecovery !== false ? 'checked' : ''}/> A night's sleep reduces Shame</label>
      <label>Soaked clothes see-through: <b id="v-wet"></b></label>
      <input type="range" id="s-wet" min="0" max="0.95" step="0.05" value="${st.wetMaxSee ?? 0.5}" />
      <p class="note">How see-through wet tops and dresses get when completely soaked. 0% = rain never shows through.</p>
      <label>Unfinished requests allowed at clock-out: <b id="v-unf"></b></label>
      <input type="range" id="s-unf" min="0" max="8" step="1" value="${st.allowedUnfinished ?? 2}" />
      <p class="note">Leave more than this many requests undone and the manager wants a word. Lower = harder.</p>
      <label>Facial expression strength: <b id="v-expr"></b></label>
      <input type="range" id="s-expr" min="0" max="1" step="0.05" value="${st.exprMax}" />
      <p class="note">Maximum weight of VRoid facial expressions (blend shapes) used to show how characters feel.</p>
      <label><input type="checkbox" id="s-map" ${st.minimap ? 'checked' : ''}/> Show minimap and compass (toggle in game with M)</label>
      <label><input type="checkbox" id="s-civ" ${st.useBundledCivilians ? 'checked' : ''}/> Use the bundled townsperson models for civilians</label>
      <h3 style="margin:18px 0 6px">Sound</h3>
      ${volumeSlidersHTML(st)}
      <div class="footer"><button class="secondary" id="s-reset">Defaults</button><button id="s-back">Done</button></div>
    </div>`);
  const fmt = () => {
    const h = +s.querySelector('#s-hour').value;
    s.querySelector('#v-hour').textContent = `${Math.floor(h / 60)}m ${h % 60}s`;
    s.querySelector('#v-shame').textContent = `×${(+s.querySelector('#s-shame').value).toFixed(2)}`;
    s.querySelector('#v-expr').textContent = `${Math.round(+s.querySelector('#s-expr').value * 100)}%`;
    s.querySelector('#v-detect').textContent = `×${(+s.querySelector('#s-detect').value).toFixed(2)}`;
    s.querySelector('#v-wet').textContent = `${Math.round(+s.querySelector('#s-wet').value * 100)}%`;
    s.querySelector('#v-unf').textContent = `${s.querySelector('#s-unf').value}`;
  };
  fmt();
  const save = async () => {
    st.hourSeconds = +s.querySelector('#s-hour').value;
    st.shameScale = +s.querySelector('#s-shame').value;
    st.exprMax = +s.querySelector('#s-expr').value;
    st.detectScale = +s.querySelector('#s-detect').value;
    st.sleepRecovery = s.querySelector('#s-sleep').checked;
    st.wetMaxSee = +s.querySelector('#s-wet').value;
    st.allowedUnfinished = +s.querySelector('#s-unf').value;
    st.minimap = s.querySelector('#s-map').checked;
    st.useBundledCivilians = s.querySelector('#s-civ').checked;
    await putSettings(st);
  };
  s.querySelectorAll('input:not([id^="s-vol"])').forEach((el) => (el.oninput = el.onchange = () => (fmt(), save())));
  bindVolumeSliders(s, st, () => putSettings(st));
  s.querySelector('#s-reset').onclick = async () => {
    Object.assign(st, { hourSeconds: DEFAULT_SETTINGS.hourSeconds, shameScale: DEFAULT_SETTINGS.shameScale, exprMax: DEFAULT_SETTINGS.exprMax, detectScale: 1, sleepRecovery: true, wetMaxSee: 0.5, allowedUnfinished: 2, minimap: true, useBundledCivilians: true });
    for (const k of ['volMaster', 'volSfx', 'volVoice', 'volAmbient', 'volUi']) st[k] = DEFAULT_SETTINGS[k];
    applyVolumeSettings(st);
    await putSettings(st);
    showSettings();
  };
  s.querySelector('#s-back').onclick = showTitle;
}

function showHowTo() {
  const s = ui.setScreen(`
    <div class="panel" style="max-width:800px">
      <h2>How to Play</h2>
      <p class="textblock" style="font-size:15px">Create your character, pick a job and set up 4–12 coworkers and a manager. Each morning you choose everyone's outfit for the day.

On Monday a wardrobe mishap at work leaves you without pants or a skirt, and that evening you find the rest of your wardrobe ruined. From then on you commute, work and run errands like that.

<b>At work</b>, finish your tasks without being seen. Coworkers react based on personality:
• Best Friend: becomes an ally, lends you their legwear or makes a distraction
• Sympathetic: becomes an ally and makes distractions
• Neutral: lets it slide once, reports you the second time
• Strict / Distant: reports you to the manager
• Oddball: thinks it's a game and joins in, sneaking around without bottoms too
Reports, three customer complaints, the manager spotting you, or arriving more than 10 minutes late mean a very uncomfortable talk with the manager and a write-up. The third write-up gets you fired.

<b>Staying hidden:</b> pick up boxes, trays, bags, newspapers and umbrellas and hold them in front of you; sit at desks, tables and benches; duck into hiding spots; crouch behind low furniture. The minimap and compass point to your objective.

<b>In town</b>, being seen raises your Shame (adjust how fast in Settings). You leave and come home through your building's lobby. Rain soaks your clothes unless you carry an umbrella. Buses follow fixed routes and stop at every stop; rush hour buses are packed and you may have to stand. Standing on the bus is far more humiliating than sitting. Fill up Shame and you lose.

After your third shift, Celesti, messenger of Hiphtia the goddess of hips, pays you a visit. After that, the coworker you spend the most time near each workday gets "blessed" the next workday. Blessed coworkers can't report you, but can't help you either. You win when every coworker is blessed. Weekends are days off with errands... and chaos.</p>
      ${controlsTable()}
      <div class="footer"><span></span><button id="h-back">Back</button></div>
    </div>`);
  s.querySelector('#h-back').onclick = showTitle;
}

// ---------------------------------------------------------------------------
// Civilian template manager
async function showCivilians() {
  killPreview();
  const settings = await getSettings();
  const s = ui.setScreen(`
    <div class="panel">
      <h2>Civilian Models</h2>
      <div class="cols">
        <div>
          <p class="note" style="margin-top:0">Pedestrians, customers and bus passengers are built from these .vrm templates. Every NPC gets random skin, hair, eye and clothing colors.
          Tip: lighter-colored textures recolor best. Coworkers from your other save slots also appear in town, with their names.</p>
          <label><input type="checkbox" id="civ-bundled" ${settings.useBundledCivilians ? 'checked' : ''}/> Use the bundled townsperson models</label>
          <div>${BUNDLED.civilians.map((c, i) => `<div class="row" style="margin:6px 0"><span>${esc(c.title)}</span><button class="secondary" data-bprev="${i}">Preview</button></div>`).join('')}</div>
          <h3>Your templates</h3>
          <div id="civ-list">${
            settings.civilians.length
              ? settings.civilians
                  .map(
                    (c, i) => `<div class="row" style="margin:6px 0"><span>${esc(c.title)}</span>
                    <select data-cgen="${i}"><option value="">Any gender</option><option value="female" ${c.gender === 'female' ? 'selected' : ''}>Female</option><option value="male" ${c.gender === 'male' ? 'selected' : ''}>Male</option></select>
                    <button class="secondary" data-cprev="${i}">Preview</button><button class="danger" data-cdel="${i}">Remove</button></div>`
                  )
                  .join('')
              : '<p>No custom templates yet.</p>'
          }</div>
          <div class="row" style="margin-top:12px"><button id="civ-add">Import .vrm template(s)...</button></div>
          <div class="note" id="civ-status"></div>
        </div>
        <div><canvas class="preview" id="pv"></canvas><div class="row" style="margin-top:8px"><button class="secondary" id="civ-roll">Roll random colors</button></div></div>
      </div>
      <div class="footer"><button class="secondary" id="civ-back">Back</button><span></span></div>
    </div>`);
  previewer = new Previewer(s.querySelector('#pv'));
  let cur = settings.civilians[0] || { asset: BUNDLED.civilians[0].asset };
  const show = async () => {
    if (!cur) return previewer.show({ colors: randomColors() });
    previewer.show({ vrm: await getModel(cur), key: 'civ:' + modelKey(cur), randomize: true, underwearOverlay: false });
  };
  show();
  s.querySelector('#civ-roll').onclick = show;
  s.querySelector('#civ-bundled').onchange = async (e) => {
    settings.useBundledCivilians = e.target.checked;
    await putSettings(settings);
  };
  s.querySelectorAll('[data-bprev]').forEach((b) => (b.onclick = () => ((cur = { asset: BUNDLED.civilians[+b.dataset.bprev].asset }), show())));
  s.querySelectorAll('[data-cgen]').forEach(
    (b) =>
      (b.onchange = async () => {
        settings.civilians[+b.dataset.cgen].gender = b.value || null;
        await putSettings(settings);
      })
  );
  s.querySelectorAll('[data-cprev]').forEach((b) => (b.onclick = () => ((cur = settings.civilians[+b.dataset.cprev]), show())));
  s.querySelectorAll('[data-cdel]').forEach(
    (b) =>
      (b.onclick = async () => {
        const [c] = settings.civilians.splice(+b.dataset.cdel, 1);
        await storage.deleteBlob(c.key);
        await putSettings(settings);
        clearTemplates();
        showCivilians();
      })
  );
  s.querySelector('#civ-add').onclick = async () => {
    const files = await pickFiles(true);
    for (const f of files) {
      s.querySelector('#civ-status').textContent = 'Loading ' + f.name + '...';
      try {
        const m = await importVRM(f);
        settings.civilians.push({ key: m.key, title: m.title, gender: null });
      } catch (e) {
        s.querySelector('#civ-status').textContent = `Could not load ${f.name}: ${e.message}`;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    await putSettings(settings);
    showCivilians();
  };
  s.querySelector('#civ-back').onclick = showTitle;
}

// ---------------------------------------------------------------------------
// Celesti model
async function showCelesti() {
  killPreview();
  const settings = await getSettings();
  const m = settings.celesti;
  const s = ui.setScreen(`
    <div class="panel">
      <h2>Celesti, Messenger of Hiphtia</h2>
      <div class="cols">
        <div>
          <p class="note" style="margin-top:0">Celesti appears after your third shift. A halo and wings are added automatically.</p>
          <label>Name</label><input type="text" id="cel-name" maxlength="20" value="${esc(settings.celestiName || 'Celesti')}" />
          <label>Model</label>
          <div class="row"><button id="cel-imp">${m ? 'Replace .vrm...' : 'Import .vrm...'}</button>${m ? '<button class="secondary" id="cel-def">Use default</button>' : ''}</div>
          <div class="note" id="cel-status">${m ? 'Loaded: ' + esc(m.title) : 'Using the bundled Celesti model.'}</div>
        </div>
        <div><canvas class="preview" id="pv"></canvas></div>
      </div>
      <div class="footer"><button class="secondary" id="cel-back">Back</button><span></span></div>
    </div>`);
  previewer = new Previewer(s.querySelector('#pv'));
  const show = async () =>
    previewer.show(
      { vrm: await getModel(m || { asset: BUNDLED.celesti }), full: true, legwearMaterials: [], underwearOverlay: false, gender: 'female' },
      (ch) => addAngelic(ch)
    );
  show();
  const nm = s.querySelector('#cel-name');
  nm.oninput = async () => {
    settings.celestiName = nm.value.trim() || 'Celesti';
    await putSettings(settings);
  };
  s.querySelector('#cel-imp').onclick = async () => {
    const [f] = await pickFiles();
    if (!f) return;
    s.querySelector('#cel-status').textContent = 'Loading...';
    try {
      const nmodel = await importVRM(f);
      if (settings.celesti) await storage.deleteBlob(settings.celesti.key);
      settings.celesti = { key: nmodel.key, title: nmodel.title, legwearMaterials: [] };
      await putSettings(settings);
      showCelesti();
    } catch (e) {
      s.querySelector('#cel-status').textContent = 'Could not load: ' + e.message;
    }
  };
  const def = s.querySelector('#cel-def');
  if (def)
    def.onclick = async () => {
      await storage.deleteBlob(settings.celesti.key);
      settings.celesti = null;
      await putSettings(settings);
      showCelesti();
    };
  s.querySelector('#cel-back').onclick = showTitle;
}

// ---------------------------------------------------------------------------
// Creator
let draft = null;
let step = 0;
let previewTarget = 'player'; // 'player' | 'mgr' | index

function defaultDraft() {
  const names = [...DEFAULT_COWORKER_NAMES].sort(() => Math.random() - 0.5);
  const cw = (i) => {
    const g = randGender();
    return { name: names[i], gender: g, personality: DEFAULT_PERSONALITIES[i], outfits: [newOutfit(g === 'female' && Math.random() < 0.5 ? 'skirt' : 'pants', randomColors(), g, Math.random() < 0.25)] };
  };
  return {
    name: 'Alex',
    job: 'office',
    layoutSeed: 1 + Math.floor(Math.random() * 99999),
    player: { gender: 'female', outfits: [newOutfit('skirt', { skin: COLORS.skin[0], hair: COLORS.hair[1], top: COLORS.top[0], bottom: COLORS.bottom[0], under: COLORS.under[0], eye: '#1b1b2f' }, 'female')] },
    manager: { name: 'Ms. Harper', gender: 'female', outfits: [newOutfit('skirt', { ...randomColors(), top: '#2d3436', bottom: '#2d3436' }, 'female', true)] },
    coworkers: Array.from({ length: 8 }, (_, i) => cw(i)),
  };
}

function charDef(target) {
  if (target === 'player') return draft.player;
  if (target === 'mgr') return draft.manager;
  return draft.coworkers[target];
}

async function refreshPreview() {
  if (!previewer) return;
  const def = charDef(previewTarget);
  if (!def) return;
  const label = document.getElementById('pv-label');
  if (label) label.textContent = previewTarget === 'player' ? draft.name || 'You' : def.name + (previewTarget === 'mgr' ? ' (manager)' : '');
  await previewer.show(await outfitOpts(def.outfits[0], {}, def.gender));
}

function stepsBar() {
  const names = ['1. Your Character', '2. Your Job', '3. Coworkers', '4. Ready'];
  return `<div class="steps">${names.map((n, i) => `<div class="${i === step ? 'on' : ''}">${n}</div>`).join('')}</div>`;
}

function showCreator() {
  draft = defaultDraft();
  step = 0;
  previewTarget = 'player';
  renderCreator();
}

function renderCreator() {
  killPreview();
  let body = '';
  if (step === 0) body = creatorProfile();
  else if (step === 1) body = creatorJob();
  else if (step === 2) body = creatorCoworkers();
  else body = creatorSummary();
  const showPreview = step === 0 || step === 2;
  const s = ui.setScreen(`
    <div class="panel">
      <h2>New Game</h2>
      ${stepsBar()}
      <div class="${showPreview ? 'cols' : ''}">
        <div>${body}</div>
        ${
          showPreview
            ? `<div><canvas class="preview" id="pv"></canvas>
          <div class="row" style="margin-top:8px"><b id="pv-label"></b><button class="secondary" id="pv-toggle">Preview mishap</button></div>
          <p class="note">Use "Preview mishap" to check that the right clothing parts disappear.</p></div>`
            : ''
        }
      </div>
      <div class="footer">
        <button class="secondary" id="c-back">${step === 0 ? 'Back to Title' : 'Back'}</button>
        <button id="c-next">${step === 3 ? 'Start Day 1' : 'Next'}</button>
      </div>
    </div>`);
  if (showPreview) {
    previewer = new Previewer(s.querySelector('#pv'));
    const tg = s.querySelector('#pv-toggle');
    tg.onclick = () => {
      previewer.setLegwear(!previewer.legwear);
      tg.textContent = previewer.legwear ? 'Preview mishap' : 'Restore clothes';
    };
    if (step === 0) previewTarget = 'player';
    else if (previewTarget === 'player') previewTarget = 0;
    refreshPreview();
  }
  s.querySelector('#c-back').onclick = () => {
    if (step === 0) showTitle();
    else {
      step--;
      renderCreator();
    }
  };
  s.querySelector('#c-next').onclick = async () => {
    if (step === 0 && !draft.name.trim()) return ui.dialog('Name needed', 'Please enter a name for your character.');
    if (step === 2) {
      if (draft.coworkers.length < 4) return ui.dialog('More coworkers needed', 'You need at least 4 coworkers.');
      if (draft.coworkers.some((c) => !c.name.trim()) || !draft.manager.name.trim()) return ui.dialog('Names needed', 'Everyone needs a name.');
    }
    if (step === 3) return beginNewGame();
    step++;
    renderCreator();
  };
  bindCreator(s);
}

function outfitEditor(o, prefix, full) {
  const m = o.model;
  const imported = m && m.key;
  const tintable = !m || m.asset || m.tintable;
  const bodyOpts = [
    ...BUNDLED.bodies.map((b) => `<option value="asset:${b.asset}" ${m?.asset === b.asset ? 'selected' : ''}>${esc(b.title)}</option>`),
    `<option value="simple" ${!m ? 'selected' : ''}>Simple figure</option>`,
    imported ? `<option value="cur" selected>Imported: ${esc(m.title)}</option>` : '',
  ].join('');
  const clothesOpts = [
    `<option value="">Its own clothes</option>`,
    ...BUNDLED.bodies.map((b) => `<option value="${b.asset}" ${o.clothesFrom?.asset === b.asset ? 'selected' : ''}>Clothes from: ${esc(b.title)}</option>`),
  ].join('');
  return `
    <label>Usual legwear</label>
    <select data-${prefix}lw><option value="pants" ${o.legwearType === 'pants' ? 'selected' : ''}>Pants</option><option value="skirt" ${o.legwearType === 'skirt' ? 'selected' : ''}>Skirt</option></select>
    <label>Body / model</label>
    <select data-${prefix}body>${bodyOpts}</select>
    <div class="row" style="margin-top:8px">
      <button data-${prefix}imp>Import .vrm...</button>
      ${tintable ? `<button class="secondary" data-${prefix}rand>Randomize colors</button>` : ''}
      ${prefix === 'p' ? '' : `<button data-${prefix}pv>Preview</button>`}
    </div>
    <div class="note" data-${prefix}status></div>
    ${
      m
        ? `<details ${full ? 'open' : ''}><summary class="note">Model parts & options</summary>
        ${m.materials ? '' : `<button class="secondary" data-${prefix}parts>Show parts list</button>`}
        ${m.materials ? `<div class="note">Legwear parts (hidden after a mishap):</div>${matList(m, prefix + 'mat')}` : ''}
        ${m.materials ? `<div class="note">Parts that turn see-through when wet:</div>${matList(m, prefix + 'wet', 'wetMaterials')}` : ''}
        <label><input type="checkbox" data-${prefix}uw ${m.underwearOverlay ? 'checked' : ''}/> Add simple underwear overlay (only if the model has no underwear)</label>
        <label>Clothes</label><select data-${prefix}clothes>${clothesOpts}</select>
        <div class="note">Wear another model's clothes, fitted to this body.</div></details>`
        : ''
    }
    ${
      tintable && full
        ? `<label>Skin</label>${swatches('skin', o.colors.skin, prefix + 'skin')}<label>Hair</label>${swatches('hair', o.colors.hair, prefix + 'hair')}
           <label>Top</label>${swatches('top', o.colors.top, prefix + 'top')}<label>Pants / skirt</label>${swatches('bottom', o.colors.bottom, prefix + 'bottom')}`
        : ''
    }
    ${full && !m ? `<label>Underwear color</label>${swatches('under', o.colors.under, prefix + 'under')}` : ''}`;
}

function genderSelect(def, attr) {
  return `<label>Gender</label><select data-${attr}><option value="female" ${def.gender === 'female' ? 'selected' : ''}>Female</option><option value="male" ${def.gender === 'male' ? 'selected' : ''}>Male</option><option value="" ${!def.gender ? 'selected' : ''}>Unspecified (they/them)</option></select>`;
}

function bindGender(s, def, attr, target) {
  const el = s.querySelector(`[data-${attr}]`);
  if (!el) return;
  el.onchange = () => {
    def.gender = el.value || null;
    // swap a bundled body to one of the matching gender
    for (const o of def.outfits) if (o.model?.asset && def.gender) o.model = bundledBody(def.gender, /old/i.test(o.model.asset));
    previewTarget = target;
    renderCreator();
  };
}

function bindOutfitEditor(s, o, prefix, target, rerender = renderCreator) {
  const q = (a) => s.querySelector(`[data-${prefix}${a}]`);
  const refresh = () => {
    previewTarget = target;
    refreshPreview();
  };
  q('lw').onchange = (e) => ((o.legwearType = e.target.value), refresh());
  q('body').onchange = (e) => {
    const v = e.target.value;
    if (v === 'simple') o.model = null;
    else if (v.startsWith('asset:')) {
      const b = BUNDLED.bodies.find((x) => x.asset === v.slice(6));
      o.model = { asset: b.asset, title: b.title, tintable: true, legwearMaterials: null, underwearOverlay: false, wetMaterials: null };
    }
    previewTarget = target;
    rerender();
  };
  q('imp').onclick = async () => {
    const [f] = await pickFiles();
    if (!f) return;
    q('status').textContent = 'Loading ' + f.name + '...';
    try {
      o.model = await importVRM(f);
      previewTarget = target;
      rerender();
    } catch (e) {
      q('status').textContent = 'Could not load that file: ' + e.message;
    }
  };
  if (q('parts'))
    q('parts').onclick = async () => {
      q('status').textContent = 'Reading model...';
      await ensureMaterials(o.model);
      previewTarget = target;
      rerender();
    };
  if (q('rand')) q('rand').onclick = () => ((o.colors = { ...randomColors(), under: o.colors.under }), refresh());
  if (q('pv')) q('pv').onclick = refresh;
  if (q('uw')) q('uw').onchange = (e) => ((o.model.underwearOverlay = e.target.checked), refresh());
  if (q('clothes'))
    q('clothes').onchange = (e) => {
      const b = BUNDLED.bodies.find((x) => x.asset === e.target.value);
      o.clothesFrom = b ? { asset: b.asset, title: b.title } : null;
      refresh();
    };
  if (o.model) {
    bindMatList(s, o.model, prefix + 'mat', refresh);
    bindMatList(s, o.model, prefix + 'wet', refresh, 'wetMaterials');
  }
  for (const k of ['skin', 'hair', 'top', 'bottom', 'under']) {
    s.querySelectorAll(`[data-${prefix}${k}]`).forEach((el) => {
      el.onclick = () => {
        o.colors[k] = el.getAttribute(`data-${prefix}${k}`);
        s.querySelectorAll(`[data-${prefix}${k}]`).forEach((x) => x.classList.toggle('on', x === el));
        refresh();
      };
    });
  }
}

function creatorProfile() {
  return `
    <label>Character name</label>
    <input type="text" id="f-name" maxlength="20" value="${esc(draft.name)}" />
    ${genderSelect(draft.player, 'pgender')}
    ${outfitEditor(draft.player.outfits[0], 'p', true)}
    <p class="note">Tip: export from VRoid Studio without "delete hidden body parts" so the legs are complete under the clothes. You can add more outfits each morning.</p>`;
}

function creatorJob() {
  return `<div class="cards">${Object.entries(JOBS)
    .map(([k, j]) => `<div class="card ${draft.job === k ? 'on' : ''}" data-job="${k}"><h3>${esc(j.label)}</h3><p>${esc(j.desc)}</p><p style="margin-top:8px;color:#ffd36e">${esc(j.workplaceName)}</p></div>`)
    .join('')}</div>`;
}

function creatorCoworkers() {
  const roles = ROLE_NAMES[draft.job];
  const card = (c, i) => `<div class="cw">
      <h4><span>${esc(roles[i] || 'Coworker')}</span>${draft.coworkers.length > 4 ? `<button class="danger" style="padding:4px 10px" data-cwdel="${i}">Remove</button>` : ''}</h4>
      <label>Name</label><input type="text" maxlength="16" data-cwname="${i}" value="${esc(c.name)}" />
      <label>Personality</label>
      <select data-cwpers="${i}">${Object.entries(PERSONALITIES).map(([k, p]) => `<option value="${k}" ${c.personality === k ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>
      <div class="note">${esc(PERSONALITIES[c.personality].desc)}</div>
      ${genderSelect(c, 'cgender' + i)}
      ${outfitEditor(c.outfits[0], 'c' + i + 'x', false)}
    </div>`;
  return `<p class="note" style="margin-top:0">Coworkers' personalities decide how they react if they catch you. You need 4 to 12 coworkers (${draft.coworkers.length} now).</p>
  <div class="cw" style="margin-bottom:14px;border-color:#c0392b">
    <h4><span>Manager</span></h4>
    <label>Name</label><input type="text" maxlength="20" id="mgr-name" value="${esc(draft.manager.name)}" />
    <div class="note">Hands out write-ups. Three and you're fired. Patrols the building and works in their office.</div>
    ${genderSelect(draft.manager, 'mgender')}
    ${outfitEditor(draft.manager.outfits[0], 'm', false)}
  </div>
  <div class="cw-grid">${draft.coworkers.map(card).join('')}</div>
  <div class="row" style="margin-top:12px"><button id="cw-add" ${draft.coworkers.length >= 12 ? 'disabled' : ''}>+ Add coworker</button><span></span></div>`;
}

function creatorSummary() {
  const outfit = draft.player.outfits[0];
  return `<div class="textblock" style="font-size:16px">
<b>${esc(draft.name)}</b> — ${esc(JOBS[draft.job].label)} at <b>${esc(JOBS[draft.job].workplaceName)}</b>
Model: ${outfit.model ? esc(outfit.model.title) : 'Simple figure'} · Usual legwear: ${outfit.legwearType}
Manager: ${esc(draft.manager.name)}

Coworkers (${draft.coworkers.length}):
${draft.coworkers.map((c) => `  • ${esc(c.name)} — ${esc(PERSONALITIES[c.personality].label)}`).join('\n')}

Survive your shifts and don't let Shame fill up. Something strange happens after your third shift...</div>`;
}

function bindCreator(s) {
  const q = (sel) => s.querySelectorAll(sel);
  if (step === 0) {
    const name = s.querySelector('#f-name');
    name.oninput = () => {
      draft.name = name.value;
      const l = document.getElementById('pv-label');
      if (l) l.textContent = draft.name;
    };
    bindOutfitEditor(s, draft.player.outfits[0], 'p', 'player');
    bindGender(s, draft.player, 'pgender', 'player');
  } else if (step === 1) {
    q('[data-job]').forEach((el) => (el.onclick = () => ((draft.job = el.dataset.job), renderCreator())));
  } else if (step === 2) {
    s.querySelector('#mgr-name').oninput = (e) => (draft.manager.name = e.target.value);
    bindOutfitEditor(s, draft.manager.outfits[0], 'm', 'mgr');
    bindGender(s, draft.manager, 'mgender', 'mgr');
    draft.coworkers.forEach((c, i) => {
      bindOutfitEditor(s, c.outfits[0], 'c' + i + 'x', i);
      bindGender(s, c, 'cgender' + i, i);
    });
    q('[data-cwname]').forEach((el) => (el.oninput = () => (draft.coworkers[+el.dataset.cwname].name = el.value)));
    q('[data-cwpers]').forEach((el) => (el.onchange = () => ((draft.coworkers[+el.dataset.cwpers].personality = el.value), renderCreator())));
    q('[data-cwdel]').forEach((el) => (el.onclick = () => (draft.coworkers.splice(+el.dataset.cwdel, 1), (previewTarget = 0), renderCreator())));
    const add = s.querySelector('#cw-add');
    add.onclick = () => {
      const used = new Set(draft.coworkers.map((c) => c.name));
      const nm = DEFAULT_COWORKER_NAMES.find((n) => !used.has(n)) || 'Coworker ' + (draft.coworkers.length + 1);
      const g = randGender();
      draft.coworkers.push({ name: nm, gender: g, personality: DEFAULT_PERSONALITIES[draft.coworkers.length % DEFAULT_PERSONALITIES.length], outfits: [newOutfit(g === 'female' && Math.random() < 0.5 ? 'skirt' : 'pants', randomColors(), g, Math.random() < 0.25)] });
      previewTarget = draft.coworkers.length - 1;
      renderCreator();
    };
  }
}

async function beginNewGame() {
  killPreview();
  const profile = JSON.parse(JSON.stringify({ name: draft.name.trim(), job: draft.job, layoutSeed: draft.layoutSeed, player: draft.player, manager: draft.manager, coworkers: draft.coworkers }));
  profile.coworkers.forEach((c) => (c.name = c.name.trim()));
  const id = await createSlot(profile, { day: 1, shame: 0, seed: profile.layoutSeed });
  startGame(id);
}

// ---------------------------------------------------------------------------
// Daily outfit screen
function chooseOutfits(g) {
  return new Promise((resolve) => {
    const profile = g.profile;
    const daily = g.state.daily;
    const entries = [
      { key: 'player', def: profile.player, label: `${profile.name} (you)` },
      { key: 'mgr', def: profile.manager, label: `${profile.manager.name} (manager)` },
      ...profile.coworkers.map((c, i) => ({ key: 'cw' + i, def: c, label: c.name, idx: i })).filter((e) => !g.state.cw[e.idx].fired),
    ];
    let sel = 'player';
    const tintList = COLORS.tint;
    const render = () => {
      killPreview();
      const row = (e) => {
        const d = daily[e.key] || (daily[e.key] = { outfit: 0, top: null, bottom: null });
        const blessed = e.idx !== undefined && g.state.cw[e.idx].blessed;
        return `<div class="cw ${sel === e.key ? 'on' : ''}" style="${sel === e.key ? 'border-color:#ff7eb6' : ''}">
          <h4><span>${esc(e.label)}${blessed ? ' ✦ blessed' : ''}</span><button class="secondary" style="padding:4px 10px" data-osel="${e.key}">Preview</button></h4>
          <label>Outfit</label>
          <select data-ooutfit="${e.key}">${e.def.outfits
            .map((o, i) => `<option value="${i}" ${d.outfit === i ? 'selected' : ''}>Outfit ${i + 1}: ${o.model ? esc(o.model.title) : 'Simple figure'}</option>`)
            .join('')}</select>
          <label>Today ${e.key === 'player' ? "you're" : "they're"} wearing</label>
          <select data-olw="${e.key}"><option value="pants" ${(d.legwearType || (e.def.outfits[d.outfit] || e.def.outfits[0]).legwearType) === 'pants' ? 'selected' : ''}>Pants</option><option value="skirt" ${(d.legwearType || (e.def.outfits[d.outfit] || e.def.outfits[0]).legwearType) === 'skirt' ? 'selected' : ''}>A skirt</option></select>
          <label>Top color</label>${swatches('tint', d.top, 'otop-' + e.key, tintList)}
          <label>Bottom color</label>${swatches('tint', d.bottom, 'obot-' + e.key, tintList)}
          ${
            e.key === 'player'
              ? `<label>At-home outfit</label>
          <select data-ohome="player">${e.def.outfits
            .map((o, i) => `<option value="${i}" ${(d.home ?? e.def.homeOutfit ?? d.outfit) === i ? 'selected' : ''}>Outfit ${i + 1}: ${o.model ? esc(o.model.title) : 'Simple figure'}</option>`)
            .join('')}</select>
          <label>At-home top color</label>${swatches('tint', d.homeTop, 'ohtop-' + e.key, tintList)}
          <div class="row" style="margin-top:6px"><button class="secondary" data-ohprev="1">Preview at-home outfit</button></div>`
              : ''
          }
          <div class="row" style="margin-top:8px"><button class="secondary" data-oadd="${e.key}">+ Add outfit (.vrm)</button><button class="secondary" data-oaddd="${e.key}">+ Add outfit (same body)</button></div>
        </div>`;
      };
      const s = ui.setScreen(`
        <div class="panel">
          <h2>Day ${g.state.day} — ${WEEKDAYS[weekday(g.state.day)]}: Today's Outfits</h2>
          <div class="cols">
            <div>
              <p class="note" style="margin-top:0">Pick everyone's outfit for today. Colors tint the clothing (striped = original colors). Legwear won't matter for anyone who's been "blessed"...</p>
              <div class="row" style="margin-bottom:10px"><button class="secondary" id="o-rand">Randomize everyone's colors</button><button class="secondary" id="o-reset">Original colors for all</button></div>
              <div class="cw-grid">${entries.map(row).join('')}</div>
            </div>
            <div><canvas class="preview" id="pv"></canvas><div class="note" id="o-status"></div></div>
          </div>
          <div class="footer"><span></span><button id="o-go">Start the day</button></div>
        </div>`);
      previewer = new Previewer(s.querySelector('#pv'));
      let homePrev = false;
      const show = async () => {
        const e = entries.find((x) => x.key === sel);
        const d = daily[e.key];
        if (homePrev && e.key === 'player') {
          const o = e.def.outfits[d.home ?? e.def.homeOutfit ?? d.outfit] || e.def.outfits[0];
          return previewer.show(await outfitOpts(o, { top: d.homeTop, bottom: null }, e.def.gender));
        }
        const o = e.def.outfits[d.outfit] || e.def.outfits[0];
        previewer.show(await outfitOpts(o, d, e.def.gender));
      };
      show();
      s.querySelectorAll('[data-osel]').forEach((b) => (b.onclick = () => ((sel = b.dataset.osel), render())));
      s.querySelectorAll('[data-ooutfit]').forEach((b) => (b.onchange = () => ((daily[b.dataset.ooutfit].outfit = +b.value), (daily[b.dataset.ooutfit].legwearType = null), (sel = b.dataset.ooutfit), (homePrev = false), render())));
      s.querySelectorAll('[data-olw]').forEach((b) => (b.onchange = () => ((daily[b.dataset.olw].legwearType = b.value), (sel = b.dataset.olw), (homePrev = false), show())));
      s.querySelectorAll('[data-ohome]').forEach((b) => (b.onchange = () => ((daily.player.home = +b.value), (g.profile.player.homeOutfit = +b.value), (sel = 'player'), (homePrev = true), show())));
      s.querySelectorAll('[data-ohprev]').forEach((b) => (b.onclick = () => ((sel = 'player'), (homePrev = true), show())));
      s.querySelectorAll('[data-ohtop-player]').forEach((el) => {
        el.onclick = () => {
          daily.player.homeTop = el.getAttribute('data-ohtop-player') || null;
          s.querySelectorAll('[data-ohtop-player]').forEach((x) => x.classList.toggle('on', x === el));
          sel = 'player';
          homePrev = true;
          show();
        };
      });
      for (const e of entries) {
        for (const [attr, field] of [['otop-' + e.key, 'top'], ['obot-' + e.key, 'bottom']]) {
          s.querySelectorAll(`[data-${attr}]`).forEach((el) => {
            el.onclick = () => {
              daily[e.key][field] = el.getAttribute('data-' + attr) || null;
              s.querySelectorAll(`[data-${attr}]`).forEach((x) => x.classList.toggle('on', x === el));
              sel = e.key;
              homePrev = false;
              show();
            };
          });
        }
      }
      const addOutfit = async (key, withVrm) => {
        const e = entries.find((x) => x.key === key);
        const base = e.def.outfits[0];
        const o = {
          model: base.model && base.model.asset ? { ...base.model } : null,
          legwearType: base.legwearType,
          colors: { ...base.colors, ...randomColors(), skin: base.colors.skin, hair: base.colors.hair, under: base.colors.under },
        };
        if (withVrm) {
          const [f] = await pickFiles();
          if (!f) return;
          s.querySelector('#o-status').textContent = 'Loading ' + f.name + '...';
          try {
            o.model = await importVRM(f);
          } catch (err) {
            s.querySelector('#o-status').textContent = 'Could not load: ' + err.message;
            return;
          }
        }
        e.def.outfits.push(o);
        daily[key].outfit = e.def.outfits.length - 1;
        if (g.slotId) await writeProfile(g.slotId, profile);
        sel = key;
        render();
      };
      s.querySelectorAll('[data-oadd]').forEach((b) => (b.onclick = () => addOutfit(b.dataset.oadd, true)));
      s.querySelectorAll('[data-oaddd]').forEach((b) => (b.onclick = () => addOutfit(b.dataset.oaddd, false)));
      s.querySelector('#o-rand').onclick = () => {
        for (const e of entries) {
          daily[e.key].top = tintList[1 + Math.floor(Math.random() * (tintList.length - 1))];
          daily[e.key].bottom = Math.random() < 0.5 ? null : tintList[1 + Math.floor(Math.random() * (tintList.length - 1))];
        }
        render();
      };
      s.querySelector('#o-reset').onclick = () => {
        for (const e of entries) daily[e.key].top = daily[e.key].bottom = null;
        render();
      };
      s.querySelector('#o-go').onclick = async () => {
        if (g.slotId) await writeProfile(g.slotId, profile);
        killPreview();
        ui.hideScreen();
        resolve();
      };
    };
    render();
  });
}

// ---------------------------------------------------------------------------
// Game
async function startGame(slotId) {
  killPreview();
  stopTitleScene();
  if (game) {
    game.destroy();
    game = null;
  }
  const old = document.getElementById('game-canvas');
  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  old.replaceWith(canvas);
  ui.setScreen('<div class="loading">Loading...</div>');
  try {
    const settings = await getSettings();
    const { profile: raw, save } = await loadSlot(slotId);
    const profile = migrateProfile(raw);
    if (!profile) throw new Error('This save slot is empty.');
    if (!profile.layoutSeed) profile.layoutSeed = save?.seed || 1;
    await writeProfile(slotId, profile);
    const extraCivs = await otherSlotPeople(slotId);
    ui.clearChat();
    game = new Game(canvas, { profile, settings, hooks: { chooseOutfits, saveSettings: putSettings }, slotId, extraCivs }, save, onGameEnd);
    await game.init();
    game.start();
  } catch (e) {
    console.error(e);
    await ui.dialog('Error', 'Something went wrong while loading the game:\n' + (e && e.message));
    showTitle();
  }
}

async function onGameEnd(r) {
  const g = game;
  const profile = g.profile;
  setTimeout(() => {
    g.destroy();
    if (game === g) game = null;
  }, 0);
  if (r.type === 'quit') return showTitle();
  if (r.type === 'win') {
    const s = ui.setScreen(`
      <div class="panel" style="max-width:720px;text-align:center">
        <h1 style="color:#55efc4;margin-top:0">Hiphtia Is Satisfied!</h1>
        <p class="textblock" style="margin:0 auto">${esc(r.text)}</p>
        <p>Final shame: <b>${Math.round(r.shame)}%</b></p>
        <div class="menu"><button id="e-title">Back to Title</button></div>
      </div>`);
    s.querySelector('#e-title').onclick = showTitle;
    return;
  }
  const slotId = g.slotId;
  const { save } = slotId ? await loadSlot(slotId) : { save: null };
  const s = ui.setScreen(`
    <div class="panel" style="max-width:720px;text-align:center">
      <h1 style="color:#ff7675;margin-top:0">${esc(r.title)}</h1>
      <p class="textblock" style="margin:0 auto">${esc(r.text)}</p>
      <h3>GAME OVER</h3>
      <div class="menu">
        ${save ? `<button id="e-retry">Retry Day ${save.day}</button>` : ''}
        <button id="e-title" class="secondary">Back to Title</button>
      </div>
    </div>`);
  if (save) s.querySelector('#e-retry').onclick = () => startGame(slotId);
  s.querySelector('#e-title').onclick = showTitle;
}

// sound: browsers only allow audio after the first click or key press
getSettings().then(applyVolumeSettings).catch(() => {});
const unlockAudio = () => sound.unlock();
window.__sound = sound;
window.addEventListener('pointerdown', unlockAudio, true);
window.addEventListener('keydown', unlockAudio, true);
// menu buttons click; hovering ticks quietly
document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('button')) sound.play('click');
}, true);
let hoverEl = null;
document.addEventListener('mouseover', (e) => {
  const b = e.target.closest && e.target.closest('button');
  if (b && b !== hoverEl && !b.disabled) sound.play('hover', { minGap: 40 });
  hoverEl = b || null;
});

showTitle();
