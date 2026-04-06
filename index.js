// index.js — Entry point for the memory graph prototype
// Runs an interactive conversation loop in the terminal
// Also schedules nightly sleep consolidation via cron

require('dotenv').config();

const readline = require('readline');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const config = require('./config');
const { getDb, close } = require('./src/db');
const { handleMessage, endSession } = require('./src/bot');
const { runSleepCycle } = require('./src/sleep');
const graph = require('./src/graph');

// ─── INITIALIZE ──────────────────────────────────────────────

// Ensure API key is set
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

// Initialize database
getDb();
console.log('Database initialized.');

// Generate session ID
const sessionId = uuidv4();
console.log(`Session: ${sessionId}\n`);

// ─── SCHEDULE SLEEP CONSOLIDATION ────────────────────────────

const sleepJob = cron.schedule(config.sleep.cron_schedule, () => {
  console.log('\n[cron] Running sleep consolidation...');
  try {
    runSleepCycle();
  } catch (err) {
    console.error('[cron] Sleep cycle error:', err.message);
  }
}, { scheduled: true });

// ─── INTERACTIVE CONVERSATION LOOP ───────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('Memory Graph Prototype \u2014 Associative Memory System');
console.log('\u2500'.repeat(50));
console.log('Commands:');
console.log('  /graph     \u2014 Show active graph nodes');
console.log('  /portrait  \u2014 Show current L3 felt portrait');
console.log('  /self      \u2014 Show current L3 self portrait');
console.log('  /stats     \u2014 Show system stats');
console.log('  /sleep     \u2014 Run sleep consolidation manually');
console.log('  /condense  \u2014 Force condensation cycle');
console.log('  /quit      \u2014 End session and exit');
console.log('\u2500'.repeat(50));
console.log('');

function prompt() {
  rl.question('You: ', async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return prompt();

    // Handle commands
    if (trimmed.startsWith('/')) {
      await handleCommand(trimmed);
      return prompt();
    }

    try {
      const response = await handleMessage(trimmed, sessionId);
      console.log(`\nBot: ${response}\n`);
    } catch (err) {
      console.error(`\n[error] ${err.message}\n`);
    }

    prompt();
  });
}

async function handleCommand(cmd) {
  const command = cmd.toLowerCase().split(' ')[0];

  switch (command) {
    case '/graph': {
      const nodes = graph.getActiveNodes();
      if (nodes.length === 0) {
        console.log('\n[graph] No active nodes yet.\n');
        break;
      }
      console.log(`\n[graph] Active nodes (${nodes.length}):`);
      for (const node of nodes) {
        const edges = graph.getEdgesFrom(node.id);
        const edgeCount = edges.length + graph.getEdgesTo(node.id).length;
        const portrait = node.enriched_portrait ? ` \u2014 ${node.enriched_portrait.substring(0, 80)}...` : '';
        console.log(`  ${node.label} [${node.type}] weight:${node.weight.toFixed(2)} tier:${node.tier} edges:${edgeCount}${portrait}`);
      }
      console.log('');
      break;
    }

    case '/portrait': {
      const portrait = graph.getL3Portrait();
      if (!portrait?.content) {
        console.log('\n[portrait] No felt portrait yet. Need more interactions for L3 condensation.\n');
      } else {
        console.log(`\n[portrait] Felt Portrait (${portrait.word_count} words, updated ${new Date(portrait.last_updated).toLocaleString()}):\n`);
        console.log(portrait.content);
        console.log('');
      }
      break;
    }

    case '/self': {
      const selfPortrait = graph.getL3SelfPortrait();
      if (!selfPortrait?.content) {
        const selfObs = graph.getRecentSelfObservations(10);
        if (selfObs.length === 0) {
          console.log('\n[self] No self-portrait yet. The bot hasn\'t discovered who it is yet.\n');
        } else {
          console.log(`\n[self] No self-portrait yet, but ${selfObs.length} self-observations forming:`);
          for (const obs of selfObs) {
            console.log(`  - ${obs.observation}`);
          }
          console.log('');
        }
      } else {
        console.log(`\n[self] Self Portrait (${selfPortrait.word_count} words, updated ${new Date(selfPortrait.last_updated).toLocaleString()}):\n`);
        console.log(selfPortrait.content);
        console.log('');
      }
      break;
    }

    case '/stats': {
      const nodes = graph.getAllNodes();
      const portrait = graph.getL3Portrait();
      const selfPortrait = graph.getL3SelfPortrait();
      const selfObs = graph.getRecentSelfObservations(1000);
      const l1Count = graph.getUncondensedL1CharCount();
      const l2 = graph.getRecentL2(1000);

      // Count identity relevance distribution
      const idCounts = { neutral: 0, self: 0, user: 0, relational: 0 };
      for (const n of nodes) idCounts[n.identity_relevance || 'neutral']++;

      console.log('\n[stats] System Statistics:');
      console.log(`  Nodes: ${nodes.length}`);
      console.log(`  Tiers: ${countTiers(nodes)}`);
      console.log(`  Identity: neutral:${idCounts.neutral} self:${idCounts.self} user:${idCounts.user} relational:${idCounts.relational}`);
      console.log(`  L1 uncondensed: ${l1Count} chars`);
      console.log(`  L2 observations: ${l2.length}`);
      console.log(`  L3 user portrait: ${portrait?.content ? `${portrait.word_count} words` : 'not yet generated'}`);
      console.log(`  Self observations: ${selfObs.length}`);
      console.log(`  L3 self portrait: ${selfPortrait?.content ? `${selfPortrait.word_count} words` : 'not yet generated'}`);
      console.log('');
      break;
    }

    case '/sleep': {
      console.log('\n[manual] Running sleep consolidation...');
      const stats = runSleepCycle();
      console.log('');
      break;
    }

    case '/condense': {
      console.log('\n[manual] Forcing condensation cycle...');
      const { runFullCondensation } = require('./src/condenser');
      const result = await runFullCondensation('manual');
      console.log(`[manual] Condensation ${result.ran ? 'complete' : 'skipped'}: ${result.reason || 'ok'}\n`);
      break;
    }

    case '/quit': {
      console.log('\n[session] Ending session...');
      await endSession(sessionId);
      sleepJob.stop();
      close();
      console.log('[session] Goodbye!\n');
      process.exit(0);
    }

    default:
      console.log(`\n[unknown] Unknown command: ${cmd}\n`);
  }
}

function countTiers(nodes) {
  const counts = { ephemeral: 0, pattern: 0, significant: 0, permanent: 0 };
  for (const n of nodes) counts[n.tier] = (counts[n.tier] || 0) + 1;
  return Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ');
}

// Handle Ctrl+C gracefully
rl.on('close', async () => {
  console.log('\n[session] Ending session...');
  await endSession(sessionId);
  sleepJob.stop();
  close();
  process.exit(0);
});

// Start the conversation
prompt();
