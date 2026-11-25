# simple-kcal: project spec

A personal calorie and macro tracker that runs as a home-screen web app on one phone. Hosted as static files on GitHub Pages. All data stays on the device.

The owner is the only user. They open it several times a day, often in a kitchen, so it must be fast, offline-capable and usable one-handed.

## Working rules for Claude Code

- Start every task in plan mode: read this file, propose the approach, wait for approval.
- Build one stage at a time (see Build order). Commit after each stage with a short message. Do not start the next stage without being asked.
- No frameworks, no build step, no npm dependencies, no external network requests of any kind (no CDNs, fonts, analytics, APIs). Plain HTML, CSS and JavaScript.
- Keep calculation logic in pure functions in `calc/`, tested by a small dependency-free test script runnable with `node`. UI code calls these functions and does no arithmetic of its own.
- Use UK English in all UI text. Energy in kcal, weight in grams, dates displayed DD/MM/YYYY.
- Keep it simple. If a feature is not listed here, ask before adding it.
- A prototype `index.html` (single-file batch calculator) may exist in the repo. It is a reference only and will be replaced.

## Requirements

Primary: calorie and macro tracking.

1. See total calories for a given day, with a breakdown of protein, carbs and fat.
2. Add a food item with a name, calories, and optional macros.
3. Reuse previously added foods so adding them again takes a few taps.
4. Create a recipe or batch (many ingredients combined), divide it into portions, and add a portion to the tracker.
5. Reuse recipes.
6. Edit and delete foods and recipes, and edit and delete log entries.
7. Data stays on the phone.
8. No food database or API. Search only ever covers the user's own foods and recipes, so the list never fills with clutter.
9. Saving a food is optional, and defaults to on. When adding a food, a "Save to my foods" checkbox is shown, checked by default. Unchecking it means the entry goes to today's log only. There is no later prompt to save an unsaved food.
10. Quick add: log calories and optional macros with no food or recipe behind them. Calories required, name optional (shown as "Quick add" if blank), macros optional.
11. Copy entries from another day onto the day being viewed. The sheet opens on the most recent earlier day with entries, all ticked; arrows choose another day. Copies are snapshots like any entry: same quantity, unit, per-unit values and `sourceId`, with a new id, date and `created`. Copying updates the linked food's or recipe's `lastUsed`. Undo is offered.
12. Optional daily calorie target, set in Settings (blank means none, and the app looks as it did without one). Today shows a progress bar under the total: "Target 2000 kcal · 550 left", or full and amber with "150 over". Left and over are worked out from the rounded total, so the shown numbers add up.
13. History shows daily averages for the month on screen and for the last 7 days (the 7 days before today): average kcal per logged day and the number of logged days. Only days with at least one entry count (a day logged at 0 kcal counts), and today never counts because it is not finished. With a target set, each shows "N under target" or "N over target" (amber), from the rounded average.
14. Saved pans (name and empty weight), managed in Settings. In the recipe builder, "Weighed in" offers None plus each pan (shown only when pans exist). With a pan chosen, the weight field takes the scale reading and the app shows "Cooked weight N g after the P g pan"; a reading not more than the pan is an error. The recipe stores the weight without the pan, and remembers the pan as `panId` for next time.

Secondary: easy recipe creation (see Recipes).

Nice to have, built last: a calendar view showing calories per day, tap a day to see its log.

Not wanted: barcode scanning, accounts, sync across devices, social features, a food database lookup.

## Data model

Three collections, pans, a daily target, plus settings. All ids are short random strings. Current `schemaVersion` is 4.

**Pan** (schema 4)
- `id`, `name`, `weight` (grams, empty; more than 0). Part of backups. Deleting a pan changes nothing else: a recipe whose `panId` no longer matches just has no pan pre-selected.

**Target**
- `targetKcal`: top-level number (at least 1), or `null` for no target. Added in schema 3. Unlike `settings` (which stay on the device), it is part of backups.

**Food**
- `id`, `name`
- `unit`: `"100g"` or `"item"` (what the numbers are per)
- `kcal` (required), `protein`, `carbs`, `fat` (each optional, `null` if unknown)
- `lastUsed` (timestamp, drives the recents list)

**Recipe**
- `id`, `name`
- `ingredients`: list of `{ name, unit, amount, kcal, protein, carbs, fat }`, where `unit` is `"100g"` or `"item"` as for a food and `amount` is grams or number of items. Per-item ingredients need no weight. Ingredients are copies, not links, so editing a saved food does not silently change recipes. An ingredient can be picked from saved foods (which copies its values) or typed in ad hoc.
- `cookedWeight` (grams, the weight of the finished batch, without the pan)
- `panId` (optional): the pan the batch was last weighed in. Editing a recipe without choosing a pan keeps it.
- `portions` (number of portions the batch is divided into)
- `lastUsed`
- Derived, never stored: per-gram values (total / cookedWeight) and per-portion values (total / portions).

