// Searching and sorting the user's own foods and recipes.

function byRecent(a, b) {
  return (b.lastUsed || 0) - (a.lastUsed || 0) || a.name.localeCompare(b.name);
}

function byName(a, b) {
  return a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' });
}

// Every word of the query must appear somewhere in the name. Case-insensitive.
function matchesQuery(name, query) {
  const n = name.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => n.includes(w));
}

// Search results (or everything, if the query is blank) sorted most recently used first.
export function searchRecent(items, query) {
  return items.filter((it) => matchesQuery(it.name, query || '')).sort(byRecent);
}

// Search results (or everything) sorted by name, for the Library.
export function searchByName(items, query) {
  return items.filter((it) => matchesQuery(it.name, query || '')).sort(byName);
}
