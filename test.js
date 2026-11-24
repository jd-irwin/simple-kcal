// Run with: node test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Calc from './calc.js';

// Fix the time zone so BST tests behave the same on any machine. Node applies a change to TZ
// immediately, and nothing above creates a Date, so setting it after the imports is safe.
process.env.TZ = 'Europe/London';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (err) {
    failed++;
    console.log('  FAIL ' + name);
    console.log('       ' + err.message);
  }
}

function approx(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 1e-9, (msg || '') + ` expected ${expected}, got ${actual}`);
}

// ---------- Dates ----------

test('time zone is Europe/London (BST in July)', () => {
  assert.equal(new Date('2026-07-01T12:00:00Z').getTimezoneOffset(), -60);
});

test('dateKey: 00:30 BST is the new day even though UTC is still the previous day', () => {
  assert.equal(Calc.dateKey(new Date('2026-07-15T23:30:00Z')), '2026-07-16');
});

test('dateKey: 23:30 BST stays on the same day', () => {
  assert.equal(Calc.dateKey(new Date(2026, 6, 15, 23, 30)), '2026-07-15');
});

test('dateKey: around the March clock change', () => {
  assert.equal(Calc.dateKey(new Date('2026-03-28T23:30:00Z')), '2026-03-28'); // 23:30 GMT
  assert.equal(Calc.dateKey(new Date('2026-03-29T00:30:00Z')), '2026-03-29'); // 00:30 GMT
  assert.equal(Calc.dateKey(new Date('2026-03-29T23:30:00Z')), '2026-03-30'); // 00:30 BST
});

test('dateKey: around the October clock change', () => {
  assert.equal(Calc.dateKey(new Date('2026-10-24T23:30:00Z')), '2026-10-25'); // 00:30 BST
  assert.equal(Calc.dateKey(new Date('2026-10-25T23:30:00Z')), '2026-10-25'); // 23:30 GMT
});

