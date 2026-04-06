import { createInterface } from 'readline';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { config } from './config.js';
import { estimateLexicalCEFR } from './cefr.js';
import { getWordFrequencyInfo } from './wordFrequency.js';
import { applyChosenSentenceGloss, buildWordExtraInfo, formatPlainWord, formatPronunciationField, toTagSlug } from './wordUtils.js';
import { enrichVerb, hasStructuredVerbAnalysis, shouldOfferDictionaryFormCard } from './verbEnricher.js';
import { chooseImage, chooseMeaning } from './wordConfirm.js';
import { chooseVerbSentence, confirmPictureVerbSelection, confirmSentenceVerbSelection, formatVerbPreviewSummary, resolveVerbFocusForm } from './verbConfirm.js';
import { resolveImageAsset, resolveWordPronunciation, searchVerbImages } from './wordSources.js';
import {
  checkConnection,
  createBasicNote,
  createNote,
  createPictureWordNote,
  ensureDeck,
  findSimilarCards,
  findWordDuplicates,
  getNoteTypes,
  storeAudio,
  storeMedia,
} from './anki.js';
import { generateSimpleSpeech, generateSpeech } from './tts.js';
import { enrich, reviewEnrichedText } from './enricher.js';

const DEFAULT_WORD_NOTE_TYPE = config.wordNoteType || '2. Picture Words';

function showVerbHeader(rawInput) {
  const label = String(rawInput || '').trim();
  if (!label) return;

  console.log();
  console.log(chalk.bold(label));
}

function normalizeVerbMode(mode) {
  if (mode === 'picture' || mode === 'picture-word') return 'picture-word';
  if (mode === 'sentence' || mode === 'sentence-form') return 'sentence-form';
  return null;
}

async function ensureVerbSetup(deck, dryRun) {
  if (dryRun) return;

  if (!await checkConnection()) {
    throw new Error('AnkiConnect not available. Make sure Anki is running.');
  }

  const noteTypes = await getNoteTypes();
  if (!noteTypes.includes(DEFAULT_WORD_NOTE_TYPE)) {
    throw new Error(`Required note type "${DEFAULT_WORD_NOTE_TYPE}" not found in Anki.`);
  }
  if (!noteTypes.includes(config.ankiNoteType)) {
    throw new Error(`Required note type "${config.ankiNoteType}" not found in Anki.`);
  }

  await ensureDeck(deck || config.ankiDeck);
}

async function buildVerbAudio(verbData, spinner) {
  spinner.start('Resolving verb audio...');
  let wiktionaryIpa = null;

  try {
    const pronunciation = await resolveWordPronunciation({
      bareNoun: verbData.infinitive,
      canonical: verbData.infinitive,
    });
    if (pronunciation?.ipa) {
      verbData.ipa = pronunciation.ipa;
      wiktionaryIpa = pronunciation.ipa;
    }

    if (pronunciation?.audioPath) {
      spinner.succeed(wiktionaryIpa
        ? 'Using Wikimedia human audio and Wiktionary IPA'
        : 'Using Wikimedia human audio');
      return {
        audioPath: pronunciation.audioPath,
        source: pronunciation.source,
      };
    }
  } catch {
    // Fall back to Google TTS below.
  }

  const audioPath = join(config.dataDir, `verb_tts_${Date.now()}.mp3`);
  await generateSimpleSpeech(verbData.infinitive, audioPath, {
    speed: config.ttsSpeed || 0.75,
    ipa: wiktionaryIpa,
  });
  spinner.succeed(wiktionaryIpa
    ? 'Using Google TTS fallback audio (IPA from Wiktionary)'
    : 'Using Google TTS fallback audio');

  return {
    audioPath,
    source: 'Google TTS',
  };
}

async function buildVerbSentenceAudio(sentence, spinner) {
  spinner.start('Generating sentence audio...');
  const audioPath = join(config.dataDir, `verb_sentence_${Date.now()}.mp3`);
  await generateSpeech(sentence, audioPath);
  spinner.succeed('Sentence audio ready');
  return {
    audioPath,
    source: 'Google TTS',
  };
}

