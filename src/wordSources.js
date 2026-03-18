import { copyFile, mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { extname, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from './config.js';

const execFileAsync = promisify(execFile);

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function dedupeTerms(terms) {
  return uniqueBy(
    terms.filter(Boolean).map((term) => String(term).trim()).filter(Boolean),
    (term) => term.toLowerCase()
  );
}

function scoreSearchTerm(term, baseWord = '') {
  const lower = String(term || '').toLowerCase();
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  let score = Math.min(wordCount, 4) * 10;

  if (baseWord && lower === String(baseWord).toLowerCase()) {
    score -= 8;
  }

  if (/glass of|bottle of|tap water|drinking water|cup of|mug of/.test(lower)) {
    score += 12;
  }

  if (/lake|river|waterfall|ocean|sea|landscape|mountain/.test(lower)) {
    score -= 20;
  }

  return score;
}

function cleanUrl(url) {
  if (!url) return null;
  return url.startsWith('//') ? `https:${url}` : url;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'yt2anki/1.0',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function searchOpenverseImages(query, pageSize = 6) {
  const url = new URL('https://api.openverse.org/v1/images/');
  url.searchParams.set('q', query);
  url.searchParams.set('page_size', String(pageSize));

  const payload = await fetchJson(url);
  const results = payload.results || [];

  return results.map((item) => ({
    source: 'Openverse',
    title: item.title || query,
    creator: item.creator || 'unknown',
    license: item.license ? `${item.license}${item.license_version ? ` ${item.license_version}` : ''}` : 'unknown',
    previewUrl: cleanUrl(item.thumbnail || item.url),
    downloadUrl: cleanUrl(item.url || item.thumbnail),
    detailUrl: cleanUrl(item.foreign_landing_url || item.detail_url || item.url),
  })).filter((item) => item.previewUrl && item.downloadUrl);
}

function getBraveSearchApiKey() {
  return config.braveSearchApiKey || process.env.BRAVE_SEARCH_API_KEY || '';
}

function hasBraveImageConfig() {
  return Boolean(getBraveSearchApiKey());
}

async function searchBraveImages(query, pageSize = 6) {
  if (!hasBraveImageConfig()) {
    return [];
  }

  const url = new URL('https://api.search.brave.com/res/v1/images/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(pageSize, 20)));
  url.searchParams.set('search_lang', 'en');
  url.searchParams.set('country', 'us');
  url.searchParams.set('spellcheck', '1');
  url.searchParams.set('safesearch', 'strict');

  const payload = await fetchJson(url, {
    headers: {
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': getBraveSearchApiKey(),
    },
  });
  const results = payload.results || payload.images?.results || [];

  return results.map((item) => ({
    source: 'Brave Images',
    title: item.title || query,
    creator: item.source || item.page_fetched || item.profile?.name || 'Brave Images',
    license: 'varies',
    previewUrl: cleanUrl(
      item.thumbnail?.src ||
      item.thumbnail?.url ||
      item.thumbnail_url ||
      item.thumbnail ||
      item.properties?.thumbnail ||
      item.url
    ),
    downloadUrl: cleanUrl(
      item.properties?.url ||
      item.image_url ||
      item.url ||
      item.page_url ||
      item.thumbnail?.src ||
      item.thumbnail_url
    ),
    detailUrl: cleanUrl(
      item.page_url ||
      item.url ||
      item.source_url ||
      item.profile?.url ||
      item.properties?.url
    ),
  })).filter((item) => item.previewUrl && item.downloadUrl);
}

async function searchWikimediaImages(query, limit = 6) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrlimit', String(limit));
  url.searchParams.set('gsrsearch', query);
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url');
  url.searchParams.set('iiurlwidth', '500');
  url.searchParams.set('origin', '*');

  const payload = await fetchJson(url);
  const pages = payload.query?.pages || [];

  return pages.map((page) => {
    const imageInfo = page.imageinfo?.[0] || {};
    return {
      source: 'Wikimedia Commons',
      title: page.title?.replace(/^File:/, '') || query,
      creator: 'Wikimedia Commons',
      license: 'varies',
      previewUrl: cleanUrl(imageInfo.thumburl || imageInfo.url),
      downloadUrl: cleanUrl(imageInfo.url || imageInfo.thumburl),
      detailUrl: cleanUrl(imageInfo.descriptionurl || imageInfo.url),
    };
  }).filter((item) => item.previewUrl && item.downloadUrl);
}

async function searchFirstAvailable(searchFn, queries, pageSize) {
  const batches = [];

  for (let index = 0; index < queries.length; index++) {
    const query = queries[index];
    if (!query) continue;

    try {
      const results = await searchFn(query, pageSize);
      batches.push(
        ...results.map((result, resultIndex) => ({
          ...result,
          queryUsed: query,
          queryPriority: index,
          resultPriority: resultIndex,
        }))
      );
    } catch {
      // Try the next query/source combination.
    }
  }

  return batches;
}

export function buildWordImageSearchTerms(wordData, selectedMeaning) {
  const englishGlossValue = selectedMeaning?.english ? String(selectedMeaning.english).trim() : '';
  const specificTerms = dedupeTerms(selectedMeaning?.imageSearchTerms || []);
  const englishGloss = englishGlossValue ? [englishGlossValue] : [];
  const bareWord = wordData?.bareNoun ? [wordData.bareNoun] : [];

  const prototypeTerms = [];
  const lowerEnglish = englishGlossValue.toLowerCase();

  if ([
    'water',
    'milk',
    'juice',
    'wine',
    'beer',
  ].includes(lowerEnglish)) {
    prototypeTerms.push(`glass of ${lowerEnglish}`, `bottle of ${lowerEnglish}`);
  }

  if (lowerEnglish === 'water') {
    prototypeTerms.push('tap water', 'drinking water');
  }

  if (['coffee', 'tea'].includes(lowerEnglish)) {
    prototypeTerms.push(`cup of ${lowerEnglish}`, `mug of ${lowerEnglish}`);
  }

  return dedupeTerms([
    ...prototypeTerms,
    ...specificTerms,
    ...englishGloss,
    ...bareWord,
  ]).sort((left, right) => (
    scoreSearchTerm(right, englishGlossValue || wordData?.bareNoun || '') -
    scoreSearchTerm(left, englishGlossValue || wordData?.bareNoun || '')
  ));
}

function rankImageResult(result) {
  const query = result.queryUsed || '';
  const wordCount = query.split(/\s+/).filter(Boolean).length;
  const title = (result.title || '').toLowerCase();
  const queryLower = query.toLowerCase();

  let score = 0;

  score += Math.min(wordCount, 4) * 10;
  score -= (result.queryPriority || 0) * 5;
  score -= (result.resultPriority || 0);

  if (wordCount > 1 && title.includes(queryLower)) {
    score += 8;
  }

  if (title.includes('glass of water') || title.includes('bottle of water') || title.includes('tap water')) {
    score += 16;
  }

  if (/lake|lakes|river|rivers|waterfall|waterfalls|buffalo|buffalos|bison|landscape|mountain|ocean|sea\b/.test(title)) {
    score -= 35;
  }

  if (/glass|bottle|tap|drink|drinking|cup|mug|kitchen|sink/.test(title)) {
    score += 12;
  }

  if (result.source === 'Brave Images') {
    score += 6;
  }

  return score;
}

export async function searchWordImages(wordData, selectedMeaning, options = {}) {
  const pageSize = options.pageSize || 6;
  const searchTerms = buildWordImageSearchTerms(wordData, selectedMeaning);

  const [brave, openverse, commons] = await Promise.all([
    searchFirstAvailable(searchBraveImages, searchTerms, pageSize),
    searchFirstAvailable(searchOpenverseImages, searchTerms, pageSize),
    searchFirstAvailable(searchWikimediaImages, searchTerms, pageSize),
  ]);

  const combined = [...brave, ...openverse, ...commons]
    .map((result) => ({
      ...result,
      rankScore: rankImageResult(result),
    }))
    .sort((a, b) => b.rankScore - a.rankScore);

  return uniqueBy(combined, (item) => item.previewUrl).slice(0, options.total || 12);
}

function inferExtension(url, contentType, fallbackExt) {
  const urlExt = extname(new URL(url).pathname);
  if (urlExt) return urlExt;

  if (contentType?.includes('png')) return '.png';
  if (contentType?.includes('jpeg')) return '.jpg';
  if (contentType?.includes('webp')) return '.webp';
  if (contentType?.includes('ogg')) return '.ogg';
  if (contentType?.includes('mpeg')) return '.mp3';
  if (contentType?.includes('wav')) return '.wav';

  return fallbackExt;
}

async function downloadRemoteAsset(url, prefix, fallbackExt, outputDir = config.dataDir) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'yt2anki/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  await mkdir(outputDir, { recursive: true });
  const extension = inferExtension(url, response.headers.get('content-type'), fallbackExt);
  const outputPath = join(outputDir, `${prefix}_${Date.now()}${extension}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
  return outputPath;
}

export async function cachePreviewImages(candidates, outputDir) {
  await mkdir(outputDir, { recursive: true });

  return Promise.all(candidates.map(async (candidate, index) => {
    const previewCandidates = [
      candidate.previewUrl,
      candidate.downloadUrl,
    ].filter(Boolean);

    for (const previewUrl of previewCandidates) {
      try {
        const previewPath = await downloadRemoteAsset(
          previewUrl,
          `preview_${Date.now()}_${index}`,
          '.jpg',
          outputDir
        );

        return {
          ...candidate,
          previewDisplaySrc: previewPath,
        };
      } catch {
        // Try the next URL candidate.
      }
    }

    const placeholderPath = join(outputDir, `preview_missing_${Date.now()}_${index}.svg`);

    try {
      const title = (candidate.title || 'Image unavailable').replace(/[<&>"]/g, '');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="#e5e7eb"/>
  <text x="50%" y="48%" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="#374151">Preview unavailable</text>
  <text x="50%" y="56%" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#6b7280">${title}</text>
</svg>`;
      await writeFile(placeholderPath, svg, 'utf-8');
    } catch {
      // Fall through to a blank tile if SVG writing somehow fails.
    }

    return {
      ...candidate,
      previewDisplaySrc: placeholderPath,
    };
  }));
}

