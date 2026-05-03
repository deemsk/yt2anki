import OpenAI from 'openai';
import { config, CONFIG_PATH_DISPLAY } from './lib/config.js';
import { estimateCEFR } from './cardContent/cefr.js';
import { resolveSecret } from './lib/secrets.js';
import { generateGermanIpa, normalizeSentenceIpa } from './cardContent/ipa.js';
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

function normalizeIpa(ipa = '') {
  return normalizeSentenceIpa(ipa);
}

const ENRICH_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'german_enrichment',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        german: { type: 'string' },
        ipa: { type: 'string' },
        russian: { type: 'string' },
      },
      required: ['german', 'ipa', 'russian'],
      additionalProperties: false,
    },
  },
};

function buildReviewResponseFormat(includeImageBrief = false) {
  const properties = {
    german: { type: 'string' },
    ipa: { type: 'string' },
    russian: { type: 'string' },
  };
  const required = ['german', 'ipa', 'russian'];

  if (includeImageBrief) {
    properties.imageBrief = {
      type: 'object',
      properties: {
        searchQuery: { type: 'string' },
        queryVariants: {
          type: 'array',
          items: { type: 'string' },
        },
        sceneSummary: { type: 'string' },
        focusRole: { type: 'string' },
        mustShow: {
          type: 'array',
          items: { type: 'string' },
        },
        avoid: {
          type: 'array',
          items: { type: 'string' },
        },
        imagePrompt: { type: 'string' },
      },
      required: ['searchQuery', 'queryVariants', 'sceneSummary', 'focusRole', 'mustShow', 'avoid', 'imagePrompt'],
      additionalProperties: false,
    };
    required.push('imageBrief');
  }

  return {
    type: 'json_schema',
    json_schema: {
      name: includeImageBrief ? 'german_review_with_image' : 'german_review',
      strict: true,
      schema: {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

function sanitizeImageBrief(imageBrief = null) {
  if (!imageBrief || typeof imageBrief !== 'object') {
    return null;
  }

  const normalized = {
    searchQuery: String(imageBrief.searchQuery || '').trim() || null,
    queryVariants: Array.isArray(imageBrief.queryVariants)
      ? imageBrief.queryVariants.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
      : [],
    sceneSummary: String(imageBrief.sceneSummary || '').trim() || null,
    focusRole: String(imageBrief.focusRole || '').trim() || null,
    mustShow: Array.isArray(imageBrief.mustShow)
      ? imageBrief.mustShow.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
      : [],
    avoid: Array.isArray(imageBrief.avoid)
      ? imageBrief.avoid.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
      : [],
    imagePrompt: String(imageBrief.imagePrompt || '').trim() || null,
  };

  if (
    !normalized.searchQuery &&
    normalized.queryVariants.length === 0 &&
    !normalized.sceneSummary &&
    !normalized.focusRole &&
    normalized.mustShow.length === 0 &&
    normalized.avoid.length === 0 &&
    !normalized.imagePrompt
  ) {
    return null;
  }

  return normalized;
}

/**
 * Get corrected German text, IPA transcription, and Russian translation
 * @param {string} germanText - German word or sentence (possibly with errors)
 * @param {string} [subtitleContext] - Optional full subtitle context from the video
 * @param {string} [ccHint] - Optional CC text for this specific clip (authoritative reference)
 * @returns {Promise<{german: string, ipa: string, russian: string}>}
 */
export async function enrich(germanText, subtitleContext = null, ccHint = null) {
  const client = await getClient();

  let systemPrompt = `You are a German language expert. For the given German text:
1. Correct any transcription errors (typos, missing letters, wrong words)
2. Fix punctuation (questions must end with ?, statements with .)
3. Ensure proper capitalization (sentence start, nouns)
4. Provide fallback IPA transcription in square brackets; it must match the final German exactly
5. Provide Russian translation

IPA rules for Standard German:
- Use standard German IPA, not Spanish/flapped-r variants.
- Use ʁ or ɐ̯ for German r where appropriate; do not use ɾ.
- Put the stress mark before the stressed syllable: "morgen" → [ˈmɔʁɡn̩], not [mˈɔɾɡən].

Respond in JSON format only:
{"german": "...", "ipa": "[...]", "russian": "..."}

Examples of corrections:
- "Bis du verheiratet." → "Bist du verheiratet?"
- "wie heisst du" → "Wie heißt du?"
- "ich bin student" → "Ich bin Student."`;

  if (ccHint) {
    systemPrompt += `\n\nClosed captions for this clip (authoritative — prefer this over the whisper transcription when they conflict):\n"${ccHint}"`;
  }

  if (subtitleContext) {
    systemPrompt += `\n\nBroader video subtitle context:\n${subtitleContext.slice(0, 2000)}`;
  }

  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: germanText,
      },
    ],
    response_format: ENRICH_RESPONSE_FORMAT,
    temperature: 0,
  });

  const content = response.choices[0].message.content;
  const result = JSON.parse(content);

  const german = result.german || germanText;
  const ipa = await generateGermanIpa(german, { fallbackIpa: result.ipa || '' });
  const cefr = await estimateCEFR(german);

  return {
    german,
    ipa,
    russian: result.russian || '',
    cefr,
  };
}

