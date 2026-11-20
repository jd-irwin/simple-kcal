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

  function orNull(v) {
    return isNum(v) ? v : null;
  }

  // ---------- Log entries ----------
  // An entry stores quantity, unit, perAmount and the nutrition for perAmount units.
  // Totals are always value x quantity / perAmount and are never stored.

  // Entry unit for a saved food's unit: '100g' -> 'g', 'item' -> 'item'.
  function foodEntryUnit(food) {
    return food.unit === '100g' ? 'g' : 'item';
  }

  function entryTotals(entry) {
    if (!isNum(entry.quantity) || !isNum(entry.perAmount) || entry.perAmount <= 0) {
      return { kcal: null, protein: null, carbs: null, fat: null };
    }
    return scaleValues(entry, entry.quantity / entry.perAmount);
  }

  // Entry fields (without id, date or created) for quantity of a food.
  // sourceId is the saved food's id, or null for an unsaved food.
  function entryFromFood(food, quantity, sourceId) {
    const unit = foodEntryUnit(food);
    return {
      name: food.name,
      source: 'food',
      sourceId: sourceId || null,
      quantity: quantity,
      unit: unit,
      perAmount: unit === 'g' ? 100 : 1,
      kcal: food.kcal,
      protein: orNull(food.protein),
      carbs: orNull(food.carbs),
      fat: orNull(food.fat),
    };
  }

  // Entry fields for a quick add. Its values are the totals.
  function entryFromQuick(v) {
    return {
      name: v.name || '',
      source: 'quick',
      sourceId: null,
      quantity: 1,
      unit: 'quick',
      perAmount: 1,
      kcal: v.kcal,
      protein: orNull(v.protein),
      carbs: orNull(v.carbs),
      fat: orNull(v.fat),
    };
  }

  // A copy of the entry with a new quantity. Per-unit values are untouched; nothing is looked up.
  function setEntryQuantity(entry, quantity) {
    return Object.assign({}, entry, { quantity: quantity });
  }

  // A copy of the entry with new per-unit values. Quantity, unit and perAmount are kept.
  function setEntryNutrition(entry, v) {
    return Object.assign({}, entry, {
      kcal: v.kcal,
      protein: orNull(v.protein),
      carbs: orNull(v.carbs),
      fat: orNull(v.fat),
    });
  }

  // True if a food's unit or per-unit values differ (null and missing count as equal).
  function nutritionChanged(a, b) {
    if (a.unit !== b.unit) return true;
    return ['kcal'].concat(MACROS).some((k) => orNull(a[k]) !== orNull(b[k]));
  }

  function isRecipe(item) {
    return !!item && Array.isArray(item.ingredients);
  }

  // True if the entry was logged from this saved food or recipe and can still take its values:
  // a food entry's unit must match the food's; a recipe entry by grams needs a cooked weight.
  function isLinked(entry, item) {
    if (!entry.sourceId || entry.sourceId !== item.id) return false;
    if (isRecipe(item)) {
      if (entry.source !== 'recipe') return false;
      if (entry.unit === 'portion') return isNum(item.portions) && item.portions > 0;
      if (entry.unit === 'g') return recipeCanLogGrams(item);
      return false;
    }
    return entry.source === 'food' && entry.unit === foodEntryUnit(item);
  }

  function linkedEntryCounts(entries, item, todayKey) {
    let all = 0;
    let today = 0;
    entries.forEach((e) => {
      if (!isLinked(e, item)) return;
      all++;
      if (e.date === todayKey) today++;
    });
    return { today: today, all: all };
  }

  // scope: 'none', 'today' or 'all'. Copies a saved food's or recipe's current per-unit values onto
  // linked entries, leaving quantities alone. Returns a new array; other entries are returned unchanged.
  function applyToEntries(entries, item, scope, todayKey) {
    return entries.map((e) => {
      if (scope === 'none' || !isLinked(e, item)) return e;
      if (scope === 'today' && e.date !== todayKey) return e;
      const v = isRecipe(item) ? recipeUnitValues(item, e.unit) : item;
      return Object.assign({}, e, {
        kcal: v.kcal,
        protein: orNull(v.protein),
        carbs: orNull(v.carbs),
        fat: orNull(v.fat),
      });
    });
  }

  // ---------- Daily totals ----------

  // Sums only known values. Each macro reports how many entries had a value,
  // and total is null when none did, so a missing value is never shown as zero.
  function sumEntries(entries) {
    const result = { count: entries.length, kcal: 0 };
    MACROS.forEach((k) => { result[k] = { total: null, known: 0 }; });
    entries.forEach((entry) => {
      const t = entryTotals(entry);
      if (isNum(t.kcal)) result.kcal += t.kcal;
      MACROS.forEach((k) => {
        if (isNum(t[k])) {
          result[k].total = (result[k].total || 0) + t[k];
          result[k].known += 1;
        }
      });
    });
    return result;
  }

  // ---------- Recipes ----------
  // Ingredient: { name, unit: '100g' | 'item', amount, kcal, protein, carbs, fat }.
  // Like a food, the values are per 100 g or per item; amount is grams or number of items.
  // Ingredients are copies, so editing a saved food never changes a recipe.

  function ingredientFromFood(food, amount) {
    return {
      name: food.name,
      unit: food.unit === 'item' ? 'item' : '100g',
      amount: amount,
      kcal: food.kcal,
      protein: orNull(food.protein),
      carbs: orNull(food.carbs),
      fat: orNull(food.fat),
    };
  }

  // Nutrition for the amount of this ingredient used in the batch.
  function ingredientValues(ing) {
    if (!isNum(ing.amount) || ing.amount <= 0) {
      return { kcal: null, protein: null, carbs: null, fat: null };
    }
    return scaleValues(ing, ing.amount / (ing.unit === 'item' ? 1 : 100));
  }

  // Totals for the whole batch. A macro total is null unless every ingredient has that
  // macro, because a partial sum would silently understate it.
  function recipeTotals(ingredients) {
    const out = { kcal: 0 };
    MACROS.forEach((k) => { out[k] = 0; });
    ingredients.forEach((ing) => {
      const v = ingredientValues(ing);
      out.kcal = out.kcal === null || !isNum(v.kcal) ? null : out.kcal + v.kcal;
      MACROS.forEach((k) => {
        out[k] = out[k] === null || !isNum(v[k]) ? null : out[k] + v[k];
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

  function recipeCanLogGrams(recipe) {
    return isNum(recipe.cookedWeight) && recipe.cookedWeight > 0;
  }

  function recipePerGram(recipe) {
    return divideValues(recipeTotals(recipe.ingredients), recipe.cookedWeight);
  }

  function recipePerPortion(recipe) {
    return divideValues(recipeTotals(recipe.ingredients), recipe.portions);
  }

  // Weight of one portion in grams, or null without a cooked weight or portions.
  function recipePortionWeight(recipe) {
    if (!recipeCanLogGrams(recipe) || !isNum(recipe.portions) || recipe.portions <= 0) return null;
    return recipe.cookedWeight / recipe.portions;
  }

  // Values per log-entry unit: per portion for 'portion', per 100 g of cooked batch for 'g'.
  function recipeUnitValues(recipe, unit) {
    if (unit === 'portion') return recipePerPortion(recipe);
    if (unit === 'g') return scaleValues(recipePerGram(recipe), 100);
    throw new Error('Unknown recipe unit: ' + unit);
  }

  // Values for a serving: by { portions } (fractions allowed) or by { grams } of the cooked batch.
  function recipeServing(recipe, amount) {
    if (amount && isNum(amount.portions)) {
      return scaleValues(recipePerPortion(recipe), amount.portions);
    }
    if (amount && isNum(amount.grams)) {
      return scaleValues(recipePerGram(recipe), amount.grams);
    }
    throw new Error('recipeServing needs { portions } or { grams }');
  }

  // Entry fields (without id, date or created) for quantity portions ('portion') or grams ('g')
  // of a recipe. sourceId is the saved recipe's id, or null for an unsaved batch.
  function entryFromRecipe(recipe, quantity, unit, sourceId) {
    const v = recipeUnitValues(recipe, unit);
    return {
      name: recipe.name,
      source: 'recipe',
      sourceId: sourceId || null,
      quantity: quantity,
      unit: unit,
      perAmount: unit === 'g' ? 100 : 1,
      kcal: v.kcal,
      protein: v.protein,
      carbs: v.carbs,
      fat: v.fat,
    };
  }

  function sameValues(a, b) {
    return ['kcal'].concat(MACROS).every((k) => orNull(a[k]) === orNull(b[k]));
  }

  // True if a recipe's per-portion or per-100 g values differ. A rename alone is not a change.
  function recipeChanged(a, b) {
    return !sameValues(recipeUnitValues(a, 'portion'), recipeUnitValues(b, 'portion')) ||
      !sameValues(recipeUnitValues(a, 'g'), recipeUnitValues(b, 'g'));
  }

  // Starting amount when logging a saved recipe: the quantity and unit of the most recent
  // linked entry, or 1 portion if it has never been logged.
  function defaultRecipeAmount(recipe, entries) {
    let latest = null;
    (entries || []).forEach((e) => {
      if (isLinked(e, recipe) && isNum(e.quantity) && e.quantity > 0 &&
          (!latest || (e.created || 0) > (latest.created || 0))) {
        latest = e;
      }
    });
    if (latest) return { quantity: latest.quantity, unit: latest.unit };
    return { quantity: 1, unit: 'portion' };
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

  // Entry unit + quantity for display: '150 g', '1 item', '2.5 items', '1.5 portions', '' for quick add.
  function formatAmount(qty, unit) {
    if (unit === 'g') return fmtQty(qty) + ' g';
    if (unit === 'item') return fmtQty(qty) + (qty === 1 ? ' item' : ' items');
    if (unit === 'portion') return fmtQty(qty) + (qty === 1 ? ' portion' : ' portions');
    return '';
  }

  function formatEntryAmount(entry) {
    return formatAmount(entry.quantity, entry.unit);
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

  // Starting amount when logging a saved food: the quantity of the most recent linked
  // entry, or 100 g / 1 item if it has never been logged.
  function defaultQty(food, entries) {
    let latest = null;
    (entries || []).forEach((e) => {
      if (isLinked(e, food) && isNum(e.quantity) && e.quantity > 0 &&
          (!latest || (e.created || 0) > (latest.created || 0))) {
        latest = e;
      }
    });
    if (latest) return latest.quantity;
    return food.unit === '100g' ? 100 : 1;
  }

  // 'none' (no entry has it), 'partial' (some do) or 'complete'.
  function macroStatus(macroTotal, count) {
    if (macroTotal.known === 0) return 'none';
    return macroTotal.known < count ? 'partial' : 'complete';
  }

  // ---------- Data, migration, backup ----------

  const SCHEMA_VERSION = 2;
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
    return { data, counts: countData(data), exportedAt, skipped: data.skipped };
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
    fmtQty, formatAmount, formatEntryAmount, parseNumber,
    entriesForDate, searchRecent, searchByName, defaultQty, macroStatus,
    scaleNullable, foodEntryUnit, entryTotals, entryFromFood, entryFromQuick, setEntryQuantity,
    setEntryNutrition, nutritionChanged,
    isRecipe, linkedEntryCounts, applyToEntries,
    sumEntries,
    ingredientFromFood, ingredientValues, recipeTotals, recipeCanLogGrams, recipePerGram,
    recipePerPortion, recipePortionWeight, recipeUnitValues, recipeServing, entryFromRecipe,
    recipeChanged, defaultRecipeAmount,
    fmtKcal, fmtMacro,
    SCHEMA_VERSION, emptyData, migrate, countData, buildExport, parseImport, isBackupStale,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Calc;
  } else {
    window.Calc = Calc;
  }
})();
