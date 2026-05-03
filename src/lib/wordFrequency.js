import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { normalizeGermanForCompare } from '../cardContent/german.js';

const DATA_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'german-frequency.json');
const FREQUENCY_MAP = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));

function bandForRank(rank) {
  if (rank >= 1 && rank <= 500) {
    return { key: 'essential', label: 'Essential' };
  }

  if (rank >= 501 && rank <= 1500) {
    return { key: 'core', label: 'Core' };
  }

  if (rank >= 1501 && rank <= 3000) {
    return { key: 'everyday', label: 'Everyday' };
  }

  if (rank >= 3001 && rank <= 5000) {
    return { key: 'extended', label: 'Extended' };
  }

  return { key: 'rare', label: 'Rare' };
}

/**
 * Look up a German word's frequency rank and convert it into a learner-friendly band.
 */
export function getWordFrequencyInfo(word) {
  const raw = String(word || '').trim().toLowerCase();
  const normalized = normalizeGermanForCompare(word);
  const rank = FREQUENCY_MAP[raw] || FREQUENCY_MAP[normalized] || null;
  const band = bandForRank(rank);

  return {
    lemma: normalized,
    rank,
    bandKey: band.key,
    bandLabel: band.label,
  };
}

/**
 * Decide whether a frequency band is strong enough to proceed with weaker card candidates.
 */
export function isStrongWordCandidate(frequencyInfo) {
  return frequencyInfo.bandKey === 'essential' ||
    frequencyInfo.bandKey === 'core' ||
    frequencyInfo.bandKey === 'everyday';
}
