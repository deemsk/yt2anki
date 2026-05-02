import { formatIpaHtml } from '../shared/components.js';
import { joinHtml } from '../shared/html.js';

export function buildVerbDictionaryNote({
  verbData,
  selectedMeaning,
  focusForm = null,
}) {
  const displayForm = focusForm || verbData.displayForm || verbData.infinitive;
  const back = joinHtml([
    verbData.infinitive,
    formatIpaHtml(verbData.ipa),
    selectedMeaning?.russian,
  ]);

  return {
    front: displayForm,
    back,
  };
}
