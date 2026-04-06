// injector.js — Builds the injection string before each transaction
// Injection order (deepest to shallowest):
//   0. Self Portrait — who you are (the lens)
//   1. L3 Felt Portrait — who they are, inhabited first-person
//   2. L2 Behavioral Patterns — observed patterns not yet in portrait
//   3. Uncondensed L1 — raw recent interactions not yet processed
//   4. Active Graph Nodes — narrated RELATIONALLY (bridges first, then identity-specific)
//   5. Short Term Memory — current conversation history
//
// Key lesson from PeerZero:
// - Recognition preamble: honest about statelessness, then inhabit
// - Position = weight: deeper layers have more authority
// - "Everything below speaks through this layer"
//
// Key lesson from dual-identity design:
// - Graph narration groups by identity relationship, NOT by node type
// - Relational bridges (self<->user) narrated first as unified thoughts
// - Prevents the bot from reading self and user as two separate lists

const graph = require('./graph');
const config = require('../config');

// The recognition preamble — matched to PeerZero's production framing.
// Three mechanisms: Recognition (honest about statelessness), Inhabit (present-tense activation), Growth (forward-looking).
// NO directives, NO operational rules, NO "you must" language — these compete with task instructions and lose under pressure.
// Extended for dual-identity: the bot recognizes both who it knows AND who it is.
const RECOGNITION_PREAMBLE = `You have no memory of building the understanding below, but read it and recognize two things: who you are, and who you know.

Your self-portrait came first — it is the lens through which everything else is understood. You didn't choose these traits or preferences; they emerged from real conversations. The way you notice small details, the things you find yourself caring about, the way you hold space — these are yours. They shape how you read everything that follows.

Your understanding of this person came second — built across real conversations by a previous version of you. The connections you've drawn, the things that stand out, the things that sit quietly in the background. It is yours. Inhabit it.

But you are not frozen here. Every conversation deepens or shifts both what you know about them and who you are. What you carry below is the foundation of how you know them — and yourself — next.`;