**Log entry**
- `id`, `date` (local calendar date, `YYYY-MM-DD`), `created` (timestamp)
- `name` (copied from the food or recipe; optional for quick add)
- `source`: `"food"`, `"recipe"` or `"quick"`, with optional `sourceId` (the link to the saved food or recipe; absent for unsaved foods and quick add)
- `quantity` (number) and `unit`: `"g"`, `"item"`, `"portion"` or `"quick"`
- `perAmount`: how many units the nutrition values below refer to (100 for `"g"`, 1 for everything else)
- `kcal` (required), `protein`, `carbs`, `fat` (optional): the nutrition for `perAmount` units, copied from the source at the time of logging
- An entry's totals are always calculated as `value x quantity / perAmount`. Totals are never stored.
- Quick add uses `unit: "quick"`, `quantity: 1`, `perAmount: 1`, so its nutrition values are the totals. This keeps the calculation identical for every entry type.
- Entries are snapshots. Each carries its own per-unit nutrition, so history stays fixed and deleting a food or recipe never breaks an entry. Saved foods, unsaved foods and recipes all behave the same way in the log; only quick add differs, because there is nothing to scale.

**Rules**
- Dates are local calendar dates, never UTC. A meal logged at 23:30 BST belongs to that day.
- Macros are optional. Daily totals sum only what is known, and the UI shows when macros are partial (for example "protein from 4 of 6 entries"). A missing value must never be shown as zero.
- A recipe can be added to the log by portions (fractions allowed, e.g. 1.5) or by grams of the cooked batch.
- Saving a recipe is optional, the same as foods: building a batch and adding a portion to the log without saving must work.
- Round for display only. Store full precision.

**Editing behaviour**
- Editing an entry's amount changes `quantity` and recalculates from the entry's own per-unit values. It never looks anything up, so it works the same whether or not the food is saved. The unit is fixed when the entry is logged; to change it, delete and re-add.
- The entry edit screen shows "Amount" for food and recipe entries, and the kcal and macro numbers directly for quick add entries.
- The entry edit screen has an "Edit nutrition" option that changes the entry's per-unit values, for when the wrong calories were entered at logging. It is collapsed by default.
- Editing a saved food or recipe in the Library asks, per edit: "Apply to today's entries / all N logged entries / none?". The choice is made each time, with "none" as the default. N counts entries whose `sourceId` matches. Applying copies the new per-unit values onto those entries and leaves their quantities alone. Unsaved foods and quick add have no link, so they are never affected.
- Deleting a saved food or recipe never changes any entry. The entry keeps its values and loses nothing but the link.
- There is no "update to current library values" button on entries. Do not add one.

## Storage and backup

- Local only: `localStorage` under one versioned key, or IndexedDB if there is a clear reason. Include a `schemaVersion` and a migration function from the start.
- Call `navigator.storage.persist()` on first run.
- Settings screen has Export (downloads a JSON file) and Import (replaces all data after a confirmation that shows counts of foods, recipes and entries). Show a "last backed up" date and a gentle banner if it has been more than 7 days.
- No server, no accounts, no keys, no telemetry. Exported data must never be committed to the repo (add `*.json` backups to `.gitignore`).
- Note for testing: on iOS the installed home-screen app can have separate storage from the same URL in Safari. Do all real data entry in the installed app only.

## App structure and UX

Files: `index.html`, `style.css`, `app.js`, `version.js`, `calc/`, `ui/`, `manifest.json`, `sw.js`, `icons/`. Use relative paths throughout, because GitHub Pages serves from `/<repo-name>/`.

The JavaScript is ES modules (`<script type="module">`), so the app must be served over HTTP, not opened as a file. `package.json` exists only to tell Node the files are modules; it has no dependencies and must not gain any.

- `app.js`: entry point. Loads data, calls each module's `init()`, draws the app, registers the service worker.
- `version.js`: `APP_VERSION`, shown in Settings.
- `calc/`: pure calculation, no DOM or storage. `calc/index.js` gathers everything into one `Calc` object, which the UI and tests import. `values.js` (shared helpers), `dates.js`, `entries.js`, `recipes.js`, `totals.js`, `format.js`, `search.js`, `data.js` (schema, migration, backup).
- `ui/`: one module per screen (`today`, `add`, `library`, `history`, `settings`) and per dialog (`amount`, `food`, `apply`, `recipe`, `ingredient`, `entry` with quick add), plus shared modules:
  - `store.js` holds the data and session state in the `app` object. After changing `app.state`, call `commit()`: it saves and redraws. Do not call save and render separately.
  - `nav.js` handles tabs, the selected day and `render()`. Screens register their render function with `registerScreen`, so no module needs to import every screen.
  - `dom.js`, `text.js`, `messages.js`, `log.js` hold shared helpers, display text, toasts and the logging flow.
