import { escapeHtml } from '../../cardContent/html.js';
import { replySlot, smallText, soundTag, taskPanel } from '../shared/components.js';

function buildDialogueFront(audioFilename) {
  return soundTag(audioFilename) +
    taskPanel('dialogue', {
      emoji: '💬',
      kicker: 'ТВОЙ ОТВЕТ',
      main: 'Ответь по-немецки вслух',
      sub: 'Это ответ собеседнику, не перевод',
    }) +
    replySlot();
}

export function formatDialogueCard(card, audioFilename) {
  let back = escapeHtml(card.back.german);
  if (card.back.russian) {
    back += `<br>${smallText(card.back.russian)}`;
  }

  return {
    Front: buildDialogueFront(audioFilename),
    Back: back,
  };
}
