// App shell: title screen, character/job/coworker creator, save/continue and end screens.
import * as THREE from 'three';
import { ui, esc } from './ui.js';
import { storage, newId } from './storage.js';
import { JOBS, PERSONALITIES, DEFAULT_COWORKER_NAMES, DEFAULT_PERSONALITIES, COLORS } from './data.js';
import { createCharacter, inspectVRM, randomColors } from './character.js';
import { Game, controlsTable } from './game.js';

const blobCache = new Map(); // key -> ArrayBuffer (for preview)
let game = null;

async function getBlob(key) {
  if (!key) return null;
  if (blobCache.has(key)) return blobCache.get(key);
  const b = await storage.getBlob(key);
  if (b) blobCache.set(key, b);
  return b;
}

// ---------------------------------------------------------------------------
// Title
async function showTitle() {
  ui.showHUD(false);
  let save = null;
  let profile = null;
  try {
    save = await storage.get('save');
    profile = await storage.get('profile');
  } catch (e) {
    console.warn(e);
  }
  const canContinue = save && profile;
  const s = ui.setScreen(`
    <div class="title-wrap">
      <h1>Hiphtia's Blessing</h1>
      <div class="sub">A workplace stealth comedy. Three days. No ${'pants'}. No one can know.</div>
      <div class="menu">
        ${canContinue ? `<button id="t-continue">Continue<br><span style="font-size:13px;font-weight:500">${esc(profile.name)} · ${esc(JOBS[profile.job].label)} · Day ${save.day}</span></button>` : ''}
        <button id="t-new" class="${canContinue ? 'secondary' : ''}">New Game</button>
        <button id="t-controls" class="secondary">How to Play</button>
        <button id="t-quit" class="secondary">Quit</button>
      </div>
      <p class="note" style="margin-top:30px">Import your own VRoid / VRM characters for you and your coworkers.</p>
    </div>`);
  if (canContinue) s.querySelector('#t-continue').onclick = () => startGame(profile, save);
  s.querySelector('#t-new').onclick = async () => {
    if (canContinue) {
      const ok = await ui.dialog('Start a new game?', 'Your current save will be overwritten.', [
        { label: 'Start new game', value: true },
        { label: 'Cancel', value: false, cls: 'secondary' },
      ]);
      if (!ok) return;
    }
    showCreator();
  };
  s.querySelector('#t-controls').onclick = showHowTo;
  s.querySelector('#t-quit').onclick = () => {
    if (window.gameAPI) window.gameAPI.quit();
    else window.close();
  };
}

function showHowTo() {
  const s = ui.setScreen(`
    <div class="panel" style="max-width:760px">
      <h2>How to Play</h2>
      <p class="textblock" style="font-size:15px">Create your character, choose your job and set up your coworkers. On day one you wake up, get ready and commute to work as normal...
until a wardrobe mishap leaves you without pants or a skirt.

At work, finish your tasks while keeping coworkers and customers from noticing. Getting caught by a coworker triggers a reaction based on the personality you gave them:
• Best Friend — becomes an ally, lends you their legwear or makes a distraction
• Sympathetic — becomes an ally and makes distractions
• Neutral — lets it slide once, reports you the second time
• Strict / Distant — reports you. You're fired!
Three customer complaints also gets you fired.

Outside of work, being seen won't get you fired, but it builds Shame. If Shame fills up, you lose. Survive three workdays to win.</p>
      ${controlsTable()}
      <div class="footer"><span></span><button id="h-back">Back</button></div>
    </div>`);
  s.querySelector('#h-back').onclick = showTitle;
}

// ---------------------------------------------------------------------------
// Creator
function defaultDraft() {
  const names = [...DEFAULT_COWORKER_NAMES].sort(() => Math.random() - 0.5);
  return {
    name: 'Alex',
    legwearType: 'pants',
    colors: { skin: COLORS.skin[0], hair: COLORS.hair[1], top: COLORS.top[0], bottom: COLORS.bottom[0], under: COLORS.under[0] },
    model: null,
    job: 'office',
    coworkers: [0, 1, 2, 3].map((i) => ({
      enabled: true,
      name: names[i],
      personality: DEFAULT_PERSONALITIES[i],
      legwearType: Math.random() < 0.5 ? 'skirt' : 'pants',
      colors: randomColors(),
      model: null,
    })),
  };
}

let draft = null;
let step = 0;
let previewer = null;
let previewTarget = -1; // -1 = player, 0..3 = coworker

class Previewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, canvas.clientWidth / canvas.clientHeight, 0.1, 50);
    this.camera.position.set(0, 1.0, 4.6);
    this.camera.lookAt(0, 0.85, 0);
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
        this.char.update(dt, { speed: 0, cover: !this.legwear });
      }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
  async show(opts) {
    const tok = ++this.token;
    const ch = await createCharacter(opts);
    if (tok !== this.token) {
      ch.dispose();
      return;
    }
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

async function refreshPreview() {
  if (!previewer) return;
  const c = previewTarget < 0 ? draft : draft.coworkers[previewTarget];
  const label = document.getElementById('pv-label');
  if (label) label.textContent = previewTarget < 0 ? `${draft.name || 'You'}` : `${c.name} (coworker)`;
  await previewer.show({
    vrm: c.model ? await getBlob(c.model.key) : null,
    legwearMaterials: c.model ? c.model.legwearMaterials : null,
    underwearOverlay: c.model ? c.model.underwearOverlay !== false : true,
    colors: c.colors,
    legwearType: c.legwearType,
  });
}

function swatches(kind, current, attr) {
  return `<div class="swatches">${COLORS[kind]
    .map((c) => `<div class="swatch ${c === current ? 'on' : ''}" style="background:${c}" data-${attr}="${c}"></div>`)
    .join('')}</div>`;
}

function matList(model, prefix) {
  if (!model) return '';
  return `<div class="matlist">${model.materials
    .map(
      (m, i) => `<label><input type="checkbox" data-${prefix}mat="${i}" ${model.legwearMaterials.includes(m) ? 'checked' : ''}/> ${esc(m)}</label>`
    )
    .join('')}</div>`;
}

async function importVRM(file) {
  const buf = await file.arrayBuffer();
  const info = await inspectVRM(buf);
  const key = 'vrm-' + newId();
  await storage.putBlob(key, buf);
  blobCache.set(key, buf);
  return { key, title: info.title || file.name, file: file.name, materials: info.materials, legwearMaterials: info.autoLegwear, underwearOverlay: true };
}

function pickFile() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.vrm,.glb';
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}

function stepsBar() {
  const names = ['1. Your Character', '2. Your Job', '3. Coworkers', '4. Ready'];
  return `<div class="steps">${names.map((n, i) => `<div class="${i === step ? 'on' : ''}">${n}</div>`).join('')}</div>`;
}

function showCreator() {
  draft = defaultDraft();
  step = 0;
  previewTarget = -1;
  renderCreator();
}

function renderCreator() {
  if (previewer) {
    previewer.dispose();
    previewer = null;
  }
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
          <div class="row" style="margin-top:8px"><b id="pv-label"></b>
          <button class="secondary" id="pv-toggle">Preview mishap</button></div>
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
    if (step === 0) previewTarget = -1;
    else if (previewTarget < 0) previewTarget = 0;
    refreshPreview();
  }
  s.querySelector('#c-back').onclick = () => {
    if (step === 0) {
      if (previewer) previewer.dispose();
      previewer = null;
      showTitle();
    } else {
      step--;
      renderCreator();
    }
  };
  s.querySelector('#c-next').onclick = async () => {
    if (step === 0 && !draft.name.trim()) return ui.dialog('Name needed', 'Please enter a name for your character.');
    if (step === 2) {
      if (!draft.coworkers.some((c) => c.enabled)) return ui.dialog('Coworkers needed', 'Enable at least one coworker.');
      if (draft.coworkers.some((c) => c.enabled && !c.name.trim())) return ui.dialog('Names needed', 'Every coworker needs a name.');
    }
    if (step === 3) return beginNewGame();
    step++;
    renderCreator();
  };
  bindCreator(s);
}

function creatorProfile() {
  const m = draft.model;
  return `
    <label>Character name</label>
    <input type="text" id="f-name" maxlength="20" value="${esc(draft.name)}" />
    <label>Usual legwear</label>
    <select id="f-lw"><option value="pants" ${draft.legwearType === 'pants' ? 'selected' : ''}>Pants</option>
      <option value="skirt" ${draft.legwearType === 'skirt' ? 'selected' : ''}>Skirt</option></select>
    <label>3D model</label>
    <div class="row">
      <button id="f-import">${m ? 'Replace VRM...' : 'Import .vrm model...'}</button>
      ${m ? `<button class="secondary" id="f-remove">Use default model</button>` : ''}
    </div>
    <div class="note" id="f-status">${m ? `Loaded: <b>${esc(m.title)}</b> (${esc(m.file)})` : 'No VRM imported — using the built-in default character.'}</div>
    ${
      m
        ? `<label>Which parts are legwear? (hidden after the mishap)</label>${matList(m, 'p')}
      <label><input type="checkbox" id="f-uw" ${m.underwearOverlay !== false ? 'checked' : ''}/> Add simple underwear overlay (for models without underwear in their texture)</label>
      <p class="note">Tip: export from VRoid Studio without "delete hidden body parts" so the legs are complete under the clothes.</p>`
        : `<label>Skin</label>${swatches('skin', draft.colors.skin, 'skin')}
      <label>Hair</label>${swatches('hair', draft.colors.hair, 'hair')}
      <label>Top</label>${swatches('top', draft.colors.top, 'top')}
      <label>Pants / skirt</label>${swatches('bottom', draft.colors.bottom, 'bottom')}`
    }
    <label>Underwear color</label>${swatches('under', draft.colors.under, 'under')}`;
}

