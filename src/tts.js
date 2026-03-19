import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from './config.js';
import { resolveSecret } from './secrets.js';

const execFileAsync = promisify(execFile);
let ttsClient = null;
let voiceIndex = 0;
const DEFAULT_VOICES = ['de-DE-Neural2-B', 'de-DE-Neural2-C'];

async function getClient() {
  if (!ttsClient) {
    if (config.googleApiKey) {
      const json = await resolveSecret(config.googleApiKey);
      const credentials = JSON.parse(json);
      ttsClient = new TextToSpeechClient({ credentials });
    } else {
      const keyFile = config.googleTtsKeyFile || process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const clientOptions = keyFile ? { keyFilename: keyFile } : {};
      ttsClient = new TextToSpeechClient(clientOptions);
    }
  }
  return ttsClient;
}

function getNextVoice() {
  const voices = config.googleTtsVoices || DEFAULT_VOICES;
  const voice = voices[voiceIndex % voices.length];
  voiceIndex++;
  return voice;
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSsml(text, { ipa = null, slow = false } = {}) {
  const escapedText = escapeXml(text);
  let inner = ipa
    ? `<phoneme alphabet="ipa" ph="${escapeXml(ipa)}">${escapedText}</phoneme>`
    : escapedText;

  if (slow) {
    const rate = Math.round((config.ttsSpeed || 0.75) * 100);
    inner = `<prosody rate="${rate}%">${inner}</prosody>`;
  }

  return `<speak><s>${inner}</s></speak>`;
}

async function generateClip(text, outputPath, voiceName, options = {}) {
  const client = await getClient();
  const ssml = buildSsml(text, options);
  const languageCode = voiceName.split('-').slice(0, 2).join('-'); // 'de-DE'

  const audioConfig = {
    audioEncoding: 'MP3',
    effectsProfileId: ['headphone-class-device'],
    ...options.audioConfig,
  };

  let response;
  try {
    [response] = await client.synthesizeSpeech({
      input: { ssml },
      voice: { languageCode, name: voiceName },
      audioConfig,
    });
  } catch (err) {
    if (err.message?.includes('Could not load the default credentials') || err.code === 7 || err.code === 16) {
      throw new Error(
        'Google TTS credentials not found. Run:\n' +
        '  gcloud auth application-default login\n' +
        '  gcloud auth application-default set-quota-project YOUR_PROJECT_ID\n' +
        'Or set "googleTtsKeyFile" in ~/.yt2anki.json'
      );
    }
    throw err;
  }

  await writeFile(outputPath, Buffer.from(response.audioContent));
}

/**
 * Concatenate audio files with lead-in silence and pause between them
 */
async function concatenateWithPause(files, outputPath, pauseDuration = 1.0, leadIn = 0.4) {
  // Filter: add lead-in silence + first clip + pause + second clip
  // adelay adds silence at the start (in milliseconds)
  const leadInMs = Math.round(leadIn * 1000);

  const args = [
    '-i', files[0],
    '-i', files[1],
    '-filter_complex',
    `[0:a]adelay=${leadInMs}|${leadInMs},apad=pad_dur=${pauseDuration}[a0];[a0][1:a]concat=n=2:v=0:a=1,volume=1.2`,
    '-y',
    outputPath,
  ];

  await execFileAsync('ffmpeg', args);
}

/**
 * Generate speech audio from German text using Google Cloud TTS
 * Creates: [slow version] + [pause] + [normal version]
 *
 * @param {string} text - German text to speak
 * @param {string} outputPath - Path to save the audio file
 * @returns {Promise<string>} - Path to the generated audio file
 */
export async function generateSpeech(text, outputPath) {
  await mkdir(config.dataDir, { recursive: true });

  const voice = getNextVoice();
  const pauseDuration = config.ttsPause || 1.0;
  const leadIn = config.audioLeadIn || 0.4;

  const slowPath = outputPath.replace(/\.(m4a|aac|mp3)$/, '_slow.mp3');
  await generateClip(text, slowPath, voice, {
    slow: true,
    audioConfig: { pitch: -1.0 },
  });

  const normalPath = outputPath.replace(/\.(m4a|aac|mp3)$/, '_normal.mp3');
  await generateClip(text, normalPath, voice, {
    slow: false,
    audioConfig: { speakingRate: config.ttsNormalRate || 0.9 },
  });

  await concatenateWithPause([slowPath, normalPath], outputPath, pauseDuration, leadIn);
  await unlink(slowPath);
  await unlink(normalPath);

  return outputPath;
}

/**
 * Generate simple speech (single clip, no repeat)
 * Use this for isolated word audio
 */
export async function generateSimpleSpeech(text, outputPath, options = {}) {
  await mkdir(config.dataDir, { recursive: true });

  const voice = options.voice || getNextVoice();
  const slow = options.speed != null ? options.speed < 1.0 : false;
  const ipa = options.ipa || null;

  const rawPath = outputPath.replace(/\.(m4a|aac|mp3)$/, '_raw.mp3');
  await generateClip(text, rawPath, voice, {
    slow,
    ipa,
    audioConfig: slow ? { pitch: -1.0 } : { speakingRate: config.ttsNormalRate || 0.9 },
  });

  await execFileAsync('ffmpeg', ['-i', rawPath, '-filter:a', 'volume=1.2', '-y', outputPath]);
  await unlink(rawPath);

  return outputPath;
}
