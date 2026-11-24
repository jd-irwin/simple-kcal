// Settings screen: backup export and import, and the app version.

import Calc from '../calc/index.js';
import { app, commit } from './store.js';
import { registerScreen } from './nav.js';
import { showMessage, clearMessage } from './messages.js';
import { plural, countsText } from './text.js';
import { $ } from './dom.js';
import { APP_VERSION } from '../version.js';

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function exportData() {
  clearMessage();
  const now = new Date();
  const json = JSON.stringify(Calc.buildExport(app.state, now.toISOString()), null, 2);
  const filename = 'simple-kcal-backup-' + Calc.dateKey(now) + '.json';
  const file = new File([json], filename, { type: 'application/json' });

  const touch = window.matchMedia('(pointer: coarse)').matches;
  let done = false;
  if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      done = true;
    } catch (e) {
      if (e.name === 'AbortError') return; // user closed the share sheet
    }
  }
  if (!done) downloadFile(file);

  app.state.settings.lastBackup = now.toISOString();
  commit();
  showMessage('Backup exported as ' + filename + '.');
}

async function importFile(file) {
  clearMessage();
  let result;
  try {
    result = Calc.parseImport(await file.text());
  } catch (e) {
    showMessage(e.message, true);
    return;
  }
  const current = countsText(Calc.countData(app.state));
  const skippedText = result.skipped > 0
    ? '\n\n' + plural(result.skipped, 'record in the file could not be read and will be', 'records in the file could not be read and will be') + ' left out.'
    : '';
  const ok = window.confirm(
    'Replace all data with ' + countsText(result.counts) + '?\n\n' +
    'Your current ' + current + ' will be deleted.' + skippedText
  );
  if (!ok) return;

  result.data.settings = Object.assign({}, app.state.settings, {
    lastBackup: result.exportedAt,
    persistRequested: true,
  });
  app.state = result.data;
  app.readOnly = false;
  $('load-error').hidden = true;
  if (commit()) showMessage('Imported ' + countsText(result.counts) + '.');
}

function renderSettings() {
  const last = app.state.settings.lastBackup;
  $('last-backup').textContent = last ? Calc.formatDate(Calc.dateKey(new Date(last))) : 'Never';
  $('data-counts').textContent = 'On this phone: ' + countsText(Calc.countData(app.state)) + '.';
  $('app-version').textContent = APP_VERSION;
}

export function init() {
  registerScreen('settings', renderSettings);
  $('export-btn').addEventListener('click', () => {
    exportData().catch((e) => showMessage('Export failed: ' + e.message, true));
  });
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importFile(file);
  });
}
