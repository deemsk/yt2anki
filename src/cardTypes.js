/**
 * Card type definitions and generators for Fluent Forever methodology.
 *
 * Card Types:
 * - Comprehension (default): Audio-first listening comprehension
 * - Dialogue: Conversational prompt-response practice
 * - Production: Active speaking production
 * - Pattern: Grammar pattern with slot substitution
 * - Cloze: Grammar feature with blank
 */

import { formatIpaHtml } from './wordUtils.js';

// Task labels for each card type
export const CARD_LABELS = {
  comprehension: '🎧 Listen',
  dialogue: '💬 Reply',
  production: '🗣 Say in German',
  pattern: '🧩 Pattern',
  cloze: '✳ Grammar',
};

export function normalizeRussianHint(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return null;
  }

  return /[А-Яа-яЁё]/.test(trimmed) ? trimmed : null;
}

/**
 * Generate a comprehension card (audio-first).
 * Front: [audio] + optional context
 * Back: German + IPA + Russian
 *
 * @param {Object} data - Enriched sentence data
 * @param {string} sourceId - Unique ID for grouping related cards
 * @param {string} reason - Why this card was generated
 * @returns {Object} Card object
 */
export function generateComprehensionCard(data, sourceId, reason = 'default') {
  return {
    type: 'comprehension',
    label: CARD_LABELS.comprehension,
    sourceId,
    reason,
    front: {
      audio: true,
      context: data.context || null,
    },
    back: {
      german: data.german,
      ipa: data.ipa,
      russian: data.russian,
    },
  };
}

/**
 * Generate a dialogue card (conversational response practice).
 * Front: [audio] + "Antworte" prompt
 * Back: Response (German only, for quick comprehension)
 *
 * @param {Object} data - Enriched sentence data
 * @param {Object} response - Dialogue response {german, russian?}
 * @param {string} sourceId - Unique ID for grouping
 * @param {string} reason - Why this card was generated
 * @returns {Object} Card object
 */
export function generateDialogueCard(data, response, sourceId, reason = 'conversational prompt') {
  return {
    type: 'dialogue',
    label: CARD_LABELS.dialogue,
    sourceId,
    reason,
    front: {
      audio: true,
      prompt: 'Antworte',
    },
    back: {
      german: response.german,
      russian: response.russian || null,
    },
  };
}

/**
 * Generate a production card (active speaking).
 * Front: Russian + situation/context
 * Back: German + IPA + [audio]
 *
 * @param {Object} data - Enriched sentence data
 * @param {string} situation - Speaking context (max 8 words)
 * @param {string} sourceId - Unique ID for grouping
 * @param {string} reason - Why this card was generated
 * @returns {Object} Card object
 */
export function generateProductionCard(data, situation, sourceId, reason = 'high-value active phrase') {
  return {
    type: 'production',
    label: CARD_LABELS.production,
    sourceId,
    reason,
    front: {
      russian: data.russian,
      situation: normalizeRussianHint(situation),
    },
    back: {
      german: data.german,
      ipa: data.ipa,
      audio: true,
    },
  };
}

/**
 * Generate a pattern card (grammar structure).
 * Front: Pattern template with slot marker
 * Back: 3+ examples showing pattern in use
 *
 * @param {Object} data - Enriched sentence data
 * @param {string} patternFamily - Pattern name/description
 * @param {string[]} examples - 3+ distinct examples
 * @param {string} sourceId - Unique ID for grouping
 * @returns {Object} Card object
 */
export function generatePatternCard(data, patternFamily, examples, sourceId) {
  return {
    type: 'pattern',
    label: CARD_LABELS.pattern,
    sourceId,
    reason: patternFamily,
    front: {
      pattern: patternFamily,
      baseExample: data.german,
    },
    back: {
      examples: examples.slice(0, 4), // Max 4 examples
      russian: data.russian,
    },
  };
}

/**
 * Generate a cloze card (grammar fill-in).
 * Front: Sentence with blank + Russian
 * Back: Complete sentence + explanation
 *
 * @param {Object} data - Enriched sentence data
 * @param {Object} clozeTarget - {word, category}
 * @param {string} clozeReason - Why this teaches something
 * @param {string} sourceId - Unique ID for grouping
 * @returns {Object} Card object
 */
