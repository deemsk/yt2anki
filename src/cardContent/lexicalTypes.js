import { FUNCTION_LEXICAL_TYPE_NAMES, LEXICAL_TYPE_ALIASES, LEXICAL_TYPE_NAMES } from '../data/lexicalTypes.js';

export const LEXICAL_TYPES = new Set(LEXICAL_TYPE_NAMES);
export const FUNCTION_LEXICAL_TYPES = new Set(FUNCTION_LEXICAL_TYPE_NAMES);

const TYPE_ALIASES = new Map(LEXICAL_TYPE_ALIASES);

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
