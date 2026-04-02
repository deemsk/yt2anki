const GENDER_COLORS = {
  masculine: '#2563eb',
  feminine: '#dc2626',
  neuter: '#111111',
};

const ARTICLE_IPA = {
  der: 'deːɐ̯',
  die: 'diː',
  das: 'das',
};

const GERMAN_ARTICLES = new Set(['der', 'die', 'das']);

const ENTITY_MAP = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

export function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stripHtml(text = '') {
  return String(text)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/div>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (entity) => ENTITY_MAP[entity] || ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

export function formatGenderColoredWord(canonical, gender) {
  const color = GENDER_COLORS[gender] || GENDER_COLORS.neuter;
  return `<span style="color:${color};font-weight:600;">${escapeHtml(canonical)}</span>`;
}

export function formatPlainWord(canonical) {
  return `<span style="font-weight:600;">${escapeHtml(canonical)}</span>`;
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

export function buildWordMetadataComment(metadata) {
  const encoded = encodeURIComponent(JSON.stringify(metadata));
  return `<!-- yt2anki-word:${encoded} -->`;
}

export function parseWordMetadataComment(text = '') {
  const match = String(text).match(/<!--\s*yt2anki-word:(.*?)\s*-->/i);
  if (!match) return null;

  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function buildWordExtraInfo({
  meaning,
  plural,
  exampleSentence = null,
  dictionaryForm = null,
  personalConnection = null,
  metadata,
}) {
  const lines = [];

  if (meaning) {
    lines.push(`<div>Meaning: ${escapeHtml(meaning)}</div>`);
  }

  if (plural) {
    lines.push(`<div>Plural: ${escapeHtml(plural)}</div>`);
  }

  if (exampleSentence) {
    lines.push(`<div>Example: ${escapeHtml(exampleSentence)}</div>`);
  }

  if (dictionaryForm) {
    lines.push(`<div>Dictionary Form: ${escapeHtml(dictionaryForm)}</div>`);
  }

  if (personalConnection) {
    lines.push(`<div>Personal Connection: ${escapeHtml(personalConnection)}</div>`);
  }

  lines.push(buildWordMetadataComment(metadata));

  return lines.join('');
}

export function extractWordMeaning(extraInfo = '') {
  const metadata = parseWordMetadataComment(extraInfo);
  if (metadata?.meaning) {
    return metadata.meaning;
  }

  const stripped = stripHtml(extraInfo);
  const match = stripped.match(/Meaning:\s*(.+?)(?:Plural:|Example:|Dictionary Form:|Personal Connection:|$)/i);
  return match ? match[1].trim() : null;
}

export function extractCanonicalWord(wordField = '', extraInfo = '') {
  const metadata = parseWordMetadataComment(extraInfo);
  if (metadata?.canonical) {
    return metadata.canonical;
  }

  return stripHtml(wordField);
}

export function formatPluralLabel(wordData) {
  if (wordData.noPlural) {
    return 'usually no plural';
  }

  if (wordData.plural) {
    return wordData.plural;
  }

  return 'plural unknown';
}
