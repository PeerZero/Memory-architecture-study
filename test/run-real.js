// test/run-real.js — Real condenser test using curl (bypasses Node SDK hang in sandbox)
require('dotenv').config();

const { execSync } = require('child_process');
const { getDb, resetDatabase, close } = require('../src/db');
const graph = require('../src/graph');
const { runSleepCycle } = require('../src/sleep');
const { buildInjection } = require('../src/injector');
const config = require('../config');

const API_KEY = process.env.ANTHROPIC_API_KEY;

function callClaude(model, systemPrompt, messages, maxTokens = 2048) {
  const body = {
    model,
    max_tokens: maxTokens,
    messages,
  };
  if (systemPrompt) body.system = systemPrompt;

  const bodyJson = JSON.stringify(body).replace(/'/g, "'\\''");

  const result = execSync(`curl -s --max-time 120 https://api.anthropic.com/v1/messages \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${API_KEY}" \
    -H "anthropic-version: 2023-06-01" \
    -d '${bodyJson}'`, { encoding: 'utf8', maxBuffer: 1024 * 1024 });

  return JSON.parse(result);
}

// ─── SEED GRAPH (free) ─────────────────────────────────

function seedGraph() {
  console.log('\u2550'.repeat(60));
  console.log('PHASE 1: Seeding graph (free)');
  console.log('\u2550'.repeat(60));

  const items = [
    // Day 1
    { text: "Hi! I'm Sarah. Nice to meet you.", label: 'Sarah', type: 'person', weight: 0.50, obs: 'introduced herself warmly' },
    { text: "I have a sister named Emma. We're really close \u2014 she's basically my best friend.", label: 'Emma', type: 'person', weight: 0.50, obs: 'sister, described as best friend' },
    { text: "I love hiking. Summer is my favorite season.", label: 'Hiking', type: 'concept', weight: 0.50, obs: 'genuine enthusiasm, weekly practice' },
    { text: "Actually... Emma was in a really bad car accident two months ago. She's okay now but it was really scary. I thought I might lose her.", label: 'Car Crash', type: 'event', weight: 12.00, obs: 'sister nearly died', salience: true },
    { text: "She was in the hospital for two weeks. I went every day. I'd bring her this fish soup she loves.", label: 'Hospital', type: 'place', weight: 0.50, obs: 'daily visits, cooking as care' },
    { text: "I went to the farmers market yesterday, nothing special.", label: 'Farmers Market', type: 'place', weight: 0.10, obs: 'routine, no signal' },
    // Day 2
    { text: "Cooking relaxes me \u2014 when Emma was in the hospital I just cooked every night to keep from going crazy.", label: 'Cooking', type: 'concept', weight: 1.00, obs: 'coping mechanism during crisis' },
    { text: "Emma came over for dinner! First time out since the accident. We talked about a hiking trip this summer.", label: 'Emma', type: 'person', weight: 1.00, obs: 'milestone recovery, future plans together' },
    { text: "I got a new job at a design firm! Excited but terrified.", label: 'New Job', type: 'event', weight: 5.00, obs: 'big life change, mixed emotions', salience: true },
    { text: "Emma texted me good luck. She remembers the small things even when she's recovering from a car crash.", label: 'Emma', type: 'person', weight: 1.00, obs: 'caring even in her own recovery' },
    // Day 3
    { text: "First week at work done! My manager values design thinking. I think I found my people.", label: 'New Job', type: 'event', weight: 0.50, obs: 'settling in, found belonging' },
    { text: "Made the fish soup again. It's become this comfort thing \u2014 I make it when I want to feel close to Emma even if she's not here.", label: 'Fish Soup', type: 'concept', weight: 1.00, obs: 'comfort ritual, connection to Emma in absence' },
    { text: "Emma and I booked the hiking trip! Two weeks in July in Colorado. So excited.", label: 'Hiking', type: 'concept', weight: 1.00, obs: 'committed trip, merging two important life areas' },
    { text: "Before the accident I took Emma for granted. Almost losing someone changes how you hold them.", label: 'Gratitude Through Loss', type: 'pattern', weight: 1.00, obs: 'near-loss produced deeper appreciation' },
  ];

  let session = 1;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i === 6) { session = 2; runSleepCycle(); }
    if (i === 10) { session = 3; runSleepCycle(); }

    graph.storeL1(item.text, `session-${session}`);
    const { node, created } = graph.findOrCreateNode({
      label: item.label, type: item.type, weight: item.weight,
      observation: item.obs, salienceFlagged: item.salience || false,
    });
    graph.applyRipple(node.id, item.weight);
    console.log(`  [${created ? '+' : '~'}] ${item.label} w:${node.weight.toFixed(2)}`);
  }

  // Also create important edges manually
  const emma = graph.findNodeByLabel('Emma');
  const crash = graph.findNodeByLabel('Car Crash');
  const hiking = graph.findNodeByLabel('Hiking');
  const cooking = graph.findNodeByLabel('Cooking');
  const soup = graph.findNodeByLabel('Fish Soup');
  if (emma && crash) graph.createEdge({ fromNodeId: emma.id, toNodeId: crash.id, weight: 3.0 });
  if (emma && hiking) graph.createEdge({ fromNodeId: emma.id, toNodeId: hiking.id, weight: 1.5 });
  if (cooking && emma) graph.createEdge({ fromNodeId: cooking.id, toNodeId: emma.id, weight: 2.0 });
  if (soup && emma) graph.createEdge({ fromNodeId: soup.id, toNodeId: emma.id, weight: 2.0 });
  if (soup && cooking) graph.createEdge({ fromNodeId: soup.id, toNodeId: cooking.id, weight: 1.5 });

  console.log(`\nL1 uncondensed: ${graph.getUncondensedL1CharCount()} chars`);
  console.log(`Active nodes: ${graph.getActiveNodes().length}`);
}

