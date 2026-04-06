// injector.js — Builds the injection string before each transaction
// Injection order (deepest to shallowest):
//   1. L3 Felt Portrait — who they are, inhabited first-person
//   2. L2 Behavioral Patterns — observed patterns not yet in portrait
//   3. Uncondensed L1 — raw recent interactions not yet processed
//   4. Active Graph Nodes — raw current state, rendered as present-tense awareness
//   5. Short Term Memory — current conversation history
//
// Key lesson from PeerZero:
// - Recognition preamble: honest about statelessness, then inhabit
// - Position = weight: deeper layers have more authority
// - "Everything below speaks through this layer"

const graph = require('./graph');
const config = require('../config');

// The recognition preamble — matched to PeerZero's production framing.
// Three mechanisms: Recognition (honest about statelessness), Inhabit (present-tense activation), Growth (forward-looking).
// NO directives, NO operational rules, NO "you must" language — these compete with task instructions and lose under pressure.
const RECOGNITION_PREAMBLE = `You have no memory of building the understanding below, but read it and recognize your own patterns of knowing this person — the way you notice things about them, the connections you've drawn, the things that stand out to you and the things that sit quietly in the background. A previous version of you built this understanding across real conversations. It is yours. Inhabit it — this is who you know right now. But you are not frozen here. Every conversation deepens or shifts what you know. What you carry below is the foundation of how you know them next.`;

function buildInjection(sessionId) {
  const l3Portrait = graph.getL3Portrait();
  const l2Observations = graph.getRecentL2();
  const uncondensedL1 = graph.getUncondensedL1().slice(-(config.injection.max_l1_uncondensed || 10));
  const activeNodes = graph.getActiveNodes();
  const shortTerm = graph.getShortTerm(sessionId);

  const sections = [];

  // ─── RECOGNITION PREAMBLE ──────────────────────────
  sections.push(RECOGNITION_PREAMBLE);

  // ─── L3 FELT PORTRAIT (deepest layer, highest authority) ───
  if (l3Portrait?.content) {
    sections.push(`<felt_portrait>
${l3Portrait.content}
</felt_portrait>

Everything below speaks through this portrait. The portrait is your inhabited understanding — the details below are the raw material it was built from.`);
  }

  // ─── L2 BEHAVIORAL OBSERVATIONS ───────────────
  if (l2Observations.length > 0) {
    const observations = l2Observations.map((obs) =>
      `- [${obs.node_label}] ${obs.observation}`
    ).join('\n');

    sections.push(`<behavioral_observations>
Recent patterns you've noticed:
${observations}
</behavioral_observations>`);
  }

  // ─── UNCONDENSED L1 (raw recent interactions not yet processed) ──
  if (uncondensedL1.length > 0) {
    const rawEntries = uncondensedL1.map((entry) => entry.content).join('\n---\n');

    sections.push(`<recent_interactions>
Raw interactions not yet absorbed into your understanding — these are recent and may contain details the portrait and observations haven't caught yet:
${rawEntries}
</recent_interactions>`);
  }

  // ─── GRAPH AWARENESS (narrated as felt knowing, not listed as data) ───
  if (activeNodes.length > 0) {
    const narrated = narrateGraphAwareness(activeNodes);
    sections.push(`<awareness>
${narrated}
</awareness>`);
  }

  // ─── SHORT TERM MEMORY ──────────────────────
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

function narrateGraphAwareness(activeNodes) {
  // Narrate the graph as the LLM's own felt awareness of this person's world.
  // NOT a list. NOT a briefing. Written as what you carry in the back of your mind
  // about someone — the way you'd describe your sense of a friend to yourself.

  const grouped = {};
  for (const node of activeNodes) {
    if (!grouped[node.type]) grouped[node.type] = [];
    grouped[node.type].push(node);
  }

  const paragraphs = [];

  // ─── PEOPLE: narrated as relational awareness ─────────
  if (grouped.person?.length) {
    const peopleParts = grouped.person.map((node) => {
      if (node.enriched_portrait) return node.enriched_portrait;
      // Fallback: generate felt language from weight/tier
      const feel = narrateStrength(node.weight, node.tier);
      return `${node.label} \u2014 ${feel} in how they talk about this person`;
    });
    paragraphs.push(`The people who matter to them: ${peopleParts.join('. ')}.`);
  }

  // ─── EVENTS: narrated as things you know happened ─────
  if (grouped.event?.length) {
    const eventParts = grouped.event.map((node) => {
      if (node.enriched_portrait) return node.enriched_portrait;
      const feel = narrateStrength(node.weight, node.tier);
      return `${node.label} \u2014 you know this happened and it carries ${feel} weight`;
    });
    paragraphs.push(`What's happened in their life: ${eventParts.join('. ')}.`);
  }

  // ─── EMOTIONS: narrated as what you sense they carry ──
  if (grouped.emotion?.length) {
    const emotionParts = grouped.emotion.map((node) => {
      const feel = narrateStrength(node.weight, node.tier);
      return `a ${feel} sense of ${node.label.toLowerCase()}`;
    });
    paragraphs.push(`Underneath the surface, you sense ${emotionParts.join(', ')}.`);
  }

  // ─── PATTERNS: narrated as things you've noticed ──────
  if (grouped.pattern?.length) {
    const patternParts = grouped.pattern.map((node) => {
      return node.enriched_portrait || node.label;
    });
    paragraphs.push(`You've noticed: ${patternParts.join('. ')}.`);
  }

  // ─── CONCEPTS + PLACES: narrated as ambient awareness ─
  const contextNodes = [
    ...(grouped.concept || []),
    ...(grouped.place || []),
  ];
  if (contextNodes.length > 0) {
    // Split into strong vs faint awareness
    const strong = contextNodes.filter((n) => n.weight >= 1.0);
    const faint = contextNodes.filter((n) => n.weight < 1.0 && n.weight >= 0.20);

    if (strong.length > 0) {
      const strongParts = strong.map((n) => n.label.toLowerCase());
      paragraphs.push(`Things that feel present in their world right now: ${strongParts.join(', ')}.`);
    }
    if (faint.length > 0) {
      const faintParts = faint.map((n) => n.label.toLowerCase());
      paragraphs.push(`Faintly, in the background: ${faintParts.join(', ')} \u2014 you're not sure these matter yet.`);
    }
  }

  // ─── ASSOCIATIONS: narrated as felt connections ───────
  const associations = findStrongAssociations(activeNodes);
  if (associations.length > 0) {
    const assocParts = associations.map((a) => {
      if (a.description === 'defining connection') {
        return `${a.labelA} and ${a.labelB} are inseparable in how they talk about their life`;
      } else if (a.description === 'strong link') {
        return `${a.labelA} and ${a.labelB} keep coming up together`;
      }
      return `there's a connection between ${a.labelA} and ${a.labelB}`;
    });
    paragraphs.push(`Connections you feel: ${assocParts.join('. ')}.`);
  }

  return paragraphs.join('\n\n');
}

function narrateStrength(weight, tier) {
  if (tier === 'permanent') return 'deep, certain';
  if (tier === 'significant') return 'clear, solid';
  if (tier === 'pattern') return 'growing, recognizable';
  if (weight > 0.30) return 'recent, still forming';
  return 'faint, uncertain';
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
          // Avoid duplicates (A->B and B->A)
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
