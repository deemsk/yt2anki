import { createInterface } from 'readline';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { config } from './lib/config.js';
import { estimateLexicalCEFR } from './cardContent/cefr.js';
import { getWordFrequencyInfo } from './lib/wordFrequency.js';
import { toTagSlug } from './cardContent/german.js';
import { applyChosenSentenceGloss } from './cardContent/wordLexical.js';
import { buildVerbMorphologyTags, resolveVerbMorphology } from './cardContent/verbMorphology.js';
import { buildStrongVerbPackagePlan, buildVerbFormContext } from './cardContent/verbPackage.js';
import { formatPlainWord, formatPronunciationField } from './templates/shared/components.js';
import { buildWordExtraInfo } from './templates/word/extraInfo.js';
import { buildVerbFormClozeExtra, buildVerbFormClozeText } from './templates/verb/cloze.js';
import { buildVerbDictionaryNote } from './templates/verb/dictionary.js';
import { buildVerbKeyFormProductionBack, buildVerbKeyFormProductionFront, buildVerbKeyFormRecognitionBack, buildVerbKeyFormRecognitionFront } from './templates/verb/keyForm.js';
import { enrichVerb, generateVerbFormSentence, hasStructuredVerbAnalysis, shouldOfferDictionaryFormCard } from './verbEnricher.js';
import { shouldSuggestVerbInfinitive, suggestVerbInfinitives } from './verbCorrection.js';
import { chooseImage, chooseMeaning } from './wordConfirm.js';
import { chooseVerbSentence, confirmPictureVerbSelection, confirmSentenceVerbSelection, confirmStrongVerbPackage, formatVerbPreviewSummary, resolveVerbFocusForm } from './verbConfirm.js';
import { resolveImageAsset, resolveWordPronunciation, searchVerbImages } from './lib/wordSources.js';
import {
  checkConnection,
  createBasicNote,
  createClozeNote,
  createNote,
  createPictureWordNote,
  ensureDeck,
  findSimilarCards,
  findVerbLemmaDuplicates,
  findWordDuplicates,
  getNoteTypes,
  storeAudio,
  storeMedia,
} from './anki.js';
import { generateSimpleSpeech, generateSpeech } from './lib/tts.js';
import { enrich, reviewEnrichedText } from './enricher.js';

const DEFAULT_WORD_NOTE_TYPE = config.wordNoteType || '2. Picture Words';

function showVerbHeader(rawInput) {
  const label = String(rawInput || '').trim();
  if (!label) return;

  console.log();
  console.log(chalk.bold(label));
}

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

function normalizeVerbMode(mode) {
  if (mode === 'picture' || mode === 'picture-word') return 'picture-word';
  if (mode === 'sentence' || mode === 'sentence-form') return 'sentence-form';
  return null;
}

async function askVerbInfinitiveSuggestion(rawInput, suggestions = []) {
  if (suggestions.length === 0) {
    return null;
  }

  console.log();

  if (suggestions.length === 1) {
    const [suggestion] = suggestions;
    const reason = suggestion.reason ? chalk.dim(` (${suggestion.reason})`) : '';
    console.log(chalk.yellow(`Maybe you meant "${suggestion.text}"?${reason}`));

    while (true) {
      const answer = await ask('Use this infinitive? [Y]es, [N]o, [E]dit, [S]kip: ');
      const normalized = answer.toLowerCase();

      if (normalized === '' || normalized === 'y' || normalized === 'yes') {
        return suggestion.text;
      }

      if (normalized === 'n' || normalized === 'no' || normalized === 's' || normalized === 'skip') {
        return null;
      }

      if (normalized === 'e' || normalized === 'edit') {
        return await ask('Enter verb infinitive: ');
      }
    }
  }

  console.log(chalk.yellow(`Maybe you meant one of these infinitives for "${rawInput}"?`));
  suggestions.forEach((suggestion, index) => {
    const reason = suggestion.reason ? chalk.dim(` (${suggestion.reason})`) : '';
    console.log(`  ${index + 1}. ${suggestion.text}${reason}`);
  });

  while (true) {
    const answer = await ask(`[1-${suggestions.length}] choose, [Enter=1], [N]o, [E]dit, [S]kip: `);
    const normalized = answer.toLowerCase();

    if (normalized === '') {
      return suggestions[0].text;
    }

    if (normalized === 'n' || normalized === 'no' || normalized === 's' || normalized === 'skip') {
      return null;
    }

    if (normalized === 'e' || normalized === 'edit') {
      return await ask('Enter verb infinitive: ');
    }

    const index = parseInt(normalized, 10);
    if (!Number.isNaN(index) && index >= 1 && index <= suggestions.length) {
      return suggestions[index - 1].text;
    }
  }
}

