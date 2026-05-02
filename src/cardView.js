import { escapeHtml } from './wordUtils.js';

const GENDER_COLORS = {
  masculine: '#2563eb',
  feminine: '#dc2626',
  neuter: '#0f766e',
};

const IPA_COLOR = '#475569';

export function joinHtml(parts = [], separator = '<br>') {
  return parts.filter(Boolean).join(separator);
}

export function soundTag(audioFilename) {
  const filename = String(audioFilename || '').trim();
  return filename ? `[sound:${filename}]` : '';
}

export function imageTag(imageFilename) {
  const filename = String(imageFilename || '').trim();
  return filename ? `<img src="${escapeHtml(filename)}" />` : '';
}

export function smallText(text = '') {
  const value = String(text || '').trim();
  return value ? `<small>${escapeHtml(value)}</small>` : '';
}

export function formatIpaHtml(ipa = '') {
  const value = String(ipa || '').trim();
  if (!value) {
    return '';
  }

  return `<span class="yt2anki-ipa" style="color:var(--yt2anki-ipa, ${IPA_COLOR});font-size:0.92em;font-style:italic;">${escapeHtml(value)}</span>`;
}

export function formatGenderColoredWord(canonical, gender) {
  const color = GENDER_COLORS[gender] || GENDER_COLORS.neuter;
  const genderClass = `yt2anki-gender-${escapeHtml(gender || 'neuter')}`;
  return `<span class="yt2anki-gender ${genderClass}" style="color:var(--${genderClass}, ${color});font-weight:600;">${escapeHtml(canonical)}</span>`;
}

export function formatPlainWord(canonical) {
  return `<span style="font-weight:600;">${escapeHtml(canonical)}</span>`;
}

export function formatPronunciationField(audioFilename, ipa = '') {
  return joinHtml([soundTag(audioFilename), formatIpaHtml(ipa)]);
}

export function buildWordSentenceContrastFooter(contrast = null) {
  const value = String(contrast || '').trim();
  if (!value) {
    return null;
  }

  return `<div class="yt2anki-word-contrast" style="margin:14px auto 0;max-width:420px;text-align:center;">
  <span style="display:block;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;">Contrast</span>
  <span style="display:block;margin-top:4px;font-size:20px;font-weight:600;line-height:1.15;color:#0f766e;">${escapeHtml(value)}</span>
</div>`;
}
