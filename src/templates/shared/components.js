import { escapeHtml } from '../../cardContent/html.js';
import { html, joinHtml } from './html.js';

const GENDER_COLORS = {
  masculine: '#2563eb',
  feminine: '#dc2626',
  neuter: '#0f766e',
};

const IPA_COLOR = '#475569';

const TASK_PANEL_STYLES = {
  dialogue: {
    border: 'rgba(245, 158, 11, 0.55)',
    background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.16), rgba(249, 115, 22, 0.10))',
    kicker: 'rgba(146, 64, 14, 0.95)',
    slotBorder: 'rgba(217, 119, 6, 0.45)',
    slotBackground: 'rgba(255, 255, 255, 0.55)',
  },
};

export function soundTag(audioFilename) {
  const filename = String(audioFilename || '').trim();
  return filename ? `[sound:${filename}]` : '';
}

export function imageTag(imageFilename) {
  const filename = String(imageFilename || '').trim();
  return filename ? `<img src="${escapeHtml(filename)}" />` : '';
}

export function imageBlock(imageFilename) {
  const image = imageTag(imageFilename);
  if (!image) {
    return '';
  }

  return `<div class="ddd-image" style="margin:14px auto 0;max-width:92%;text-align:center;">${image}</div>`;
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

export function taskHeader(label, instruction = null) {
  const title = String(label || '').trim();
  const detail = String(instruction || '').trim();
  if (!title) {
    return '';
  }

  return html`
    <div class="ddd-task-header" style="margin:0 auto 12px;max-width:520px;text-align:center;">
      <div style="font-size:11px;font-weight:800;letter-spacing:0.09em;text-transform:uppercase;color:#64748b;">${escapeHtml(title)}</div>
      ${detail ? `<div style="margin-top:4px;font-size:14px;line-height:1.25;color:#475569;">${escapeHtml(detail)}</div>` : ''}
    </div>
  `;
}

export function focusPill(context = null) {
  const value = String(context || '').trim();
  if (!value) {
    return '';
  }

  return html`
    <div class="yt2anki-front-context ddd-focus" style="margin:12px auto 10px;max-width:420px;padding:7px 11px;border-radius:999px;background:rgba(148, 163, 184, 0.12);color:#475569;font-size:13px;line-height:1.25;text-align:center;">
      <span style="font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;opacity:0.78;">Focus</span>
      <span style="margin-left:6px;font-weight:600;">${escapeHtml(value)}</span>
    </div>
  `;
}

export function answerStack({ german, ipa, russian, extraHtml = null }) {
  return html`
    <div class="ddd-answer-stack" style="margin:0 auto;max-width:720px;text-align:center;">
      ${german ? `<div class="ddd-answer-german" style="font-size:1.28em;line-height:1.22;font-weight:500;">${escapeHtml(german)}</div>` : ''}
      ${ipa ? `<div class="ddd-answer-ipa" style="margin-top:7px;">${formatIpaHtml(ipa)}</div>` : ''}
      ${russian ? `<div class="ddd-answer-translation" style="margin-top:9px;font-size:1.14em;line-height:1.24;">${escapeHtml(russian)}</div>` : ''}
      ${extraHtml ? `<div class="ddd-answer-extra" style="margin-top:9px;">${extraHtml}</div>` : ''}
    </div>
  `;
}

export function buildWordSentenceContrastFooter(contrast = null) {
  const value = String(contrast || '').trim();
  if (!value) {
    return null;
  }

  return html`
    <div class="yt2anki-word-contrast" style="margin:14px auto 0;max-width:420px;text-align:center;">
      <span style="display:block;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;">Contrast</span>
      <span style="display:block;margin-top:4px;font-size:20px;font-weight:600;line-height:1.15;color:#0f766e;">${escapeHtml(value)}</span>
    </div>
  `;
}

export function taskPanel(type, { emoji, kicker, main, sub = null }) {
  const style = TASK_PANEL_STYLES[type];
  return html`
    <div class="yt2anki-task yt2anki-task-${type}" style="margin:12px 0 10px;padding:12px 14px;border-radius:16px;border:2px solid ${style.border};background:${style.background};text-align:left;">
      <div class="yt2anki-task-kicker" style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${style.kicker};">${emoji} ${escapeHtml(kicker)}</div>
      <div class="yt2anki-task-main" style="margin-top:6px;font-size:18px;font-weight:700;line-height:1.2;">${escapeHtml(main)}</div>
      ${sub ? `<div class="yt2anki-task-sub" style="margin-top:6px;font-size:13px;line-height:1.35;opacity:0.86;">${escapeHtml(sub)}</div>` : ''}
    </div>
  `;
}

export function replySlot() {
  const style = TASK_PANEL_STYLES.dialogue;
  return `<div class="yt2anki-reply-slot" style="padding:10px 12px;border-radius:14px;border:1.5px dashed ${style.slotBorder};background:${style.slotBackground};font-size:15px;font-weight:600;text-align:left;">💬 Your reply: ______</div>`;
}
