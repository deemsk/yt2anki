import { escapeHtml } from '../../wordUtils.js';
import { smallText } from '../shared/components.js';

export function formatPatternCard(card) {
  let back = card.back.examples.map((example) => `• ${escapeHtml(example)}`).join('<br>');
  back += `<br><br>${smallText(card.back.russian)}`;

  return {
    Front: `<b>${escapeHtml(card.front.pattern)}</b><br>${escapeHtml(card.front.baseExample)}`,
    Back: back,
  };
}
