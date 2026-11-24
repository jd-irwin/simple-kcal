// Shared display text and constants.

import Calc from '../calc/index.js';

export const RECENTS_LIMIT = 20;

export const MACROS = ['protein', 'carbs', 'fat'];

export const MACRO_NAMES = { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };

export function macroLine(v) {
  return 'P ' + Calc.fmtMacro(v.protein) + ' · C ' + Calc.fmtMacro(v.carbs) + ' · F ' + Calc.fmtMacro(v.fat);
}

export function valuesSummary(v) {
  return Calc.fmtKcal(v.kcal) + ' kcal · ' + macroLine(v);
}

export function unitText(unit) {
  return unit === '100g' ? 'per 100 g' : 'per item';
}

export function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

export function countsText(c) {
  return plural(c.foods, 'food', 'foods') + ', ' +
    plural(c.recipes, 'recipe', 'recipes') + ' and ' +
    plural(c.entries, 'log entry', 'log entries');
}

export function qtyLabel(unit) {
  if (unit === 'g') return 'Amount (g)';
  if (unit === 'portion') return 'Number of portions';
  return 'Number of items';
}

export function entryName(e) {
  return e.name || 'Quick add';
}
