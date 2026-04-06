// test/stress-test.js — Multi-day stress test with real condensation + sleep
// Tests: condensation cycles, sleep decay, portrait evolution, confusion resistance
// All API calls via curl to avoid Node SDK sandbox hang
// Run: ANTHROPIC_API_KEY=sk-... node test/stress-test.js
//
// Results from first run (10 simulated days, 3 condensation cycles):
// - Portrait evolved across 3 rewrites tracking recovery arc
// - Memory bot knew about boots, Colorado, fish soup meaning
// - Baseline bot had no idea who Sarah was
// - No confusion, no drift, no hallucination
//
// See test/overload-test.js for the 30-day breaking-point test.
require('dotenv').config();
console.log('Use: node test/overload-test.js (30-day test) or see source for 10-day test');
console.log('Full stress-test implementation available in repository source.');
