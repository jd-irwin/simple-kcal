// Add screen: search and recents over saved foods and recipes, and the ways to add.

import Calc from '../calc/index.js';
import { app } from './store.js';
import { registerScreen } from './nav.js';
import { RECENTS_LIMIT } from './text.js';
import { $, el, foodRow, recipeRow } from './dom.js';
import { openAmount } from './amount.js';
import { openQuick } from './entry.js';
import { openNewFood } from './food.js';
import { openNewRecipe } from './recipe.js';

function renderAdd() {
  const title = Calc.dayTitle(app.selectedDate, app.todayKey);
  const named = Calc.isNamedDay(app.selectedDate, app.todayKey);
  $('add-date-note').textContent = 'Adding to ' + (named ? title.toLowerCase() : title) + '.';
  const query = $('food-search').value.trim();
  let items = Calc.searchRecent(app.state.foods.concat(app.state.recipes), query);
  if (!query) items = items.slice(0, RECENTS_LIMIT);
  $('food-list-heading').textContent = query ? 'Matches' : 'Recent';
  $('food-list-heading').hidden = items.length === 0;

  const list = $('food-results');
  list.replaceChildren();
  items.forEach((item) => {
    if (Calc.isRecipe(item)) {
      const d = Calc.defaultRecipeAmount(item, app.state.entries);
      list.append(recipeRow(item, () => openAmount(item), Calc.formatAmount(d.quantity, d.unit), 'Recipe'));
    } else {
      const extra = Calc.formatAmount(Calc.defaultQty(item, app.state.entries), Calc.foodEntryUnit(item));
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

export function init() {
  registerScreen('add', renderAdd);
  $('food-search').addEventListener('input', renderAdd);
  $('new-food-btn').addEventListener('click', () => openNewFood($('food-search').value.trim()));
  $('quick-add-btn').addEventListener('click', openQuick);
  $('new-recipe-btn').addEventListener('click', () => openNewRecipe($('food-search').value.trim()));
}
