import { execFile } from 'child_process';
import { readFileSync } from 'fs';
import { promisify } from 'util';
import { config } from '../lib/config.js';
import { normalizeGermanForCompare } from './german.js';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 5000;
const SUSPICIOUS_GERMAN_IPA_PATTERN = /[ɾ]/;
const ARTICLE_IPA = {
  der: 'deːɐ̯',
  die: 'diː',
  das: 'das',
};

let ipaOverrides = null;

function loadIpaOverrides() {
  if (ipaOverrides) {
    return ipaOverrides;
  }

  try {
    const raw = readFileSync(new URL('../data/ipa-overrides.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw);
    ipaOverrides = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    ipaOverrides = {};
  }

  return ipaOverrides;
}

export function normalizeSentenceIpa(ipa = '') {
  const raw = String(ipa || '').trim();
  if (!raw) {
    return '';
  }

  const body = raw
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return body ? `[${body}]` : '';
}

/**
 * Normalizes non-standard symbols that eSpeak may emit for Standard German cards.
 */
function normalizeGermanIpaSymbols(ipa = '') {
  return normalizeSentenceIpa(ipa)
    .replace(/ɾ/g, 'ʁ')
    .replace(/ɑ/g, 'a');
}

/**
 * Detects IPA output that should not be trusted for Standard German learner cards.
 */
function hasSuspiciousGermanIpa(ipa = '') {
  return SUSPICIOUS_GERMAN_IPA_PATTERN.test(String(ipa || ''));
}

export function normalizeWordIpa(canonical = '', ipa = '') {
  const raw = String(ipa || '').trim();
  if (!raw) return '';

  const body = raw.replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!body) return '';

  const article = normalizeGermanForCompare(canonical).split(' ')[0];
  const articleIpa = ARTICLE_IPA[article];

  if (!articleIpa) {
    return `[${body}]`;
  }

  if (
    body.startsWith(`${articleIpa} `) ||
    body === articleIpa ||
    body.startsWith(`${article} `) ||
    body === article
  ) {
    return `[${body}]`;
  }

  return `[${articleIpa} ${body}]`;
}

function getOverrideIpa(germanText = '') {
  const overrides = loadIpaOverrides();
  const direct = overrides[String(germanText || '').trim()];
  if (direct) {
    return normalizeSentenceIpa(direct);
  }

  const normalized = normalizeGermanForCompare(germanText);
  return normalizeSentenceIpa(overrides[normalized] || '');
}

function isMissingBinaryError(err) {
  return err?.code === 'ENOENT' || /not found|ENOENT/i.test(err?.message || '');
}

function buildEspeakArgs(text, options = {}) {
  const voice = options.voice || config.ipaVoice || 'de';
  return ['-q', '--ipa', '-v', voice, text];
}

async function generateEspeakIpa(text, options = {}) {
  const binary = options.binary || config.ipaBinary || 'espeak-ng';
  const args = buildEspeakArgs(text, options);
  const result = await execFileAsync(binary, args, {
    timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });
  const stdout = typeof result === 'string' ? result : result?.stdout;

  return normalizeSentenceIpa(stdout);
}

export async function generateGermanIpa(germanText, options = {}) {
  const text = String(germanText || '').trim();
  const fallback = normalizeSentenceIpa(options.fallbackIpa || '');
  if (!text) {
    return fallback;
  }

  const overrideIpa = getOverrideIpa(text);
  if (overrideIpa) {
    return overrideIpa;
  }

  const preferFallbackIpa = options.preferFallbackIpa ?? true;
  if (preferFallbackIpa && fallback && !hasSuspiciousGermanIpa(fallback)) {
    return normalizeGermanIpaSymbols(fallback);
  }

  try {
    const generated = await generateEspeakIpa(text, options);
    if (generated) {
      if (hasSuspiciousGermanIpa(generated) && fallback && !hasSuspiciousGermanIpa(fallback)) {
        return fallback;
      }

      return normalizeGermanIpaSymbols(generated);
    }
  } catch (err) {
    const fallbackToModel = options.fallbackToModel ?? config.ipaFallbackToModel;
    if (!fallbackToModel || !isMissingBinaryError(err)) {
      throw err;
    }
  }

  return normalizeSentenceIpa(options.fallbackIpa || '');
}
