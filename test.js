// Run with: node test.js
// Runs the calculation tests in tests/*.test.js. The browser smoke test is separate: node tests/smoke.js

// Fix the time zone so BST tests behave the same on any machine. Set before any test file loads.
process.env.TZ = 'Europe/London';

const FILES = [
  'dates', 'entries', 'totals', 'recipes', 'format', 'search', 'data', 'repo',
];

const { results } = await import('./tests/harness.js');
for (const name of FILES) {
  console.log('\n' + name);
  await import('./tests/' + name + '.test.js');
}

const { passed, failed } = results();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
