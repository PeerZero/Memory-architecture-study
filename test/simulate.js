// test/simulate.js — Multi-day conversation simulation
// Mocks filter/salience to test graph mechanics without API calls
// Run: node test/simulate.js

require('dotenv').config();

const { getDb, resetDatabase, close } = require('../src/db');
const graph = require('../src/graph');
const { runSleepCycle } = require('../src/sleep');
const { buildInjection } = require('../src/injector');

// ─── SIMULATED CONVERSATIONS ───────────────────────────────
// Each "day" is a set of messages with pre-determined filter outputs
// This tests the full graph lifecycle without API calls

const DAYS = [
  {
    label: 'Day 1 \u2014 First meeting',
    messages: [
      {
        text: "Hi! I'm Sarah. Nice to meet you.",
        filter: [
          { label: 'Sarah', type: 'person', weight: 0.50, observation: 'introduced herself by name', edges: [] },
        ],
        salience: null,
      },
      {
        text: "I have a sister named Emma. We're pretty close.",
        filter: [
          { label: 'Emma', type: 'person', weight: 0.50, observation: 'sister, described as close', edges: ['Sarah'] },
          { label: 'Sister Bond', type: 'emotion', weight: 0.25, observation: 'warmth when describing relationship', edges: ['Emma', 'Sarah'] },
        ],
        salience: null,
      },
      {
        text: "I love hiking in the summer. There's nothing like being out on a trail.",
        filter: [
          { label: 'Hiking', type: 'concept', weight: 0.50, observation: 'expressed genuine enthusiasm', edges: ['Summer'] },
          { label: 'Summer', type: 'concept', weight: 0.25, observation: 'connected to hiking', edges: ['Hiking'] },
        ],
        salience: null,
      },
      {
        text: "I went to the market yesterday and got some fish. Nothing special.",
        filter: [
          { label: 'Market', type: 'place', weight: 0.10, observation: 'casual mention, routine', edges: [] },
          { label: 'Fish', type: 'concept', weight: 0.10, observation: 'passing mention, no emotional weight', edges: ['Market'] },
        ],
        salience: null,
      },
      {
        text: "Actually... Emma was in a car accident last month. She's okay now but it really scared me.",
        filter: [
          { label: 'Emma', type: 'person', weight: 1.00, observation: 'mentioned with visible emotion when discussing accident', edges: ['Car Crash'] },
          { label: 'Car Crash', type: 'event', weight: 1.00, observation: 'significant event, Emma was involved', edges: ['Emma', 'Fear'] },
          { label: 'Fear', type: 'emotion', weight: 1.00, observation: 'genuine fear expressed about sister safety', edges: ['Emma', 'Car Crash'] },
        ],
        salience: { level: 'major', weight: 12.00, eventLabel: 'Car Crash', reason: 'sister in car accident, emotional language' },
      },
      {
        text: "She had to stay in the hospital for a few days. I visited every day.",
        filter: [
          { label: 'Hospital', type: 'place', weight: 0.50, observation: 'connected to car crash recovery', edges: ['Emma', 'Car Crash'] },
          { label: 'Emma', type: 'person', weight: 0.50, observation: 'Sarah visited daily \u2014 shows depth of bond', edges: ['Hospital'] },
        ],
        salience: null,
      },
    ],
  },
  {
    label: 'Day 2 \u2014 Getting comfortable',
    messages: [
      {
        text: "Hey! I made fish tacos last night. They turned out pretty good actually.",
        filter: [
          { label: 'Fish', type: 'concept', weight: 0.25, observation: 'mentioned cooking fish \u2014 second mention, more context', edges: ['Cooking'] },
          { label: 'Cooking', type: 'concept', weight: 0.25, observation: 'seems to enjoy cooking', edges: ['Fish'] },
        ],
        salience: null,
      },
      {
        text: "Emma came over for dinner. First time she's been out since the accident.",
        filter: [
          { label: 'Emma', type: 'person', weight: 1.00, observation: 'milestone recovery moment \u2014 first outing since crash', edges: ['Car Crash', 'Cooking'] },
          { label: 'Car Crash', type: 'event', weight: 0.25, observation: 'referenced as context for Emma recovery', edges: ['Emma'] },
        ],
        salience: null,
      },
      {
        text: "We're planning a hiking trip for this summer. Emma says she wants to try it.",
        filter: [
          { label: 'Hiking', type: 'concept', weight: 0.50, observation: 'planning future trip \u2014 repeated interest', edges: ['Summer', 'Emma'] },
          { label: 'Summer', type: 'concept', weight: 0.25, observation: 'connected to hiking plans again', edges: ['Hiking'] },
          { label: 'Emma', type: 'person', weight: 0.25, observation: 'wants to join hiking \u2014 expanding beyond car crash context', edges: ['Hiking'] },
        ],
        salience: null,
      },
      {
        text: "I think cooking helps me relax. When things were really scary with Emma I just kept making soups.",
        filter: [
          { label: 'Cooking', type: 'concept', weight: 1.00, observation: 'explicitly identified as coping mechanism', edges: ['Fear', 'Emma'] },
          { label: 'Coping Through Cooking', type: 'pattern', weight: 1.00, observation: 'Sarah reaches for cooking when stressed', edges: ['Cooking', 'Fear'] },
          { label: 'Fear', type: 'emotion', weight: 0.25, observation: 'referenced past fear about Emma', edges: ['Emma', 'Cooking'] },
        ],
        salience: null,
      },
      {
        text: "Oh I also got a new job! I start at the design firm next Monday.",
        filter: [
          { label: 'New Job', type: 'event', weight: 2.00, observation: 'explicitly announced, clearly important to her', edges: ['Design'] },
          { label: 'Design', type: 'concept', weight: 0.50, observation: 'career field \u2014 design firm', edges: ['New Job'] },
        ],
        salience: { level: 'minor', weight: 5.00, eventLabel: 'New Job', reason: 'new job starting, explicitly announced' },
      },
    ],
  },
  {
    label: 'Day 3 \u2014 Deepening',
    messages: [
      {
        text: "First day at work was good! Everyone seems nice. A bit nervous though.",
        filter: [
          { label: 'New Job', type: 'event', weight: 0.50, observation: 'follow-up, positive but nervous', edges: ['Nervousness'] },
          { label: 'Nervousness', type: 'emotion', weight: 0.50, observation: 'admitted vulnerability about new situation', edges: ['New Job'] },
        ],
        salience: null,
      },
      {
        text: "Emma texted me good luck this morning. She's sweet like that.",
        filter: [
          { label: 'Emma', type: 'person', weight: 0.50, observation: 'supportive gesture, Sarah values it', edges: ['Sarah', 'New Job'] },
        ],
        salience: null,
      },
      {
        text: "I'm thinking of making that fish soup again this weekend. The one from when Emma was recovering.",
        filter: [
          { label: 'Fish', type: 'concept', weight: 0.25, observation: 'third mention \u2014 now emotionally connected to Emma recovery', edges: ['Cooking', 'Emma'] },
          { label: 'Cooking', type: 'concept', weight: 0.50, observation: 'comfort cooking, linked to Emma memories', edges: ['Fish', 'Emma'] },
        ],
        salience: null,
      },
      {
        text: "Summer can't come fast enough. I need those trails.",
        filter: [
          { label: 'Hiking', type: 'concept', weight: 0.50, observation: 'expressed longing \u2014 hiking as emotional outlet', edges: ['Summer'] },
          { label: 'Summer', type: 'concept', weight: 0.25, observation: 'anticipated eagerly', edges: ['Hiking'] },
        ],
        salience: null,
      },
    ],
  },
  {
    label: 'Day 5 \u2014 After some time (day 4 was quiet)',
    messages: [
      {
        text: "Work is going well. My manager seems to really value design thinking.",
        filter: [
          { label: 'New Job', type: 'event', weight: 0.25, observation: 'settling in, positive trajectory', edges: ['Design'] },
          { label: 'Design', type: 'concept', weight: 0.25, observation: 'reinforced as professional identity', edges: ['New Job'] },
        ],
        salience: null,
      },
      {
        text: "Emma and I booked the hiking trip! Two weeks in July. I'm so excited.",
        filter: [
          { label: 'Hiking', type: 'concept', weight: 1.00, observation: 'committed to trip \u2014 elevated from idea to plan', edges: ['Summer', 'Emma'] },
          { label: 'Emma', type: 'person', weight: 0.50, observation: 'doing things together, relationship strengthening post-crash', edges: ['Hiking', 'Summer'] },
          { label: 'Summer', type: 'concept', weight: 0.50, observation: 'now tied to specific plans', edges: ['Hiking', 'Emma'] },
          { label: 'Excitement', type: 'emotion', weight: 0.50, observation: 'genuine excitement about future plans', edges: ['Hiking', 'Emma'] },
        ],
        salience: null,
      },
    ],
  },
];

