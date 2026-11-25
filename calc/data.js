// Stored data: schema version, migration, validation, backup export and import.

import { isNum, scaleValues } from './values.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const SCHEMA_VERSION = 3;

const APP_ID = 'simple-kcal';

// Backups exported before the rename carry the old id and must still import.
const ACCEPTED_APP_IDS = [APP_ID, 'batch-kcal'];

export function emptyData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    foods: [],
    recipes: [],
    entries: [],
    // Daily kcal target, or null for none. Part of the data (and backups), unlike settings.
    targetKcal: null,
    settings: { lastBackup: null, persistRequested: false },
  };
}

// migrations[n] takes data at version n and returns data at version n + 1.
const migrations = {};

// v1 entries stored scaled totals plus amount text ('150 g', '2 items').
// v2 entries store quantity, unit, perAmount and per-unit values.
function migrateEntryV1(e) {
  const out = Object.assign({}, e);
  delete out.amount;
  const totals = { kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat };
  if (e.source !== 'quick') {
    const m = /^\s*(\d+(?:\.\d+)?)\s*(g|items?|portions?)\s*$/i.exec(e.amount || '');
    const q = m ? Number(m[1]) : 0;
    if (q > 0) {
      const word = m[2].toLowerCase();
      const unit = word === 'g' ? 'g' : word.startsWith('item') ? 'item' : 'portion';
      const perAmount = unit === 'g' ? 100 : 1;
      return Object.assign(out, { quantity: q, unit: unit, perAmount: perAmount },
        scaleValues(totals, perAmount / q));
    }
  }
  // Quick add, or an amount that cannot be read: keep the totals as they are.
  return Object.assign(out, { quantity: 1, unit: 'quick', perAmount: 1 }, scaleValues(totals, 1));
}

migrations[1] = function (d) {
  return Object.assign({}, d, {
    schemaVersion: 2,
    foods: Array.isArray(d.foods)
      ? d.foods.map((f) => { const c = Object.assign({}, f); delete c.lastQty; return c; })
      : d.foods,
    entries: Array.isArray(d.entries) ? d.entries.map(migrateEntryV1) : d.entries,
  });
};

// v3 adds the optional daily kcal target.
migrations[2] = function (d) {
  return Object.assign({}, d, { schemaVersion: 3, targetKcal: null });
};

export function migrate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('The data is not in a format this app recognises.');
  }
  const v = input.schemaVersion;
  if (!Number.isInteger(v) || v < 1) {
    throw new Error('The data has no valid schema version.');
  }
  if (v > SCHEMA_VERSION) {
    throw new Error('The data was made by a newer version of this app. Update the app and try again.');
  }
  let data = input;
  for (let n = v; n < SCHEMA_VERSION; n++) {
    data = migrations[n](data);
  }
  ['foods', 'recipes', 'entries'].forEach((k) => {
    if (!Array.isArray(data[k])) throw new Error('The data is missing its list of ' + k + '.');
  });
  const foods = data.foods.filter(isValidFood);
  const recipes = data.recipes.filter(isValidRecipe).map((r) =>
    Object.assign({}, r, { ingredients: r.ingredients.filter(isValidIngredient) }));
  const entries = data.entries.filter(isValidEntry);
  const ingredientsDropped = data.recipes.filter(isValidRecipe)
    .reduce((n, r) => n + r.ingredients.length, 0) -
    recipes.reduce((n, r) => n + r.ingredients.length, 0);
  const skipped = data.foods.length - foods.length + data.recipes.length - recipes.length +
    data.entries.length - entries.length + ingredientsDropped;
  const defaults = emptyData().settings;
  const out = {
    schemaVersion: SCHEMA_VERSION,
    foods: foods,
    recipes: recipes,
    entries: entries,
    targetKcal: isValidTarget(data.targetKcal) ? data.targetKcal : null,
    settings: Object.assign({}, defaults, isObject(data.settings) ? data.settings : {}),
  };
  // Not stored: how many unreadable records were dropped, so the UI can say so.
  Object.defineProperty(out, 'skipped', { value: skipped, enumerable: false });
  return out;
}

// Records that cannot be shown or used are dropped on load and import rather than
// crashing a screen. The checks are deliberately minimal.
function isObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function isValidTarget(t) {
  return isNum(t) && t >= 1;
}

function isValidFood(f) {
  return isObject(f) && typeof f.id === 'string' && typeof f.name === 'string' &&
    (f.unit === '100g' || f.unit === 'item') && isNum(f.kcal);
}

function isValidIngredient(i) {
  return isObject(i) && typeof i.name === 'string' && (i.unit === '100g' || i.unit === 'item') &&
    isNum(i.amount) && isNum(i.kcal);
}

function isValidRecipe(r) {
  return isObject(r) && typeof r.id === 'string' && typeof r.name === 'string' &&
    Array.isArray(r.ingredients);
}

function isValidEntry(e) {
  return isObject(e) && typeof e.id === 'string' && typeof e.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.date) && isNum(e.quantity) && isNum(e.perAmount);
}

export function countData(data) {
  return { foods: data.foods.length, recipes: data.recipes.length, entries: data.entries.length };
}

export function buildExport(data, nowIso) {
  return {
    app: APP_ID,
    schemaVersion: data.schemaVersion,
    exportedAt: nowIso,
    foods: data.foods,
    recipes: data.recipes,
    entries: data.entries,
    targetKcal: isValidTarget(data.targetKcal) ? data.targetKcal : null,
  };
}

// Parses a backup file's text. Returns { data, counts, exportedAt } or throws a readable Error.
export function parseImport(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    throw new Error('That file could not be read. Choose a backup file exported from this app.');
  }
  if (!obj || typeof obj !== 'object' || !ACCEPTED_APP_IDS.includes(obj.app)) {
    throw new Error('That file is not a simple-kcal backup.');
  }
  const data = migrate({
    schemaVersion: obj.schemaVersion,
    foods: obj.foods,
    recipes: obj.recipes,
    entries: obj.entries,
    targetKcal: obj.targetKcal,
  });
  const exportedAt = typeof obj.exportedAt === 'string' ? obj.exportedAt : null;
  return { data, counts: countData(data), exportedAt, skipped: data.skipped };
}

export function isBackupStale(lastBackupIso, nowMs, days) {
  if (days === undefined) days = 7;
  if (!lastBackupIso) return true;
  const t = Date.parse(lastBackupIso);
  if (Number.isNaN(t)) return true;
  return nowMs - t > days * DAY_MS;
}
