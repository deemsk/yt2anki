import { spawn } from 'child_process';
import { readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { config } from './config.js';

// Possible model locations
const MODEL_PATHS = [
  '/opt/homebrew/share/whisper-cpp',
  `${process.env.HOME}/.cache/whisper.cpp`,
  `${process.env.HOME}/Library/Application Support/whisper.cpp`,
];

/**
 * Find whisper model file
 */
export function findModelPath() {
  const modelName = `ggml-${config.whisperModel}.bin`;

  for (const dir of MODEL_PATHS) {
    const path = join(dir, modelName);
    if (existsSync(path)) return path;
  }

  return null;
}

/**
 * Transcribe audio using whisper-cli
 * @param {string} wavPath - Path to WAV file (16kHz mono)
 * @param {string} [ccHint] - Optional CC text for this clip window (used as whisper prompt)
 * @returns {Promise<string>} - Transcribed German text
 */
export async function transcribe(wavPath, ccHint = null) {
  const modelPath = findModelPath();
  if (!modelPath) {
    throw new Error(`Whisper model not found. Download with: whisper-cpp-download-ggml-model ${config.whisperModel}`);
  }

  const outputBase = wavPath.replace('.wav', '');

  return new Promise((resolve, reject) => {
    const args = [
      '-m', modelPath,
      '-l', 'de',         // German language
      '-otxt',            // Output as text file
      '-of', outputBase,  // Output file base name
      '--beam-size', '5', // Beam search for more accurate transcription
      '--prompt', ccHint || 'Ein Gespräch auf Deutsch.',  // CC text (or fallback) to reduce hallucinations
      wavPath,            // Input file (positional)
    ];

    const proc = spawn('whisper-cli', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let errorOutput = '';

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`whisper-cli failed: ${errorOutput}`));
        return;
      }

      try {
        const txtPath = `${outputBase}.txt`;
        const text = await readFile(txtPath, 'utf-8');
        // Clean up temp file
        await unlink(txtPath).catch(() => {});
        resolve(text.trim());
      } catch (err) {
        reject(new Error(`Failed to read transcription: ${err.message}`));
      }
    });
  });
}