// ─── SIMULATION ENGINE ───────────────────────────────────────

function simulate() {
  console.log('='.repeat(60));
  console.log('MEMORY GRAPH SIMULATION \u2014 Multi-Day Test');
  console.log('='.repeat(60));
  console.log('');

  // Initialize
  getDb();
  resetDatabase();

  let sessionCount = 0;

  for (const day of DAYS) {
    sessionCount++;
    const sessionId = `session-${sessionCount}`;

    console.log(`\n${'\u2500'.repeat(60)}`);
    console.log(`${day.label}`);
    console.log(`${'\u2500'.repeat(60)}`);

    for (const msg of day.messages) {
      console.log(`\n  Sarah: "${msg.text}"`);

      // Store in L1 and short-term
      graph.storeL1(msg.text, sessionId);
      graph.storeShortTerm(sessionId, 'user', msg.text);

      // Apply filter results (mocked)
      for (const item of msg.filter) {
        const { node, created } = graph.findOrCreateNode({
          label: item.label,
          type: item.type,
          weight: item.weight,
          observation: item.observation,
        });

        for (const edgeLabel of item.edges) {
          const { node: target } = graph.findOrCreateNode({
            label: edgeLabel,
            type: 'concept',
            weight: 0.10,
          });
          graph.createEdge({
            fromNodeId: node.id,
            toNodeId: target.id,
            weight: item.weight * 0.5,
            type: 'explicit',
          });
        }

        graph.applyRipple(node.id, item.weight);

        if (created) {
          console.log(`    [+] New node: ${item.label} [${item.type}] weight:${item.weight}`);
        } else {
          console.log(`    [~] Reinforced: ${item.label} \u2192 weight:${node.weight.toFixed(2)}`);
        }
      }

      // Apply salience (mocked)
      if (msg.salience) {
        const { node } = graph.findOrCreateNode({
          label: msg.salience.eventLabel,
          type: 'event',
          weight: msg.salience.weight,
          observation: msg.salience.reason,
          salienceFlagged: true,
        });
        graph.applyRipple(node.id, msg.salience.weight);
        console.log(`    [!] SALIENCE SPIKE: ${msg.salience.eventLabel} (${msg.salience.level}, +${msg.salience.weight})`);
      }
    }

    // End of day \u2014 archive session to L1
    const shortTerm = graph.getShortTerm(sessionId);
    const conversation = shortTerm.map((m) => `Sarah: ${m.content}`).join('\n');
    graph.storeL1(`[Session Summary]\n${conversation}`, sessionId);
    graph.clearShortTerm(sessionId);

    // Show graph state
    console.log(`\n  Graph after ${day.label}:`);
    const nodes = graph.getActiveNodes();
    for (const node of nodes) {
      const edges = graph.getEdgesFrom(node.id);
      const edgeCount = edges.length + graph.getEdgesTo(node.id).length;
      console.log(`    ${node.label} [${node.type}] weight:${node.weight.toFixed(2)} tier:${node.tier} edges:${edgeCount}`);
    }

    // Run sleep consolidation between days
    if (sessionCount < DAYS.length) {
      console.log(`\n  Sleep consolidation...`);
      const stats = runSleepCycle();
      if (stats.nodesDeleted > 0) console.log(`    Deleted ${stats.nodesDeleted} faded nodes`);
      if (stats.nodesPromoted > 0) console.log(`    Promoted ${stats.nodesPromoted} nodes to higher tier`);
      if (stats.edgesCreated > 0) console.log(`    Created ${stats.edgesCreated} co-occurrence edges`);
    }
  }

  // ─── FINAL REPORT ────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log('FINAL STATE \u2014 After 5 simulated days');
  console.log(`${'='.repeat(60)}`);

  const finalNodes = graph.getAllNodes();
  console.log(`\nTotal nodes: ${finalNodes.length}`);
  console.log('');

  // Group by tier
  const tiers = { permanent: [], significant: [], pattern: [], ephemeral: [] };
  for (const node of finalNodes) tiers[node.tier].push(node);

  for (const [tier, nodes] of Object.entries(tiers)) {
    if (nodes.length === 0) continue;
    console.log(`${tier.toUpperCase()} tier (${nodes.length}):`);
    for (const node of nodes) {
      console.log(`  ${node.label} [${node.type}] weight:${node.weight.toFixed(2)}`);
    }
    console.log('');
  }

  // Show what injection would look like for a new session
  console.log(`${'\u2500'.repeat(60)}`);
  console.log('INJECTION PREVIEW \u2014 What the bot sees on next session:');
  console.log(`${'\u2500'.repeat(60)}`);
  const injection = buildInjection('new-session');
  console.log(injection);

  // Show L1 uncondensed
  const l1Chars = graph.getUncondensedL1CharCount();
  console.log(`\n${'\u2500'.repeat(60)}`);
  console.log(`L1 uncondensed: ${l1Chars} chars (threshold: 5000)`);
  console.log(`Condensation would ${l1Chars >= 5000 ? 'FIRE' : 'NOT fire yet'}`);

  // Validate expected outcomes
  console.log(`\n${'='.repeat(60)}`);
  console.log('VALIDATION CHECKS');
  console.log(`${'='.repeat(60)}`);

  const emma = graph.findNodeByLabel('Emma');
  const crash = graph.findNodeByLabel('Car Crash');
  const fish = graph.findNodeByLabel('Fish');
  const hiking = graph.findNodeByLabel('Hiking');
  const market = graph.findNodeByLabel('Market');
  const cooking = graph.findNodeByLabel('Cooking');

  const checks = [
    ['Emma exists and is permanent tier', emma && emma.tier === 'permanent'],
    ['Car Crash exists and is permanent tier', crash && crash.tier === 'permanent'],
    ['Fish exists but low weight (casual mentions)', fish && fish.weight < 2.0],
    ['Hiking has grown through reinforcement', hiking && hiking.weight > 2.0],
    ['Market is ephemeral or gone (barely mentioned)', !market || market.tier === 'ephemeral'],
    ['Cooking emerged as pattern', cooking && cooking.weight > 1.0],
    ['Emma->Hiking edge exists (trip planned)', emma && hiking && !!graph.getEdgesBetween(emma.id, hiking.id)],
  ];

  let passed = 0;
  for (const [desc, result] of checks) {
    const icon = result ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${desc}`);
    if (result) passed++;
  }

  console.log(`\n${passed}/${checks.length} checks passed`);

  close();
}

simulate();
