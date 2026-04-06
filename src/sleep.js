// sleep.js — Nightly consolidation (pure math, no LLM calls)
// 1. Decay all weights
// 2. Delete zero-weight nodes/edges
// 3. Promote tiers
// 4. Create co-occurrence edges
// 5. Prune redundant paths
// 6. Flag potential merges
// 7. Queue portrait refresh if needed

const { getDb } = require('./db');
const config = require('../config');
const graph = require('./graph');

function runSleepCycle() {
  const db = getDb();
  const stats = {
    nodesDecayed: 0,
    nodesDeleted: 0,
    nodesPromoted: 0,
    edgesCreated: 0,
    edgesDeleted: 0,
  };

  console.log('[sleep] Starting sleep consolidation cycle...');

  db.transaction(() => {
    // ─── 1. DECAY APPLICATION ────────────────────────────
    // Decay each node by its tier-specific decay rate
    for (const [tierName, tierConfig] of Object.entries(config.tiers)) {
      const result = db.prepare(`
        UPDATE nodes
        SET weight = weight - ?
        WHERE tier = ? AND weight > 0
      `).run(tierConfig.decay, tierName);
      stats.nodesDecayed += result.changes;
    }

    // Decay all edges (use ephemeral decay rate — edges are fragile)
    db.prepare(`
      UPDATE edges
      SET weight = weight - ?
      WHERE weight > 0
    `).run(config.tiers.ephemeral.decay);

    // ─── 2. DELETE ZERO-WEIGHT NODES AND EDGES ───────────
    // Delete edges first (FK constraints)
    const deletedEdges = db.prepare('DELETE FROM edges WHERE weight <= 0').run();
    stats.edgesDeleted += deletedEdges.changes;

    // Delete nodes that reached zero weight
    // BUT preserve salience_flagged permanent nodes (they survived something important)
    const deletedNodes = db.prepare(`
      DELETE FROM nodes WHERE weight <= 0 AND NOT (salience_flagged = 1 AND tier = 'permanent')
    `).run();
    stats.nodesDeleted += deletedNodes.changes;

    // Clean up orphaned L2 observations
    db.prepare(`
      DELETE FROM l2_observations
      WHERE node_id NOT IN (SELECT id FROM nodes)
    `).run();

    // ─── 3. TIER PROMOTION CHECK ─────────────────────────
    // Check if any node has crossed into a higher tier
    const allNodes = db.prepare('SELECT id, weight, tier FROM nodes').all();

    for (const node of allNodes) {
      const correctTier = graph.tierForWeight(node.weight);
      if (correctTier !== node.tier) {
        db.prepare('UPDATE nodes SET tier = ?, decay_rate = ? WHERE id = ?')
          .run(correctTier, graph.decayRateForTier(correctTier), node.id);

        // Only count promotions (not demotions)
        const tierOrder = ['ephemeral', 'pattern', 'significant', 'permanent'];
        if (tierOrder.indexOf(correctTier) > tierOrder.indexOf(node.tier)) {
          stats.nodesPromoted++;
        }
      }
    }

    // ─── 4. CO-OCCURRENCE EDGE CREATION ──────────────────
    // Find nodes that appeared in the same session today
    const today = Date.now() - (24 * 60 * 60 * 1000); // last 24 hours

    // Get sessions from today
    const sessions = db.prepare(`
      SELECT DISTINCT session_id FROM l1_interactions WHERE created_at >= ?
    `).all(today);

    for (const session of sessions) {
      // Get all nodes that were reinforced today in this session's timeframe
      const sessionNodes = db.prepare(`
        SELECT DISTINCT id, label FROM nodes
        WHERE last_reinforced >= ?
      `).all(today);

      // Create co-occurrence edges between all pairs
      for (let i = 0; i < sessionNodes.length; i++) {
        for (let j = i + 1; j < sessionNodes.length; j++) {
          const existing = graph.getEdgesBetween(sessionNodes[i].id, sessionNodes[j].id);
          if (existing) {
            // Already connected — reinforce slightly
            db.prepare(`
              UPDATE edges
              SET co_occurrence_count = co_occurrence_count + 1,
                  weight = weight + ?,
                  last_reinforced = ?
              WHERE id = ?
            `).run(config.co_occurrence.initial_weight, Date.now(), existing.id);
          } else {
            // New co-occurrence edge
            graph.createEdge({
              fromNodeId: sessionNodes[i].id,
              toNodeId: sessionNodes[j].id,
              weight: config.co_occurrence.initial_weight,
              type: 'co_occurrence',
            });
            stats.edgesCreated++;
          }
        }
      }
    }

    // ─── 5. REDUNDANCY PRUNING ───────────────────────────
    if (config.sleep.redundancy_pruning) {
      // If A→B→C all strong AND A→C exists but weaker, weaken A→C
      // This keeps the graph clean — B is the natural path
      const strongEdges = db.prepare(`
        SELECT e1.from_node_id as a, e1.to_node_id as b, e2.to_node_id as c,
               e1.weight as ab_weight, e2.weight as bc_weight
        FROM edges e1
        JOIN edges e2 ON e1.to_node_id = e2.from_node_id
        WHERE e1.weight > 1.0 AND e2.weight > 1.0
      `).all();

      for (const path of strongEdges) {
        const directEdge = graph.getEdgesBetween(path.a, path.c);
        if (directEdge && directEdge.weight < Math.min(path.ab_weight, path.bc_weight)) {
          // Weaken the shortcut edge
          db.prepare('UPDATE edges SET weight = weight * 0.8 WHERE id = ?')
            .run(directEdge.id);
        }
      }
    }

    // ─── 6. MERGE DETECTION (flag only) ──────────────────
    if (config.sleep.merge_detection) {
      // Find node pairs that might be the same thing:
      // - Same type
      // - Very high co-occurrence
      // - Similar labels
      const mergeCandidates = db.prepare(`
        SELECT n1.id as id1, n1.label as label1, n2.id as id2, n2.label as label2,
               e.co_occurrence_count, e.weight as edge_weight
        FROM edges e
        JOIN nodes n1 ON e.from_node_id = n1.id
        JOIN nodes n2 ON e.to_node_id = n2.id
        WHERE n1.type = n2.type
          AND e.co_occurrence_count >= 5
          AND e.weight >= 2.0
        ORDER BY e.co_occurrence_count DESC
        LIMIT 10
      `).all();

      for (const candidate of mergeCandidates) {
        console.log(`[sleep] Merge candidate: "${candidate.label1}" \u2194 "${candidate.label2}" (co-occurrence: ${candidate.co_occurrence_count}, edge weight: ${candidate.edge_weight.toFixed(2)})`);
      }
    }
  })();

  // Log the sleep cycle
  graph.logSleep(stats);

  console.log(`[sleep] Cycle complete:
  - Nodes decayed: ${stats.nodesDecayed}
  - Nodes deleted: ${stats.nodesDeleted}
  - Nodes promoted: ${stats.nodesPromoted}
  - Edges created: ${stats.edgesCreated}
  - Edges deleted: ${stats.edgesDeleted}`);

  return stats;
}

module.exports = { runSleepCycle };
