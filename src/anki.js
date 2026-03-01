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
 */
export async function createNote({ german, ipa, russian, audioFilename }) {
  // Format front: Audio, phrase, IPA
  const front = `[sound:${audioFilename}] ${german}\n${ipa}`;
  const back = russian;

  // Build fields based on note type
  const fields = {
    Front: front,
    Back: back,
  };

  // Support "Basic (optional reversed card)" - needs "Add Reverse" field to be non-empty
  if (config.ankiNoteType.includes('optional reversed')) {
    fields['Add Reverse'] = '1';
  }

  await ankiConnect('addNote', {
    note: {
      deckName: config.ankiDeck,
      modelName: config.ankiNoteType,
      fields,
      options: {
        allowDuplicate: false,
      },
      tags: ['yt2anki'],
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
