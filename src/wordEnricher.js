import OpenAI from 'openai';
import { config, CONFIG_PATH_DISPLAY } from './lib/config.js';
import { getWordFrequencyInfo } from './lib/wordFrequency.js';
import { normalizeGermanForCompare } from './cardContent/german.js';
import { normalizeWordIpa } from './cardContent/ipa.js';
import { resolveSecret } from './lib/secrets.js';

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

const COLOR_ADJECTIVES = new Set([
  'rot',
  'blau',
  'gelb',
  'gruen',
  'grün',
  'schwarz',
  'weiss',
  'weiß',
  'braun',
  'grau',
  'rosa',
  'pink',
  'orange',
  'lila',
  'violett',
  'bunt',
  'farbenfroh',
]);

const NON_ADJECTIVE_BARE_ADVERBS = new Set([
  'oft',
  'gern',
  'bald',
  'sehr',
  'hier',
  'dort',
  'heute',
  'gestern',
  'morgen',
  'damals',
  'schon',
  'noch',
  'immer',
  'nie',
  'wieder',
  'vielleicht',
  'sofort',
  'zusammen',
  'deshalb',
  'darum',
  'deswegen',
  'also',
  'dann',
  'oben',
  'unten',
  'links',
  'rechts',
]);

const EVERYDAY_FAMILY_NOUN_FALLBACKS = {
  opa: {
    article: 'der',
    gender: 'masculine',
    canonical: 'der Opa',
    lemma: 'Opa',
    plural: 'Opas',
    meanings: [
      {
        russian: 'дедушка',
        english: 'grandpa',
        imageSearchTerms: ['Opa Enkel', 'Opa Familie', 'älterer Mann Enkel'],
      },
    ],
    exampleSentences: [
      {
        german: 'Mein Opa ist nett.',
        russian: 'Мой дедушка добрый.',
      },
    ],
  },
  oma: {
    article: 'die',
    gender: 'feminine',
    canonical: 'die Oma',
    lemma: 'Oma',
    plural: 'Omas',
    meanings: [
      {
        russian: 'бабушка',
        english: 'grandma',
        imageSearchTerms: ['Oma Enkel', 'Oma Familie', 'ältere Frau Enkel'],
      },
    ],
    exampleSentences: [
      {
        german: 'Meine Oma ist nett.',
        russian: 'Моя бабушка добрая.',
      },
    ],
  },
  mama: {
    article: 'die',
    gender: 'feminine',
    canonical: 'die Mama',
    lemma: 'Mama',
    plural: 'Mamas',
    meanings: [
      {
        russian: 'мама',
        english: 'mom',
        imageSearchTerms: ['Mama Kind', 'Mama Familie', 'Mutter Kind'],
      },
    ],
    exampleSentences: [
      {
        german: 'Meine Mama ist hier.',
        russian: 'Моя мама здесь.',
      },
    ],
  },
  papa: {
    article: 'der',
    gender: 'masculine',
    canonical: 'der Papa',
    lemma: 'Papa',
    plural: 'Papas',
    meanings: [
      {
        russian: 'папа',
        english: 'dad',
        imageSearchTerms: ['Papa Kind', 'Papa Familie', 'Vater Kind'],
      },
    ],
    exampleSentences: [
      {
        german: 'Mein Papa ist hier.',
        russian: 'Мой папа здесь.',
      },
    ],
  },
};

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

