import { stripHtml } from './html.js';

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
