const SLOT_DEFINITIONS = [
  { id: 'nom-masc-sg', caseKey: 'nominative', gender: 'masculine', number: 'singular', ending: '', hint: 'NOM.M.SG', label: 'Nominative masculine singular' },
  { id: 'acc-masc-sg', caseKey: 'accusative', gender: 'masculine', number: 'singular', ending: 'en', hint: 'ACC.M.SG', label: 'Accusative masculine singular' },
  { id: 'dat-masc-sg', caseKey: 'dative', gender: 'masculine', number: 'singular', ending: 'em', hint: 'DAT.M.SG', label: 'Dative masculine singular' },
  { id: 'gen-masc-sg', caseKey: 'genitive', gender: 'masculine', number: 'singular', ending: 'es', hint: 'GEN.M.SG', label: 'Genitive masculine singular' },
  { id: 'nom-neut-sg', caseKey: 'nominative', gender: 'neuter', number: 'singular', ending: '', hint: 'NOM.N.SG', label: 'Nominative neuter singular' },
  { id: 'acc-neut-sg', caseKey: 'accusative', gender: 'neuter', number: 'singular', ending: '', hint: 'ACC.N.SG', label: 'Accusative neuter singular' },
  { id: 'dat-neut-sg', caseKey: 'dative', gender: 'neuter', number: 'singular', ending: 'em', hint: 'DAT.N.SG', label: 'Dative neuter singular' },
  { id: 'gen-neut-sg', caseKey: 'genitive', gender: 'neuter', number: 'singular', ending: 'es', hint: 'GEN.N.SG', label: 'Genitive neuter singular' },
  { id: 'nom-fem-sg', caseKey: 'nominative', gender: 'feminine', number: 'singular', ending: 'e', hint: 'NOM.F.SG', label: 'Nominative feminine singular' },
  { id: 'acc-fem-sg', caseKey: 'accusative', gender: 'feminine', number: 'singular', ending: 'e', hint: 'ACC.F.SG', label: 'Accusative feminine singular' },
  { id: 'dat-fem-sg', caseKey: 'dative', gender: 'feminine', number: 'singular', ending: 'er', hint: 'DAT.F.SG', label: 'Dative feminine singular' },
  { id: 'gen-fem-sg', caseKey: 'genitive', gender: 'feminine', number: 'singular', ending: 'er', hint: 'GEN.F.SG', label: 'Genitive feminine singular' },
  { id: 'nom-pl', caseKey: 'nominative', gender: 'plural', number: 'plural', ending: 'e', hint: 'NOM.PL', label: 'Nominative plural' },
  { id: 'acc-pl', caseKey: 'accusative', gender: 'plural', number: 'plural', ending: 'e', hint: 'ACC.PL', label: 'Accusative plural' },
  { id: 'dat-pl', caseKey: 'dative', gender: 'plural', number: 'plural', ending: 'en', hint: 'DAT.PL', label: 'Dative plural' },
  { id: 'gen-pl', caseKey: 'genitive', gender: 'plural', number: 'plural', ending: 'er', hint: 'GEN.PL', label: 'Genitive plural' },
];

function normalizeLemma(lemma = '') {
  return String(lemma || '').trim().toLowerCase();
}

export function listEinWordSlots() {
  return SLOT_DEFINITIONS.map((slot) => ({ ...slot }));
}

export function getEinWordSlot(slotId) {
  return SLOT_DEFINITIONS.find((slot) => slot.id === slotId) || null;
}

export function buildEinWordForm(baseLemma, slotOrId) {
  const normalizedLemma = normalizeLemma(baseLemma);
  const slot = typeof slotOrId === 'string' ? getEinWordSlot(slotOrId) : slotOrId;

  if (!normalizedLemma) {
    throw new Error('Base lemma is required for ein-word declension');
  }

  if (!slot) {
    throw new Error(`Unknown ein-word slot: ${slotOrId}`);
  }

  if (normalizedLemma === 'euer') {
    return slot.ending ? `eur${slot.ending}` : 'euer';
  }

  return `${normalizedLemma}${slot.ending}`;
}
