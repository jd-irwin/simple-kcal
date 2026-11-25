// Recipe builder, in three modes: 'new' from Add (log it, and optionally save it), 'edit' for a
// saved recipe from the Library, and 'again' to cook a saved recipe again as a new batch.

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
// In 'again' mode, the saved recipe the new batch replaces when it is saved.
let replacing = null;

const EDIT_NOTE = 'This changes the recipe in your Library. Entries already logged keep their values unless you choose to update them.';
// Ingredients being edited. Copies, so Cancel leaves a saved recipe untouched.
let draftIngredients = [];

// Positive number or null, for the live summary while typing.
function softNumber(input) {
  const n = Calc.parseNumber(input.value);
  return n > 0 ? n : null;
}

// The pan chosen under "Weighed in", or null for None (or a pan deleted since).
function chosenPan() {
  const box = $('recipe-pan-field').querySelector('input:checked');
  return box && box.value ? app.state.pans.find((pan) => pan.id === box.value) || null : null;
}

// Builds the "Weighed in" buttons: None plus each saved pan. Hidden when there are no pans.
function renderPanChoice(selectedId) {
  const field = $('recipe-pan-field');
  field.querySelectorAll('label').forEach((label) => label.remove());
  const pans = Calc.searchByName(app.state.pans, '');
  field.hidden = pans.length === 0;
  const chosen = pans.some((pan) => pan.id === selectedId) ? selectedId : '';
  [{ id: '', name: 'None' }].concat(pans).forEach((pan) => {
    const input = el('input');
    input.type = 'radio';
    input.name = 'recipe-pan';
    input.value = pan.id;
    input.checked = pan.id === chosen;
    const label = el('label');
    // Name with the empty weight on its own line beneath, so long names wrap cleanly.
    const text = el('span', 'option-text', pan.name);
    if (pan.id) text.append(el('span', 'muted small', Calc.fmtQty(pan.weight) + ' g'));
    label.append(input, text);
    field.append(label);
  });
}

// Cooked weight as typed: the field itself, or the scale reading less the chosen pan.
function draftWeight() {
  const typed = softNumber($('recipe-weight'));
  const pan = chosenPan();
  return pan ? Calc.netWeight(typed, pan.weight) : typed;
}

function weightNote(pan) {
  if (!pan) return 'Weigh the finished batch without the pan to log by grams. Leave blank to log by portion only.';
  const panText = Calc.fmtQty(pan.weight) + ' g';
  const reading = softNumber($('recipe-weight'));
  if (reading === null) return 'Weigh the batch in the ' + pan.name + ' and enter the reading. The pan (' + panText + ') is taken off.';
  const net = Calc.netWeight(reading, pan.weight);
  return net === null ? 'The reading must be more than the pan (' + panText + ').'
    : 'Cooked weight ' + Calc.fmtQty(net) + ' g after the ' + panText + ' pan.';
}

// The recipe as currently typed, for live previews. Not validated.
function draftRecipe() {
  return {
    name: $('recipe-name').value.trim(),
    ingredients: draftIngredients,
    portions: softNumber($('recipe-portions')),
    cookedWeight: draftWeight(),
  };
}

function ingredientAmountText(ing) {
  return Calc.formatAmount(ing.amount, ing.unit === 'item' ? 'item' : 'g');
}

export function openNewRecipe(prefillName) {
  recipeMode = 'new';
  editingRecipe = null;
  replacing = null;
  draftIngredients = [];
  $('recipe-name').value = prefillName || '';
  $('recipe-portions').value = '';
  $('recipe-weight').value = '';
  $('recipe-save').checked = true;
  checkRadio('recipe-unit', 'portion');
  $('recipe-qty').value = '1';
  renderPanChoice(null);
  setRecipeMode();
  renderRecipe();
  openDialog($('recipe-dialog'), prefillName ? $('add-ingredient') : $('recipe-name'));
}

