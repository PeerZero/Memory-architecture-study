// config.js — All tunable parameters for the memory graph system
// Weight = Time: every weight decision maps to survival duration

module.exports = {

  // CREATION WEIGHTS — how much weight a mention earns on first splatter
  weights: {
    passing_mention: 0.10,       // ~3 days survival
    moderate_mention: 0.25,      // ~1 week
    significant_mention: 0.50,   // ~2 weeks
    emotional_mention: 1.00,     // ~1 month
    explicit_importance: 2.00,   // ~2 months

    // Salience spikes — bypass normal flow
    salience_minor: 5.00,        // ~6 months
    salience_major: 12.00,       // ~3 years
    salience_defining: 36.00,    // ~10 years
  },

  // TIER THRESHOLDS — determines decay rate
  // Nodes promote when crossing into next tier's range
  tiers: {
    ephemeral:   { min: 0.00,  max: 0.50,     decay: 0.10 },
    pattern:     { min: 0.51,  max: 2.00,     decay: 0.05 },
    significant: { min: 2.01,  max: 8.00,     decay: 0.02 },
    permanent:   { min: 8.01,  max: Infinity,  decay: 0.01 },
  },

  // RIPPLE — weight propagation through parent edges
  ripple: {
    parent_percentage: 0.20,      // immediate parent gets 20%
    grandparent_percentage: 0.10, // grandparent gets 10%
  },

  // CO-OCCURRENCE — edges created by sleep consolidation
  co_occurrence: {
    initial_weight: 0.05,
  },

  // IDENTITY RELEVANCE — the "interested student" multiplier
  // Memories anchored to identity (self or user) get amplified
  identity: {
    self_relevance_multiplier: 1.5,       // weight boost when node touches bot's self-model
    user_relevance_multiplier: 1.5,       // weight boost when node touches user's identity
    relational_multiplier: 2.0,           // weight boost when node connects both identities
    min_self_observations_for_l3: 3,      // self-observations needed before generating self-portrait
    self_condensation_model: 'claude-sonnet-4-6', // model for self-portrait condensation
  },

  // CONDENSATION TRIGGERS
  condensation: {
    character_threshold: 5000,     // L1 chars before firing
    daily_hours: 24,               // hours between regular runs
    min_interactions_for_daily: 1,  // don't fire if nothing happened
  },

  // INJECTION — context budget
  injection: {
    max_active_nodes: 50,          // max nodes to inject
    min_node_weight: 0.05,         // below this, don't inject
    max_l2_observations: 20,       // recent L2 entries to include
    max_short_term_messages: 50,   // conversation history cap
    max_l1_uncondensed: 10,        // recent uncondensed L1 entries to include
  },

  // MODELS — route by task cost/quality
  models: {
    filter: 'claude-haiku-4-5-20251001',    // fast, cheap — real-time filter
    salience: 'claude-haiku-4-5-20251001',  // fast — salience check
    condenser_l2: 'claude-sonnet-4-6',      // quality — behavioral observations
    condenser_l3: 'claude-opus-4-6',        // strongest — felt portrait (PeerZero lesson: identity needs the best model)
    conversation: 'claude-sonnet-4-6',      // main conversation model
  },

  // DATABASE
  db: {
    path: './db/graph.db',
    encryption: true,              // use better-sqlite3-multiple-ciphers
  },

  // SLEEP CONSOLIDATION
  sleep: {
    cron_schedule: '0 3 * * *',    // 3 AM daily
    redundancy_pruning: true,
    merge_detection: true,         // flag potential merges (don't auto-merge)
  },
};
