// Quick add, and editing a log entry.

import Calc from '../calc/index.js';
import { save, app } from './store.js';
import { render } from './nav.js';
import { toast } from './messages.js';
import { MACROS, valuesSummary, qtyLabel, entryName } from './text.js';
import { $, formError, openDialog, readRequired, readMacros, numToField } from './dom.js';
import { addEntry, afterLog } from './log.js';

export function openQuick() {
  $('quick-form').reset();
  openDialog($('quick-dialog'), $('quick-kcal'));
}

function submitQuick(e) {
  e.preventDefault();
  const form = $('quick-form');
  const kcal = readRequired(form, $('quick-kcal'), 'calories', true);
  if (kcal === undefined) return;
  const macros = readMacros(form, 'quick');
  if (!macros) return;
  const entry = addEntry(Calc.entryFromQuick(Object.assign({ name: $('quick-name').value.trim(), kcal }, macros)));
  $('quick-dialog').close();
  afterLog(entry);
}

let editingEntry = null;

function isQuickEntry(entry) {
  return entry.unit === 'quick';
}

function perText(entry) {
  if (entry.unit === 'g') return 'per 100 g';
  if (entry.unit === 'portion') return 'per portion';
  return 'per item';
}

// Where the entry came from. The saved food is only used for its name; no values are read.
function entryOrigin(entry) {
  let src = '';
  if (entry.source === 'quick') {
    src = 'Quick add';
  } else if (entry.source === 'food') {
    const food = entry.sourceId ? app.state.foods.find((f) => f.id === entry.sourceId) : null;
    if (!entry.sourceId) src = 'Not saved to your foods';
    else if (food) src = 'From your saved food ' + food.name;
    else src = 'From a food no longer in your Library';
  } else if (entry.source === 'recipe') {
    const recipe = entry.sourceId ? app.state.recipes.find((r) => r.id === entry.sourceId) : null;
    if (!entry.sourceId) src = 'Recipe not saved';
    else if (recipe) src = 'From your saved recipe ' + recipe.name;
    else src = 'From a recipe no longer in your Library';
  }
  return Calc.weekdayDate(entry.date) + (src ? ' · ' + src : '');
}

export function openEntry(entry) {
  editingEntry = entry;
  const quick = isQuickEntry(entry);
  $('entry-origin').textContent = entryOrigin(entry);
  $('entry-name').value = entry.name || '';
  $('entry-amount-fields').hidden = quick;
  $('entry-quick-fields').hidden = !quick;
  if (quick) {
    $('entry-kcal').value = numToField(entry.kcal);
    MACROS.forEach((k) => { $('entry-' + k).value = numToField(entry[k]); });
  } else {
    $('entry-qty-label').textContent = qtyLabel(entry.unit);
    $('entry-qty').value = Calc.fmtQty(entry.quantity);
    $('entry-nutrition').open = false;
    $('entry-nutrition-summary').textContent = 'Edit nutrition (' + perText(entry) + ')';
    $('entry-n-kcal').value = numToField(entry.kcal);
    MACROS.forEach((k) => { $('entry-n-' + k).value = numToField(entry[k]); });
    updateEntryPreview();
  }
  $('entry-date').value = entry.date;
  openDialog($('entry-dialog'), $('entry-form').querySelector('[data-close]'));
}

// Per-unit values as currently typed in Edit nutrition; anything unreadable falls back to the entry's own.
function typedNutrition(entry) {
  const out = {};
  ['kcal'].concat(MACROS).forEach((k) => {
    const n = Calc.parseNumber($('entry-n-' + k).value);
    out[k] = Number.isNaN(n) || (k === 'kcal' && n === null) ? entry[k] : n;
  });
  return out;
}

// Live totals from the entry's own per-unit values. Nothing is looked up.
function updateEntryPreview() {
  if (!editingEntry || isQuickEntry(editingEntry)) return;
  const qty = Calc.parseNumber($('entry-qty').value);
  const preview = Calc.setEntryNutrition(Calc.setEntryQuantity(editingEntry, qty), typedNutrition(editingEntry));
  $('entry-preview').textContent = qty > 0 ? valuesSummary(Calc.entryTotals(preview)) : '';
}

function submitEntry(e) {
  e.preventDefault();
  const form = $('entry-form');
  let updated;
  if (isQuickEntry(editingEntry)) {
    const kcal = readRequired(form, $('entry-kcal'), 'calories', true);
    if (kcal === undefined) return;
    const macros = readMacros(form, 'entry');
    if (!macros) return;
    updated = Calc.setEntryNutrition(editingEntry, Object.assign({ kcal }, macros));
  } else {
    const qty = readRequired(form, $('entry-qty'), 'amount', false);
    if (qty === undefined) return;
    // The nutrition fields are prefilled with the entry's own values, so if they were not
    // touched this writes the same values back.
    const nutrition = typedNutritionStrict(form);
    if (!nutrition) { $('entry-nutrition').open = true; return; }
    updated = Calc.setEntryNutrition(Calc.setEntryQuantity(editingEntry, qty), nutrition);
  }
  const date = $('entry-date').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { formError(form, 'Choose a date.'); return; }
  updated.name = $('entry-name').value.trim();
  updated.date = date;
  const i = app.state.entries.indexOf(editingEntry);
  app.state.entries[i] = updated;
  save();
  $('entry-dialog').close();
  render();
  toast(date === app.selectedDate ? 'Entry saved.' : 'Entry moved to ' + Calc.formatDate(date) + '.');
}

// Edit nutrition fields with validation. Returns values, or undefined after showing an error.
function typedNutritionStrict(form) {
  const kcal = readRequired(form, $('entry-n-kcal'), 'calories ' + perText(editingEntry), true);
  if (kcal === undefined) return undefined;
  const macros = readMacros(form, 'entry-n');
  if (!macros) return undefined;
  return Object.assign({ kcal }, macros);
}

function deleteEntry() {
  const entry = editingEntry;
  app.state.entries = app.state.entries.filter((x) => x !== entry);
  save();
  $('entry-dialog').close();
  render();
  toast('Deleted ' + entryName(entry) + '.', () => {
    app.state.entries.push(entry);
    save();
    render();
  });
}

export function init() {
  $('quick-form').addEventListener('submit', submitQuick);
  $('entry-form').addEventListener('submit', submitEntry);
  $('entry-qty').addEventListener('input', updateEntryPreview);
  $('entry-nutrition').addEventListener('input', updateEntryPreview);
  $('entry-delete').addEventListener('click', deleteEntry);
}
