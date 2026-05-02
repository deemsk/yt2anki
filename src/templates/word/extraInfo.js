import { buildWordMetadataComment, escapeHtml } from '../../wordUtils.js';

export function buildWordExtraInfo({
  meaning,
  plainMeaning = false,
  plural,
  exampleSentence = null,
  exampleSentenceTranslation = null,
  dictionaryForm = null,
  contrast = null,
  personalConnection = null,
  metadata,
}) {
  const lines = [];

  if (meaning) {
    lines.push(plainMeaning
      ? `<div>${escapeHtml(meaning)}</div>`
      : `<div>Meaning: ${escapeHtml(meaning)}</div>`);
  }

  if (plural) {
    lines.push(`<div>Plural: ${escapeHtml(plural)}</div>`);
  }

  if (exampleSentence) {
    lines.push(`<div>Example: ${escapeHtml(exampleSentence)}</div>`);
    if (exampleSentenceTranslation) {
      lines.push(`<div><small>${escapeHtml(exampleSentenceTranslation)}</small></div>`);
    }
  }

  if (dictionaryForm) {
    lines.push(`<div>Dictionary Form: ${escapeHtml(dictionaryForm)}</div>`);
  }

  if (contrast) {
    lines.push(`<div>Contrast: ${escapeHtml(contrast)}</div>`);
  }

  if (personalConnection) {
    lines.push(`<div>Personal Connection: ${escapeHtml(personalConnection)}</div>`);
  }

  lines.push(buildWordMetadataComment(metadata));

  return lines.join('');
}
