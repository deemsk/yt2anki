import { config } from '../lib/config.js';
import { normalizeGermanForCompare, toTagSlug } from './german.js';

const CORE_IRREGULAR_VERBS = new Set([
  'sein',
  'haben',
  'werden',
  'koennen',
  'muessen',
  'wollen',
  'sollen',
  'duerfen',
  'moegen',
]);

const CORE_FORM_SPECS = [
  { key: 'ich', pronoun: 'ich', label: 'ich' },
  { key: 'du', pronoun: 'du', label: 'du' },
  { key: 'er', pronoun: 'er', label: 'er/sie/es' },
  { key: 'wir', pronoun: 'wir', label: 'wir' },
  { key: 'ihr', pronoun: 'ihr', label: 'ihr' },
  { key: 'sie', pronoun: 'sie', label: 'sie/Sie' },
];

const CORE_IRREGULAR_PRESENT_FORMS = {
  sein: { ich: 'bin', du: 'bist', er: 'ist', wir: 'sind', ihr: 'seid', sie: 'sind' },
  haben: { ich: 'habe', du: 'hast', er: 'hat', wir: 'haben', ihr: 'habt', sie: 'haben' },
  werden: { ich: 'werde', du: 'wirst', er: 'wird', wir: 'werden', ihr: 'werdet', sie: 'werden' },
  koennen: { ich: 'kann', du: 'kannst', er: 'kann', wir: 'können', ihr: 'könnt', sie: 'können' },
  muessen: { ich: 'muss', du: 'musst', er: 'muss', wir: 'müssen', ihr: 'müsst', sie: 'müssen' },
  wollen: { ich: 'will', du: 'willst', er: 'will', wir: 'wollen', ihr: 'wollt', sie: 'wollen' },
  sollen: { ich: 'soll', du: 'sollst', er: 'soll', wir: 'sollen', ihr: 'sollt', sie: 'sollen' },
  duerfen: { ich: 'darf', du: 'darfst', er: 'darf', wir: 'dürfen', ihr: 'dürft', sie: 'dürfen' },
  moegen: { ich: 'mag', du: 'magst', er: 'mag', wir: 'mögen', ihr: 'mögt', sie: 'mögen' },
};

const TARGET_FORM_SPECS = [
  { key: 'du', pronoun: 'du', label: 'du' },
  { key: 'er', pronoun: 'er', label: 'er/sie/es' },
  { key: 'ihr', pronoun: 'ihr', label: 'ihr' },
];

const REGULAR_PRESENT_ENDINGS = {
  ich: 'e',
  du: 'st',
  er: 't',
  wir: 'en',
  ihr: 't',
  sie: 'en',
};

/**
 * Returns true when a lemma belongs to the expanded high-frequency irregular set.
 */
export function isCoreIrregularVerb(infinitive = '') {
  return CORE_IRREGULAR_VERBS.has(normalizeGermanForCompare(infinitive));
}

/**
 * Returns curated present-tense forms for core irregular verbs when WiktApi is incomplete.
 */
function getCoreIrregularForms(infinitive = '') {
  return CORE_IRREGULAR_PRESENT_FORMS[normalizeGermanForCompare(infinitive)] || null;
}

/**
 * Builds likely WiktApi URLs for runtime morphology lookup.
 */
function buildWiktApiUrls(infinitive) {
  const baseUrl = String(config.wiktApiBaseUrl || config.kaikkiApiBaseUrl || 'https://api.wiktapi.dev').replace(/\/$/, '');
  const encoded = encodeURIComponent(infinitive);
  return [
    `${baseUrl}/v1/de/word/${encoded}/forms?lang=de`,
  ];
}

/**
 * Builds WiktApi search URLs used to confirm lemma identity when forms lookup fails.
 */
function buildWiktApiSearchUrls(infinitive) {
  const baseUrl = String(config.wiktApiBaseUrl || config.kaikkiApiBaseUrl || 'https://api.wiktapi.dev').replace(/\/$/, '');
  const encoded = encodeURIComponent(infinitive);
  return [
    `${baseUrl}/v1/de/search?q=${encoded}&lang=de`,
  ];
}

/**
 * Fetches the first successful JSON response from WiktApi candidate endpoints.
 */
async function fetchWiktApiJson(infinitive, options = {}) {
  const urls = options.urls || buildWiktApiUrls(infinitive);
  const timeoutMs = options.timeoutMs || config.wiktApiTimeoutMs || 8000;

  for (const url of urls) {
    let timeout = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        continue;
      }

      return await response.json();
    } catch {
      // Try the next endpoint shape; package generation will fail closed if none work.
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  return null;
}

