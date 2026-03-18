import { createInterface } from 'readline';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { platform, tmpdir } from 'os';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { config } from './config.js';
import { escapeHtml, formatPluralLabel, normalizeGermanForCompare } from './wordUtils.js';
import { playAudio } from './confirm.js';
import { cachePreviewImages, manualLocalSelection, manualRemoteSelection } from './wordSources.js';

function ask(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function openFile(filePath) {
  const os = platform();
  let cmd = null;
  let args = [];

  if (os === 'darwin') {
    cmd = 'open';
    args = [filePath];
  } else if (os === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', filePath];
  } else {
    cmd = 'xdg-open';
    args = [filePath];
  }

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    resolve();
  });
}

function buildImagePreviewHtml(wordData, meaning, candidates, page, totalPages) {
  const items = candidates.map((candidate, index) => `
    <figure class="tile">
      <div class="num">${index + 1}</div>
      <img src="${escapeHtml(candidate.previewDisplayUrl || candidate.previewUrl)}" alt="${escapeHtml(candidate.title)}" />
    </figure>
  `).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(wordData.canonical)} image preview</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #ffffff;
      color: #111827;
    }
    .chrome {
      padding: 18px 20px 12px;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 650;
      letter-spacing: -0.03em;
    }
    p {
      margin: 6px 0 0;
      color: #6b7280;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 4px;
      padding: 0 4px 4px;
    }
    .tile {
      margin: 0;
      position: relative;
      overflow: hidden;
      border-radius: 12px;
      background: #eceff3;
    }
    .tile img {
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      display: block;
      background: #e5e7eb;
    }
    .num {
      position: absolute;
      top: 10px;
      left: 10px;
      width: 28px;
      height: 28px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      background: rgba(17, 24, 39, 0.76);
      color: white;
      font-weight: 700;
      font-size: 13px;
      backdrop-filter: blur(8px);
    }
    @media (max-width: 900px) {
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <div class="chrome">
    <h1>${escapeHtml(wordData.canonical)} (${escapeHtml(meaning.russian)})</h1>
    <p>Choose image ${page * 6 + 1}-${page * 6 + candidates.length}. Press the same number in the terminal.</p>
  </div>
  <div class="grid">${items}</div>
</body>
</html>`;
}

async function openImagePreview(wordData, meaning, candidates, page, totalPages) {
  const previewDir = join(tmpdir(), 'yt2anki-previews');
  await mkdir(previewDir, { recursive: true });
  const previewPath = join(previewDir, `word-preview-${Date.now()}.html`);
  const cachedCandidates = await cachePreviewImages(candidates, previewDir);
  const htmlCandidates = cachedCandidates.map((candidate) => ({
    ...candidate,
    previewDisplayUrl: candidate.previewDisplaySrc && existsSync(candidate.previewDisplaySrc)
      ? pathToFileURL(candidate.previewDisplaySrc).href
      : candidate.previewDisplaySrc,
  }));
  const html = buildImagePreviewHtml(wordData, meaning, htmlCandidates, page, totalPages);
  await writeFile(previewPath, html, 'utf-8');

  try {
    await openFile(previewPath);
  } catch {
    // Text fallback below is enough if the browser cannot be opened.
  }

  return previewPath;
}

function meaningMatches(input, meaning) {
  const normalizedInput = normalizeGermanForCompare(input);
  return normalizeGermanForCompare(meaning.russian) === normalizedInput ||
    normalizeGermanForCompare(meaning.english) === normalizedInput;
}

export async function chooseMeaning(wordData, preferredMeaning = null) {
  if (!wordData.meanings?.length) {
    throw new Error('No meaning options available for this word');
  }

  if (preferredMeaning) {
    const matched = wordData.meanings.find((meaning) => meaningMatches(preferredMeaning, meaning));
    if (matched) {
      return matched;
    }

    return {
      russian: preferredMeaning,
      english: wordData.meanings[0].english || wordData.bareNoun,
      imageSearchTerms: [wordData.bareNoun],
    };
  }

  if (wordData.meanings.length === 1) {
    return wordData.meanings[0];
  }

  console.log();
  console.log(`Meanings for ${wordData.canonical}:`);
  wordData.meanings.forEach((meaning, index) => {
    console.log(`  ${index + 1}. ${meaning.russian}`);
  });

  while (true) {
    const answer = await ask('Choose meaning [1-3, Enter=1, E=edit]: ');
    const normalized = answer.toLowerCase();

    if (normalized === '') {
      return wordData.meanings[0];
    }

    if (normalized === 'e' || normalized === 'edit') {
      const edited = await ask('Enter the intended meaning/gloss: ');
      if (!edited) continue;
      return {
        russian: edited,
        english: wordData.meanings[0].english || wordData.bareNoun,
        imageSearchTerms: [wordData.bareNoun],
      };
    }

    const index = parseInt(normalized, 10);
    if (!Number.isNaN(index) && index >= 1 && index <= wordData.meanings.length) {
      return wordData.meanings[index - 1];
    }
  }
}

export async function chooseImage(wordData, meaning, candidates) {
  if (!candidates.length) {
    console.log();
    console.log(`No image candidates found for ${wordData.canonical}.`);
    const manual = await ask('Enter image URL/local path, or press Enter to skip this word: ');
    if (!manual) return null;

    if (/^https?:\/\//i.test(manual)) {
      return manualRemoteSelection(manual);
    }

    if (existsSync(manual)) {
      return manualLocalSelection(manual);
    }

    console.log('Image path not found.');
    return null;
  }

  const pageSize = config.wordImagePreviewCount || 6;
  let page = 0;

  while (true) {
    const start = page * pageSize;
    const pageCandidates = candidates.slice(start, start + pageSize);
    const totalPages = Math.max(1, Math.ceil(candidates.length / pageSize));

    await openImagePreview(wordData, meaning, pageCandidates, page, totalPages);

    console.log();
    console.log(`Image options for ${wordData.canonical} (${meaning.russian}):`);
    pageCandidates.forEach((candidate, index) => {
      console.log(`  ${index + 1}. image ${index + 1}`);
    });

    const answer = await ask('[1-6] select, [M]ore, [U]rl/path, [S]kip: ');
    const normalized = answer.toLowerCase();

    if (normalized === 's' || normalized === 'skip') {
      return null;
    }

    if (normalized === 'm' || normalized === 'more') {
      page = (page + 1) % totalPages;
      continue;
    }

    if (normalized === 'u' || normalized === 'url' || normalized === 'path') {
      const manual = await ask('Enter image URL or local path: ');
      if (/^https?:\/\//i.test(manual)) {
        return manualRemoteSelection(manual);
      }
      if (existsSync(manual)) {
        return manualLocalSelection(manual);
      }
      console.log('Image path not found.');
      continue;
    }

    const index = parseInt(normalized, 10);
    if (!Number.isNaN(index) && index >= 1 && index <= pageCandidates.length) {
      return pageCandidates[index - 1];
    }
  }
}

export async function confirmWordSelection({
  wordData,
  selectedMeaning,
  frequencyInfo,
  duplicateInfo,
  imageChoice,
  audioSource,
  audioPath,
  theme,
}) {
  let personalConnection = null;

  async function showPreview() {
    console.log();
    console.log(`Word: ${wordData.canonical}`);
    console.log(`${wordData.ipa}  ${selectedMeaning.russian}`);
    console.log(`Plural: ${formatPluralLabel(wordData)}`);
    console.log(`Frequency: ${frequencyInfo.bandLabel}${frequencyInfo.rank ? ` (#${frequencyInfo.rank})` : ''}`);
    console.log(`Audio: ${audioSource}`);
    console.log(`Image: ${imageChoice.source || imageChoice.type}`);
    if (theme) {
      console.log(`Theme: ${theme}`);
    }
    if (personalConnection) {
      console.log(`Personal connection: ${personalConnection}`);
    }
    if (duplicateInfo.headwordMatches.length > 0) {
      console.log();
      console.log('Existing notes with the same headword:');
      duplicateInfo.headwordMatches.slice(0, 3).forEach((match) => {
        console.log(`  - ${match.canonical}${match.meaning ? ` (${match.meaning})` : ''}`);
      });
    }
  }

  while (true) {
    await showPreview();
    const answer = await ask('[A]dd, [L]isten, [P]ersonal connection, [D]ismiss: ');
    const normalized = answer.toLowerCase();

    if (normalized === '' || normalized === 'a' || normalized === 'add') {
      return { confirmed: true, personalConnection };
    }

    if (normalized === 'l' || normalized === 'listen') {
      if (!audioPath) continue;
      try {
        await playAudio(audioPath);
      } catch (err) {
        console.log(`Could not play audio: ${err.message}`);
      }
      continue;
    }

    if (normalized === 'p' || normalized === 'personal') {
      const connection = await ask('Personal connection (optional, Enter clears): ');
      personalConnection = connection || null;
      continue;
    }

    return { confirmed: false, personalConnection: null };
  }
}
