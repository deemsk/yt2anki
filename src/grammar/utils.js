import { escapeHtml } from '../wordUtils.js';

export function buildGrammarMetadataComment(metadata) {
  const encoded = encodeURIComponent(JSON.stringify(metadata));
  return `<!-- yt2anki-grammar:${encoded} -->`;
}

export function parseGrammarMetadataComment(text = '') {
  const match = String(text).match(/<!--\s*yt2anki-grammar:(.*?)\s*-->/i);
  if (!match) return null;

  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function buildGrammarExtra({
  translation = null,
  slotLabel = null,
  explanation = null,
  metadata = null,
}) {
  const lines = [];

  if (translation) {
    lines.push(`<div>Translation: ${escapeHtml(translation)}</div>`);
  }

  if (slotLabel) {
    lines.push(`<div>Slot: ${escapeHtml(slotLabel)}</div>`);
  }

  if (explanation) {
    lines.push(`<div>Rule: ${escapeHtml(explanation)}</div>`);
  }

  if (metadata) {
    lines.push(buildGrammarMetadataComment(metadata));
  }

  return lines.join('');
}

export function renderClozePreview(text = '') {
  return String(text).replace(/\{\{c\d+::(.*?)(?:::(.*?))?\}\}/gi, (_match, _answer, hint) => (
    hint ? `[...] (${hint})` : '[...]'
  ));
}

export function extractFirstClozeAnswer(text = '') {
  const match = String(text).match(/\{\{c\d+::(.*?)(?:::(.*?))?\}\}/i);
  return match ? match[1] : null;
}

export function stripClozeMarkup(text = '') {
  return String(text).replace(/\{\{c\d+::(.*?)(?:::(.*?))?\}\}/gi, (_match, answer) => answer);
}
