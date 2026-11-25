// Recipe maths: batch totals, per portion, per gram, and recipe log entries.

import assert from 'node:assert/strict';
import Calc from '../calc/index.js';
import { test, approx } from './harness.js';
import { porridge } from './fixtures.js';

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

test('netWeight takes the pan off the scale reading, and refuses a reading not over the pan', () => {
  assert.equal(Calc.netWeight(2680, 1450), 1230);
  approx(Calc.netWeight(1450.5, 1450), 0.5);
  assert.equal(Calc.netWeight(1450, 1450), null); // nothing in the pan
  assert.equal(Calc.netWeight(800, 1450), null);  // weighed without the pan, or the wrong pan
  assert.equal(Calc.netWeight(null, 1450), null);
  assert.equal(Calc.netWeight(2000, null), null);
});
