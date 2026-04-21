import { execFile } from 'child_process';
import { readFileSync } from 'fs';
import { promisify } from 'util';
import { config } from './config.js';
import { normalizeGermanForCompare } from './wordUtils.js';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 5000;

let ipaOverrides = null;

function loadIpaOverrides() {
  if (ipaOverrides) {
    return ipaOverrides;
  }

  try {
    const raw = readFileSync(new URL('./data/ipa-overrides.json', import.meta.url), 'utf8');
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
  if (!text) {
    return normalizeSentenceIpa(options.fallbackIpa || '');
  }

  const overrideIpa = getOverrideIpa(text);
  if (overrideIpa) {
    return overrideIpa;
  }

  try {
    const generated = await generateEspeakIpa(text, options);
    if (generated) {
      return generated;
    }
  } catch (err) {
    const fallbackToModel = options.fallbackToModel ?? config.ipaFallbackToModel;
    if (!fallbackToModel || !isMissingBinaryError(err)) {
      throw err;
    }
  }

  return normalizeSentenceIpa(options.fallbackIpa || '');
}
