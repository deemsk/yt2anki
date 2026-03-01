import { spawn } from 'child_process';
import { join, basename } from 'path';
import { config } from './config.js';

/**
 * Parse timestamp string to seconds
 * Supports: "1:23", "1:23.5", "83", "83.5"
 */
export function parseTimestamp(ts) {
  if (typeof ts === 'number') return ts;

  const parts = ts.split(':').map(Number);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];

  throw new Error(`Invalid timestamp: ${ts}`);
}

/**
 * Format seconds to timestamp string for filenames
 */
function formatTimestamp(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 100);
  return `${mins}-${secs.toString().padStart(2, '0')}-${ms.toString().padStart(2, '0')}`;
}

/**
 * Cut audio clip from source file
 * @param {string} sourcePath - Path to source audio file
 * @param {number|string} start - Start timestamp
 * @param {number|string} end - End timestamp
 * @param {number} index - Clip index for naming
 * @returns {Promise<{wavPath: string, aacPath: string}>}
 */
export async function cutClip(sourcePath, start, end, index) {
  const startSec = parseTimestamp(start);
  const endSec = parseTimestamp(end);
  const duration = endSec - startSec;

  if (duration <= 0) {
    throw new Error(`Invalid clip duration: ${duration}s (start: ${start}, end: ${end})`);
  }

  const baseName = basename(sourcePath, '.wav');
  const clipName = `${baseName}_clip${index.toString().padStart(3, '0')}_${formatTimestamp(startSec)}`;

  const wavPath = join(config.dataDir, `${clipName}.wav`);
  const aacPath = join(config.dataDir, `${clipName}.m4a`);

  // First cut to WAV (for Whisper)
  await runFfmpeg([
    '-y',
    '-ss', String(startSec),
    '-t', String(duration),
    '-i', sourcePath,
    '-acodec', 'pcm_s16le',
    '-ar', '16000',
    '-ac', '1',
    wavPath,
  ]);

  // Then convert to AAC/M4A (for Anki)
  await runFfmpeg([
    '-y',
    '-i', wavPath,
    '-c:a', 'aac',
    '-b:a', '128k',
    aacPath,
  ]);

  return { wavPath, aacPath };
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let errorOutput = '';

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg failed: ${errorOutput}`));
      }
    });
  });
}