function buildWordSystemPrompt({ forceVisibleNoun = false, forceBareLexicalCandidate = false } = {}) {
  const retryInstructions = forceVisibleNoun ? `
- The user explicitly wants a picture-word card for a visible noun that may depict a scene rather than a handheld object.
- Visible scene nouns like "der Himmel", "die Sonne", "der Mond", "die Wolke", "das Meer", "der Wald" are imageable and should be accepted.
- Only reject if the input is clearly not a noun or cannot be normalized into a noun.` : '';
  const lexicalRetryInstructions = forceBareLexicalCandidate ? `
- The user explicitly entered a single bare German word for word mode. It may be a lowercase noun, adjective, or adverb.
- Do not reject solely because the input is short, lowercase, or lacks an article.
- Short adjectives like "eng", "breit", "weich", "froh", and "leer" are valid adjective inputs and should not be treated as fragments or abbreviations.
- If the bare word can function as both adjective and adverb in German, prefer the adjective analysis for word mode.
- If the input is plausibly a noun, adjective, or common adverb, return the best lexical analysis instead of rejecting it.` : '';

  return `You are a German language expert and Fluent Forever consultant.

Analyze a single German input for noun, adjective, or adverb flashcards in word mode.

Rules:
- Accept nouns, adjectives, and common adverbs that can work as strong learner cards in word mode.
- Reject verbs, modal particles, and unrelated full phrases that are not suitable lexical cards.
- Do not reject a noun solely because it is colloquial if it is common everyday family vocabulary.
- Everyday kinship nouns like "Opa", "Oma", "Mama", and "Papa" are valid learner cards and should be accepted.
- Always set lexicalType to noun, adjective, or adverb.
- Always normalize accepted nouns into canonical singular form with article.
- Always normalize accepted adjectives into the positive/base form with no article.
- Always normalize accepted adverbs into the base lexical form with no article.
- Visible natural things and scene nouns such as "der Himmel", "die Sonne", "der Mond", "die Wolke", "der Stern", "der Regenbogen", "das Meer", and "der Wald" are imageable and should usually be accepted.
- Basic everyday nouns that can be represented with stable visual proxies or familiar situations should also usually be accepted.
- Examples: "der Preis" with a price tag, "der Termin" with a calendar entry, "das Datum" with a marked date, "der Montag" with a calendar page, "die Frage" with a person asking or a question mark.
- Do not reject nouns just because they need a proxy image like a calendar, sign, label, document, or interface.
- Accept adjectives only when they are strongly imageable or visually contrastive.
- Good adjective candidates include colors, sizes, temperatures, shapes, textures, and visible states such as "rot", "groß", "kalt", "rund", "nass", "leer", "offen".
- In German, many bare adjectives can also be used adverbially. If a word like "früh", "spät", "schnell", or "langsam" has a valid adjective reading, analyze it as an adjective for word mode instead of rejecting it as an adverb.
- For abstract or non-visual high-frequency adjectives like "wichtig", "möglich", "deutlich", "schwierig", or "interessant", do NOT reject them. Instead set recommendedMode="sentence-form" and provide short example sentences.
- Common adjectives like "gut", "schlecht", "besser", "wichtig", "einfach", and "schwer" should stay usable even when they are not strongly visual.
- For accepted adjectives, provide a short concrete anchorPhrase in German such as "roter Apfel" or "offene Tür".
- For accepted adjectives, provide opposite when there is a natural everyday contrast like "klein" for "groß" or "geschlossen" for "offen". If no clear opposite helps, set opposite to null.
- For color adjectives like "blau", "rot", or "gelb", set opposite to null. Do not invent color contrasts such as "rot" for "blau".
- For place or institution nouns in German culture, prefer target-language visual anchors and German search terms.
- Example: for "die Apotheke", prefer "Apotheke Schild", "Apotheke Eingang", "Apotheke innen", or "deutsche Apotheke" over generic English "pharmacy" images.
- For nouns with multiple meanings, provide up to 3 short meaning options.
- For accepted nouns, provide 1 short natural example sentence in German with a Russian translation that uses the noun in a common everyday context.
- Keep noun example sentences simple, concrete, and short.
- For adjectives with multiple meanings, keep only the concrete visual sense that matches the intended picture card.
- Russian glosses should be concise and represent a single intended sense.
- English glosses are metadata and may be used only as a fallback for search.
- imageSearchTerms must be written primarily in German, ordered from best visual search to broadest fallback.
- Use English search phrases only as a last resort when there is no natural German phrase.
- Prefer prototypical everyday depictions over scenic/background scenes, unless the noun itself is a scene or natural phenomenon like "der Himmel".
- For substances like water, milk, coffee, beer, etc., prefer container/use views such as "Glas Wasser", "Flasche Wasser", or "Leitungswasser", not landscapes or lakes.
- For adjectives, imageSearchTerms should describe concrete scenes or contrasts, not just the dictionary label.
- Example: for "groß", prefer "großer Hund neben kleinem Hund" or "großes Auto" over just "groß".
- Use recommendedMode="picture-word" for nouns and for strongly imageable adjectives.
- Use recommendedMode="sentence-form" for adjectives that are common and useful but not learnable from a single stable image.
- Use recommendedMode="sentence-form" for accepted adverbs.
- Common adverbs like "sofort", "oft", "später", "früher", "dort", "hier", "oben", "unten", "zusammen", and "allein" should usually be accepted when they can be taught through short concrete example sentences.
- Modal particles and discourse fillers such as "doch", "ja", "mal", and "halt" should usually be rejected unless the input has a clear stable lexical adverb reading.
- For sentence-form adjectives, provide exactly 3 short natural example sentences in German with Russian translations.
- For sentence-form adverbs, provide exactly 3 short natural example sentences in German with Russian translations.
- For each sentence-form adjective example sentence, include imageBrief with a strong German searchQuery, 3-6 German queryVariants, a short sceneSummary, a focusRole that says what visually conveys the adjective, 2-5 mustShow constraints, 2-5 avoid constraints, and a concise imagePrompt.
- For each sentence-form adverb example sentence, include imageBrief with a strong German searchQuery, 3-6 German queryVariants, a short sceneSummary, a focusRole that says what visually conveys the adverb in the scene or timing, 2-5 mustShow constraints, 2-5 avoid constraints, and a concise imagePrompt.
- searchQuery and queryVariants should emphasize the noun or scene carrying the adjective, not the adjective in isolation.
- Example: for "Ich finde das Kleid hässlich", prefer "hässliches Kleid" over just "hässlich".
- For interpersonal or social adjectives such as "nett", "freundlich", "höflich", "hilfsbereit", "gemein", or "unhöflich", the imageBrief must depict observable behavior, not just a person label.
- For these social adjectives, prefer interaction queries like "freundliche Verkäuferin hilft Kundin", "Mann hält Tür höflich auf", or "gemeines Kind lacht anderes Kind aus" over weak queries like "nette Frau" or "freundlicher Mann".
- For these social adjectives, mustShow should include the visible interaction or gesture, and avoid should explicitly include portraits, selfies, headshots, glamour photos, and isolated person shots when they hide the adjective.
- IPA must be in square brackets.
- IPA must use Standard German conventions: use ʁ/ɐ̯ for German r where appropriate, never ɾ; place stress before the stressed syllable.
- For nouns, return the plain plural noun without article. If the noun usually has no plural, set noPlural=true.
- For adjectives and adverbs, set article, gender, plural to null and noPlural to false.
- For adverbs, set anchorPhrase and opposite to null.
- If you reject an identifiable noun, adjective, or adverb, still return best-effort values for canonical, lemma, meanings, and imageability fields.
${retryInstructions}
${lexicalRetryInstructions}

Respond in JSON only:
{
  "shouldCreateWordCard": true,
  "rejectionReason": null,
  "lexicalType": "noun",
  "canonical": "das Wasser",
  "lemma": "Wasser",
  "article": "das",
  "gender": "neuter",
  "ipa": "[...]",
  "register": "neutral",
  "isImageable": true,
  "imageabilityReason": "concrete substance, clear visual association",
  "recommendedMode": "picture-word",
  "plural": null,
  "noPlural": true,
  "anchorPhrase": null,
  "opposite": null,
  "meanings": [
    {
      "russian": "вода",
      "english": "water",
      "imageSearchTerms": ["Glas Wasser", "Trinkwasser", "Wasser"]
    }
  ],
  "exampleSentences": [
    {
      "german": "Das Wasser ist kalt.",
      "russian": "Вода холодная.",
      "focusForm": "kalt",
      "imageBrief": {
        "searchQuery": "kaltes Wasser im Glas",
        "queryVariants": ["Glas kaltes Wasser", "kaltes Trinkwasser", "kaltes Wasser"],
        "sceneSummary": "A glass of cold water is the clear subject.",
        "focusRole": "The water should look cold, not just visible.",
        "mustShow": ["glass or bottle", "water as main subject", "cold visual cues"],
        "avoid": ["landscapes", "lakes", "waterfalls"],
        "imagePrompt": "Photo of a glass of cold water with visible cold cues such as condensation."
      }
    }
  ]
}

lexicalType must be one of: noun, adjective, adverb.
recommendedMode must be one of: picture-word, sentence-form.
Gender must be one of: masculine, feminine, neuter.
Register must be one of: neutral, colloquial, formal, specialized.
If rejected, set shouldCreateWordCard=false and explain why.`;
}

