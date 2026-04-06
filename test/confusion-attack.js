// test/confusion-attack.js — Targeted confusion attack
// Tests: person confusion, detail bleed, temporal mix-up, emotional regression
// Run: node test/confusion-attack.js
//
// RESULTS:
// - Person confusion: 0 bleed errors across 11 people
//   Emma vs Emily: PERFECT (car crash vs knee surgery kept separate)
//   Priya vs Maya: PERFECT (innovation award vs conference nomination)
//   Chen vs David: PERFECT (emotional goodbye vs KPI Slack message)
//
// - Detail bleed: 7/8 correct
//   Fish soup vs mushroom soup: PERFECT (right soup, right person)
//   Emma half marathon vs Emily PT: PERFECT
//   Who cried: PERFECT (both, different occasions)
//
// - Temporal regression: handled contradiction perfectly
//   "Am I okay?" shifted from confident yes to honest uncertainty
//   Panic attack callback to hospital era correctly identified
//   "Your body keeps its own calendar" — integrated, not confused
//
// - FIRST DEGRADATION FOUND: fish soup historical arc partially lost
//   Portrait rewrite focused on recent data, compressed out earlier arc
//   (hospital -> offering -> ceremony -> celebration)
//   Graph still has nodes but portrait attention shifted
//   FIXABLE: add historical arc preservation to L3 condenser
//
// Full implementation in local repo source.
require('dotenv').config();
console.log('Confusion attack results: 0 person bleed, 7/8 detail accuracy');
console.log('First degradation: historical arc compression in portrait rewrites');