export function generateClozeCard(data, clozeTarget, clozeReason, sourceId) {
  // Create blanked sentence
  const blankedSentence = data.german.replace(
    new RegExp(`\\b${escapeRegex(clozeTarget.word)}\\b`, 'i'),
    '[...]'
  );

  return {
    type: 'cloze',
    label: CARD_LABELS.cloze,
    sourceId,
    reason: clozeReason,
    front: {
      sentence: blankedSentence,
      russian: data.russian,
      hint: clozeTarget.category,
    },
    back: {
      german: data.german,
      answer: clozeTarget.word,
      explanation: clozeReason,
    },
  };
}

/**
 * Generate cards based on selection results.
 *
 * @param {Object} data - Enriched sentence data (german, ipa, russian, etc.)
 * @param {Object[]} selectedCards - Cards from selectCards()
 * @param {string} sourceId - Unique ID for grouping
 * @returns {Object[]} Generated card objects
 */
export function generateCards(data, selectedCards, sourceId) {
  const cards = [];

  for (const selected of selectedCards) {
    switch (selected.type) {
      case 'comprehension':
        cards.push(generateComprehensionCard(data, sourceId, selected.reason));
        break;

      case 'dialogue':
        cards.push(generateDialogueCard(
          data,
          selected.data.response,
          sourceId,
          selected.reason
        ));
        break;

      case 'production':
        cards.push(generateProductionCard(
          data,
          selected.reason !== 'high-value active phrase' ? selected.reason : null,
          sourceId,
          selected.reason
        ));
        break;

      case 'pattern':
        cards.push(generatePatternCard(
          data,
          selected.reason,
          selected.data.examples,
          sourceId
        ));
        break;

      case 'cloze':
        cards.push(generateClozeCard(
          data,
          selected.data.target,
          selected.reason,
          sourceId
        ));
        break;
    }
  }

  return cards;
}

/**
 * Format card for Anki note creation.
 *
 * @param {Object} card - Generated card object
 * @param {string} audioFilename - Audio filename in Anki media
 * @returns {Object} Anki note fields {Front, Back}
 */
export function formatCardForAnki(card, audioFilename) {
  let front = '';
  let back = '';

  switch (card.type) {
    case 'comprehension':
      // Front: audio + optional context
      front = `[sound:${audioFilename}]`;
      if (card.front.context) {
        front += `<br><small>Context: ${card.front.context}</small>`;
      }
      // Back: german + ipa + russian
      back = [card.back.german, formatIpaHtml(card.back.ipa), card.back.russian].filter(Boolean).join('<br>');
      break;

    case 'dialogue':
      // Front: audio + "Antworte" prompt
      front = `[sound:${audioFilename}]<br><b>${card.front.prompt}</b>`;
      // Back: response
      back = card.back.german;
      if (card.back.russian) {
        back += `<br><small>${card.back.russian}</small>`;
      }
      break;

    case 'production':
      // Front: russian + situation
      front = card.front.russian;
      if (card.front.situation) {
        front += `<br><small>${card.front.situation}</small>`;
      }
      // Back: german + ipa + audio
      back = [card.back.german, formatIpaHtml(card.back.ipa), `[sound:${audioFilename}]`].filter(Boolean).join('<br>');
      break;

    case 'pattern':
      // Front: pattern name + base example
      front = `<b>${card.front.pattern}</b><br>${card.front.baseExample}`;
      // Back: examples
      back = card.back.examples.map(ex => `• ${ex}`).join('<br>');
      back += `<br><br><small>${card.back.russian}</small>`;
      break;

    case 'cloze':
      // Front: blanked sentence + russian + hint
      front = `${card.front.sentence}<br><small>${card.front.russian}</small>`;
      if (card.front.hint) {
        front += `<br><small><i>(${card.front.hint})</i></small>`;
      }
      // Back: answer + full sentence
      back = `<b>${card.back.answer}</b><br><br>${card.back.german}`;
      break;
  }

  return { Front: front, Back: back };
}

// Helper to escape regex special characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
