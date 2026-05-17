import { FUNCTION_WORD_TYPE_PATTERNS } from '../data/functionWordPatterns.js';

/**
 * Returns a compact pattern explanation for function-word Cloze cards.
 */
export function buildFunctionWordPatternHint(wordData = {}) {
  return wordData.patternHint || FUNCTION_WORD_TYPE_PATTERNS[wordData.lexicalType] || null;
}

/**
 * Returns the stable pattern family id for tags and metadata.
 */
export function getFunctionWordPatternFamily(wordData = {}) {
  return wordData.patternFamily || wordData.lexicalType || null;
}
