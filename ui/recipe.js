// Recipe builder: a new recipe from Add (log it, and optionally save it), or a saved one edited from the Library.

import Calc from '../calc/index.js';
import { app, commit, newId } from './store.js';
import { toast } from './messages.js';
import { macroLine, valuesSummary } from './text.js';
import { $, el, formError, openDialog, readRequired, numToField, checkedUnit, checkRadio, setGramsAllowed, makeRow } from './dom.js';
import { addEntry, afterLog } from './log.js';
import { openApply } from './apply.js';
import { openIngredient } from './ingredient.js';

let recipeMode = 'new';
let editingRecipe = null;
// Ingredients being edited. Copies, so Cancel leaves a saved recipe untouched.
let draftIngredients = [];

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
    const values = Calc.ingredientValues(ing);
    list.append(makeRow(ing.name, ingredientAmountText(ing) + ' · ' + macroLine(values),
      Calc.fmtKcal(values.kcal) + ' kcal', () => openIngredient(draftIngredients, i, renderRecipe)));
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
  if (!commit()) return;
  $('recipe-dialog').close();
  toast('Saved ' + recipe.name + ' to your recipes. Nothing logged.', () => {
    app.state.recipes = app.state.recipes.filter((r) => r !== recipe);
    commit();
  });
}

function saveEditedRecipe() {
  const values = readRecipe();
  if (!values) return;
  const recipe = editingRecipe;
  const before = Object.assign({}, recipe);
  Object.assign(recipe, values);
  if (!commit()) return;
  $('recipe-dialog').close();
  const counts = Calc.linkedEntryCounts(app.state.entries, recipe, app.todayKey);
  if (!Calc.recipeChanged(before, recipe) || counts.all === 0) toast('Saved ' + recipe.name + '.');
  else openApply(recipe, counts);
}

function deleteRecipe() {
  const recipe = editingRecipe;
  const index = app.state.recipes.indexOf(recipe);
  app.state.recipes.splice(index, 1);
  commit();
  $('recipe-dialog').close();
  toast('Deleted ' + recipe.name + '. Logged entries are unchanged.', () => {
    app.state.recipes.splice(Math.min(index, app.state.recipes.length), 0, recipe);
    commit();
  });
}

export function init() {
  $('recipe-form').addEventListener('submit', submitRecipe);
  $('recipe-form').addEventListener('input', renderRecipe);
  document.querySelectorAll('input[name="recipe-unit"]').forEach((r) => r.addEventListener('change', changeRecipeUnit));
  $('recipe-save-only').addEventListener('click', saveOnlyRecipe);
  $('recipe-delete').addEventListener('click', deleteRecipe);
  $('add-ingredient').addEventListener('click', () => openIngredient(draftIngredients, -1, renderRecipe));
}