function creatorJob() {
  return `<div class="cards">${Object.entries(JOBS)
    .map(
      ([k, j]) => `<div class="card ${draft.job === k ? 'on' : ''}" data-job="${k}"><h3>${esc(j.label)}</h3><p>${esc(j.desc)}</p>
      <p style="margin-top:8px;color:#ffd36e">${esc(j.workplaceName)}</p></div>`
    )
    .join('')}</div>`;
}

function creatorCoworkers() {
  const roles = JOBS[draft.job].roles;
  return `<p class="note" style="margin-top:0">Your coworkers' personalities decide how they react if they catch you.</p>
  <div class="cw-grid">${draft.coworkers
    .map(
      (c, i) => `<div class="cw ${c.enabled ? '' : 'off'}">
      <h4><span>${esc(roles[i])}</span><label style="margin:0"><input type="checkbox" data-cwen="${i}" ${c.enabled ? 'checked' : ''}/> Include</label></h4>
      <label>Name</label><input type="text" maxlength="16" data-cwname="${i}" value="${esc(c.name)}" />
      <label>Personality</label>
      <select data-cwpers="${i}">${Object.entries(PERSONALITIES)
        .map(([k, p]) => `<option value="${k}" ${c.personality === k ? 'selected' : ''}>${esc(p.label)}</option>`)
        .join('')}</select>
      <div class="note">${esc(PERSONALITIES[c.personality].desc)}</div>
      <label>Legwear</label>
      <select data-cwlw="${i}"><option value="pants" ${c.legwearType === 'pants' ? 'selected' : ''}>Pants</option><option value="skirt" ${c.legwearType === 'skirt' ? 'selected' : ''}>Skirt</option></select>
      <div class="row" style="margin-top:10px">
        <button class="secondary" data-cwimp="${i}">${c.model ? 'Replace VRM' : 'Import VRM'}</button>
        ${c.model ? `<button class="secondary" data-cwrm="${i}">Default</button>` : `<button class="secondary" data-cwrand="${i}">Randomize</button>`}
        <button data-cwpv="${i}">Preview</button>
      </div>
      ${c.model ? `<div class="note">Model: ${esc(c.model.title)}</div><details><summary class="note">Legwear parts</summary>${matList(c.model, 'c' + i)}</details>` : ''}
    </div>`
    )
    .join('')}</div>`;
}