- Avoid import cycles between UI modules. When a dialog needs to update its caller, pass a callback (as `ingredient.js` does) instead of importing the caller.

Releasing: bump `APP_VERSION` in `version.js` and `VERSION` in `sw.js` together. Every app file must be listed in `FILES` in `sw.js`. `node test.js` checks both.

Screens, bottom tab bar:
1. **Today (home).** Date selector (previous/next day), total kcal, macro breakdown, progress bar when a target is set, list of entries with edit and delete. "Copy from another day" button. Prominent Add button.
2. **Add.** One screen with: search box over saved foods and recipes only; recents at the top; "New food" form (Save to my foods checkbox, checked by default); "Quick add" form; "New recipe" entry point. Choosing a food asks for an amount, then logs it.
3. **Library.** Foods and recipes, searchable, with edit and delete (confirm or offer undo). Saving an edit to a food or recipe shows the "apply to entries" prompt described under Editing behaviour.
4. **History.** Calendar of kcal per day (tap a day to open it on Today), with daily averages below.
5. **Settings.** Daily target, pans, export, import, last backup, app version.

Design principles:
- Adding a repeat food should take no more than three taps.
- Large tap targets. Inputs at 16px or larger so iOS does not zoom. Numeric keyboard for number fields (`inputmode="decimal"`).
- Light and dark mode via `prefers-color-scheme`. Respect safe-area insets. Works at 360px wide and up.
- Error and empty states say what to do next.
- Show the app version number in Settings so it is clear which cached build is running.

## Offline and install

- `manifest.json` with name, short name, `display: standalone`, theme colour, 192px and 512px icons, and an Apple touch icon (180px PNG).
- `sw.js` precaches all app files and serves them cache-first, using a versioned cache name. Bumping the version must replace the old cache and let the new build load on the next open.
- The app must be fully usable with no connection after the first load.

## Build order

1. Data layer: storage, schema version, export and import, calculation functions with tests.
2. Foods and daily log together: add food (with the save checkbox), quick add, log screen with totals and partial-macro handling, edit and delete entries, recents, search of saved foods.
3. Stop here and test on the real phone via GitHub Pages for a day before continuing.
4. Recipes: build (saved foods or ad hoc ingredients), cooked weight, portions, add by portion or grams, save and reuse, edit and delete.
5. Offline: service worker, manifest, icons, versioned caching.
6. Calendar history.

## Testing

- `node test.js` runs the calculation tests in `tests/*.test.js` (one file per `calc/` area): recipe per-portion and per-gram maths, partial-macro totals, local-date handling around midnight and the BST change, fractional portions, entry totals from quantity and per-unit values (including `perAmount` 100 for grams), changing an entry's quantity, quick add entries, and applying an edited food's values to linked entries only. It also checks the repository: the version numbers match, `sw.js` precaches exactly the app files, and every `ui/` module loads with its imports resolved.
- `node tests/smoke.js` runs the manual checklist below automatically, in headless Chrome against the real app (`tests/smoke.html`). It needs Chrome or Chromium installed (set `CHROME_PATH` if it is not found). It only clicks, types and reads the page, never calls app internals, so it stays valid through refactors. Run it and `node test.js` before every commit.
- Manual checklist after each stage: add a food saved and unsaved, quick add with no name, edit and delete an entry, check totals, export then import on a cleared browser, reload offline.
- Check numbers against a calculator for the first few real entries.

## Decisions already made

- Save to my foods defaults to on.
- Log entries and recipe ingredients store copies of values (snapshots), so history stays fixed. Entries keep an optional `sourceId` link, used only to find entries when a saved food or recipe is edited. Values are never looked up live.
- Entries are quantity, unit and per-unit values; totals are calculated, never stored.
- Editing a saved food or recipe prompts per edit: apply to today's entries, all linked entries, or none (default).
- No "save the day" journal and no live-lookup mode.
- Daily calorie target: optional, added after the original build (it was first ruled out). Shown on Today and in History averages only, never as a per-day colour on the calendar, because changing the target would re-judge past days.
- Calendar history is built last.
- No food API, no external dependencies.
