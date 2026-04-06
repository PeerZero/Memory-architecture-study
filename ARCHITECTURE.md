# Associative Memory Graph System \u2014 Architecture

## What This Is

A novel AI memory system for a conversational bot that makes the bot feel like it **genuinely knows** a person the way a close friend would \u2014 not by retrieving facts, but by inhabiting an accumulated understanding built from real interactions over time.

This is a **research prototype only.** The goal is to prove the core architecture works before scaling it.

## The Core Insight

Current memory systems inject facts as information. The LLM reads them like a briefing. This produces mechanical responses.

This system injects memory as **first-person felt language** \u2014 the same way the LLM would experience a memory it already owned. The LLM reads the portrait and inhabits it rather than processing it as new data.

## Three Parallel Processes

1. **Immediate Graph Splatter** \u2014 Everything lands on the graph right now. Simple nodes, weighted edges.
2. **Condensation Cascade** \u2014 Fires at threshold or daily. L1 -> L2 -> L3. Produces felt language portrait.
3. **Sleep Consolidation** \u2014 Fires nightly. Applies decay, promotes tiers, finds co-occurrence connections. Pure math, no LLM.

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
- `/portrait` - Show current L3 felt portrait
- `/stats` - Show system statistics
- `/sleep` - Run sleep consolidation manually
- `/condense` - Force condensation cycle
- `/quit` - End session and exit

## Key Design Decisions

- **Graph is source of truth** - everything lands here first
- **Condensation enriches, does not gate** - nodes exist before condensation
- **Injection is felt language, not facts** - L3 portrait is inhabited knowing
- **Weight = time** - all weights map to survival duration
- **Decay is deletion** - zero weight = removed from graph
- **Nodes don't merge unless same entity** - strong co-occurrence = strong edge
- **INHABIT/ACT THROUGH framing** - adapted from PeerZero's ablation-tested pattern
- **Recognition preamble** - honest about statelessness, then inhabit
- **Strongest model for L3** - identity needs quality (Opus for felt portrait)
- **Encrypted storage** - better-sqlite3-multiple-ciphers from day one

## Research Lineage

- PeerZero condenser architecture (INHABIT/ACT THROUGH, recognition preamble, no directive preambles)
- MemGPT/Letta (CPU-cache-inspired hierarchy)
- MemOS (composable memory units, token efficiency)
- PRIME (episodic -> semantic consolidation)
- GAAMA (graph-augmented memory - validates graph structure, but static graph barely beats RAG; our dynamic decay/reinforcement is the key differentiator)
