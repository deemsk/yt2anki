import { normalizeGermanForCompare } from './german.js';
import { FUNCTION_WORDS } from '../data/functionWords.js';

/**
 * Returns a deterministic analysis for curated function words.
 */
export function getCuratedFunctionWordAnalysis(input = '') {
  const key = normalizeGermanForCompare(input);
  const entry = FUNCTION_WORDS[key];
  if (!entry) {
    return null;
  }

  return {
    shouldCreateWordCard: true,
    rejectionReason: null,
    lexicalType: entry.lexicalType,
    canonical: entry.canonical,
    lemma: entry.lemma,
    article: null,
    gender: null,
    ipa: null,
    register: 'neutral',
    isImageable: false,
    imageabilityReason: 'function word; learned through sentence context',
    recommendedMode: 'cloze-form',
    plural: null,
    noPlural: false,
    anchorPhrase: null,
    opposite: null,
    clozeHint: entry.clozeHint,
    patternHint: entry.patternHint || null,
    patternFamily: entry.patternFamily || entry.lexicalType,
    meanings: entry.meanings,
    exampleSentences: entry.exampleSentences,
  };
}
