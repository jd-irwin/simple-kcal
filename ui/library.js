// Library screen: saved foods and recipes.

import Calc from '../calc/index.js';
import { app } from './store.js';
import { registerScreen } from './nav.js';
import { plural } from './text.js';
import { $, foodRow, recipeRow } from './dom.js';
import { openEditFood } from './food.js';
import { openEditRecipe } from './recipe.js';

function renderLibrary() {
  const query = $('library-search').value.trim();
  const foods = Calc.searchByName(app.state.foods, query);
  const recipes = Calc.searchByName(app.state.recipes, query);

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
  if (app.state.foods.length + app.state.recipes.length === 0) {
    empty.textContent = 'Nothing saved yet. Foods and recipes you save when adding them will appear here.';
  } else {
    empty.textContent = 'Nothing saved matches “' + query + '”.';
  }
  empty.hidden = foods.length + recipes.length > 0;
}

export function init() {
  registerScreen('library', renderLibrary);
  $('library-search').addEventListener('input', renderLibrary);
}
