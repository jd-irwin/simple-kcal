// Amount dialog: log a saved food or recipe.

import Calc from '../calc/index.js';
import { app } from './store.js';
import { valuesSummary, unitText, qtyLabel } from './text.js';
import { $, openDialog, readRequired, checkedUnit, checkRadio, setGramsAllowed } from './dom.js';
import { addEntry, afterLog } from './log.js';

let amountItem = null;

let amountDefault = null;

function recipePerText(recipe) {
  const parts = ['Per portion ' + Calc.fmtKcal(Calc.recipePerPortion(recipe).kcal) + ' kcal'];
  if (Calc.recipeCanLogGrams(recipe)) {
    parts.push('per 100 g ' + Calc.fmtKcal(Calc.recipeUnitValues(recipe, 'g').kcal) + ' kcal');
    parts.push('1 portion ≈ ' + Calc.fmtKcal(Calc.recipePortionWeight(recipe)) + ' g');
  }
  return parts.join(' · ');
}

export function openAmount(item) {
  amountItem = item;
  const recipe = Calc.isRecipe(item);
  $('amount-title').textContent = item.name;
  $('amount-unit-field').hidden = !recipe;
  if (recipe) {
    amountDefault = Calc.defaultRecipeAmount(item, app.state.entries);
    setGramsAllowed('amount-unit', Calc.recipeCanLogGrams(item));
    checkRadio('amount-unit', amountDefault.unit);
    $('amount-per').textContent = recipePerText(item);
    $('amount-qty').value = Calc.fmtQty(amountDefault.quantity);
  } else {
    $('amount-per').textContent = unitText(item.unit) + ': ' + valuesSummary(item);
    $('amount-qty').value = Calc.fmtQty(Calc.defaultQty(item, app.state.entries));
  }
  updateAmountLabel();
  updateAmountPreview();
  openDialog($('amount-dialog'), $('amount-form').querySelector('[type=submit]'));
}

function amountUnit() {
  return Calc.isRecipe(amountItem) ? checkedUnit('amount-unit') : Calc.foodEntryUnit(amountItem);
}

function updateAmountLabel() {
  $('amount-label').textContent = qtyLabel(amountUnit());
}

// Switching between portions and grams: use last time's amount for that unit, else 1 portion or blank grams.
function changeAmountUnit() {
  const unit = amountUnit();
  if (unit === amountDefault.unit) $('amount-qty').value = Calc.fmtQty(amountDefault.quantity);
  else $('amount-qty').value = unit === 'portion' ? '1' : '';
  updateAmountLabel();
  updateAmountPreview();
  $('amount-qty').focus();
}

function amountEntry(qty) {
  const item = amountItem;
  return Calc.isRecipe(item)
    ? Calc.entryFromRecipe(item, qty, amountUnit(), item.id)
    : Calc.entryFromFood(item, qty, item.id);
}

function updateAmountPreview() {
  const qty = Calc.parseNumber($('amount-qty').value);
  $('amount-preview').textContent = qty > 0 ? valuesSummary(Calc.entryTotals(amountEntry(qty))) : '';
}

function submitAmount(e) {
  e.preventDefault();
  const form = $('amount-form');
  const qty = readRequired(form, $('amount-qty'), amountUnit() === 'g' ? 'amount' : qtyLabel(amountUnit()).toLowerCase(), false);
  if (qty === undefined) return;
  const entry = addEntry(amountEntry(qty));
  amountItem.lastUsed = Date.now();
  $('amount-dialog').close();
  afterLog(entry);
}

export function init() {
  $('amount-form').addEventListener('submit', submitAmount);
  $('amount-qty').addEventListener('input', updateAmountPreview);
  document.querySelectorAll('input[name="amount-unit"]').forEach((r) => r.addEventListener('change', changeAmountUnit));
}