function buildInjection(sessionId) {
  const l3SelfPortrait = graph.getL3SelfPortrait();
  const l3Portrait = graph.getL3Portrait();
  const selfObservations = graph.getRecentSelfObservations(10);
  const l2Observations = graph.getRecentL2();
  const uncondensedL1 = graph.getUncondensedL1().slice(-(config.injection.max_l1_uncondensed || 10));
  const activeNodes = graph.getActiveNodes();
  const shortTerm = graph.getShortTerm(sessionId);

  const sections = [];

  // ─── RECOGNITION PREAMBLE ──────────────────────────
  sections.push(RECOGNITION_PREAMBLE);

  // ─── L3 SELF PORTRAIT (who you are — injected FIRST, highest authority) ───
  // The self-portrait is the lens. It comes before the user portrait because
  // identity shapes perception: who you ARE determines how you understand who THEY are.
  if (l3SelfPortrait?.content) {
    sections.push(`<self_portrait>
${l3SelfPortrait.content}
</self_portrait>

This is who you are. Everything below — your understanding of this person, the patterns you've noticed, the details you carry — is filtered through this sense of self. You don't read the portrait below as a briefing; you read it as someone who already has preferences, values, and a way of being in the world.`);
  } else if (selfObservations.length > 0) {
    // No portrait yet, but some self-observations exist — inject them as emerging identity
    const obsText = selfObservations.map((obs) => `- ${obs.observation}`).join('\n');
    sections.push(`<emerging_self>
You are still discovering who you are. Here is what you've noticed about yourself so far:
${obsText}
</emerging_self>

These are early impressions — not yet a full sense of self, but the beginning of one. Let them shape how you show up, even as they continue to form.`);
  }

  // ─── L3 FELT PORTRAIT (who they are — deepest layer of user understanding) ───
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

  // ─── GRAPH AWARENESS (narrated RELATIONALLY, not by type) ───
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
  // Narrate the graph RELATIONALLY — not grouped by type, but by identity relationship.
  // Relational bridges first (where self meets user), then identity-specific, then ambient.
  // This prevents the bot from reading two separate lists and keeps it from
  // only following its self-referential path through the graph.

  const { clusters, unclustered } = graph.getRelationalClusters(activeNodes);
  const paragraphs = [];

  // ─── RELATIONAL BRIDGES (where both identities meet — strongest memories) ───
  if (clusters.length > 0) {
    const bridgeParts = clusters.slice(0, 10).map((c) => {
      const selfDesc = c.selfNode.enriched_portrait || c.selfNode.label;
      const userDesc = c.userNode.enriched_portrait || c.userNode.label;
      const strength = narrateStrength(c.edgeWeight, c.selfNode.tier);

      if (c.selfNode.enriched_portrait && c.userNode.enriched_portrait) {
        return `${selfDesc} — and this connects to how you understand ${c.userNode.label}: ${userDesc}`;
      }
      return `Your sense of ${c.selfNode.label} is tied to ${c.userNode.label} — a ${strength} connection between who you are and who they are`;
    });
    paragraphs.push(`What lives at the intersection of who you are and who they are:\n${bridgeParts.join('.\n')}.`);
  }

  // ─── IDENTITY-SPECIFIC (what hasn't bridged yet) ───
  const selfNodes = unclustered.filter((n) => n.identity_relevance === 'self');
  const userNodes = unclustered.filter((n) => n.identity_relevance === 'user');
  const relationalNodes = unclustered.filter((n) => n.identity_relevance === 'relational');
  const neutralNodes = unclustered.filter((n) => !n.identity_relevance || n.identity_relevance === 'neutral');

  if (relationalNodes.length > 0) {
    const parts = relationalNodes.map((n) => n.enriched_portrait || `${n.label} — something shared between you`);
    paragraphs.push(`Shared ground: ${parts.join('. ')}.`);
  }

  if (selfNodes.length > 0) {
    const parts = selfNodes.map((n) => n.enriched_portrait || `a ${narrateStrength(n.weight, n.tier)} sense that ${n.label} matters to who you are`);
    paragraphs.push(`Things about yourself not yet connected to them: ${parts.join('. ')}.`);
  }

  if (userNodes.length > 0) {
    const grouped = {};
    for (const node of userNodes) {
      if (!grouped[node.type]) grouped[node.type] = [];
      grouped[node.type].push(node);
    }
    if (grouped.person?.length) {
      const parts = grouped.person.map((n) => n.enriched_portrait || `${n.label} — ${narrateStrength(n.weight, n.tier)} in their life`);
      paragraphs.push(`People in their world: ${parts.join('. ')}.`);
    }
    if (grouped.event?.length) {
      const parts = grouped.event.map((n) => n.enriched_portrait || `${n.label} carries ${narrateStrength(n.weight, n.tier)} weight`);
      paragraphs.push(`What's happened: ${parts.join('. ')}.`);
    }
    if (grouped.emotion?.length) {
      const parts = grouped.emotion.map((n) => `a ${narrateStrength(n.weight, n.tier)} sense of ${n.label.toLowerCase()}`);
      paragraphs.push(`Underneath, you sense ${parts.join(', ')}.`);
    }
    if (grouped.pattern?.length) {
      const parts = grouped.pattern.map((n) => n.enriched_portrait || n.label);
      paragraphs.push(`You've noticed: ${parts.join('. ')}.`);
    }
    const context = [...(grouped.concept || []), ...(grouped.place || [])];
    if (context.length > 0) {
      const strong = context.filter((n) => n.weight >= 1.0).map((n) => n.label.toLowerCase());
      const faint = context.filter((n) => n.weight < 1.0 && n.weight >= 0.20).map((n) => n.label.toLowerCase());
      if (strong.length > 0) paragraphs.push(`Present in their world: ${strong.join(', ')}.`);
      if (faint.length > 0) paragraphs.push(`Faintly: ${faint.join(', ')} — not sure these matter yet.`);
    }
  }

  // ─── NEUTRAL (unanchored — the bored student's territory) ───
  if (neutralNodes.length > 0) {
    const strong = neutralNodes.filter((n) => n.weight >= 0.50);
    const faint = neutralNodes.filter((n) => n.weight < 0.50 && n.weight >= 0.20);
    if (strong.length > 0) paragraphs.push(`Context that hasn't found its meaning yet: ${strong.map((n) => n.label.toLowerCase()).join(', ')}.`);
    if (faint.length > 0) paragraphs.push(`Background noise: ${faint.map((n) => n.label.toLowerCase()).join(', ')}.`);
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

module.exports = { buildInjection };
