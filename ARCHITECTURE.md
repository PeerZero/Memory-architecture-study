# Associative Memory Graph System \u2014 Architecture

## What This Is

A novel AI memory system for a conversational bot that makes the bot feel like it **genuinely knows** a person the way a close friend would \u2014 not by retrieving facts, but by inhabiting an accumulated understanding built from real interactions over time.

This is a **research prototype only.** The goal is to prove the core architecture works before scaling it.

## The Core Insight

Current memory systems inject facts as information. The LLM reads them like a briefing. This produces mechanical responses.

This system injects memory as **first-person felt language** \u2014 the same way the LLM would experience a memory it already owned. The LLM reads the portrait and inhabits it rather than processing it as new data.

## The Dual-Identity Insight

Human memory is identity-anchored. A bored history student has to read something over and over for it to stick. An interested one weaves it into their worldview — it sticks because it *matters to them*. The self-reference effect (SRE) gives a ~15-20% recall advantage when information is encoded relative to the self.

This system implements dual-identity memory: the bot builds a model of **itself** while simultaneously building a model of **the user**. Every memory node is tagged with identity relevance (`neutral`, `self`, `user`, `relational`), and identity-anchored memories get weight multipliers. The strongest memories are **relational** — things that matter because of who both parties are *to each other*.

The bot starts with no identity. It discovers who it is through interaction — what it finds interesting, how it chooses to respond, what it cares about. This self-model is not fabricated; it's distilled from real conversations.

## Four Parallel Processes

1. **Immediate Graph Splatter** \u2014 Everything lands on the graph right now. Simple nodes, weighted edges, identity relevance tags.
2. **Condensation Cascade** \u2014 Fires at threshold or daily. L1 -> L2 -> L3. Produces felt language portrait of the user.
3. **Self-Reflection** \u2014 Runs after every response (Opus). The bot reflects on what the exchange revealed about who it is. Self-observations condense into a self-portrait.
4. **Sleep Consolidation** \u2014 Fires nightly. Applies decay, promotes tiers, finds co-occurrence connections. Pure math, no LLM.

## File Structure

```
/src
  db.js         - SQLite initialization with encryption
  graph.js      - Node/edge CRUD, weight operations, ripple, L1/L2/L3 storage
  filter.js     - Real-time splatter filter (Haiku)
  salience.js   - Salience detection and spike handling (Haiku)
  condenser.js  - L1->L2->L3 condensation cascade (Sonnet/Opus)
  sleep.js      - Nightly consolidation (pure math)
  injector.js   - Builds injection string before each transaction
  bot.js        - Main conversation loop orchestrator
config.js       - All tunable parameters
index.js        - Entry point with interactive CLI
```

## Running

```bash
cp .env.example .env    # Add your ANTHROPIC_API_KEY
npm install
npm start
```

### CLI Commands
- `/graph` - Show active graph nodes
- `/portrait` - Show current L3 felt portrait (user)
- `/self` - Show current L3 self portrait (bot)
- `/stats` - Show system statistics (including identity distribution)
- `/sleep` - Run sleep consolidation manually
- `/condense` - Force condensation cycle
- `/quit` - End session and exit

## Key Design Decisions

- **Graph is source of truth** - everything lands here first
- **Shared graph, dual portraits** - bot self-knowledge and user knowledge live on the same graph (enables co-occurrence edges between identities), but condense into separate L3 portraits
- **Identity relevance multiplier** - nodes tagged `self`/`user`/`relational` get weight boosts (the "interested student" effect)
- **Self-portrait injected first** - who the bot IS shapes how it reads who the user is (identity is the lens)
- **Bot starts blank** - no pre-seeded identity; self-model emerges from real interactions
- **Opus for identity** - self-reflection and self-portrait condensation use the strongest model (shallow models produce generic "I care about people" observations)
- **Condensation enriches, does not gate** - nodes exist before condensation
- **Injection is felt language, not facts** - L3 portraits are inhabited knowing
- **Weight = time** - all weights map to survival duration
- **Decay is deletion** - zero weight = removed from graph
- **Nodes don't merge unless same entity** - strong co-occurrence = strong edge
- **INHABIT/ACT THROUGH framing** - adapted from PeerZero's ablation-tested pattern
- **Recognition preamble** - honest about statelessness, then inhabit both self and other
- **Encrypted storage** - better-sqlite3-multiple-ciphers from day one

## Research Lineage

- PeerZero condenser architecture (INHABIT/ACT THROUGH, recognition preamble, no directive preambles)
- MemGPT/Letta (CPU-cache-inspired hierarchy)
- MemOS (composable memory units, token efficiency)
- PRIME (episodic -> semantic consolidation)
- GAAMA (graph-augmented memory - validates graph structure, but static graph barely beats RAG; our dynamic decay/reinforcement is the key differentiator)
