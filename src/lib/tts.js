import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config, CONFIG_PATH_DISPLAY } from './config.js';
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

function normalizePhonemeIpa(ipa = null) {
  const value = String(ipa || '').trim();
  if (!value) {
    return null;
  }

  const stripped = value.replace(/^\[/, '').replace(/\]$/, '').trim();
  return stripped || null;
}

function toProsodyRatePercent(rate) {
  if (!Number.isFinite(rate)) {
    return null;
  }

  return Math.max(20, Math.min(200, Math.round(rate * 100)));
}

function buildSsml(text, { ipa = null, slow = false, prosodyRate = null } = {}) {
  const escapedText = escapeXml(text);
  const phonemeIpa = normalizePhonemeIpa(ipa);
  let inner = phonemeIpa
    ? `<phoneme alphabet="ipa" ph="${escapeXml(phonemeIpa)}">${escapedText}</phoneme>`
    : escapedText;

  const rate = toProsodyRatePercent(
    prosodyRate != null ? prosodyRate : (slow ? (config.ttsSpeed || 0.75) : null)
  );
  if (rate != null && rate !== 100) {
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
        `Or set "googleTtsKeyFile" in ${CONFIG_PATH_DISPLAY}`
      );
    }
    throw err;
  }

  await writeFile(outputPath, Buffer.from(response.audioContent));
}

async function finalizeClip(inputPath, outputPath, { leadIn = 0, volume = 1.2 } = {}) {
  const filters = [];
  const leadInMs = Math.round(Math.max(0, leadIn) * 1000);

  if (leadInMs > 0) {
    filters.push(`adelay=${leadInMs}|${leadInMs}`);
  }

  if (volume !== 1) {
    filters.push(`volume=${volume}`);
  }

  const args = [
    '-i', inputPath,
    '-y',
  ];

  if (filters.length > 0) {
    args.splice(2, 0, '-filter:a', filters.join(','));
  }

  args.push(outputPath);
  await execFileAsync('ffmpeg', args);
}

/**
 * Generate speech audio from German text using Google Cloud TTS
 * Creates a single slow clip.
 *
 * @param {string} text - German text to speak
 * @param {string} outputPath - Path to save the audio file
 * @returns {Promise<string>} - Path to the generated audio file
 */
export async function generateSpeech(text, outputPath) {
  await mkdir(config.dataDir, { recursive: true });

  const voice = getNextVoice();
  const leadIn = config.audioLeadIn || 0.4;

  const rawPath = outputPath.replace(/\.(m4a|aac|mp3)$/, '_raw.mp3');
  await generateClip(text, rawPath, voice, {
    slow: true,
    audioConfig: { pitch: -1.0 },
  });

  await finalizeClip(rawPath, outputPath, { leadIn });
  await unlink(rawPath);

  return outputPath;
}

/**
 * Generate a single TTS clip for isolated word audio or other non-repeated prompts.
 */
export async function generateSimpleSpeech(text, outputPath, options = {}) {
  await mkdir(config.dataDir, { recursive: true });

  const voice = options.voice || getNextVoice();
  const requestedRate = Number.isFinite(options.speed) ? options.speed : null;
  const slow = requestedRate != null ? requestedRate < 1.0 : false;
  const ipa = options.ipa || null;

  const rawPath = outputPath.replace(/\.(m4a|aac|mp3)$/, '_raw.mp3');
  await generateClip(text, rawPath, voice, {
    slow,
    ipa,
    prosodyRate: requestedRate != null && requestedRate !== 1.0 ? requestedRate : null,
    audioConfig: slow
      ? { pitch: -1.0 }
      : { speakingRate: requestedRate != null ? requestedRate : (config.ttsNormalRate || 0.9) },
  });

  await finalizeClip(rawPath, outputPath);
  await unlink(rawPath);

  return outputPath;
}
