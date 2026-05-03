import { buildWordMetadataComment } from '../../cardContent/wordMetadata.js';
import { answerStack, focusPill, imageBlock, soundTag } from '../shared/components.js';

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
      front += focusPill(context);
    } else {
      front += focusPill(context);
    }
  }

  const imageHtml = imageBlock(imageFilename);
  if (imageHtml) {
    front += imageHtml;
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
  let back = answerStack({ german, ipa, russian });
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
