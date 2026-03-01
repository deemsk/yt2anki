import OpenAI from 'openai';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { config } from './config.js';

let openai = null;

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
 * Generate speech audio from German text using OpenAI TTS
 * @param {string} text - German text to speak
 * @param {string} outputPath - Path to save the audio file
 * @returns {Promise<string>} - Path to the generated audio file
 */
export async function generateSpeech(text, outputPath) {
  const client = getClient();

  const response = await client.audio.speech.create({
    model: 'tts-1',
    voice: config.ttsVoice || 'nova',
    input: text,
    response_format: 'aac',
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(outputPath, buffer);

  return outputPath;
}
