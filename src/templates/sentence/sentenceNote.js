import { escapeHtml } from '../../wordUtils.js';
import { buildWordMetadataComment } from '../../wordUtils.js';
import { formatIpaHtml, imageTag, soundTag } from '../shared/components.js';
import { joinHtml } from '../shared/html.js';

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

export function buildSentenceNoteBack({
  german,
  ipa,
  russian,
  metadata = null,
}) {
  let back = joinHtml([german, formatIpaHtml(ipa), russian]);
  if (metadata) {
    back += buildWordMetadataComment(metadata);
  }
  return back;
}

export function buildSentenceNoteFields({
  german,
  ipa,
  russian,
  audioFilename,
  context = null,
  contextStyle = 'boxed',
  imageFilename = null,
  frontFooterHtml = null,
  metadata = null,
}) {
  return {
    Front: buildSentenceNoteFront({
      audioFilename,
      context,
      contextStyle,
      imageFilename,
      frontFooterHtml,
    }),
    Back: buildSentenceNoteBack({
      german,
      ipa,
      russian,
      metadata,
    }),
  };
}
