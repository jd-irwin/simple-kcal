// Pure calculation functions. No DOM, no storage, no randomness, no side effects.
// The app and the tests import everything through this one Calc object.

import {
  scaleNullable,
} from './values.js';
import {
  dateKey, addDays, formatDate, weekdayDate, isNamedDay, dayTitle, addMonths, formatMonth, monthGrid,
} from './dates.js';
import {
  isRecipe, ingredientFromFood, ingredientValues, recipeTotals, recipeCanLogGrams, recipePerGram, recipePerPortion, recipePortionWeight, recipeUnitValues, recipeServing, recipeChanged,
} from './recipes.js';
import {
  defaultQty, foodEntryUnit, entryTotals, entryFromFood, entryFromQuick, copyEntries, setEntryQuantity, setEntryNutrition, nutritionChanged, linkedEntryCounts, applyToEntries, entryFromRecipe, defaultRecipeAmount,
} from './entries.js';
import {
  dailyKcal, entriesForDate, previousLoggedDay, macroStatus, sumEntries,
} from './totals.js';
import {
  fmtQty, formatAmount, formatEntryAmount, parseNumber, fmtKcal, fmtMacro,
} from './format.js';
import {
  searchRecent, searchByName,
} from './search.js';
import {
  SCHEMA_VERSION, emptyData, migrate, countData, buildExport, parseImport, isBackupStale,
} from './data.js';

const Calc = {
  dateKey, addDays, formatDate, weekdayDate, isNamedDay, dayTitle,
  addMonths, formatMonth, monthGrid, dailyKcal,
  fmtQty, formatAmount, formatEntryAmount, parseNumber,
  entriesForDate, previousLoggedDay, searchRecent, searchByName, defaultQty, macroStatus,
  scaleNullable, foodEntryUnit, entryTotals, entryFromFood, entryFromQuick, copyEntries, setEntryQuantity,
  setEntryNutrition, nutritionChanged,
  isRecipe, linkedEntryCounts, applyToEntries,
  sumEntries,
  ingredientFromFood, ingredientValues, recipeTotals, recipeCanLogGrams, recipePerGram,
  recipePerPortion, recipePortionWeight, recipeUnitValues, recipeServing, entryFromRecipe,
  recipeChanged, defaultRecipeAmount,
  fmtKcal, fmtMacro,
  SCHEMA_VERSION, emptyData, migrate, countData, buildExport, parseImport, isBackupStale,
};

export default Calc;