async function resolveRejectedVerbInfinitive(rawInput, verbData) {
  if (!shouldSuggestVerbInfinitive(rawInput, verbData)) {
    return null;
  }

  try {
    const suggestions = await suggestVerbInfinitives(rawInput, verbData.rejectionReason);
    return askVerbInfinitiveSuggestion(rawInput, suggestions);
  } catch (err) {
    console.log(chalk.dim(`Infinitive suggestion skipped: ${err.message}`));
    return null;
  }
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

async function choosePictureVerbImage(prepared, spinner) {
  const { verbData, selectedMeaning } = prepared;

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
    console.log(chalk.dim('Continuing without image.'));
  }

  return imageChoice;
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

  return `${form} → ${verbData.infinitive}`;
}

async function createDictionaryFormNote(verbData, selectedMeaning, focusForm, deck) {
  const note = buildVerbDictionaryNote({ verbData, selectedMeaning, focusForm });

  return createBasicNote({
    front: note.front,
    back: note.back,
    deck,
    tags: [
      'yt2anki',
      'mode-verb-dictionary',
      `lemma-${toTagSlug(verbData.infinitive)}`,
      `form-${toTagSlug(note.front)}`,
    ],
  });
}

/**
 * Creates the base lexical note for a strong/irregular verb package.
 */
async function createVerbLemmaNote(verbData, selectedMeaning, audioFilename, deck, morphology) {
  return createBasicNote({
    front: verbData.infinitive,
    back: [
      formatPronunciationField(audioFilename, verbData.ipa),
      selectedMeaning?.russian,
    ].filter(Boolean).join('<br>'),
    deck,
    tags: [
      'yt2anki',
      'mode-verb-lemma',
      `lemma-${toTagSlug(verbData.infinitive)}`,
      ...buildVerbMorphologyTags(morphology),
    ],
  });
}

/**
 * Creates production and recognition notes for one selected verb form.
 */
async function createVerbKeyFormNotes(verbData, selectedMeaning, morphology, formSpec, deck) {
  const sharedTags = [
    'yt2anki',
    `lemma-${toTagSlug(verbData.infinitive)}`,
    ...buildVerbMorphologyTags(morphology, formSpec),
  ];

  await createBasicNote({
    front: buildVerbKeyFormProductionFront(verbData.infinitive, formSpec),
    back: buildVerbKeyFormProductionBack(formSpec, selectedMeaning),
    deck,
    tags: [
      ...sharedTags,
      'mode-verb-keyform-production',
    ],
  });

  await createBasicNote({
    front: buildVerbKeyFormRecognitionFront(formSpec),
    back: buildVerbKeyFormRecognitionBack(verbData, selectedMeaning),
    deck,
    tags: [
      ...sharedTags,
      'mode-verb-keyform-recognition',
    ],
  });
}

/**
 * Creates one sentence card for a selected verb form.
 */
async function createVerbFormSentenceNote(verbData, sentence, audioFilename, morphology, deck) {
  const formSpec = sentence.formSpec;
  return createNote({
    german: sentence.german,
    ipa: sentence.ipa,
    russian: sentence.russian,
    audioFilename,
    context: buildVerbFormContext(verbData.infinitive, formSpec),
    contextStyle: 'plain',
    addReversed: false,
    task: {
      label: 'Hear the form',
      instruction: 'Listen for the target verb form',
    },
    cefr: sentence.cefr,
    deck,
    tags: [
      'mode-verb-sentence',
      `lemma-${toTagSlug(verbData.infinitive)}`,
      ...buildVerbMorphologyTags(morphology, formSpec),
    ],
  });
}

/**
 * Creates one Cloze note that asks for the selected finite verb form in context.
 */
async function createVerbFormClozeNote(verbData, sentence, morphology, deck) {
  const formSpec = sentence.formSpec;
  const text = buildVerbFormClozeText(sentence, formSpec, verbData.infinitive);
  if (!text.includes('{{c1::')) {
    throw new Error(`Could not build verb-form cloze for ${verbData.infinitive} ${formSpec.key}`);
  }

  return createClozeNote({
    text,
    extra: buildVerbFormClozeExtra(sentence, formSpec, verbData.infinitive),
    deck,
    tags: [
      'yt2anki',
      'mode-verb-form-cloze',
      `lemma-${toTagSlug(verbData.infinitive)}`,
      ...buildVerbMorphologyTags(morphology, formSpec),
    ],
  });
}

/**
 * Builds a strong/irregular verb package preview, or returns null for standard fallback.
 */