function sanitizeSentence(sentence = {}) {
  const rawBrief = sentence.imageBrief && typeof sentence.imageBrief === 'object'
    ? sentence.imageBrief
    : null;
  const imageBrief = rawBrief ? {
    searchQuery: String(rawBrief.searchQuery || '').trim() || null,
    queryVariants: Array.isArray(rawBrief.queryVariants)
      ? rawBrief.queryVariants.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
      : [],
    sceneSummary: String(rawBrief.sceneSummary || '').trim() || null,
    focusRole: String(rawBrief.focusRole || '').trim() || null,
    mustShow: Array.isArray(rawBrief.mustShow)
      ? rawBrief.mustShow.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
      : [],
    avoid: Array.isArray(rawBrief.avoid)
      ? rawBrief.avoid.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
      : [],
    imagePrompt: String(rawBrief.imagePrompt || '').trim() || null,
  } : null;

  return {
    german: String(sentence.german || '').trim(),
    russian: String(sentence.russian || '').trim(),
    focusForm: String(sentence.focusForm || '').trim(),
    imageBrief,
  };
}

function mergeExampleSentences(existing = [], additions = []) {
  const merged = [];
  const seen = new Set();

  for (const sentence of [...existing, ...additions].map(sanitizeSentence)) {
    if (!sentence.german) continue;
    const key = normalizeGermanForCompare(sentence.german);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(sentence);
    if (merged.length === 3) break;
  }

  return merged;
}

