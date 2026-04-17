const GENDER_COLORS = {
  masculine: '#2563eb',
  feminine: '#dc2626',
  neuter: '#0f766e',
};

const IPA_COLOR = '#475569';

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
  const genderClass = `yt2anki-gender-${escapeHtml(gender || 'neuter')}`;
  return `<span class="yt2anki-gender ${genderClass}" style="color:var(--${genderClass}, ${color});font-weight:600;">${escapeHtml(canonical)}</span>`;
}

export function formatPlainWord(canonical) {
  return `<span style="font-weight:600;">${escapeHtml(canonical)}</span>`;
}

export function formatIpaHtml(ipa = '') {
  const value = String(ipa || '').trim();
  if (!value) {
    return '';
  }

  return `<span class="yt2anki-ipa" style="color:var(--yt2anki-ipa, ${IPA_COLOR});font-size:0.92em;font-style:italic;">${escapeHtml(value)}</span>`;
}

export function formatPronunciationField(audioFilename, ipa = '') {
  const parts = [`[sound:${String(audioFilename || '').trim()}]`];
  const formattedIpa = formatIpaHtml(ipa);
  if (formattedIpa) {
    parts.push(formattedIpa);
  }

  return parts.join('<br>');
}

export function buildWordSentenceContrastFooter(contrast = null) {
  const value = String(contrast || '').trim();
  if (!value) {
    return null;
  }

  return `<div class="yt2anki-word-contrast" style="margin:14px auto 0;max-width:420px;text-align:center;">
  <div style="display:inline-block;min-width:140px;padding:10px 16px;border-radius:18px;background:linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(15, 118, 110, 0.14));box-shadow:inset 0 0 0 1px rgba(14, 116, 144, 0.12);">
    <span style="display:block;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;">Contrast:</span>
    <span style="display:block;margin-top:4px;font-size:22px;font-weight:700;line-height:1.15;color:#0f172a;">${escapeHtml(value)}</span>
  </div>
</div>`;
}

export function getWordLemma(wordData = {}) {
  const raw = String(wordData.lemma || wordData.bareNoun || wordData.canonical || '').trim();
  return raw.replace(/^(der|die|das)\s+/i, '');
}

export function applyChosenSentenceGloss(sentenceData = {}, chosenSentence = {}) {
  const chosenRussian = String(chosenSentence?.russian || '').trim();
  if (!chosenRussian) {
    return sentenceData;
  }

  return {
    ...sentenceData,
    russian: chosenRussian,
  };
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
  plainMeaning = false,
  plural,
  exampleSentence = null,
  exampleSentenceTranslation = null,
  dictionaryForm = null,
  contrast = null,
  personalConnection = null,
  metadata,
}) {
  const lines = [];

  if (meaning) {
    lines.push(plainMeaning
      ? `<div>${escapeHtml(meaning)}</div>`
      : `<div>Meaning: ${escapeHtml(meaning)}</div>`);
  }

  if (plural) {
    lines.push(`<div>Plural: ${escapeHtml(plural)}</div>`);
  }

  if (exampleSentence) {
    lines.push(`<div>Example: ${escapeHtml(exampleSentence)}</div>`);
    if (exampleSentenceTranslation) {
      lines.push(`<div><small>${escapeHtml(exampleSentenceTranslation)}</small></div>`);
    }
  }

  if (dictionaryForm) {
    lines.push(`<div>Dictionary Form: ${escapeHtml(dictionaryForm)}</div>`);
  }

  if (contrast) {
    lines.push(`<div>Contrast: ${escapeHtml(contrast)}</div>`);
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
  const match = stripped.match(/Meaning:\s*(.+?)(?:Plural:|Example:|Dictionary Form:|Contrast:|Personal Connection:|$)/i);
  return match ? match[1].trim() : null;
}

export function extractCanonicalWord(wordField = '', extraInfo = '') {
  const metadata = parseWordMetadataComment(extraInfo);
  if (metadata?.canonical) {
    return metadata.canonical;
  }

  return stripHtml(wordField);
}

export function extractWordLexicalType(extraInfo = '') {
  const metadata = parseWordMetadataComment(extraInfo);
  return metadata?.lexicalType ? String(metadata.lexicalType).trim() : null;
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

export function getPrimaryExampleSentence(wordData = {}) {
  const sentences = Array.isArray(wordData.exampleSentences) ? wordData.exampleSentences : [];
  const match = sentences.find((sentence) => sentence?.german);

  return {
    german: match?.german || null,
    russian: match?.russian || null,
  };
}