export async function reviewEnrichedText(currentData, feedback, options = {}) {
  const client = await getClient();
  const requiredTerms = Array.isArray(options.requiredTerms)
    ? options.requiredTerms.map((term) => String(term || '').trim()).filter(Boolean)
    : [];
  const includeImageBrief = Boolean(options.includeImageBrief);

  let systemPrompt = `You are a German language expert reviewing a flashcard draft.

Your task:
1. Recheck the German sentence or phrase
2. Fix any mistakes or awkward wording
3. Provide fallback IPA so it matches the final German text exactly
4. Update the Russian translation so it sounds natural in Russian
5. Apply the user's feedback directly

Rules:
- Keep the final German concise, natural, and learner-friendly.
- Keep the intended meaning aligned unless the user's feedback explicitly asks for a different meaning.
- If the current card is already good, make only the smallest needed adjustment.
- Russian must stay in Russian, never English.
- IPA must be in square brackets.
- IPA must use Standard German conventions: use ʁ/ɐ̯ for German r where appropriate, never ɾ; place stress before the stressed syllable.
- Return JSON only. Do not explain your changes.`;

  if (options.cardPurpose) {
    systemPrompt += `\n- Card purpose: ${options.cardPurpose}`;
  }

  if (requiredTerms.length > 0) {
    systemPrompt += `\n- Keep these German words or forms in the final text if possible: ${requiredTerms.join(', ')}`;
  }

  if (options.extraGuidance) {
    systemPrompt += `\n- Extra guidance: ${options.extraGuidance}`;
  }

  if (includeImageBrief) {
    systemPrompt += `
- Also return imageBrief for image search.
- imageBrief.searchQuery and imageBrief.queryVariants must be German.
- imageBrief should visually convey the sentence with emphasis on the target word or form.
- Prefer noun-anchored or scene-anchored queries over isolated adjectives.
- Keep mustShow and avoid short and concrete.`;
  }

  const responseShape = includeImageBrief
    ? '{"german":"...","ipa":"[...]","russian":"...","imageBrief":{"searchQuery":"...","queryVariants":["..."],"sceneSummary":"...","focusRole":"...","mustShow":["..."],"avoid":["..."],"imagePrompt":"..."}}'
    : '{"german":"...","ipa":"[...]","russian":"..."}';

  const userPrompt = `Current German: ${currentData.german || ''}
Current IPA: ${currentData.ipa || ''}
Current Russian: ${currentData.russian || ''}
User feedback: ${feedback}

Return JSON in this shape:
${responseShape}`;

  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    response_format: buildReviewResponseFormat(includeImageBrief),
    temperature: 0,
  });

  const content = response.choices[0].message.content;
  const result = JSON.parse(content);

  const german = String(result.german || currentData.german || '').trim() || String(currentData.german || '').trim();
  const germanChanged = normalizeGermanForCompare(german) !== normalizeGermanForCompare(currentData.german || '');
  const fallbackIpa = result.ipa || (germanChanged ? '' : currentData.ipa || '');
  const ipa = await generateGermanIpa(german, { fallbackIpa: normalizeIpa(fallbackIpa) });
  const russian = String(result.russian || currentData.russian || '').trim();
  const cefr = await estimateCEFR(german);

  return {
    german,
    ipa,
    russian,
    cefr,
    ...(includeImageBrief ? { imageBrief: sanitizeImageBrief(result.imageBrief) } : {}),
  };
}