async function prepareStrongVerbPackage({ verbData, selectedMeaning, route, frequencyInfo, options, spinner }) {
  if (options.disableStrongVerbPackage || options.sentence) {
    return null;
  }

  spinner.start('Resolving verb morphology...');
  const morphology = options.morphologyResult || await resolveVerbMorphology(verbData.infinitive);
  spinner.stop();

  if (
    morphology.confidence !== 'high' ||
    !['strong', 'mixed', 'core-irregular'].includes(morphology.classification) ||
    !Array.isArray(morphology.selectedForms) ||
    morphology.selectedForms.length === 0
  ) {
    console.log(chalk.dim('Strong-verb package skipped: trusted irregular morphology was not available.'));
    return null;
  }

  const sentenceCandidates = [];
  for (const formSpec of morphology.selectedForms) {
    spinner.start(`Generating ${formSpec.label} sentence...`);
    const generated = options.packageSentences?.[formSpec.key] || await generateVerbFormSentence({
      infinitive: verbData.infinitive,
      pronounLabel: formSpec.label,
      pronoun: formSpec.pronoun,
      form: formSpec.form,
      particle: morphology.particle,
      meaning: selectedMeaning.russian || selectedMeaning.english || '',
    });
    const sentenceData = applyChosenSentenceGloss(
      await enrich(generated.german),
      generated
    );
    spinner.succeed(`Sentence ready: ${sentenceData.german}`);
    sentenceCandidates.push({
      ...sentenceData,
      formKey: formSpec.key,
    });
  }

  const packagePlan = buildStrongVerbPackagePlan({
    morphology,
    sentences: sentenceCandidates,
  });

  if (!packagePlan) {
    console.log(chalk.dim('Strong-verb package skipped: generated sentences did not validate against morphology.'));
    return null;
  }

  let duplicateInfo = { exactMatches: [], headwordMatches: [] };
  let lemmaDuplicateInfo = { exactMatches: [] };
  try {
    if (!options.dryRun) {
      spinner.start('Checking duplicates...');
      [duplicateInfo, lemmaDuplicateInfo] = await Promise.all([
        findWordDuplicates({
          canonical: verbData.infinitive,
          meaning: selectedMeaning.russian,
          modelName: DEFAULT_WORD_NOTE_TYPE,
        }),
        findVerbLemmaDuplicates({
          infinitive: verbData.infinitive,
          modelName: config.ankiNoteType,
        }),
      ]);
      spinner.stop();
    }
  } catch (err) {
    spinner.stop();
    if (!options.dryRun) {
      console.log(chalk.dim(`Duplicate check skipped: ${err.message}`));
    }
  }

  if (duplicateInfo.exactMatches.length > 0) {
    console.log(chalk.yellow(`Exact duplicate exists for ${verbData.infinitive} (${selectedMeaning.russian})`));
    return { rejected: true };
  }
  if (lemmaDuplicateInfo.exactMatches.length > 0) {
    console.log(chalk.yellow(`Strong verb package already exists for ${verbData.infinitive}`));
    return { rejected: true };
  }

  const audio = await buildVerbAudio(verbData, spinner);
  const sentenceAudios = [];
  for (const sentence of packagePlan.sentences) {
    sentenceAudios.push(await buildVerbSentenceAudio(sentence.german, spinner));
  }

  return {
    route: 'strong-verb-package',
    verbData,
    selectedMeaning,
    routeBeforePackage: route,
    frequencyInfo,
    morphology,
    packagePlan,
    audio,
    sentenceAudios,
  };
}

