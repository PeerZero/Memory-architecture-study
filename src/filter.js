// filter.js — Real-time splatter filter
// Runs on every user utterance. Lightweight Haiku call.
// Decides what gets splatted to graph immediately vs waiting for condenser.
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

const client = new Anthropic();

const FILTER_PROMPT = `You are a memory filter for a conversational AI. Your job is to analyze a user message and extract anything worth remembering to a memory graph.

For each item you detect, classify it:

- **person**: A person mentioned by name, role, or relationship (sister, coworker, "my friend Jake")
- **concept**: A topic, interest, activity, or thing (hiking, cooking, fish, summer)
- **event**: Something that happened or is happening (car crash, job change, graduation, trip)
- **emotion**: A detectable emotion in the message (worry, excitement, grief, pride, tension)
- **pattern**: A recurring behavior or habit ("always does X", "every time Y")
- **place**: A location (the market, hospital, home, "that cafe on 5th")

For each item, provide:
- label: A short, stable label (use the most natural reference — "Sister" not "user's sister")
- type: One of the types above
- weight: How significant this mention is:
  - "passing" — casual, no emotional signal
  - "moderate" — some context given
  - "significant" — real detail provided
  - "emotional" — emotional weight detected
  - "important" — explicitly marked as important by the user
- observation: A brief note on how this was mentioned (tone, context, relationship to other things)
- edges: Array of other items this connects to (by label)

If nothing worth remembering exists in the message, return an empty items array.

Respond ONLY with valid JSON. No preamble. No explanation.

Format:
{
  "items": [
    {
      "label": "Sister",
      "type": "person",
      "weight": "emotional",
      "observation": "mentioned with slight tension when discussing family dinner",
      "edges": ["Family Dinner", "Tension"]
    }
  ]
}`;

const WEIGHT_MAP = {
  passing: config.weights.passing_mention,
  moderate: config.weights.moderate_mention,
  significant: config.weights.significant_mention,
  emotional: config.weights.emotional_mention,
  important: config.weights.explicit_importance,
};

async function runFilter(message) {
  try {
    const response = await client.messages.create({
      model: config.models.filter,
      max_tokens: 1024,
      messages: [
        { role: 'user', content: `${FILTER_PROMPT}\n\nUser message:\n"${message}"` },
      ],
    });

    const text = response.content[0]?.text || '{}';
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { items: [] };

    const parsed = JSON.parse(jsonMatch[0]);
    const items = (parsed.items || []).map((item) => ({
      label: String(item.label || '').trim(),
      type: item.type || 'concept',
      weight: WEIGHT_MAP[item.weight] || config.weights.passing_mention,
      observation: String(item.observation || '').trim(),
      edges: Array.isArray(item.edges) ? item.edges.map(String) : [],
    })).filter((item) => item.label.length > 0);

    return { items };
  } catch (err) {
    console.error('[filter] Error running filter:', err.message);
    return { items: [] };
  }
}

module.exports = { runFilter };
