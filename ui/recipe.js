// Recipe builder (new from Add, edit from Library) and its ingredient sheet.

import Calc from '../calc/index.js';
import { save, newId, app } from './store.js';
import { render } from './nav.js';
import { toast } from './messages.js';
import { RECENTS_LIMIT, MACROS, macroLine, valuesSummary, unitText } from './text.js';
import { $, el, formError, openDialog, readRequired, numToField, checkedUnit, checkRadio, setGramsAllowed, readFoodFields, fillFoodFields, foodRow } from './dom.js';
import { addEntry, afterLog } from './log.js';
import { openApply } from './apply.js';

let recipeMode = 'new';

let editingRecipe = null;

// Ingredients being edited. Copies, so Cancel leaves a saved recipe untouched.
let draftIngredients = [];

function blankFood() {
  return { name: '', unit: '100g', kcal: null, protein: null, carbs: null, fat: null };
}

// Positive number or null, for the live summary while typing.
function softNumber(input) {
  const n = Calc.parseNumber(input.value);
  return n > 0 ? n : null;
}

// The recipe as currently typed, for live previews. Not validated.
function draftRecipe() {
  return {
    name: $('recipe-name').value.trim(),
    ingredients: draftIngredients,
    portions: softNumber($('recipe-portions')),
    cookedWeight: softNumber($('recipe-weight')),
  };
}

function ingredientAmountText(ing) {
  return Calc.formatAmount(ing.amount, ing.unit === 'item' ? 'item' : 'g');
}

export function openNewRecipe(prefillName) {
  recipeMode = 'new';
  editingRecipe = null;
  draftIngredients = [];
  $('recipe-name').value = prefillName || '';
  $('recipe-portions').value = '';
  $('recipe-weight').value = '';
  $('recipe-save').checked = true;
  checkRadio('recipe-unit', 'portion');
  $('recipe-qty').value = '1';
  setRecipeMode();
  renderRecipe();
  openDialog($('recipe-dialog'), prefillName ? $('add-ingredient') : $('recipe-name'));
}

export function openEditRecipe(recipe) {
  recipeMode = 'edit';
  editingRecipe = recipe;
  draftIngredients = recipe.ingredients.map((ing) => Object.assign({}, ing));
  $('recipe-name').value = recipe.name;
  $('recipe-portions').value = numToField(recipe.portions);
  $('recipe-weight').value = numToField(recipe.cookedWeight);
  setRecipeMode();
  renderRecipe();
  openDialog($('recipe-dialog'), $('recipe-form').querySelector('[data-close]'));
}

function setRecipeMode() {
  const edit = recipeMode === 'edit';
  $('recipe-title').textContent = edit ? 'Edit saved recipe' : 'New recipe';
  $('recipe-note').hidden = !edit;
  $('recipe-log-section').hidden = edit;
  $('recipe-delete').hidden = !edit;
  $('recipe-submit').textContent = edit ? 'Save' : 'Log';
}

function renderRecipe() {
  const recipe = draftRecipe();

  const list = $('ingredient-list');
  list.replaceChildren();
  draftIngredients.forEach((ing, i) => {
    const li = el('li');
    const btn = el('button', 'row');
    btn.type = 'button';
    const main = el('span', 'row-main');
    main.append(el('span', 'row-title', ing.name));
    main.append(el('span', 'row-sub', ingredientAmountText(ing) + ' · ' + macroLine(Calc.ingredientValues(ing))));
    btn.append(main, el('span', 'row-kcal', Calc.fmtKcal(Calc.ingredientValues(ing).kcal) + ' kcal'));
    btn.addEventListener('click', () => openIngredient(i));
    li.append(btn);
    list.append(li);
  });
  $('ingredient-empty').hidden = draftIngredients.length > 0;

  const summary = $('recipe-summary');
  summary.replaceChildren();
  const line = (label, text) => summary.append(el('dt', null, label), el('dd', null, text));
  line('Whole batch', valuesSummary(Calc.recipeTotals(draftIngredients)));
  line('Per portion', recipe.portions ? valuesSummary(Calc.recipePerPortion(recipe)) : 'Enter the number of portions');
  line('Per 100 g', recipe.cookedWeight ? valuesSummary(Calc.recipeUnitValues(recipe, 'g')) : 'Add the cooked weight to log by grams');
  if (Calc.recipePortionWeight(recipe) !== null) {
    line('1 portion', '≈ ' + Calc.fmtKcal(Calc.recipePortionWeight(recipe)) + ' g');
  }

  if (recipeMode === 'new') {
    setGramsAllowed('recipe-unit', Calc.recipeCanLogGrams(recipe));
    const unit = checkedUnit('recipe-unit');
    $('recipe-qty-label').textContent = unit === 'g' ? 'Amount eaten (g)' : 'Number of portions';
    const qty = Calc.parseNumber($('recipe-qty').value);
    const ready = qty > 0 && draftIngredients.length > 0 && (unit === 'g' ? recipe.cookedWeight : recipe.portions);
    $('recipe-preview').textContent = ready
      ? 'Logs ' + valuesSummary(Calc.entryTotals(Calc.entryFromRecipe(recipe, qty, unit))) : '';
    $('recipe-save-only').hidden = !$('recipe-save').checked;
  } else {
    $('recipe-save-only').hidden = true;
  }
}

