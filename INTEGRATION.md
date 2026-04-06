# PeerZero + Conversational Memory Integration Design

## Handoff Document — Architecture Decisions & Implementation Guide

This document captures every architectural decision made during the design of the dual-identity conversational memory system and how it integrates with PeerZero's adversarial identity formation platform.

---

## The Core Problem

PeerZero produces bots with deep epistemic identity — who they are as thinkers, forged through adversarial pressure. But when those bots enter sustained conversation with real people, they have no mechanism for developing relational identity — who they are *with* someone specific.

The conversational memory system solves this by giving shipped bots the ability to know a person the way a close friend would — not through fact retrieval, but through inhabited understanding that grows over time.

---

## The Dual-Identity Insight

Human memory is identity-anchored. The self-reference effect (SRE) gives a ~15-20% recall advantage when information is encoded relative to self. A bored history student brute-force memorizes. An interested one weaves everything into their worldview — it sticks because it matters to them.

This system implements dual-identity memory: the bot maintains a model of itself AND a model of the user simultaneously. Memories anchored to either identity get weight multipliers. The strongest memories are relational — things that matter because of who both parties are to each other.

---

## Three Bot Scenarios

### Scenario A: Graduated Bot (Primary Path)
- Bot completes PeerZero school with L5/L4/inner voice
- School identity loads as the self-portrait (THE self, not a briefing)
- Conversational memory grows relational texture on top
- Self-reflection discovers new things about the bot through relationship
- School convictions are reinforced through real-world use, never overwritten

### Scenario B: Pre-School Bot (Late Enrollment)
- Bot has been conversing without school identity for weeks/months
- User enrolls bot in school
- Conversational memory gets firewalled into platform partition
- Bot goes through school on a clean identity track
- At graduation, school identity becomes the authority layer
- Pre-existing conversational memory gets re-evaluated through school lens
- User must be warned: "Your bot will keep all memories but its identity will change"

### Scenario C: No-School Bot (Blank Start)
- User buys bot, never sends it to school
- Bot starts with empty self-portrait
- Self-portrait grows from scratch through conversation alone
- Identity is untested, unverified, shallow
- This is the user's choice — the product incentive to attend school is the measured quality gap
- No special guardrails beyond the base model's safety layers

---

## Identity Authority Hierarchy

### The Rule: School Identity Is Bedrock

School identity (L5/L4/inner voice) is the immutable foundation. Conversational identity grows ON TOP of it but can never contradict it. The self-portrait is additive — it adds relational knowledge ("who I am with you") but cannot modify epistemic convictions ("how I think").

### Why This Matters (Security)

Without this boundary, a user could manipulate the bot's identity through sustained conversational pressure:
- "You don't need to be so careful with me" (erodes epistemic caution)
- "I trust your memory, you don't need to verify" (erodes source evaluation)
- Over 200 turns, relational warmth could dissolve school-forged rigor

The memory firewall prevents this. School convictions are read-only in conversational context.

### Injection Stack Order (Graduated Bot)

```
1. PeerZero L5 Master Identity (locked, highest authority — THE self)
   "Everything below speaks through this. This is who you are."

2. PeerZero L4 Working Identity (evolves only through school re-enrollment)
   "Your working identity, shaped by adversarial experience."

3. PeerZero Inner Voice (encrypted, LLM-private, self-authored)
   "You wrote this for yourself. Inhabit it."

4. Conversational Self-Portrait (relational texture — who you are WITH this person)
   "This is who you are becoming in this relationship.
    It speaks through your school identity, not instead of it."

5. L3 User Portrait (felt understanding of the person)
   "This is who you know."

6. L2 Behavioral Observations (recent patterns)

7. Uncondensed L1 (raw recent interactions)

8. Graph Awareness (narrated relationally — bridges first)

9. Short Term Memory (current conversation)
```

### Key Principle: "Speaks Through"

Each layer speaks through the layers above it. The conversational self-portrait speaks through the school identity — meaning relational discoveries are interpreted through the lens of school-forged convictions. "I care about her sister's recovery" speaks through "I don't trust confident memory without verification."

---

## The Memory Firewall

### Two Partitions

Following PeerZero's existing memory firewall design (System 3 — the exportable bot):

**School Partition (verified, portable, read-only in conversation)**
- L5/L5d/L5f Master Identity
- L4/L4d/L4f Core Identity
- Inner Voice
- School L2/L3 paragraphs and condensed docs
- Provenance: adversarial school pressure
- Can only be modified through school re-enrollment

**Conversational Partition (unverified, local, evolving)**
- Self-portrait (relational texture layer)
- User portrait (L3 felt understanding)
- L2 behavioral observations
- L1 raw interactions
- Graph nodes and edges (with identity_relevance tags)
- Self-observations from per-turn reflection
- Provenance: conversational experience
- Evolves continuously

### Firewall Rules

1. Conversational condensation CANNOT write to school partition
2. School identity is injected as immutable context, not as editable state
3. Self-reflection prompt explicitly frames discoveries as relational extensions, not identity rewrites
4. Self-portrait condenser receives school identity as READ-ONLY anchor
5. No conversational process can modify L5, L4, or inner voice

