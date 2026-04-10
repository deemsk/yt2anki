import { copyFile, mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { extname, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from './config.js';
import { getWordLemma, normalizeGermanForCompare, normalizeWordIpa, stripHtml } from './wordUtils.js';

const execFileAsync = promisify(execFile);

const SUBSTANCE_GERMAN = new Set([
  'wasser',
  'milch',
  'saft',
  'wein',
  'bier',
  'kaffee',
  'tee',
  'oel',
  'blut',
]);

const SUBSTANCE_ENGLISH = [
  'water',
  'milk',
  'juice',
  'wine',
  'beer',
  'coffee',
  'tea',
  'oil',
  'blood',
];

const DWELLING_GERMAN = new Set([
  'wohnung',
  'haus',
  'buero',
  'heim',
]);

const DWELLING_ENGLISH = [
  'apartment',
  'flat',
  'house',
  'home',
  'office',
];

const ROOM_GERMAN = new Set([
  'zimmer',
  'schlafzimmer',
  'wohnzimmer',
  'kueche',
  'bad',
  'badezimmer',
  'keller',
  'dachboden',
]);

const ROOM_ENGLISH = [
  'room',
  'bedroom',
  'living room',
  'kitchen',
  'bathroom',
  'cellar',
  'attic',
];

const PLACE_OR_INSTITUTION_ENGLISH = [
  'pharmacy',
  'school',
  'station',
  'hospital',
  'office',
  'restaurant',
  'cafe',
  'bakery',
  'bank',
  'university',
  'post office',
  'church',
  'museum',
  'supermarket',
  'store',
  'shop',
  'library',
  'hotel',
  'airport',
  'clinic',
  'apartment',
];

const PLACE_OR_INSTITUTION_GERMAN = new Set([
  'apotheke',
  'schule',
  'bahnhof',
  'krankenhaus',
  'buero',
  'restaurant',
  'cafe',
  'baeckerei',
  'bank',
  'universitaet',
  'post',
  'kirche',
  'museum',
  'supermarkt',
  'geschaeft',
  'bibliothek',
  'hotel',
  'flughafen',
  'klinik',
  'wohnung',
]);

const CALENDAR_GERMAN = new Set([
  'montag',
  'dienstag',
  'mittwoch',
  'donnerstag',
  'freitag',
  'samstag',
  'sonntag',
  'termin',
  'datum',
  'woche',
  'monat',
  'jahr',
]);

const CALENDAR_ENGLISH = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'appointment',
  'date',
  'week',
  'month',
  'year',
];

const MEASURE_GERMAN = new Set([
  'preis',
  'betrag',
  'kosten',
  'rabatt',
]);

const MEASURE_ENGLISH = [
  'price',
  'amount',
  'cost',
  'discount',
];

const DOCUMENT_GERMAN = new Set([
  'formular',
  'antrag',
  'rechnung',
  'vertrag',
  'ticket',
  'ausweis',
  'pass',
  'brief',
]);

const DOCUMENT_ENGLISH = [
  'form',
  'application',
  'invoice',
  'contract',
  'ticket',
  'id',
  'passport',
  'letter',
  'document',
];

const SCENE_GERMAN = new Set([
  'himmel',
  'sonne',
  'mond',
  'wolke',
  'stern',
  'regenbogen',
  'meer',
  'see',
  'fluss',
  'berg',
  'wald',
]);

const SCENE_ENGLISH = [
  'sky',
  'sun',
  'moon',
  'cloud',
  'star',
  'rainbow',
  'sea',
  'lake',
  'river',
  'mountain',
  'forest',
];

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

function dedupeBy(items, keyFn) {
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
      'User-Agent': 'DerDieDeck/1.0',
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

function getRawBraveApiKey() {
  return config.braveApiKey || process.env.BRAVE_SEARCH_API_KEY || '';
}

function hasBraveImageConfig() {
  return Boolean(getRawBraveApiKey());
}

async function searchBraveImages(query, pageSize = 6, queryEntry = {}) {
  if (!hasBraveImageConfig()) {
    return [];
  }

  const { resolveSecret } = await import('./secrets.js');
  const apiKey = await resolveSecret(getRawBraveApiKey());

  const url = new URL('https://api.search.brave.com/res/v1/images/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(pageSize, 20)));
  const locale = queryEntry.locale || 'en';
  url.searchParams.set('search_lang', locale === 'de' ? 'de' : 'en');
  url.searchParams.set('country', locale === 'de' ? 'de' : 'us');
  url.searchParams.set('spellcheck', '1');
  url.searchParams.set('safesearch', 'strict');

  const payload = await fetchJson(url, {
    headers: {
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
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
    const queryEntry = typeof queries[index] === 'string'
      ? { term: queries[index], bucket: 'generic' }
      : queries[index];
    const query = queryEntry?.term;
    if (!query) continue;

    try {
      const results = await searchFn(query, pageSize, queryEntry);
      batches.push(
        ...results.map((result, resultIndex) => ({
          ...result,
          queryUsed: query,
          queryBucket: queryEntry.bucket || 'generic',
          queryLocale: queryEntry.locale || 'en',
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

function classifyImageQueryBucket(term, englishGloss = '') {
  const lower = String(term || '').toLowerCase();
  const english = String(englishGloss || '').toLowerCase();

  if (/drink|drinking|pouring|holding|eating|using|washing|trinken|gie[ßs]en|waschen|benutzen|ausfuellen|ausfüllen|unterschreiben/.test(lower)) {
    return 'action';
  }

  if (/schild|logo|zeichen|symbol/.test(lower)) {
    return 'sign';
  }

  if (/eingang|geb[aä]ude|fassade|front|outside|exterior|aussen|außen/.test(lower)) {
    return 'exterior';
  }

  if (/innen|interior|inside|leer(?:es|e|er)?|wand|fenster|tuer|tür/.test(lower)) {
    return 'interior';
  }

  if (/theke|schalter|counter|service/.test(lower)) {
    return 'service';
  }

  if (/deutschland|deutsche|deutscher|deutsches|germany|berlin|muenchen|münchen|hamburg/.test(lower)) {
    return 'context';
  }

  if (/cow|goat|farm|tree|forest|sea|ocean|mountain|sky|sun|moon|cloud|kuh|bauernhof|wald|meer|berg|himmel/.test(lower)) {
    return 'source';
  }

  if (/glass of|bottle of|cup of|mug of|carton of|milk carton|package of|packet of|tap water|glas |flasche |tasse |becher |packung|karton|leitungswasser|trinkwasser/.test(lower)) {
    return 'container';
  }

  if (/grundriss|klingel|schluessel|schlüssel|wohnungstu[eü]r|haustu[eü]r/.test(lower)) {
    return 'context';
  }

  if (/kalender|wochenplan|datum/.test(lower)) {
    return 'calendar';
  }

  if (/etikett|preisschild|preisetikett|speisekarte|rechnung|anzeige/.test(lower)) {
    return 'measure';
  }

  if (/papier|vorlage|formular|antrag|vertrag|ticket|ausweis|pass/.test(lower)) {
    return 'document';
  }

  if (english && lower === english) {
    return 'generic';
  }

  return 'prototype';
}

function isPlaceOrInstitution(wordData, selectedMeaning) {
  const bare = normalizeGermanForCompare(getWordLemma(wordData));
  const english = normalizeGermanForCompare(selectedMeaning?.english || '');

  if (PLACE_OR_INSTITUTION_GERMAN.has(bare)) {
    return true;
  }

  return PLACE_OR_INSTITUTION_ENGLISH.some((term) => english.includes(term));
}

function hasAnyTerm(text, terms) {
  return terms.some((term) => text.includes(term));
}

function getGermanArticleAdjective(article = '') {
  const normalizedArticle = normalizeGermanForCompare(article);
  if (normalizedArticle === 'der') return 'deutscher';
  if (normalizedArticle === 'das') return 'deutsches';
  return 'deutsche';
}

function classifyWordConcept(wordData, selectedMeaning) {
  if (wordData?.lexicalType === 'adjective') {
    return 'adjective';
  }

  const bare = normalizeGermanForCompare(getWordLemma(wordData));
  const english = normalizeGermanForCompare(selectedMeaning?.english || '');

  if (SUBSTANCE_GERMAN.has(bare) || hasAnyTerm(english, SUBSTANCE_ENGLISH)) {
    return 'substance';
  }

  if (ROOM_GERMAN.has(bare) || hasAnyTerm(english, ROOM_ENGLISH)) {
    return 'room';
  }

  if (DWELLING_GERMAN.has(bare) || hasAnyTerm(english, DWELLING_ENGLISH)) {
    return 'dwelling';
  }

  if (isPlaceOrInstitution(wordData, selectedMeaning)) {
    return 'institution';
  }

  if (CALENDAR_GERMAN.has(bare) || hasAnyTerm(english, CALENDAR_ENGLISH)) {
    return 'calendar';
  }

  if (MEASURE_GERMAN.has(bare) || hasAnyTerm(english, MEASURE_ENGLISH)) {
    return 'measure';
  }

  if (DOCUMENT_GERMAN.has(bare) || hasAnyTerm(english, DOCUMENT_ENGLISH)) {
    return 'document';
  }

  if (SCENE_GERMAN.has(bare) || hasAnyTerm(english, SCENE_ENGLISH)) {
    return 'scene';
  }

  return 'object';
}

function looksGermanQueryTerm(term, bareNoun = '') {
  const normalizedTerm = normalizeGermanForCompare(term);
  const normalizedBare = normalizeGermanForCompare(bareNoun);

  return Boolean(
    (normalizedBare && normalizedTerm.includes(normalizedBare)) ||
    /[äöüß]/i.test(term) ||
    /\b(deutschland|deutsche|berlin|muenchen|münchen|hamburg)\b/i.test(normalizedTerm)
  );
}

function classifyAdjectiveBucket(term, wordData) {
  const normalizedTerm = normalizeGermanForCompare(term);
  const normalizedAnchor = normalizeGermanForCompare(wordData?.anchorPhrase || '');
  const normalizedOpposite = normalizeGermanForCompare(wordData?.opposite || '');

  if (
    /\b(neben|gegenueber|gegenüber|vs|kontrast|before|after|vergleich)\b/.test(normalizedTerm) ||
    (normalizedOpposite && normalizedTerm.includes(normalizedOpposite))
  ) {
    return 'contrast';
  }

  if (
    (normalizedAnchor && normalizedTerm.includes(normalizedAnchor)) ||
    normalizedTerm.split(/\s+/).filter(Boolean).length > 1
  ) {
    return 'prototype';
  }

  return 'generic';
}

function pushQueryEntries(entries, terms, bucket, locale = 'de') {
  dedupeTerms(terms).forEach((term) => {
    entries.push({ term, bucket, locale });
  });
}

function buildSubstanceEntries(wordData, selectedMeaning) {
  const bareWord = getWordLemma(wordData);
  const lowerEnglish = normalizeGermanForCompare(selectedMeaning?.english || '');
  const entries = [];

  if (lowerEnglish === 'water' || normalizeGermanForCompare(bareWord) === 'wasser') {
    pushQueryEntries(entries, ['Glas Wasser', 'Flasche Wasser', 'Trinkwasser', 'Leitungswasser'], 'container');
    pushQueryEntries(entries, ['Wasser trinken'], 'action');
  } else if (lowerEnglish === 'milk' || normalizeGermanForCompare(bareWord) === 'milch') {
    pushQueryEntries(entries, ['Glas Milch', 'Milchpackung', 'Milchkarton'], 'container');
    pushQueryEntries(entries, ['Milch trinken'], 'action');
    pushQueryEntries(entries, ['Milchkuh', 'Kuh Milch'], 'source');
  } else if (lowerEnglish === 'coffee' || normalizeGermanForCompare(bareWord) === 'kaffee') {
    pushQueryEntries(entries, ['Tasse Kaffee', 'Becher Kaffee'], 'container');
    pushQueryEntries(entries, ['Kaffee trinken'], 'action');
  } else if (lowerEnglish === 'tea' || normalizeGermanForCompare(bareWord) === 'tee') {
    pushQueryEntries(entries, ['Tasse Tee', 'Becher Tee'], 'container');
    pushQueryEntries(entries, ['Tee trinken'], 'action');
  } else {
    pushQueryEntries(entries, [`Glas ${bareWord}`, `Flasche ${bareWord}`], 'container');
    pushQueryEntries(entries, [`${bareWord} trinken`], 'action');
  }

  pushQueryEntries(entries, [bareWord], 'prototype');
  return entries;
}

function buildInstitutionEntries(wordData) {
  const bareWord = getWordLemma(wordData);
  const adjective = getGermanArticleAdjective(wordData?.article);
  const entries = [];

  pushQueryEntries(entries, [`${bareWord} Schild`, `${bareWord} Logo`, `${adjective} ${bareWord}`], 'sign');
  pushQueryEntries(entries, [`${bareWord} Eingang`, `${bareWord} außen`], 'exterior');
  pushQueryEntries(entries, [`${bareWord} innen`], 'interior');
  pushQueryEntries(entries, [`${bareWord} Schalter`, `${bareWord} Theke`], 'service');
  pushQueryEntries(entries, [`${bareWord} in Deutschland`], 'context');
  pushQueryEntries(entries, [bareWord], 'prototype');

  return entries;
}

function buildDwellingEntries(wordData) {
  const bareWord = getWordLemma(wordData);
  const entries = [];

  pushQueryEntries(entries, [`${bareWord} Eingang`, `${bareWord} außen`], 'exterior');
  pushQueryEntries(entries, [`${bareWord} Klingel`, `${bareWord} Schlüssel`, `${bareWord} Grundriss`], 'context');
  pushQueryEntries(entries, [`${bareWord} innen`], 'interior');
  pushQueryEntries(entries, [bareWord], 'prototype');

  return entries;
}

function buildRoomEntries(wordData) {
  const bareWord = getWordLemma(wordData);
  const entries = [];

  pushQueryEntries(entries, [`leeres ${bareWord}`, `${bareWord} innen`], 'interior');
  pushQueryEntries(entries, [`${bareWord} Tür`, `${bareWord} Fenster`, `${bareWord} Wand`], 'context');
  pushQueryEntries(entries, [bareWord], 'prototype');

  return entries;
}

function buildCalendarEntries(wordData) {
  const bareWord = getWordLemma(wordData);
  const entries = [];

  pushQueryEntries(
    entries,
    [
      `${bareWord} Kalender deutsch`,
      `${bareWord} Wochenplan deutsch`,
      `${bareWord} Kalenderblatt`,
      `${bareWord} Datum`,
      `${bareWord} Kalender`,
    ],
    'calendar'
  );
  pushQueryEntries(entries, [`${bareWord} in Deutschland`], 'context');
  pushQueryEntries(entries, [bareWord], 'prototype');

  return entries;
}

function buildMeasureEntries(wordData) {
  const bareWord = getWordLemma(wordData);
  const normalizedBare = normalizeGermanForCompare(bareWord);
  const entries = [];

  if (normalizedBare === 'preis') {
    pushQueryEntries(entries, ['Preisschild', 'Preisetikett'], 'measure');
  }

  pushQueryEntries(entries, [`${bareWord} Etikett`, `${bareWord} auf Speisekarte`, `${bareWord} auf Rechnung`, `${bareWord} Anzeige`], 'measure');
  pushQueryEntries(entries, [bareWord], 'prototype');

  return entries;
}

function buildDocumentEntries(wordData) {
  const bareWord = getWordLemma(wordData);
  const entries = [];

  pushQueryEntries(entries, [`${bareWord} ausfüllen`, `${bareWord} unterschreiben`], 'action');
  pushQueryEntries(entries, [`${bareWord} Papier`, `${bareWord} Vorlage`], 'document');
  pushQueryEntries(entries, [bareWord], 'prototype');

  return entries;
}

function buildSceneEntries(wordData) {
  const bareWord = getWordLemma(wordData);
  return [
    { term: bareWord, bucket: 'prototype', locale: 'de' },
    { term: `${bareWord} Landschaft`, bucket: 'context', locale: 'de' },
  ];
}

function buildObjectEntries(wordData) {
  const bareWord = getWordLemma(wordData);
  return [
    { term: bareWord, bucket: 'prototype', locale: 'de' },
  ];
}

function buildAdjectiveEntries(wordData, selectedMeaning) {
  const lemma = getWordLemma(wordData);
  const specificTerms = dedupeTerms(selectedMeaning?.imageSearchTerms || []);
  const entries = [];

  pushQueryEntries(
    entries,
    specificTerms.filter((term) => looksGermanQueryTerm(term, lemma)),
    null,
    'de'
  );

  if (wordData?.anchorPhrase) {
    pushQueryEntries(entries, [wordData.anchorPhrase], 'prototype', 'de');
  }

  if (lemma) {
    pushQueryEntries(entries, [lemma], 'generic', 'de');
  }

  return entries.map((entry) => ({
    ...entry,
    bucket: entry.bucket || classifyAdjectiveBucket(entry.term, wordData),
  }));
}

function buildWordImageQueryEntries(wordData, selectedMeaning) {
  const englishGlossValue = selectedMeaning?.english ? String(selectedMeaning.english).trim() : '';
  const specificTerms = dedupeTerms(selectedMeaning?.imageSearchTerms || []);
  const englishFallbackTerms = englishGlossValue ? [englishGlossValue] : [];
  const conceptClass = classifyWordConcept(wordData, selectedMeaning);
  const entries = [];

  if (conceptClass === 'adjective') {
    entries.push(...buildAdjectiveEntries(wordData, selectedMeaning));
  } else if (conceptClass === 'substance') {
    entries.push(...buildSubstanceEntries(wordData, selectedMeaning));
  } else if (conceptClass === 'institution') {
    entries.push(...buildInstitutionEntries(wordData));
  } else if (conceptClass === 'dwelling') {
    entries.push(...buildDwellingEntries(wordData));
  } else if (conceptClass === 'room') {
    entries.push(...buildRoomEntries(wordData));
  } else if (conceptClass === 'calendar') {
    entries.push(...buildCalendarEntries(wordData));
  } else if (conceptClass === 'measure') {
    entries.push(...buildMeasureEntries(wordData));
  } else if (conceptClass === 'document') {
    entries.push(...buildDocumentEntries(wordData));
  } else if (conceptClass === 'scene') {
    entries.push(...buildSceneEntries(wordData));
  } else {
    entries.push(...buildObjectEntries(wordData));
  }

  if (conceptClass !== 'adjective') {
    pushQueryEntries(
      entries,
      specificTerms.filter((term) => looksGermanQueryTerm(term, getWordLemma(wordData))),
      null,
      'de'
    );
  }

  pushQueryEntries(
    entries,
    specificTerms.filter((term) => !looksGermanQueryTerm(term, getWordLemma(wordData))),
    null,
    'en'
  );

  pushQueryEntries(entries, englishFallbackTerms, 'generic', 'en');

  return dedupeBy(
    entries.map((entry) => ({
      ...entry,
      bucket: entry.bucket || classifyImageQueryBucket(entry.term, englishGlossValue),
    })),
    (entry) => `${entry.bucket}:${entry.term.toLowerCase()}`
  );
}

export function buildWordImageSearchTerms(wordData, selectedMeaning) {
  return buildWordImageQueryEntries(wordData, selectedMeaning).map((entry) => entry.term);
}

function buildVerbImageQueryEntries(verbData, selectedMeaning) {
  const englishGlossValue = selectedMeaning?.english ? String(selectedMeaning.english).trim() : '';
  const specificTerms = dedupeTerms(selectedMeaning?.imageSearchTerms || []);
  const entries = [];
  const infinitive = String(verbData.infinitive || verbData.canonical || '').trim();
  const displayForm = String(verbData.displayForm || infinitive).trim();

  pushQueryEntries(
    entries,
    specificTerms.filter((term) => looksGermanQueryTerm(term, infinitive)),
    'action',
    'de'
  );

  pushQueryEntries(
    entries,
    specificTerms.filter((term) => !looksGermanQueryTerm(term, infinitive)),
    'action',
    'en'
  );

  if (displayForm && normalizeGermanForCompare(displayForm) !== normalizeGermanForCompare(infinitive)) {
    pushQueryEntries(entries, [displayForm], 'prototype', 'de');
  }

  pushQueryEntries(entries, [infinitive], 'prototype', 'de');

  if (englishGlossValue) {
    pushQueryEntries(entries, [englishGlossValue], 'generic', 'en');
  }

  return dedupeBy(
    entries.map((entry) => ({
      ...entry,
      bucket: entry.bucket || classifyImageQueryBucket(entry.term, englishGlossValue),
    })),
    (entry) => `${entry.bucket}:${entry.term.toLowerCase()}`
  );
}

export function buildVerbImageSearchTerms(verbData, selectedMeaning) {
  return buildVerbImageQueryEntries(verbData, selectedMeaning).map((entry) => entry.term);
}

function briefTokens(value) {
  return normalizeGermanForCompare(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !/^(with|ohne|aber|oder|nicht|just|only|main|mainly|show|should|look|looks|visible|visibly|clear|clearly|photo|image|scene|subject|thing|from|into|over|under|near|mainSubject|must|that|this|than|eine|einer|einem|einen|eines|einer|der|die|das|dem|den|des|und|oder|nicht|kein|keine|einer|einem|einen|mit|fuer|für|auf|von|ist|sind|sein|soll|sollte|zeigt|zeigen)$/.test(token));
}

function countMatchingBriefTokens(normalizedCombinedText, value) {
  const tokens = briefTokens(value);
  if (tokens.length === 0) {
    return 0;
  }

  return tokens.reduce((count, token) => (
    normalizedCombinedText.includes(token) ? count + 1 : count
  ), 0);
}

function visualBriefText(visualBrief) {
  if (!visualBrief || typeof visualBrief !== 'object') {
    return '';
  }

  return normalizeGermanForCompare([
    visualBrief.searchQuery,
    ...(Array.isArray(visualBrief.queryVariants) ? visualBrief.queryVariants : []),
    visualBrief.sceneSummary,
    visualBrief.focusRole,
    ...(Array.isArray(visualBrief.mustShow) ? visualBrief.mustShow : []),
    ...(Array.isArray(visualBrief.avoid) ? visualBrief.avoid : []),
    visualBrief.imagePrompt,
  ].filter(Boolean).join(' '));
}

function visualBriefWantsInteraction(visualBrief) {
  const normalized = visualBriefText(visualBrief);
  return /\b(interaktion|interaction|hilfe|hilft|help|helping|gespraech|gespräch|conversation|talk|smile|laechelt|lächelt|service|kund|begruesst|begrüßt|door|tuer|tür|handshake|greeting|welcoming)\b/.test(normalized);
}

function scoreVisualBrief(normalizedCombinedText, result, visualBrief) {
  if (!visualBrief || typeof visualBrief !== 'object') {
    return 0;
  }

  let score = 0;
  const searchQuery = String(visualBrief.searchQuery || '').trim();
  const queryVariants = Array.isArray(visualBrief.queryVariants) ? visualBrief.queryVariants : [];
  const sceneSummary = String(visualBrief.sceneSummary || '').trim();
  const focusRole = String(visualBrief.focusRole || '').trim();
  const mustShow = Array.isArray(visualBrief.mustShow) ? visualBrief.mustShow : [];
  const avoid = Array.isArray(visualBrief.avoid) ? visualBrief.avoid : [];
  const imagePrompt = String(visualBrief.imagePrompt || '').trim();
  const prioritizedQueries = [searchQuery, ...queryVariants].filter(Boolean);
  const normalizedQueryUsed = normalizeGermanForCompare(result.queryUsed || '');
  const interactionDesired = visualBriefWantsInteraction(visualBrief);

  if (searchQuery && normalizedQueryUsed === normalizeGermanForCompare(searchQuery)) {
    score += 12;
  }

  for (const query of prioritizedQueries) {
    const normalizedQuery = normalizeGermanForCompare(query);
    if (!normalizedQuery) continue;

    if (normalizedCombinedText.includes(normalizedQuery)) {
      score += query === searchQuery ? 10 : 5;
      continue;
    }

    const tokenMatches = countMatchingBriefTokens(normalizedCombinedText, normalizedQuery);
    if (tokenMatches >= 2) {
      score += query === searchQuery ? 6 : 3;
    }
  }

  for (const descriptor of mustShow) {
    const normalizedDescriptor = normalizeGermanForCompare(descriptor);
    if (!normalizedDescriptor) continue;

    if (normalizedCombinedText.includes(normalizedDescriptor)) {
      score += 6;
      continue;
    }

    const tokenMatches = countMatchingBriefTokens(normalizedCombinedText, normalizedDescriptor);
    if (tokenMatches >= 2) {
      score += 3;
    }
  }

  for (const descriptor of [sceneSummary, focusRole, imagePrompt]) {
    const normalizedDescriptor = normalizeGermanForCompare(descriptor);
    if (!normalizedDescriptor) continue;

    if (normalizedCombinedText.includes(normalizedDescriptor)) {
      score += 4;
      continue;
    }

    const tokenMatches = countMatchingBriefTokens(normalizedCombinedText, normalizedDescriptor);
    if (tokenMatches >= 2) {
      score += 2;
    }
  }

  for (const descriptor of avoid) {
    const normalizedDescriptor = normalizeGermanForCompare(descriptor);
    if (!normalizedDescriptor) continue;

    if (normalizedCombinedText.includes(normalizedDescriptor)) {
      score -= 12;
      continue;
    }

    const tokenMatches = countMatchingBriefTokens(normalizedCombinedText, normalizedDescriptor);
    if (tokenMatches >= 2) {
      score -= 7;
    }
  }

  if (interactionDesired) {
    if (/\b(help|helping|assist|assisting|customer|service|smile|smiling|greet|greeting|conversation|talking|handshake|door|welcoming|hilft|helfen|kund|service|laechelt|lächelt|begruesst|begrüßt|gespraech|gespräch|tuer|tür)\b/.test(normalizedCombinedText)) {
      score += 8;
    }

    if (/\b(portrait|selfie|headshot|glamour|model shoot|beauty shot|close up|closeup|isolated person|portraitfoto|portraet|porträt|selfie|headshot|model)\b/.test(normalizedCombinedText)) {
      score -= 14;
    }
  }

  return score;
}

function rankImageResult(result, context = {}) {
  const query = result.queryUsed || '';
  const wordCount = query.split(/\s+/).filter(Boolean).length;
  const title = (result.title || '').toLowerCase();
  const queryLower = query.toLowerCase();
  const detailUrl = (result.detailUrl || '').toLowerCase();
  const downloadUrl = (result.downloadUrl || '').toLowerCase();
  const combinedText = `${title} ${detailUrl} ${downloadUrl}`;
  const normalizedCombinedText = normalizeGermanForCompare(combinedText);
  const bareWord = normalizeGermanForCompare(getWordLemma(context.wordData));
  const englishGloss = normalizeGermanForCompare(context.selectedMeaning?.english || '');
  const conceptClass = classifyWordConcept(context.wordData, context.selectedMeaning);
  const normalizedAnchor = normalizeGermanForCompare(context.wordData?.anchorPhrase || '');
  const normalizedOpposite = normalizeGermanForCompare(context.wordData?.opposite || '');
  const visualBrief = context.selectedMeaning?.visualBrief || null;

  let score = 0;

  score += Math.min(wordCount, 4) * 10;
  score -= (result.queryPriority || 0) * 5;
  score -= (result.resultPriority || 0);

  if (wordCount > 1 && title.includes(queryLower)) {
    score += 8;
  }

  if (title.includes('glass of water') || title.includes('bottle of water') || title.includes('tap water') ||
      /glas wasser|flasche wasser|leitungswasser|trinkwasser/.test(normalizedCombinedText)) {
    score += 16;
  }

  if (/lake|lakes|river|rivers|waterfall|waterfalls|buffalo|buffalos|bison|landscape|mountain|ocean|sea\b/.test(title)) {
    score -= 35;
  }

  if (/glass|bottle|tap|drink|drinking|cup|mug|kitchen|sink/.test(title) ||
      /glas|flasche|trinken|tasse|becher|kueche|waschbecken|spuele/.test(normalizedCombinedText)) {
    score += 12;
  }

  if (result.source === 'Brave Images') {
    score += 6;
  }

  if (result.queryLocale === 'de') {
    score += 8;
  }

  if (bareWord && normalizedCombinedText.includes(bareWord)) {
    score += 14;
  }

  if ((conceptClass === 'institution' || conceptClass === 'dwelling' || conceptClass === 'calendar') &&
      /deutsch|deutschland|germany|\.de\b/.test(combinedText)) {
    score += 10;
  }

  if ((conceptClass === 'institution' || conceptClass === 'dwelling' || conceptClass === 'room') &&
      englishGloss &&
      normalizedCombinedText.includes(englishGloss) &&
      !normalizedCombinedText.includes(bareWord)) {
    score -= 6;
  }

  const bucket = result.queryBucket || 'generic';
  const bucketWeights = {
    adjective: { contrast: 20, prototype: 12, generic: 0 },
    substance: { container: 18, action: 10, source: 6, prototype: 8, generic: -2 },
    institution: { sign: 18, exterior: 16, service: 12, interior: 8, context: 8, prototype: 6, generic: -4 },
    dwelling: { exterior: 16, context: 14, interior: 8, prototype: 6, generic: -4 },
    room: { interior: 18, context: 10, prototype: 8, exterior: -16, generic: -2 },
    calendar: { calendar: 20, context: 8, prototype: 6, generic: -2 },
    measure: { measure: 20, context: 6, prototype: 4, generic: -2 },
    document: { action: 16, document: 18, prototype: 6, generic: -2 },
    scene: { prototype: 12, context: 8 },
    object: { prototype: 10, context: 4, generic: 0 },
  };

  score += bucketWeights[conceptClass]?.[bucket] || 0;

  if (conceptClass === 'adjective') {
    if (normalizedAnchor && normalizedCombinedText.includes(normalizedAnchor)) {
      score += 14;
    }

    if (normalizedOpposite && normalizedCombinedText.includes(normalizedOpposite)) {
      score += 8;
    }

    score += scoreVisualBrief(normalizedCombinedText, result, visualBrief);

    if (/icon|logo|symbol|diagram|chart|infographic|palette|swatch|hex\b/.test(combinedText)) {
      score -= 18;
    }
  }

  if (conceptClass === 'institution') {
    if (/walgreens|cvs|rite aid|drugstore|chemist/.test(combinedText) && !/apotheke|schule|bahnhof|krankenhaus|restaurant|museum/.test(combinedText)) {
      score -= 28;
    }
  }

  if (conceptClass === 'dwelling') {
    if (/hotel room|bedroom|children'?s room|kinderzimmer|schlafzimmer/.test(combinedText)) {
      score -= 26;
    }
    if (/grundriss|klingel|schluessel|schlüssel|wohnung|apartment|flat|building|fassade|eingang/.test(combinedText)) {
      score += 12;
    }
  }

  if (conceptClass === 'room') {
    if (/apartment|flat|building exterior|fassade|grundriss|klingel|wohnung|hausfassade/.test(combinedText)) {
      score -= 24;
    }
    if (/zimmer|room|innen|interior|wand|fenster|tuer|tür|leer/.test(combinedText)) {
      score += 12;
    }
  }

  if (conceptClass === 'calendar' && /kalender|wochenplan|date|datum|schedule/.test(combinedText)) {
    score += 12;
  }

  if (conceptClass === 'calendar') {
    if (englishGloss && normalizedCombinedText.includes(englishGloss) && !normalizedCombinedText.includes(bareWord)) {
      score -= 18;
    }

    if (/montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|kalenderblatt|wochenplan/.test(normalizedCombinedText)) {
      score += 12;
    }
  }

  if (conceptClass === 'measure' && /preis|price|etikett|label|receipt|rechnung|menu|speisekarte|tag/.test(combinedText)) {
    score += 12;
  }

  if (conceptClass === 'document' && /formular|form|document|papier|template|vorlage|sign|signature/.test(combinedText)) {
    score += 12;
  }

  return score;
}

function rankVerbImageResult(result, context = {}) {
  const query = result.queryUsed || '';
  const wordCount = query.split(/\s+/).filter(Boolean).length;
  const title = (result.title || '').toLowerCase();
  const detailUrl = (result.detailUrl || '').toLowerCase();
  const downloadUrl = (result.downloadUrl || '').toLowerCase();
  const combinedText = `${title} ${detailUrl} ${downloadUrl}`;
  const normalizedCombinedText = normalizeGermanForCompare(combinedText);
  const infinitive = normalizeGermanForCompare(context.verbData?.infinitive || '');
  const displayForm = normalizeGermanForCompare(context.verbData?.displayForm || '');

  let score = 0;

  score += Math.min(wordCount, 4) * 10;
  score -= (result.queryPriority || 0) * 5;
  score -= (result.resultPriority || 0);

  if (result.source === 'Brave Images') {
    score += 6;
  }

  if (result.queryLocale === 'de') {
    score += 8;
  }

  if (infinitive && normalizedCombinedText.includes(infinitive)) {
    score += 10;
  }

  if (displayForm && normalizedCombinedText.includes(displayForm)) {
    score += 12;
  }

  if (result.queryBucket === 'action') {
    score += 18;
  }

  if (result.queryBucket === 'prototype') {
    score += 8;
  }

  if (/icon|logo|symbol|diagram|chart|infographic|piktogramm/.test(combinedText)) {
    score -= 18;
  }

  if (/person|mann|frau|kind|someone|jemand|laeuft|rennt|springt|isst|trinkt|arbeitet|schreibt/.test(normalizedCombinedText)) {
    score += 8;
  }

  return score;
}

function getResultDomain(result) {
  const candidates = [result.detailUrl, result.downloadUrl, result.previewUrl];

  for (const candidate of candidates) {
    try {
      return new URL(candidate).hostname.replace(/^www\./, '');
    } catch {
      // Try the next URL.
    }
  }

  return result.source || 'unknown';
}

function buildDiverseResultSet(results, {
  total = 12,
  firstPageCount = config.wordImagePreviewCount || 6,
  maxPerDomainFirstPage = 1,
} = {}) {
  const deduped = uniqueBy(results, (item) => item.previewUrl)
    .map((item) => ({
      ...item,
      resultDomain: getResultDomain(item),
    }));

  const bucketOrder = [];
  const bucketMap = new Map();

  for (const result of deduped) {
    const bucket = result.queryBucket || 'generic';
    if (!bucketMap.has(bucket)) {
      bucketMap.set(bucket, []);
      bucketOrder.push(bucket);
    }
    bucketMap.get(bucket).push(result);
  }

  for (const bucket of bucketOrder) {
    bucketMap.get(bucket).sort((left, right) => right.rankScore - left.rankScore);
  }

  const selected = [];
  const selectedKeys = new Set();
  const domainCounts = new Map();
  const firstPageTarget = Math.min(firstPageCount, total, deduped.length);

  const trySelectFromBucket = (bucket, enforceDomainCap) => {
    const queue = bucketMap.get(bucket) || [];
    let deferredIndex = -1;

    for (let index = 0; index < queue.length; index++) {
      const candidate = queue[index];
      const key = candidate.previewUrl;
      if (!key || selectedKeys.has(key)) continue;

      const domain = candidate.resultDomain || 'unknown';
      if (enforceDomainCap && (domainCounts.get(domain) || 0) >= maxPerDomainFirstPage) {
        if (deferredIndex === -1) {
          deferredIndex = index;
        }
        continue;
      }

      queue.splice(index, 1);
      selected.push(candidate);
      selectedKeys.add(key);
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
      return true;
    }

    if (!enforceDomainCap && deferredIndex >= 0) {
      const [candidate] = queue.splice(deferredIndex, 1);
      const key = candidate.previewUrl;
      if (!key || selectedKeys.has(key)) return false;
      selected.push(candidate);
      selectedKeys.add(key);
      return true;
    }

    return false;
  };

  while (selected.length < firstPageTarget) {
    let madeProgress = false;
    for (const bucket of bucketOrder) {
      if (selected.length >= firstPageTarget) break;
      if (trySelectFromBucket(bucket, true)) {
        madeProgress = true;
      }
    }

    if (!madeProgress) {
      break;
    }
  }

  while (selected.length < firstPageTarget) {
    let madeProgress = false;
    for (const bucket of bucketOrder) {
      if (selected.length >= firstPageTarget) break;
      if (trySelectFromBucket(bucket, false)) {
        madeProgress = true;
      }
    }

    if (!madeProgress) {
      break;
    }
  }

  for (const result of deduped) {
    if (selected.length >= total) break;
    const key = result.previewUrl;
    if (!key || selectedKeys.has(key)) continue;
    selected.push(result);
    selectedKeys.add(key);
  }

  return selected.slice(0, total);
}

export async function searchWordImages(wordData, selectedMeaning, options = {}) {
  const pageSize = options.pageSize || 6;
  const searchTerms = buildWordImageQueryEntries(wordData, selectedMeaning);

  const [brave, openverse, commons] = await Promise.all([
    searchFirstAvailable(searchBraveImages, searchTerms, pageSize),
    searchFirstAvailable(searchOpenverseImages, searchTerms, pageSize),
    searchFirstAvailable(searchWikimediaImages, searchTerms, pageSize),
  ]);

  const combined = [...brave, ...openverse, ...commons]
    .map((result) => ({
      ...result,
      rankScore: rankImageResult(result, { wordData, selectedMeaning }),
    }))
    .sort((a, b) => b.rankScore - a.rankScore);

  return buildDiverseResultSet(combined, {
    total: options.total || 12,
    firstPageCount: pageSize,
  });
}

export async function searchVerbImages(verbData, selectedMeaning, options = {}) {
  const pageSize = options.pageSize || 6;
  const searchTerms = buildVerbImageQueryEntries(verbData, selectedMeaning);

  const [brave, openverse, commons] = await Promise.all([
    searchFirstAvailable(searchBraveImages, searchTerms, pageSize),
    searchFirstAvailable(searchOpenverseImages, searchTerms, pageSize),
    searchFirstAvailable(searchWikimediaImages, searchTerms, pageSize),
  ]);

  const combined = [...brave, ...openverse, ...commons]
    .map((result) => ({
      ...result,
      rankScore: rankVerbImageResult(result, { verbData, selectedMeaning }),
    }))
    .sort((a, b) => b.rankScore - a.rankScore);

  return buildDiverseResultSet(combined, {
    total: options.total || 12,
    firstPageCount: pageSize,
  });
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
      'User-Agent': 'DerDieDeck/1.0',
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

function extractWiktionaryIpa(html = '') {
  const plainText = stripHtml(html);
  const match = plainText.match(/IPA\s*:\s*\[([^\]]+)\]/i);
  return match ? `[${match[1].trim()}]` : null;
}

async function getWiktionaryPronunciationData(word) {
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

    return {
      ipa: extractWiktionaryIpa(html),
      audioUrls: uniqueBy(
        matches.map((match) => cleanUrl(match)),
        (audioUrl) => audioUrl
      ),
    };
  } catch {
    return {
      ipa: null,
      audioUrls: [],
    };
  }
}

export async function resolveWordPronunciation(wordData) {
  const pronunciationData = await getWiktionaryPronunciationData(getWordLemma(wordData));
  const normalizedIpa = pronunciationData.ipa
    ? normalizeWordIpa(wordData.canonical, pronunciationData.ipa)
    : null;

  if (pronunciationData.audioUrls.length === 0 && !normalizedIpa) {
    return null;
  }

  if (pronunciationData.audioUrls.length === 0) {
    return {
      ipa: normalizedIpa,
      audioPath: null,
      source: 'Wiktionary',
    };
  }

  const downloadedPath = await downloadRemoteAsset(pronunciationData.audioUrls[0], 'word_audio_human', '.ogg');
  const mp3Path = join(config.dataDir, `word_audio_human_${Date.now()}.mp3`);

  await mkdir(config.dataDir, { recursive: true });

  if (extname(downloadedPath).toLowerCase() === '.mp3') {
    return {
      ipa: normalizedIpa,
      audioPath: downloadedPath,
      source: 'Wiktionary/Wikimedia',
    };
  }

  await convertAudioToMp3(downloadedPath, mp3Path);

  return {
    ipa: normalizedIpa,
    audioPath: mp3Path,
    source: 'Wiktionary/Wikimedia',
  };
}

export async function resolveWordAudio(wordData) {
  const pronunciation = await resolveWordPronunciation(wordData);
  if (!pronunciation?.audioPath) {
    return null;
  }

  return {
    audioPath: pronunciation.audioPath,
    source: pronunciation.source,
  };
}

export function manualRemoteSelection(url) {
  return { type: 'remote-url', url };
}

export function manualLocalSelection(path) {
  return { type: 'local-path', path };
}
