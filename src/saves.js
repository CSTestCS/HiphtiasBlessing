// Multiple save slots. Each slot has its own profile (characters, job) and save
// (day, shame, coworker states). Slot metadata is kept in a list for menus.
import { storage, newId } from './storage.js';

export async function listSlots() {
  await migrateLegacy();
  const slots = (await storage.get('slots')) || [];
  return slots.sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

async function putSlots(slots) {
  await storage.set('slots', slots);
}

export async function loadSlot(id) {
  return { profile: await storage.get('profile:' + id), save: await storage.get('save:' + id) };
}

export async function createSlot(profile, save) {
  const id = 'slot-' + newId();
  await storage.set('profile:' + id, profile);
  await storage.set('save:' + id, save);
  const slots = (await storage.get('slots')) || [];
  slots.push(meta(id, profile, save));
  await putSlots(slots);
  return id;
}

function meta(id, profile, save) {
  return { id, name: profile.name, job: profile.job, day: save?.day || 1, updated: Date.now(), done: !!save?.done };
}

export async function writeProfile(id, profile) {
  await storage.set('profile:' + id, profile);
}

export async function writeSave(id, save) {
  await storage.set('save:' + id, save);
  const profile = await storage.get('profile:' + id);
  const slots = (await storage.get('slots')) || [];
  const i = slots.findIndex((s) => s.id === id);
  const m = meta(id, profile || { name: '?', job: 'office' }, save);
  if (i >= 0) slots[i] = m;
  else slots.push(m);
  await putSlots(slots);
}

/** Model keys used by a profile (imported .vrm files stored in the database). */
export function modelKeys(profile) {
  const keys = [];
  if (!profile) return keys;
  for (const d of [profile.player, profile.manager, ...(profile.coworkers || [])]) {
    for (const o of d?.outfits || []) {
      if (o.model?.key) keys.push(o.model.key);
      if (o.clothesFrom?.key) keys.push(o.clothesFrom.key);
      for (const pc of o.pieces || []) if (pc.src?.key) keys.push(pc.src.key);
    }
  }
  for (const f of profile.former || []) {
    for (const o of f.def?.outfits || []) {
      if (o.model?.key) keys.push(o.model.key);
      if (o.clothesFrom?.key) keys.push(o.clothesFrom.key);
    }
  }
  return keys;
}

export async function deleteSlot(id) {
  const { profile } = await loadSlot(id);
  await storage.del('profile:' + id);
  await storage.del('save:' + id);
  const slots = ((await storage.get('slots')) || []).filter((s) => s.id !== id);
  await putSlots(slots);
  // delete model files no other slot (or the settings) still uses
  const used = new Set();
  for (const s of slots) modelKeys((await loadSlot(s.id)).profile).forEach((k) => used.add(k));
  const settings = (await storage.get('settings')) || {};
  for (const c of settings.civilians || []) used.add(c.key);
  if (settings.celesti?.key) used.add(settings.celesti.key);
  for (const k of modelKeys(profile)) if (!used.has(k)) await storage.deleteBlob(k);
}

/** Coworkers (and managers) from all other save slots, to appear as townsfolk. */
export async function otherSlotPeople(exceptId) {
  const out = [];
  for (const s of (await storage.get('slots')) || []) {
    if (s.id === exceptId) continue;
    const { profile } = await loadSlot(s.id);
    if (!profile) continue;
    for (const c of profile.coworkers || []) out.push({ name: c.name, def: c, from: profile.name });
    // people who were fired or replaced there still exist
    for (const f of profile.former || []) if (f.def) out.push({ name: f.name, def: f.def, from: profile.name });
  }
  return out;
}

let migrated = false;
async function migrateLegacy() {
  if (migrated) return;
  migrated = true;
  const p = await storage.get('profile');
  if (!p) return;
  const s = (await storage.get('save')) || { day: 1, shame: 0 };
  await createSlot(p, s);
  await storage.del('profile');
  await storage.del('save');
}
