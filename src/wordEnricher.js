import OpenAI from 'openai';
import { config, CONFIG_PATH_DISPLAY } from './lib/config.js';
import { getWordFrequencyInfo } from './lib/wordFrequency.js';
import { normalizeGermanForCompare } from './cardContent/german.js';
import { normalizeWordIpa } from './cardContent/ipa.js';
import { getCuratedFunctionWordAnalysis } from './cardContent/functionWords.js';
import { isFunctionLexicalType, normalizeLexicalType } from './cardContent/lexicalTypes.js';
import {
  COLOR_ADJECTIVES,
  COMMON_FUNCTION_WORD_TYPES,
  EVERYDAY_FAMILY_NOUN_FALLBACKS,
  NON_ADJECTIVE_BARE_ADVERBS,
  VISUAL_SCENE_NOUNS,
} from './data/wordEnricherStatic.js';
import { resolveSecret } from './lib/secrets.js';

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

function buildWordSystemPrompt({
  forceVisibleNoun = false,
  forceBareLexicalCandidate = false,
  forceGermanInputIdentity = false,
  forceFunctionWordCandidate = false,
} = {}) {
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
  const germanInputIdentityInstructions = forceGermanInputIdentity ? `
- The previous analysis appears to have replaced the typed German input with a different German word.
- Do not substitute synonyms, translations, or English false-friend meanings.
- Preserve the user's German lexical item. Normalize only by German article, case, gender, number, or inflection when that is truly a direct German lemma.
- Example: German input "also" means "so/therefore/well"; canonical must be "also", never "auch".` : '';
  const functionWordRetryInstructions = forceFunctionWordCandidate ? `
- The user entered a high-frequency German function word or short adverb.
- Do not reject it just because it is abstract, grammatical, or not imageable.
- Return a cloze-form lexical analysis with clear short examples that contain the exact typed surface form where possible.
- For personal pronoun case forms like "mich", "mir", "dich", "dir", "ihn", "ihm", "uns", "euch", and "ihnen", keep the typed case form as canonical instead of replacing it with nominative "ich", "du", "er", or "sie".
- For article/determiner forms like "den", "dem", "einen", or "keine", prefer the typed surface form as canonical when the learner likely needs that form.` : '';

  return `You are a German language expert and Fluent Forever consultant.

Analyze a single German lexical input for flashcards in word mode.

Rules:
- The user input is always German. Never interpret it as English, Russian, or another language.
- Do not translate the input into German. Analyze the German lexical item the user typed.
- Be careful with false friends and homographs: German "also" means "so/therefore/well", not English "also" (= German "auch").
- Accept nouns, adjectives, common adverbs, prepositions, conjunctions, subjunctions, pronouns, determiners, particles, numerals, and interjections that can work as strong learner cards.
- Reject verbs and unrelated full phrases that are not suitable lexical cards.
- Do not reject a noun solely because it is colloquial if it is common everyday family vocabulary.
- Everyday kinship nouns like "Opa", "Oma", "Mama", and "Papa" are valid learner cards and should be accepted.
- Always set lexicalType to noun, adjective, adverb, preposition, conjunction, subjunction, pronoun, determiner, particle, numeral, or interjection.
- Always normalize accepted nouns into canonical singular form with article.
- Always normalize accepted adjectives into the positive/base form with no article.
- Always normalize accepted adverbs into the base lexical form with no article.
- Always normalize function words into the base lexical form with no article.
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
- Every accepted lexical analysis must include at least one meaning option with a non-empty Russian lexical gloss.
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
- Use recommendedMode="sentence-form" for accepted adverbs when the sentence itself is the learning target.
- Use recommendedMode="cloze-form" for function words where the learner should recall the word from sentence context.
- Use recommendedMode="cloze-form" for short scope, polarity, frequency, or connector-like adverbs when recalling the exact lexical item from context is the learning target.
- Treat German question words such as "warum", "wann", "wo", and "wie" as interrogative adverbs for lexical cards, not as conjunctions.
- Treat German personal pronoun case forms such as "mich", "mir", "dich", "dir", "ihn", "ihm", "uns", "euch", and "ihnen" as pronoun cards in their typed surface form.
- Treat German articles and determiners such as "der", "den", "dem", "ein", "eine", "kein", and "keine" as cloze-form determiner cards when the user enters them directly.
- Common adverbs like "sofort", "oft", "später", "früher", "dort", "hier", "oben", "unten", "zusammen", and "allein" should usually be accepted when they can be taught through short concrete example sentences.
- Function words such as "aber", "wenn", "nichts", "mit", "für", "weil", "dass", "doch", "ja", "mal", and "halt" should usually be accepted only when they can be taught with clear cloze sentences.
- For sentence-form adjectives, provide exactly 3 short natural example sentences in German with Russian translations.
- For sentence-form adverbs, provide exactly 3 short natural example sentences in German with Russian translations.
- For cloze-form function words or cloze-form adverbs, provide exactly 3 short natural example sentences in German with Russian translations and focusForm set to the target word surface form in each sentence.
- For cloze-form items, provide clozeHint as a short English hint such as "subordinate connector", "negative pronoun", or "frequency adverb".
- For cloze-form items, provide patternHint when word order or case behavior matters.
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
- For function words, set article, gender, plural, anchorPhrase, and opposite to null.
- For adverbs, set anchorPhrase and opposite to null.
- If you reject an identifiable lexical item, still return best-effort values for canonical, lemma, meanings, and imageability fields.
${retryInstructions}
${lexicalRetryInstructions}
${germanInputIdentityInstructions}
${functionWordRetryInstructions}

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
  "clozeHint": null,
  "patternHint": null,
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

lexicalType must be one of: noun, adjective, adverb, preposition, conjunction, subjunction, pronoun, determiner, particle, numeral, interjection.
recommendedMode must be one of: picture-word, sentence-form, cloze-form.
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

function sanitizeMeaning(meaning = {}) {
  const imageSearchTerms = Array.isArray(meaning.imageSearchTerms)
    ? meaning.imageSearchTerms.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
    : [];

  return {
    ...meaning,
    russian: String(meaning.russian || '').trim(),
    english: String(meaning.english || '').trim(),
    imageSearchTerms,
  };
}

function mergeMeanings(existing = [], additions = []) {
  const merged = [];
  const seen = new Set();

  for (const meaning of [...existing, ...additions].map(sanitizeMeaning)) {
    if (!meaning.russian && !meaning.english && meaning.imageSearchTerms.length === 0) continue;
    const key = normalizeGermanForCompare(`${meaning.russian} ${meaning.english}`) || meaning.imageSearchTerms.join('|').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(meaning);
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

/**
 * Chooses the card route requested by a sanitized lexical analysis.
 */
function resolveRecommendedMode(lexicalType, result = {}) {
  if (isFunctionLexicalType(lexicalType)) {
    return 'cloze-form';
  }

  if (result.recommendedMode === 'cloze-form') {
    return 'cloze-form';
  }

  if (lexicalType === 'adverb') {
    return 'sentence-form';
  }

  if (
    result.recommendedMode === 'sentence-form' ||
    (lexicalType === 'adjective' && (result.isImageable === false || result.shouldCreateWordCard === false))
  ) {
    return 'sentence-form';
  }

  return 'picture-word';
}

function sanitizeWordAnalysis(result = {}) {
  const lexicalType = normalizeLexicalType(result.lexicalType);
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
    recommendedMode: resolveRecommendedMode(lexicalType, result),
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
    ? mergeMeanings(sanitized.meanings, [])
    : [];

  sanitized.exampleSentences = Array.isArray(result.exampleSentences)
    ? result.exampleSentences.map(sanitizeSentence).filter((sentence) => sentence.german).slice(0, 3)
    : [];

  return sanitized;
}

function hydrateFallbackModifierAnalysis(input, result = {}) {
  if (result.lexicalType === 'noun') {
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

function getLikelyFunctionWordType(input = '') {
  return COMMON_FUNCTION_WORD_TYPES.get(normalizeGermanForCompare(input));
}

function analysisContainsGermanInputSurface(input = '', result = {}) {
  const normalizedInput = normalizeGermanForCompare(input);
  if (!normalizedInput) {
    return true;
  }

  const candidates = [
    result.canonical,
    result.lemma,
    result.bareNoun,
    ...(Array.isArray(result.exampleSentences)
      ? result.exampleSentences.flatMap((sentence) => [sentence?.german, sentence?.focusForm])
      : []),
  ];

  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeGermanForCompare(candidate || '');
    return normalizedCandidate === normalizedInput ||
      normalizedCandidate.startsWith(`${normalizedInput} `) ||
      normalizedCandidate.endsWith(` ${normalizedInput}`) ||
      normalizedCandidate.includes(` ${normalizedInput} `);
  });
}

export function shouldRetryGermanInputPreservation(input, result = {}) {
  if (!looksLikeBareLexicalInput(input)) {
    return false;
  }

  if (!result || result.shouldCreateWordCard === false) {
    return false;
  }

  return !analysisContainsGermanInputSurface(input, result);
}

export function shouldRetryFunctionWordRejection(input, result = {}) {
  if (!looksLikeBareLexicalInput(input)) {
    return false;
  }

  if (!getLikelyFunctionWordType(input)) {
    return false;
  }

  return !result || result.shouldCreateWordCard === false;
}

export function buildFunctionWordFallback(input, result = {}) {
  const rawInput = String(input || '').trim();
  const lexicalType = getLikelyFunctionWordType(rawInput) || normalizeLexicalType(result.lexicalType);
  const fallbackType = lexicalType === 'noun' ? 'particle' : lexicalType;
  const fallbackMeanings = Array.isArray(result.meanings)
    ? result.meanings.filter(Boolean).slice(0, 3)
    : [];
  const fallbackSentences = Array.isArray(result.exampleSentences)
    ? result.exampleSentences.filter((sentence) => sentence?.german).slice(0, 3)
    : [];

  return sanitizeWordAnalysis({
    ...result,
    shouldCreateWordCard: true,
    rejectionReason: null,
    lexicalType: fallbackType,
    canonical: rawInput || result.canonical || result.lemma || '',
    lemma: rawInput || result.lemma || result.canonical || '',
    article: null,
    gender: null,
    recommendedMode: 'cloze-form',
    isImageable: false,
    imageabilityReason: 'function word; learned through sentence context',
    plural: null,
    noPlural: false,
    bareNoun: null,
    anchorPhrase: null,
    opposite: null,
    clozeHint: result.clozeHint || `${fallbackType} in context`,
    patternHint: result.patternHint || null,
    meanings: fallbackMeanings,
    exampleSentences: fallbackSentences,
  });
}

function hasRussianMeaning(result = {}) {
  return Array.isArray(result.meanings) &&
    result.meanings.some((meaning) => String(meaning?.russian || '').trim());
}

export function shouldCompleteMissingMeanings(result = {}) {
  if (!result?.canonical || result.lexicalType === 'verb') {
    return false;
  }

  if (hasRussianMeaning(result)) {
    return false;
  }

  return result.shouldCreateWordCard !== false ||
    ['sentence-form', 'cloze-form'].includes(result.recommendedMode) ||
    Boolean(result.lemma || result.bareNoun);
}

export function hasStructuredWordAnalysis(result = {}) {
  const lexicalType = result.lexicalType || 'noun';

  if (lexicalType === 'verb') {
    return false;
  }

  if (lexicalType !== 'noun') {
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
      {
        role: 'user',
        content: `German lexical input: ${JSON.stringify(String(input || '').trim())}\nTreat the quoted input as German. Analyze that German word; do not translate it into another German word.`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  return hydrateFallbackModifierAnalysis(
    input,
    sanitizeWordAnalysis(JSON.parse(response.choices[0].message.content))
  );
}

async function requestCompletedWordAnalysis(client, input, options = {}) {
  const result = await requestWordAnalysis(client, input, options);
  return completeWordAnalysisIfNeeded(client, result);
}

async function completeWordAnalysisIfNeeded(client, result) {
  const withMeanings = await completeMeaningsIfNeeded(client, result);
  return completeSentenceExamplesIfNeeded(client, withMeanings);
}

async function completeMeaningsIfNeeded(client, result) {
  if (!shouldCompleteMissingMeanings(result)) {
    return result;
  }

  const completion = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: 'system',
        content: 'Return JSON only. Provide concise meaning options for a German lexical flashcard. The target is German; do not replace it with another German word. Every meaning must have a non-empty Russian lexical gloss.',
      },
      {
        role: 'user',
        content: `German target word: ${result.canonical}\nLexical type: ${result.lexicalType}\nEnglish hint, if any: ${result.meanings?.map((meaning) => meaning?.english).filter(Boolean).join('; ') || 'none'}\nExample sentences:\n${result.exampleSentences?.map((sentence) => `- ${sentence.german}${sentence.russian ? ` = ${sentence.russian}` : ''}`).join('\n') || '- none'}\nReturn 1-3 options as {"meanings":[{"russian":"","english":"","imageSearchTerms":[]}]}.`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });
  const extra = JSON.parse(completion.choices[0].message.content);

  return {
    ...result,
    meanings: mergeMeanings(extra.meanings, result.meanings),
  };
}

async function completeSentenceExamplesIfNeeded(client, result) {
  if (
    !['sentence-form', 'cloze-form'].includes(result.recommendedMode) ||
    result.exampleSentences.length >= 3 ||
    !result.canonical
  ) {
    return result;
  }

  const completion = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: 'system',
        content: 'Return JSON only. Generate short natural German example sentences with Russian translations for a German lexical flashcard. Treat the target word as German; do not translate it into a different German synonym.',
      },
      {
        role: 'user',
        content: `German target word: ${result.canonical}\nLexical type: ${result.lexicalType}\nEvery German example must contain this target word or a direct German inflected/surface form of it. Do not substitute a synonym or translation.\nExisting examples to avoid:\n${result.exampleSentences.map((sentence) => `- ${sentence.german}`).join('\n') || '- none'}\nReturn exactly ${3 - result.exampleSentences.length} additional examples as {"exampleSentences":[{"german":"","russian":"","focusForm":"","imageBrief":{"searchQuery":"","queryVariants":[],"sceneSummary":"","focusRole":"","mustShow":[],"avoid":[],"imagePrompt":""}}]}.`,
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
  const curatedFunctionWord = getCuratedFunctionWordAnalysis(input);
  if (curatedFunctionWord) {
    return curatedFunctionWord;
  }

  const client = await getClient();
  let completed = await requestCompletedWordAnalysis(client, input);

  if (shouldRetryGermanInputPreservation(input, completed)) {
    completed = await requestCompletedWordAnalysis(client, input, { forceGermanInputIdentity: true });
  }

  if (shouldRetryFunctionWordRejection(input, completed)) {
    const retried = await requestCompletedWordAnalysis(client, input, { forceFunctionWordCandidate: true });
    if (retried.shouldCreateWordCard !== false || hasStructuredWordAnalysis(retried)) {
      return retried;
    }
    return completeWordAnalysisIfNeeded(client, buildFunctionWordFallback(input, retried));
  }

  if (shouldRetryImageableNounRejection(input, completed)) {
    return requestCompletedWordAnalysis(client, input, { forceVisibleNoun: true });
  }

  if (shouldRetryBareLexicalRejection(input, completed)) {
    const retried = await requestCompletedWordAnalysis(client, input, { forceBareLexicalCandidate: true });
    if (shouldFallbackBareAdverbRejection(input, retried)) {
      return completeWordAnalysisIfNeeded(client, buildBareLexicalAdverbFallback(input, retried));
    }
    if (retried.shouldCreateWordCard === false) {
      const familyFallback = buildEverydayFamilyNounFallback(input, retried);
      if (familyFallback !== retried) {
        return familyFallback;
      }
    }
    if (shouldRetryBareLexicalRejection(input, retried)) {
      return completeWordAnalysisIfNeeded(client, buildBareLexicalAdjectiveFallback(input, retried));
    }
    return retried;
  }

  if (completed.shouldCreateWordCard === false) {
    if (shouldFallbackBareAdverbRejection(input, completed)) {
      return completeWordAnalysisIfNeeded(client, buildBareLexicalAdverbFallback(input, completed));
    }
    const familyFallback = buildEverydayFamilyNounFallback(input, completed);
    if (familyFallback !== completed) {
      return familyFallback;
    }
  }

  return completed;
}
