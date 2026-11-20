# Batch kcal: project spec

A personal calorie and macro tracker that runs as a home-screen web app on one phone. Hosted as static files on GitHub Pages. All data stays on the device.

The owner is the only user. They open it several times a day, often in a kitchen, so it must be fast, offline-capable and usable one-handed.

## Working rules for Claude Code

- Start every task in plan mode: read this file, propose the approach, wait for approval.
- Build one stage at a time (see Build order). Commit after each stage with a short message. Do not start the next stage without being asked.
- No frameworks, no build step, no npm dependencies, no external network requests of any kind (no CDNs, fonts, analytics, APIs). Plain HTML, CSS and JavaScript.
- Keep calculation logic in pure functions in their own file (`calc.js`) with a small dependency-free test script runnable with `node`. UI code calls these functions and does no arithmetic of its own.
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

Secondary: easy recipe creation (see Recipes).

Nice to have, built last: a calendar view showing calories per day, tap a day to see its log.

Not wanted: daily calorie target, barcode scanning, accounts, sync across devices, social features, a food database lookup.

## Data model

Three collections, plus settings. All ids are short random strings.

**Food**
- `id`, `name`
- `unit`: `"100g"` or `"item"` (what the numbers are per)
- `kcal` (required), `protein`, `carbs`, `fat` (each optional, `null` if unknown)
- `lastUsed` (timestamp, drives the recents list)

**Recipe**
- `id`, `name`
- `ingredients`: list of `{ name, grams, kcalPer100g, protein, carbs, fat }`. Ingredients are copies, not links, so editing a saved food does not silently change recipes. An ingredient can be picked from saved foods (which copies its values) or typed in ad hoc.
- `cookedWeight` (grams, the weight of the finished batch)
- `portions` (number of portions the batch is divided into)
- `lastUsed`
- Derived, never stored: per-gram values (total / cookedWeight) and per-portion values (total / portions).

**Log entry**
- `id`, `date` (local calendar date, `YYYY-MM-DD`), `created` (timestamp)
- `name` (optional), `kcal` (required), `protein`, `carbs`, `fat` (optional)
- `source`: `"food"`, `"recipe"` or `"quick"`, with optional `sourceId`
- `amount` (text such as "150 g" or "1.5 portions", for display)
- Entries store their own copy of the numbers. Editing or deleting a food or recipe never changes past days. Entries are edited individually.

**Rules**
- Dates are local calendar dates, never UTC. A meal logged at 23:30 BST belongs to that day.
- Macros are optional. Daily totals sum only what is known, and the UI shows when macros are partial (for example "protein from 4 of 6 entries"). A missing value must never be shown as zero.
- A recipe can be added to the log by portions (fractions allowed, e.g. 1.5) or by grams of the cooked batch.
- Saving a recipe is optional, the same as foods: building a batch and adding a portion to the log without saving must work.
- Round for display only. Store full precision.

## Storage and backup

- Local only: `localStorage` under one versioned key, or IndexedDB if there is a clear reason. Include a `schemaVersion` and a migration function from the start.
- Call `navigator.storage.persist()` on first run.
- Settings screen has Export (downloads a JSON file) and Import (replaces all data after a confirmation that shows counts of foods, recipes and entries). Show a "last backed up" date and a gentle banner if it has been more than 7 days.
- No server, no accounts, no keys, no telemetry. Exported data must never be committed to the repo (add `*.json` backups to `.gitignore`).
- Note for testing: on iOS the installed home-screen app can have separate storage from the same URL in Safari. Do all real data entry in the installed app only.

## App structure and UX

Files: `index.html`, `style.css`, `app.js`, `calc.js`, `manifest.json`, `sw.js`, icons. Use relative paths throughout, because GitHub Pages serves from `/<repo-name>/`.

Screens, bottom tab bar:
1. **Today (home).** Date selector (previous/next day), total kcal, macro breakdown, list of entries with edit and delete. Prominent Add button.
2. **Add.** One screen with: search box over saved foods and recipes only; recents at the top; "New food" form (Save to my foods checkbox, checked by default); "Quick add" form; "New recipe" entry point. Choosing a food asks for an amount, then logs it.
3. **Library.** Foods and recipes, searchable, with edit and delete (confirm or offer undo).
4. **History.** Calendar view (last build stage).
5. **Settings.** Export, import, last backup, app version.

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

- `node test.js` runs the calculation tests: recipe per-portion and per-gram maths, partial-macro totals, local-date handling around midnight and the BST change, fractional portions.
- Manual checklist after each stage: add a food saved and unsaved, quick add with no name, edit and delete an entry, check totals, export then import on a cleared browser, reload offline.
- Check numbers against a calculator for the first few real entries.

## Decisions already made

- Save to my foods defaults to on.
- Log entries and recipe ingredients store copies of values and are not linked to the food they came from.
- No daily calorie target.
- Calendar history is built last.
- No food API, no external dependencies.
