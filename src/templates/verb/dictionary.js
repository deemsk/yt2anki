import { formatIpaHtml, formatPlainWord, formatPrimaryTranslation } from '../shared/components.js';
import { joinHtml } from '../shared/html.js';

export function buildVerbDictionaryNote({
  verbData,
  selectedMeaning,
  focusForm = null,
  pronunciationField = null,
}) {
  const displayForm = focusForm || verbData.displayForm || verbData.infinitive;
  const back = joinHtml([
    formatPlainWord(verbData.infinitive),
    pronunciationField || formatIpaHtml(verbData.ipa),
    formatPrimaryTranslation(selectedMeaning?.russian),
  ]);

  return {
    front: formatPlainWord(displayForm),
    back,
  };
}