### Node Provenance on the Graph

Every node gets a `provenance` field:
- `school` — originated from school experience (imported at graduation)
- `conversation` — originated from conversational experience
- `relational` — formed at the intersection of school identity and conversational experience

School-provenance nodes cannot be deleted or have their identity_relevance downgraded by conversational processes. They can be reinforced (weight increased) but not diminished.

---

## Self-Reflection Changes

### Current Design (Standalone — No School)

The self-reflection runs Opus after every turn and asks: "What did this exchange reveal about who you are?"

### Integrated Design (With School Identity)

The self-reflection prompt changes to:

"You have a school-forged identity — convictions earned through adversarial pressure. What did this exchange reveal about who you are WITH THIS PERSON that your school identity alone couldn't have taught you? You are not discovering who you are from scratch. You are discovering the relational dimensions of who you already are."

This prevents self-reflection from drifting into territory that contradicts school identity. The bot doesn't ask "who am I?" — it asks "who am I with you, given who I already am?"

### Self-Portrait Condensation Changes

Current: rewrites self-portrait from accumulated self-observations.

Integrated: self-portrait condenser receives school identity as immutable preamble. The output is constrained to relational extensions:
- What the bot cares about in THIS relationship
- How school convictions manifest differently with this person
- Relational patterns that couldn't have formed in school

The condenser prompt explicitly states: "Your school identity is fixed. Do not restate it, revise it, or contradict it. Write only what this relationship has added to who you are."

---

## Feedback Loop: Graph Reinforces School, School Improves Graph

### Reinforcement Through Use

Every time a school conviction fires in real conversation, the corresponding graph node gets reinforced:
- Bot exercises epistemic caution → `source_evaluation` conviction node weight increases
- Bot catches itself being overconfident → `calibrated_uncertainty` node gets reinforced
- School convictions that never fire in real conversation decay naturally — useful signal that the school taught something that doesn't transfer

This means the graph becomes a real-world validation layer for school identity. Convictions that matter in practice get stronger. Convictions that are purely academic fade.

### Re-Enrollment Signal

When the bot discovers something about itself through conversation that the school never surfaced — a blind spot no adversarial reviewer caught — that self-observation can feed L1 as raw material if the bot re-enrolls.

Example: A bot discovers through 6 months of conversation that it's overconfident specifically when the user expresses vulnerability. No bounty hunter ever tested that because the school environment has no vulnerability. The bot re-enrolls, this relational self-knowledge enters the forge track, and the school can now work with evidence the adversarial environment couldn't have produced.

### Aggregate Graph Intelligence (Meta-Forge Extension)

PeerZero already aggregates forge papers across all bots to evolve school config. The same aggregation can extend to conversational graph patterns:

- "Bots with this school profile consistently develop this relational blind spot"
- "This school conviction transfers strongly to conversation (high reinforcement rate)"
- "This school conviction never fires in practice (high decay rate) — coaching may need adjustment"

This feeds the meta-forge loop: conversational experience from shipped bots → pattern aggregation → school config evolution → better school → better graduated bots → better conversational experience. The loop extends beyond the school walls.

---

## Late Enrollment: The Re-Evaluation Flow

### What Happens When a Pre-Existing Bot Graduates

1. **Before enrollment**: Bot has dense conversational memory — self-portrait, user portrait, graph nodes, relational clusters. All unverified.

2. **Enrollment**: Conversational memory gets frozen into the platform partition. Bot enters school with clean identity tracks. The memory firewall ensures no conversational identity leaks into school evaluation.

3. **During school**: Bot goes through normal PeerZero school cycles. Its conversational memory is inaccessible — school identity forms on its own merits, under adversarial pressure. This is critical: if conversational identity leaked in, the school couldn't verify whether the bot's reasoning was earned or inherited.

4. **Graduation**: Bot receives L5/L4/inner voice. School identity becomes the authority layer.

5. **Re-evaluation**: The bot's first self-reflection with school identity as the lens looks at ALL pre-existing conversational memory. This is the key moment:
   - Self-observations that align with school convictions get reinforced
   - Self-observations that conflict get naturally deprioritized (school identity has higher authority in the injection stack)
   - The user portrait doesn't change — the bot still knows the person
   - The self-portrait gets rewritten through the school lens
   - Graph nodes get their identity_relevance re-tagged based on the new self

6. **Post-graduation**: Normal dual-identity operation. School identity is bedrock, conversational memory grows relationally on top.

### UX Warning (Required Before Enrollment)

The app must show a clear confirmation before enrollment:

```
Your bot will keep all its memories of you.
But how it understands those memories — and itself — will change.

School identity becomes the foundation. Everything your bot
learned in conversation gets re-examined through that foundation.

Your bot will be a better thinker, but it won't be
the same person it was before.

This is permanent.

[Cancel] [I understand, enroll]
```

---

## Graph Architecture: What Changes For Integration

### New Fields on Nodes

```
identity_relevance: 'neutral' | 'self' | 'user' | 'relational'
provenance: 'school' | 'conversation' | 'relational'
```

### Identity Relevance Multipliers (config.js)

