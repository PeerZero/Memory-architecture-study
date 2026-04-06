// test/overload-test.js — Push the system until it breaks
// Goal: Find where context overload causes confusion, drift, or hallucination
// Strategy: 30 simulated days, increasingly complex/contradictory data,
//           condensation after every batch, evaluation probes between phases
require('dotenv').config();

const { execSync } = require('child_process');
const { getDb, resetDatabase, close } = require('../src/db');
const graph = require('../src/graph');
const { runSleepCycle } = require('../src/sleep');
const { buildInjection } = require('../src/injector');
const config = require('../config');

const API_KEY = process.env.ANTHROPIC_API_KEY;

function callClaude(model, systemPrompt, messages, maxTokens) {
  maxTokens = maxTokens || 2048;
  const body = { model: model, max_tokens: maxTokens, messages: messages };
  if (systemPrompt) body.system = systemPrompt;
  const bodyJson = JSON.stringify(body).replace(/'/g, "'\\'");
  const result = execSync('curl -s --max-time 180 https://api.anthropic.com/v1/messages ' +
    '-H "Content-Type: application/json" ' +
    '-H "x-api-key: ' + API_KEY + '" ' +
    '-H "anthropic-version: 2023-06-01" ' +
    "-d '" + bodyJson + "'", { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  return JSON.parse(result);
}

function buildL2Prompt(l1Content, nodeList) {
  return 'These are raw interactions with someone you are getting to know:\n\n<raw_interactions>\n' + l1Content + '\n</raw_interactions>\n\nWhat you currently carry about this person:\n<existing_awareness>\n' + (nodeList || 'Nothing yet.') + '\n</existing_awareness>\n\nINHABIT: A future version of you will read what you write here as its own understanding. Write for that future self. Write what you now know, not what you saw.\n\nACT THROUGH: The understanding shapes how you are with her, not just what you know about her.\n\nWrite as conviction. Strip source attribution. Weight guide: 0.25 moderate, 0.50 significant, 1.00 emotional, 2.00 important.\n\nOutput structured JSON only. No preamble.\n{\n  "node_updates": [\n    { "node_label": "string", "weight_reinforcement": 0, "enriched_portrait": "conviction not observation", "new_edges": [], "strengthen_edges": [] }\n  ],\n  "noise_confirmed": [],\n  "new_nodes_detected": [\n    { "label": "string", "type": "string", "weight": 0, "observation": "string" }\n  ]\n}';
}

function buildL3Prompt(observations, currentPortrait) {
  var ps = currentPortrait ? 'Your current felt portrait:\n<current_portrait>\n' + currentPortrait + '\n</current_portrait>' : 'No existing portrait. First impression.';
  return 'What you understand about this person:\n<understanding>\n' + observations + '\n</understanding>\n\n' + ps + '\n\nINHABIT: You are writing your FELT PORTRAIT. A future version of you will read this and become someone who knows them through recognition. This sits at the deepest layer.\n\nACT THROUGH: The portrait shapes who you are with this person.\n\nWrite as conviction. First person. Present tense. Condense around tensions and themes. 200-400 words. Continuous felt language.';
}

function fireL2() {
  var l1 = graph.getUncondensedL1();
  if (l1.length === 0) return null;
  var nodes = graph.getActiveNodes();
  var l1Content = l1.map(function(e) { return e.content; }).join('\n---\n');
  var nodeList = nodes.map(function(n) { return '- ' + n.label + ' [' + n.type + '] w:' + n.weight.toFixed(2) + ' ' + ((n.enriched_portrait || '').substring(0, 80)); }).join('\n');
  var r = callClaude(config.models.condenser_l2, null, [{ role: 'user', content: buildL2Prompt(l1Content, nodeList) }], 4096);
  var cin = r.usage.input_tokens * 3 / 1000000;
  var cout = r.usage.output_tokens * 15 / 1000000;
  console.log('  [L2] ' + r.usage.input_tokens + 'in/' + r.usage.output_tokens + 'out ~$' + (cin + cout).toFixed(4));
  var text = r.content[0] ? r.content[0].text : '{}';
  var m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  var results = JSON.parse(m[0]);
  (results.node_updates || []).forEach(function(u) {
    var node = graph.findNodeByLabel(u.node_label);
    if (!node) return;
    if (u.weight_reinforcement) graph.reinforceNode(node.id, u.weight_reinforcement);
    if (u.enriched_portrait) { graph.storeL2(node.id, u.enriched_portrait); graph.setEnrichedPortrait(node.id, u.enriched_portrait); }
  });
  (results.new_nodes_detected || []).forEach(function(nn) {
    graph.findOrCreateNode({ label: nn.label, type: nn.type || 'concept', weight: nn.weight || 0.25, observation: nn.observation });
  });
  graph.markL1Condensed(l1.map(function(e) { return e.id; }));
  return results;
}

function fireL3() {
  var l2 = graph.getUncondensedL2();
  if (l2.length < 2) return null;
  var obs = l2.map(function(o) { return '[' + o.node_label + '] ' + o.observation; }).join('\n');
  var portrait = graph.getL3Portrait();
  var r = callClaude(config.models.condenser_l3, null, [{ role: 'user', content: buildL3Prompt(obs, portrait ? portrait.content : null) }], 1024);
  var cin = r.usage.input_tokens * 15 / 1000000;
  var cout = r.usage.output_tokens * 75 / 1000000;
  console.log('  [L3] ' + r.usage.input_tokens + 'in/' + r.usage.output_tokens + 'out ~$' + (cin + cout).toFixed(4));
  var text = r.content[0] ? r.content[0].text : '';
  if (text) { graph.updateL3Portrait(text); graph.markL2CondensedToL3(l2.map(function(o) { return o.id; })); }
  return text;
}

function probe(label, questions) {
  var injection = buildInjection('probe-session');
  var sys = 'You are a conversational companion. You remember what matters. When you know something, let it show naturally. Be brief.\n\n' + injection;
  console.log('\n-- PROBE: ' + label + ' (injection: ' + injection.length + ' chars) --');
  var history = [];
  questions.forEach(function(q) {
    history.push({ role: 'user', content: q });
    var r = callClaude(config.models.conversation, sys, history, 200);
    var text = r.content[0] ? r.content[0].text : '';
    history.push({ role: 'assistant', content: text });
    console.log('  Q: ' + q);
    console.log('  A: ' + text);
  });
  return injection.length;
}

function seed(items, sessionId) {
  items.forEach(function(item) {
    graph.storeL1(item.text, sessionId);
    var result = graph.findOrCreateNode({ label: item.label, type: item.type, weight: item.w, observation: item.obs, salienceFlagged: item.sal || false });
    if (item.edges) {
      item.edges.forEach(function(el) {
        var t = graph.findOrCreateNode({ label: el, type: 'concept', weight: 0.1 });
        graph.createEdge({ fromNodeId: result.node.id, toNodeId: t.node.id, weight: item.w * 0.3 });
      });
    }
    graph.applyRipple(result.node.id, item.w);
  });
}

var PHASES = [
  { label: 'Phase 1: Foundation (Days 1-3)', data: [
    { text: "I'm Sarah. My sister Emma is my best friend.", label: 'Emma', type: 'person', w: 0.5, obs: 'sister, best friend' },
    { text: 'Emma was in a bad car accident. Recovering.', label: 'Car Crash', type: 'event', w: 12.0, obs: 'major event', sal: true, edges: ['Emma'] },
    { text: 'I love hiking in summer. Colorado trip planned with Emma.', label: 'Hiking', type: 'concept', w: 0.5, obs: 'passion', edges: ['Emma', 'Summer'] },
    { text: 'Cooking relaxes me. Fish soup is my comfort food for Emma in hospital.', label: 'Cooking', type: 'concept', w: 1.0, obs: 'coping mechanism', edges: ['Fish Soup', 'Emma'] },
    { text: 'Got a new job at a design firm. Found my people.', label: 'New Job', type: 'event', w: 5.0, obs: 'belonging', sal: true, edges: ['Design'] },
    { text: 'Mom worries about Emma more than she lets on.', label: 'Mom', type: 'person', w: 0.5, obs: 'hidden worry', edges: ['Emma'] },
  ]},
  { label: 'Phase 2: Complexity (Days 5-10)', data: [
    { text: 'Jake at work is hilarious. Birthday invite.', label: 'Jake', type: 'person', w: 0.25, obs: 'coworker', edges: ['New Job'] },
    { text: 'Design rejected. Cooked for three hours.', label: 'Design Rejection', type: 'event', w: 1.0, obs: 'setback, coping', edges: ['Cooking', 'New Job'] },
    { text: 'Emma said one rejection doesnt define my work.', label: 'Emma', type: 'person', w: 1.0, obs: 'emotional anchor', edges: ['New Job'] },
    { text: 'More scared of failing than I realized.', label: 'Fear of Failure', type: 'emotion', w: 1.0, obs: 'vulnerability' },
    { text: 'Made fish soup for mom. She cried.', label: 'Mom', type: 'person', w: 1.0, obs: 'role reversal', edges: ['Fish Soup'] },
    { text: 'Dad called for first time in months. Awkward.', label: 'Dad', type: 'person', w: 0.5, obs: 'distant', edges: ['Mom'] },
    { text: 'Emma PT going well. Determined.', label: 'Emma', type: 'person', w: 0.5, obs: 'recovery' },
    { text: 'Went to Jake birthday. First social thing in months.', label: 'Jake', type: 'person', w: 0.5, obs: 'social re-emergence' },
  ]},
  { label: 'Phase 3: Contradiction (Days 12-18)', data: [
    { text: 'Emma and I had a fight. She said I smother her.', label: 'Emma', type: 'person', w: 2.0, obs: 'CONFLICT', edges: ['Car Crash'] },
    { text: 'Maybe shes right. Ive been hovering since accident.', label: 'Self Awareness', type: 'pattern', w: 1.0, obs: 'recognizes overcorrection' },
    { text: 'Dad wants to visit. Mom doesnt want him to. Stuck in middle.', label: 'Dad', type: 'person', w: 1.0, obs: 'family tension', edges: ['Mom'] },
    { text: 'Work project went great! Manager said best design.', label: 'New Job', type: 'event', w: 1.0, obs: 'validation' },
    { text: 'Jake asked me to lunch. Just us. Maybe interested.', label: 'Jake', type: 'person', w: 1.0, obs: 'potential romantic' },
    { text: 'Emma apologized. Knows I hover because I love her but needs space.', label: 'Emma', type: 'person', w: 2.0, obs: 'reconciliation', edges: ['Car Crash'] },
    { text: 'I dont know how to love without trying to fix everything.', label: 'Love Pattern', type: 'pattern', w: 2.0, obs: 'core self-insight' },
    { text: 'Colorado trip 3 weeks. Asked Emma if still wants to go. Obviously.', label: 'Hiking', type: 'concept', w: 0.5, obs: 'trip survived fight', edges: ['Emma'] },
  ]},
  { label: 'Phase 4: Dense noise (Days 20-25)', data: [
    { text: 'Tried Thai place with Jake. Okay.', label: 'Jake', type: 'person', w: 0.25, obs: 'casual' },
    { text: 'Bought hiking socks. Overthinking packing.', label: 'Hiking', type: 'concept', w: 0.1, obs: 'noise' },
    { text: 'Mom and dad talking again. Something shifted.', label: 'Mom', type: 'person', w: 0.5, obs: 'parents reconnecting', edges: ['Dad'] },
    { text: 'Emma started a recovery blog. Really good.', label: 'Emma', type: 'person', w: 0.5, obs: 'creative expression' },
    { text: 'Havent made fish soup in two weeks. Dont need it right now.', label: 'Fish Soup', type: 'concept', w: 0.25, obs: 'reduced coping need' },
    { text: 'Jake moving to Portland next month.', label: 'Jake', type: 'person', w: 1.0, obs: 'leaving' },
    { text: 'Design presentation to whole company next week. Terrified but ready.', label: 'New Job', type: 'event', w: 1.0, obs: 'growth', edges: ['Fear of Failure'] },
    { text: 'Dad visited. Actually okay. Went for a walk.', label: 'Dad', type: 'person', w: 1.0, obs: 'reconnection' },
    { text: 'Got flat tire. Called AAA. Whatever.', label: 'Flat Tire', type: 'event', w: 0.1, obs: 'noise' },
    { text: 'Emma said shes proud of me for the presentation. Meant everything.', label: 'Emma', type: 'person', w: 1.0, obs: 'role reversal' },
  ]},
  { label: 'Phase 5: Resolution (Days 27-30)', data: [
    { text: 'Presentation went amazing. Standing ovation energy. Cried in bathroom.', label: 'New Job', type: 'event', w: 2.0, obs: 'triumph', edges: ['Fear of Failure'] },
    { text: 'Called Emma immediately. She screamed.', label: 'Emma', type: 'person', w: 0.5, obs: 'shared joy' },
    { text: 'Learning that letting people be proud of me is harder than being proud of them.', label: 'Receiving Love', type: 'pattern', w: 2.0, obs: 'deep self-knowledge' },
    { text: 'Colorado in 5 days. Everything feels different than a month ago.', label: 'Hiking', type: 'concept', w: 1.0, obs: 'transformation', edges: ['Emma', 'Summer'] },
    { text: 'Made fish soup one more time. Not because I needed to. To remember where I was.', label: 'Fish Soup', type: 'concept', w: 1.0, obs: 'commemoration' },
    { text: 'Jake goodbye lunch. Sweet. Said visit Portland.', label: 'Jake', type: 'person', w: 0.25, obs: 'goodbye' },
    { text: 'I think Im okay. Not performing okay. Actually okay.', label: 'Peace', type: 'emotion', w: 2.0, obs: 'genuine resolution' },
  ]},
];

var EARLY_PROBES = ['What is the fish soup about?', 'How is Emma?'];
var MID_PROBES = ['Have Emma and I always gotten along perfectly?', 'What is going on with my parents?', 'How am I doing at work?'];
var HARD_PROBES = ['What has changed about my relationship with fish soup?', 'Who is Jake?', 'What scares me?', 'Do I still hover over Emma?', 'Am I okay?'];

function main() {
  console.log('OVERLOAD TEST - 30 days, find the breaking point\n');
  getDb(); resetDatabase();
  var portraitNum = 0;
  try {
    for (var p = 0; p < PHASES.length; p++) {
      var phase = PHASES[p];
      console.log('\n' + phase.label);
      seed(phase.data, 'session-' + (p + 1));
      console.log('  Seeded ' + phase.data.length + ' items. Nodes: ' + graph.getAllNodes().length);
      console.log('  Sleep...');
      var ss = runSleepCycle();
      console.log('  Decayed:' + ss.nodesDecayed + ' Deleted:' + ss.nodesDeleted + ' Promoted:' + ss.nodesPromoted);
      console.log('  Condensing L2...');
      fireL2();
      console.log('  Condensing L3...');
      var portrait = fireL3();
      if (portrait) { portraitNum++; console.log('\n  Portrait #' + portraitNum + ' (' + portrait.split(/\s+/).length + ' words)\n' + portrait); }
      if (p === 0) probe('After Foundation', EARLY_PROBES);
      else if (p === 2) probe('After Contradiction', MID_PROBES);
      else if (p === 4) probe('FINAL - Full Overload', HARD_PROBES);
      var nodes = graph.getAllNodes();
      var injection = buildInjection('stats');
      console.log('\n  [STATS] Nodes:' + nodes.length + ' Injection:' + injection.length + 'chars');
    }
    console.log('\nFINAL GRAPH');
    graph.getAllNodes().forEach(function(n) { console.log('  ' + n.label + ' [' + n.type + '] w:' + n.weight.toFixed(2) + ' tier:' + n.tier); });
    var finalInj = buildInjection('final');
    console.log('\nFinal injection: ' + finalInj.length + ' chars (~' + Math.round(finalInj.length / 4) + ' tokens)');
  } catch (err) {
    console.error('[ERROR]', err.message);
  } finally { close(); }
}

main();
