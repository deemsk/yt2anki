import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';

const PRIMARY_CONFIG_PATH = join(homedir(), '.derdiedeck.json');
const LEGACY_CONFIG_PATH = join(homedir(), '.yt2anki.json');

function resolveConfigPath() {
  if (existsSync(PRIMARY_CONFIG_PATH)) {
    return PRIMARY_CONFIG_PATH;
  }

  if (existsSync(LEGACY_CONFIG_PATH)) {
    return LEGACY_CONFIG_PATH;
  }

  return PRIMARY_CONFIG_PATH;
}

// Default configuration
const defaults = {
  // AnkiConnect
  ankiConnectUrl: 'http://localhost:8765',
  ankiDeck: 'German::YouTube',
  ankiNoteType: 'Basic (optional reversed card)',
  wordNoteType: '2. Picture Words',
  grammarNoteType: 'Cloze',

  // Paths
  dataDir: join(tmpdir(), 'derdiedeck'),
  whisperModel: 'base',

  // OpenAI
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',

  // IPA generation
  ipaBinary: 'espeak-ng',
  ipaVoice: 'de',
  ipaFallbackToModel: true,

  // Google TTS
  googleTtsKeyFile: '',                                      // path to service account JSON; falls back to GOOGLE_APPLICATION_CREDENTIALS
  googleApiKey: '',                                        // 1Password reference, e.g. op://Personal/Google TTS Key/credential
  googleTtsVoices: ['de-DE-Neural2-B', 'de-DE-Neural2-C'],  // Male, Female

  // Brave Search API (optional)
  braveApiKey: '',

  // Audio
  audioFormat: 'mp3',
  ttsSpeed: 0.75,     // Main speech rate for generated word and sentence audio
  ttsNormalRate: 0.9, // Default rate for explicit single-clip non-slow TTS calls
  ttsPause: 1.0,      // Legacy setting from the old slow+normal repeated sentence audio
  audioLeadIn: 0.4,   // Silence at start of audio (seconds) for brain to tune in
  wordImagePreviewCount: 12,
  wordImageSearchResults: 12,
};

const ACTIVE_CONFIG_PATH = resolveConfigPath();

// Load user config from ~/.derdiedeck.json, falling back to ~/.yt2anki.json
function loadConfig() {
  let userConfig = {};

  if (existsSync(ACTIVE_CONFIG_PATH)) {
    try {
      const content = readFileSync(ACTIVE_CONFIG_PATH, 'utf-8');
      userConfig = JSON.parse(content);
    } catch (err) {
      console.error(`Warning: Could not parse ${ACTIVE_CONFIG_PATH}: ${err.message}`);
    }
  }

  return { ...defaults, ...userConfig };
}

export const config = loadConfig();
export const CONFIG_PATH_DISPLAY = PRIMARY_CONFIG_PATH;
export const ACTIVE_CONFIG_PATH_DISPLAY = ACTIVE_CONFIG_PATH;
export const LEGACY_CONFIG_PATH_DISPLAY = LEGACY_CONFIG_PATH;
