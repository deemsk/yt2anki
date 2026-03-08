import OpenAI from 'openai';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from './config.js';

const execFileAsync = promisify(execFile);

let openai = null;
let voiceIndex = 0;

// Available voices for variety (alternating male/female)
const VOICES = ['nova', 'onyx', 'shimmer', 'echo', 'alloy', 'fable'];
const DEFAULT_VOICES = ['nova', 'onyx'];  // Female, Male

function getClient() {
  if (!openai) {
    const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not set');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

/**
 * Get next voice (alternates between configured voices)
 */
function getNextVoice() {
  const voices = config.ttsVoices || DEFAULT_VOICES;
  const voice = voices[voiceIndex % voices.length];
  voiceIndex++;
  return voice;
}

/**
 * Generate single audio clip
 */
async function generateClip(text, outputPath, voice, speed) {
  const client = getClient();

  const response = await client.audio.speech.create({
    model: 'tts-1-hd',  // High quality model for clearer pronunciation
    voice,
    input: text,
    response_format: 'mp3',
    speed,
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
}

/**
 * Concatenate audio files with silence between them
 */
async function concatenateWithPause(files, outputPath, pauseDuration = 1.0) {
  // Build filter complex for concatenation with silence
  // Input files + silence between them
  const inputs = [];
  const filterParts = [];

  for (let i = 0; i < files.length; i++) {
    inputs.push('-i', files[i]);
  }

  // Create filter: [0]audio + silence + [1]audio + silence + ...
  let filterComplex = '';
  for (let i = 0; i < files.length; i++) {
    filterComplex += `[${i}:a]`;
    if (i < files.length - 1) {
      // Add silence after each clip except the last
      filterComplex += `apad=pad_dur=${pauseDuration},`;
    }
  }

  // Simpler approach: use concat filter with silence generator
  const args = [
    ...inputs,
    '-filter_complex',
    `[0:a]apad=pad_dur=${pauseDuration}[a0];[a0][1:a]concat=n=2:v=0:a=1`,
    '-y',
    outputPath,
  ];

  await execFileAsync('ffmpeg', args);
}

/**
 * Generate speech audio from German text using OpenAI TTS
 * Creates: [slow version] + [pause] + [normal version]
 *
 * @param {string} text - German text to speak
 * @param {string} outputPath - Path to save the audio file
 * @returns {Promise<string>} - Path to the generated audio file
 */
export async function generateSpeech(text, outputPath) {
  await mkdir(config.dataDir, { recursive: true });

  const voice = getNextVoice();
  const slowSpeed = config.ttsSpeed || 0.7;
  const normalSpeed = 1.0;
  const pauseDuration = config.ttsPause || 1.0;

  // Generate slow version
  const slowPath = outputPath.replace(/\.(m4a|aac|mp3)$/, '_slow.mp3');
  await generateClip(text, slowPath, voice, slowSpeed);

  // Generate normal speed version
  const normalPath = outputPath.replace(/\.(m4a|aac|mp3)$/, '_normal.mp3');
  await generateClip(text, normalPath, voice, normalSpeed);

  // Concatenate: slow + pause + normal
  await concatenateWithPause([slowPath, normalPath], outputPath, pauseDuration);

  // Clean up temp files
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
  const speed = options.speed || config.ttsSpeed || 0.7;

  await generateClip(text, outputPath, voice, speed);
  return outputPath;
}
