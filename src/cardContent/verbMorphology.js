import { config } from '../lib/config.js';
import { normalizeGermanForCompare, toTagSlug } from './german.js';

const CORE_IRREGULAR_VERBS = new Set([
  'sein',
  'haben',
  'werden',
  'können',
  'müssen',
  'wollen',
  'sollen',
  'dürfen',
  'mögen',
]);

const CORE_FORM_SPECS = [
  { key: 'ich', pronoun: 'ich', label: 'ich' },
  { key: 'du', pronoun: 'du', label: 'du' },
  { key: 'er', pronoun: 'er', label: 'er/sie/es' },
  { key: 'wir', pronoun: 'wir', label: 'wir' },
  { key: 'ihr', pronoun: 'ihr', label: 'ihr' },
  { key: 'sie', pronoun: 'sie', label: 'sie/Sie' },
];

const NORMAL_STRONG_FORM_SPECS = [
  { key: 'du', pronoun: 'du', label: 'du' },
  { key: 'er', pronoun: 'er', label: 'er/sie/es' },
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
 * Fetches the first successful JSON response from WiktApi candidate endpoints.
 */
async function fetchWiktApiJson(infinitive, options = {}) {
  const urls = options.urls || buildWiktApiUrls(infinitive);
  const timeoutMs = options.timeoutMs || config.wiktApiTimeoutMs || 8000;

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        continue;
      }

      return await response.json();
    } catch {
      // Try the next endpoint shape; package generation will fail closed if none work.
    }
  }

  return null;
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
function classifyVerb(infinitive, payload, forms = {}) {
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
  if (/weak|schwach|regular|regelmäßig/.test(labels)) {
    return 'weak';
  }

  if (
    isUsefulIrregularForm(lemma, 'du', forms.du) ||
    isUsefulIrregularForm(lemma, 'er', forms.er)
  ) {
    return 'strong';
  }

  return 'unknown';
}

/**
 * Returns the regular present form expected from a safely inferable weak pattern.
 */
function expectedRegularPresentForm(infinitive, slot) {
  const normalized = normalizeGermanForCompare(infinitive);
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
function isUsefulIrregularForm(infinitive, slot, form) {
  if (!form) return false;
  if (isCoreIrregularVerb(infinitive)) return true;
  return normalizeGermanForCompare(form) !== expectedRegularPresentForm(infinitive, slot);
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
 * Selects high-yield present forms from resolved morphology.
 */
export function selectStrongVerbForms(morphology) {
  if (!morphology) {
    return [];
  }

  const specs = morphology.classification === 'core-irregular'
    ? CORE_FORM_SPECS
    : NORMAL_STRONG_FORM_SPECS;

  return specs
    .map((spec) => ({
      ...spec,
      form: stripSeparableParticle(morphology.forms?.[spec.key] || '', morphology.particle),
      displayForm: buildDisplayedSeparableForm(morphology.forms?.[spec.key] || '', morphology.particle),
    }))
    .filter((entry) => entry.form && isUsefulIrregularForm(morphology.infinitive, entry.key, entry.form));
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
  const lemma = normalizeGermanForCompare(infinitive);
  if (!lemma) {
    return { confidence: 'low', reason: 'missing-infinitive', selectedForms: [] };
  }

  const payload = options.payload || await fetchWiktApiJson(lemma, options);
  if (!payload) {
    return { infinitive: lemma, confidence: 'low', reason: 'wiktapi-unavailable', selectedForms: [] };
  }

  const forms = extractPresentForms(payload);
  const classification = classifyVerb(lemma, payload, forms);
  const particle = detectSeparableParticle(lemma, payload);
  const morphology = {
    infinitive: lemma,
    classification,
    forms,
    isSeparable: Boolean(particle),
    particle,
    source: 'WiktApi',
    confidence: 'low',
  };
  const selectedForms = selectStrongVerbForms(morphology);
  const hasRequiredCoreForms = classification !== 'core-irregular' || selectedForms.length === CORE_FORM_SPECS.length;
  const confidence = classification !== 'unknown' && selectedForms.length > 0 && hasRequiredCoreForms
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