async function rebuildSentenceVerbPreview(prepared, feedback, options, spinner) {
  const {
    verbData,
    chosenSentence,
    sentenceData,
    similarCards: currentSimilarCards,
    audio: currentAudio,
  } = prepared;
  const focusForm = chosenSentence?.focusForm || verbData.displayForm || verbData.infinitive;

  spinner.start('Reviewing sentence with AI...');
  const reviewed = await reviewEnrichedText({
    german: sentenceData.german,
    ipa: sentenceData.ipa,
    russian: sentenceData.russian,
  }, feedback, {
    cardPurpose: `Sentence-form verb card for "${verbData.infinitive}"`,
    requiredTerms: focusForm ? [focusForm] : [],
    extraGuidance: 'Keep the sentence short, natural, and focused on the target verb.',
  });

  const germanChanged = reviewed.german.trim() !== sentenceData.german.trim();
  const reviewedChosenSentence = {
    ...chosenSentence,
    german: reviewed.german,
    russian: reviewed.russian || chosenSentence?.russian || sentenceData.russian,
  };
  const reviewedSentenceData = applyChosenSentenceGloss(reviewed, reviewedChosenSentence);
  spinner.succeed(`Sentence reviewed: ${reviewedSentenceData.german}`);

  let similarCards = currentSimilarCards;
  if (germanChanged) {
    similarCards = [];
    try {
      if (!options.dryRun) {
        spinner.start('Checking similar cards...');
        similarCards = await findSimilarCards(reviewedSentenceData.german);
        spinner.stop();
      }
    } catch (err) {
      spinner.stop();
      if (!options.dryRun) {
        console.log(chalk.dim(`Similarity check skipped: ${err.message}`));
      }
    }
  }

  let audio = currentAudio;
  if (germanChanged) {
    audio = await buildVerbSentenceAudio(reviewedSentenceData.german, spinner);
  }

  return {
    ...prepared,
    chosenSentence: reviewedChosenSentence,
    sentenceData: reviewedSentenceData,
    similarCards,
    audio,
  };
}

function buildDictionaryFormContext(verbData, focusForm = null) {
  const form = focusForm || verbData.displayForm || verbData.infinitive;
  if (!form || form === verbData.infinitive) {
    return null;
  }

  return `${form} -> ${verbData.infinitive}`;
}

async function createDictionaryFormNote(verbData, selectedMeaning, focusForm, deck) {
  const displayForm = focusForm || verbData.displayForm || verbData.infinitive;
  const backParts = [verbData.infinitive];
  if (verbData.ipa) {
    backParts.push(verbData.ipa);
  }
  if (selectedMeaning?.russian) {
    backParts.push(selectedMeaning.russian);
  }

  return createBasicNote({
    front: displayForm,
    back: backParts.join('<br>'),
    deck,
    tags: [
      'yt2anki',
      'mode-verb-dictionary',
      `lemma-${toTagSlug(verbData.infinitive)}`,
      `form-${toTagSlug(displayForm)}`,
    ],
  });
}