export async function resolveImageAsset(selection, prefix = 'word_image') {
  if (selection.type === 'local-path') {
    const extension = extname(selection.path) || '.jpg';
    const outputPath = join(config.dataDir, `${prefix}_${Date.now()}${extension}`);
    await mkdir(config.dataDir, { recursive: true });
    await copyFile(selection.path, outputPath);
    return outputPath;
  }

  if (selection.type === 'remote-url') {
    return downloadRemoteAsset(selection.url, prefix, '.jpg');
  }

  return downloadRemoteAsset(selection.downloadUrl, prefix, '.jpg');
}

async function convertAudioToMp3(inputPath, outputPath) {
  await execFileAsync('ffmpeg', ['-i', inputPath, '-y', outputPath]);
  return outputPath;
}

async function getWiktionaryAudioUrls(word) {
  const url = new URL('https://de.wiktionary.org/w/api.php');
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', word);
  url.searchParams.set('prop', 'text');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');

  try {
    const payload = await fetchJson(url);
    const html = payload.parse?.text || '';
    const matches = html.match(/(?:https?:)?\/\/upload\.wikimedia\.org[^"'\\\s]+?\.(?:ogg|oga|mp3|wav)/gi) || [];

    return uniqueBy(
      matches.map((match) => cleanUrl(match)),
      (audioUrl) => audioUrl
    );
  } catch {
    return [];
  }
}

export async function resolveWordAudio(wordData) {
  const audioUrls = await getWiktionaryAudioUrls(wordData.bareNoun);
  if (audioUrls.length === 0) {
    return null;
  }

  const downloadedPath = await downloadRemoteAsset(audioUrls[0], 'word_audio_human', '.ogg');
  const mp3Path = join(config.dataDir, `word_audio_human_${Date.now()}.mp3`);

  await mkdir(config.dataDir, { recursive: true });

  if (extname(downloadedPath).toLowerCase() === '.mp3') {
    return {
      audioPath: downloadedPath,
      source: 'Wiktionary/Wikimedia',
    };
  }

  await convertAudioToMp3(downloadedPath, mp3Path);

  return {
    audioPath: mp3Path,
    source: 'Wiktionary/Wikimedia',
  };
}

export function manualRemoteSelection(url) {
  return { type: 'remote-url', url };
}

export function manualLocalSelection(path) {
  return { type: 'local-path', path };
}
