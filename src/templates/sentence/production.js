import { escapeHtml } from '../../cardContent/html.js';
import { formatIpaHtml, soundTag } from '../shared/components.js';
import { html, joinHtml } from '../shared/html.js';

export function buildProductionFront(russian, situation = null) {
  return html`
    <div class="yt2anki-production-prompt" style="margin-bottom:8px;font-size:15px;font-weight:700;line-height:1.25;text-align:left;">🗣 Скажи по-немецки</div>
    <div class="yt2anki-production-source" style="font-size:20px;font-weight:700;line-height:1.28;text-align:left;">${escapeHtml(russian)}</div>
    ${situation ? `<div class="yt2anki-production-hint" style="margin-top:8px;font-size:13px;line-height:1.35;text-align:left;opacity:0.86;">${escapeHtml(situation)}</div>` : ''}
  `;
}

export function formatProductionCard(card, audioFilename) {
  return {
    Front: buildProductionFront(card.front.russian, card.front.situation),
    Back: joinHtml([card.back.german, formatIpaHtml(card.back.ipa), soundTag(audioFilename)]),
  };
}