async function prepareVerb(rawInput, options, spinner) {
  spinner.start('Analyzing verb...');
  const verbData = options.analysisResult || await enrichVerb(rawInput);
  const recoverable = hasStructuredVerbAnalysis(verbData);

  if (!verbData.shouldCreateVerbCard && !recoverable) {
    spinner.warn(`Rejected: ${verbData.rejectionReason}`);
    return { rejected: true };
  }

  if (!verbData.shouldCreateVerbCard && recoverable) {
    console.log(chalk.yellow(`Weak verb candidate: ${verbData.rejectionReason || 'continuing with normalized verb analysis'}.`));
  }

  spinner.succeed(`Ready: ${verbData.infinitive}`);

  const selectedMeaning = await chooseMeaning(
    {
      canonical: verbData.infinitive,
      bareNoun: verbData.infinitive,
      meanings: verbData.meanings,
    },
    options.meaning
  );
  if (!selectedMeaning) {
    console.log(chalk.yellow('Skipped: no meaning selected'));
    return { rejected: true };
  }
  const frequencyInfo = getWordFrequencyInfo(verbData.infinitive);
  const forcedMode = normalizeVerbMode(options.mode);
  const route = forcedMode || verbData.recommendedMode || 'sentence-form';
  const addDictionaryForm = shouldOfferDictionaryFormCard(verbData);

  if (route === 'picture-word') {
    let duplicateInfo = { exactMatches: [], headwordMatches: [] };
    spinner.start('Checking duplicates...');
    try {
      duplicateInfo = await findWordDuplicates({
        canonical: verbData.infinitive,
        meaning: selectedMeaning.russian,
        modelName: DEFAULT_WORD_NOTE_TYPE,
      });
    } catch (err) {
      if (!options.dryRun) throw err;
      console.log(chalk.dim(`Duplicate check skipped in dry run: ${err.message}`));
    } finally {
      spinner.stop();
    }

    if (duplicateInfo.exactMatches.length > 0) {
      console.log(chalk.yellow(`Exact duplicate exists for ${verbData.infinitive} (${selectedMeaning.russian})`));
      return { rejected: true };
    }

    let lexicalCefr = null;
    try {
      spinner.start('Estimating lexical CEFR...');
      lexicalCefr = await estimateLexicalCEFR(verbData.infinitive, {
        lexicalType: 'verb',
        meaning: selectedMeaning.russian,
      });
      spinner.stop();
    } catch (err) {
      spinner.stop();
      console.log(chalk.dim(`Lexical CEFR skipped: ${err.message}`));
    }

    spinner.start('Searching images...');
    const imageCandidates = await searchVerbImages(verbData, selectedMeaning, {
      pageSize: config.wordImagePreviewCount || 12,
      total: config.wordImageSearchResults || 12,
    });
    spinner.stop();

    const imageChoice = await chooseImage(
      { canonical: verbData.infinitive },
      selectedMeaning,
      imageCandidates
    );
    if (!imageChoice) {
      console.log(chalk.yellow('Skipped: no image selected'));
      return { rejected: true };
    }

    const audio = await buildVerbAudio(verbData, spinner);

    return {
      route,
      verbData,
      selectedMeaning,
      lexicalCefr,
      frequencyInfo,
      duplicateInfo,
      imageChoice,
      audio,
      addDictionaryForm,
    };
  }

  const chosenSentence = await chooseVerbSentence(verbData, options.sentence);
  if (!chosenSentence) {
    console.log(chalk.yellow('Skipped: no example sentence selected'));
    return { rejected: true };
  }

  spinner.start('Preparing example sentence...');
  const sentenceData = applyChosenSentenceGloss(
    await enrich(chosenSentence.german),
    chosenSentence
  );
  spinner.succeed(`Sentence ready: ${sentenceData.german}`);

  let similarCards = [];
  try {
    if (!options.dryRun) {
      spinner.start('Checking similar cards...');
      similarCards = await findSimilarCards(sentenceData.german);
      spinner.stop();
    }
  } catch (err) {
    spinner.stop();
    if (!options.dryRun) {
      console.log(chalk.dim(`Similarity check skipped: ${err.message}`));
    }
  }

  const audio = await buildVerbSentenceAudio(sentenceData.german, spinner);

  return {
    route,
    verbData,
    selectedMeaning,
    frequencyInfo,
    chosenSentence,
    sentenceData,
    similarCards,
    audio,
    addDictionaryForm,
  };
}

