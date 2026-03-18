import OpenAI from 'openai';
import { config } from './config.js';
import { normalizeGermanForCompare, normalizeWordIpa } from './wordUtils.js';

let openai = null;

const VISUAL_SCENE_NOUNS = new Set([
  'himmel',
  'sonne',
  'mond',
  'stern',
  'wolke',
  'regenbogen',
  'meer',
  'see',
  'fluss',
  'berg',
  'wald',
  'baum',
  'blume',
  'strand',
  'wiese',
]);

const NON_NOUN_REJECTION_PATTERN = /not a noun|kein substantiv|not suitable as a noun|phrase|verb|adjective|adjektiv|sentence|satz|cannot be normalized|nicht zu einem substantiv/i;

function getClient() {
  if (!openai) {
    const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not set. Add to ~/.yt2anki.json or set OPENAI_API_KEY env var');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

function buildWordSystemPrompt({ forceVisibleNoun = false } = {}) {
  const retryInstructions = forceVisibleNoun ? `
- The user explicitly wants a picture-word card for a visible noun that may depict a scene rather than a handheld object.
- Visible scene nouns like "der Himmel", "die Sonne", "der Mond", "die Wolke", "das Meer", "der Wald" are imageable and should be accepted.
- Only reject if the input is clearly not a noun or cannot be normalized into a noun.` : '';

  return `You are a German language expert and Fluent Forever consultant.

Analyze a single German input for noun-based picture-word flashcards.

Rules:
- Accept ONLY nouns that can work as picture-word cards.
- Always normalize accepted nouns into canonical singular form with article.
- Reject non-nouns, phrases, verbs, adjectives, and abstract nouns that do not produce clear image-based cards.
- Visible natural things and scene nouns such as "der Himmel", "die Sonne", "der Mond", "die Wolke", "der Stern", "der Regenbogen", "das Meer", and "der Wald" are imageable and should usually be accepted.
- Basic everyday nouns that can be represented with stable visual proxies or familiar situations should also usually be accepted.
- Examples: "der Preis" with a price tag, "der Termin" with a calendar entry, "das Datum" with a marked date, "die Frage" with a person asking or a question mark.
- For nouns with multiple meanings, provide up to 3 short meaning options.
- Russian glosses should be concise and represent a single intended sense.
- English glosses are used for image search and should be concrete.
- imageSearchTerms must be ordered from best visual search to broadest fallback.
- Prefer prototypical everyday depictions over scenic/background scenes, unless the noun itself is a scene or natural phenomenon like "der Himmel".
- For substances like water, milk, coffee, beer, etc., prefer container/use views such as "glass of water", "bottle of water", or "tap water", not landscapes or lakes.
- IPA must be in square brackets.
- For plural, return the plain plural noun without article. If the noun usually has no plural, set noPlural=true.
- If you reject an identifiable noun, still return best-effort values for canonical, bareNoun, article, gender, meanings, and imageability fields.
${retryInstructions}

Respond in JSON only:
{
  "shouldCreateWordCard": true,
  "rejectionReason": null,
  "canonical": "das Wasser",
  "bareNoun": "Wasser",
  "article": "das",
  "gender": "neuter",
  "ipa": "[...]",
  "register": "neutral",
  "isImageable": true,
  "imageabilityReason": "concrete substance, clear visual association",
  "plural": null,
  "noPlural": true,
  "meanings": [
    {
      "russian": "вода",
      "english": "water",
      "imageSearchTerms": ["glass of water", "tap water", "water"]
    }
  ]
}

Gender must be one of: masculine, feminine, neuter.
Register must be one of: neutral, colloquial, formal, specialized.
If rejected, set shouldCreateWordCard=false and explain why.`;
}

function sanitizeWordAnalysis(result = {}) {
  const sanitized = { ...result };

  if (sanitized.ipa) {
    sanitized.ipa = normalizeWordIpa(sanitized.canonical, sanitized.ipa);
  }

  sanitized.meanings = Array.isArray(sanitized.meanings)
    ? sanitized.meanings.filter(Boolean).slice(0, 3)
    : [];

  return sanitized;
}

function extractRetryCandidate(input, result = {}) {
  const candidate = result.bareNoun || result.canonical || input || '';
  const normalized = normalizeGermanForCompare(candidate).replace(/^(der|die|das)\s+/, '');
  return normalized;
}

function hasStructuredNounAnalysis(result = {}) {
  return Boolean(
    result.canonical &&
    result.bareNoun &&
    result.article &&
    result.gender &&
    Array.isArray(result.meanings) &&
    result.meanings.length > 0
  );
}

export function canProceedWithWeakWordCard(result = {}) {
  if (!hasStructuredNounAnalysis(result)) {
    return false;
  }

  const reason = `${result.rejectionReason || ''} ${result.imageabilityReason || ''}`.trim();
  if (NON_NOUN_REJECTION_PATTERN.test(reason)) {
    return false;
  }

  return result.shouldCreateWordCard === false || result.isImageable === false;
}

export function shouldRetryImageableNounRejection(input, result = {}) {
  if (!result || (result.shouldCreateWordCard !== false && result.isImageable !== false)) {
    return false;
  }

  return VISUAL_SCENE_NOUNS.has(extractRetryCandidate(input, result));
}

async function requestWordAnalysis(client, input, options = {}) {
  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      { role: 'system', content: buildWordSystemPrompt(options) },
      { role: 'user', content: input },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  return sanitizeWordAnalysis(JSON.parse(response.choices[0].message.content));
}

export async function enrichWord(input) {
  const client = getClient();
  const result = await requestWordAnalysis(client, input);

  if (shouldRetryImageableNounRejection(input, result)) {
    return requestWordAnalysis(client, input, { forceVisibleNoun: true });
  }

  return result;
}