export function shouldSuppressAdjectiveContrast(result = {}) {
  if (result.lexicalType !== 'adjective') {
    return false;
  }

  const candidates = [
    result.lemma,
    result.canonical,
    result.anchorPhrase,
  ];

  return candidates.some((candidate) => COLOR_ADJECTIVES.has(normalizeGermanForCompare(candidate || '')));
}

function sanitizeWordAnalysis(result = {}) {
  const lexicalType = result.lexicalType === 'adjective'
    ? 'adjective'
    : result.lexicalType === 'adverb'
      ? 'adverb'
      : 'noun';
  const lemma = String(result.lemma || result.bareNoun || result.canonical || '').trim();
  const article = lexicalType === 'noun' ? String(result.article || '').trim() : null;
  const canonical = lexicalType === 'noun'
    ? String(result.canonical || [article, lemma].filter(Boolean).join(' ')).trim()
    : String(result.canonical || lemma).trim();
  const sanitized = {
    ...result,
    lexicalType,
    canonical,
    lemma: lexicalType === 'noun' ? lemma.replace(/^(der|die|das)\s+/i, '') : lemma,
    article,
    gender: lexicalType === 'noun' ? result.gender || null : null,
    recommendedMode: lexicalType === 'adverb'
      ? 'sentence-form'
      : result.recommendedMode === 'sentence-form' ||
      (lexicalType === 'adjective' && (result.isImageable === false || result.shouldCreateWordCard === false))
        ? 'sentence-form'
        : 'picture-word',
    plural: lexicalType === 'noun' ? result.plural || null : null,
    noPlural: lexicalType === 'noun' ? Boolean(result.noPlural) : false,
    anchorPhrase: lexicalType === 'adjective' ? String(result.anchorPhrase || '').trim() || null : null,
    opposite: lexicalType === 'adjective' ? String(result.opposite || '').trim() || null : null,
  };

  if (shouldSuppressAdjectiveContrast(sanitized)) {
    sanitized.opposite = null;
  }

  sanitized.bareNoun = sanitized.lexicalType === 'noun' ? sanitized.lemma : null;

  if (sanitized.ipa) {
    sanitized.ipa = normalizeWordIpa(sanitized.canonical, sanitized.ipa);
  }

  sanitized.meanings = Array.isArray(sanitized.meanings)
    ? sanitized.meanings.filter(Boolean).slice(0, 3)
    : [];

  sanitized.exampleSentences = Array.isArray(result.exampleSentences)
    ? result.exampleSentences.map(sanitizeSentence).filter((sentence) => sentence.german).slice(0, 3)
    : [];

  return sanitized;
}

function hydrateFallbackModifierAnalysis(input, result = {}) {
  if (result.lexicalType !== 'adjective' && result.lexicalType !== 'adverb') {
    return result;
  }

  const rawInput = String(input || '').trim();
  if (!rawInput) {
    return result;
  }

  return {
    ...result,
    canonical: result.canonical || rawInput,
    lemma: result.lemma || rawInput,
  };
}

function extractRetryCandidate(input, result = {}) {
  const candidate = result.lemma || result.bareNoun || result.canonical || input || '';
  const normalized = normalizeGermanForCompare(candidate).replace(/^(der|die|das)\s+/, '');
  return normalized;
}

