import { spawn } from 'child_process';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { config } from './config.js';

/**
 * Download audio from YouTube video
 * @param {string} url - YouTube URL
 * @returns {Promise<string>} - Path to downloaded audio file
 */
export async function downloadAudio(url) {
  await mkdir(config.dataDir, { recursive: true });

  const outputTemplate = join(config.dataDir, '%(id)s.%(ext)s');

  return new Promise((resolve, reject) => {
    const args = [
      '-x',
      '--audio-format', 'wav', // WAV for whisper compatibility
      '-o', outputTemplate,
      '--print', 'filename',
      '--no-simulate',
      url,
    ];

    const proc = spawn('yt-dlp', args);
    let outputPath = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line.endsWith('.wav')) {
        outputPath = line;
      }
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && outputPath) {
        resolve(outputPath);
      } else {
        reject(new Error(`yt-dlp failed: ${errorOutput}`));
      }
    });
  });
}

/**
 * Extract video ID from YouTube URL
 */
export function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  throw new Error(`Could not extract video ID from: ${url}`);
}