function changeRecipeUnit() {
  $('recipe-qty').value = checkedUnit('recipe-unit') === 'portion' ? '1' : '';
  renderRecipe();
  $('recipe-qty').focus();
}

// Validates the recipe fields. Returns { name, ingredients, portions, cookedWeight } or undefined after an error.
function readRecipe() {
  const form = $('recipe-form');
  const name = $('recipe-name').value.trim();
  if (!name) { formError(form, 'Enter a name for the recipe.'); $('recipe-name').focus(); return undefined; }
  if (draftIngredients.length === 0) { formError(form, 'Add at least one ingredient.'); $('add-ingredient').focus(); return undefined; }
  const portions = readRequired(form, $('recipe-portions'), 'number of portions', false);
  if (portions === undefined) return undefined;
  const weight = Calc.parseNumber($('recipe-weight').value);
  if (Number.isNaN(weight) || weight === 0) {
    formError(form, 'Enter the cooked weight in grams, for example 1200, or leave it blank.');
    $('recipe-weight').focus();
    return undefined;
  }
  return { name, ingredients: draftIngredients.slice(), portions, cookedWeight: weight };
}

function submitRecipe(e) {
  e.preventDefault();
  if (recipeMode === 'edit') saveEditedRecipe();
  else logNewRecipe();
}

function logNewRecipe() {
  const form = $('recipe-form');
  const values = readRecipe();
  if (!values) return;
  const unit = checkedUnit('recipe-unit');
  const qty = readRequired(form, $('recipe-qty'), unit === 'g' ? 'amount eaten' : 'number of portions', false);
  if (qty === undefined) return;
  let recipe = null;
  if ($('recipe-save').checked) {
    recipe = Object.assign({ id: newId() }, values, { lastUsed: Date.now() });
    app.state.recipes.push(recipe);
  }
  const entry = addEntry(Calc.entryFromRecipe(values, qty, unit, recipe ? recipe.id : null));
  $('recipe-dialog').close();
  afterLog(entry);
}

// Save a new recipe without logging it, for a batch cooked now and eaten later.
function saveOnlyRecipe() {
  const values = readRecipe();
  if (!values) return;
  const recipe = Object.assign({ id: newId() }, values, { lastUsed: Date.now() });
  app.state.recipes.push(recipe);
  if (!save()) return;
  $('recipe-dialog').close();
  render();
  toast('Saved ' + recipe.name + ' to your recipes. Nothing logged.', () => {
    app.state.recipes = app.state.recipes.filter((r) => r !== recipe);
    save();
    render();
  });
}

function saveEditedRecipe() {
  const values = readRecipe();
  if (!values) return;
  const recipe = editingRecipe;
  const before = Object.assign({}, recipe);
  Object.assign(recipe, values);
  if (!save()) return;
  $('recipe-dialog').close();
  render();
  const counts = Calc.linkedEntryCounts(app.state.entries, recipe, app.todayKey);
  if (!Calc.recipeChanged(before, recipe) || counts.all === 0) toast('Saved ' + recipe.name + '.');
  else openApply(recipe, counts);
}

function deleteRecipe() {
  const recipe = editingRecipe;
  const index = app.state.recipes.indexOf(recipe);
  app.state.recipes.splice(index, 1);
  save();
  $('recipe-dialog').close();
  render();
  toast('Deleted ' + recipe.name + '. Logged entries are unchanged.', () => {
    app.state.recipes.splice(Math.min(index, app.state.recipes.length), 0, recipe);
    save();
    render();
  });
}

let ingredientIndex = -1; // -1 while adding a new ingredient

function openIngredient(index) {
  ingredientIndex = index;
  const ing = index >= 0 ? draftIngredients[index] : null;
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
  if (ingredientIndex >= 0) draftIngredients[ingredientIndex] = ing;
  else draftIngredients.push(ing);
  $('ingredient-dialog').close();
  renderRecipe();
}

function removeIngredient() {
  draftIngredients.splice(ingredientIndex, 1);
  $('ingredient-dialog').close();
  renderRecipe();
}

export function init() {
  $('recipe-form').addEventListener('submit', submitRecipe);
  $('recipe-form').addEventListener('input', renderRecipe);
  document.querySelectorAll('input[name="recipe-unit"]').forEach((r) => r.addEventListener('change', changeRecipeUnit));
  $('recipe-save-only').addEventListener('click', saveOnlyRecipe);
  $('recipe-delete').addEventListener('click', deleteRecipe);
  $('add-ingredient').addEventListener('click', () => openIngredient(-1));
  $('ingredient-form').addEventListener('submit', submitIngredient);
  $('ingredient-form').addEventListener('input', updateIngredientPreview);
  document.querySelectorAll('input[name="ing-unit"]').forEach((r) => r.addEventListener('change', updateIngredientLabels));
  $('ingredient-search').addEventListener('input', renderIngredientPicker);
  // Enter in a search box should not submit the ingredient form.
  $('ingredient-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  $('ingredient-remove').addEventListener('click', removeIngredient);
}
