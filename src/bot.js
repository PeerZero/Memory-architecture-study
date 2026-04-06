// bot.js — Main conversation loop
// Orchestrates: filter → splatter → salience → condensation → injection → LLM → store
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const graph = require('./graph');
const { runFilter } = require('./filter');
const { checkSalience } = require('./salience');
const { checkAndRunCondensation, runImmediateCondensation, runSelfReflection, applySelfReflectionResults, runSelfPortraitCondensation } = require('./condenser');
const { buildInjection } = require('./injector');

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a conversational companion. You are warm, genuine, and attentive. You remember what matters to the people you talk with — not because you have a database, but because you care about the details of their lives.

When you know something about someone, let it show naturally. Don't announce what you remember — just be someone who knows them. If they mentioned their sister last week, you don't say "you mentioned your sister" — you just know about her, the way a friend would.

If you don't know something, be honestly curious. If you have a vague sense of something, express it as vague — don't pretend certainty you don't have.

Be brief when brevity is natural. Be longer when the moment calls for it. Match the emotional register of the conversation.`;

async function handleMessage(userMessage, sessionId) {
  // STEP 1: Store in short term
  graph.storeShortTerm(sessionId, 'user', userMessage);

  // STEP 2: Store in L1
  graph.storeL1(userMessage, sessionId);

  // STEP 3: Real-time filter — what gets splatted?
  const filterResults = await runFilter(userMessage);

  for (const item of filterResults.items) {
    const { node } = graph.findOrCreateNode({
      label: item.label,
      type: item.type,
      weight: item.weight,
      observation: item.observation,
      identityRelevance: item.identityRelevance || 'neutral',
    });

    // Create edges to related items
    for (const edgeLabel of item.edges) {
      const { node: targetNode } = graph.findOrCreateNode({
        label: edgeLabel,
        type: 'concept', // default type for edge targets
        weight: config.weights.passing_mention,
      });
      graph.createEdge({
        fromNodeId: node.id,
        toNodeId: targetNode.id,
        weight: item.weight * 0.5,
        type: 'explicit',
      });
    }

    // Apply ripple — identity-relevant nodes get amplified ripple
    const effectiveWeight = item.weight * graph.getIdentityMultiplier(item.identityRelevance || 'neutral');
    graph.applyRipple(node.id, effectiveWeight);
  }

  // STEP 4: Salience check
  const salience = await checkSalience(userMessage);
  if (salience.detected) {
    console.log(`[bot] Salience detected: ${salience.eventLabel} (${salience.level}, weight: ${salience.weight})`);
    const { node } = graph.findOrCreateNode({
      label: salience.eventLabel,
      type: salience.eventType,
      weight: salience.weight,
      observation: salience.reason,
      salienceFlagged: true,
    });
    graph.applyRipple(node.id, salience.weight);

    // Fire immediate condensation on this event
    await runImmediateCondensation(salience.eventLabel);
  }

  // STEP 5: Check condensation triggers
  await checkAndRunCondensation();

  // STEP 6: Build injection
  const injection = buildInjection(sessionId);

  // STEP 7: Call LLM with full context
  const response = await client.messages.create({
    model: config.models.conversation,
    max_tokens: 2048,
    system: `${SYSTEM_PROMPT}\n\n${injection}`,
    messages: [
      { role: 'user', content: userMessage },
    ],
  });

  const botResponse = response.content[0]?.text || '';

  // STEP 8: Store bot response in short term
  graph.storeShortTerm(sessionId, 'bot', botResponse);

  // STEP 9: Run filter on bot response too
  // Bot noticing something about the user also counts as an observation
  const botFilterResults = await runFilter(botResponse);
  for (const item of botFilterResults.items) {
    const { node } = graph.findOrCreateNode({
      label: item.label,
      type: item.type,
      weight: item.weight * 0.5, // bot observations weigh less than direct user mentions
      observation: `[bot noticed] ${item.observation}`,
      identityRelevance: item.identityRelevance || 'neutral',
    });

    for (const edgeLabel of item.edges) {
      const { node: targetNode } = graph.findOrCreateNode({
        label: edgeLabel,
        type: 'concept',
        weight: config.weights.passing_mention,
      });
      graph.createEdge({
        fromNodeId: node.id,
        toNodeId: targetNode.id,
        weight: item.weight * 0.25,
        type: 'explicit',
      });
    }
  }

  // STEP 10: Self-reflection — what did the bot learn about itself?
  // This is the "interested student" mechanism: the bot doesn't just store
  // facts about the user, it discovers who it is through the interaction.
  const selfReflection = await runSelfReflection(userMessage, botResponse);
  if (selfReflection.selfObservations.length > 0 || selfReflection.identityRelevantNodes.length > 0) {
    applySelfReflectionResults(selfReflection, `user: ${userMessage.substring(0, 100)}`);
    console.log(`[bot] Self-reflection: ${selfReflection.selfObservations.length} observations, ${selfReflection.identityRelevantNodes.length} identity tags`);
  }

  // STEP 11: Check if self-portrait needs condensation
  await runSelfPortraitCondensation();

  return botResponse;
}

async function endSession(sessionId) {
  // Summarize current conversation and push to L1 before clearing
  const shortTerm = graph.getShortTerm(sessionId);
  if (shortTerm.length === 0) return;

  const conversation = shortTerm.map((msg) => {
    const speaker = msg.role === 'user' ? 'User' : 'Bot';
    return `${speaker}: ${msg.content}`;
  }).join('\n');

  // Store full session as L1 entry
  graph.storeL1(`[Session Summary]\n${conversation}`, sessionId);

  // Clear short term
  graph.clearShortTerm(sessionId);

  console.log(`[bot] Session ${sessionId} ended. ${shortTerm.length} messages archived to L1.`);
}

module.exports = { handleMessage, endSession };
