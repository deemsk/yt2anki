import OpenAI from 'openai';
import { config, CONFIG_PATH_DISPLAY } from './config.js';
import { estimateCEFR } from './cefr.js';
import { resolveSecret } from './secrets.js';

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
  const raw = String(ipa || '').trim();
  if (!raw) {
    return '';
  }

  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw;
  }

  return `[${raw.replace(/^\[/, '').replace(/\]$/, '').trim()}]`;
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
4. Provide IPA transcription in square brackets
5. Provide Russian translation

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
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const content = response.choices[0].message.content;
  const result = JSON.parse(content);

  // Ensure IPA is always in square brackets
  let ipa = result.ipa || '';
  if (ipa && !ipa.startsWith('[')) {
    ipa = `[${ipa}]`;
  }

  const german = result.german || germanText;
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
3. Update the IPA so it matches the final German text
4. Update the Russian translation so it sounds natural in Russian
5. Apply the user's feedback directly

Rules:
- Keep the final German concise, natural, and learner-friendly.
- Keep the intended meaning aligned unless the user's feedback explicitly asks for a different meaning.
- If the current card is already good, make only the smallest needed adjustment.
- Russian must stay in Russian, never English.
- IPA must be in square brackets.
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
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const content = response.choices[0].message.content;
  const result = JSON.parse(content);

  const german = String(result.german || currentData.german || '').trim() || String(currentData.german || '').trim();
  const ipa = normalizeIpa(result.ipa || currentData.ipa || '');
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