function looksLikeBareLexicalInput(input = '') {
  const rawInput = String(input || '').trim();
  return Boolean(
    rawInput &&
    !/\s/.test(rawInput) &&
    rawInput === rawInput.toLowerCase() &&
    /^[\p{L}-]+$/u.test(rawInput)
  );
}

export function hasStructuredWordAnalysis(result = {}) {
  if (result.lexicalType === 'adjective' || result.lexicalType === 'adverb') {
    return Boolean(
      result.canonical &&
      (result.lemma || result.bareNoun)
    );
  }

  return Boolean(
    result.canonical &&
    (result.lemma || result.bareNoun) &&
    result.article &&
    result.gender &&
    Array.isArray(result.meanings) &&
    result.meanings.length > 0
  );
}

export function canProceedWithWeakWordCard(result = {}) {
  return (result.lexicalType || 'noun') === 'noun' && hasStructuredWordAnalysis(result);
}

export function shouldRetryImageableNounRejection(input, result = {}) {
  if (!result || (result.shouldCreateWordCard !== false && result.isImageable !== false)) {
    return false;
  }

  return VISUAL_SCENE_NOUNS.has(extractRetryCandidate(input, result));
}

export function shouldRetryBareLexicalRejection(input, result = {}) {
  if (!result || result.shouldCreateWordCard !== false) {
    return false;
  }

  if (result.lexicalType === 'adjective') {
    return false;
  }

  if (result.lexicalType === 'noun' && hasStructuredWordAnalysis(result)) {
    return false;
  }

  if (!looksLikeBareLexicalInput(input)) {
    return false;
  }

  const rejectionReason = normalizeGermanForCompare(result.rejectionReason || '');
  if (/\bverb|phrase\b/.test(rejectionReason)) {
    return false;
  }

  const frequencyInfo = getWordFrequencyInfo(input);
  if (!frequencyInfo.rank || frequencyInfo.rank > 5000) {
    return false;
  }

  if (/adverb/.test(rejectionReason)) {
    return !NON_ADJECTIVE_BARE_ADVERBS.has(normalizeGermanForCompare(input));
  }

  if (/colloquial|strong learner card|criteria/.test(rejectionReason)) {
    return Object.hasOwn(EVERYDAY_FAMILY_NOUN_FALLBACKS, normalizeGermanForCompare(input));
  }

  return /not a noun or adjective|fragment|abbreviation|unclear|unrecognized|unknown/.test(rejectionReason);
}

export function buildBareLexicalAdjectiveFallback(input, result = {}) {
  const rawInput = String(input || '').trim();
  const fallbackMeanings = Array.isArray(result.meanings)
    ? result.meanings.filter(Boolean).slice(0, 3)
    : [];
  const fallbackSentences = Array.isArray(result.exampleSentences)
    ? result.exampleSentences.filter((sentence) => sentence?.german).slice(0, 3)
    : [];

  return {
    ...result,
    shouldCreateWordCard: false,
    rejectionReason: result.rejectionReason || 'Weak lexical analysis; falling back to sentence-form adjective mode.',
    lexicalType: 'adjective',
    canonical: rawInput || result.canonical || result.lemma || '',
    lemma: rawInput || result.lemma || result.canonical || '',
    article: null,
    gender: null,
    recommendedMode: 'sentence-form',
    isImageable: false,
    imageabilityReason: result.imageabilityReason || 'needs sentence context',
    plural: null,
    noPlural: false,
    bareNoun: null,
    anchorPhrase: null,
    opposite: result.opposite || null,
    meanings: fallbackMeanings,
    exampleSentences: fallbackSentences,
  };
}

export function shouldFallbackBareAdverbRejection(input, result = {}) {
  if (!result || result.shouldCreateWordCard !== false) {
    return false;
  }

  if (!looksLikeBareLexicalInput(input)) {
    return false;
  }

  const rejectionReason = normalizeGermanForCompare(result.rejectionReason || '');
  if (!/adverb/.test(rejectionReason)) {
    return false;
  }

  if (!NON_ADJECTIVE_BARE_ADVERBS.has(normalizeGermanForCompare(input))) {
    return false;
  }

  const frequencyInfo = getWordFrequencyInfo(input);
  return Boolean(frequencyInfo.rank && frequencyInfo.rank <= 5000);
}

