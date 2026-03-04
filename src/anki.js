import { readFile } from 'fs/promises';
import { basename } from 'path';
import { config } from './config.js';

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
 * Create Anki note with audio
 * @param {Object} data
 * @param {string} data.german - German text
 * @param {string} data.ipa - IPA transcription
 * @param {string} data.russian - Russian translation
 * @param {string} data.audioFilename - Audio filename in Anki media
 * @param {boolean} data.addReversed - Whether to add reversed card
 * @param {Object} data.cefr - CEFR estimation result
 */
export async function createNote({ german, ipa, russian, audioFilename, addReversed = true, cefr = null }) {
  // Format front: Audio, phrase, IPA
  const front = `[sound:${audioFilename}] ${german}<br>${ipa}`;
  const back = russian;

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
      deckName: config.ankiDeck,
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
 * Extract German text from card Front field
 * Front format: [sound:file.m4a] German text<br>[IPA]
 */
function extractGermanFromFront(front) {
  return front
    .replace(/\[sound:[^\]]+\]/g, '') // remove sound tag
    .replace(/<br>.*$/i, '') // remove IPA after <br>
    .trim();
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
    const front = note.fields.Front?.value || '';
    const existingGerman = extractGermanFromFront(front);

    if (!existingGerman) continue;

    const sim = similarity(germanText, existingGerman);

    if (sim >= threshold) {
      similar.push({
        german: existingGerman,
        similarity: sim,
      });
    }
  }

  // Sort by similarity descending
  similar.sort((a, b) => b.similarity - a.similarity);

  return similar;
}
