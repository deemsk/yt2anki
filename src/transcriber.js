import { spawn } from 'child_process';
import { readFile, unlink } from 'fs/promises';
import { join, dirname, basename } from 'path';

/**
 * Transcribe audio using whisper.cpp
 * @param {string} wavPath - Path to WAV file (16kHz mono)
 * @returns {Promise<string>} - Transcribed German text
 */
export async function transcribe(wavPath) {
  const outputBase = wavPath.replace('.wav', '');

  return new Promise((resolve, reject) => {
    const args = [
      '-m', getModelPath(),
      '-l', 'de',         // German language
      '-otxt',            // Output as text file
      '-of', outputBase,  // Output file base name
      '-f', wavPath,      // Input file
    ];

    const proc = spawn('whisper-cpp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let errorOutput = '';

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`whisper-cpp failed: ${errorOutput}`));
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

function getModelPath() {
  // whisper.cpp stores models in ~/.cache/whisper.cpp or /opt/homebrew/share/whisper-cpp/models
  const homeModel = join(process.env.HOME, '.cache', 'whisper.cpp', 'ggml-base.bin');
  const brewModel = '/opt/homebrew/share/whisper-cpp/models/ggml-base.bin';

  // Try common locations
  return brewModel;
}