/**
 * Resolves an exact German verb lemma from WiktApi search results.
 */
function resolveSearchLemma(payload, infinitive) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const normalizedInfinitive = normalizeGermanForCompare(infinitive);
  const match = results.find((result) =>
    normalizeGermanForCompare(result?.word) === normalizedInfinitive &&
    String(result?.lang_code || '').toLowerCase() === 'de' &&
    String(result?.pos || '').toLowerCase() === 'verb'
  );

  return match?.word || null;
}

/**
 * Confirms lemma identity via WiktApi search after direct forms lookup fails.
 */
async function resolveWiktApiLemmaFromSearch(infinitive, options = {}) {
  const payload = options.searchPayload || await fetchWiktApiJson(infinitive, {
    ...options,
    urls: options.searchUrls || buildWiktApiSearchUrls(infinitive),
  });

  return resolveSearchLemma(payload, infinitive);
}

/**
 * Walks unknown WiktApi/Kaikki JSON shapes and collects objects that look like form records.
 */
function collectFormRecords(value, records = []) {
  if (!value || typeof value !== 'object') {
    return records;
  }

  if (!Array.isArray(value) && typeof value.form === 'string') {
    records.push(value);
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectFormRecords(item, records));
    return records;
  }

  for (const item of Object.values(value)) {
    collectFormRecords(item, records);
  }

  return records;
}

/**
 * Walks unknown WiktApi/Kaikki JSON shapes and collects classification tags/categories.
 */
function collectMorphologyLabels(value, labels = []) {
  if (!value || typeof value !== 'object') {
    return labels;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectMorphologyLabels(item, labels));
    return labels;
  }

  for (const key of ['tags', 'categories', 'topics']) {
    if (Array.isArray(value[key])) {
      labels.push(...value[key].map((label) => String(label || '').toLowerCase()));
    }
  }

  for (const item of Object.values(value)) {
    collectMorphologyLabels(item, labels);
  }

  return labels;
}

/**
 * Checks whether a WiktApi form record matches a present-tense person slot.
 */
function matchesPresentSlot(record, slot) {
  const tags = [
    ...(Array.isArray(record.tags) ? record.tags : []),
    ...(Array.isArray(record.raw_tags) ? record.raw_tags : []),
    ...(Array.isArray(record.source) ? record.source : []),
  ].map((tag) => String(tag || '').toLowerCase());
  const text = `${tags.join(' ')} ${record.form_of || ''} ${record.description || ''}`.toLowerCase();
  const pronouns = Array.isArray(record.pronouns)
    ? record.pronouns.map((pronoun) => String(pronoun || '').toLowerCase())
    : [];

  if (/imperative|imperativ/i.test(text)) {
    return false;
  }

  if (!/(present|präsens|indicative|indikativ)/i.test(text)) {
    return false;
  }

  if (pronouns.length > 0) {
    if (slot === 'ich') return pronouns.includes('ich');
    if (slot === 'du') return pronouns.includes('du');
    if (slot === 'er') return pronouns.includes('er') || pronouns.includes('er/sie/es');
    if (slot === 'wir') return pronouns.includes('wir');
    if (slot === 'ihr') return pronouns.includes('ihr');
    if (slot === 'sie') return pronouns.includes('sie') && !pronouns.includes('er') && !pronouns.includes('es');
  }

  if (slot === 'ich') return /(first-person|1st|ich|\b1\b)/i.test(text) && /(singular|sg|\bich\b)/i.test(text);
  if (slot === 'du') return /(second-person|2nd|du|\b2\b)/i.test(text) && /(singular|sg|\bdu\b)/i.test(text);
  if (slot === 'er') return /(third-person|3rd|er\/sie\/es|\b3\b)/i.test(text) && /(singular|sg|\ber\b|sie\/es)/i.test(text);
  if (slot === 'wir') return /(first-person|1st|wir|\b1\b)/i.test(text) && /(plural|pl|\bwir\b)/i.test(text);
  if (slot === 'ihr') return /(second-person|2nd|ihr|\b2\b)/i.test(text) && /(plural|pl|\bihr\b)/i.test(text);
  if (slot === 'sie') return /(third-person|3rd|sie\/sie|\b3\b)/i.test(text) && /(plural|pl|\bsie\b)/i.test(text);
  return false;
}

/**
 * Extracts present-tense forms from WiktApi/Kaikki response data.
 */
