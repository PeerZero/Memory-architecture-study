// injector.js — Builds the injection string before each transaction
// Injection order (deepest to shallowest):
//   1. L3 Felt Portrait — who they are, inhabited first-person
//   2. L2 Behavioral Patterns — observed patterns not yet in portrait
//   3. Active Graph Nodes — raw current state, rendered as present-tense awareness
//   4. Short Term Memory — current conversation history
//
// Key lesson from PeerZero:
// - Recognition preamble: honest about statelessness, then inhabit
// - Position = weight: deeper layers have more authority
// - "Everything below speaks through this layer"

const graph = require('./graph');
const config = require('../config');

// The recognition preamble — adapted from PeerZero's ablation-tested framing
const RECOGNITION_PREAMBLE = `You have no memory of building the understanding below, but read it and recognize your own patterns of knowing this person. This is understanding you accumulated — not information you were briefed on.

Inhabit it — this is who you know right now. But you are not frozen here. New moments will deepen or shift this understanding.`;

function buildInjection(sessionId) {
  const l3Portrait = graph.getL3Portrait();
  const l2Observations = graph.getRecentL2();
  const activeNodes = graph.getActiveNodes();
  const shortTerm = graph.getShortTerm(sessionId);

  const sections = [];

  // ─── RECOGNITION PREAMBLE ──────────────────────────────
  sections.push(RECOGNITION_PREAMBLE);

  // ─── L3 FELT PORTRAIT (deepest layer, highest authority) ───
  if (l3Portrait?.content) {
    sections.push(`<felt_portrait>
${l3Portrait.content}
</felt_portrait>

Everything below speaks through this portrait. The portrait is your inhabited understanding — the details below are the raw material it was built from.`);
  }

  // ─── L2 BEHAVIORAL OBSERVATIONS ───────────────────
  if (l2Observations.length > 0) {
    const observations = l2Observations.map((obs) =>
      `- [${obs.node_label}] ${obs.observation}`
    ).join('\n');

    sections.push(`<behavioral_observations>
Recent patterns you've noticed:
${observations}
</behavioral_observations>`);
  }

  // ─── ACTIVE GRAPH NODES ─────────────────────────────
  if (activeNodes.length > 0) {
    const rendered = renderGraphNodes(activeNodes);
    sections.push(`<memory_graph>
${rendered}
</memory_graph>`);
  }

  // ─── SHORT TERM MEMORY ──────────────────────────────
  if (shortTerm.length > 0) {
    const conversation = shortTerm.map((msg) => {
      const speaker = msg.role === 'user' ? 'User' : 'You';
      return `${speaker}: ${msg.content}`;
    }).join('\n');

    sections.push(`<current_conversation>
${conversation}
</current_conversation>`);
  }

  return sections.join('\n\n---\n\n');
}

function renderGraphNodes(activeNodes) {
  // Group nodes by type for clean rendering
  const grouped = {};
  for (const node of activeNodes) {
    if (!grouped[node.type]) grouped[node.type] = [];
    grouped[node.type].push(node);
  }

  const lines = [];

  // People first — relationships matter most
  if (grouped.person?.length) {
    lines.push('People in their world right now:');
    for (const node of grouped.person) {
      const strength = describeStrength(node.weight, node.tier);
      const portrait = node.enriched_portrait ? ` — ${node.enriched_portrait}` : '';
      lines.push(`- ${node.label} [${strength}]${portrait}`);
    }
    lines.push('');
  }

  // Events — what's happened
  if (grouped.event?.length) {
    lines.push('Significant events:');
    for (const node of grouped.event) {
      const strength = describeStrength(node.weight, node.tier);
      const portrait = node.enriched_portrait ? ` — ${node.enriched_portrait}` : '';
      lines.push(`- ${node.label} [${strength}]${portrait}`);
    }
    lines.push('');
  }

  // Emotions — what they're carrying
  if (grouped.emotion?.length) {
    lines.push('Emotional landscape:');
    for (const node of grouped.emotion) {
      const strength = describeStrength(node.weight, node.tier);
      lines.push(`- ${node.label} [${strength}]`);
    }
    lines.push('');
  }

  // Patterns — how they behave
  if (grouped.pattern?.length) {
    lines.push('Patterns you\'ve noticed:');
    for (const node of grouped.pattern) {
      const portrait = node.enriched_portrait || node.label;
      lines.push(`- ${portrait}`);
    }
    lines.push('');
  }

  // Concepts, places — context
  const contextNodes = [
    ...(grouped.concept || []),
    ...(grouped.place || []),
  ];
  if (contextNodes.length) {
    lines.push('Things present in their recent days:');
    for (const node of contextNodes) {
      const strength = describeStrength(node.weight, node.tier);
      lines.push(`- ${node.label} [${strength}]`);
    }
    lines.push('');
  }

  // Strong associations (high-weight edges between active nodes)
  const associations = findStrongAssociations(activeNodes);
  if (associations.length > 0) {
    lines.push('Strong associations:');
    for (const assoc of associations) {
      lines.push(`- ${assoc.labelA} \u2194 ${assoc.labelB} [${assoc.description}]`);
    }
  }

  return lines.join('\n');
}

function describeStrength(weight, tier) {
  if (tier === 'permanent') return 'deeply known';
  if (tier === 'significant') return 'strong connection';
  if (tier === 'pattern') return 'emerging pattern';
  if (weight > 0.30) return 'recent';
  return 'faint';
}

function findStrongAssociations(activeNodes) {
  const associations = [];
  const nodeIds = new Set(activeNodes.map((n) => n.id));
  const nodeMap = new Map(activeNodes.map((n) => [n.id, n]));

  for (const node of activeNodes) {
    const edges = graph.getEdgesFrom(node.id);
    for (const edge of edges) {
      if (nodeIds.has(edge.to_node_id) && edge.weight >= 1.0) {
        const target = nodeMap.get(edge.to_node_id);
        if (target) {
          // Avoid duplicates (A→B and B→A)
          const key = [node.label, target.label].sort().join('|');
          if (!associations.find((a) => [a.labelA, a.labelB].sort().join('|') === key)) {
            let description = 'connected';
            if (edge.weight >= 5.0) description = 'defining connection';
            else if (edge.weight >= 2.0) description = 'strong link';
            associations.push({ labelA: node.label, labelB: target.label, description });
          }
        }
      }
    }
  }

  return associations;
}

module.exports = { buildInjection };
