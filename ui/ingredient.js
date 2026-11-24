// Ingredient sheet: add or edit one ingredient of the recipe being built.
// It edits the list it is given and calls back when the list changes, so it needs nothing from the recipe builder.

import Calc from '../calc/index.js';
import { app } from './store.js';
import { RECENTS_LIMIT, MACROS, valuesSummary, unitText } from './text.js';
import { $, openDialog, readRequired, checkedUnit, readFoodFields, fillFoodFields, foodRow } from './dom.js';

let ingredients = []; // the recipe's draft ingredient list
let ingredientIndex = -1; // -1 while adding a new ingredient
let onChange = null;

function blankFood() {
  return { name: '', unit: '100g', kcal: null, protein: null, carbs: null, fat: null };
}

// Opens the sheet for list[index], or for a new ingredient when index is -1.
// changed() runs after the list has been updated.
export function openIngredient(list, index, changed) {
  ingredients = list;
  ingredientIndex = index;
  onChange = changed;
  const ing = index >= 0 ? ingredients[index] : null;
  $('ingredient-title').textContent = ing ? 'Edit ingredient' : 'Add ingredient';
  $('ingredient-pick').hidden = !!ing || app.state.foods.length === 0;
  $('ingredient-search').value = '';
  $('ingredient-copied').hidden = true;
  fillFoodFields('ing', 'ing-unit', ing || blankFood());
  $('ing-amount').value = ing ? Calc.fmtQty(ing.amount) : '';
  $('ingredient-remove').hidden = !ing;
  $('ingredient-submit').textContent = ing ? 'Save' : 'Add';
  updateIngredientLabels();
  renderIngredientPicker();
  const form = $('ingredient-form');
  openDialog($('ingredient-dialog'), ing ? $('ing-amount') : (app.state.foods.length ? form.querySelector('[data-close]') : $('ing-name')));
}

function renderIngredientPicker() {
  const query = $('ingredient-search').value.trim();
  const foods = Calc.searchRecent(app.state.foods, query).slice(0, RECENTS_LIMIT);
  const list = $('ingredient-results');
  list.replaceChildren();
  foods.forEach((food) => list.append(foodRow(food, () => pickIngredientFood(food), Calc.fmtKcal(food.kcal) + ' kcal')));
  const empty = $('ingredient-results-empty');
  empty.textContent = 'No saved foods match “' + query + '”. Type the ingredient in below.';
  empty.hidden = foods.length > 0;
}

// Copies a saved food's values into the form. The ingredient is a copy, not a link.
function pickIngredientFood(food) {
  fillFoodFields('ing', 'ing-unit', food);
  $('ing-amount').value = food.unit === 'item' ? '1' : '';
  $('ingredient-pick').hidden = true;
  $('ingredient-copied').textContent = 'Copied from your saved food ' + food.name +
    '. Changes here affect this recipe only.';
  $('ingredient-copied').hidden = false;
  updateIngredientLabels();
  $('ing-amount').focus();
}

function updateIngredientLabels() {
  const unit = checkedUnit('ing-unit');
  $('ing-kcal-label').textContent = 'Calories ' + unitText(unit) + ' (kcal)';
  $('ing-amount-label').textContent = unit === 'item' ? 'Number of items used' : 'Weight used (g)';
  updateIngredientPreview();
}

function updateIngredientPreview() {
  const kcal = Calc.parseNumber($('ing-kcal').value);
  const amount = Calc.parseNumber($('ing-amount').value);
  if (!(kcal >= 0) || !(amount > 0)) { $('ing-preview').textContent = ''; return; }
  const vals = { name: '', unit: checkedUnit('ing-unit'), kcal: kcal };
  MACROS.forEach((k) => {
    const n = Calc.parseNumber($('ing-' + k).value);
    vals[k] = Number.isNaN(n) ? null : n;
  });
  $('ing-preview').textContent = 'Adds ' + valuesSummary(Calc.ingredientValues(Calc.ingredientFromFood(vals, amount)));
}

function submitIngredient(e) {
  e.preventDefault();
  const form = $('ingredient-form');
  const values = readFoodFields(form, 'ing', 'ing-unit', 'ingredient');
  if (!values) return;
  const amount = readRequired(form, $('ing-amount'), values.unit === 'item' ? 'number of items used' : 'weight used', false);
  if (amount === undefined) return;
  const ing = Calc.ingredientFromFood(values, amount);
  if (ingredientIndex >= 0) ingredients[ingredientIndex] = ing;
  else ingredients.push(ing);
  $('ingredient-dialog').close();
  onChange();
}

function removeIngredient() {
  ingredients.splice(ingredientIndex, 1);
  $('ingredient-dialog').close();
  onChange();
}

export function init() {
  $('ingredient-form').addEventListener('submit', submitIngredient);
  $('ingredient-form').addEventListener('input', updateIngredientPreview);
  document.querySelectorAll('input[name="ing-unit"]').forEach((r) => r.addEventListener('change', updateIngredientLabels));
  $('ingredient-search').addEventListener('input', renderIngredientPicker);
  // Enter in a search box should not submit the ingredient form.
  $('ingredient-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  $('ingredient-remove').addEventListener('click', removeIngredient);
}
