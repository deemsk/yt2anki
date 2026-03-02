import { execSync } from 'child_process';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { config } from './config.js';
import { extractVideoId } from './downloader.js';

// Download and parse German subtitles for a YouTube video
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
        const text = parseSrt(content);

        // Clean up file
        try { await unlink(filePath); } catch {}

        return text;
      } catch {
        // File doesn't exist, try next
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Parse SRT format and extract plain text
function parseSrt(content) {
  const lines = content.split('\n');
  const textLines = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Skip sequence numbers (just digits)
    if (/^\d+$/.test(trimmed)) continue;

    // Skip timestamp lines (00:00:00,000 --> 00:00:00,000)
    if (/^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}$/.test(trimmed)) continue;

    // This is actual text - clean up HTML tags and add
    const cleanText = trimmed
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/\[.*?\]/g, '') // Remove [Music] etc.
      .trim();

    if (cleanText) {
      textLines.push(cleanText);
    }
  }

  // Join and deduplicate consecutive identical lines
  const result = [];
  let prev = '';
  for (const line of textLines) {
    if (line !== prev) {
      result.push(line);
      prev = line;
    }
  }

  return result.join(' ');
}

// Get subtitle context for a specific time range
export function getSubtitleContext(fullText, startTime, endTime) {
  // For now, return the full subtitle text as context
  // Could be optimized to extract only relevant portion based on timestamps
  // but full context is usually fine for the LLM
  return fullText;
}
