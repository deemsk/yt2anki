export const LEXICAL_TYPES = new Set([
  'noun',
  'adjective',
  'adverb',
  'verb',
  'preposition',
  'conjunction',
  'subjunction',
  'pronoun',
  'determiner',
  'particle',
  'numeral',
  'interjection',
]);

export const FUNCTION_LEXICAL_TYPES = new Set([
  'preposition',
  'conjunction',
  'subjunction',
  'pronoun',
  'determiner',
  'particle',
  'numeral',
  'interjection',
]);

const TYPE_ALIASES = new Map([
  ['subordinating conjunction', 'subjunction'],
  ['subordinate conjunction', 'subjunction'],
  ['subordinator', 'subjunction'],
  ['coordinating conjunction', 'conjunction'],
  ['coordinate conjunction', 'conjunction'],
  ['connector', 'conjunction'],
  ['prepositional phrase marker', 'preposition'],
  ['personal pronoun', 'pronoun'],
  ['reflexive pronoun', 'pronoun'],
  ['possessive pronoun', 'pronoun'],
  ['demonstrative pronoun', 'pronoun'],
  ['relative pronoun', 'pronoun'],
  ['interrogative pronoun', 'pronoun'],
  ['question pronoun', 'pronoun'],
  ['indefinite pronoun', 'pronoun'],
  ['negative pronoun', 'pronoun'],
  ['article', 'determiner'],
  ['definite article', 'determiner'],
  ['indefinite article', 'determiner'],
  ['negative article', 'determiner'],
  ['possessive determiner', 'determiner'],
  ['demonstrative determiner', 'determiner'],
  ['interrogative determiner', 'determiner'],
  ['quantifier', 'determiner'],
  ['modal particle', 'particle'],
  ['discourse particle', 'particle'],
  ['focus particle', 'particle'],
  ['negation particle', 'particle'],
  ['negative particle', 'particle'],
  ['function word', 'particle'],
  ['interrogative adverb', 'adverb'],
  ['question adverb', 'adverb'],
  ['pronominal adverb', 'adverb'],
  ['adverbial pronoun', 'adverb'],
  ['conjunctive adverb', 'adverb'],
  ['degree adverb', 'adverb'],
  ['frequency adverb', 'adverb'],
  ['time adverb', 'adverb'],
  ['temporal adverb', 'adverb'],
  ['place adverb', 'adverb'],
  ['locative adverb', 'adverb'],
  ['manner adverb', 'adverb'],
  ['number', 'numeral'],
  ['cardinal number', 'numeral'],
  ['ordinal number', 'numeral'],
  ['exclamation', 'interjection'],
  ['fixed expression', 'interjection'],
]);

/**
 * Converts model-provided lexical type labels into the supported internal set.
 */
export function normalizeLexicalType(type = '') {
  const normalized = String(type || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (LEXICAL_TYPES.has(normalized)) {
    return normalized;
  }

  if (TYPE_ALIASES.has(normalized)) {
    return TYPE_ALIASES.get(normalized);
  }

  return 'noun';
}

/**
 * Returns true for lexical items that should be learned primarily through context.
 */
export function isFunctionLexicalType(type = '') {
  return FUNCTION_LEXICAL_TYPES.has(normalizeLexicalType(type));
}

/**
 * Formats a compact label for CLI previews and card metadata checks.
 */
export function formatLexicalTypeLabel(type = '') {
  const normalized = normalizeLexicalType(type);
  if (normalized === 'adjective') return 'adj';
  if (normalized === 'adverb') return 'adv';
  if (normalized === 'conjunction') return 'conj';
  if (normalized === 'subjunction') return 'subj';
  if (normalized === 'preposition') return 'prep';
  if (normalized === 'pronoun') return 'pron';
  return normalized;
}
