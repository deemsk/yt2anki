import { formatIpaHtml, smallText, soundTag } from '../shared/components.js';
import { joinHtml } from '../shared/html.js';

export function formatComprehensionCard(card, audioFilename) {
  let front = soundTag(audioFilename);
  if (card.front.context) {
    front += `<br>${smallText(`Context: ${card.front.context}`)}`;
  }

  return {
    Front: front,
    Back: joinHtml([card.back.german, formatIpaHtml(card.back.ipa), card.back.russian]),
  };
}
