import { readFile } from 'fs/promises';
import { basename } from 'path';
import { config } from './config.js';
import { formatCardForAnki, CARD_LABELS } from './cardTypes.js';

/**
 * Call AnkiConnect API
 */
async function ankiConnect(action, params = {}) {
  const response = await fetch(config.ankiConnectUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, version: 6, params }),
  });

  const result = await response.json();

  if (result.error) {
    throw new Error(`AnkiConnect error: ${result.error}`);
  }

  return result.result;
}

/**
 * Check if AnkiConnect is available
 */
export async function checkConnection() {
  try {
    await ankiConnect('version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure deck exists
 */
export async function ensureDeck(deckName = config.ankiDeck) {
  const decks = await ankiConnect('deckNames');
  if (!decks.includes(deckName)) {
    await ankiConnect('createDeck', { deck: deckName });
  }
}

/**
 * Store audio file in Anki media collection
 * @param {string} audioPath - Path to audio file
 * @returns {Promise<string>} - Filename in Anki media
 */
export async function storeAudio(audioPath) {
  const audioData = await readFile(audioPath);
  const base64 = audioData.toString('base64');
  const filename = basename(audioPath);

  await ankiConnect('storeMediaFile', {
    filename,
    data: base64,
  });

  return filename;
}

/**
 * Create Anki note with audio (legacy single-card method)
 * Audio-first format for comprehension:
 *   Front: audio + optional context
 *   Back: german + ipa + russian
 *
 * @param {Object} data
 * @param {string} data.german - German text
 * @param {string} data.ipa - IPA transcription
 * @param {string} data.russian - Russian translation
 * @param {string} data.audioFilename - Audio filename in Anki media
 * @param {string} data.context - Optional context/situation
 * @param {boolean} data.addReversed - Whether to add reversed card
 * @param {Object} data.cefr - CEFR estimation result
 * @param {string} data.deck - Optional deck override
 */
export async function createNote({
  german,
  ipa,
  russian,
  audioFilename,
  context = null,
  addReversed = true,
  cefr = null,
  deck = null,
}) {
  const deckName = deck || config.ankiDeck;

  // Format front: Audio + optional context (audio-first for comprehension)
  let front = `[sound:${audioFilename}]`;
  if (context) {
    front += `<br>Context: ${context}`;
  }

  // Format back: German + IPA + Russian
  const back = `${german}<br>${ipa}<br>${russian}`;

  // Build fields based on note type
  const fields = {
    Front: front,
    Back: back,
  };

  // Support "Basic (optional reversed card)" - needs "Add Reverse" field to be non-empty
  if (config.ankiNoteType.includes('optional reversed') && addReversed) {
    fields['Add Reverse'] = '1';
  }

  // Build tags
  const tags = ['yt2anki'];
  if (cefr && cefr.level) {
    tags.push(`cefr-${cefr.level.toLowerCase()}`);
  }

  await ankiConnect('addNote', {
    note: {
      deckName,
      modelName: config.ankiNoteType,
      fields,
      options: {
        allowDuplicate: false,
      },
      tags,
    },
  });
}

/**
 * Create multiple Anki notes from generated cards.
 * Used by the Fluent Forever card system for batch creation.
 *
 * @param {Object[]} cards - Generated card objects from cardTypes.js
 * @param {string} audioFilename - Audio filename in Anki media
 * @param {Object} options
 * @param {string} options.sourceId - Unique ID for grouping related cards
 * @param {Object} options.cefr - CEFR estimation result
 * @param {string} options.deck - Override deck name
 * @returns {Promise<number[]>} Array of created note IDs
 */
export async function createNotes(cards, audioFilename, options = {}) {
  const { sourceId, cefr, deck } = options;
  const deckName = deck || config.ankiDeck;
  const noteIds = [];

  for (const card of cards) {
    const fields = formatCardForAnki(card, audioFilename);

    // Build tags
    const tags = ['yt2anki', `card-${card.type}`];
    if (cefr?.level) {
      tags.push(`cefr-${cefr.level.toLowerCase()}`);
    }
    if (sourceId) {
      tags.push(`source-${sourceId}`);
    }

    try {
      const noteId = await ankiConnect('addNote', {
        note: {
          deckName,
          modelName: config.ankiNoteType,
          fields,
          options: {
            allowDuplicate: false,
          },
          tags,
        },
      });
      noteIds.push(noteId);
    } catch (err) {
      // If duplicate, continue with other cards
      if (err.message.includes('duplicate')) {
        console.warn(`Skipped duplicate ${card.type} card`);
        continue;
      }
      throw err;
    }
  }

  return noteIds;
}

/**
 * Get available note types
 */
export async function getNoteTypes() {
  return ankiConnect('modelNames');
}

/**
 * Get fields for a note type
 */
export async function getNoteFields(modelName) {
  return ankiConnect('modelFieldNames', { modelName });
}

/**
 * Normalize German text for comparison
 */
function normalizeGerman(text) {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/[^\w\s]/g, '') // remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshtein(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity percentage (0-100)
 */
function similarity(a, b) {
  const normA = normalizeGerman(a);
  const normB = normalizeGerman(b);
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 100;
  const dist = levenshtein(normA, normB);
  return Math.round((1 - dist / maxLen) * 100);
}

/**
 * Strip Anki field markup down to plain-text lines.
 */
function extractFieldLines(field) {
  return field
    .replace(/\[sound:[^\]]+\]/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(small|b|i)>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Extract searchable text candidates from a note.
 * Current cards often keep the German sentence on the back, not the front.
 */
function extractSearchableText(note) {
  const front = note.fields.Front?.value || '';
  const back = note.fields.Back?.value || '';

  const lines = [...extractFieldLines(front), ...extractFieldLines(back)];

  return lines.filter((line) => {
    if (!line) return false;
    if (line === 'Antworte') return false;
    if (line.startsWith('Context:')) return false;
    if (/^\[.*\]$/.test(line)) return false; // IPA-only line
    return true;
  });
}

/**
 * Find similar cards in the deck
 * @param {string} germanText - German text to search for
 * @param {number} threshold - Minimum similarity percentage (default: 70)
 * @returns {Promise<Array<{german: string, similarity: number}>>}
 */
export async function findSimilarCards(germanText, threshold = 70) {
  // Get all notes with yt2anki tag
  const noteIds = await ankiConnect('findNotes', {
    query: `tag:yt2anki`,
  });

  if (noteIds.length === 0) {
    return [];
  }

  // Get note info
  const notes = await ankiConnect('notesInfo', { notes: noteIds });

  const similar = [];

  for (const note of notes) {
    const candidates = extractSearchableText(note);
    if (candidates.length === 0) continue;

    let bestMatch = null;
    for (const candidate of candidates) {
      const sim = similarity(germanText, candidate);
      if (!bestMatch || sim > bestMatch.similarity) {
        bestMatch = { german: candidate, similarity: sim };
      }
    }

    if (bestMatch && bestMatch.similarity >= threshold) {
      similar.push({
        german: bestMatch.german,
        similarity: bestMatch.similarity,
      });
    }
  }

  // Sort by similarity descending
  similar.sort((a, b) => b.similarity - a.similarity);

  return similar;
}
