(function () {
  'use strict';

  const APP_VERSION = '0.6.0'; // must match VERSION in sw.js (checked by test.js)
  // Kept from the app's earlier name: renaming it would orphan data already on the phone.
  const STORAGE_KEY = 'batchKcal.v1';
  const BANNER_SCREENS = ['today', 'settings'];
  const RECENTS_LIMIT = 20;
  const TOAST_MS = 5000;
  const MACROS = ['protein', 'carbs', 'fat'];
  const MACRO_NAMES = { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };

  let state = Calc.emptyData();
  // True when stored data exists but could not be read. Saving is blocked so it is never overwritten.
  let readOnly = false;
  // Shown once after loading if unreadable records were dropped.
  let startupNotice = '';
  let currentScreen = 'today';
  let todayKey = Calc.dateKey(new Date());
  let selectedDate = todayKey;

  const $ = (id) => document.getElementById(id);

  // ---------- Storage ----------

  function load() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      showLoadError('This browser is blocking storage, so nothing can be saved. Check that private browsing is off.');
      readOnly = true;
      return;
    }
    if (raw === null) {
      state = Calc.emptyData();
      return;
    }
    try {
      state = Calc.migrate(JSON.parse(raw));
      if (state.skipped > 0) {
        startupNotice = plural(state.skipped, 'saved record', 'saved records') +
          ' could not be read and ' + (state.skipped === 1 ? 'was' : 'were') + ' left out.';
      }
    } catch (e) {
      readOnly = true;
      showLoadError('Your saved data could not be read (' + e.message + '). Nothing has been changed. Import a backup in Settings to restore it.');
    }
  }

  function save() {
    if (readOnly) {
      toast('Not saved: your stored data could not be read. Import a backup in Settings first.');
      return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      toast('Could not save: storage for the app is full. Export a backup, then free some space.');
      return false;
    }
  }

  // 8 random base-36 characters.
  function newId() {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
  }

  function requestPersistence() {
    if (readOnly || state.settings.persistRequested) return;
    state.settings.persistRequested = true;
    save();
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  }

  // ---------- Small DOM helpers ----------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function macroLine(v) {
    return 'P ' + Calc.fmtMacro(v.protein) + ' · C ' + Calc.fmtMacro(v.carbs) + ' · F ' + Calc.fmtMacro(v.fat);
  }

  function valuesSummary(v) {
    return Calc.fmtKcal(v.kcal) + ' kcal · ' + macroLine(v);
  }

  function unitText(unit) {
    return unit === '100g' ? 'per 100 g' : 'per item';
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function countsText(c) {
    return plural(c.foods, 'food', 'foods') + ', ' +
      plural(c.recipes, 'recipe', 'recipes') + ' and ' +
      plural(c.entries, 'log entry', 'log entries');
  }

  // ---------- Messages and toast ----------

  function showLoadError(text) {
    const node = $('load-error');
    node.textContent = text;
    node.hidden = false;
  }

  function showMessage(text, isError) {
    const node = $('settings-message');
    node.textContent = text;
    node.classList.toggle('error', !!isError);
    node.hidden = false;
  }

  function clearMessage() {
    $('settings-message').hidden = true;
  }

  let toastTimer = null;
  let toastUndo = null;

  function toast(text, undo) {
    clearTimeout(toastTimer);
    $('toast-text').textContent = text;
    toastUndo = undo || null;
    $('toast-undo').hidden = !undo;
    $('toast').hidden = false;
    toastTimer = setTimeout(hideToast, TOAST_MS);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    $('toast').hidden = true;
    toastUndo = null;
  }

  // ---------- Dialog helpers ----------

  function formError(form, text) {
    const node = form.querySelector('.message.error');
    node.textContent = text || '';
    node.hidden = !text;
    return false;
  }

  function openDialog(dialog, focusEl) {
    formError(dialog.querySelector('form'), '');
    dialog.showModal();
    if (focusEl) focusEl.focus();
  }

  // Reads a required number field. Returns the number, or undefined after showing an error.
  function readRequired(form, input, what, allowZero) {
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
  function readMacros(form, prefix) {
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

  function numToField(n) {
    return n === null || n === undefined ? '' : String(n);
  }

  // ---------- Log entries ----------

  // fields come from Calc.entryFromFood / Calc.entryFromQuick.
  function addEntry(fields) {
    const entry = Object.assign({ id: newId(), date: selectedDate, created: Date.now() }, fields);
    state.entries.push(entry);
    return entry;
  }

  function qtyLabel(unit) {
    if (unit === 'g') return 'Amount (g)';
    if (unit === 'portion') return 'Number of portions';
    return 'Number of items';
  }

  function entryName(e) {
    return e.name || 'Quick add';
  }

  function afterLog(entry) {
    save();
    $('food-search').value = '';
    showScreen('today');
    render();
    const amount = Calc.formatEntryAmount(entry);
    toast('Logged ' + entryName(entry) + (amount ? ' (' + amount + ')' : '') + '.', () => {
      state.entries = state.entries.filter((e) => e.id !== entry.id);
      save();
      render();
    });
  }

  // ---------- Radio helpers ----------

  function checkedUnit(radioName) {
    return document.querySelector('input[name="' + radioName + '"]:checked').value;
  }

  function checkRadio(radioName, value) {
    document.querySelector('input[name="' + radioName + '"][value="' + value + '"]').checked = true;
  }

  // Enables or disables the Grams option of a Portions / Grams switch, falling back to Portions.
  function setGramsAllowed(radioName, allowed) {
    const grams = document.querySelector('input[name="' + radioName + '"][value="g"]');
    grams.disabled = !allowed;
    if (!allowed && grams.checked) checkRadio(radioName, 'portion');
  }

  // ---------- Amount dialog (log a saved food or recipe) ----------

  let amountItem = null;
  let amountDefault = null;

  function recipePerText(recipe) {
    const parts = ['Per portion ' + Calc.fmtKcal(Calc.recipePerPortion(recipe).kcal) + ' kcal'];
    if (Calc.recipeCanLogGrams(recipe)) {
      parts.push('per 100 g ' + Calc.fmtKcal(Calc.recipeUnitValues(recipe, 'g').kcal) + ' kcal');
      parts.push('1 portion ≈ ' + Calc.fmtKcal(Calc.recipePortionWeight(recipe)) + ' g');
    }
    return parts.join(' · ');
  }

  function openAmount(item) {
    amountItem = item;
    const recipe = Calc.isRecipe(item);
    $('amount-title').textContent = item.name;
    $('amount-unit-field').hidden = !recipe;
    if (recipe) {
      amountDefault = Calc.defaultRecipeAmount(item, state.entries);
      setGramsAllowed('amount-unit', Calc.recipeCanLogGrams(item));
      checkRadio('amount-unit', amountDefault.unit);
      $('amount-per').textContent = recipePerText(item);
      $('amount-qty').value = Calc.fmtQty(amountDefault.quantity);
    } else {
      $('amount-per').textContent = unitText(item.unit) + ': ' + valuesSummary(item);
      $('amount-qty').value = Calc.fmtQty(Calc.defaultQty(item, state.entries));
    }
    updateAmountLabel();
    updateAmountPreview();
    openDialog($('amount-dialog'), $('amount-form').querySelector('[type=submit]'));
  }

  function amountUnit() {
    return Calc.isRecipe(amountItem) ? checkedUnit('amount-unit') : Calc.foodEntryUnit(amountItem);
  }

  function updateAmountLabel() {
    $('amount-label').textContent = qtyLabel(amountUnit());
  }

  // Switching between portions and grams: use last time's amount for that unit, else 1 portion or blank grams.
  function changeAmountUnit() {
    const unit = amountUnit();
    if (unit === amountDefault.unit) $('amount-qty').value = Calc.fmtQty(amountDefault.quantity);
    else $('amount-qty').value = unit === 'portion' ? '1' : '';
    updateAmountLabel();
    updateAmountPreview();
    $('amount-qty').focus();
  }

  function amountEntry(qty) {
    const item = amountItem;
    return Calc.isRecipe(item)
      ? Calc.entryFromRecipe(item, qty, amountUnit(), item.id)
      : Calc.entryFromFood(item, qty, item.id);
  }

  function updateAmountPreview() {
    const qty = Calc.parseNumber($('amount-qty').value);
    $('amount-preview').textContent = qty > 0 ? valuesSummary(Calc.entryTotals(amountEntry(qty))) : '';
  }

  function submitAmount(e) {
    e.preventDefault();
    const form = $('amount-form');
    const qty = readRequired(form, $('amount-qty'), amountUnit() === 'g' ? 'amount' : qtyLabel(amountUnit()).toLowerCase(), false);
    if (qty === undefined) return;
    const entry = addEntry(amountEntry(qty));
    amountItem.lastUsed = Date.now();
    $('amount-dialog').close();
    afterLog(entry);
  }

  // ---------- Shared food fields ----------

  // Reads name, unit, kcal and macros from a food or ingredient form.
  // Returns the values, or undefined after showing an error.
  function readFoodFields(form, prefix, radioName, what) {
    const name = $(prefix + '-name').value.trim();
    if (!name) { formError(form, 'Enter a name for the ' + (what || 'food') + '.'); $(prefix + '-name').focus(); return undefined; }
    const kcal = readRequired(form, $(prefix + '-kcal'), 'calories', true);
    if (kcal === undefined) return undefined;
    const macros = readMacros(form, prefix);
    if (!macros) return undefined;
    return Object.assign({ name, unit: checkedUnit(radioName), kcal }, macros);
  }

  function fillFoodFields(prefix, radioName, f) {
    $(prefix + '-name').value = f.name;
    checkRadio(radioName, f.unit);
    $(prefix + '-kcal').value = numToField(f.kcal);
    MACROS.forEach((k) => { $(prefix + '-' + k).value = numToField(f[k]); });
  }

  // ---------- New food (Add screen) ----------

  function updateFoodLabels() {
    const unit = checkedUnit('food-unit');
    $('food-kcal-label').textContent = 'Calories ' + unitText(unit) + ' (kcal)';
    $('food-qty-label').textContent = unit === '100g' ? 'Amount eaten (g)' : 'Number of items eaten';
    if ($('food-qty').dataset.touched !== '1') {
      $('food-qty').value = unit === '100g' ? '100' : '1';
    }
    updateFoodPreview();
  }

  function updateFoodPreview() {
    const kcal = Calc.parseNumber($('food-kcal').value);
    const qty = Calc.parseNumber($('food-qty').value);
    if (!(kcal >= 0) || !(qty > 0)) { $('food-preview').textContent = ''; return; }
    const vals = { unit: checkedUnit('food-unit'), kcal: kcal };
    MACROS.forEach((k) => {
      const n = Calc.parseNumber($('food-' + k).value);
      vals[k] = Number.isNaN(n) ? null : n;
    });
    $('food-preview').textContent = 'Logs ' + valuesSummary(Calc.entryTotals(Calc.entryFromFood(vals, qty)));
  }

  function openNewFood(prefillName) {
    fillFoodFields('food', 'food-unit', { name: prefillName || '', unit: '100g', kcal: null, protein: null, carbs: null, fat: null });
    $('food-save').checked = true;
    $('food-qty').dataset.touched = '';
    $('food-preview').textContent = '';
    updateFoodLabels();
    openDialog($('food-dialog'), prefillName ? $('food-kcal') : $('food-name'));
  }

  function submitNewFood(e) {
    e.preventDefault();
    const form = $('food-form');
    const values = readFoodFields(form, 'food', 'food-unit');
    if (!values) return;
    const qty = readRequired(form, $('food-qty'), values.unit === '100g' ? 'amount eaten' : 'number of items', false);
    if (qty === undefined) return;
    let food = null;
    if ($('food-save').checked) {
      food = Object.assign({ id: newId() }, values, { lastUsed: Date.now() });
      state.foods.push(food);
    }
    const entry = addEntry(Calc.entryFromFood(values, qty, food ? food.id : null));
    $('food-dialog').close();
    afterLog(entry);
  }

  // ---------- Edit saved food (Library) ----------

  let editingFood = null;

  function updateEditFoodLabels() {
    $('edit-food-kcal-label').textContent = 'Calories ' + unitText(checkedUnit('edit-food-unit')) + ' (kcal)';
  }

  function openEditFood(food) {
    editingFood = food;
    fillFoodFields('edit-food', 'edit-food-unit', food);
    updateEditFoodLabels();
    openDialog($('edit-food-dialog'), $('edit-food-form').querySelector('[data-close]'));
  }

  function submitEditFood(e) {
    e.preventDefault();
    const form = $('edit-food-form');
    const values = readFoodFields(form, 'edit-food', 'edit-food-unit');
    if (!values) return;
    const food = editingFood;
    const before = Object.assign({}, food);
    Object.assign(food, values);
    if (!save()) return;
    $('edit-food-dialog').close();
    render();

    if (!Calc.nutritionChanged(before, food)) {
      toast('Saved ' + food.name + '.');
    } else if (before.unit !== food.unit) {
      toast('Saved. Entries already logged keep their values because the unit changed.');
    } else {
      const counts = Calc.linkedEntryCounts(state.entries, food, todayKey);
      if (counts.all === 0) toast('Saved ' + food.name + '.');
      else openApply(food, counts);
    }
  }

  function deleteFood() {
    const food = editingFood;
    const index = state.foods.indexOf(food);
    state.foods.splice(index, 1);
    save();
    $('edit-food-dialog').close();
    render();
    toast('Deleted ' + food.name + '. Logged entries are unchanged.', () => {
      state.foods.splice(Math.min(index, state.foods.length), 0, food);
      save();
      render();
    });
  }

  // ---------- Apply a food edit to logged entries ----------

  let applyItem = null;
  let applyCounts = null;

  // item is a saved food or recipe that has just been edited.
  function openApply(item, counts) {
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
    const previous = state.entries;
    state.entries = Calc.applyToEntries(previous, item, scope, todayKey);
    save();
    render();
    toast('Saved ' + item.name + ' and updated ' + plural(n, 'entry', 'entries') + '.', () => {
      state.entries = previous;
      save();
      render();
    });
  }

  // ---------- Recipe builder (new from Add, edit from Library) ----------

  let recipeMode = 'new';
  let editingRecipe = null;
  // Ingredients being edited. Copies, so Cancel leaves a saved recipe untouched.
  let draftIngredients = [];

  function blankFood() {
    return { name: '', unit: '100g', kcal: null, protein: null, carbs: null, fat: null };
  }

  // Positive number or null, for the live summary while typing.
  function softNumber(input) {
    const n = Calc.parseNumber(input.value);
    return n > 0 ? n : null;
  }

  // The recipe as currently typed, for live previews. Not validated.
  function draftRecipe() {
    return {
      name: $('recipe-name').value.trim(),
      ingredients: draftIngredients,
      portions: softNumber($('recipe-portions')),
      cookedWeight: softNumber($('recipe-weight')),
    };
  }

  function ingredientAmountText(ing) {
    return Calc.formatAmount(ing.amount, ing.unit === 'item' ? 'item' : 'g');
  }

  function openNewRecipe(prefillName) {
    recipeMode = 'new';
    editingRecipe = null;
    draftIngredients = [];
    $('recipe-name').value = prefillName || '';
    $('recipe-portions').value = '';
    $('recipe-weight').value = '';
    $('recipe-save').checked = true;
    checkRadio('recipe-unit', 'portion');
    $('recipe-qty').value = '1';
    setRecipeMode();
    renderRecipe();
    openDialog($('recipe-dialog'), prefillName ? $('add-ingredient') : $('recipe-name'));
  }

  function openEditRecipe(recipe) {
    recipeMode = 'edit';
    editingRecipe = recipe;
    draftIngredients = recipe.ingredients.map((ing) => Object.assign({}, ing));
    $('recipe-name').value = recipe.name;
    $('recipe-portions').value = numToField(recipe.portions);
    $('recipe-weight').value = numToField(recipe.cookedWeight);
    setRecipeMode();
    renderRecipe();
    openDialog($('recipe-dialog'), $('recipe-form').querySelector('[data-close]'));
  }

  function setRecipeMode() {
    const edit = recipeMode === 'edit';
    $('recipe-title').textContent = edit ? 'Edit saved recipe' : 'New recipe';
    $('recipe-note').hidden = !edit;
    $('recipe-log-section').hidden = edit;
    $('recipe-delete').hidden = !edit;
    $('recipe-submit').textContent = edit ? 'Save' : 'Log';
  }

  function renderRecipe() {
    const recipe = draftRecipe();

    const list = $('ingredient-list');
    list.replaceChildren();
    draftIngredients.forEach((ing, i) => {
      const li = el('li');
      const btn = el('button', 'row');
      btn.type = 'button';
      const main = el('span', 'row-main');
      main.append(el('span', 'row-title', ing.name));
      main.append(el('span', 'row-sub', ingredientAmountText(ing) + ' · ' + macroLine(Calc.ingredientValues(ing))));
      btn.append(main, el('span', 'row-kcal', Calc.fmtKcal(Calc.ingredientValues(ing).kcal) + ' kcal'));
      btn.addEventListener('click', () => openIngredient(i));
      li.append(btn);
      list.append(li);
    });
    $('ingredient-empty').hidden = draftIngredients.length > 0;

    const summary = $('recipe-summary');
    summary.replaceChildren();
    const line = (label, text) => summary.append(el('dt', null, label), el('dd', null, text));
    line('Whole batch', valuesSummary(Calc.recipeTotals(draftIngredients)));
    line('Per portion', recipe.portions ? valuesSummary(Calc.recipePerPortion(recipe)) : 'Enter the number of portions');
    line('Per 100 g', recipe.cookedWeight ? valuesSummary(Calc.recipeUnitValues(recipe, 'g')) : 'Add the cooked weight to log by grams');
    if (Calc.recipePortionWeight(recipe) !== null) {
      line('1 portion', '≈ ' + Calc.fmtKcal(Calc.recipePortionWeight(recipe)) + ' g');
    }

    if (recipeMode === 'new') {
      setGramsAllowed('recipe-unit', Calc.recipeCanLogGrams(recipe));
      const unit = checkedUnit('recipe-unit');
      $('recipe-qty-label').textContent = unit === 'g' ? 'Amount eaten (g)' : 'Number of portions';
      const qty = Calc.parseNumber($('recipe-qty').value);
      const ready = qty > 0 && draftIngredients.length > 0 && (unit === 'g' ? recipe.cookedWeight : recipe.portions);
      $('recipe-preview').textContent = ready
        ? 'Logs ' + valuesSummary(Calc.entryTotals(Calc.entryFromRecipe(recipe, qty, unit))) : '';
      $('recipe-save-only').hidden = !$('recipe-save').checked;
    } else {
      $('recipe-save-only').hidden = true;
    }
  }

  function changeRecipeUnit() {
    $('recipe-qty').value = checkedUnit('recipe-unit') === 'portion' ? '1' : '';
    renderRecipe();
    $('recipe-qty').focus();
  }

  // Validates the recipe fields. Returns { name, ingredients, portions, cookedWeight } or undefined after an error.
  function readRecipe() {
    const form = $('recipe-form');
    const name = $('recipe-name').value.trim();
    if (!name) { formError(form, 'Enter a name for the recipe.'); $('recipe-name').focus(); return undefined; }
    if (draftIngredients.length === 0) { formError(form, 'Add at least one ingredient.'); $('add-ingredient').focus(); return undefined; }
    const portions = readRequired(form, $('recipe-portions'), 'number of portions', false);
    if (portions === undefined) return undefined;
    const weight = Calc.parseNumber($('recipe-weight').value);
    if (Number.isNaN(weight) || weight === 0) {
      formError(form, 'Enter the cooked weight in grams, for example 1200, or leave it blank.');
      $('recipe-weight').focus();
      return undefined;
    }
    return { name, ingredients: draftIngredients.slice(), portions, cookedWeight: weight };
  }

  function submitRecipe(e) {
    e.preventDefault();
    if (recipeMode === 'edit') saveEditedRecipe();
    else logNewRecipe();
  }

  function logNewRecipe() {
    const form = $('recipe-form');
    const values = readRecipe();
    if (!values) return;
    const unit = checkedUnit('recipe-unit');
    const qty = readRequired(form, $('recipe-qty'), unit === 'g' ? 'amount eaten' : 'number of portions', false);
    if (qty === undefined) return;
    let recipe = null;
    if ($('recipe-save').checked) {
      recipe = Object.assign({ id: newId() }, values, { lastUsed: Date.now() });
      state.recipes.push(recipe);
    }
    const entry = addEntry(Calc.entryFromRecipe(values, qty, unit, recipe ? recipe.id : null));
    $('recipe-dialog').close();
    afterLog(entry);
  }

  // Save a new recipe without logging it, for a batch cooked now and eaten later.
  function saveOnlyRecipe() {
    const values = readRecipe();
    if (!values) return;
    const recipe = Object.assign({ id: newId() }, values, { lastUsed: Date.now() });
    state.recipes.push(recipe);
    if (!save()) return;
    $('recipe-dialog').close();
    render();
    toast('Saved ' + recipe.name + ' to your recipes. Nothing logged.', () => {
      state.recipes = state.recipes.filter((r) => r !== recipe);
      save();
      render();
    });
  }

  function saveEditedRecipe() {
    const values = readRecipe();
    if (!values) return;
    const recipe = editingRecipe;
    const before = Object.assign({}, recipe);
    Object.assign(recipe, values);
    if (!save()) return;
    $('recipe-dialog').close();
    render();
    const counts = Calc.linkedEntryCounts(state.entries, recipe, todayKey);
    if (!Calc.recipeChanged(before, recipe) || counts.all === 0) toast('Saved ' + recipe.name + '.');
    else openApply(recipe, counts);
  }

  function deleteRecipe() {
    const recipe = editingRecipe;
    const index = state.recipes.indexOf(recipe);
    state.recipes.splice(index, 1);
    save();
    $('recipe-dialog').close();
    render();
    toast('Deleted ' + recipe.name + '. Logged entries are unchanged.', () => {
      state.recipes.splice(Math.min(index, state.recipes.length), 0, recipe);
      save();
      render();
    });
  }

  // ---------- Ingredient sheet ----------

  let ingredientIndex = -1; // -1 while adding a new ingredient

  function openIngredient(index) {
    ingredientIndex = index;
    const ing = index >= 0 ? draftIngredients[index] : null;
    $('ingredient-title').textContent = ing ? 'Edit ingredient' : 'Add ingredient';
    $('ingredient-pick').hidden = !!ing || state.foods.length === 0;
    $('ingredient-search').value = '';
    $('ingredient-copied').hidden = true;
    fillFoodFields('ing', 'ing-unit', ing || blankFood());
    $('ing-amount').value = ing ? Calc.fmtQty(ing.amount) : '';
    $('ingredient-remove').hidden = !ing;
    $('ingredient-submit').textContent = ing ? 'Save' : 'Add';
    updateIngredientLabels();
    renderIngredientPicker();
    const form = $('ingredient-form');
    openDialog($('ingredient-dialog'), ing ? $('ing-amount') : (state.foods.length ? form.querySelector('[data-close]') : $('ing-name')));
  }

  function renderIngredientPicker() {
    const query = $('ingredient-search').value.trim();
    const foods = Calc.searchRecent(state.foods, query).slice(0, RECENTS_LIMIT);
    const list = $('ingredient-results');
    list.replaceChildren();
    foods.forEach((food) => list.append(foodRow(food, () => pickIngredientFood(food), Calc.fmtKcal(food.kcal) + ' kcal')));
    const empty = $('ingredient-results-empty');
    empty.textContent = 'No saved foods match “' + query + '”. Type the ingredient in below.';
    empty.hidden = foods.length > 0;
  }

  // Copies a saved food's values into the form. The ingredient is a copy, not a link.
  function pickIngredientFood(food) {
    fillFoodFields('ing', 'ing-unit', food);
    $('ing-amount').value = food.unit === 'item' ? '1' : '';
    $('ingredient-pick').hidden = true;
    $('ingredient-copied').textContent = 'Copied from your saved food ' + food.name +
      '. Changes here affect this recipe only.';
    $('ingredient-copied').hidden = false;
    updateIngredientLabels();
    $('ing-amount').focus();
  }

  function updateIngredientLabels() {
    const unit = checkedUnit('ing-unit');
    $('ing-kcal-label').textContent = 'Calories ' + unitText(unit) + ' (kcal)';
    $('ing-amount-label').textContent = unit === 'item' ? 'Number of items used' : 'Weight used (g)';
    updateIngredientPreview();
  }

  function updateIngredientPreview() {
    const kcal = Calc.parseNumber($('ing-kcal').value);
    const amount = Calc.parseNumber($('ing-amount').value);
    if (!(kcal >= 0) || !(amount > 0)) { $('ing-preview').textContent = ''; return; }
    const vals = { name: '', unit: checkedUnit('ing-unit'), kcal: kcal };
    MACROS.forEach((k) => {
      const n = Calc.parseNumber($('ing-' + k).value);
      vals[k] = Number.isNaN(n) ? null : n;
    });
    $('ing-preview').textContent = 'Adds ' + valuesSummary(Calc.ingredientValues(Calc.ingredientFromFood(vals, amount)));
  }

  function submitIngredient(e) {
    e.preventDefault();
    const form = $('ingredient-form');
    const values = readFoodFields(form, 'ing', 'ing-unit', 'ingredient');
    if (!values) return;
    const amount = readRequired(form, $('ing-amount'), values.unit === 'item' ? 'number of items used' : 'weight used', false);
    if (amount === undefined) return;
    const ing = Calc.ingredientFromFood(values, amount);
    if (ingredientIndex >= 0) draftIngredients[ingredientIndex] = ing;
    else draftIngredients.push(ing);
    $('ingredient-dialog').close();
    renderRecipe();
  }

  function removeIngredient() {
    draftIngredients.splice(ingredientIndex, 1);
    $('ingredient-dialog').close();
    renderRecipe();
  }

  // ---------- Quick add ----------

  function openQuick() {
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

  // ---------- Edit log entry ----------

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
      const food = entry.sourceId ? state.foods.find((f) => f.id === entry.sourceId) : null;
      if (!entry.sourceId) src = 'Not saved to your foods';
      else if (food) src = 'From your saved food ' + food.name;
      else src = 'From a food no longer in your Library';
    } else if (entry.source === 'recipe') {
      const recipe = entry.sourceId ? state.recipes.find((r) => r.id === entry.sourceId) : null;
      if (!entry.sourceId) src = 'Recipe not saved';
      else if (recipe) src = 'From your saved recipe ' + recipe.name;
      else src = 'From a recipe no longer in your Library';
    }
    return Calc.weekdayDate(entry.date) + (src ? ' · ' + src : '');
  }

  function openEntry(entry) {
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
    const i = state.entries.indexOf(editingEntry);
    state.entries[i] = updated;
    save();
    $('entry-dialog').close();
    render();
    toast(date === selectedDate ? 'Entry saved.' : 'Entry moved to ' + Calc.formatDate(date) + '.');
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
    state.entries = state.entries.filter((x) => x !== entry);
    save();
    $('entry-dialog').close();
    render();
    toast('Deleted ' + entryName(entry) + '.', () => {
      state.entries.push(entry);
      save();
      render();
    });
  }

  // ---------- Export and import ----------

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
    const json = JSON.stringify(Calc.buildExport(state, now.toISOString()), null, 2);
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

    state.settings.lastBackup = now.toISOString();
    save();
    render();
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
    const current = countsText(Calc.countData(state));
    const skippedText = result.skipped > 0
      ? '\n\n' + plural(result.skipped, 'record in the file could not be read and will be', 'records in the file could not be read and will be') + ' left out.'
      : '';
    const ok = window.confirm(
      'Replace all data with ' + countsText(result.counts) + '?\n\n' +
      'Your current ' + current + ' will be deleted.' + skippedText
    );
    if (!ok) return;

    result.data.settings = Object.assign({}, state.settings, {
      lastBackup: result.exportedAt,
      persistRequested: true,
    });
    state = result.data;
    readOnly = false;
    $('load-error').hidden = true;
    if (save()) {
      render();
      showMessage('Imported ' + countsText(result.counts) + '.');
    }
  }

  // ---------- Rendering ----------

  function hasData() {
    const c = Calc.countData(state);
    return c.foods + c.recipes + c.entries > 0;
  }

  function renderBanner() {
    const stale = hasData() && Calc.isBackupStale(state.settings.lastBackup, Date.now());
    $('backup-banner').hidden = !(stale && BANNER_SCREENS.includes(currentScreen));
  }

  function renderToday() {
    $('day-title').textContent = Calc.dayTitle(selectedDate, todayKey);
    const isNamedDay = ['Today', 'Yesterday', 'Tomorrow'].includes(Calc.dayTitle(selectedDate, todayKey));
    $('day-subtitle').textContent = isNamedDay ? Calc.weekdayDate(selectedDate) : '';

    const entries = Calc.entriesForDate(state.entries, selectedDate);
    const totals = Calc.sumEntries(entries);
    $('total-kcal').textContent = Calc.fmtKcal(totals.kcal);

    const notes = [];
    MACROS.forEach((k) => {
      const t = totals[k];
      $('total-' + k).textContent = t.total === null ? '–' : Calc.fmtMacro(t.total) + ' g';
      if (Calc.macroStatus(t, totals.count) === 'partial') {
        notes.push(MACRO_NAMES[k] + ' from ' + t.known + ' of ' + totals.count + ' entries');
      }
    });
    $('macro-note').textContent = notes.join('. ') + (notes.length ? '.' : '');
    $('macro-note').hidden = notes.length === 0;

    const list = $('entry-list');
    list.replaceChildren();
    entries.forEach((entry) => {
      const totals = Calc.entryTotals(entry);
      const li = el('li');
      const btn = el('button', 'row');
      btn.type = 'button';
      const main = el('span', 'row-main');
      main.append(el('span', 'row-title', entryName(entry)));
      const sub = [Calc.formatEntryAmount(entry), macroLine(totals)].filter(Boolean).join(' · ');
      main.append(el('span', 'row-sub', sub));
      btn.append(main, el('span', 'row-kcal', Calc.fmtKcal(totals.kcal) + ' kcal'));
      btn.addEventListener('click', () => openEntry(entry));
      li.append(btn);
      list.append(li);
    });
    $('entry-empty').hidden = entries.length > 0;
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

  function foodRow(food, onClick, extra) {
    return makeRow(food.name, unitText(food.unit) + ' · ' + macroLine(food), extra, onClick);
  }

  function recipeRow(recipe, onClick, extra, label) {
    const sub = (label ? label + ' · ' : '') + 'per portion · ' + macroLine(Calc.recipePerPortion(recipe));
    return makeRow(recipe.name, sub, extra, onClick);
  }

  function renderAdd() {
    const title = Calc.dayTitle(selectedDate, todayKey);
    const named = ['Today', 'Yesterday', 'Tomorrow'].includes(title);
    $('add-date-note').textContent = 'Adding to ' + (named ? title.toLowerCase() : title) + '.';
    const query = $('food-search').value.trim();
    let items = Calc.searchRecent(state.foods.concat(state.recipes), query);
    if (!query) items = items.slice(0, RECENTS_LIMIT);
    $('food-list-heading').textContent = query ? 'Matches' : 'Recent';
    $('food-list-heading').hidden = items.length === 0;

    const list = $('food-results');
    list.replaceChildren();
    items.forEach((item) => {
      if (Calc.isRecipe(item)) {
        const d = Calc.defaultRecipeAmount(item, state.entries);
        list.append(recipeRow(item, () => openAmount(item), Calc.formatAmount(d.quantity, d.unit), 'Recipe'));
      } else {
        const extra = Calc.formatAmount(Calc.defaultQty(item, state.entries), Calc.foodEntryUnit(item));
        list.append(foodRow(item, () => openAmount(item), extra));
      }
    });

    const empty = $('food-empty');
    empty.replaceChildren();
    if (items.length === 0) {
      if (query) {
        empty.append(el('p', null, 'No saved foods or recipes match “' + query + '”.'));
        const food = el('button', 'btn btn-primary', 'Add “' + query + '” as a new food');
        food.type = 'button';
        food.addEventListener('click', () => openNewFood(query));
        const recipe = el('button', 'btn', 'Make “' + query + '” as a new recipe');
        recipe.type = 'button';
        recipe.addEventListener('click', () => openNewRecipe(query));
        empty.append(food, recipe);
      } else {
        empty.append(el('p', null, 'Nothing saved yet. Tap New food or New recipe to add one; it will appear here next time.'));
      }
    }
    empty.hidden = items.length > 0;
  }

  function renderLibrary() {
    const query = $('library-search').value.trim();
    const foods = Calc.searchByName(state.foods, query);
    const recipes = Calc.searchByName(state.recipes, query);

    const foodList = $('library-foods');
    foodList.replaceChildren();
    foods.forEach((food) => {
      foodList.append(foodRow(food, () => openEditFood(food), Calc.fmtKcal(food.kcal) + ' kcal'));
    });
    $('library-foods-heading').hidden = foods.length === 0;

    const recipeList = $('library-recipes');
    recipeList.replaceChildren();
    recipes.forEach((recipe) => {
      const kcal = Calc.fmtKcal(Calc.recipePerPortion(recipe).kcal) + ' kcal';
      recipeList.append(recipeRow(recipe, () => openEditRecipe(recipe), kcal, plural(recipe.ingredients.length, 'ingredient', 'ingredients')));
    });
    $('library-recipes-heading').hidden = recipes.length === 0;

    const empty = $('library-empty');
    if (state.foods.length + state.recipes.length === 0) {
      empty.textContent = 'Nothing saved yet. Foods and recipes you save when adding them will appear here.';
    } else {
      empty.textContent = 'Nothing saved matches “' + query + '”.';
    }
    empty.hidden = foods.length + recipes.length > 0;
  }

  function renderSettings() {
    const last = state.settings.lastBackup;
    $('last-backup').textContent = last ? Calc.formatDate(Calc.dateKey(new Date(last))) : 'Never';
    $('data-counts').textContent = 'On this phone: ' + countsText(Calc.countData(state)) + '.';
    $('app-version').textContent = APP_VERSION;
  }

  function render() {
    renderToday();
    renderAdd();
    renderLibrary();
    renderSettings();
    renderBanner();
  }

  function showScreen(name) {
    currentScreen = name;
    document.querySelectorAll('.screen').forEach((node) => {
      node.hidden = node.dataset.screen !== name;
    });
    document.querySelectorAll('.tabbar [data-tab]').forEach((btn) => {
      if (btn.dataset.tab === name) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });
    renderBanner();
    window.scrollTo(0, 0);
  }

  function setDate(key) {
    selectedDate = key;
    renderToday();
    renderAdd();
  }

  // If the app was left open past midnight and was showing "today", move it to the new today.
  function checkDayChange() {
    const now = Calc.dateKey(new Date());
    if (now === todayKey) return;
    if (selectedDate === todayKey) selectedDate = now;
    todayKey = now;
    render();
  }

  // ---------- Start ----------

  function init() {
    load();
    requestPersistence();

    document.querySelector('.tabbar').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (btn) showScreen(btn.dataset.tab);
    });
    $('backup-banner').addEventListener('click', () => showScreen('settings'));

    // Today
    $('prev-day').addEventListener('click', () => setDate(Calc.addDays(selectedDate, -1)));
    $('next-day').addEventListener('click', () => setDate(Calc.addDays(selectedDate, 1)));
    $('day-title-btn').addEventListener('click', () => setDate(todayKey));
    $('today-add').addEventListener('click', () => showScreen('add'));

    // Add
    $('food-search').addEventListener('input', renderAdd);
    $('new-food-btn').addEventListener('click', () => openNewFood($('food-search').value.trim()));
    $('quick-add-btn').addEventListener('click', openQuick);
    $('new-recipe-btn').addEventListener('click', () => openNewRecipe($('food-search').value.trim()));

    // Library
    $('library-search').addEventListener('input', renderLibrary);

    // Dialogs
    document.querySelectorAll('dialog [data-close]').forEach((btn) => {
      btn.addEventListener('click', () => btn.closest('dialog').close());
    });
    $('amount-form').addEventListener('submit', submitAmount);
    $('amount-qty').addEventListener('input', updateAmountPreview);
    document.querySelectorAll('input[name="amount-unit"]').forEach((r) => r.addEventListener('change', changeAmountUnit));
    $('recipe-form').addEventListener('submit', submitRecipe);
    $('recipe-form').addEventListener('input', renderRecipe);
    document.querySelectorAll('input[name="recipe-unit"]').forEach((r) => r.addEventListener('change', changeRecipeUnit));
    $('recipe-save-only').addEventListener('click', saveOnlyRecipe);
    $('recipe-delete').addEventListener('click', deleteRecipe);
    $('add-ingredient').addEventListener('click', () => openIngredient(-1));
    $('ingredient-form').addEventListener('submit', submitIngredient);
    $('ingredient-form').addEventListener('input', updateIngredientPreview);
    document.querySelectorAll('input[name="ing-unit"]').forEach((r) => r.addEventListener('change', updateIngredientLabels));
    $('ingredient-search').addEventListener('input', renderIngredientPicker);
    // Enter in a search box should not submit the ingredient form.
    $('ingredient-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
    $('ingredient-remove').addEventListener('click', removeIngredient);
    $('food-form').addEventListener('submit', submitNewFood);
    $('food-form').addEventListener('input', updateFoodPreview);
    $('food-qty').addEventListener('input', () => { $('food-qty').dataset.touched = '1'; });
    document.querySelectorAll('input[name="food-unit"]').forEach((r) => r.addEventListener('change', updateFoodLabels));
    $('edit-food-form').addEventListener('submit', submitEditFood);
    document.querySelectorAll('input[name="edit-food-unit"]').forEach((r) => r.addEventListener('change', updateEditFoodLabels));
    $('edit-food-delete').addEventListener('click', deleteFood);
    $('apply-none').addEventListener('click', () => applyChoice('none'));
    $('apply-today').addEventListener('click', () => applyChoice('today'));
    $('apply-all').addEventListener('click', () => applyChoice('all'));
    $('apply-dialog').addEventListener('cancel', (e) => { e.preventDefault(); applyChoice('none'); });
    $('apply-form').addEventListener('submit', (e) => e.preventDefault());
    $('quick-form').addEventListener('submit', submitQuick);
    $('entry-form').addEventListener('submit', submitEntry);
    $('entry-qty').addEventListener('input', updateEntryPreview);
    $('entry-nutrition').addEventListener('input', updateEntryPreview);
    $('entry-delete').addEventListener('click', deleteEntry);

    // Toast
    $('toast-undo').addEventListener('click', () => {
      const undo = toastUndo;
      hideToast();
      if (undo) undo();
    });

    // Settings
    $('export-btn').addEventListener('click', () => {
      exportData().catch((e) => showMessage('Export failed: ' + e.message, true));
    });
    $('import-btn').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) importFile(file);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkDayChange();
    });

    render();
    if (startupNotice) toast(startupNotice);
    registerServiceWorker();
  }

  // Offline support. Skipped when opened as a local file; a failure only means no offline cache.
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Exposed for console debugging.
  window.App = { get state() { return state; }, save, render, newId };

  init();
})();
