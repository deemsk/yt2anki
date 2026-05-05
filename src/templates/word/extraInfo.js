import { escapeHtml } from '../../cardContent/html.js';
import { buildWordMetadataComment } from '../../cardContent/wordMetadata.js';

/**
 * Builds one labeled visual row for word back-side metadata.
 */
function infoRow(label, value, className = '') {
  if (!value) {
    return '';
  }

  return `<div class="yt2anki-extra-row ${className}" style="margin-top:8px;font-size:0.82em;line-height:1.22;color:var(--ddd-muted, #475569);"><span class="yt2anki-extra-label" style="display:block;font-size:0.68em;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--ddd-focus-label, #64748b);">${escapeHtml(label)}</span><span class="yt2anki-extra-value">${escapeHtml(value)}</span></div>`;
}

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
      ? `<div class="yt2anki-extra-meaning" style="margin-top:8px;font-size:0.92em;font-weight:650;line-height:1.22;color:var(--ddd-text, #111827);">${escapeHtml(meaning)}</div>`
      : infoRow('Meaning', meaning, 'yt2anki-extra-meaning'));
  }

  if (plural) {
    lines.push(infoRow('Plural', plural));
  }

  if (exampleSentence) {
    lines.push(`<div class="yt2anki-extra-example" style="margin:22px auto 0;max-width:520px;padding:13px 14px 12px;border-top:1px solid var(--ddd-divider, rgba(15, 23, 42, 0.42));border-radius:14px;background:var(--ddd-panel, rgba(148, 163, 184, 0.12));color:var(--ddd-text, #111827);"><span class="yt2anki-extra-label" style="display:block;font-size:0.68em;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--ddd-focus-label, #64748b);">Example</span><span class="yt2anki-extra-value" style="display:block;margin-top:6px;font-size:0.88em;font-weight:650;line-height:1.24;">${escapeHtml(exampleSentence)}</span></div>`);
    if (exampleSentenceTranslation) {
      lines.push(`<div class="yt2anki-extra-example-translation" style="margin:7px auto 0;max-width:520px;font-size:0.76em;line-height:1.2;color:var(--ddd-muted, #475569);">${escapeHtml(exampleSentenceTranslation)}</div>`);
    }
  }

  if (dictionaryForm) {
    lines.push(infoRow('Dictionary form', dictionaryForm));
  }

  if (contrast) {
    lines.push(infoRow('Contrast', contrast));
  }

  if (personalConnection) {
    lines.push(infoRow('Personal connection', personalConnection, 'yt2anki-extra-personal'));
  }

  lines.push(buildWordMetadataComment(metadata));

  return lines.join('');
}