function extractPresentForms(payload) {
  const forms = {};

  for (const record of collectFormRecords(payload)) {
    const form = String(record.form || '').trim();
    if (!form) continue;

    for (const slot of Object.keys(REGULAR_PRESENT_ENDINGS)) {
      if (!forms[slot] && matchesPresentSlot(record, slot)) {
        forms[slot] = normalizeFinitePresentForm(form, slot);
      }
    }
  }

  return forms;
}

/**
 * Removes leading pronouns and punctuation from WiktApi finite form strings.
 */
function normalizeFinitePresentForm(form = '', slot = '') {
  const pronounPattern = {
    ich: /^(ich)\s+/i,
    du: /^(du)\s+/i,
    er: /^(er|sie|es)\s+/i,
    wir: /^(wir)\s+/i,
    ihr: /^(ihr)\s+/i,
    sie: /^(sie|Sie)\s+/,
  }[slot];

  return String(form || '')
    .trim()
    .replace(pronounPattern || /^$/, '')
    .replace(/!+$/g, '')
    .trim();
}

/**
 * Classifies a verb from Wiktionary-derived labels and the core irregular override set.
 */
function classifyVerb(infinitive, payload, forms = {}, particle = null) {
  const lemma = normalizeGermanForCompare(infinitive);
  if (isCoreIrregularVerb(lemma)) {
    return 'core-irregular';
  }

  const labels = collectMorphologyLabels(payload).join(' ');
  if (/strong|stark|irregular|unregelmäßig/.test(labels)) {
    return 'strong';
  }
  if (/mixed|gemischt/.test(labels)) {
    return 'mixed';
  }
  if (
    isUsefulIrregularForm(lemma, 'du', forms.du, particle) ||
    isUsefulIrregularForm(lemma, 'er', forms.er, particle) ||
    isUsefulIrregularForm(lemma, 'ihr', forms.ihr, particle)
  ) {
    return 'irregular-present';
  }

  if (/weak|schwach|regular|regelmäßig/.test(labels)) {
    return 'weak';
  }

  return 'unknown';
}

/**
 * Returns the regular present form expected from a safely inferable weak pattern.
 */
function expectedRegularPresentForm(infinitive, slot, particle = null) {
  const normalizedInfinitive = normalizeGermanForCompare(infinitive);
  const normalizedParticle = normalizeGermanForCompare(particle || '');
  const normalized = normalizedParticle && normalizedInfinitive.startsWith(normalizedParticle)
    ? normalizedInfinitive.slice(normalizedParticle.length)
    : normalizedInfinitive;
  const stem = normalized.endsWith('eln')
    ? normalized.slice(0, -1)
    : normalized.endsWith('ern')
      ? normalized.slice(0, -1)
      : normalized.endsWith('en')
        ? normalized.slice(0, -2)
        : normalized.endsWith('n')
          ? normalized.slice(0, -1)
          : normalized;
  const ending = REGULAR_PRESENT_ENDINGS[slot] || '';
  const needsLinkingE = /(?:t|d|chn|ffn|gn|tm|dm)$/.test(stem) && ['du', 'er', 'ihr'].includes(slot);
  const dropsSBeforeSt = /[szx]$/.test(stem) && slot === 'du';
  const finalStem = normalized.endsWith('eln') && slot === 'ich'
    ? normalized.slice(0, -3) + 'le'
    : stem;

  if (dropsSBeforeSt) {
    return `${finalStem}t`;
  }

  return `${finalStem}${needsLinkingE ? 'e' : ''}${ending}`;
}

/**
 * Returns true when a present form carries useful irregular morphology.
 */
function isUsefulIrregularForm(infinitive, slot, form, particle = null) {
  if (!form) return false;
  if (isCoreIrregularVerb(infinitive)) return true;
  return normalizeGermanForCompare(form) !== expectedRegularPresentForm(infinitive, slot, particle);
}

/**
 * Detects a likely separable particle from an infinitive.
 */
function detectSeparableParticle(infinitive = '', payload = {}) {
  const labels = collectMorphologyLabels(payload).join(' ');
  const normalized = normalizeGermanForCompare(infinitive);
  const prefixes = ['ab', 'an', 'auf', 'aus', 'bei', 'ein', 'fern', 'fest', 'fort', 'her', 'hin', 'los', 'mit', 'nach', 'statt', 'teil', 'vor', 'weg', 'weiter', 'wieder', 'zu', 'zurück', 'zusammen']
    .map((surface) => ({ surface, normalized: normalizeGermanForCompare(surface) }))
    .sort((a, b) => b.normalized.length - a.normalized.length);
  const particle = prefixes.find((prefix) => normalized.startsWith(prefix.normalized) && normalized.length > prefix.normalized.length + 3);
  if (/separable|trennbar/.test(labels) || particle) {
    return particle?.surface || null;
  }
  return null;
}

