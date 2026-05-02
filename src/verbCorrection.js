import OpenAI from 'openai';
import { config, CONFIG_PATH_DISPLAY } from './config.js';
import { resolveSecret } from './secrets.js';
import { normalizeGermanForCompare } from './cardContent/german.js';

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

function buildVerbInfinitivePrompt() {
  return `You suggest German verb infinitives for a rejected verb-form input.

Return suggestions only when the input is clearly a German verb form, especially a past participle, that maps to a likely infinitive.

Rules:
- Preserve the user's intended verb.
- Prefer the standard infinitive.
- Include separable prefixes when needed.
- Return no suggestions if the input is already an infinitive or no clear infinitive exists.
- Return at most 3 suggestions, best first.

Examples:
- verbunden -> verbinden
- gegessen -> essen
- gelaufen -> laufen
- angekommen -> ankommen
- machen -> no suggestion

Respond in JSON only:
{
  "suggestions": [
    { "text": "verbinden", "reason": "infinitive of past participle verbunden" }
  ]
}`;
}

function normalizeInput(input = '') {
  return String(input || '').trim();
}

export function shouldSuggestVerbInfinitive(input = '', verbData = {}) {
  if (!input || verbData.shouldCreateVerbCard) {
    return false;
  }

  const raw = normalizeInput(input);
  if (!raw || /\s/.test(raw) || !/^[\p{L}-]+$/u.test(raw)) {
    return false;
  }

  const reason = normalizeGermanForCompare(verbData.rejectionReason || '');
  return /participle|partizip|infinitive|conjugated form|verb form/.test(reason);
}

export function sanitizeVerbInfinitiveSuggestions(input = '', payload = {}) {
  const raw = normalizeInput(input);
  const normalizedRaw = normalizeGermanForCompare(raw);
  const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
  const seen = new Set();
  const result = [];

  for (const suggestion of suggestions) {
    const text = normalizeInput(
      typeof suggestion === 'string' ? suggestion : suggestion?.text
    );
    const normalized = normalizeGermanForCompare(text);
    if (!text || normalized === normalizedRaw || text.length > 60 || /\s|[\r\n]/.test(text)) {
      continue;
    }

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push({
      text,
      reason: normalizeInput(
        typeof suggestion === 'string' ? '' : suggestion?.reason
      ) || null,
    });

    if (result.length >= 3) {
      break;
    }
  }

  return result;
}

export async function suggestVerbInfinitives(input, rejectionReason = '') {
  const raw = normalizeInput(input);
  if (!raw) {
    return [];
  }

  const client = await getClient();
  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      { role: 'system', content: buildVerbInfinitivePrompt() },
      {
        role: 'user',
        content: `Input: ${raw}\nRejection reason: ${rejectionReason || ''}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  return sanitizeVerbInfinitiveSuggestions(
    raw,
    JSON.parse(response.choices[0].message.content)
  );
}
