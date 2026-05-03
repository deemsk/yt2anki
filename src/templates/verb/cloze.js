import { escapeHtml } from '../../cardContent/html.js';
import { answerStack } from '../shared/components.js';

/**
 * Escapes a literal string so it can be used inside a regular expression.
 */
function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds Cloze text that asks for the selected finite verb form in context.
 */
export function buildVerbFormClozeText(sentence, formSpec, infinitive) {
  const german = String(sentence?.german || '').trim();
  const form = String(formSpec?.form || '').trim();
  if (!german || !form) {
    return '';
  }

  const hint = `${infinitive} → ${formSpec.label}`;
  const pattern = new RegExp(`(^|\\s)(${escapeRegex(form)})(?=\\s|[.!?,;:]|$)`, 'i');
  return german.replace(pattern, (_match, prefix, matchedForm) =>
    `${prefix}{{c1::${escapeHtml(matchedForm)}::${escapeHtml(hint)}}}`
  );
}

/**
 * Builds the extra field for a verb-form Cloze note.
 */
export function buildVerbFormClozeExtra(sentence, formSpec, infinitive) {
  return answerStack({
    german: sentence?.german,
    ipa: sentence?.ipa,
    russian: sentence?.russian,
    extraHtml: `<div class="ddd-cloze-context" style="font-size:0.86em;line-height:1.25;color:var(--ddd-muted, #475569);">${escapeHtml(formSpec.label)} ${escapeHtml(formSpec.displayForm || formSpec.form)} → ${escapeHtml(infinitive)}</div>`,
  });
}
