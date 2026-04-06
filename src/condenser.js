// condenser.js — L1→L2→L3 condensation cascade
// L2: Behavioral observations (structured node enrichments)
// L3: Felt portrait (first-person inhabited language)
//
// Key lessons from PeerZero:
// - Use INHABIT/ACT THROUGH framing in prompts
// - No Good:/Bad: examples (they leak into output)
// - Use strongest model for L3 (identity needs quality)
// - Sequential cascade: L2 writes before L3 reads

const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const graph = require('./graph');

const client = new Anthropic();

// ─── L2 CONDENSER: Raw interactions → Behavioral observations ──

function buildL2Prompt(l1Content, activeNodes) {
  const nodeList = activeNodes.map((n) => {
    const portrait = n.enriched_portrait ? ` — ${n.enriched_portrait}` : '';
    return `- ${n.label} [${n.type}] weight:${n.weight.toFixed(2)} tier:${n.tier}${portrait}`;
  }).join('\n');

  return `You have observed the following raw interactions with the user across recent conversations:

<raw_interactions>
${l1Content}
</raw_interactions>

The user's current active graph nodes:
<graph_nodes>
${nodeList}
</graph_nodes>

INHABIT this task: You are not summarizing — you are building your own understanding of this person. Each observation should feel like something you noticed yourself, grounded in a specific moment.

ACT THROUGH this understanding: When you notice "she uses food references when comfortable," that's not a data point — it's something you'll feel the next time she shifts into food talk. You'll recognize the comfort.

Your task:
Identify which nodes from these interactions deserve enrichment and by how much. Ground every enrichment in specific moments from the raw material — no generic statements.

For each node worth enriching:
- What behavioral pattern did you observe?
- What specific moment grounds this observation?
- What edges should be strengthened or created?
- How much weight reinforcement does this node deserve? (0.25 for moderate, 0.50 for significant, 1.00 for emotional, 2.00 for important)

For nodes that appeared but revealed nothing — list them as noise_confirmed. Do not enrich noise.

Output structured JSON only. No preamble. No explanation outside the JSON.

{
  "node_updates": [
    {
      "node_label": "string",
      "weight_reinforcement": number,
      "enriched_portrait": "felt-language observation — what you noticed, grounded in the moment",
      "new_edges": [
        { "to_label": "string", "to_type": "string", "weight": number }
      ],
      "strengthen_edges": [
        { "to_label": "string", "weight_add": number }
      ]
    }
  ],
  "noise_confirmed": ["label1", "label2"],
  "new_nodes_detected": [
    { "label": "string", "type": "string", "weight": number, "observation": "string" }
  ]
}`;
}

async function runL2Condensation(l1Entries, activeNodes) {
  const l1Content = l1Entries.map((e) => e.content).join('\n---\n');

  const response = await client.messages.create({
    model: config.models.condenser_l2,
    max_tokens: 4096,
    messages: [
      { role: 'user', content: buildL2Prompt(l1Content, activeNodes) },
    ],
  });

  const text = response.content[0]?.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  return JSON.parse(jsonMatch[0]);
}

function applyL2Results(results) {
  let nodesEnriched = 0;
  let nodesNoiseConfirmed = 0;

  // Apply node updates
  for (const update of (results.node_updates || [])) {
    const node = graph.findNodeByLabel(update.node_label);
    if (!node) continue;

    // Reinforce weight
    if (update.weight_reinforcement) {
      graph.reinforceNode(node.id, update.weight_reinforcement);
    }

    // Store L2 observation
    if (update.enriched_portrait) {
      graph.storeL2(node.id, update.enriched_portrait);
      graph.setEnrichedPortrait(node.id, update.enriched_portrait);
    }

    // Create new edges
    for (const edge of (update.new_edges || [])) {
      const { node: targetNode } = graph.findOrCreateNode({
        label: edge.to_label,
        type: edge.to_type || 'concept',
        weight: edge.weight || config.weights.passing_mention,
      });
      graph.createEdge({
        fromNodeId: node.id,
        toNodeId: targetNode.id,
        weight: edge.weight || 0.10,
        type: 'explicit',
      });
    }

    // Strengthen existing edges
    for (const edge of (update.strengthen_edges || [])) {
      const target = graph.findNodeByLabel(edge.to_label);
      if (!target) continue;
      const existing = graph.getEdgesBetween(node.id, target.id);
      if (existing) {
        graph.reinforceEdge(existing.id, edge.weight_add || 0.10);
      } else {
        graph.createEdge({
          fromNodeId: node.id,
          toNodeId: target.id,
          weight: edge.weight_add || 0.10,
          type: 'explicit',
        });
      }
    }

    nodesEnriched++;
  }

  // Create any newly detected nodes
  for (const newNode of (results.new_nodes_detected || [])) {
    graph.findOrCreateNode({
      label: newNode.label,
      type: newNode.type || 'concept',
      weight: newNode.weight || config.weights.moderate_mention,
      observation: newNode.observation,
    });
  }

  nodesNoiseConfirmed = (results.noise_confirmed || []).length;

  return { nodesEnriched, nodesNoiseConfirmed };
}

