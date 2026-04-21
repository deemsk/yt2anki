import OpenAI from 'openai';
import { config, CONFIG_PATH_DISPLAY } from './config.js';
import { resolveSecret } from './secrets.js';
import { getWordFrequencyInfo } from './wordFrequency.js';

let openai = null;

async function getClient() {
  if (!openai) {
    const apiKey = await resolveSecret(config.openaiApiKey || process.env.OPENAI_API_KEY);
    if (!apiKey) {
      throw new Error(`OpenAI API key not set. Add to ${CONFIG_PATH_DISPLAY} or set OPENAI_API_KEY env var`);
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

function buildCorrectionPrompt() {
  return `You correct one German lexical item before a flashcard app routes it as a noun, adjective, adverb, or verb.

Return correction suggestions only when the input is probably misspelled, missing German diacritics, or typed as an ASCII approximation.

Rules:
- If the input is already a valid German lexical item as typed, return no suggestions.
- Do not suggest a different valid word just because it is close. Example: "schon" is valid; do not suggest "schön".
- Prefer common learner-relevant corrections.
- Preserve the user's intended lexical item; do not translate.
- For verbs, prefer the infinitive with proper spelling.
- Return at most 3 suggestions, best first.

Examples:
- kuhlen -> kühlen
- mussen -> müssen
- schoen -> schön
- laufen -> no suggestion
- schon -> no suggestion

Respond in JSON only:
{
  "suggestions": [
    { "text": "kühlen", "reason": "missing umlaut" }
  ]
}`;
}

function normalizeInputShape(input = '') {
  return String(input || '').trim();
}

export function shouldCheckLexicalCorrection(input = '') {
  const raw = normalizeInputShape(input);
  if (!raw) {
    return false;
  }

  if (/\s/.test(raw)) {
    return false;
  }

  if (!/^[A-Za-z-]+$/.test(raw)) {
    return false;
  }

  const frequencyInfo = getWordFrequencyInfo(raw);
  return !frequencyInfo.rank;
}

export function sanitizeLexicalCorrectionSuggestions(input = '', payload = {}) {
  const raw = normalizeInputShape(input);
  const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
  const seen = new Set();
  const result = [];

  for (const suggestion of suggestions) {
    const text = normalizeInputShape(
      typeof suggestion === 'string' ? suggestion : suggestion?.text
    );
    if (!text || text === raw || text.length > 60 || /[\r\n]/.test(text)) {
      continue;
    }

    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({
      text,
      reason: normalizeInputShape(
        typeof suggestion === 'string' ? '' : suggestion?.reason
      ) || null,
    });

    if (result.length >= 3) {
      break;
    }
  }

  return result;
}

export async function suggestLexicalCorrections(input) {
  const raw = normalizeInputShape(input);
  if (!raw) {
    return [];
  }

  const client = await getClient();
  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      { role: 'system', content: buildCorrectionPrompt() },
      { role: 'user', content: raw },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  return sanitizeLexicalCorrectionSuggestions(
    raw,
    JSON.parse(response.choices[0].message.content)
  );
}
