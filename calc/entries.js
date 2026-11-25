// Log entries. An entry stores quantity, unit, perAmount and the nutrition for perAmount units.
// Totals are always value x quantity / perAmount and are never stored.

import { MACROS, isNum, scaleValues, orNull } from './values.js';
import { isRecipe, recipeCanLogGrams, recipeUnitValues } from './recipes.js';

// Entry unit for a saved food's unit: '100g' -> 'g', 'item' -> 'item'.
export function foodEntryUnit(food) {
  return food.unit === '100g' ? 'g' : 'item';
}

export function entryTotals(entry) {
  if (!isNum(entry.quantity) || !isNum(entry.perAmount) || entry.perAmount <= 0) {
    return { kcal: null, protein: null, carbs: null, fat: null };
  }
  return scaleValues(entry, entry.quantity / entry.perAmount);
}

// Entry fields (without id, date or created) for quantity of a food.
// sourceId is the saved food's id, or null for an unsaved food.
export function entryFromFood(food, quantity, sourceId) {
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
export function entryFromQuick(v) {
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

// Entry fields (without id, date or created) for quantity portions ('portion') or grams ('g')
// of a recipe. sourceId is the saved recipe's id, or null for an unsaved batch.
export function entryFromRecipe(recipe, quantity, unit, sourceId) {
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

// Copies of entries for another date: same amount, nutrition and link, with a new id, date and
// created time. ids come from the caller because calc has no randomness. created counts up from
// now in the order given, so the copies keep the original order.
export function copyEntries(entries, date, ids, now) {
  return entries.map((e, i) => Object.assign({}, e, { id: ids[i], date: date, created: now + i }));
}

// A copy of the entry with a new quantity. Per-unit values are untouched; nothing is looked up.
export function setEntryQuantity(entry, quantity) {
  return Object.assign({}, entry, { quantity: quantity });
}

// A copy of the entry with new per-unit values. Quantity, unit and perAmount are kept.
export function setEntryNutrition(entry, v) {
  return Object.assign({}, entry, {
    kcal: v.kcal,
    protein: orNull(v.protein),
    carbs: orNull(v.carbs),
    fat: orNull(v.fat),
  });
}

// True if a food's unit or per-unit values differ (null and missing count as equal).
export function nutritionChanged(a, b) {
  if (a.unit !== b.unit) return true;
  return ['kcal'].concat(MACROS).some((k) => orNull(a[k]) !== orNull(b[k]));
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

export function linkedEntryCounts(entries, item, todayKey) {
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
export function applyToEntries(entries, item, scope, todayKey) {
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

// Starting amount when logging a saved food: the quantity of the most recent linked
// entry, or 100 g / 1 item if it has never been logged.
export function defaultQty(food, entries) {
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

// Starting amount when logging a saved recipe: the quantity and unit of the most recent
// linked entry, or 1 portion if it has never been logged.
export function defaultRecipeAmount(recipe, entries) {
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
