import { buildWordSentenceContrastFooter } from '../shared/components.js';

export function buildWordSentenceFrontFooter(wordData) {
  if ((wordData?.lexicalType || 'adjective') !== 'adjective') {
    return null;
  }

  return buildWordSentenceContrastFooter(wordData?.opposite || null);
}
