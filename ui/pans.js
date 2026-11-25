// Saved pans: the list in Settings and the add/edit sheet. A batch weighed in one of these
// pans has the pan's empty weight taken off (see the recipe builder).

import Calc from '../calc/index.js';
import { app, commit, newId } from './store.js';
import { toast } from './messages.js';
import { $, formError, openDialog, readRequired, numToField, makeRow } from './dom.js';

let editingPan = null;

// Called from the Settings screen's render.
export function renderPans() {
  const list = $('pan-list');
  list.replaceChildren();
  Calc.searchByName(app.state.pans, '').forEach((pan) => {
    list.append(makeRow(pan.name, 'Empty weight', Calc.fmtQty(pan.weight) + ' g', () => openPan(pan)));
  });
}

function openPan(pan) {
  editingPan = pan;
  $('pan-title').textContent = pan ? 'Edit pan' : 'Add pan';
  $('pan-name').value = pan ? pan.name : '';
  $('pan-weight').value = pan ? numToField(pan.weight) : '';
  $('pan-delete').hidden = !pan;
  openDialog($('pan-dialog'), pan ? $('pan-weight') : $('pan-name'));
}

function submitPan(e) {
  e.preventDefault();
  const form = $('pan-form');
  const name = $('pan-name').value.trim();
  if (!name) { formError(form, 'Enter a name for the pan, for example Big pot.'); $('pan-name').focus(); return; }
  const weight = readRequired(form, $('pan-weight'), 'empty weight in grams', false);
  if (weight === undefined) return;
  if (editingPan) Object.assign(editingPan, { name, weight });
  else app.state.pans.push({ id: newId(), name, weight });
  if (!commit()) return;
  $('pan-dialog').close();
  toast('Saved ' + name + ' (' + Calc.fmtQty(weight) + ' g).');
}

// Recipes that remember this pan simply stop pre-selecting it.
function deletePan() {
  const pan = editingPan;
  const index = app.state.pans.indexOf(pan);
  app.state.pans.splice(index, 1);
  commit();
  $('pan-dialog').close();
  toast('Deleted ' + pan.name + '.', () => {
    app.state.pans.splice(Math.min(index, app.state.pans.length), 0, pan);
    commit();
  });
}

export function init() {
  $('add-pan').addEventListener('click', () => openPan(null));
  $('pan-form').addEventListener('submit', submitPan);
  $('pan-delete').addEventListener('click', deletePan);
}
