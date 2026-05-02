import { toTagSlug } from '../../wordUtils.js';
import { formatGenderColoredWord, formatPlainWord, imageTag } from '../shared/components.js';

export const PICTURE_WORD_MODEL = '2. Picture Words';

export const PICTURE_WORD_FIELDS = {
  word: 'Word',
  picture: 'Picture',
  extra: 'Gender, Personal Connection, Extra Info (Back side)',
  pronunciation: 'Pronunciation (Recording and/or IPA)',
  spelling: 'Test Spelling? (y = yes, blank = no)',
};

export function isNounWord(wordData = {}) {
  return (wordData.lexicalType || 'noun') === 'noun';
}

export function formatWordDisplay(wordData = {}) {
  return isNounWord(wordData)
    ? formatGenderColoredWord(wordData.canonical, wordData.gender)
    : formatPlainWord(wordData.canonical);
}

export function buildPictureWordFields({
  coloredWord,
  imageFilename,
  pronunciationField,
  extraInfoField,
}) {
  return {
    [PICTURE_WORD_FIELDS.word]: coloredWord,
    [PICTURE_WORD_FIELDS.picture]: imageTag(imageFilename),
    [PICTURE_WORD_FIELDS.extra]: extraInfoField,
    [PICTURE_WORD_FIELDS.pronunciation]: pronunciationField,
    [PICTURE_WORD_FIELDS.spelling]: '',
  };
}

export function buildPictureWordTags({
  canonical,
  gender = null,
  frequencyBand,
  lemma,
  imageSource,
  audioSource,
  lexicalType = 'noun',
  theme = null,
}) {
  const resolvedImageSource = imageSource || 'none';
  const tags = [
    'yt2anki',
    'mode-word',
    `word-${lexicalType}`,
    `freq-${frequencyBand}`,
    `lemma-${toTagSlug(lemma)}`,
    `canonical-${toTagSlug(canonical)}`,
    `img-${toTagSlug(resolvedImageSource)}`,
    `audio-${toTagSlug(audioSource)}`,
  ];

  if (gender) {
    tags.push(`gender-${gender}`);
  }

  if (theme) {
    tags.push(`theme-${toTagSlug(theme)}`);
  }

  return tags;
}
