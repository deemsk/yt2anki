import { escapeHtml } from '../../wordUtils.js';
import { smallText } from '../shared/components.js';

export function formatClozeCard(card) {
  let front = `${escapeHtml(card.front.sentence)}<br>${smallText(card.front.russian)}`;
  if (card.front.hint) {
    front += `<br><small><i>${escapeHtml(`(${card.front.hint})`)}</i></small>`;
  }

  return {
    Front: front,
    Back: `<b>${escapeHtml(card.back.answer)}</b><br><br>${escapeHtml(card.back.german)}`,
  };
}
