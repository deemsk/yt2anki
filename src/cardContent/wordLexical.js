import { normalizeGermanForCompare } from './german.js';
import { DETERMINER_FORM_FAMILIES, POSSESSIVE_STEMS, PRONOUN_FORM_FAMILIES } from '../data/wordForms.js';

export function getWordLemma(wordData = {}) {
  const raw = String(wordData.lemma || wordData.bareNoun || wordData.canonical || '').trim();
  return raw.replace(/^(der|die|das)\s+/i, '');
}

export function applyChosenSentenceGloss(sentenceData = {}, chosenSentence = {}) {
  const chosenRussian = String(chosenSentence?.russian || '').trim();
  if (!chosenRussian) {
    return sentenceData;
  }

  return {
    ...sentenceData,
    russian: chosenRussian,
  };
}

export function formatPluralLabel(wordData) {
  if (wordData.noPlural) {
    return 'usually no plural';
  }

  if (wordData.plural) {
    return wordData.plural;
  }

  return 'plural unknown';
}

export function getPrimaryExampleSentence(wordData = {}) {
  const sentences = Array.isArray(wordData.exampleSentences) ? wordData.exampleSentences : [];
  const match = sentences.find((sentence) => sentence?.german);

  return {
    german: match?.german || null,
    russian: match?.russian || null,
  };
}

function tokenizeGermanSurface(text = '') {
  return Array.from(String(text || '').matchAll(/[\p{L}\p{N}-]+/gu)).map((match) => ({
    raw: match[0],
    normalized: normalizeGermanForCompare(match[0]),
  })).filter((token) => token.normalized);
}

function addCandidate(candidates, value) {
  const normalized = normalizeGermanForCompare(value || '');
  if (normalized) {
    candidates.add(normalized);
  }
}

function addDeterminerForms(candidates, base) {
  const normalized = normalizeGermanForCompare(base || '');
  const family = DETERMINER_FORM_FAMILIES.get(normalized);
  if (family) {
    family.forEach((form) => addCandidate(candidates, form));
    return;
  }

  const possessiveStem = [...POSSESSIVE_STEMS].find((stem) => normalized === stem || normalized.startsWith(stem));
  if (!possessiveStem) {
    return;
  }

  const forms = possessiveStem === 'euer'
    ? ['euer', 'eure', 'euren', 'eurem', 'eurer', 'eures']
    : [
      possessiveStem,
      `${possessiveStem}e`,
      `${possessiveStem}en`,
      `${possessiveStem}em`,
      `${possessiveStem}er`,
      `${possessiveStem}es`,
    ];
  forms.forEach((form) => addCandidate(candidates, form));
}

function addPronounForms(candidates, base) {
  const normalized = normalizeGermanForCompare(base || '');
  const family = PRONOUN_FORM_FAMILIES.get(normalized);
  if (family) {
    family.forEach((form) => addCandidate(candidates, form));
  }
}

function buildFocusCandidates(wordData = {}, fallback = null) {
  const candidates = new Set();
  const values = [
    fallback,
    wordData.focusForm,
    wordData.canonical,
    wordData.lemma,
    wordData.bareNoun,
  ];

  values.forEach((value) => addCandidate(candidates, value));

  if (wordData.lexicalType === 'determiner') {
    values.forEach((value) => addDeterminerForms(candidates, value));
  }

  if (wordData.lexicalType === 'pronoun') {
    values.forEach((value) => addPronounForms(candidates, value));
  }

  return candidates;
}

function tokenLooksLikeInflectedAdjective(token, wordData = {}) {
  if (wordData.lexicalType !== 'adjective') {
    return false;
  }

  const base = normalizeGermanForCompare(wordData.lemma || wordData.canonical || '');
  if (!base || token.normalized.length <= base.length || token.normalized.length > base.length + 4) {
    return false;
  }

  return token.normalized.startsWith(base);
}

/**
 * Finds the actual surface form used by a sentence for a lexical card.
 */
export function inferFocusFormFromSentence(sentenceText = '', wordData = {}, fallback = null) {
  const tokens = tokenizeGermanSurface(sentenceText);
  if (tokens.length === 0) {
    return null;
  }

  const candidates = buildFocusCandidates(wordData, fallback);
  const exact = tokens.find((token) => candidates.has(token.normalized));
  if (exact) {
    return exact.raw;
  }

  const adjective = tokens.find((token) => tokenLooksLikeInflectedAdjective(token, wordData));
  return adjective?.raw || null;
}

/**
 * Uses an explicit focus form when valid, otherwise repairs it from the sentence.
 */
export function resolveSentenceFocusForm(sentence = {}, wordData = {}) {
  const explicit = String(sentence?.focusForm || '').trim();
  const inferred = inferFocusFormFromSentence(sentence?.german, wordData, explicit || null);

  return inferred || explicit || String(wordData.canonical || wordData.lemma || '').trim();
}
