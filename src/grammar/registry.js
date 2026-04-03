import { possessiveFamily } from './families/possessive.js';

const GRAMMAR_FAMILIES = [
  possessiveFamily,
];

export function listGrammarFamilies() {
  return GRAMMAR_FAMILIES.map((family) => ({
    id: family.id,
    title: family.title,
    aliases: family.aliases || [],
    supportedLemmas: family.supportedLemmas || [],
  }));
}

export function getGrammarFamily(name = '') {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return GRAMMAR_FAMILIES.find((family) => (
    family.id === normalized ||
    family.aliases?.includes(normalized)
  )) || null;
}
