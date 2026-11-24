// Adding an entry to the selected day, shared by every way of logging.

import Calc from '../calc/index.js';
import { app, commit, newId } from './store.js';
import { showScreen } from './nav.js';
import { toast } from './messages.js';
import { entryName } from './text.js';
import { $ } from './dom.js';

// fields come from Calc.entryFromFood, Calc.entryFromRecipe or Calc.entryFromQuick.
export function addEntry(fields) {
  const entry = Object.assign({ id: newId(), date: app.selectedDate, created: Date.now() }, fields);
  app.state.entries.push(entry);
  return entry;
}

export function afterLog(entry) {
  $('food-search').value = '';
  showScreen('today');
  commit();
  const amount = Calc.formatEntryAmount(entry);
  toast('Logged ' + entryName(entry) + (amount ? ' (' + amount + ')' : '') + '.', () => {
    app.state.entries = app.state.entries.filter((e) => e.id !== entry.id);
    commit();
  });
}
