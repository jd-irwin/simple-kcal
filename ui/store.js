// Stored data and session state, loading and saving.

import Calc from '../calc/index.js';
import { showLoadError, toast } from './messages.js';
import { plural } from './text.js';

// Kept from the app's earlier name: renaming it would orphan data already on the phone.
const STORAGE_KEY = 'batchKcal.v1';

// Shared session state. Modules read and assign these fields; ES module imports cannot be reassigned.
export const app = {
  // All stored data: foods, recipes, entries and settings.
  state: Calc.emptyData(),
  // True when stored data exists but could not be read. Saving is blocked so it is never overwritten.
  readOnly: false,
  // Shown once after loading if unreadable records were dropped.
  startupNotice: '',
  todayKey: Calc.dateKey(new Date()),
  // The day shown on Today and logged to from Add.
  selectedDate: null,
};
app.selectedDate = app.todayKey;

export function load() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    showLoadError('This browser is blocking storage, so nothing can be saved. Check that private browsing is off.');
    app.readOnly = true;
    return;
  }
  if (raw === null) {
    app.state = Calc.emptyData();
    return;
  }
  try {
    app.state = Calc.migrate(JSON.parse(raw));
    if (app.state.skipped > 0) {
      app.startupNotice = plural(app.state.skipped, 'saved record', 'saved records') +
        ' could not be read and ' + (app.state.skipped === 1 ? 'was' : 'were') + ' left out.';
    }
  } catch (e) {
    app.readOnly = true;
    showLoadError('Your saved data could not be read (' + e.message + '). Nothing has been changed. Import a backup in Settings to restore it.');
  }
}

export function save() {
  if (app.readOnly) {
    toast('Not saved: your stored data could not be read. Import a backup in Settings first.');
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(app.state));
    return true;
  } catch (e) {
    toast('Could not save: storage for the app is full. Export a backup, then free some space.');
    return false;
  }
}

// 8 random base-36 characters.
export function newId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

export function requestPersistence() {
  if (app.readOnly || app.state.settings.persistRequested) return;
  app.state.settings.persistRequested = true;
  save();
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}
