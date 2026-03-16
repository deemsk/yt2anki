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

  // Concatenate: lead-in silence + slow + pause + normal
  const leadIn = config.audioLeadIn || 0.4;
  await concatenateWithPause([slowPath, normalPath], outputPath, pauseDuration, leadIn);

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

  const rawPath = outputPath.replace(/\.(m4a|aac|mp3)$/, '_raw.mp3');
  await generateClip(text, rawPath, voice, speed);

  await execFileAsync('ffmpeg', ['-i', rawPath, '-filter:a', 'volume=1.2', '-y', outputPath]);
  await unlink(rawPath);

  return outputPath;
}