async function finalizePictureVerb(prepared, options, spinner) {
  const {
    verbData,
    selectedMeaning,
    frequencyInfo,
    duplicateInfo,
    imageChoice,
    audio,
    addDictionaryForm,
  } = prepared;

  const confirmation = await confirmPictureVerbSelection({
    verbData,
    selectedMeaning,
    frequencyInfo,
    duplicateInfo,
    imageChoice,
    audioSource: audio.source,
    audioPath: audio.audioPath,
    addDictionaryForm,
    theme: options.theme || null,
  });

  if (!confirmation.confirmed) {
    console.log(chalk.yellow('Verb dismissed'));
    return false;
  }

  const metadata = {
    canonical: verbData.infinitive,
    meaning: selectedMeaning.russian,
    lemma: verbData.infinitive,
    lexicalType: 'verb',
  };
  const extraInfoField = buildWordExtraInfo({
    meaning: selectedMeaning.russian,
    exampleSentence: verbData.exampleSentences?.[0]?.german || null,
    dictionaryForm: buildDictionaryFormContext(verbData),
    personalConnection: confirmation.personalConnection,
    metadata,
  });

  if (options.dryRun) {
    console.log();
    console.log(chalk.bold('Verb preview'));
    console.log(`  ${formatVerbPreviewSummary(chalk, verbData, selectedMeaning.russian, prepared.lexicalCefr?.level || null)}`);
    if (verbData.ipa) {
      console.log(`  ${chalk.cyan('IPA:')} ${verbData.ipa}`);
    }
    console.log(`  ${chalk.cyan('Frequency:')} ${frequencyInfo.bandLabel}${frequencyInfo.rank ? ` (#${frequencyInfo.rank})` : ''}`);
    console.log(`  ${chalk.cyan('Audio:')} ${audio.source}`);
    console.log(`  ${chalk.cyan('Dictionary form card:')} ${confirmation.addDictionaryForm ? 'yes' : 'no'}`);
    console.log(chalk.yellow('\n⚡ DRY RUN: Verb note previewed'));
    return true;
  }

  spinner.start('Downloading chosen image...');
  const imagePath = await resolveImageAsset(imageChoice);
  spinner.succeed('Image ready');

  spinner.start('Creating verb note...');
  const imageFilename = await storeMedia(imagePath);
  const audioFilename = await storeAudio(audio.audioPath);
  const pronunciationField = formatPronunciationField(audioFilename, verbData.ipa);

  await createPictureWordNote({
    canonical: verbData.infinitive,
    coloredWord: formatPlainWord(verbData.infinitive),
    imageFilename,
    pronunciationField,
    extraInfoField,
    frequencyBand: frequencyInfo.bandKey,
    lemma: verbData.infinitive,
    imageSource: imageChoice.source || imageChoice.type,
    audioSource: audio.source,
    lexicalType: 'verb',
    deck: options.deck,
    modelName: DEFAULT_WORD_NOTE_TYPE,
  });

  if (confirmation.addDictionaryForm) {
    await createDictionaryFormNote(verbData, selectedMeaning, verbData.displayForm, options.deck);
  }

  spinner.succeed(`Created ${verbData.infinitive}`);
  console.log(chalk.green(`✓ Added ${verbData.infinitive} (${selectedMeaning.russian})`));
  return true;
}

async function finalizeSentenceVerb(prepared, options, spinner) {
  let current = prepared;
  let autoPlay = true;

  while (true) {
    const confirmation = await confirmSentenceVerbSelection({
      verbData: current.verbData,
      selectedMeaning: current.selectedMeaning,
      sentenceData: current.sentenceData,
      chosenSentence: current.chosenSentence,
      audioPath: current.audio.audioPath,
      similarCards: current.similarCards,
      addDictionaryForm: current.addDictionaryForm,
      autoPlay,
    });

    if (confirmation.reviewFeedback) {
      current = {
        ...await rebuildSentenceVerbPreview(current, confirmation.reviewFeedback, options, spinner),
        addDictionaryForm: confirmation.addDictionaryForm,
      };
      autoPlay = true;
      continue;
    }

    if (!confirmation.confirmed) {
      console.log(chalk.yellow('Verb dismissed'));
      return false;
    }

    current = {
      ...current,
      addDictionaryForm: confirmation.addDictionaryForm,
    };
    break;
  }

  const {
    verbData,
    selectedMeaning,
    chosenSentence,
    sentenceData,
    audio,
    addDictionaryForm,
  } = current;

  if (options.dryRun) {
    console.log();
    console.log(chalk.bold('Verb sentence preview'));
    console.log(`  ${formatVerbPreviewSummary(chalk, verbData, selectedMeaning.russian, sentenceData.cefr?.level || null)}`);
    console.log(`  ${chalk.cyan('Sentence:')} ${sentenceData.german}`);
    if (sentenceData.ipa) {
      console.log(`  ${chalk.cyan('IPA:')} ${sentenceData.ipa}`);
    }
    if (sentenceData.russian) {
      console.log(`  ${chalk.cyan('Russian:')} ${sentenceData.russian}`);
    }
    const focusForm = resolveVerbFocusForm(verbData, chosenSentence);
    if (focusForm) {
      console.log(`  ${chalk.cyan('Focus form:')} ${focusForm}`);
    }
    console.log(`  ${chalk.cyan('Dictionary form card:')} ${addDictionaryForm ? 'yes' : 'no'}`);
    console.log(chalk.yellow('\n⚡ DRY RUN: Verb sentence previewed'));
    return true;
  }

  spinner.start('Creating sentence note...');
  const audioFilename = await storeAudio(audio.audioPath);
  await createNote({
    german: sentenceData.german,
    ipa: sentenceData.ipa,
    russian: sentenceData.russian,
    audioFilename,
    context: buildDictionaryFormContext(verbData, chosenSentence.focusForm) || `Verb: ${verbData.infinitive}`,
    cefr: sentenceData.cefr,
    deck: options.deck,
    tags: [
      'mode-verb-sentence',
      `lemma-${toTagSlug(verbData.infinitive)}`,
      `verb-form-${toTagSlug(chosenSentence.focusForm || verbData.displayForm || verbData.infinitive)}`,
    ],
  });

  if (addDictionaryForm) {
    await createDictionaryFormNote(
      verbData,
      selectedMeaning,
      chosenSentence.focusForm || verbData.displayForm,
      options.deck
    );
  }

  spinner.succeed(`Created sentence card for ${verbData.infinitive}`);
  console.log(chalk.green(`✓ Added verb sentence for ${verbData.infinitive}`));
  return true;
}

export async function runVerbWorkflow(rawInput, options = {}) {
  const spinner = ora();

  try {
    if (!options.skipHeader) {
      showVerbHeader(rawInput);
    }
    await ensureVerbSetup(options.deck || config.ankiDeck, options.dryRun);
    const prepared = await prepareVerb(rawInput, options, spinner);
    if (!prepared || prepared.rejected) {
      return false;
    }

    if (prepared.route === 'picture-word') {
      return finalizePictureVerb(prepared, options, spinner);
    }
    return finalizeSentenceVerb(prepared, options, spinner);
  } catch (err) {
    spinner.fail(err.message);
    throw err;
  }
}

export async function processSingleVerb(rawInput, options = {}) {
  try {
    return await runVerbWorkflow(rawInput, options);
  } catch {
    process.exit(1);
  }
}

export async function processVerbBatch(options = {}) {
  try {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.bold('\nEnter German verbs (one per line, empty line to finish):\n'));

    const verbs = await new Promise((resolve) => {
      const entries = [];
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (trimmed === '') {
          rl.close();
          return;
        }

        entries.push(trimmed);
        console.log(chalk.dim(`  Added #${entries.length}: "${trimmed}"`));
      });

      rl.on('close', () => resolve(entries));
    });

    if (verbs.length === 0) {
      console.log(chalk.yellow('No verbs entered'));
      return;
    }

    console.log(chalk.bold(`\nProcessing ${verbs.length} verbs...\n`));

    let completed = 0;
    for (const verb of verbs) {
      try {
        const added = await runVerbWorkflow(verb, options);
        if (added) {
          completed++;
        }
      } catch (err) {
        console.log(chalk.red(`Skipped "${verb}": ${err.message}`));
      }
    }

    console.log();
    if (options.dryRun) {
      console.log(chalk.yellow(`⚡ DRY RUN: ${completed} verb notes previewed`));
    } else {
      console.log(chalk.green(`✓ Added ${completed} verb notes`));
    }
  } catch {
    process.exit(1);
  }
}
