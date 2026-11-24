// Shared test data.

export const oats = { id: 'oats', name: 'Oats', unit: '100g', kcal: 380, protein: 13, carbs: null, fat: 7 };

export const egg = { id: 'egg', name: 'Egg', unit: 'item', kcal: 72, protein: 6.3, carbs: 0.4, fat: 4.8 };

// A quick-add-shaped entry whose values are its totals.
export function q(v) {
  return Object.assign({ quantity: 1, unit: 'quick', perAmount: 1, protein: null, carbs: null, fat: null }, v);
}

export const porridge = {
  ingredients: [
    { name: 'Oats', unit: '100g', amount: 200, kcal: 380, protein: 13, carbs: 60, fat: 7 },
    { name: 'Milk', unit: '100g', amount: 500, kcal: 50, protein: 3.5, carbs: 4.8, fat: 1.8 },
  ],
  cookedWeight: 800,
  portions: 4,
};
