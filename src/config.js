import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';

const CONFIG_PATH = join(homedir(), '.yt2anki.json');

// Default configuration
const defaults = {
  // AnkiConnect
  ankiConnectUrl: 'http://localhost:8765',
  ankiDeck: 'German::YouTube',
  ankiNoteType: 'Basic (optional reversed card)',

  // Paths
  dataDir: join(tmpdir(), 'yt2anki'),
  whisperModel: 'base',

  // OpenAI
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',

  // Audio
  audioFormat: 'aac',
};

// Load user config from ~/.yt2anki.json
function loadConfig() {
  let userConfig = {};

  if (existsSync(CONFIG_PATH)) {
    try {
      const content = readFileSync(CONFIG_PATH, 'utf-8');
      userConfig = JSON.parse(content);
    } catch (err) {
      console.error(`Warning: Could not parse ${CONFIG_PATH}: ${err.message}`);
    }
  }

  return { ...defaults, ...userConfig };
}

export const config = loadConfig();
export const CONFIG_PATH_DISPLAY = CONFIG_PATH;