export function openEditRecipe(recipe) {
  recipeMode = 'edit';
  editingRecipe = recipe;
  replacing = null;
  draftIngredients = recipe.ingredients.map((ing) => Object.assign({}, ing));
  $('recipe-name').value = recipe.name;
  $('recipe-portions').value = numToField(recipe.portions);
  // The stored weight is without the pan, so the pan starts at None. Its remembered pan is kept on save.
  $('recipe-weight').value = numToField(recipe.cookedWeight);
  renderPanChoice(null);
  setRecipeMode();
  renderRecipe();
  openDialog($('recipe-dialog'), $('recipe-form').querySelector('[data-close]'));
}

// Cook again: a new batch starting from the saved recipe being edited. Opens with the weight
// blank and the recipe's pan chosen, ready for the scale reading.
function openCookAgain() {
  const old = editingRecipe;
  const draft = Calc.cookAgainDraft(old);
  $('recipe-dialog').close();
  recipeMode = 'again';
  editingRecipe = null;
  replacing = old;
  draftIngredients = draft.ingredients;
  $('recipe-name').value = draft.name;
  $('recipe-portions').value = numToField(draft.portions);
  $('recipe-weight').value = '';
  $('recipe-save').checked = true;
  checkRadio('recipe-unit', 'portion');
  $('recipe-qty').value = '1';
  renderPanChoice(draft.panId);
  setRecipeMode();
  renderRecipe();
  openDialog($('recipe-dialog'), $('recipe-weight'));
}

function setRecipeMode() {
  const edit = recipeMode === 'edit';
  const again = recipeMode === 'again';
  $('recipe-title').textContent = edit ? 'Edit saved recipe' : again ? 'Cook again' : 'New recipe';
  $('recipe-note').textContent = again
    ? 'A new batch of ' + replacing.name + '. Saving it replaces the recipe in your Library; entries from earlier batches keep their values.'
    : EDIT_NOTE;
  $('recipe-note').hidden = !edit && !again;
  $('recipe-cook-again').hidden = !edit;
  $('recipe-log-section').hidden = edit;
  $('recipe-delete').hidden = !edit;
  $('recipe-submit').textContent = edit ? 'Save' : 'Log';
}

function renderRecipe() {
  const recipe = draftRecipe();
  const pan = chosenPan();
  $('recipe-weight-label').textContent = pan ? 'Scale reading (g)' : 'Cooked weight (g)';
  $('recipe-weight-note').textContent = weightNote(pan);

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

  if (recipeMode !== 'edit') {
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
  const reading = Calc.parseNumber($('recipe-weight').value);
  if (Number.isNaN(reading) || reading === 0) {
    formError(form, 'Enter the cooked weight in grams, for example 1200, or leave it blank.');
    $('recipe-weight').focus();
    return undefined;
  }
  const pan = chosenPan();
  let weight = reading;
  if (pan && reading !== null) {
    weight = Calc.netWeight(reading, pan.weight);
    if (weight === null) {
      formError(form, 'The scale reading must be more than the ' + pan.name + ' (' + Calc.fmtQty(pan.weight) +
        ' g). Weigh the batch in the pan, or choose None.');
      $('recipe-weight').focus();
      return undefined;
    }
  }
  // The pan last used, for next time. Editing without choosing a pan keeps the one remembered.
  const panId = pan ? pan.id : (editingRecipe && editingRecipe.panId) || null;
  return { name, ingredients: draftIngredients.slice(), portions, cookedWeight: weight, panId };
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
    // When cooking again, the new batch takes the old recipe's place.
    app.state.recipes = Calc.replaceRecipe(app.state.recipes, replacing, recipe);
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
  const previous = app.state.recipes;
  app.state.recipes = Calc.replaceRecipe(previous, replacing, recipe);
  if (!commit()) return;
  $('recipe-dialog').close();
  const what = replacing ? 'the new batch of ' + recipe.name : recipe.name + ' to your recipes';
  // Undo puts the list back as it was, including the recipe a new batch replaced.
  toast('Saved ' + what + '. Nothing logged.', () => {
    app.state.recipes = previous;
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
  $('recipe-cook-again').addEventListener('click', openCookAgain);
  $('recipe-pan-field').addEventListener('change', () => {
    renderRecipe();
    $('recipe-weight').focus();
  });
  $('add-ingredient').addEventListener('click', () => openIngredient(draftIngredients, -1, renderRecipe));
}
