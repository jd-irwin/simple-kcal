// Pure calculation functions. No DOM, no storage, no randomness, no side effects.
// Loaded as a classic script in the browser (window.Calc) and via require() in node.

(function () {
  'use strict';

  const MACROS = ['protein', 'carbs', 'fat'];
  const DAY_MS = 24 * 60 * 60 * 1000;

  // ---------- Dates (local calendar dates, never UTC) ----------

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  // Date -> 'YYYY-MM-DD' in the device's local time zone.
  function dateKey(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function parseKey(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) throw new Error('Invalid date key: ' + key);
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }

  // Add n calendar days. Built at local noon so DST changes can never shift the day.
  function addDays(key, n) {
    const p = parseKey(key);
    return dateKey(new Date(p.y, p.m - 1, p.d + n, 12));
  }

  // 'YYYY-MM-DD' -> 'DD/MM/YYYY'
  function formatDate(key) {
    const p = parseKey(key);
    return pad2(p.d) + '/' + pad2(p.m) + '/' + p.y;
  }

  // ---------- Scaling ----------

  function isNum(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  function scaleNullable(v, factor) {
    return isNum(v) ? v * factor : null;
  }

  function scaleValues(vals, factor) {
    const out = { kcal: scaleNullable(vals.kcal, factor) };
    MACROS.forEach((k) => { out[k] = scaleNullable(vals[k], factor); });
    return out;
  }

  // Values for qty of a food. unit '100g': qty is grams. unit 'item': qty is a count.
  function foodValues(food, qty) {
    const factor = food.unit === '100g' ? qty / 100 : qty;
    return scaleValues(food, factor);
  }

  // ---------- Daily totals ----------

  // Sums only known values. Each macro reports how many entries had a value,
  // and total is null when none did, so a missing value is never shown as zero.
  function sumEntries(entries) {
    const result = { count: entries.length, kcal: 0 };
    MACROS.forEach((k) => { result[k] = { total: null, known: 0 }; });
    entries.forEach((e) => {
      if (isNum(e.kcal)) result.kcal += e.kcal;
      MACROS.forEach((k) => {
        if (isNum(e[k])) {
          result[k].total = (result[k].total || 0) + e[k];
          result[k].known += 1;
        }
      });
    });
    return result;
  }

  // ---------- Recipes ----------

  // Totals for the whole batch. Ingredient values are per 100 g.
  // A macro total is null unless every ingredient has that macro, because a
  // partial sum would silently understate it.
  function recipeTotals(ingredients) {
    const out = { kcal: 0, rawWeight: 0 };
    MACROS.forEach((k) => { out[k] = 0; });
    ingredients.forEach((ing) => {
      const f = ing.grams / 100;
      out.rawWeight += ing.grams;
      out.kcal += ing.kcalPer100g * f;
      MACROS.forEach((k) => {
        out[k] = out[k] === null || !isNum(ing[k]) ? null : out[k] + ing[k] * f;
      });
    });
    return out;
  }

  function divideValues(vals, divisor) {
    if (!isNum(divisor) || divisor <= 0) {
      return { kcal: null, protein: null, carbs: null, fat: null };
    }
    return scaleValues(vals, 1 / divisor);
  }

  function recipePerGram(recipe) {
    return divideValues(recipeTotals(recipe.ingredients), recipe.cookedWeight);
  }

  function recipePerPortion(recipe) {
    return divideValues(recipeTotals(recipe.ingredients), recipe.portions);
  }

  // Values for a log entry: by { portions } (fractions allowed) or by { grams } of the cooked batch.
  function recipeServing(recipe, amount) {
    if (amount && isNum(amount.portions)) {
      return scaleValues(recipePerPortion(recipe), amount.portions);
    }
    if (amount && isNum(amount.grams)) {
      return scaleValues(recipePerGram(recipe), amount.grams);
    }
    throw new Error('recipeServing needs { portions } or { grams }');
  }

  // ---------- Display (round for display only) ----------

  const DASH = '–';

  function fmtKcal(n) {
    return isNum(n) ? String(Math.round(n)) : DASH;
  }

  function fmtMacro(n) {
    return isNum(n) ? String(Math.round(n * 10) / 10) : DASH;
  }

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // 'Fri 20/11/2026'
  function weekdayDate(key) {
    const p = parseKey(key);
    const wd = WEEKDAYS[new Date(p.y, p.m - 1, p.d, 12).getDay()];
    return wd + ' ' + formatDate(key);
  }

  // 'Today', 'Yesterday', 'Tomorrow', or 'Thu 12/11/2026'
  function dayTitle(key, todayKey) {
    if (key === todayKey) return 'Today';
    if (key === addDays(todayKey, -1)) return 'Yesterday';
    if (key === addDays(todayKey, 1)) return 'Tomorrow';
    return weekdayDate(key);
  }

  // Quantity for display: up to 2 decimal places, no trailing zeros.
  function fmtQty(n) {
    return String(Math.round(n * 100) / 100);
  }

  // '150 g', '1 item', '2.5 items'
  function formatAmount(qty, unit) {
    if (unit === '100g') return fmtQty(qty) + ' g';
    return fmtQty(qty) + (qty === 1 ? ' item' : ' items');
  }

  // ---------- Input parsing ----------

  // '' -> null, '12.5' or '12,5' -> 12.5, anything else (including negatives) -> NaN.
  function parseNumber(str) {
    const s = String(str == null ? '' : str).trim().replace(',', '.');
    if (s === '') return null;
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return Number(s);
  }

  // ---------- Lists ----------

  function entriesForDate(entries, key) {
    return entries
      .filter((e) => e.date === key)
      .sort((a, b) => (a.created || 0) - (b.created || 0));
  }

  function byRecent(a, b) {
    return (b.lastUsed || 0) - (a.lastUsed || 0) || a.name.localeCompare(b.name);
  }

  function byName(a, b) {
    return a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' });
  }

  // Every word of the query must appear somewhere in the name. Case-insensitive.
  function matchesQuery(name, query) {
    const n = name.toLowerCase();
    return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => n.includes(w));
  }

  // Search results (or everything, if the query is blank) sorted most recently used first.
  function searchRecent(items, query) {
    return items.filter((it) => matchesQuery(it.name, query || '')).sort(byRecent);
  }

  // Search results (or everything) sorted by name, for the Library.
  function searchByName(items, query) {
    return items.filter((it) => matchesQuery(it.name, query || '')).sort(byName);
  }

  // Starting amount when logging a saved food: the last amount used, or 100 g / 1 item.
  function defaultQty(food) {
    if (isNum(food.lastQty) && food.lastQty > 0) return food.lastQty;
    return food.unit === '100g' ? 100 : 1;
  }

  // 'none' (no entry has it), 'partial' (some do) or 'complete'.
  function macroStatus(macroTotal, count) {
    if (macroTotal.known === 0) return 'none';
    return macroTotal.known < count ? 'partial' : 'complete';
  }

  // ---------- Data, migration, backup ----------

  const SCHEMA_VERSION = 1;
  const APP_ID = 'batch-kcal';

  function emptyData() {
    return {
      schemaVersion: SCHEMA_VERSION,
      foods: [],
      recipes: [],
      entries: [],
      settings: { lastBackup: null, persistRequested: false },
    };
  }

  // migrations[n] takes data at version n and returns data at version n + 1.
  const migrations = {};

  function migrate(input) {
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
    const defaults = emptyData().settings;
    return {
      schemaVersion: SCHEMA_VERSION,
      foods: data.foods,
      recipes: data.recipes,
      entries: data.entries,
      settings: Object.assign({}, defaults, data.settings || {}),
    };
  }

  function countData(data) {
    return { foods: data.foods.length, recipes: data.recipes.length, entries: data.entries.length };
  }

  function buildExport(data, nowIso) {
    return {
      app: APP_ID,
      schemaVersion: data.schemaVersion,
      exportedAt: nowIso,
      foods: data.foods,
      recipes: data.recipes,
      entries: data.entries,
    };
  }

  // Parses a backup file's text. Returns { data, counts, exportedAt } or throws a readable Error.
  function parseImport(text) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      throw new Error('That file could not be read. Choose a backup file exported from this app.');
    }
    if (!obj || typeof obj !== 'object' || obj.app !== APP_ID) {
      throw new Error('That file is not a Batch kcal backup.');
    }
    const data = migrate({
      schemaVersion: obj.schemaVersion,
      foods: obj.foods,
      recipes: obj.recipes,
      entries: obj.entries,
    });
    const exportedAt = typeof obj.exportedAt === 'string' ? obj.exportedAt : null;
    return { data, counts: countData(data), exportedAt };
  }

  function isBackupStale(lastBackupIso, nowMs, days) {
    if (days === undefined) days = 7;
    if (!lastBackupIso) return true;
    const t = Date.parse(lastBackupIso);
    if (Number.isNaN(t)) return true;
    return nowMs - t > days * DAY_MS;
  }

  const Calc = {
    dateKey, addDays, formatDate, weekdayDate, dayTitle,
    fmtQty, formatAmount, parseNumber,
    entriesForDate, searchRecent, searchByName, defaultQty, macroStatus,
    scaleNullable, foodValues,
    sumEntries,
    recipeTotals, recipePerGram, recipePerPortion, recipeServing,
    fmtKcal, fmtMacro,
    SCHEMA_VERSION, emptyData, migrate, countData, buildExport, parseImport, isBackupStale,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Calc;
  } else {
    window.Calc = Calc;
  }
})();