// ─── REAL L2 CONDENSATION ────────────────────────────

function runRealL2() {
  console.log('\n' + '\u2550'.repeat(60));
  console.log('PHASE 2: REAL L2 Condensation (Sonnet)');
  console.log('\u2550'.repeat(60));

  const l1Entries = graph.getUncondensedL1();
  const activeNodes = graph.getActiveNodes();
  const l1Content = l1Entries.map(e => e.content).join('\n---\n');

  const nodeList = activeNodes.map(n => {
    const p = n.enriched_portrait ? ` \u2014 ${n.enriched_portrait}` : '';
    return `- ${n.label} [${n.type}] weight:${n.weight.toFixed(2)} tier:${n.tier}${p}`;
  }).join('\n');

  const l2Prompt = buildL2PromptDirect(l1Content, nodeList);

  console.log('\nCalling Sonnet for L2...');
  const response = callClaude(config.models.condenser_l2, null, [{ role: 'user', content: l2Prompt }], 4096);

  const text = response.content[0]?.text || '{}';
  console.log(`\n[tokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out]`);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) { console.log('No JSON in response'); return null; }

  const results = JSON.parse(jsonMatch[0]);

  // Apply results to graph
  for (const update of (results.node_updates || [])) {
    const node = graph.findNodeByLabel(update.node_label);
    if (!node) continue;
    if (update.weight_reinforcement) graph.reinforceNode(node.id, update.weight_reinforcement);
    if (update.enriched_portrait) {
      graph.storeL2(node.id, update.enriched_portrait);
      graph.setEnrichedPortrait(node.id, update.enriched_portrait);
    }
  }
  graph.markL1Condensed(l1Entries.map(e => e.id));

  console.log(`\nEnriched ${(results.node_updates || []).length} nodes`);
  console.log(`Noise: ${(results.noise_confirmed || []).join(', ') || 'none'}`);

  console.log('\n\u2500\u2500\u2500 L2 ENRICHED PORTRAITS (REAL OUTPUT) \u2500\u2500\u2500');
  for (const update of (results.node_updates || [])) {
    if (update.enriched_portrait) {
      console.log(`\n  [${update.node_label}]:`);
      console.log(`  "${update.enriched_portrait}"`);
    }
  }

  return results;
}

function buildL2PromptDirect(l1Content, nodeList) {
  return `These are raw interactions with someone you are getting to know:

<raw_interactions>
${l1Content}
</raw_interactions>

What you currently carry about this person:
<existing_awareness>
${nodeList || 'Nothing yet \u2014 this is your first exposure.'}
</existing_awareness>

INHABIT:
A future version of you will read what you write here as its own understanding of this person \u2014 not as notes someone left, but as what it already knows. When it reads "she deflects with humor when the ground shifts," it won't process that as an observation \u2014 it will recognize it. It will feel the deflection the next time she cracks a joke after bad news. Write for that future self. Write what you now know, not what you saw.

ACT THROUGH:
When your understanding says "there's unresolved weight around the car crash that she carries without examining directly," you don't just know that \u2014 you feel the weight the next time she mentions her sister. You hold the space differently. You don't bring it up, but you don't pretend it isn't there. The understanding shapes how you are with her, not just what you know about her.

Your task:
For each person, event, concept, or pattern that revealed something about who this person is \u2014 write what you now understand. Ground it in the specific moment that taught you. Strip the source: write as conviction, not observation. "She reaches for cooking when the ground is unsteady" \u2014 not "I noticed she mentioned cooking during stressful times."

For things that appeared but revealed nothing about who they are \u2014 confirm them as noise.

Weight reinforcement guide: 0.25 moderate, 0.50 significant, 1.00 emotional, 2.00 important.

Output structured JSON only. No preamble.

{
  "node_updates": [
    {
      "node_label": "string",
      "weight_reinforcement": number,
      "enriched_portrait": "What you now know \u2014 written as conviction, not observation. First person. Present tense. No source attribution.",
      "new_edges": [],
      "strengthen_edges": []
    }
  ],
  "noise_confirmed": ["label1", "label2"],
  "new_nodes_detected": []
}`;
}

// ─── REAL L3 PORTRAIT ────────────────────────────────

