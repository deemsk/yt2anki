export function getWordLemma(wordData = {}) {
  const raw = String(wordData.lemma || wordData.bareNoun || wordData.canonical || '').trim();
  return raw.replace(/^(der|die|das)\s+/i, '');
}

export function applyChosenSentenceGloss(sentenceData = {}, chosenSentence = {}) {
  const chosenRussian = String(chosenSentence?.russian || '').trim();
  if (!chosenRussian) {
    return sentenceData;
  }

  return {
    ...sentenceData,
    russian: chosenRussian,
  };
}

export function formatPluralLabel(wordData) {
  if (wordData.noPlural) {
    return 'usually no plural';
  }

  if (wordData.plural) {
    return wordData.plural;
  }

  return 'plural unknown';
}

export function getPrimaryExampleSentence(wordData = {}) {
  const sentences = Array.isArray(wordData.exampleSentences) ? wordData.exampleSentences : [];
  const match = sentences.find((sentence) => sentence?.german);

  return {
    german: match?.german || null,
    russian: match?.russian || null,
  };
}