test('addDays across both BST changes', () => {
  assert.equal(Calc.addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(Calc.addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(Calc.addDays('2026-03-30', -1), '2026-03-29');
  assert.equal(Calc.addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(Calc.addDays('2026-10-26', -1), '2026-10-25');
});

test('addDays rolls over months, years and leap days', () => {
  assert.equal(Calc.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(Calc.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(Calc.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(Calc.addDays('2026-01-15', 0), '2026-01-15');
});

test('formatDate gives DD/MM/YYYY', () => {
  assert.equal(Calc.formatDate('2026-07-05'), '05/07/2026');
});

// ---------- Log entries ----------

const oats = { id: 'oats', name: 'Oats', unit: '100g', kcal: 380, protein: 13, carbs: null, fat: 7 };
const egg = { id: 'egg', name: 'Egg', unit: 'item', kcal: 72, protein: 6.3, carbs: 0.4, fat: 4.8 };

// A quick-add-shaped entry whose values are its totals.
function q(v) {
  return Object.assign({ quantity: 1, unit: 'quick', perAmount: 1, protein: null, carbs: null, fat: null }, v);
}

test('entryFromFood per 100 g copies per-unit values with perAmount 100', () => {
  const e = Calc.entryFromFood(oats, 150, 'oats');
  assert.deepEqual(e, {
    name: 'Oats', source: 'food', sourceId: 'oats', quantity: 150, unit: 'g', perAmount: 100,
    kcal: 380, protein: 13, carbs: null, fat: 7,
  });
});

test('entryTotals per 100 g scales by quantity / 100 and keeps null macros', () => {
  const t = Calc.entryTotals(Calc.entryFromFood(oats, 150, 'oats'));
  approx(t.kcal, 570);
  approx(t.protein, 19.5);
  assert.equal(t.carbs, null);
  approx(t.fat, 10.5);
});

test('entryTotals per item scales by count', () => {
  const e = Calc.entryFromFood(egg, 2, 'egg');
  assert.equal(e.unit, 'item');
  assert.equal(e.perAmount, 1);
  const t = Calc.entryTotals(e);
  approx(t.kcal, 144);
  approx(t.protein, 12.6);
});

test('unsaved food entry has no sourceId', () => {
  assert.equal(Calc.entryFromFood(oats, 50).sourceId, null);
});

test('changing quantity rescales without changing per-unit values', () => {
  const e = Calc.entryFromFood(oats, 150, 'oats');
  const e2 = Calc.setEntryQuantity(e, 200);
  assert.equal(e.quantity, 150); // original untouched
  assert.equal(e2.quantity, 200);
  assert.equal(e2.kcal, 380);
  approx(Calc.entryTotals(e2).kcal, 760);
  approx(Calc.entryTotals(e2).kcal / Calc.entryTotals(e).kcal, 4 / 3);
});

test('setEntryNutrition changes per-unit values only', () => {
  const e = Object.assign({ id: 'x', date: '2026-11-20' }, Calc.entryFromFood(oats, 150, 'oats'));
  const e2 = Calc.setEntryNutrition(e, { kcal: 400, protein: 14, carbs: undefined, fat: null });
  assert.equal(e.kcal, 380); // original untouched
  assert.equal(e2.kcal, 400);
  assert.equal(e2.carbs, null);
  assert.equal(e2.fat, null);
  assert.equal(e2.quantity, 150);
  assert.equal(e2.unit, 'g');
  assert.equal(e2.perAmount, 100);
  assert.equal(e2.sourceId, 'oats');
  approx(Calc.entryTotals(e2).kcal, 600);
});

test('nutritionChanged', () => {
  const a = { name: 'Oats', unit: '100g', kcal: 380, protein: 13, carbs: null, fat: 7 };
  assert.equal(Calc.nutritionChanged(a, Object.assign({}, a, { name: 'Porridge oats' })), false);
  assert.equal(Calc.nutritionChanged(a, Object.assign({}, a, { carbs: undefined })), false);
  assert.equal(Calc.nutritionChanged(a, Object.assign({}, a, { kcal: 370 })), true);
  assert.equal(Calc.nutritionChanged(a, Object.assign({}, a, { carbs: 60 })), true);
  assert.equal(Calc.nutritionChanged(a, Object.assign({}, a, { unit: 'item' })), true);
});

test('quick add totals equal its values', () => {
  const e = Calc.entryFromQuick({ name: '', kcal: 250, protein: 10, carbs: null, fat: undefined });
  assert.equal(e.unit, 'quick');
  assert.equal(e.quantity, 1);
  assert.equal(e.perAmount, 1);
  assert.equal(e.fat, null);
  assert.deepEqual(Calc.entryTotals(e), { kcal: 250, protein: 10, carbs: null, fat: null });
});

test('formatEntryAmount', () => {
  assert.equal(Calc.formatEntryAmount(Calc.entryFromFood(oats, 150)), '150 g');
  assert.equal(Calc.formatEntryAmount(Calc.entryFromFood(egg, 1)), '1 item');
  assert.equal(Calc.formatEntryAmount({ quantity: 1.5, unit: 'portion' }), '1.5 portions');
  assert.equal(Calc.formatEntryAmount(Calc.entryFromQuick({ kcal: 1 })), '');
});

test('linkedEntryCounts and applyToEntries touch linked entries only', () => {
  const today = '2026-11-20';
  const entries = [
    Object.assign({ id: 1, date: today }, Calc.entryFromFood(oats, 50, 'oats')),
    Object.assign({ id: 2, date: '2026-11-19' }, Calc.entryFromFood(oats, 80, 'oats')),
    Object.assign({ id: 3, date: today }, Calc.entryFromFood(oats, 60)),            // unsaved
    Object.assign({ id: 4, date: today }, Calc.entryFromQuick({ kcal: 100 })),      // quick
    Object.assign({ id: 5, date: today }, Calc.entryFromFood(egg, 2, 'egg')),       // other food
  ];
  assert.deepEqual(Calc.linkedEntryCounts(entries, oats, today), { today: 1, all: 2 });

  const fixed = Object.assign({}, oats, { kcal: 370, carbs: 60 });

  const none = Calc.applyToEntries(entries, fixed, 'none', today);
  assert.deepEqual(none, entries);

  const t = Calc.applyToEntries(entries, fixed, 'today', today);
  assert.equal(t[0].kcal, 370);
  assert.equal(t[0].carbs, 60);
  assert.equal(t[0].quantity, 50);
  assert.equal(t[1].kcal, 380); // other day untouched
  assert.equal(t[2], entries[2]);
  assert.equal(t[3], entries[3]);
  assert.equal(t[4], entries[4]);
  assert.equal(entries[0].kcal, 380); // input not mutated

  const all = Calc.applyToEntries(entries, fixed, 'all', today);
  assert.equal(all[0].kcal, 370);
  assert.equal(all[1].kcal, 370);
  assert.equal(all[1].quantity, 80);
  assert.equal(all[2].kcal, 380);
});

test('applyToEntries skips entries whose unit no longer matches the food', () => {
  const entries = [Object.assign({ id: 1, date: '2026-11-20' }, Calc.entryFromFood(oats, 50, 'oats'))];
  const nowPerItem = Object.assign({}, oats, { unit: 'item', kcal: 150 });
  assert.deepEqual(Calc.linkedEntryCounts(entries, nowPerItem, '2026-11-20'), { today: 0, all: 0 });
  assert.equal(Calc.applyToEntries(entries, nowPerItem, 'all', '2026-11-20')[0].kcal, 380);
});

// ---------- Daily totals ----------

test('sumEntries uses quantity / perAmount', () => {
  const entries = [
    Calc.entryFromFood(oats, 50, 'oats'),   // 190 kcal, P 6.5, C -, F 3.5
    Calc.entryFromFood(egg, 2, 'egg'),      // 144 kcal, P 12.6, C 0.8, F 9.6
    Calc.entryFromQuick({ kcal: 100 }),     // 100 kcal
  ];
  const t = Calc.sumEntries(entries);
  approx(t.kcal, 434);
  approx(t.protein.total, 19.1);
  assert.equal(t.protein.known, 2);
  approx(t.carbs.total, 0.8);
  assert.equal(t.carbs.known, 1);
  approx(t.fat.total, 13.1);
});

test('sumEntries: partial macros report known count', () => {
  const entries = [
    q({ kcal: 100, protein: 10, carbs: null, fat: 1 }),
    q({ kcal: 200, protein: 5, carbs: null, fat: null }),
    q({ kcal: 50, protein: null, carbs: null, fat: null }),
    q({ kcal: 300, protein: 20, carbs: null, fat: 2 }),
    q({ kcal: 150, protein: null, carbs: null, fat: null }),
    q({ kcal: 80, protein: 1.5, carbs: null, fat: null }),
  ];
  const t = Calc.sumEntries(entries);
  assert.equal(t.count, 6);
  approx(t.kcal, 880);
  approx(t.protein.total, 36.5);
  assert.equal(t.protein.known, 4);
  approx(t.fat.total, 3);
  assert.equal(t.fat.known, 2);
});

test('sumEntries: no known macro gives null, never zero', () => {
  const t = Calc.sumEntries([q({ kcal: 100 })]);
  assert.equal(t.carbs.total, null);
  assert.equal(t.carbs.known, 0);
});

test('sumEntries: a known zero counts as known', () => {
  const t = Calc.sumEntries([q({ kcal: 10, protein: 0 })]);
  assert.equal(t.protein.total, 0);
  assert.equal(t.protein.known, 1);
});

test('sumEntries: empty list', () => {
  const t = Calc.sumEntries([]);
  assert.equal(t.count, 0);
  assert.equal(t.kcal, 0);
  assert.equal(t.protein.total, null);
});

// ---------- Recipes ----------

const porridge = {
  ingredients: [
    { name: 'Oats', unit: '100g', amount: 200, kcal: 380, protein: 13, carbs: 60, fat: 7 },
    { name: 'Milk', unit: '100g', amount: 500, kcal: 50, protein: 3.5, carbs: 4.8, fat: 1.8 },
  ],
  cookedWeight: 800,
  portions: 4,
};

test('recipeTotals sums ingredients', () => {
  const t = Calc.recipeTotals(porridge.ingredients);
  approx(t.kcal, 1010);
  approx(t.protein, 43.5);
  approx(t.carbs, 144);
  approx(t.fat, 23);
});

test('recipePerPortion and recipePerGram', () => {
  const p = Calc.recipePerPortion(porridge);
  approx(p.kcal, 252.5);
  approx(p.protein, 10.875);
  const g = Calc.recipePerGram(porridge);
  approx(g.kcal, 1.2625);
  approx(g.fat, 0.02875);
});

test('recipeServing by fractional portions', () => {
  const s = Calc.recipeServing(porridge, { portions: 1.5 });
  approx(s.kcal, 378.75);
  approx(s.carbs, 54);
});

test('recipeServing by grams of cooked batch', () => {
  const s = Calc.recipeServing(porridge, { grams: 200 });
  approx(s.kcal, 252.5);
  approx(s.protein, 10.875);
});

test('recipe macro is null if any ingredient lacks it', () => {
  const r = {
    ingredients: [
      porridge.ingredients[0],
      { name: 'Honey', unit: '100g', amount: 20, kcal: 304, protein: 0.3, carbs: 82, fat: null },
    ],
    cookedWeight: 220,
    portions: 2,
  };
  const t = Calc.recipeTotals(r.ingredients);
  assert.equal(t.fat, null);
  approx(t.protein, 26.06);
  assert.equal(Calc.recipeServing(r, { portions: 1 }).fat, null);
});

test('recipe with zero portions or weight gives nulls, not Infinity', () => {
  const r = Object.assign({}, porridge, { portions: 0, cookedWeight: 0 });
  assert.equal(Calc.recipePerPortion(r).kcal, null);
  assert.equal(Calc.recipePerGram(r).kcal, null);
});

test('per-item ingredients count items, not grams', () => {
  const eggs = { name: 'Egg', unit: 'item', amount: 3, kcal: 70, protein: 6, carbs: 0.5, fat: 5 };
  const v = Calc.ingredientValues(eggs);
  approx(v.kcal, 210);
  approx(v.protein, 18);
  const t = Calc.recipeTotals([porridge.ingredients[0], eggs]);
  approx(t.kcal, 760 + 210);
  approx(t.fat, 14 + 15);
});

test('ingredientFromFood copies values, so editing the food later leaves the recipe alone', () => {
  const food = { id: 'f1', name: 'Oats', unit: '100g', kcal: 380, protein: 13, carbs: null, fat: 7, lastUsed: 5 };
  const ing = Calc.ingredientFromFood(food, 200);
  assert.deepEqual(ing, { name: 'Oats', unit: '100g', amount: 200, kcal: 380, protein: 13, carbs: null, fat: 7 });
  food.kcal = 999;
  assert.equal(ing.kcal, 380);
  assert.equal(Calc.ingredientFromFood({ name: 'Egg', unit: 'item', kcal: 70 }, 2).unit, 'item');
});

test('recipeUnitValues and recipePortionWeight', () => {
  approx(Calc.recipeUnitValues(porridge, 'portion').kcal, 252.5);
  approx(Calc.recipeUnitValues(porridge, 'g').kcal, 126.25);
  approx(Calc.recipePortionWeight(porridge), 200);
  const noWeight = Object.assign({}, porridge, { cookedWeight: null });
  assert.equal(Calc.recipeCanLogGrams(noWeight), false);
  assert.equal(Calc.recipePortionWeight(noWeight), null);
  assert.equal(Calc.recipeUnitValues(noWeight, 'g').kcal, null);
});

test('entryFromRecipe by portions (fractional) matches recipeServing', () => {
  const e = Calc.entryFromRecipe(Object.assign({ name: 'Porridge' }, porridge), 1.5, 'portion', 'r1');
  assert.equal(e.source, 'recipe');
  assert.equal(e.sourceId, 'r1');
  assert.equal(e.unit, 'portion');
  assert.equal(e.perAmount, 1);
  approx(e.kcal, 252.5);
  approx(Calc.entryTotals(e).kcal, Calc.recipeServing(porridge, { portions: 1.5 }).kcal);
  approx(Calc.entryTotals(e).carbs, 54);
});

test('entryFromRecipe by grams stores per-100 g values and totals match recipeServing', () => {
  const e = Calc.entryFromRecipe(Object.assign({ name: 'Porridge' }, porridge), 300, 'g', null);
  assert.equal(e.sourceId, null);
  assert.equal(e.unit, 'g');
  assert.equal(e.perAmount, 100);
  approx(e.kcal, 126.25);
  approx(Calc.entryTotals(e).kcal, Calc.recipeServing(porridge, { grams: 300 }).kcal);
  approx(Calc.entryTotals(Calc.setEntryQuantity(e, 150)).kcal, 189.375);
});

test('recipeChanged ignores renames but sees ingredient, weight and portion changes', () => {
  const a = Object.assign({ name: 'Porridge' }, porridge);
  assert.equal(Calc.recipeChanged(a, Object.assign({}, a, { name: 'Oat porridge' })), false);
  assert.equal(Calc.recipeChanged(a, Object.assign({}, a, { portions: 5 })), true);
  assert.equal(Calc.recipeChanged(a, Object.assign({}, a, { cookedWeight: 900 })), true);
  assert.equal(Calc.recipeChanged(a, Object.assign({}, a, { cookedWeight: null })), true);
  const more = Object.assign({}, a, { ingredients: a.ingredients.concat([{ name: 'Salt', unit: '100g', amount: 1, kcal: 0, protein: 0, carbs: 0, fat: 0 }]) });
  assert.equal(Calc.recipeChanged(a, more), false, 'zero-kcal ingredient changes nothing');
});

test('applyToEntries with a recipe updates linked portion and gram entries, keeping quantities', () => {
  const today = '2026-11-20';
  const r = Object.assign({ id: 'r1', name: 'Porridge' }, porridge);
  const byPortion = Object.assign({ id: 'a', date: today }, Calc.entryFromRecipe(r, 2, 'portion', 'r1'));
  const byGrams = Object.assign({ id: 'b', date: '2026-11-19' }, Calc.entryFromRecipe(r, 300, 'g', 'r1'));
  const unsaved = Object.assign({ id: 'c', date: today }, Calc.entryFromRecipe(r, 1, 'portion', null));
  const food = Object.assign({ id: 'd', date: today }, Calc.entryFromFood({ name: 'X', unit: '100g', kcal: 1 }, 100, 'r1'));
  const entries = [byPortion, byGrams, unsaved, food];
  assert.deepEqual(Calc.linkedEntryCounts(entries, r, today), { today: 1, all: 2 });

  const edited = Object.assign({}, r, { portions: 5, cookedWeight: 1010 });
  const all = Calc.applyToEntries(entries, edited, 'all', today);
  approx(all[0].kcal, 202);
  assert.equal(all[0].quantity, 2);
  approx(all[1].kcal, 100);
  assert.equal(all[1].quantity, 300);
  assert.equal(all[2], unsaved);
  assert.equal(all[3], food);

  const t = Calc.applyToEntries(entries, edited, 'today', today);
  approx(t[0].kcal, 202);
  assert.equal(t[1], byGrams);
});

test('gram entries stop being linked when the recipe loses its cooked weight', () => {
  const r = Object.assign({ id: 'r1', name: 'Porridge' }, porridge);
  const byGrams = Object.assign({ id: 'b', date: '2026-11-20' }, Calc.entryFromRecipe(r, 300, 'g', 'r1'));
  const noWeight = Object.assign({}, r, { cookedWeight: null });
  assert.deepEqual(Calc.linkedEntryCounts([byGrams], noWeight, '2026-11-20'), { today: 0, all: 0 });
  assert.equal(Calc.applyToEntries([byGrams], noWeight, 'all', '2026-11-20')[0], byGrams);
});

test('defaultRecipeAmount uses the latest linked entry, else 1 portion', () => {
  const r = Object.assign({ id: 'r1', name: 'Porridge' }, porridge);
  assert.deepEqual(Calc.defaultRecipeAmount(r, []), { quantity: 1, unit: 'portion' });
  const e1 = Object.assign({ created: 1 }, Calc.entryFromRecipe(r, 1.5, 'portion', 'r1'));
  const e2 = Object.assign({ created: 2 }, Calc.entryFromRecipe(r, 250, 'g', 'r1'));
  assert.deepEqual(Calc.defaultRecipeAmount(r, [e2, e1]), { quantity: 250, unit: 'g' });
  const noWeight = Object.assign({}, r, { cookedWeight: null });
  assert.deepEqual(Calc.defaultRecipeAmount(noWeight, [e1, e2]), { quantity: 1.5, unit: 'portion' });
});

test('isRecipe tells recipes from foods', () => {
  assert.equal(Calc.isRecipe(porridge), true);
  assert.equal(Calc.isRecipe({ name: 'Oats', unit: '100g', kcal: 380 }), false);
});

test('migrate drops unreadable records and counts them', () => {
  const good = { id: 'f1', name: 'Bread', unit: '100g', kcal: 200, protein: 0, carbs: 100, fat: 0 };
  const d = Calc.migrate({
    schemaVersion: 2,
    foods: ['bread', good, { id: 'f2', unit: '100g', kcal: 1 }, null],
    recipes: [{ id: 'r1', name: 'Soup', ingredients: [{ name: 'Leek', unit: '100g', amount: 200, kcal: 30 }, 'junk'], portions: 2, cookedWeight: null }, 42],
    entries: [{ id: 'e1', date: '2026-11-20', quantity: 1, perAmount: 1, unit: 'quick', source: 'quick', kcal: 100 }, { id: 'e2' }],
  });
  assert.deepEqual(d.foods, [good]);
  assert.equal(d.recipes.length, 1);
  assert.equal(d.recipes[0].ingredients.length, 1);
  assert.equal(d.entries.length, 1);
  assert.equal(d.skipped, 3 + 1 + 1 + 1);
  assert.equal(Object.keys(d).includes('skipped'), false, 'not stored');
});

test('importing a backup with a stray string food skips it', () => {
  const r = Calc.parseImport(JSON.stringify({
    app: 'batch-kcal', schemaVersion: 1, exportedAt: '2026-11-20T10:00:00Z',
    foods: ['bread', { id: 'gbj7suj8', name: 'Bread', unit: '100g', kcal: 200, protein: 0, carbs: 100, fat: 0, lastUsed: 1, lastQty: 100 }],
    recipes: [], entries: [],
  }));
  assert.equal(r.counts.foods, 1);
  assert.equal(r.skipped, 1);
  assert.equal(Calc.searchRecent(r.data.foods, '').length, 1);
});

// ---------- Display ----------

test('fmtKcal and fmtMacro round for display and show a dash for null', () => {
  assert.equal(Calc.fmtKcal(378.75), '379');
  assert.equal(Calc.fmtMacro(10.875), '10.9');
  assert.equal(Calc.fmtMacro(12), '12');
  assert.equal(Calc.fmtMacro(null), '–');
  assert.equal(Calc.fmtKcal(null), '–');
});

// ---------- Data and backup ----------

test('migrate passes current data through and fills settings defaults', () => {
  const d = Calc.migrate({ schemaVersion: 2, foods: [], recipes: [], entries: [] });
  assert.equal(d.schemaVersion, Calc.SCHEMA_VERSION);
  assert.deepEqual(d.settings, { lastBackup: null, persistRequested: false });
});

test('migrate rejects newer versions and junk', () => {
  assert.throws(() => Calc.migrate({ schemaVersion: 99, foods: [], recipes: [], entries: [] }), /newer version/);
  assert.throws(() => Calc.migrate(null));
  assert.throws(() => Calc.migrate([]));
  assert.throws(() => Calc.migrate({ foods: [] }), /schema version/);
  assert.throws(() => Calc.migrate({ schemaVersion: 2, foods: [], recipes: [] }), /entries/);
});

test('migrate v1 -> v2 converts entries to quantity and per-unit values', () => {
  const v1 = {
    schemaVersion: 1,
    foods: [{ id: 'oats', name: 'Oats', unit: '100g', kcal: 380, protein: 13, carbs: null, fat: 7, lastUsed: 5, lastQty: 150 }],
    recipes: [],
    entries: [
      { id: 'a', date: '2026-11-20', created: 1, name: 'Oats', kcal: 570, protein: 19.5, carbs: null, fat: 10.5, source: 'food', sourceId: 'oats', amount: '150 g' },
      { id: 'b', date: '2026-11-20', created: 2, name: 'Egg', kcal: 144, protein: 12.6, carbs: 0.8, fat: 9.6, source: 'food', sourceId: null, amount: '2 items' },
      { id: 'c', date: '2026-11-20', created: 3, name: 'Egg', kcal: 72, protein: null, carbs: null, fat: null, source: 'food', sourceId: null, amount: '1 item' },
      { id: 'd', date: '2026-11-20', created: 4, name: '', kcal: 250, protein: 10, carbs: null, fat: null, source: 'quick', sourceId: null, amount: '' },
      { id: 'e', date: '2026-11-20', created: 5, name: 'Odd', kcal: 99, protein: null, carbs: null, fat: null, source: 'food', sourceId: null, amount: 'a bowl' },
    ],
    settings: { lastBackup: null, persistRequested: true },
  };
  const before = Calc.sumEntries(v1.entries.map((e) => q(e)));
  const d = Calc.migrate(v1);
  assert.equal(d.schemaVersion, 2);
  assert.equal('lastQty' in d.foods[0], false);
  assert.equal(d.foods[0].lastUsed, 5);
  d.entries.forEach((e) => assert.equal('amount' in e, false));

  const [a, b, c, dq, odd] = d.entries;
  assert.equal(a.unit, 'g'); assert.equal(a.quantity, 150); assert.equal(a.perAmount, 100);
  approx(a.kcal, 380); approx(a.protein, 13); assert.equal(a.carbs, null); approx(a.fat, 7);
  assert.equal(a.sourceId, 'oats');
  assert.equal(b.unit, 'item'); assert.equal(b.quantity, 2); approx(b.kcal, 72);
  assert.equal(c.unit, 'item'); assert.equal(c.quantity, 1); approx(c.kcal, 72);
  assert.equal(dq.unit, 'quick'); assert.equal(dq.kcal, 250); assert.equal(dq.protein, 10);
  assert.equal(odd.unit, 'quick'); assert.equal(odd.kcal, 99); assert.equal(odd.source, 'food');

  // Day totals are unchanged by the migration.
  const after = Calc.sumEntries(d.entries);
  approx(after.kcal, before.kcal);
  approx(after.protein.total, before.protein.total);
  assert.equal(after.protein.known, before.protein.known);
  approx(after.fat.total, before.fat.total);
});

test('a v1 backup file imports as v2', () => {
  const text = JSON.stringify({
    app: 'batch-kcal', schemaVersion: 1, exportedAt: '2026-11-20T10:00:00.000Z',
    foods: [], recipes: [],
    entries: [{ id: 'a', date: '2026-11-20', created: 1, name: 'Oats', kcal: 190, protein: null, carbs: null, fat: null, source: 'food', sourceId: null, amount: '50 g' }],
  });
  const r = Calc.parseImport(text);
  assert.equal(r.data.schemaVersion, 2);
  assert.equal(r.data.entries[0].quantity, 50);
  approx(Calc.entryTotals(r.data.entries[0]).kcal, 190);
});

test('export then import round-trips', () => {
  const data = Calc.emptyData();
  data.foods.push({ id: 'a1', name: 'Oats', unit: '100g', kcal: 380, protein: 13, carbs: 60, fat: 7, lastUsed: 1 });
  data.entries.push(Object.assign({ id: 'e1', date: '2026-07-15', created: 1 }, Calc.entryFromFood(data.foods[0], 50, 'a1')));
  const text = JSON.stringify(Calc.buildExport(data, '2026-07-15T10:00:00.000Z'));
  const r = Calc.parseImport(text);
  assert.deepEqual(r.counts, { foods: 1, recipes: 0, entries: 1 });
  assert.equal(r.exportedAt, '2026-07-15T10:00:00.000Z');
  assert.deepEqual(r.data.foods, data.foods);
  assert.deepEqual(r.data.entries, data.entries);
});

test('parseImport gives clear errors', () => {
  assert.throws(() => Calc.parseImport('not json'), /could not be read/);
  assert.throws(() => Calc.parseImport('{"foo":1}'), /not a simple-kcal backup/);
  assert.throws(() => Calc.parseImport('{"app":"other-app","schemaVersion":2,"foods":[],"recipes":[],"entries":[]}'), /not a simple-kcal backup/);
  assert.throws(() => Calc.parseImport('{"app":"batch-kcal","schemaVersion":2,"foods":[],"recipes":[]}'), /entries/);
});

test('backups are stamped simple-kcal, and old batch-kcal backups still import', () => {
  const exported = Calc.buildExport(Calc.emptyData(), '2026-11-24T10:00:00.000Z');
  assert.equal(exported.app, 'simple-kcal');
  for (const app of ['simple-kcal', 'batch-kcal']) {
    const r = Calc.parseImport(JSON.stringify(Object.assign({}, exported, { app })));
    assert.deepEqual(r.counts, { foods: 0, recipes: 0, entries: 0 });
  }
});

// Every file the app is made of must be precached, or it breaks offline; and every precached file must exist.
test('sw.js precaches exactly the app files', () => {
  const NOT_APP = new Set(['sw.js', 'test.js', 'package.json']);
  const SKIP_DIRS = new Set(['.git', '.claude', 'tests', 'node_modules']);
  const appFiles = [];
  (function walk(dir) {
    for (const d of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir ? dir + '/' + d.name : d.name;
      if (d.isDirectory()) { if (!SKIP_DIRS.has(d.name)) walk(rel); continue; }
      if (/\.(html|css|js|json|png)$/.test(d.name) && !NOT_APP.has(rel)) appFiles.push(rel);
    }
  })('');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const listed = [...sw.match(/const FILES = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(listed.includes('./'), 'precaches ./');
  assert.deepEqual(listed.filter((f) => f !== './').sort(), appFiles.sort());
});

test('app.js and sw.js declare the same version', () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const appVersion = read('app.js').match(/const APP_VERSION = '([^']+)'/);
  const swVersion = read('sw.js').match(/const VERSION = '([^']+)'/);
  assert.ok(appVersion && swVersion, 'version constants not found');
  assert.equal(appVersion[1], swVersion[1]);
});

test('isBackupStale at the 7-day boundary', () => {
  const now = Date.parse('2026-07-15T12:00:00Z');
  assert.equal(Calc.isBackupStale(null, now), true);
  assert.equal(Calc.isBackupStale('2026-07-08T12:00:00Z', now), false); // exactly 7 days
  assert.equal(Calc.isBackupStale('2026-07-08T11:59:00Z', now), true);
  assert.equal(Calc.isBackupStale('2026-07-14T12:00:00Z', now), false);
  assert.equal(Calc.isBackupStale('garbage', now), true);
});

// ---------- Stage 2 helpers ----------

test('weekdayDate and dayTitle', () => {
  assert.equal(Calc.weekdayDate('2026-11-20'), 'Fri 20/11/2026');
  assert.equal(Calc.dayTitle('2026-11-20', '2026-11-20'), 'Today');
  assert.equal(Calc.dayTitle('2026-11-19', '2026-11-20'), 'Yesterday');
  assert.equal(Calc.dayTitle('2026-11-21', '2026-11-20'), 'Tomorrow');
  assert.equal(Calc.dayTitle('2026-11-12', '2026-11-20'), 'Thu 12/11/2026');
  assert.equal(Calc.dayTitle('2026-03-29', '2026-03-30'), 'Yesterday'); // across BST start
});

test('formatAmount', () => {
  assert.equal(Calc.formatAmount(150, 'g'), '150 g');
  assert.equal(Calc.formatAmount(1, 'portion'), '1 portion');
  assert.equal(Calc.formatAmount(1, 'quick'), '');
  assert.equal(Calc.formatAmount(1, 'item'), '1 item');
  assert.equal(Calc.formatAmount(2.5, 'item'), '2.5 items');
  assert.equal(Calc.formatAmount(1 / 3, 'item'), '0.33 items');
});

test('parseNumber', () => {
  assert.equal(Calc.parseNumber(''), null);
  assert.equal(Calc.parseNumber('   '), null);
  assert.equal(Calc.parseNumber(undefined), null);
  assert.equal(Calc.parseNumber('12'), 12);
  assert.equal(Calc.parseNumber(' 12.5 '), 12.5);
  assert.equal(Calc.parseNumber('12,5'), 12.5);
  assert.equal(Calc.parseNumber('.5'), 0.5);
  assert.equal(Calc.parseNumber('0'), 0);
  assert.ok(Number.isNaN(Calc.parseNumber('-3')));
  assert.ok(Number.isNaN(Calc.parseNumber('abc')));
  assert.ok(Number.isNaN(Calc.parseNumber('1.2.3')));
});

test('entriesForDate filters and sorts by created', () => {
  const es = [
    { id: 'b', date: '2026-11-20', created: 20 },
    { id: 'x', date: '2026-11-19', created: 5 },
    { id: 'a', date: '2026-11-20', created: 10 },
  ];
  assert.deepEqual(Calc.entriesForDate(es, '2026-11-20').map((e) => e.id), ['a', 'b']);
  assert.deepEqual(Calc.entriesForDate(es, '2026-11-18'), []);
});

test('searchRecent and searchByName', () => {
  const foods = [
    { name: 'Oat milk', lastUsed: 1 },
    { name: 'Porridge oats', lastUsed: 3 },
    { name: 'Banana', lastUsed: 2 },
  ];
  assert.deepEqual(Calc.searchRecent(foods, '').map((f) => f.name), ['Porridge oats', 'Banana', 'Oat milk']);
  assert.deepEqual(Calc.searchRecent(foods, 'OAT').map((f) => f.name), ['Porridge oats', 'Oat milk']);
  assert.deepEqual(Calc.searchRecent(foods, 'oats porr').map((f) => f.name), ['Porridge oats']);
  assert.deepEqual(Calc.searchByName(foods, '').map((f) => f.name), ['Banana', 'Oat milk', 'Porridge oats']);
  assert.deepEqual(Calc.searchByName(foods, 'zzz'), []);
});

test('defaultQty uses the latest linked entry, else 100 g or 1 item', () => {
  const entries = [
    Object.assign({ created: 10 }, Calc.entryFromFood(oats, 45, 'oats')),
    Object.assign({ created: 30 }, Calc.entryFromFood(oats, 60, 'oats')),
    Object.assign({ created: 20 }, Calc.entryFromFood(oats, 80, 'oats')),
    Object.assign({ created: 40 }, Calc.entryFromFood(oats, 999)), // unsaved, not linked
  ];
  assert.equal(Calc.defaultQty(oats, entries), 60);
  assert.equal(Calc.defaultQty(oats, []), 100);
  assert.equal(Calc.defaultQty(egg, entries), 1);
  assert.equal(Calc.defaultQty(Object.assign({}, oats, { unit: 'item' }), entries), 1); // unit changed
});

test('macroStatus', () => {
  assert.equal(Calc.macroStatus({ total: null, known: 0 }, 3), 'none');
  assert.equal(Calc.macroStatus({ total: 5, known: 2 }, 3), 'partial');
  assert.equal(Calc.macroStatus({ total: 5, known: 3 }, 3), 'complete');
});

// ---------- Calendar ----------

test('addMonths rolls over years both ways', () => {
  assert.deepEqual(Calc.addMonths(2026, 12, 1), { y: 2027, m: 1 });
  assert.deepEqual(Calc.addMonths(2027, 1, -1), { y: 2026, m: 12 });
  assert.deepEqual(Calc.addMonths(2026, 11, 0), { y: 2026, m: 11 });
  assert.deepEqual(Calc.addMonths(2026, 11, -23), { y: 2024, m: 12 });
  assert.deepEqual(Calc.addMonths(2026, 11, 14), { y: 2028, m: 1 });
});

test('formatMonth', () => {
  assert.equal(Calc.formatMonth(2026, 11), 'November 2026');
  assert.equal(Calc.formatMonth(2027, 1), 'January 2027');
});

// Every day of the month appears once, in order, with only nulls around it.
function checkGrid(weeks, y, m, daysInMonth) {
  weeks.forEach((w) => assert.equal(w.length, 7));
  const days = weeks.flat().filter(Boolean);
  assert.equal(days.length, daysInMonth);
  days.forEach((k, i) => assert.equal(k, y + '-' + String(m).padStart(2, '0') + '-' + String(i + 1).padStart(2, '0')));
}

test('monthGrid: month starting on a Sunday puts the 1st in the last column', () => {
  const g = Calc.monthGrid(2026, 11); // 1 November 2026 is a Sunday
  assert.deepEqual(g[0], [null, null, null, null, null, null, '2026-11-01']);
  assert.equal(g.length, 6);
  checkGrid(g, 2026, 11, 30);
});

test('monthGrid: month starting on a Monday has no leading blanks', () => {
  const g = Calc.monthGrid(2026, 6); // 1 June 2026 is a Monday
  assert.equal(g[0][0], '2026-06-01');
  assert.equal(g.length, 5);
  checkGrid(g, 2026, 6, 30);
});

test('monthGrid: 28-day February starting on a Monday is exactly four weeks', () => {
  const g = Calc.monthGrid(2027, 2);
  assert.equal(g.length, 4);
  assert.equal(g[3][6], '2027-02-28');
  checkGrid(g, 2027, 2, 28);
});

test('monthGrid: leap-year February has 29 days', () => {
  checkGrid(Calc.monthGrid(2028, 2), 2028, 2, 29);
});

test('monthGrid: BST change months have no missing or repeated days', () => {
  const oct = Calc.monthGrid(2026, 10); // clocks go back 25/10/2026
  checkGrid(oct, 2026, 10, 31);
  const mar = Calc.monthGrid(2027, 3); // clocks go forward 28/03/2027
  checkGrid(mar, 2027, 3, 31);
  // 28 March 2027 is a Sunday, so it sits in the last column.
  assert.ok(mar.some((w) => w[6] === '2027-03-28'));
});

test('dailyKcal sums grams, portions and quick add per day', () => {
  const oats = { id: 'f1', name: 'Oats', unit: '100g', kcal: 380, protein: 13, carbs: 60, fat: 7 };
  const recipe = Object.assign({ name: 'Porridge' }, porridge);
  const entries = [
    Object.assign({ date: '2026-11-20' }, Calc.entryFromFood(oats, 50, 'f1')),          // 190
    Object.assign({ date: '2026-11-20' }, Calc.entryFromRecipe(recipe, 1.5, 'portion', 'r1')), // 378.75
    Object.assign({ date: '2026-11-20' }, Calc.entryFromQuick({ kcal: 100 })),           // 100
    Object.assign({ date: '2026-11-21' }, Calc.entryFromRecipe(recipe, 300, 'g', null)),  // 378.75
  ];
  const t = Calc.dailyKcal(entries);
  approx(t['2026-11-20'], 668.75);
  approx(t['2026-11-21'], 378.75);
  assert.deepEqual(Object.keys(t).sort(), ['2026-11-20', '2026-11-21']);
});

test('dailyKcal: a day of 0 kcal entries is 0, a day with no entries is absent', () => {
  const t = Calc.dailyKcal([Object.assign({ date: '2026-11-22' }, Calc.entryFromQuick({ name: 'Water', kcal: 0 }))]);
  assert.equal(t['2026-11-22'], 0);
  assert.equal('2026-11-23' in t, false);
  assert.deepEqual(Calc.dailyKcal([]), {});
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
