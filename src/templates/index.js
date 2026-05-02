import { formatClozeCard } from './sentence/cloze.js';
import { formatComprehensionCard } from './sentence/comprehension.js';
import { formatDialogueCard } from './sentence/dialogue.js';
import { formatPatternCard } from './sentence/pattern.js';
import { buildProductionFront, formatProductionCard } from './sentence/production.js';
import { buildSentenceNoteFields, buildSentenceNoteFront } from './sentence/sentenceNote.js';

export { buildProductionFront, buildSentenceNoteFields, buildSentenceNoteFront };

export function formatCardForAnki(card, audioFilename) {
  switch (card.type) {
    case 'comprehension':
      return formatComprehensionCard(card, audioFilename);
    case 'dialogue':
      return formatDialogueCard(card, audioFilename);
    case 'production':
      return formatProductionCard(card, audioFilename);
    case 'pattern':
      return formatPatternCard(card);
    case 'cloze':
      return formatClozeCard(card);
    default:
      return { Front: '', Back: '' };
  }
}
