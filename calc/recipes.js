// Recipes. Ingredient: { name, unit: '100g' | 'item', amount, kcal, protein, carbs, fat }.
// Like a food, the values are per 100 g or per item; amount is grams or number of items.
// Ingredients are copies, so editing a saved food never changes a recipe.
// Per-gram and per-portion values are derived, never stored.

import { MACROS, isNum, scaleValues, orNull, divideValues, sameValues } from './values.js';

export function isRecipe(item) {
  return !!item && Array.isArray(item.ingredients);
}

export function ingredientFromFood(food, amount) {
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
export function ingredientValues(ing) {
  if (!isNum(ing.amount) || ing.amount <= 0) {
    return { kcal: null, protein: null, carbs: null, fat: null };
  }
  return scaleValues(ing, ing.amount / (ing.unit === 'item' ? 1 : 100));
}

// Totals for the whole batch. A macro total is null unless every ingredient has that
// macro, because a partial sum would silently understate it.
export function recipeTotals(ingredients) {
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

// Cooked weight of a batch weighed in its pan: the scale reading less the empty pan.
// null when the reading is missing or not more than the pan, which means it was weighed wrongly.
export function netWeight(reading, panWeight) {
  if (!isNum(reading) || !isNum(panWeight)) return null;
  const net = reading - panWeight;
  return net > 0 ? net : null;
}

export function recipeCanLogGrams(recipe) {
  return isNum(recipe.cookedWeight) && recipe.cookedWeight > 0;
}

export function recipePerGram(recipe) {
  return divideValues(recipeTotals(recipe.ingredients), recipe.cookedWeight);
}

export function recipePerPortion(recipe) {
  return divideValues(recipeTotals(recipe.ingredients), recipe.portions);
}

// Weight of one portion in grams, or null without a cooked weight or portions.
export function recipePortionWeight(recipe) {
  if (!recipeCanLogGrams(recipe) || !isNum(recipe.portions) || recipe.portions <= 0) return null;
  return recipe.cookedWeight / recipe.portions;
}

// Values per log-entry unit: per portion for 'portion', per 100 g of cooked batch for 'g'.
export function recipeUnitValues(recipe, unit) {
  if (unit === 'portion') return recipePerPortion(recipe);
  if (unit === 'g') return scaleValues(recipePerGram(recipe), 100);
  throw new Error('Unknown recipe unit: ' + unit);
}

// Values for a serving: by { portions } (fractions allowed) or by { grams } of the cooked batch.
export function recipeServing(recipe, amount) {
  if (amount && isNum(amount.portions)) {
    return scaleValues(recipePerPortion(recipe), amount.portions);
  }
  if (amount && isNum(amount.grams)) {
    return scaleValues(recipePerGram(recipe), amount.grams);
  }
  throw new Error('recipeServing needs { portions } or { grams }');
}

// True if a recipe's per-portion or per-100 g values differ. A rename alone is not a change.
export function recipeChanged(a, b) {
  return !sameValues(recipeUnitValues(a, 'portion'), recipeUnitValues(b, 'portion')) ||
    !sameValues(recipeUnitValues(a, 'g'), recipeUnitValues(b, 'g'));
}
