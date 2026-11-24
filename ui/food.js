// Food dialogs: a new food from the Add screen, and editing a saved food from the Library.

import Calc from '../calc/index.js';
import { save, newId, app } from './store.js';
import { render } from './nav.js';
import { toast } from './messages.js';
import { MACROS, valuesSummary, unitText } from './text.js';
import { $, openDialog, readRequired, checkedUnit, readFoodFields, fillFoodFields } from './dom.js';
import { addEntry, afterLog } from './log.js';
import { openApply } from './apply.js';

function updateFoodLabels() {
  const unit = checkedUnit('food-unit');
  $('food-kcal-label').textContent = 'Calories ' + unitText(unit) + ' (kcal)';
  $('food-qty-label').textContent = unit === '100g' ? 'Amount eaten (g)' : 'Number of items eaten';
  if ($('food-qty').dataset.touched !== '1') {
    $('food-qty').value = unit === '100g' ? '100' : '1';
  }
  updateFoodPreview();
}

function updateFoodPreview() {
  const kcal = Calc.parseNumber($('food-kcal').value);
  const qty = Calc.parseNumber($('food-qty').value);
  if (!(kcal >= 0) || !(qty > 0)) { $('food-preview').textContent = ''; return; }
  const vals = { unit: checkedUnit('food-unit'), kcal: kcal };
  MACROS.forEach((k) => {
    const n = Calc.parseNumber($('food-' + k).value);
    vals[k] = Number.isNaN(n) ? null : n;
  });
  $('food-preview').textContent = 'Logs ' + valuesSummary(Calc.entryTotals(Calc.entryFromFood(vals, qty)));
}

export function openNewFood(prefillName) {
  fillFoodFields('food', 'food-unit', { name: prefillName || '', unit: '100g', kcal: null, protein: null, carbs: null, fat: null });
  $('food-save').checked = true;
  $('food-qty').dataset.touched = '';
  $('food-preview').textContent = '';
  updateFoodLabels();
  openDialog($('food-dialog'), prefillName ? $('food-kcal') : $('food-name'));
}

function submitNewFood(e) {
  e.preventDefault();
  const form = $('food-form');
  const values = readFoodFields(form, 'food', 'food-unit');
  if (!values) return;
  const qty = readRequired(form, $('food-qty'), values.unit === '100g' ? 'amount eaten' : 'number of items', false);
  if (qty === undefined) return;
  let food = null;
  if ($('food-save').checked) {
    food = Object.assign({ id: newId() }, values, { lastUsed: Date.now() });
    app.state.foods.push(food);
  }
  const entry = addEntry(Calc.entryFromFood(values, qty, food ? food.id : null));
  $('food-dialog').close();
  afterLog(entry);
}

let editingFood = null;

function updateEditFoodLabels() {
  $('edit-food-kcal-label').textContent = 'Calories ' + unitText(checkedUnit('edit-food-unit')) + ' (kcal)';
}

export function openEditFood(food) {
  editingFood = food;
  fillFoodFields('edit-food', 'edit-food-unit', food);
  updateEditFoodLabels();
  openDialog($('edit-food-dialog'), $('edit-food-form').querySelector('[data-close]'));
}

function submitEditFood(e) {
  e.preventDefault();
  const form = $('edit-food-form');
  const values = readFoodFields(form, 'edit-food', 'edit-food-unit');
  if (!values) return;
  const food = editingFood;
  const before = Object.assign({}, food);
  Object.assign(food, values);
  if (!save()) return;
  $('edit-food-dialog').close();
  render();

  if (!Calc.nutritionChanged(before, food)) {
    toast('Saved ' + food.name + '.');
  } else if (before.unit !== food.unit) {
    toast('Saved. Entries already logged keep their values because the unit changed.');
  } else {
    const counts = Calc.linkedEntryCounts(app.state.entries, food, app.todayKey);
    if (counts.all === 0) toast('Saved ' + food.name + '.');
    else openApply(food, counts);
  }
}

function deleteFood() {
  const food = editingFood;
  const index = app.state.foods.indexOf(food);
  app.state.foods.splice(index, 1);
  save();
  $('edit-food-dialog').close();
  render();
  toast('Deleted ' + food.name + '. Logged entries are unchanged.', () => {
    app.state.foods.splice(Math.min(index, app.state.foods.length), 0, food);
    save();
    render();
  });
}

export function init() {
  $('food-form').addEventListener('submit', submitNewFood);
  $('food-form').addEventListener('input', updateFoodPreview);
  $('food-qty').addEventListener('input', () => { $('food-qty').dataset.touched = '1'; });
  document.querySelectorAll('input[name="food-unit"]').forEach((r) => r.addEventListener('change', updateFoodLabels));
  $('edit-food-form').addEventListener('submit', submitEditFood);
  document.querySelectorAll('input[name="edit-food-unit"]').forEach((r) => r.addEventListener('change', updateEditFoodLabels));
  $('edit-food-delete').addEventListener('click', deleteFood);
}