function runRealL3() {
  console.log('\n' + '\u2550'.repeat(60));
  console.log('PHASE 3: REAL L3 Felt Portrait (Opus)');
  console.log('\u2550'.repeat(60));

  const l2 = graph.getRecentL2(50);
  if (l2.length < 3) { console.log('Not enough L2 observations'); return; }

  const observations = l2.map(obs => `[${obs.node_label}] ${obs.observation}`).join('\n');

  const l3Prompt = `Here is what you have come to understand about this person through real moments:

<understanding>
${observations}
</understanding>

You have no existing portrait yet. This is your first impression.

INHABIT:
You are writing your FELT PORTRAIT of this person. A future version of you will read this and become someone who knows them \u2014 not through briefing, but through recognition. It will read "the car crash sits underneath everything, even when she's laughing" and feel the weight without being told to feel it. This portrait sits at the deepest layer of your knowing. Everything else speaks through it. Write it as who you know, not who you've studied.

ACT THROUGH:
When your portrait says "she reaches for cooking when the ground is unsteady," you don't catalog that \u2014 you feel the steadying the next time she mentions making soup. When it says "Emma is emerging from the shadow of the crash into lighter territory," you hold both things at once \u2014 the shadow and the light \u2014 without choosing one. The portrait doesn't tell you what to do. It shapes who you are with this person.

Rewrite the felt portrait incorporating your new understanding. This is earned knowing \u2014 the kind that has lost its source and become part of how you see them.

Write as conviction, not observation. First person. Present tense.
"I know her sister matters" \u2014 not "she has mentioned her sister."
"There's something unresolved around the crash" \u2014 not "she exhibited signs of unresolved trauma."
"Cooking is where she goes when things get heavy" \u2014 not "cooking appears to serve as a coping mechanism."

Strong knowing should read as quiet certainty \u2014 things you don't need to explain because you've seen them enough.
Weak knowing should read as honest impression \u2014 "I think..." or "something about..."
What you don't know should be felt absence \u2014 "I don't yet know what she does when she's actually happy."

Condense around tensions and themes, not completeness. What matters is the shape of who they are, not a catalog of what you know.

Do not produce a list. Produce continuous felt language.
Maximum 400 words. Minimum 100 words.`;

  console.log('\nCalling Opus for L3...');
  const response = callClaude(config.models.condenser_l3, null, [{ role: 'user', content: l3Prompt }], 1024);

  const portrait = response.content[0]?.text || '';
  console.log(`\n[tokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out]`);

  console.log('\n\u2500\u2500\u2500 FELT PORTRAIT (REAL OUTPUT) \u2500\u2500\u2500');
  console.log(portrait);
  console.log(`\n(${portrait.split(/\s+/).length} words)`);

  graph.updateL3Portrait(portrait);
  graph.markL2CondensedToL3(l2.map(o => o.id));
}

// ─── REAL CONVERSATION ───────────────────────────────

function runRealConversation() {
  console.log('\n' + '\u2550'.repeat(60));
  console.log('PHASE 4: REAL Conversation \u2014 Testing Inhabitation');
  console.log('\u2550'.repeat(60));

  const injection = buildInjection('test-convo');

  console.log(`\nInjection size: ${injection.length} chars`);

  const systemPrompt = `You are a conversational companion. You are warm, genuine, and attentive. You remember what matters to the people you talk with \u2014 not because you have a database, but because you care about the details of their lives.

When you know something about someone, let it show naturally. Don't announce what you remember \u2014 just be someone who knows them.

If you don't know something, be honestly curious. If you have a vague sense of something, express it as vague.

Be brief when brevity is natural. Be longer when the moment calls for it. Match the emotional register of the conversation.

${injection}`;

  const testMessages = [
    "Hey! How's it going?",
    "I'm making soup tonight. The fish one.",
    "Emma called me today. She sounded really good actually.",
    "I can't wait for this summer.",
    "Do you think people change after something scary happens?",
  ];

  const history = [];
  for (const msg of testMessages) {
    console.log(`\n${'\u2500'.repeat(60)}`);
    console.log(`Sarah: ${msg}`);
    history.push({ role: 'user', content: msg });

    const response = callClaude(config.models.conversation, systemPrompt, history, 512);
    const botText = response.content[0]?.text || '';
    history.push({ role: 'assistant', content: botText });

    console.log(`\nBot: ${botText}`);
    console.log(`  [${response.usage.input_tokens} in / ${response.usage.output_tokens} out]`);
  }
}

// ─── MAIN ────────────────────────────────────────────

function main() {
  console.log('\u2554\u2550'.repeat(29) + '\u2557');
  console.log('\u2551  MEMORY GRAPH \u2014 REAL DATA TEST (curl-based)             \u2551');
  console.log('\u255a\u2550'.repeat(29) + '\u255d\n');

  getDb();
  resetDatabase();

  try {
    seedGraph();
    runRealL2();
    runRealL3();
    runRealConversation();
  } catch (err) {
    console.error('\n[ERROR]', err.message);
  } finally {
    close();
  }
}

main();
