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

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

/**
 * Estimate CEFR level for a German sentence using AI
 * @param {string} sentence - German sentence
 * @returns {Promise<{level: string, confidence: number, signals: object}>}
 */
export async function estimateCEFR(sentence) {
  const level = await getLLMLevel(sentence);
  return {
    level,
    confidence: 0.9,
    signals: { llm: level },
  };
}

/**
 * Batch estimate CEFR levels for multiple sentences
 * @param {string[]} sentences - Array of German sentences
 * @returns {Promise<Array<{level: string, confidence: number, signals: object}>>}
 */
export async function estimateCEFRBatch(sentences) {
  if (sentences.length === 0) return [];

  const levels = await getLLMLevelBatch(sentences);
  return levels.map((level) => ({
    level,
    confidence: 0.9,
    signals: { llm: level },
  }));
}

/**
 * Get CEFR level from LLM classification (single sentence)
 */
async function getLLMLevel(sentence) {
  const client = await getClient();

  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: 'system',
        content: `You are a German language expert. Classify the CEFR level of this German sentence.

Reply with ONLY the level: A1, A2, B1, B2, or C1.

Guidelines:
- A1: Basic phrases, present tense, very simple vocabulary (ich, du, sein, haben, gut, schlecht)
- A2: Past tense (Perfekt), common expressions, daily topics, simple conjunctions (und, aber, oder)
- B1: Subordinate clauses (weil, dass, wenn), Konjunktiv II, opinions, familiar topics
- B2: Passive voice, Genitiv, abstract topics, idioms, nuanced expression (obwohl, trotzdem)
- C1: Sophisticated language, implicit meaning, specialized vocabulary, complex structures

Important:
- Ignore proper nouns (names, cities, brands) when assessing difficulty
- Focus on grammar complexity and vocabulary sophistication
- Consider the hardest grammatical structure in the sentence`,
      },
      {
        role: 'user',
        content: sentence,
      },
    ],
    max_tokens: 5,
    temperature: 0,
  });

  const level = response.choices[0].message.content.trim().toUpperCase();
  return LEVELS.includes(level) ? level : 'B1';
}

/**
 * Batch LLM classification for multiple sentences
 */
async function getLLMLevelBatch(sentences) {
  if (sentences.length === 0) return [];
  if (sentences.length === 1) {
    return [await getLLMLevel(sentences[0])];
  }

  const client = await getClient();
  const numberedSentences = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n');

  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: 'system',
        content: `You are a German language expert. Classify the CEFR level of each German sentence.

Reply with JSON array only.

Example input:
1. Ich bin Student.
2. Obwohl es regnet, gehe ich spazieren.

Example output:
[{"id":1,"level":"A1"},{"id":2,"level":"B2"}]

Guidelines:
- A1: Basic phrases, present tense, very simple vocabulary
- A2: Past tense (Perfekt), common expressions, daily topics
- B1: Subordinate clauses (weil, dass, wenn), Konjunktiv II
- B2: Passive voice, Genitiv, abstract topics, idioms (obwohl, trotzdem)
- C1: Sophisticated language, specialized vocabulary

Important:
- Ignore proper nouns (names, cities, brands) when assessing difficulty
- Focus on grammar complexity and vocabulary sophistication`,
      },
      {
        role: 'user',
        content: numberedSentences,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  try {
    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);
    const results = Array.isArray(parsed) ? parsed : parsed.results || parsed.levels || [];

    const levelMap = new Map();
    for (const item of results) {
      const id = item.id || item.index;
      const level = (item.level || 'B1').toUpperCase();
      levelMap.set(id, LEVELS.includes(level) ? level : 'B1');
    }

    return sentences.map((_, i) => levelMap.get(i + 1) || 'B1');
  } catch {
    return Promise.all(sentences.map(getLLMLevel));
  }
}
