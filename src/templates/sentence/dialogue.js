import { escapeHtml } from '../../cardContent/html.js';
import { replySlot, smallText, soundTag, taskPanel } from '../shared/components.js';

function buildDialogueFront(audioFilename) {
  return soundTag(audioFilename) +
    taskPanel('dialogue', {
      emoji: '💬',
      kicker: 'Your reply',
      main: 'Answer aloud in German',
      sub: 'Reply to the speaker, do not translate the prompt',
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