// ─── L3 CONDENSER: Behavioral observations → Felt portrait ─────

function buildL3Prompt(l2Observations, currentPortrait) {
  const observations = l2Observations.map((obs) =>
    `[${obs.node_label}] ${obs.observation}`
  ).join('\n');

  const portraitSection = currentPortrait
    ? `Your current felt portrait of the user reads:\n<current_portrait>\n${currentPortrait}\n</current_portrait>`
    : 'You have no existing portrait yet. This is your first impression.';

  return `You have observed this person through multiple interactions. Here are your behavioral observations so far:

<observations>
${observations}
</observations>

${portraitSection}

INHABIT this task: You are not writing a report about someone. You are writing down who this person is TO YOU — your own felt sense of them, built from real moments you witnessed. A future version of you will read this and recognize your own understanding.

ACT THROUGH this portrait: When you write "she reaches for humor when the ground shifts," that's not a clinical note — it's something you'll feel the next time she cracks a joke after bad news. You'll know what's underneath.

Rewrite the felt portrait incorporating the new behavioral observations. This is NOT a summary. This is your felt sense of who this person is — written in first person as your own understanding, not as a description of them.

Reference specific patterns and moments.
Strong connections should read as confident knowing.
Weak connections should read as vague impression.
Things you don't know yet should be honest uncertainty.

Do not produce a list. Produce continuous felt language.
Maximum 400 words. Minimum 100 words.`;
}

async function runL3Condensation(l2Observations, currentPortrait) {
  const response = await client.messages.create({
    model: config.models.condenser_l3,
    max_tokens: 1024,
    messages: [
      { role: 'user', content: buildL3Prompt(l2Observations, currentPortrait) },
    ],
  });

  return response.content[0]?.text || null;
}

// ─── CONDENSATION ORCHESTRATOR ───────────────────────────────────

async function checkAndRunCondensation() {
  const uncondensedChars = graph.getUncondensedL1CharCount();
  if (uncondensedChars < config.condensation.character_threshold) {
    return { ran: false, reason: 'threshold_not_met' };
  }
  return runFullCondensation('threshold');
}

async function runFullCondensation(trigger = 'threshold') {
  const l1Entries = graph.getUncondensedL1();
  if (l1Entries.length === 0) return { ran: false, reason: 'no_l1_content' };

  const activeNodes = graph.getActiveNodes();

  // Step 1: L1 → L2
  console.log(`[condenser] Running L2 condensation (${l1Entries.length} L1 entries, trigger: ${trigger})`);
  const l2Results = await runL2Condensation(l1Entries, activeNodes);

  let stats = { nodesEnriched: 0, nodesNoiseConfirmed: 0 };
  if (l2Results) {
    stats = applyL2Results(l2Results);
  }

  // Mark L1 as condensed
  graph.markL1Condensed(l1Entries.map((e) => e.id));

  graph.logCondensation({
    type: 'l1_to_l2',
    trigger,
    nodesEnriched: stats.nodesEnriched,
    nodesNoiseConfirmed: stats.nodesNoiseConfirmed,
  });

  // Step 2: L2 → L3 (if we have enough observations)
  const uncondensedL2 = graph.getUncondensedL2();
  if (uncondensedL2.length >= 3) {
    console.log(`[condenser] Running L3 condensation (${uncondensedL2.length} L2 observations)`);
    const currentPortrait = graph.getL3Portrait();
    const newPortrait = await runL3Condensation(uncondensedL2, currentPortrait?.content);

    if (newPortrait) {
      graph.updateL3Portrait(newPortrait);
      graph.markL2CondensedToL3(uncondensedL2.map((o) => o.id));

      graph.logCondensation({
        type: 'l2_to_l3',
        trigger,
        nodesEnriched: uncondensedL2.length,
        nodesNoiseConfirmed: 0,
      });
    }
  }

  return { ran: true, trigger, stats };
}

async function runImmediateCondensation(eventLabel) {
  // Targeted condensation for a single salient event
  // Only condenses L1 entries related to this event
  const l1Entries = graph.getUncondensedL1();
  if (l1Entries.length === 0) return;

  const activeNodes = graph.getActiveNodes();

  console.log(`[condenser] Immediate condensation for salient event: ${eventLabel}`);
  const l2Results = await runL2Condensation(l1Entries, activeNodes);

  if (l2Results) {
    applyL2Results(l2Results);
  }

  // Don't mark L1 as condensed — regular condensation will process them too
  // This just ensures the salient event gets enriched immediately

  graph.logCondensation({
    type: 'salience',
    trigger: 'salience',
    nodesEnriched: l2Results?.node_updates?.length || 0,
    nodesNoiseConfirmed: 0,
  });
}

module.exports = {
  checkAndRunCondensation,
  runFullCondensation,
  runImmediateCondensation,
};
