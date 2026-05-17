import { normalizeGermanForCompare } from './german.js';
import { resolveSentenceFocusForm } from './wordLexical.js';
import { COMMON_EARLY_FINITE_FORMS, SUBJUNCTION_VALIDATION_PRONOUNS } from '../data/wordForms.js';

/**
 * Splits German text into normalized word tokens for structural checks.
 */
function tokenizeGerman(text = '') {
  return normalizeGermanForCompare(text).split(/\s+/).filter(Boolean);
}

/**
 * Finds the first target token position in a German sentence.
 */
function findTargetIndex(tokens = [], sentence = {}, wordData = {}) {
  const candidates = [
    resolveSentenceFocusForm(sentence, wordData),
    sentence.focusForm,
    wordData.canonical,
    wordData.lemma,
  ]
    .map((value) => normalizeGermanForCompare(value || ''))
    .filter(Boolean);

  return tokens.findIndex((token) => candidates.includes(token));
}

/**
 * Returns the normalized clause following a connector until comma-like punctuation.
 */
function clauseAfterTarget(sentenceText = '', target = '') {
  const normalizedTarget = normalizeGermanForCompare(target);
  const rawParts = String(sentenceText || '').split(/[,.;:!?]/);

  for (const part of rawParts) {
    const tokens = tokenizeGerman(part);
    const targetIndex = tokens.indexOf(normalizedTarget);
    if (targetIndex >= 0) {
      return tokens.slice(targetIndex + 1);
    }
  }

  return [];
}

/**
 * Detects obvious verb-second word order after a subordinate connector.
 */
function hasLikelyVerbSecondAfterSubjunction(clauseTokens = []) {
  return clauseTokens.length > 2 &&
    SUBJUNCTION_VALIDATION_PRONOUNS.has(clauseTokens[0]) &&
    COMMON_EARLY_FINITE_FORMS.has(clauseTokens[1]);
}

/**
 * Validates a subordinate connector example such as "wenn", "weil", or "dass".
 */
function validateSubjunction(sentence = {}, wordData = {}) {
  const tokens = tokenizeGerman(sentence.german);
  const targetIndex = findTargetIndex(tokens, sentence, wordData);
  if (targetIndex < 0) {
    return false;
  }

  const clauseTokens = clauseAfterTarget(sentence.german, sentence.focusForm || wordData.canonical);
  return clauseTokens.length >= 2 && !hasLikelyVerbSecondAfterSubjunction(clauseTokens);
}

/**
 * Validates a coordinating connector example such as "aber", "denn", or "oder".
 */
function validateConjunction(sentence = {}, wordData = {}) {
  const tokens = tokenizeGerman(sentence.german);
  const targetIndex = findTargetIndex(tokens, sentence, wordData);
  return targetIndex >= 0 && targetIndex < tokens.length - 1;
}

/**
 * Validates a preposition example by requiring material after the preposition.
 */
function validatePreposition(sentence = {}, wordData = {}) {
  const tokens = tokenizeGerman(sentence.german);
  const targetIndex = findTargetIndex(tokens, sentence, wordData);
  return targetIndex >= 0 && targetIndex < tokens.length - 1;
}

/**
 * Validates a negative pronoun example such as "nichts".
 */
function validatePronoun(sentence = {}, wordData = {}) {
  const tokens = tokenizeGerman(sentence.german);
  const targetIndex = findTargetIndex(tokens, sentence, wordData);
  return targetIndex >= 0 && tokens[targetIndex] !== 'nicht';
}

/**
 * Validates determiner examples by requiring a noun-like token after the target.
 */
function validateDeterminer(sentence = {}, wordData = {}) {
  const tokens = tokenizeGerman(sentence.german);
  const targetIndex = findTargetIndex(tokens, sentence, wordData);
  return targetIndex >= 0 && targetIndex < tokens.length - 1;
}

/**
 * Validates modal-particle examples by keeping the particle inside the clause.
 */
function validateParticle(sentence = {}, wordData = {}) {
  const tokens = tokenizeGerman(sentence.german);
  const targetIndex = findTargetIndex(tokens, sentence, wordData);
  return targetIndex >= 0 && tokens.length > 1;
}

/**
 * Validates that a lexical Cloze sentence contains the target in the expected role.
 */
export function validateLexicalClozeSentence(sentence = {}, wordData = {}) {
  const lexicalType = wordData.lexicalType || 'word';

  if (lexicalType === 'subjunction') {
    return validateSubjunction(sentence, wordData);
  }

  if (lexicalType === 'conjunction') {
    return validateConjunction(sentence, wordData);
  }

  if (lexicalType === 'preposition') {
    return validatePreposition(sentence, wordData);
  }

  if (lexicalType === 'pronoun') {
    return validatePronoun(sentence, wordData);
  }

  if (lexicalType === 'determiner') {
    return validateDeterminer(sentence, wordData);
  }

  if (lexicalType === 'particle') {
    return validateParticle(sentence, wordData);
  }

  return findTargetIndex(tokenizeGerman(sentence.german), sentence, wordData) >= 0;
}
