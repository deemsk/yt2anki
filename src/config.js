import { homedir } from 'os';
import { join } from 'path';

export const config = {
  // AnkiConnect
  ankiConnectUrl: 'http://localhost:8765',
  ankiDeck: 'German::YouTube',
  ankiNoteType: 'Basic (and reversed card)',

  // Paths
  dataDir: join(process.cwd(), 'data'),
  whisperModel: 'base',

  // OpenAI
  openaiModel: 'gpt-4o-mini',

  // Audio
  audioFormat: 'aac',
};
