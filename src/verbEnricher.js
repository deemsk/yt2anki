import OpenAI from 'openai';
import { config, CONFIG_PATH_DISPLAY } from './config.js';
import { normalizeGermanForCompare } from './cardContent/german.js';
import { normalizeWordIpa } from './cardContent/ipa.js';
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

function buildVerbSystemPrompt() {
  return `You are a German language expert and Fluent Forever consultant.

Analyze a single German input for verb flashcards.

Rules:
- Accept verbs and verb forms. Reject nouns, adjectives, adverbs, and full unrelated phrases that cannot be normalized to a verb.
- Always normalize the main lemma to the infinitive.
- Preserve the user's encountered form in displayForm when the input is a conjugated or inflected form.
- Accept past participles and participial forms when they clearly map to a German verb. Normalize them to the infinitive and preserve the participle in displayForm.
- Example: for "verbunden", return infinitive="verbinden", displayForm="verbunden", and dictionaryFormNeeded=true.
- Use recommendedMode="picture-word" only for highly imageable, concrete action verbs with a stable one-frame depiction.
- Use recommendedMode="sentence-form" for modal verbs, auxiliary verbs, abstract verbs, reflexive verbs, separable-prefix verbs that depend on context, and other verbs that are better learned through example sentences.
- For picture-word verbs, imageSearchTerms must be in German and should describe visible action scenes, not dictionary labels.
- For sentence-form verbs, provide 2-3 short natural example sentences in German with Russian translations.
- dictionaryFormNeeded should be true when displayForm differs from infinitive or when the encountered form is likely non-obvious.
- IPA must be in square brackets.
- If the input is a verb but weak for picture cards, still return the normalized analysis and recommend sentence-form mode instead of rejecting it.

Respond in JSON only:
{
  "shouldCreateVerbCard": true,
  "rejectionReason": null,
  "canonical": "laufen",
  "infinitive": "laufen",
  "displayForm": "läuft",
  "ipa": "[ˈlaʊfn̩]",
  "register": "neutral",
  "isImageable": true,
  "imageabilityReason": "clear body action",
  "recommendedMode": "picture-word",
  "dictionaryFormNeeded": true,
  "meanings": [
    {
      "russian": "бежать",
      "english": "run",
      "imageSearchTerms": ["Mann läuft", "laufen im Park", "joggen"]
    }
  ],
  "exampleSentences": [
    {
      "german": "Er läuft jeden Morgen im Park.",
      "russian": "Он бегает каждое утро в парке.",
      "focusForm": "läuft"
    }
  ]
}

recommendedMode must be one of: picture-word, sentence-form.
Register must be one of: neutral, colloquial, formal, specialized.
If rejected, set shouldCreateVerbCard=false and explain why.`;
}

function sanitizeSentence(sentence = {}) {
  return {
    german: String(sentence.german || '').trim(),
    russian: String(sentence.russian || '').trim(),
    focusForm: String(sentence.focusForm || '').trim(),
  };
}

export function shouldOfferDictionaryFormCard(verbData = {}, focusForm = null) {
  const displayForm = normalizeGermanForCompare(focusForm || verbData.displayForm || '');
  const infinitive = normalizeGermanForCompare(verbData.infinitive || '');

  if (!displayForm || !infinitive) {
    return false;
  }

  return Boolean(verbData.dictionaryFormNeeded) || displayForm !== infinitive;
}

function sanitizeVerbAnalysis(result = {}) {
  const sanitized = {
    ...result,
    canonical: String(result.canonical || result.infinitive || '').trim(),
    infinitive: String(result.infinitive || result.canonical || '').trim(),
    displayForm: String(result.displayForm || result.infinitive || result.canonical || '').trim(),
    recommendedMode: result.recommendedMode === 'picture-word' ? 'picture-word' : 'sentence-form',
  };

  if (sanitized.ipa) {
    sanitized.ipa = normalizeWordIpa(sanitized.infinitive, sanitized.ipa);
  }

  sanitized.meanings = Array.isArray(sanitized.meanings)
    ? sanitized.meanings.filter(Boolean).slice(0, 3)
    : [];

  sanitized.exampleSentences = Array.isArray(sanitized.exampleSentences)
    ? sanitized.exampleSentences.map(sanitizeSentence).filter((sentence) => sentence.german).slice(0, 3)
    : [];

  return sanitized;
}

export function hasStructuredVerbAnalysis(result = {}) {
  return Boolean(
    result.infinitive &&
    result.displayForm &&
    Array.isArray(result.meanings) &&
    result.meanings.length > 0
  );
}

export async function enrichVerb(input) {
  const client = await getClient();
  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      { role: 'system', content: buildVerbSystemPrompt() },
      { role: 'user', content: input },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  return sanitizeVerbAnalysis(JSON.parse(response.choices[0].message.content));
}
