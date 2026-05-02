import { stripHtml } from './html.js';

const GERMAN_ARTICLES = new Set(['der', 'die', 'das']);

export function normalizeGermanForCompare(text = '') {
  return stripHtml(text)
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractLeadingArticle(text = '') {
  const [firstToken = ''] = normalizeGermanForCompare(text).split(' ');
  return GERMAN_ARTICLES.has(firstToken) ? firstToken : null;
}

export function getArticleNormalizationWarning(input = '', canonical = '') {
  const providedArticle = extractLeadingArticle(input);
  if (!providedArticle) {
    return null;
  }

  const canonicalArticle = extractLeadingArticle(canonical);
  if (!canonicalArticle || canonicalArticle === providedArticle) {
    return null;
  }

  const trimmedInput = String(input || '').trim();
  const trimmedCanonical = String(canonical || '').trim();
  if (!trimmedInput || !trimmedCanonical) {
    return null;
  }

  return `Normalized "${trimmedInput}" to "${trimmedCanonical}"`;
}

export function toTagSlug(text = '') {
  return normalizeGermanForCompare(text)
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
