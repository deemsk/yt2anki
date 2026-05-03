import { buildWordMetadataComment } from '../../cardContent/wordMetadata.js';
import { answerStack, focusPill, imageBlock, soundTag, taskHeader } from '../shared/components.js';

export function buildSentenceNoteFront({
  audioFilename,
  context = null,
  contextStyle = 'boxed',
  imageFilename = null,
  frontFooterHtml = null,
  task = null,
}) {
  let front = task ? taskHeader(task.label, task.instruction) : '';
  front += soundTag(audioFilename);

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
  task = null,
}) {
  return {
    Front: buildSentenceNoteFront({
      audioFilename,
      context,
      contextStyle,
      imageFilename,
      frontFooterHtml,
      task,
    }),
    Back: buildSentenceNoteBack({
      german,
      ipa,
      russian,
      metadata,
    }),
  };
}
