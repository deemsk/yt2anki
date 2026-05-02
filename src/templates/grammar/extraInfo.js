import { buildGrammarMetadataComment } from '../../grammar/utils.js';
import { escapeHtml } from '../../cardContent/html.js';

export function buildGrammarExtra({
  translation = null,
  slotLabel = null,
  explanation = null,
  metadata = null,
}) {
  const lines = [];

  if (translation) {
    lines.push(`<div>Translation: ${escapeHtml(translation)}</div>`);
  }

  if (slotLabel) {
    lines.push(`<div>Slot: ${escapeHtml(slotLabel)}</div>`);
  }

  if (explanation) {
    lines.push(`<div>Rule: ${escapeHtml(explanation)}</div>`);
  }

  if (metadata) {
    lines.push(buildGrammarMetadataComment(metadata));
  }

  return lines.join('');
}
