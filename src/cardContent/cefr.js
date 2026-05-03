import OpenAI from 'openai';
import { config } from '../lib/config.js';
import { resolveSecret } from '../lib/secrets.js';

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

export async function estimateCEFR(sentence) {
  const level = await getLLMLevel(sentence);
  return {
    level,
    confidence: 0.9,
    signals: { llm: level },
  };
}

export async function estimateLexicalCEFR(german, options = {}) {
  const level = await getLexicalLLMLevel(german, options);
  return {
    level,
    confidence: 0.85,
    signals: { llm: level },
  };
}

export async function estimateCEFRBatch(sentences) {
  if (sentences.length === 0) return [];

  const levels = await getLLMLevelBatch(sentences);
  return levels.map((level) => ({
    level,
    confidence: 0.9,
    signals: { llm: level },
  }));
}

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

async function getLexicalLLMLevel(german, options = {}) {
  const client = await getClient();
  const lexicalType = String(options.lexicalType || '').trim() || 'word';
  const meaning = String(options.meaning || '').trim();

  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: 'system',
        content: `You are a German language expert. Classify the CEFR difficulty of a single German lexical item for a learner.

Reply with ONLY one level: A1, A2, B1, B2, or C1.

Guidelines:
- A1: very basic everyday words most beginners learn immediately
- A2: common daily-life words and high-frequency concrete vocabulary
- B1: solid intermediate vocabulary, common but not beginner-core
- B2: more advanced, less frequent, nuanced, or topic-specific vocabulary
- C1: rare, formal, literary, or specialized vocabulary

Important:
- Judge the difficulty of knowing and using the word itself, not sentence grammar.
- If a meaning gloss is provided, use it only to disambiguate the intended sense.
- Prefer the most common learner sense when the word is ambiguous.`,
      },
      {
        role: 'user',
        content: `German: ${german}
Type: ${lexicalType}${meaning ? `\nMeaning: ${meaning}` : ''}`,
      },
    ],
    max_tokens: 5,
    temperature: 0,
  });

  const level = response.choices[0].message.content.trim().toUpperCase();
  return LEVELS.includes(level) ? level : 'B1';
}

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
