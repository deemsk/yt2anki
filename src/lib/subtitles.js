import { execSync } from 'child_process';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { config } from './config.js';
import { extractVideoId } from './downloader.js';

/**
 * Download German subtitles for a YouTube video.
 * @returns {Promise<Array<{start: number, end: number, text: string}>|null>}
 */
export async function fetchSubtitles(url) {
  const videoId = extractVideoId(url);
  const outputTemplate = join(config.dataDir, `subs_${videoId}`);

  try {
    // Try to download German subtitles (prefer original, fall back to auto-generated)
    execSync(
      `yt-dlp --write-sub --write-auto-sub --sub-lang de-orig,de --sub-format srt --skip-download -o "${outputTemplate}" "${url}" 2>/dev/null`,
      { stdio: 'pipe', timeout: 30000 }
    );

    // Try to read the subtitle file (could be .de-orig.srt or .de.srt)
    const possibleFiles = [
      `${outputTemplate}.de-orig.srt`,
      `${outputTemplate}.de.srt`,
    ];

    for (const filePath of possibleFiles) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const entries = parseSrt(content);

        // Clean up file
        try { await unlink(filePath); } catch {}

        return entries;
      } catch {
        // File doesn't exist, try next
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Parse SRT format into timed entries
function parseSrt(content) {
  const entries = [];
  const blocks = content.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');

    // Find the timestamp line
    const tsLine = lines.find(l => /^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}$/.test(l.trim()));
    if (!tsLine) continue;

    const [startStr, endStr] = tsLine.split('-->').map(s => s.trim());
    const start = srtTimeToSeconds(startStr);
    const end = srtTimeToSeconds(endStr);

    // Remaining lines after the timestamp are the text
    const textLines = lines
      .filter(l => l !== tsLine && !/^\d+$/.test(l.trim()))
      .map(l => l.replace(/<[^>]+>/g, '').replace(/\[.*?\]/g, '').trim())
      .filter(Boolean);

    const text = textLines.join(' ');
    if (text) entries.push({ start, end, text });
  }

  // Deduplicate consecutive identical lines (common in auto-generated subs)
  return entries.filter((e, i) => i === 0 || e.text !== entries[i - 1].text);
}

function srtTimeToSeconds(ts) {
  const [h, m, s] = ts.replace(',', '.').split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

/**
 * Extract CC text overlapping a clip's time window.
 * @param {Array<{start: number, end: number, text: string}>} entries
 * @param {number} startTime - clip start in seconds
 * @param {number} endTime - clip end in seconds
 * @returns {string|null}
 */
export function getSubtitleContext(entries, startTime, endTime) {
  if (!entries) return null;
  const relevant = entries.filter(e => e.end > startTime && e.start < endTime);
  if (!relevant.length) return null;
  return relevant.map(e => e.text).join(' ');
}
