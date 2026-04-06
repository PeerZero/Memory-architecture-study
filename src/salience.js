// salience.js — Salience detection and spike handling
// Detects high-importance events that bypass normal flow.
// Single high-importance events get spiked immediately.
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

const client = new Anthropic();

const SALIENCE_PROMPT = `You are a salience detector for a conversational AI memory system. Your job is to detect if a user message contains a HIGH-IMPORTANCE event that should be permanently remembered.

Salience signals:
- Emotional vocabulary: crash, accident, lost, scared, surgery, fired, divorced, died, pregnant
- Explicit significance: "I need to tell you", "something happened", "it was really bad", "guess what"
- Consequence language: "everything changed", "I had to", "they told me", "since then"
- Interruption of normal tone: sudden shift from casual to serious

Salience levels:
- "none" — Normal conversation, no spike needed
- "minor" — Notable event but not life-changing (got a new pet, minor illness, small argument)
- "major" — Significant life event (car crash, job loss, breakup, surgery, major illness)
- "defining" — Defining life event (death of close person, life-threatening diagnosis, birth of child)

Respond ONLY with valid JSON:
{
  "detected": true/false,
  "level": "none" | "minor" | "major" | "defining",
  "event_label": "short label for the event",
  "event_type": "event",
  "reason": "brief explanation of why this is salient"
}`;

const SPIKE_MAP = {
  minor: config.weights.salience_minor,
  major: config.weights.salience_major,
  defining: config.weights.salience_defining,
};

async function checkSalience(message) {
  try {
    const response = await client.messages.create({
      model: config.models.salience,
      max_tokens: 256,
      messages: [
        { role: 'user', content: `${SALIENCE_PROMPT}\n\nUser message:\n"${message}"` },
      ],
    });

    const text = response.content[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { detected: false };

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.detected || parsed.level === 'none') {
      return { detected: false };
    }

    return {
      detected: true,
      level: parsed.level,
      weight: SPIKE_MAP[parsed.level] || config.weights.salience_minor,
      eventLabel: String(parsed.event_label || 'Unknown Event').trim(),
      eventType: 'event',
      reason: String(parsed.reason || '').trim(),
    };
  } catch (err) {
    console.error('[salience] Error checking salience:', err.message);
    return { detected: false };
  }
}

module.exports = { checkSalience };
