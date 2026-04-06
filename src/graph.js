// graph.js — SQLite graph operations: CRUD for nodes/edges, weight management, ripple
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./db');
const config = require('../config');

// ─── TIER HELPERS ──────────────────────────────────────────────────────

function tierForWeight(weight) {
  const { tiers } = config;
  if (weight >= tiers.permanent.min) return 'permanent';
  if (weight >= tiers.significant.min) return 'significant';
  if (weight >= tiers.pattern.min) return 'pattern';
  return 'ephemeral';
}

function decayRateForTier(tier) {
  return config.tiers[tier]?.decay ?? config.tiers.ephemeral.decay;
}

// ─── NODE OPERATIONS ─────────────────────────────────────────────────

function createNode({ label, type, weight = config.weights.passing_mention, observation = null, salienceFlagged = false, identityRelevance = 'neutral' }) {
  const db = getDb();
  const now = Date.now();
  const tier = tierForWeight(weight);
  const id = uuidv4();
  const rawObservations = observation ? JSON.stringify([observation]) : '[]';

  db.prepare(`
    INSERT INTO nodes (id, label, type, weight, tier, decay_rate, salience_flagged, raw_observations, identity_relevance, created_at, last_reinforced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, label, type, weight, tier, decayRateForTier(tier), salienceFlagged ? 1 : 0, rawObservations, identityRelevance, now, now);

  return { id, label, type, weight, tier, identityRelevance };
}

function getNode(id) {
  return getDb().prepare('SELECT * FROM nodes WHERE id = ?').get(id);
}

function findNodeByLabel(label) {
  return getDb().prepare('SELECT * FROM nodes WHERE label = ? COLLATE NOCASE').get(label);
}

function findNodesByType(type) {
  return getDb().prepare('SELECT * FROM nodes WHERE type = ? ORDER BY weight DESC').all(type);
}

function getActiveNodes(minWeight = config.injection.min_node_weight, limit = config.injection.max_active_nodes) {
  return getDb().prepare(
    'SELECT * FROM nodes WHERE weight >= ? ORDER BY weight DESC LIMIT ?'
  ).all(minWeight, limit);
}

function getAllNodes() {
  return getDb().prepare('SELECT * FROM nodes ORDER BY weight DESC').all();
}

function reinforceNode(id, weightAdd) {
  const db = getDb();
  const now = Date.now();

  db.prepare(`
    UPDATE nodes
    SET weight = weight + ?,
        last_reinforced = ?
    WHERE id = ?
  `).run(weightAdd, now, id);

  // Recalculate tier after reinforcement
  const node = getNode(id);
  if (!node) return null;

  const newTier = tierForWeight(node.weight);
  if (newTier !== node.tier) {
    db.prepare('UPDATE nodes SET tier = ?, decay_rate = ? WHERE id = ?')
      .run(newTier, decayRateForTier(newTier), id);
  }

  return getNode(id);
}

function addObservation(id, observation) {
  const db = getDb();
  const node = getNode(id);
  if (!node) return null;

  const observations = JSON.parse(node.raw_observations || '[]');
  observations.push(observation);

  db.prepare('UPDATE nodes SET raw_observations = ? WHERE id = ?')
    .run(JSON.stringify(observations), id);

  return getNode(id);
}

function setEnrichedPortrait(id, portrait) {
  getDb().prepare('UPDATE nodes SET enriched_portrait = ? WHERE id = ?')
    .run(portrait, id);
}

function deleteNode(id) {
  const db = getDb();
  db.prepare('DELETE FROM edges WHERE from_node_id = ? OR to_node_id = ?').run(id, id);
  db.prepare('DELETE FROM l2_observations WHERE node_id = ?').run(id);
  db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
}

// ─── EDGE OPERATIONS ─────────────────────────────────────────────────

function createEdge({ fromNodeId, toNodeId, weight = 0.10, type = 'explicit' }) {
  const db = getDb();
  const now = Date.now();
  const id = uuidv4();

  const existing = db.prepare(`
    SELECT * FROM edges
    WHERE (from_node_id = ? AND to_node_id = ?) OR (from_node_id = ? AND to_node_id = ?)
  `).get(fromNodeId, toNodeId, toNodeId, fromNodeId);

  if (existing) {
    return reinforceEdge(existing.id, weight);
  }

  db.prepare(`
    INSERT INTO edges (id, from_node_id, to_node_id, weight, co_occurrence_count, type, created_at, last_reinforced)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
  `).run(id, fromNodeId, toNodeId, weight, type, now, now);

  return { id, fromNodeId, toNodeId, weight, type };
}

function getEdge(id) {
  return getDb().prepare('SELECT * FROM edges WHERE id = ?').get(id);
}

function getEdgesFrom(nodeId) {
  return getDb().prepare('SELECT * FROM edges WHERE from_node_id = ? ORDER BY weight DESC').all(nodeId);
}

function getEdgesTo(nodeId) {
  return getDb().prepare('SELECT * FROM edges WHERE to_node_id = ? ORDER BY weight DESC').all(nodeId);
}

function getEdgesBetween(nodeIdA, nodeIdB) {
  return getDb().prepare(`
    SELECT * FROM edges
    WHERE (from_node_id = ? AND to_node_id = ?) OR (from_node_id = ? AND to_node_id = ?)
  `).get(nodeIdA, nodeIdB, nodeIdB, nodeIdA);
}

function getNeighbors(nodeId) {
  const db = getDb();
  return db.prepare(`
    SELECT n.*, e.weight as edge_weight, e.type as edge_type
    FROM edges e
    JOIN nodes n ON (n.id = e.to_node_id AND e.from_node_id = ?)
                 OR (n.id = e.from_node_id AND e.to_node_id = ?)
    ORDER BY e.weight DESC
  `).all(nodeId, nodeId);
}

function reinforceEdge(id, weightAdd) {
  const db = getDb();
  const now = Date.now();

  db.prepare(`
    UPDATE edges
    SET weight = weight + ?,
        co_occurrence_count = co_occurrence_count + 1,
        last_reinforced = ?
    WHERE id = ?
  `).run(weightAdd, now, id);

  return getEdge(id);
}

function deleteEdge(id) {
  getDb().prepare('DELETE FROM edges WHERE id = ?').run(id);
}

// ─── RIPPLE ────────────────────────────────────────────────────────

function applyRipple(nodeId, originalWeight) {
  const db = getDb();
  const parentShare = originalWeight * config.ripple.parent_percentage;
  const grandparentShare = originalWeight * config.ripple.grandparent_percentage;

  if (parentShare < 0.001) return;

  const parentEdges = db.prepare(`
    SELECT * FROM edges WHERE from_node_id = ? AND type = 'explicit' ORDER BY weight DESC LIMIT 5
  `).all(nodeId);

  for (const edge of parentEdges) {
    reinforceNode(edge.to_node_id, parentShare);
    reinforceEdge(edge.id, parentShare * 0.5);

    if (grandparentShare < 0.001) continue;

    const gpEdges = db.prepare(`
      SELECT * FROM edges WHERE from_node_id = ? AND type = 'explicit' ORDER BY weight DESC LIMIT 3
    `).all(edge.to_node_id);

    for (const gpEdge of gpEdges) {
      reinforceNode(gpEdge.to_node_id, grandparentShare);
      reinforceEdge(gpEdge.id, grandparentShare * 0.5);
    }
  }
}

// ─── FIND OR CREATE ──────────────────────────────────────────────────

const VALID_TYPES = new Set(['person', 'concept', 'event', 'emotion', 'pattern', 'place']);

function setIdentityRelevance(id, relevance) {
  const valid = new Set(['neutral', 'self', 'user', 'relational']);
  if (!valid.has(relevance)) return;
  getDb().prepare('UPDATE nodes SET identity_relevance = ? WHERE id = ?').run(relevance, id);
}

function getIdentityMultiplier(identityRelevance) {
  const { identity } = config;
  switch (identityRelevance) {
    case 'self': return identity.self_relevance_multiplier;
    case 'user': return identity.user_relevance_multiplier;
    case 'relational': return identity.relational_multiplier;
    default: return 1.0;
  }
}

function findOrCreateNode({ label, type, weight, observation, salienceFlagged = false, identityRelevance = 'neutral' }) {
  const existing = findNodeByLabel(label);
  if (existing) {
    const effectiveWeight = (weight || config.weights.passing_mention) * getIdentityMultiplier(identityRelevance);
    reinforceNode(existing.id, effectiveWeight);
    if (observation) addObservation(existing.id, observation);
    // Upgrade identity relevance (neutral < self/user < relational)
    if (identityRelevance !== 'neutral' && existing.identity_relevance !== 'relational') {
      if (identityRelevance === 'relational' ||
          (existing.identity_relevance !== identityRelevance && existing.identity_relevance !== 'neutral')) {
        // Two different non-neutral relevances = relational
        setIdentityRelevance(existing.id, 'relational');
      } else if (existing.identity_relevance === 'neutral') {
        setIdentityRelevance(existing.id, identityRelevance);
      }
    }
    return { node: getNode(existing.id), created: false };
  }
  // Sanitize type — LLM may return types outside our schema
  const safeType = VALID_TYPES.has(type) ? type : 'concept';
  const effectiveWeight = (weight || config.weights.passing_mention) * getIdentityMultiplier(identityRelevance);
  const node = createNode({ label, type: safeType, weight: effectiveWeight, observation, salienceFlagged, identityRelevance });
  return { node, created: true };
}

// ─── L1 INTERACTIONS ─────────────────────────────────────────────────

function storeL1(content, sessionId) {
  const db = getDb();
  const id = uuidv4();
  const now = Date.now();
  db.prepare(`
    INSERT INTO l1_interactions (id, content, character_count, session_id, created_at, condensed)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(id, content, content.length, sessionId, now);
  return id;
}

function getUncondensedL1() {
  return getDb().prepare(
    'SELECT * FROM l1_interactions WHERE condensed = 0 ORDER BY created_at ASC'
  ).all();
}

function getUncondensedL1CharCount() {
  const row = getDb().prepare(
    'SELECT COALESCE(SUM(character_count), 0) as total FROM l1_interactions WHERE condensed = 0'
  ).get();
  return row.total;
}

function markL1Condensed(ids) {
  const db = getDb();
  const stmt = db.prepare('UPDATE l1_interactions SET condensed = 1 WHERE id = ?');
  const tx = db.transaction((idList) => {
    for (const id of idList) stmt.run(id);
  });
  tx(ids);
}

// ─── L2 OBSERVATIONS ────────────────────────────────────────────────

function storeL2(nodeId, observation) {
  const db = getDb();
  const id = uuidv4();
  const now = Date.now();
  db.prepare(`
    INSERT INTO l2_observations (id, node_id, observation, created_at, condensed_to_l3)
    VALUES (?, ?, ?, ?, 0)
  `).run(id, nodeId, observation, now);
  return id;
}

function getRecentL2(limit = config.injection.max_l2_observations) {
  return getDb().prepare(
    'SELECT l2.*, n.label as node_label FROM l2_observations l2 JOIN nodes n ON l2.node_id = n.id ORDER BY l2.created_at DESC LIMIT ?'
  ).all(limit);
}

function getUncondensedL2() {
  return getDb().prepare(
    'SELECT l2.*, n.label as node_label FROM l2_observations l2 JOIN nodes n ON l2.node_id = n.id WHERE l2.condensed_to_l3 = 0 ORDER BY l2.created_at ASC'
  ).all();
}

function markL2CondensedToL3(ids) {
  const db = getDb();
  const stmt = db.prepare('UPDATE l2_observations SET condensed_to_l3 = 1 WHERE id = ?');
  const tx = db.transaction((idList) => {
    for (const id of idList) stmt.run(id);
  });
  tx(ids);
}

// ─── L3 PORTRAIT ─────────────────────────────────────────────────────

function getL3Portrait() {
  return getDb().prepare('SELECT * FROM l3_portrait WHERE id = 1').get();
}

function updateL3Portrait(content) {
  const now = Date.now();
  const wordCount = content ? content.split(/\s+/).length : 0;
  getDb().prepare(
    'UPDATE l3_portrait SET content = ?, last_updated = ?, word_count = ? WHERE id = 1'
  ).run(content, now, wordCount);
}

// ─── L3 SELF PORTRAIT ─────────────────────────────────────────────────

function getL3SelfPortrait() {
  return getDb().prepare('SELECT * FROM l3_self_portrait WHERE id = 1').get();
}

function updateL3SelfPortrait(content) {
  const now = Date.now();
  const wordCount = content ? content.split(/\s+/).length : 0;
  getDb().prepare(
    'UPDATE l3_self_portrait SET content = ?, last_updated = ?, word_count = ? WHERE id = 1'
  ).run(content, now, wordCount);
}

// ─── L2 SELF OBSERVATIONS ──────────────────────────────────────────────

function storeSelfObservation(observation, sourceContext = null) {
  const db = getDb();
  const id = uuidv4();
  const now = Date.now();
  db.prepare(`
    INSERT INTO l2_self_observations (id, observation, source_context, created_at, condensed_to_l3)
    VALUES (?, ?, ?, ?, 0)
  `).run(id, observation, sourceContext, now);
  return id;
}

function getUncondensedSelfObservations() {
  return getDb().prepare(
    'SELECT * FROM l2_self_observations WHERE condensed_to_l3 = 0 ORDER BY created_at ASC'
  ).all();
}

function getRecentSelfObservations(limit = 20) {
  return getDb().prepare(
    'SELECT * FROM l2_self_observations ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
}

function markSelfObservationsCondensed(ids) {
  const db = getDb();
  const stmt = db.prepare('UPDATE l2_self_observations SET condensed_to_l3 = 1 WHERE id = ?');
  const tx = db.transaction((idList) => {
    for (const id of idList) stmt.run(id);
  });
  tx(ids);
}

// ─── SHORT TERM MEMORY ────────────────────────────────────────────────

function storeShortTerm(sessionId, role, content) {
  const db = getDb();
  const id = uuidv4();
  const now = Date.now();
  db.prepare(`
    INSERT INTO short_term (id, session_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, sessionId, role, content, now);
  return id;
}

function getShortTerm(sessionId, limit = config.injection.max_short_term_messages) {
  return getDb().prepare(
    'SELECT * FROM short_term WHERE session_id = ? ORDER BY created_at ASC LIMIT ?'
  ).all(sessionId, limit);
}

function clearShortTerm(sessionId) {
  getDb().prepare('DELETE FROM short_term WHERE session_id = ?').run(sessionId);
}

// ─── LOGGING ───────────────────────────────────────────────────────

function logCondensation({ type, trigger, nodesEnriched = 0, nodesNoiseConfirmed = 0 }) {
  const db = getDb();
  const id = uuidv4();
  const now = Date.now();
  db.prepare(`
    INSERT INTO condensation_log (id, type, trigger, nodes_enriched, nodes_noise_confirmed, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, type, trigger, nodesEnriched, nodesNoiseConfirmed, now);
}

function logSleep({ nodesDecayed = 0, nodesDeleted = 0, nodesPromoted = 0, edgesCreated = 0, edgesDeleted = 0 }) {
  const db = getDb();
  const id = uuidv4();
  const now = Date.now();
  db.prepare(`
    INSERT INTO sleep_log (id, nodes_decayed, nodes_deleted, nodes_promoted, edges_created, edges_deleted, ran_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, nodesDecayed, nodesDeleted, nodesPromoted, edgesCreated, edgesDeleted, now);
}

module.exports = {
  tierForWeight,
  decayRateForTier,
  createNode,
  getNode,
  findNodeByLabel,
  findNodesByType,
  getActiveNodes,
  getAllNodes,
  reinforceNode,
  addObservation,
  setEnrichedPortrait,
  setIdentityRelevance,
  getIdentityMultiplier,
  deleteNode,
  createEdge,
  getEdge,
  getEdgesFrom,
  getEdgesTo,
  getEdgesBetween,
  getNeighbors,
  reinforceEdge,
  deleteEdge,
  applyRipple,
  findOrCreateNode,
  storeL1,
  getUncondensedL1,
  getUncondensedL1CharCount,
  markL1Condensed,
  storeL2,
  getRecentL2,
  getUncondensedL2,
  markL2CondensedToL3,
  getL3Portrait,
  updateL3Portrait,
  getL3SelfPortrait,
  updateL3SelfPortrait,
  storeSelfObservation,
  getUncondensedSelfObservations,
  getRecentSelfObservations,
  markSelfObservationsCondensed,
  storeShortTerm,
  getShortTerm,
  clearShortTerm,
  logCondensation,
  logSleep,
};