function creatorSummary() {
  const cws = draft.coworkers.filter((c) => c.enabled);
  return `<div class="textblock" style="font-size:16px">
<b>${esc(draft.name)}</b> — ${esc(JOBS[draft.job].label)} at <b>${esc(JOBS[draft.job].workplaceName)}</b>
Model: ${draft.model ? esc(draft.model.title) : 'Built-in default'} · Usual legwear: ${draft.legwearType}

Coworkers:
${cws.map((c) => `  • ${esc(c.name)} — ${esc(PERSONALITIES[c.personality].label)}`).join('\n')}

Goal: survive three workdays without getting fired, and without your Shame meter filling up.</div>`;
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
    s.querySelector('#f-lw').onchange = (e) => {
      draft.legwearType = e.target.value;
      refreshPreview();
    };
    s.querySelector('#f-import').onclick = async () => {
      const f = await pickFile();
      if (!f) return;
      s.querySelector('#f-status').textContent = 'Loading ' + f.name + '...';
      try {
        draft.model = await importVRM(f);
        renderCreator();
      } catch (e) {
        s.querySelector('#f-status').textContent = 'Could not load that file: ' + e.message;
      }
    };
    const rm = s.querySelector('#f-remove');
    if (rm) rm.onclick = () => ((draft.model = null), renderCreator());
    const uw = s.querySelector('#f-uw');
    if (uw) uw.onchange = () => ((draft.model.underwearOverlay = uw.checked), refreshPreview());
    q('[data-pmat]').forEach((el) => {
      el.onchange = () => {
        const name = draft.model.materials[+el.dataset.pmat];
        const set = new Set(draft.model.legwearMaterials);
        if (el.checked) set.add(name);
        else set.delete(name);
        draft.model.legwearMaterials = [...set];
        refreshPreview();
      };
    });
    for (const k of ['skin', 'hair', 'top', 'bottom', 'under']) {
      q(`[data-${k}]`).forEach((el) => {
        el.onclick = () => {
          draft.colors[k] = el.dataset[k];
          q(`[data-${k}]`).forEach((o) => o.classList.toggle('on', o === el));
          refreshPreview();
        };
      });
    }
  } else if (step === 1) {
    q('[data-job]').forEach((el) => {
      el.onclick = () => {
        draft.job = el.dataset.job;
        renderCreator();
      };
    });
  } else if (step === 2) {
    q('[data-cwen]').forEach((el) => (el.onchange = () => ((draft.coworkers[+el.dataset.cwen].enabled = el.checked), renderCreator())));
    q('[data-cwname]').forEach((el) => (el.oninput = () => (draft.coworkers[+el.dataset.cwname].name = el.value)));
    q('[data-cwpers]').forEach((el) => (el.onchange = () => ((draft.coworkers[+el.dataset.cwpers].personality = el.value), renderCreator())));
    q('[data-cwlw]').forEach(
      (el) =>
        (el.onchange = () => {
          draft.coworkers[+el.dataset.cwlw].legwearType = el.value;
          previewTarget = +el.dataset.cwlw;
          refreshPreview();
        })
    );
    q('[data-cwpv]').forEach((el) => (el.onclick = () => ((previewTarget = +el.dataset.cwpv), refreshPreview())));
    q('[data-cwrand]').forEach(
      (el) =>
        (el.onclick = () => {
          const i = +el.dataset.cwrand;
          draft.coworkers[i].colors = randomColors();
          previewTarget = i;
          refreshPreview();
        })
    );
    q('[data-cwrm]').forEach((el) => (el.onclick = () => ((draft.coworkers[+el.dataset.cwrm].model = null), renderCreator())));
    q('[data-cwimp]').forEach(
      (el) =>
        (el.onclick = async () => {
          const i = +el.dataset.cwimp;
          const f = await pickFile();
          if (!f) return;
          el.textContent = 'Loading...';
          try {
            draft.coworkers[i].model = await importVRM(f);
            previewTarget = i;
            renderCreator();
          } catch (e) {
            el.textContent = 'Import VRM';
            ui.dialog('Import failed', 'Could not load that file: ' + e.message);
          }
        })
    );
    draft.coworkers.forEach((c, i) => {
      if (!c.model) return;
      q(`[data-c${i}mat]`).forEach((el) => {
        el.onchange = () => {
          const name = c.model.materials[+el.dataset[`c${i}mat`]];
          const set = new Set(c.model.legwearMaterials);
          if (el.checked) set.add(name);
          else set.delete(name);
          c.model.legwearMaterials = [...set];
          previewTarget = i;
          refreshPreview();
        };
      });
    });
  }
}

async function beginNewGame() {
  if (previewer) previewer.dispose();
  previewer = null;
  const profile = {
    name: draft.name.trim(),
    legwearType: draft.legwearType,
    colors: draft.colors,
    model: draft.model,
    job: draft.job,
    coworkers: draft.coworkers
      .filter((c) => c.enabled)
      .map((c) => ({ name: c.name.trim(), personality: c.personality, legwearType: c.legwearType, colors: c.colors, model: c.model })),
  };
  // Clean up model files that the old profile used but the new one doesn't.
  try {
    const old = await storage.get('profile');
    if (old) {
      const keep = new Set([profile.model?.key, ...profile.coworkers.map((c) => c.model?.key)].filter(Boolean));
      const oldKeys = [old.model?.key, ...(old.coworkers || []).map((c) => c.model?.key)].filter(Boolean);
      for (const k of oldKeys) if (!keep.has(k)) await storage.deleteBlob(k);
    }
  } catch (_) {}
  const save = { day: 1, shame: 0, cw: profile.coworkers.map(() => ({ ally: false, warned: false })) };
  await storage.set('profile', profile);
  await storage.set('save', save);
  startGame(profile, save);
}

// ---------------------------------------------------------------------------
// Game
async function startGame(profile, save) {
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
    game = new Game(canvas, profile, save, onGameEnd);
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
    await storage.del('save');
    const s = ui.setScreen(`
      <div class="panel" style="max-width:720px;text-align:center">
        <h1 style="color:#55efc4;margin-top:0">You Survived!</h1>
        <p class="textblock" style="margin:0 auto">${esc(r.text)}</p>
        <p>Final shame: <b>${Math.round(r.shame)}%</b></p>
        <div class="menu"><button id="e-title">Back to Title</button></div>
      </div>`);
    s.querySelector('#e-title').onclick = showTitle;
    return;
  }
  const save = await storage.get('save');
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
  if (save) s.querySelector('#e-retry').onclick = () => startGame(profile, save);
  s.querySelector('#e-title').onclick = showTitle;
}

showTitle();
