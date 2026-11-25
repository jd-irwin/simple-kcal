// Copy entries from another day onto the day being viewed, for a repeated breakfast or lunch.

import Calc from '../calc/index.js';
import { app, commit, newId } from './store.js';
import { toast } from './messages.js';
import { macroLine, entryName, plural } from './text.js';
import { $, el, openDialog } from './dom.js';

let sourceDate = null;

// 'today', 'yesterday', 'tomorrow' or 'Thu 12/11/2026', for the day entries are copied to.
function targetName() {
  const title = Calc.dayTitle(app.selectedDate, app.todayKey);
  return Calc.isNamedDay(app.selectedDate, app.todayKey) ? title.toLowerCase() : title;
}

// Opens on the most recent earlier day that has entries, or the day before if there is none.
export function openCopy() {
  sourceDate = Calc.previousLoggedDay(app.state.entries, app.selectedDate) || Calc.addDays(app.selectedDate, -1);
  renderCopy();
  openDialog($('copy-dialog'), $('copy-submit'));
}

function sourceEntries() {
  return Calc.entriesForDate(app.state.entries, sourceDate);
}

function renderCopy() {
  const entries = sourceEntries();
  $('copy-day').textContent = Calc.dayTitle(sourceDate, app.todayKey);
  $('copy-day-total').textContent = entries.length ? Calc.fmtKcal(Calc.sumEntries(entries).kcal) + ' kcal' : '';

  const list = $('copy-list');
  list.replaceChildren();
  entries.forEach((entry) => {
    const totals = Calc.entryTotals(entry);
    const box = el('input');
    box.type = 'checkbox';
    box.checked = true;
    box.value = entry.id;
    const main = el('span', 'row-main');
    main.append(el('span', 'row-title', entryName(entry)),
      el('span', 'row-sub', [Calc.formatEntryAmount(entry), macroLine(totals)].filter(Boolean).join(' · ')));
    const label = el('label', 'row');
    label.append(box, main, el('span', 'row-kcal', Calc.fmtKcal(totals.kcal) + ' kcal'));
    const li = el('li');
    li.append(label);
    list.append(li);
  });

  $('copy-empty').textContent = 'Nothing logged on ' + Calc.weekdayDate(sourceDate) + '. Use the arrows to choose another day.';
  $('copy-empty').hidden = entries.length > 0;
  updateCopyButton();
}

function checkedIds() {
  return [...$('copy-list').querySelectorAll('input:checked')].map((box) => box.value);
}

function updateCopyButton() {
  const n = checkedIds().length;
  $('copy-submit').textContent = n ? 'Copy ' + n + ' to ' + targetName() : 'Copy';
  $('copy-submit').disabled = n === 0;
}

function moveSource(days) {
  sourceDate = Calc.addDays(sourceDate, days);
  renderCopy();
}

// The saved food or recipe an entry was logged from, if it is still in the Library.
function linkedItem(entry) {
  if (!entry.sourceId) return null;
  const items = entry.source === 'recipe' ? app.state.recipes : entry.source === 'food' ? app.state.foods : [];
  return items.find((item) => item.id === entry.sourceId) || null;
}

function submitCopy(e) {
  e.preventDefault();
  const ids = new Set(checkedIds());
  const chosen = sourceEntries().filter((entry) => ids.has(entry.id));
  if (chosen.length === 0) return;
  const now = Date.now();
  const copies = Calc.copyEntries(chosen, app.selectedDate, chosen.map(() => newId()), now);
  app.state.entries.push(...copies);
  // Copying counts as using the food or recipe, so it moves up the recents list.
  copies.forEach((copy) => {
    const item = linkedItem(copy);
    if (item) item.lastUsed = now;
  });
  commit();
  $('copy-dialog').close();
  const copied = new Set(copies.map((copy) => copy.id));
  toast('Copied ' + plural(copies.length, 'entry', 'entries') + ' to ' + targetName() + '.', () => {
    app.state.entries = app.state.entries.filter((entry) => !copied.has(entry.id));
    commit();
  });
}

export function init() {
  $('copy-form').addEventListener('submit', submitCopy);
  $('copy-list').addEventListener('change', updateCopyButton);
  $('copy-prev').addEventListener('click', () => moveSource(-1));
  $('copy-next').addEventListener('click', () => moveSource(1));
}
