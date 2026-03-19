import OpenAI from 'openai';
import { config } from './config.js';
import { resolveSecret } from './secrets.js';

let openai = null;

async function getClient() {
  if (!openai) {
    const apiKey = await resolveSecret(config.openaiApiKey || process.env.OPENAI_API_KEY);
    if (!apiKey) {
      throw new Error('OpenAI API key not set');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

/**
 * Analyze a sentence for Fluent Forever card generation.
 * Determines card types, quality thresholds, and provides value scores for priority selection.
 *
 * @param {Object} data - Enriched sentence data
 * @param {string} data.german - German sentence
 * @param {string} data.russian - Russian translation
 * @param {Object} sessionState - Current session tracking state
 * @returns {Promise<Object>} Analysis result with card recommendations
 */
export async function analyzeSentence(data, sessionState = {}) {
  const client = await getClient();

  const systemPrompt = `You are a German language teaching expert using Fluent Forever methodology. Analyze the given German sentence for flashcard generation.

Your analysis determines:
1. Whether to generate any cards (gate check)
2. Whether the sentence needs splitting
3. Which card types are appropriate
4. Quality/value scores for each card type

GATE RULES - Reject sentences that are:
- Too long (>12 words) without natural split points
- Filler/meta-language ("Also...", "Ja, also...")
- Too niche/formal for conversational use
- No reusable value for a learner

CARD TYPES:
- Comprehension: Default listening card (audio front, text back)
- Dialogue: ONLY when ALL of these are true:
  1. The sentence IS a question or conversational opener (not an answer)
  2. The response is something a learner would genuinely memorize and reuse — not a throwaway or situational reply
  3. The exchange is a common social scenario (greetings, opinions, invitations, preferences) — NOT situational navigation ("Where's the traffic light?"), NOT rhetorical, NOT open-ended
  4. The response does NOT just echo or paraphrase the question
  Set hasShortNaturalResponse=false and dialogueResponse=null if no genuinely useful response exists.
- Production: High-value phrases learner will actually speak in real situations
- Pattern: Strong reusable grammatical structures (only if strong, with 3+ distinct useful examples)
- Cloze: Grammar features where blank is non-obvious and teaches reusable pattern

RESPOND IN JSON:
{
  "shouldGenerateAnyCard": true/false,
  "rejectionReason": "reason if rejected, null otherwise",

  "wordCount": number,
  "shouldSplit": true/false,
  "splitSuggestion": ["part1", "part2"] or null,

  "isConversationalPrompt": true/false,
  "isAnswer": true/false,
  "hasShortNaturalResponse": true/false,
  "dialogueResponse": {"german": "...", "russian": "..."} or null,

  "isHighValueForActiveUse": true/false,
  "isSpeakableByLearner": true/false,
  "situation": "max 8 word context" or null,

  "patternFamily": "pattern name" or null,
  "patternStrength": "weak" | "medium" | "strong",
  "patternExamples": ["example1", "example2", "example3"] or null,

  "clozeCandidate": {"word": "...", "category": "..."} or null,
  "clozeReason": "why this teaches something" or null,
  "isGuessable": true/false,

  "dialogueValue": 0-10,
  "productionValue": 0-10,
  "patternValue": 0-10,
  "clozeValue": 0-10
}

VALUE SCORING GUIDE (0-10):
- 10: Essential, high-frequency, every learner needs this
- 7-9: Very useful, common situations
- 4-6: Moderately useful, occasional use
- 1-3: Limited use, specific contexts
- 0: Not applicable or not valuable

For dialogue: High (7+) ONLY if the exchange is a high-frequency social scenario with a response the learner will reuse often (e.g. "Wie geht's?" → "Gut, danke!"). Score 0 for situational, navigational, or one-off questions.
For production: High if learner will say this frequently (greetings, opinions, needs)
For pattern: High if structure is reusable across many contexts (only rate if strength is "strong")
For cloze: High if grammar point is tricky but common (articles, prepositions, verb forms)`;

  const userPrompt = `German: ${data.german}
Russian: ${data.russian}

Recent pattern families used: ${sessionState.recentPatternFamilies?.join(', ') || 'none'}
Units since last pattern: ${sessionState.acceptedUnitsSinceLastPattern || 0}`;

  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const content = response.choices[0].message.content;
  return JSON.parse(content);
}

/**
 * Select cards based on analysis and session state.
 * Implements priority-based selection with heavy card limits.
 *
 * @param {Object} analysis - Result from analyzeSentence
 * @param {Object} sessionState - Current session tracking state
 * @returns {Object} Selected cards with reasons
 */
export function selectCards(analysis, sessionState) {
  // GATE CHECK
  if (!analysis.shouldGenerateAnyCard) {
    return { cards: [], rejected: true, reason: analysis.rejectionReason };
  }

  // SPLIT CHECK (before card selection)
  if (analysis.shouldSplit && analysis.splitSuggestion?.length) {
    return { needsSplit: true, splits: analysis.splitSuggestion };
  }

  // 1. Comprehension always included
  const cards = [{ type: 'comprehension', reason: 'default', value: 10, heavy: false }];

  // 2. Build candidate pool with values
  const candidates = [];

  // Dialogue card (min value 7 — only high-frequency social exchanges)
  if (analysis.isConversationalPrompt && !analysis.isAnswer && analysis.hasShortNaturalResponse && analysis.dialogueResponse && analysis.dialogueValue >= 7) {
    candidates.push({
      type: 'dialogue',
      reason: 'conversational prompt',
      value: analysis.dialogueValue,
      heavy: false,
      data: { response: analysis.dialogueResponse },
    });
  }

  // Production card
  if (analysis.isHighValueForActiveUse && analysis.isSpeakableByLearner) {
    candidates.push({
      type: 'production',
      reason: analysis.situation || 'high-value active phrase',
      value: analysis.productionValue,
      heavy: false,
    });
  }

  // Pattern card (only strong, with session throttling)
  if (
    analysis.patternStrength === 'strong' &&
    analysis.patternFamily &&
    analysis.patternExamples?.length >= 3 &&
    shouldAllowPattern(sessionState, analysis.patternFamily)
  ) {
    candidates.push({
      type: 'pattern',
      reason: analysis.patternFamily,
      value: analysis.patternValue,
      heavy: true,
      data: { examples: analysis.patternExamples },
    });
  }

  // Cloze card (only non-guessable)
  if (analysis.clozeCandidate && !analysis.isGuessable && analysis.clozeReason) {
    candidates.push({
      type: 'cloze',
      reason: analysis.clozeReason,
      value: analysis.clozeValue,
      heavy: true,
      data: { target: analysis.clozeCandidate },
    });
  }

  // 3. Priority selection: sort by value, pick top 2, max 1 heavy
  candidates.sort((a, b) => b.value - a.value);

  let heavyAdded = false;
  for (const c of candidates) {
    if (cards.length >= 3) break;
    if (c.heavy && heavyAdded) continue;
    cards.push(c);
    if (c.heavy) heavyAdded = true;
  }

  return { cards, rejected: false };
}

/**
 * Check if a pattern card should be allowed based on session state.
 */
function shouldAllowPattern(sessionState, family) {
  if (!sessionState) return true;
  if ((sessionState.acceptedUnitsSinceLastPattern || 0) < 6) return false;
  if (sessionState.recentPatternFamilies?.includes(family)) return false;
  return true;
}