async function prepareVerb(rawInput, options, spinner) {
  spinner.start('Analyzing verb...');
  const verbData = options.analysisResult || await enrichVerb(rawInput);
  const recoverable = hasStructuredVerbAnalysis(verbData);

  if (!verbData.shouldCreateVerbCard && !recoverable) {
    spinner.stop();
    if (!options.skipInfinitiveSuggestion) {
      const suggestedInfinitive = await resolveRejectedVerbInfinitive(rawInput, verbData);
      if (suggestedInfinitive) {
        console.log(chalk.dim(`Using "${suggestedInfinitive}".`));
        return prepareVerb(suggestedInfinitive, {
          ...options,
          analysisResult: null,
          skipInfinitiveSuggestion: true,
        }, spinner);
      }
    }
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
  const packagePrepared = await prepareStrongVerbPackage({
    verbData,
    selectedMeaning,
    route,
    frequencyInfo,
    options,
    spinner,
  });

  if (packagePrepared?.rejected) {
    return { rejected: true };
  }

  if (packagePrepared) {
    return packagePrepared;
  }

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

    const audio = await buildVerbAudio(verbData, spinner);

    return {
      route,
      verbData,
      selectedMeaning,
      lexicalCefr,
      frequencyInfo,
      duplicateInfo,
      imageChoice: null,
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
    audio,
    addDictionaryForm,
  } = prepared;

  const confirmation = await confirmPictureVerbSelection({
    verbData,
    selectedMeaning,
    frequencyInfo,
    duplicateInfo,
    imageChoice: null,
    showImage: false,
    audioSource: audio.source,
    audioPath: audio.audioPath,
    addDictionaryForm,
    theme: options.theme || null,
  });

  if (!confirmation.confirmed) {
    console.log(chalk.yellow('Verb dismissed'));
    return false;
  }

  const imageChoice = await choosePictureVerbImage(prepared, spinner);

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
    console.log(`  ${chalk.cyan('Image:')} ${imageChoice ? (imageChoice.source || imageChoice.type || 'image') : 'none'}`);
    console.log(`  ${chalk.cyan('Dictionary form card:')} ${confirmation.addDictionaryForm ? 'yes' : 'no'}`);
    console.log(chalk.yellow('\n⚡ DRY RUN: Verb note previewed'));
    return true;
  }

  let imageFilename = null;
  if (imageChoice) {
    spinner.start('Downloading chosen image...');
    const imagePath = await resolveImageAsset(imageChoice);
    spinner.succeed('Image ready');
    imageFilename = await storeMedia(imagePath);
  }

  spinner.start('Creating verb note...');
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
    imageSource: imageChoice?.source || imageChoice?.type || 'none',
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
    context: buildDictionaryFormContext(verbData, chosenSentence.focusForm),
    contextStyle: 'plain',
    addReversed: false,
    task: {
      label: 'Hear the form',
      instruction: 'Listen for the target verb form',
    },
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

/**
 * Creates all notes in a strong/irregular verb package after one preview confirmation.
 */
async function finalizeStrongVerbPackage(prepared, options, spinner) {
  const {
    verbData,
    selectedMeaning,
    morphology,
    packagePlan,
    audio,
    sentenceAudios,
  } = prepared;

  const confirmation = options.dryRun
    ? { confirmed: true }
    : await confirmStrongVerbPackage({
      verbData,
      selectedMeaning,
      morphology,
      packagePlan,
    });

  if (!confirmation.confirmed) {
    console.log(chalk.yellow('Verb package dismissed'));
    return false;
  }

  if (options.dryRun) {
    console.log();
    console.log(chalk.bold('Strong verb package preview'));
    console.log(`  ${formatVerbPreviewSummary(chalk, verbData, selectedMeaning.russian, null)}`);
    console.log(`  ${chalk.cyan('Morphology:')} ${morphology.classification} (${morphology.source})`);
    console.log(`  ${chalk.cyan('Forms:')} ${packagePlan.forms.map((form) => `${form.label} ${form.form}`).join(', ')}`);
    console.log(`  ${chalk.cyan('Cards:')} 1 lemma, ${packagePlan.forms.length * 2} key-form, ${packagePlan.sentences.length} sentence, ${packagePlan.sentences.length} cloze`);
    packagePlan.sentences.forEach((sentence) => {
      console.log(`  ${chalk.cyan('Sentence:')} ${sentence.german}`);
    });
    console.log(chalk.yellow('\n⚡ DRY RUN: Strong verb package previewed'));
    return true;
  }

  spinner.start('Creating strong verb package...');
  const lemmaAudioFilename = await storeAudio(audio.audioPath);
  await createVerbLemmaNote(verbData, selectedMeaning, lemmaAudioFilename, options.deck, morphology);

  for (const formSpec of packagePlan.forms) {
    await createVerbKeyFormNotes(verbData, selectedMeaning, morphology, formSpec, options.deck);
  }

  for (let index = 0; index < packagePlan.sentences.length; index++) {
    const sentence = packagePlan.sentences[index];
    const sentenceAudio = sentenceAudios[index];
    const audioFilename = await storeAudio(sentenceAudio.audioPath);
    await createVerbFormSentenceNote(verbData, sentence, audioFilename, morphology, options.deck);
    await createVerbFormClozeNote(verbData, sentence, morphology, options.deck);
  }

  spinner.succeed(`Created strong verb package for ${verbData.infinitive}`);
  console.log(chalk.green(`✓ Added strong verb package for ${verbData.infinitive}`));
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
    if (prepared.route === 'strong-verb-package') {
      return finalizeStrongVerbPackage(prepared, options, spinner);
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
