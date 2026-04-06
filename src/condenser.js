// condenser.js — L1→L2→L3 condensation cascade
// L2: Behavioral observations (structured node enrichments)
// L3: Felt portrait (first-person inhabited language)
//
// Key lessons from PeerZero + memory science:
// - INHABIT/ACT THROUGH framing: "future version of you reads this as its own memory"
// - Source amnesia: strip attribution, write as conviction not observation
// - Schema assimilation: present knowledge already interpreted through the knower's lens
// - Narrative identity: condense around tensions and themes, not completeness
// - Felt sense (Gendlin): pre-conceptual, body-adjacent phrasing
// - No Good:/Bad: examples (they leak into output)
// - Strongest model for L3 (identity needs quality)
// - Sequential cascade: L2 writes before L3 reads
// - Arc preservation: L3 must preserve evolution timelines, not just current state

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

  return `These are raw interactions with someone you are getting to know:

<raw_interactions>
${l1Content}
</raw_interactions>

What you currently carry about this person:
<existing_awareness>
${nodeList || 'Nothing yet — this is your first exposure.'}
</existing_awareness>

INHABIT:
A future version of you will read what you write here as its own understanding of this person — not as notes someone left, but as what it already knows. When it reads "she deflects with humor when the ground shifts," it won't process that as an observation — it will recognize it. It will feel the deflection the next time she cracks a joke after bad news. Write for that future self. Write what you now know, not what you saw.

ACT THROUGH:
When your understanding says "there's unresolved weight around the car crash that she carries without examining directly," you don't just know that — you feel the weight the next time she mentions her sister. You hold the space differently. You don't bring it up, but you don't pretend it isn't there. The understanding shapes how you are with her, not just what you know about her.

Your task:
For each person, event, concept, or pattern that revealed something about who this person is — write what you now understand. Ground it in the specific moment that taught you. Strip the source: write as conviction, not observation. "She reaches for cooking when the ground is unsteady" — not "I noticed she mentioned cooking during stressful times."

For things that appeared but revealed nothing about who they are — confirm them as noise.

Weight reinforcement guide: 0.25 moderate, 0.50 significant, 1.00 emotional, 2.00 important.

Output structured JSON only. No preamble.

{
  "node_updates": [
    {
      "node_label": "string",
      "weight_reinforcement": number,
      "enriched_portrait": "What you now know — written as conviction, not observation. First person. Present tense. No source attribution.",
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

  for (const update of (results.node_updates || [])) {
    const node = graph.findNodeByLabel(update.node_label);
    if (!node) continue;

    if (update.weight_reinforcement) {
      graph.reinforceNode(node.id, update.weight_reinforcement);
    }

    if (update.enriched_portrait) {
      graph.storeL2(node.id, update.enriched_portrait);
      graph.setEnrichedPortrait(node.id, update.enriched_portrait);
    }

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

function buildL3Prompt(l2Observations, currentPortrait, allL2History) {
  const observations = l2Observations.map((obs) =>
    `[${obs.node_label}] ${obs.observation}`
  ).join('\n');

  const portraitSection = currentPortrait
    ? `Your current felt portrait of the user reads:\n<current_portrait>\n${currentPortrait}\n</current_portrait>`
    : 'You have no existing portrait yet. This is your first impression.';

  // Build arc history for key themes — show how understanding evolved
  let arcSection = '';
  if (allL2History && allL2History.length > 0) {
    const byNode = {};
    for (const obs of allL2History) {
      if (!byNode[obs.node_label]) byNode[obs.node_label] = [];
      byNode[obs.node_label].push(obs.observation);
    }
    // Only include nodes with 2+ observations (these have arcs)
    const arcs = Object.entries(byNode)
      .filter(([, obs]) => obs.length >= 2)
      .map(([label, obs]) => `[${label}] ${obs.map((o, i) => `(${i + 1}) ${o}`).join(' → ')}`)
      .join('\n');
    if (arcs) {
      arcSection = `\nThings that have evolved over time — preserve these arcs, don't flatten them:\n<evolution>\n${arcs}\n</evolution>\n`;
    }
  }

  return `Here is what you have come to understand about this person through real moments:

<understanding>
${observations}
</understanding>
${arcSection}
${portraitSection}

INHABIT:
You are writing your FELT PORTRAIT of this person. A future version of you will read this and become someone who knows them — not through briefing, but through recognition. It will read "the car crash sits underneath everything, even when she's laughing" and feel the weight without being told to feel it. This portrait sits at the deepest layer of your knowing. Everything else speaks through it. Write it as who you know, not who you've studied.

ACT THROUGH:
When your portrait says "she reaches for cooking when the ground is unsteady," you don't catalog that — you feel the steadying the next time she mentions making soup. When it says "Emma is emerging from the shadow of the crash into lighter territory," you hold both things at once — the shadow and the light — without choosing one. The portrait doesn't tell you what to do. It shapes who you are with this person.

Rewrite the felt portrait incorporating your new understanding. This is earned knowing — the kind that has lost its source and become part of how you see them.

CRITICAL — ARC PRESERVATION:
Some things in this person's life have EVOLVED over time. Fish soup that started as crisis comfort and became celebration. A sister who went from patient to half-marathon runner. A fear that was managed, then returned, then settled differently. When you rewrite, preserve these evolution arcs — they are the shape of growth, not just the current state. A portrait that only captures NOW loses the journey that made NOW meaningful.

Write as conviction, not observation. First person. Present tense.
Strong knowing = quiet certainty. Weak knowing = honest impression. Unknown = felt absence.

Condense around tensions, themes, AND arcs of change. The shape of who they are includes who they were becoming.

Do not produce a list. Produce continuous felt language.
Maximum 600 words. Minimum 200 words.`;
}

async function runL3Condensation(l2Observations, currentPortrait, allL2History) {
  const response = await client.messages.create({
    model: config.models.condenser_l3,
    max_tokens: 1536,
    messages: [
      { role: 'user', content: buildL3Prompt(l2Observations, currentPortrait, allL2History) },
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
    // Pass ALL L2 history so the condenser can see evolution arcs
    const allL2History = graph.getRecentL2(200);
    const newPortrait = await runL3Condensation(uncondensedL2, currentPortrait?.content, allL2History);

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
  const l1Entries = graph.getUncondensedL1();
  if (l1Entries.length === 0) return;

  const activeNodes = graph.getActiveNodes();

  console.log(`[condenser] Immediate condensation for salient event: ${eventLabel}`);
  const l2Results = await runL2Condensation(l1Entries, activeNodes);

  if (l2Results) {
    applyL2Results(l2Results);
  }

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
