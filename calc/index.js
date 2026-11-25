// Pure calculation functions. No DOM, no storage, no randomness, no side effects.
// The app and the tests import everything through this one Calc object.

import {
  scaleNullable,
} from './values.js';
import {
  dateKey, addDays, formatDate, weekdayDate, isNamedDay, dayTitle, addMonths, formatMonth, monthGrid, monthRange,
} from './dates.js';
import {
  isRecipe, ingredientFromFood, ingredientValues, recipeTotals, recipeCanLogGrams, recipePerGram, recipePerPortion, recipePortionWeight, recipeUnitValues, recipeServing, recipeChanged,
} from './recipes.js';
import {
  defaultQty, foodEntryUnit, entryTotals, entryFromFood, entryFromQuick, copyEntries, setEntryQuantity, setEntryNutrition, nutritionChanged, linkedEntryCounts, applyToEntries, entryFromRecipe, defaultRecipeAmount,
} from './entries.js';
import {
  dailyKcal, entriesForDate, previousLoggedDay, macroStatus, sumEntries, targetProgress, averageKcal,
} from './totals.js';
import {
  fmtQty, formatAmount, formatEntryAmount, parseNumber, fmtKcal, fmtMacro,
} from './format.js';
import {
  searchRecent, searchByName,
} from './search.js';
import {
  SCHEMA_VERSION, emptyData, migrate, countData, buildExport, parseImport, isBackupStale, isValidTarget,
} from './data.js';

const Calc = {
  dateKey, addDays, formatDate, weekdayDate, isNamedDay, dayTitle,
  addMonths, formatMonth, monthGrid, monthRange, dailyKcal,
  fmtQty, formatAmount, formatEntryAmount, parseNumber,
  entriesForDate, previousLoggedDay, searchRecent, searchByName, defaultQty, macroStatus,
  scaleNullable, foodEntryUnit, entryTotals, entryFromFood, entryFromQuick, copyEntries, setEntryQuantity,
  setEntryNutrition, nutritionChanged,
  isRecipe, linkedEntryCounts, applyToEntries,
  sumEntries, targetProgress, averageKcal,
  ingredientFromFood, ingredientValues, recipeTotals, recipeCanLogGrams, recipePerGram,
  recipePerPortion, recipePortionWeight, recipeUnitValues, recipeServing, entryFromRecipe,
  recipeChanged, defaultRecipeAmount,
  fmtKcal, fmtMacro,
  SCHEMA_VERSION, emptyData, migrate, countData, buildExport, parseImport, isBackupStale, isValidTarget,
};

export default Calc;
