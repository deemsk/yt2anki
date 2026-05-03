import { escapeHtml } from '../../cardContent/html.js';
import { answerStack, soundTag, taskHeader } from '../shared/components.js';
import { html } from '../shared/html.js';

export function buildProductionFront(russian, situation = null) {
  return html`
    ${taskHeader('Say in German', 'Produce the sentence before revealing the answer')}
    <div class="yt2anki-production-source" style="font-size:20px;font-weight:700;line-height:1.28;text-align:left;">${escapeHtml(russian)}</div>
    ${situation ? `<div class="yt2anki-production-hint" style="margin-top:8px;font-size:13px;line-height:1.35;text-align:left;opacity:0.86;">${escapeHtml(situation)}</div>` : ''}
  `;
}

export function formatProductionCard(card, audioFilename) {
  return {
    Front: buildProductionFront(card.front.russian, card.front.situation),
    Back: answerStack({
      german: card.back.german,
      ipa: card.back.ipa,
      extraHtml: soundTag(audioFilename),
    }),
  };
}
