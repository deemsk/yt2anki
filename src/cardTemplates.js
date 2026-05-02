import { escapeHtml } from './wordUtils.js';
import { formatIpaHtml, imageTag, joinHtml, smallText, soundTag } from './cardView.js';

const TASK_PANEL_STYLES = {
  dialogue: {
    border: 'rgba(245, 158, 11, 0.55)',
    background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.16), rgba(249, 115, 22, 0.10))',
    kicker: 'rgba(146, 64, 14, 0.95)',
    slotBorder: 'rgba(217, 119, 6, 0.45)',
    slotBackground: 'rgba(255, 255, 255, 0.55)',
  },
};

function buildTaskPanel(type, { emoji, kicker, main, sub = null }) {
  const style = TASK_PANEL_STYLES[type];
  return `<div class="yt2anki-task yt2anki-task-${type}" style="margin:12px 0 10px;padding:12px 14px;border-radius:16px;border:2px solid ${style.border};background:${style.background};text-align:left;">
  <div class="yt2anki-task-kicker" style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${style.kicker};">${emoji} ${escapeHtml(kicker)}</div>
  <div class="yt2anki-task-main" style="margin-top:6px;font-size:18px;font-weight:700;line-height:1.2;">${escapeHtml(main)}</div>
  ${sub ? `<div class="yt2anki-task-sub" style="margin-top:6px;font-size:13px;line-height:1.35;opacity:0.86;">${escapeHtml(sub)}</div>` : ''}
</div>`;
}

function buildDialogueFront(audioFilename) {
  const style = TASK_PANEL_STYLES.dialogue;
  return soundTag(audioFilename) +
    buildTaskPanel('dialogue', {
      emoji: '💬',
      kicker: 'ТВОЙ ОТВЕТ',
      main: 'Ответь по-немецки вслух',
      sub: 'Это ответ собеседнику, не перевод',
    }) +
    `<div class="yt2anki-reply-slot" style="padding:10px 12px;border-radius:14px;border:1.5px dashed ${style.slotBorder};background:${style.slotBackground};font-size:15px;font-weight:600;text-align:left;">💬 Твой ответ: ______</div>`;
}

export function buildProductionFront(russian, situation = null) {
  let front = '<div class="yt2anki-production-prompt" style="margin-bottom:8px;font-size:15px;font-weight:700;line-height:1.25;text-align:left;">🗣 Скажи по-немецки</div>';
  front += `<div class="yt2anki-production-source" style="font-size:20px;font-weight:700;line-height:1.28;text-align:left;">${escapeHtml(russian)}</div>`;

  if (situation) {
    front += `<div class="yt2anki-production-hint" style="margin-top:8px;font-size:13px;line-height:1.35;text-align:left;opacity:0.86;">${escapeHtml(situation)}</div>`;
  }

  return front;
}

export function buildSentenceNoteFront({
  audioFilename,
  context = null,
  contextStyle = 'boxed',
  imageFilename = null,
  frontFooterHtml = null,
}) {
  let front = soundTag(audioFilename);

  if (context) {
    if (contextStyle === 'plain') {
      front += `<br>Context: ${escapeHtml(context)}`;
    } else {
      front += `<div class="yt2anki-front-context" style="margin:12px auto 10px;max-width:420px;padding:10px 14px;border-radius:16px;background:rgba(148, 163, 184, 0.12);color:#475569;font-size:14px;line-height:1.35;text-align:center;">Context: ${escapeHtml(context)}</div>`;
    }
  }

  const imageHtml = imageTag(imageFilename);
  if (imageHtml) {
    front += `<br>${imageHtml}`;
  }

  if (frontFooterHtml) {
    front += frontFooterHtml;
  }

  return front;
}

export function formatCardForAnki(card, audioFilename) {
  let front = '';
  let back = '';

  switch (card.type) {
    case 'comprehension':
      front = soundTag(audioFilename);
      if (card.front.context) {
        front += `<br>${smallText(`Context: ${card.front.context}`)}`;
      }
      back = joinHtml([card.back.german, formatIpaHtml(card.back.ipa), card.back.russian]);
      break;

    case 'dialogue':
      front = buildDialogueFront(audioFilename);
      back = card.back.german;
      if (card.back.russian) {
        back += `<br>${smallText(card.back.russian)}`;
      }
      break;

    case 'production':
      front = buildProductionFront(card.front.russian, card.front.situation);
      back = joinHtml([card.back.german, formatIpaHtml(card.back.ipa), soundTag(audioFilename)]);
      break;

    case 'pattern':
      front = `<b>${escapeHtml(card.front.pattern)}</b><br>${escapeHtml(card.front.baseExample)}`;
      back = card.back.examples.map((example) => `• ${escapeHtml(example)}`).join('<br>');
      back += `<br><br>${smallText(card.back.russian)}`;
      break;

    case 'cloze':
      front = `${escapeHtml(card.front.sentence)}<br>${smallText(card.front.russian)}`;
      if (card.front.hint) {
        front += `<br><small><i>${escapeHtml(`(${card.front.hint})`)}</i></small>`;
      }
      back = `<b>${escapeHtml(card.back.answer)}</b><br><br>${escapeHtml(card.back.german)}`;
      break;
  }

  return { Front: front, Back: back };
}