/**
 * Selects present forms that are not safely inferable from the default weak pattern.
 */
export function selectStrongVerbForms(morphology) {
  if (!morphology) {
    return [];
  }

  const specs = morphology.classification === 'core-irregular'
    ? CORE_FORM_SPECS
    : TARGET_FORM_SPECS;

  return specs
    .map((spec) => ({
      ...spec,
      form: stripSeparableParticle(morphology.forms?.[spec.key] || '', morphology.particle),
      displayForm: buildDisplayedSeparableForm(morphology.forms?.[spec.key] || '', morphology.particle),
    }))
    .filter((entry) => entry.form && isUsefulIrregularForm(morphology.infinitive, entry.key, entry.form, morphology.particle));
}

/**
 * Removes a separable particle from a raw finite form for sentence validation.
 */
function stripSeparableParticle(form = '', particle = null) {
  const value = String(form || '').trim();
  if (!particle) return value;
  const pattern = new RegExp(`\\s+${particle}$`, 'i');
  return value.replace(pattern, '').trim();
}

/**
 * Keeps a learner-facing separated form when source data includes the particle.
 */
function buildDisplayedSeparableForm(form = '', particle = null) {
  const value = String(form || '').trim();
  if (!particle || !value) return value;
  return new RegExp(`\\s+${particle}$`, 'i').test(value) ? value : `${value} ${particle}`;
}

/**
 * Resolves trusted present-tense morphology from WiktApi-derived Wiktionary data.
 */
export async function resolveVerbMorphology(infinitive, options = {}) {
  const surfaceInfinitive = String(infinitive || '').trim().toLowerCase();
  const normalizedLemma = normalizeGermanForCompare(surfaceInfinitive);
  if (!normalizedLemma) {
    return { confidence: 'low', reason: 'missing-infinitive', selectedForms: [] };
  }

  const payload = options.payload || await fetchWiktApiJson(surfaceInfinitive, options);
  if (!payload) {
    const resolvedLemma = await resolveWiktApiLemmaFromSearch(surfaceInfinitive, options);
    const fallbackForms = resolvedLemma ? getCoreIrregularForms(resolvedLemma) : null;
    if (resolvedLemma && fallbackForms) {
      const morphology = {
        infinitive: resolvedLemma,
        classification: 'core-irregular',
        forms: fallbackForms,
        isSeparable: false,
        particle: null,
        source: 'curated-core-fallback',
        confidence: 'low',
      };
      return {
        ...morphology,
        confidence: 'high',
        selectedForms: selectStrongVerbForms(morphology),
      };
    }

    return { infinitive: surfaceInfinitive, confidence: 'low', reason: 'wiktapi-unavailable', selectedForms: [] };
  }

  const extractedForms = extractPresentForms(payload);
  const particle = detectSeparableParticle(surfaceInfinitive, payload);
  const classification = classifyVerb(surfaceInfinitive, payload, extractedForms, particle);
  const forms = classification === 'core-irregular'
    ? { ...getCoreIrregularForms(surfaceInfinitive), ...extractedForms }
    : extractedForms;
  const morphology = {
    infinitive: surfaceInfinitive,
    classification,
    forms,
    isSeparable: Boolean(particle),
    particle,
    source: 'wiktapi',
    confidence: 'low',
  };
  const selectedForms = selectStrongVerbForms(morphology);
  const hasRequiredCoreForms = classification !== 'core-irregular' || selectedForms.length === CORE_FORM_SPECS.length;
  const hasUsableClassification = classification !== 'unknown' || selectedForms.length > 0;
  const confidence = hasUsableClassification && selectedForms.length > 0 && hasRequiredCoreForms
    ? 'high'
    : 'low';

  return {
    ...morphology,
    confidence,
    selectedForms,
  };
}

/**
 * Builds stable morphology tags for generated strong-verb package notes.
 */
export function buildVerbMorphologyTags(morphology, formSpec = null) {
  const tags = [
    `verb-morphology-${toTagSlug(morphology.classification || 'unknown')}`,
    `morphology-source-${toTagSlug(morphology.source || 'unknown')}`,
  ];

  if (formSpec?.key) {
    tags.push(`verb-pronoun-${toTagSlug(formSpec.key)}`);
  }

  if (formSpec?.form) {
    tags.push(`verb-form-${toTagSlug(formSpec.form)}`);
  }

  return tags;
}
