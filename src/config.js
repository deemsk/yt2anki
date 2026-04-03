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
  wordNoteType: '2. Picture Words',
  grammarNoteType: 'Cloze',

  // Paths
  dataDir: join(tmpdir(), 'yt2anki'),
  whisperModel: 'base',

  // OpenAI
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',

  // Google TTS
  googleTtsKeyFile: '',                                      // path to service account JSON; falls back to GOOGLE_APPLICATION_CREDENTIALS
  googleApiKey: '',                                        // 1Password reference, e.g. op://Personal/Google TTS Key/credential
  googleTtsVoices: ['de-DE-Neural2-B', 'de-DE-Neural2-C'],  // Male, Female

  // Brave Search API (optional)
  braveApiKey: '',

  // Audio
  audioFormat: 'mp3',
  ttsSpeed: 0.75,     // Slow clip SSML prosody rate (0.75 = 25% slower, natural floor for Neural2)
  ttsNormalRate: 0.9, // Normal clip speaking rate via audioConfig (0.9 = 10% slower than native)
  ttsPause: 1.0,      // Pause between slow and normal (seconds)
  audioLeadIn: 0.4,   // Silence at start of audio (seconds) for brain to tune in
  wordImagePreviewCount: 12,
  wordImageSearchResults: 12,
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
