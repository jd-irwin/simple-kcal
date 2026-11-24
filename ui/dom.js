// DOM and form helpers shared by screens and dialogs.

import Calc from '../calc/index.js';
import { MACROS, MACRO_NAMES, macroLine, unitText } from './text.js';

export const $ = (id) => document.getElementById(id);

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function formError(form, text) {
  const node = form.querySelector('.message.error');
  node.textContent = text || '';
  node.hidden = !text;
  return false;
}

export function openDialog(dialog, focusEl) {
  formError(dialog.querySelector('form'), '');
  dialog.showModal();
  if (focusEl) focusEl.focus();
}

// Reads a required number field. Returns the number, or undefined after showing an error.
export function readRequired(form, input, what, allowZero) {
  const n = Calc.parseNumber(input.value);
  if (n === null) { formError(form, 'Enter the ' + what + '.'); input.focus(); return undefined; }
  if (Number.isNaN(n) || (!allowZero && n === 0)) {
    formError(form, 'Enter the ' + what + ' as a number' + (allowZero ? '' : ' above 0') + ', for example 150.');
    input.focus();
    return undefined;
  }
  return n;
}

// Reads optional macro fields with the given id prefix. Returns { protein, carbs, fat } or undefined on error.
export function readMacros(form, prefix) {
  const out = {};
  for (const k of MACROS) {
    const input = $(prefix + '-' + k);
    const n = Calc.parseNumber(input.value);
    if (Number.isNaN(n)) {
      formError(form, MACRO_NAMES[k] + ' must be a number, or left blank if unknown.');
      input.focus();
      return undefined;
    }
    out[k] = n;
  }
  return out;
}

export function numToField(n) {
  return n === null || n === undefined ? '' : String(n);
}

export function checkedUnit(radioName) {
  return document.querySelector('input[name="' + radioName + '"]:checked').value;
}

export function checkRadio(radioName, value) {
  document.querySelector('input[name="' + radioName + '"][value="' + value + '"]').checked = true;
}

// Enables or disables the Grams option of a Portions / Grams switch, falling back to Portions.
export function setGramsAllowed(radioName, allowed) {
  const grams = document.querySelector('input[name="' + radioName + '"][value="g"]');
  grams.disabled = !allowed;
  if (!allowed && grams.checked) checkRadio(radioName, 'portion');
}

// Reads name, unit, kcal and macros from a food or ingredient form.
// Returns the values, or undefined after showing an error.
export function readFoodFields(form, prefix, radioName, what) {
  const name = $(prefix + '-name').value.trim();
  if (!name) { formError(form, 'Enter a name for the ' + (what || 'food') + '.'); $(prefix + '-name').focus(); return undefined; }
  const kcal = readRequired(form, $(prefix + '-kcal'), 'calories', true);
  if (kcal === undefined) return undefined;
  const macros = readMacros(form, prefix);
  if (!macros) return undefined;
  return Object.assign({ name, unit: checkedUnit(radioName), kcal }, macros);
}

export function fillFoodFields(prefix, radioName, f) {
  $(prefix + '-name').value = f.name;
  checkRadio(radioName, f.unit);
  $(prefix + '-kcal').value = numToField(f.kcal);
  MACROS.forEach((k) => { $(prefix + '-' + k).value = numToField(f[k]); });
}

function makeRow(title, sub, extra, onClick) {
  const li = el('li');
  const btn = el('button', 'row');
  btn.type = 'button';
  const main = el('span', 'row-main');
  main.append(el('span', 'row-title', title));
  main.append(el('span', 'row-sub', sub));
  btn.append(main, el('span', 'row-kcal', extra));
  btn.addEventListener('click', onClick);
  li.append(btn);
  return li;
}

export function foodRow(food, onClick, extra) {
  return makeRow(food.name, unitText(food.unit) + ' · ' + macroLine(food), extra, onClick);
}

export function recipeRow(recipe, onClick, extra, label) {
  const sub = (label ? label + ' · ' : '') + 'per portion · ' + macroLine(Calc.recipePerPortion(recipe));
  return makeRow(recipe.name, sub, extra, onClick);
}