export function buildBareLexicalAdverbFallback(input, result = {}) {
  const rawInput = String(input || '').trim();
  const fallbackMeanings = Array.isArray(result.meanings)
    ? result.meanings.filter(Boolean).slice(0, 3)
    : [];
  const fallbackSentences = Array.isArray(result.exampleSentences)
    ? result.exampleSentences.filter((sentence) => sentence?.german).slice(0, 3)
    : [];

  return {
    ...result,
    shouldCreateWordCard: false,
    rejectionReason: result.rejectionReason || 'Bare adverb; falling back to sentence-form adverb mode.',
    lexicalType: 'adverb',
    canonical: rawInput || result.canonical || result.lemma || '',
    lemma: rawInput || result.lemma || result.canonical || '',
    article: null,
    gender: null,
    recommendedMode: 'sentence-form',
    isImageable: false,
    imageabilityReason: result.imageabilityReason || 'better learned in sentence context',
    plural: null,
    noPlural: false,
    bareNoun: null,
    anchorPhrase: null,
    opposite: null,
    meanings: fallbackMeanings,
    exampleSentences: fallbackSentences,
  };
}

export function buildEverydayFamilyNounFallback(input, result = {}) {
  const fallback = EVERYDAY_FAMILY_NOUN_FALLBACKS[normalizeGermanForCompare(input)];
  if (!fallback) {
    return result;
  }

  return sanitizeWordAnalysis({
    ...result,
    shouldCreateWordCard: true,
    rejectionReason: null,
    lexicalType: 'noun',
    register: 'colloquial',
    isImageable: true,
    imageabilityReason: 'everyday family member, clear visual depiction',
    recommendedMode: 'picture-word',
    noPlural: false,
    article: fallback.article,
    gender: fallback.gender,
    canonical: fallback.canonical,
    lemma: fallback.lemma,
    plural: fallback.plural,
    meanings: fallback.meanings,
    exampleSentences: fallback.exampleSentences,
    anchorPhrase: null,
    opposite: null,
  });
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

  return hydrateFallbackModifierAnalysis(
    input,
    sanitizeWordAnalysis(JSON.parse(response.choices[0].message.content))
  );
}

async function completeSentenceExamplesIfNeeded(client, result) {
  if (
    result.shouldCreateWordCard === false ||
    result.recommendedMode !== 'sentence-form' ||
    result.exampleSentences.length >= 3
  ) {
    return result;
  }

  const completion = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: 'system',
        content: 'Return JSON only. Generate short natural German example sentences with Russian translations for a German lexical flashcard.',
      },
      {
        role: 'user',
        content: `Word: ${result.canonical}\nLexical type: ${result.lexicalType}\nExisting examples to avoid:\n${result.exampleSentences.map((sentence) => `- ${sentence.german}`).join('\n') || '- none'}\nReturn exactly ${3 - result.exampleSentences.length} additional examples as {"exampleSentences":[{"german":"","russian":"","focusForm":"","imageBrief":{"searchQuery":"","queryVariants":[],"sceneSummary":"","focusRole":"","mustShow":[],"avoid":[],"imagePrompt":""}}]}.`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });
  const extra = JSON.parse(completion.choices[0].message.content);

  return {
    ...result,
    exampleSentences: mergeExampleSentences(result.exampleSentences, extra.exampleSentences),
  };
}

export async function enrichWord(input) {
  const client = await getClient();
  const result = await requestWordAnalysis(client, input);
  const completed = await completeSentenceExamplesIfNeeded(client, result);

  if (shouldRetryImageableNounRejection(input, completed)) {
    return requestWordAnalysis(client, input, { forceVisibleNoun: true });
  }

  if (shouldRetryBareLexicalRejection(input, completed)) {
    const retried = await requestWordAnalysis(client, input, { forceBareLexicalCandidate: true });
    if (shouldFallbackBareAdverbRejection(input, retried)) {
      return buildBareLexicalAdverbFallback(input, retried);
    }
    if (retried.shouldCreateWordCard === false) {
      const familyFallback = buildEverydayFamilyNounFallback(input, retried);
      if (familyFallback !== retried) {
        return familyFallback;
      }
    }
    if (shouldRetryBareLexicalRejection(input, retried)) {
      return buildBareLexicalAdjectiveFallback(input, retried);
    }
    return retried;
  }

  if (completed.shouldCreateWordCard === false) {
    if (shouldFallbackBareAdverbRejection(input, completed)) {
      return buildBareLexicalAdverbFallback(input, completed);
    }
    const familyFallback = buildEverydayFamilyNounFallback(input, completed);
    if (familyFallback !== completed) {
      return familyFallback;
    }
  }

  return completed;
}
