// Loading model files: bundled .vrm files (shipped with the game) or models the
// player imported (stored in IndexedDB).
import { storage } from './storage.js';

const assetCache = new Map();

export async function readAsset(name) {
  if (assetCache.has(name)) return assetCache.get(name);
  const p = (async () => {
    if (window.gameAPI && window.gameAPI.readAsset) {
      const u8 = await window.gameAPI.readAsset(name);
      return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    }
    const r = await fetch('models/' + encodeURIComponent(name));
    if (!r.ok) throw new Error('Missing bundled model ' + name);
    return r.arrayBuffer();
  })();
  assetCache.set(name, p);
  try {
    return await p;
  } catch (e) {
    assetCache.delete(name);
    throw e;
  }
}

/** model: {asset} for bundled files, {key} for imported ones. */
export async function modelBuffer(model) {
  if (!model) return null;
  try {
    if (model.asset) return await readAsset(model.asset);
    if (model.key) return await storage.getBlob(model.key);
  } catch (e) {
    console.warn('Could not load model', model, e);
  }
  return null;
}

export function modelKey(model) {
  if (!model) return null;
  return model.asset ? 'asset:' + model.asset : model.key || null;
}
