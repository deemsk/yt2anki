import { answerStack, focusPill, soundTag, taskHeader } from '../shared/components.js';

export function formatComprehensionCard(card, audioFilename) {
  let front = taskHeader('Listen and understand', 'Play the audio before revealing the answer');
  front += soundTag(audioFilename);
  if (card.front.context) {
    front += focusPill(card.front.context);
  }

  return {
    Front: front,
    Back: answerStack({
      german: card.back.german,
      ipa: card.back.ipa,
      russian: card.back.russian,
    }),
  };
}
