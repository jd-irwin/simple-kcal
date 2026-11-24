// After editing a saved food or recipe: apply the new values to logged entries?

import Calc from '../calc/index.js';
import { save, app } from './store.js';
import { render } from './nav.js';
import { toast } from './messages.js';
import { unitText, plural } from './text.js';
import { $ } from './dom.js';

let applyItem = null;

let applyCounts = null;

// item is a saved food or recipe that has just been edited.
export function openApply(item, counts) {
  applyItem = item;
  applyCounts = counts;
  const what = Calc.isRecipe(item) ? 'per-portion and per-100 g' : unitText(item.unit);
  $('apply-title').textContent = 'Update entries already logged from ' + item.name + '?';
  $('apply-text').textContent = 'Amounts stay the same; only the ' + what +
    ' values change. Entries from unsaved foods, unsaved recipes and quick adds are never affected.';
  $('apply-today').textContent = 'Today’s entries (' + counts.today + ')';
  $('apply-today').hidden = counts.today === 0 || counts.today === counts.all;
  $('apply-all').textContent = counts.all === 1 ? 'The 1 logged entry' : 'All ' + counts.all + ' logged entries';
  $('apply-dialog').showModal();
  $('apply-none').focus();
}

function applyChoice(scope) {
  $('apply-dialog').close();
  const item = applyItem;
  if (scope === 'none') {
    toast('Saved ' + item.name + '. Logged entries unchanged.');
    return;
  }
  const n = scope === 'today' ? applyCounts.today : applyCounts.all;
  const previous = app.state.entries;
  app.state.entries = Calc.applyToEntries(previous, item, scope, app.todayKey);
  save();
  render();
  toast('Saved ' + item.name + ' and updated ' + plural(n, 'entry', 'entries') + '.', () => {
    app.state.entries = previous;
    save();
    render();
  });
}

export function init() {
  $('apply-none').addEventListener('click', () => applyChoice('none'));
  $('apply-today').addEventListener('click', () => applyChoice('today'));
  $('apply-all').addEventListener('click', () => applyChoice('all'));
  $('apply-dialog').addEventListener('cancel', (e) => { e.preventDefault(); applyChoice('none'); });
  $('apply-form').addEventListener('submit', (e) => e.preventDefault());
}
