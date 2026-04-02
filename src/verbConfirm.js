import { createInterface } from 'readline';
import { playAudio } from './confirm.js';

function ask(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function chooseVerbSentence(verbData, preferredSentence = null) {
  if (preferredSentence) {
    const existing = verbData.exampleSentences?.find((sentence) => sentence.german === preferredSentence);
    if (existing) {
      return existing;
    }

    return {
      german: preferredSentence,
      russian: verbData.meanings?.[0]?.russian || '',
      focusForm: verbData.displayForm || verbData.infinitive,
    };
  }

  const sentences = Array.isArray(verbData.exampleSentences) ? verbData.exampleSentences : [];
  if (sentences.length === 0) {
    const manual = await ask('Enter an example sentence for this verb, or press Enter to skip: ');
    if (!manual) return null;
    return {
      german: manual,
      russian: verbData.meanings?.[0]?.russian || '',
      focusForm: verbData.displayForm || verbData.infinitive,
    };
  }

  if (sentences.length === 1) {
    return sentences[0];
  }

  console.log();
  console.log(`Example sentences for ${verbData.infinitive}:`);
  sentences.forEach((sentence, index) => {
    console.log(`  ${index + 1}. ${sentence.german}`);
    if (sentence.russian) {
      console.log(`     ${sentence.russian}`);
    }
  });

  while (true) {
    const answer = await ask('Choose sentence [1-3, Enter=1, E=edit]: ');
    const normalized = answer.toLowerCase();

    if (normalized === '') {
      return sentences[0];
    }

    if (normalized === 'e' || normalized === 'edit') {
      const manual = await ask('Enter an example sentence: ');
      if (!manual) continue;
      return {
        german: manual,
        russian: verbData.meanings?.[0]?.russian || '',
        focusForm: verbData.displayForm || verbData.infinitive,
      };
    }

    const index = parseInt(normalized, 10);
    if (!Number.isNaN(index) && index >= 1 && index <= sentences.length) {
      return sentences[index - 1];
    }
  }
}

export async function confirmPictureVerbSelection({
  verbData,
  selectedMeaning,
  frequencyInfo,
  duplicateInfo,
  imageChoice,
  audioSource,
  audioPath,
  addDictionaryForm = false,
  theme = null,
  autoPlay = true,
}) {
  let personalConnection = null;
  let dictionaryFormEnabled = addDictionaryForm;

  if (autoPlay && audioPath) {
    try {
      await playAudio(audioPath);
    } catch {
      // Ignore initial audio errors.
    }
  }

  while (true) {
    console.log();
    console.log(`Verb: ${verbData.infinitive}`);
    console.log(`${verbData.ipa || ''}  ${selectedMeaning.russian}`.trim());
    console.log('Mode: picture-word');
    console.log(`Frequency: ${frequencyInfo.bandLabel}${frequencyInfo.rank ? ` (#${frequencyInfo.rank})` : ''}`);
    console.log(`Audio: ${audioSource}`);
    console.log(`Image: ${imageChoice.source || imageChoice.type}`);
    console.log(`Dictionary form card: ${dictionaryFormEnabled ? 'yes' : 'no'}`);
    if (theme) {
      console.log(`Theme: ${theme}`);
    }
    if (personalConnection) {
      console.log(`Personal connection: ${personalConnection}`);
    }
    if (duplicateInfo.headwordMatches.length > 0) {
      console.log();
      console.log('Existing notes with the same lemma:');
      duplicateInfo.headwordMatches.slice(0, 3).forEach((match) => {
        console.log(`  - ${match.canonical}${match.meaning ? ` (${match.meaning})` : ''}`);
      });
    }

    const answer = await ask('[A]dd, [L]isten, [T]oggle form card, [P]ersonal connection, [D]ismiss: ');
    const normalized = answer.toLowerCase();

    if (normalized === '' || normalized === 'a' || normalized === 'add') {
      return { confirmed: true, personalConnection, addDictionaryForm: dictionaryFormEnabled };
    }

    if (normalized === 'l' || normalized === 'listen') {
      if (!audioPath) continue;
      try {
        await playAudio(audioPath);
      } catch (err) {
        console.log(`Could not play audio: ${err.message}`);
      }
      continue;
    }

    if (normalized === 't' || normalized === 'toggle') {
      dictionaryFormEnabled = !dictionaryFormEnabled;
      continue;
    }

    if (normalized === 'p' || normalized === 'personal') {
      const connection = await ask('Personal connection (optional, Enter clears): ');
      personalConnection = connection || null;
      continue;
    }

    return { confirmed: false, personalConnection: null, addDictionaryForm: false };
  }
}

export async function confirmSentenceVerbSelection({
  verbData,
  selectedMeaning,
  sentenceData,
  chosenSentence,
  audioPath,
  similarCards = [],
  addDictionaryForm = false,
  autoPlay = true,
}) {
  let dictionaryFormEnabled = addDictionaryForm;

  if (autoPlay && audioPath) {
    try {
      await playAudio(audioPath);
    } catch {
      // Ignore initial audio errors.
    }
  }

  while (true) {
    console.log();
    console.log(`Verb: ${verbData.infinitive}`);
    if (verbData.displayForm && verbData.displayForm !== verbData.infinitive) {
      console.log(`Encountered form: ${verbData.displayForm}`);
    }
    console.log(`Meaning: ${selectedMeaning.russian}`);
    console.log('Mode: sentence-form');
    console.log(`Sentence: ${sentenceData.german}`);
    console.log(`${sentenceData.ipa || ''}  ${sentenceData.russian}`.trim());
    if (sentenceData.cefr?.level) {
      console.log(`CEFR: ${sentenceData.cefr.level}`);
    }
    if (chosenSentence?.focusForm) {
      console.log(`Focus form: ${chosenSentence.focusForm}`);
    }
    console.log(`Dictionary form card: ${dictionaryFormEnabled ? 'yes' : 'no'}`);

    if (similarCards.length > 0) {
      console.log();
      console.log('Similar cards found:');
      similarCards.slice(0, 3).forEach((card) => {
        console.log(`  - ${card.similarity}% "${card.german}"`);
      });
    }

    const answer = await ask('[A]dd, [L]isten, [T]oggle form card, [D]ismiss: ');
    const normalized = answer.toLowerCase();

    if (normalized === '' || normalized === 'a' || normalized === 'add') {
      return { confirmed: true, addDictionaryForm: dictionaryFormEnabled };
    }

    if (normalized === 'l' || normalized === 'listen') {
      if (!audioPath) continue;
      try {
        await playAudio(audioPath);
      } catch (err) {
        console.log(`Could not play audio: ${err.message}`);
      }
      continue;
    }

    if (normalized === 't' || normalized === 'toggle') {
      dictionaryFormEnabled = !dictionaryFormEnabled;
      continue;
    }

    return { confirmed: false, addDictionaryForm: false };
  }
}
