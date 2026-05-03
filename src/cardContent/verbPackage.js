import { normalizeGermanForCompare } from './german.js';

/**
 * Builds the context label shown on sentence cards for a target verb form.
 */
export function buildVerbFormContext(infinitive, formSpec) {
  return `${formSpec.label} ${formSpec.displayForm || formSpec.form} → ${infinitive}`;
}

/**
 * Checks whether a sentence is short and syntactically simple enough for a key-form card.
 */
function isSimpleSentence(sentence = '') {
  const text = String(sentence || '').trim();
  if (!text) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 9) return false;
  return !/\b(obwohl|weil|dass|wenn|während|bevor|nachdem|damit|der|die|das)\b.*,/i.test(text);
}

/**
 * Checks whether a separable particle appears naturally after the finite form.
 */
function hasSeparatedParticle(sentence, form, particle) {
  if (!particle) return true;
  const normalized = normalizeGermanForCompare(sentence).replace(/[.!?]/g, '');
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const formIndex = tokens.indexOf(normalizeGermanForCompare(form));
  const particleIndex = tokens.lastIndexOf(normalizeGermanForCompare(particle));
  return formIndex >= 0 && particleIndex > formIndex;
}

/**
 * Validates that a generated sentence really trains the selected verb form.
 */
export function validateVerbFormSentence(sentence, formSpec, morphology) {
  const german = String(sentence?.german || '').trim();
  const normalized = normalizeGermanForCompare(german).replace(/[.!?]/g, '');
  const pronoun = normalizeGermanForCompare(formSpec.pronoun);
  const form = normalizeGermanForCompare(formSpec.form);
  const tokens = normalized.split(/\s+/).filter(Boolean);

  return Boolean(
    isSimpleSentence(german) &&
    tokens.includes(pronoun) &&
    tokens.includes(form) &&
    hasSeparatedParticle(german, formSpec.form, morphology.particle)
  );
}

/**
 * Creates the package plan from selected morphology forms and generated sentences.
 */
export function buildStrongVerbPackagePlan({ morphology, sentences }) {
  const forms = Array.isArray(morphology?.selectedForms) ? morphology.selectedForms : [];
  if (morphology?.confidence !== 'high' || forms.length === 0) {
    return null;
  }

  const validSentences = [];
  for (const formSpec of forms) {
    const sentence = sentences.find((candidate) => candidate.formKey === formSpec.key);
    if (!sentence || !validateVerbFormSentence(sentence, formSpec, morphology)) {
      return null;
    }

    validSentences.push({
      ...sentence,
      focusForm: formSpec.form,
      formSpec,
    });
  }

  return {
    forms,
    sentences: validSentences,
  };
}