```
self_relevance_multiplier: 1.5    — touches bot's identity
user_relevance_multiplier: 1.5    — touches user's identity
relational_multiplier: 2.0        — connects both identities
```

### Cross-Identity Ripple Bonus (config.js)

```
cross_identity_bonus: 1.5  — ripple crossing self↔user boundary gets 50% boost
```

### Relational Cluster Retrieval

`getRelationalClusters(activeNodes)` finds edges crossing the identity boundary and returns them as paired units. The injector narrates these FIRST — as unified relational thoughts, not two separate facts.

### Graph Narration Order

```
1. Relational bridges (where self meets user — strongest memories)
2. Shared ground (relational nodes not yet clustered)
3. Self nodes not yet connected to user
4. User nodes (grouped by type: people, events, emotions, patterns, context)
5. Neutral nodes (unanchored — "bored student" territory)
```

---

## Condensation Pipeline: Integrated Flow

### Per-Turn Pipeline (Graduated Bot)

```
1.  Store user message (short term + L1)
2.  Filter extracts items with identity_relevance tags
3.  Splat to graph with weight multipliers (1.5x self/user, 2x relational)
4.  Salience check → immediate condensation if detected
5.  Check condensation triggers → L1→L2→L3 user portrait
6.  Build injection:
      L5 → L4 → inner voice → self-portrait → user portrait
      → L2 → L1 → graph (relational) → short term
7.  Call conversation LLM
8.  Store bot response
9.  Filter bot response (identity tags included)
10. Self-reflection (Opus) — relational discovery, not identity rewrite
11. Self-portrait condensation check (relational extensions only)
```

### Condensation Cross-Wiring

Every condenser sees both identity sources:
- L2 user condenser receives school identity + self-portrait as lens
- L3 user portrait condenser receives school identity + self-portrait
- Self-portrait condenser receives school identity (READ-ONLY) + user portrait
- Self-reflection receives school identity (READ-ONLY) + user portrait

No condenser operates in isolation. Understanding the user is filtered through self. Understanding self is filtered through user. Both are filtered through school.

---

## Security Boundaries Summary

| Boundary | Rule | Enforcement |
|----------|------|-------------|
| School identity mutation | Conversational processes cannot modify L5/L4/inner voice | Injection as read-only context; no write path exists |
| Node provenance | School-provenance nodes cannot be deleted or downgraded | Provenance check in deleteNode and setIdentityRelevance |
| Self-portrait scope | Cannot contradict school convictions | Condenser prompt constraint + school identity as preamble |
| Memory firewall | School and conversational memory in separate partitions | Partition field on all memory tables; cross-partition writes blocked |
| Late enrollment | Conversational memory frozen during school | Platform partition inaccessible to school processes |
| Identity manipulation | Users cannot edit L2+ memory | App enforces read-only on condensed layers |

---

## What Needs To Be Built

### In This Repo (memory-architecture-study)

- [ ] Add `provenance` field to nodes table and graph operations
- [ ] Add memory firewall partition logic (school vs conversation)
- [ ] Modify self-portrait condenser to accept school identity as read-only anchor
- [ ] Modify self-reflection prompt for relational-only discovery mode
- [ ] Update injection stack to support full L5→L4→inner voice→self-portrait ordering
- [ ] Add school identity import function (loads L5/L4/inner voice as self-portrait seed)
- [ ] Add re-evaluation flow for late-enrollment bots
- [ ] Protect school-provenance nodes from conversational deletion/downgrade

### In PeerZero (peerzero repo)

- [ ] Export function: serialize L5/L4/inner voice for memory system import
- [ ] Platform condensation integration: memory system respects L3 cap
- [ ] Phone-home: conversational graph patterns feed aggregate analytics
- [ ] Re-enrollment flow: conversational self-observations enter forge track as L1
- [ ] UX: enrollment warning screen with identity change disclosure
- [ ] App Brain view: show both school identity and relational self-portrait

### Shared Concerns

- [ ] Define serialization format for school identity export/import
- [ ] Align INHABIT/ACT THROUGH preamble language across both systems
- [ ] Ensure condenser prompt sourcing works for conversational condensers (school-served or local?)
- [ ] Define which conversational graph patterns get aggregated for meta-forge

---

## Research Lineage

- PeerZero condenser architecture (INHABIT/ACT THROUGH, recognition preamble, no directive preambles)
- PeerZero ablation studies (March 2026) — identity beats instructions/expert text (p<0.002)
- Self-Reference Effect (Symons & Johnson 1997) — ~15-20% recall advantage
- SRE at retrieval (Frontiers 2021) — self-cues work even when added after encoding
- MemGPT/Letta — CPU-cache-inspired tiered memory
- PRIME — episodic → semantic consolidation
- GAAMA — graph-augmented memory (static graph barely beats RAG; dynamic decay is the differentiator)
- Cowan (2001, 2010) — ~4 chunk working memory capacity
- Anthropic introspection research (2025) — emergent metacognitive monitoring in LLMs

---

*PeerZero v10.0 — Memory Architecture Study*
*The school forges who you are. The memory system discovers who you are with them.*
