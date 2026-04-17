import { createInterface } from 'readline';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { config } from './config.js';
import { estimateLexicalCEFR } from './cefr.js';
import { getWordFrequencyInfo } from './wordFrequency.js';
import {
  applyChosenSentenceGloss,
  buildWordSentenceContrastFooter,
  buildWordExtraInfo,
  formatGenderColoredWord,
  formatPronunciationField,
  formatPlainWord,
  formatPluralLabel,
  getArticleNormalizationWarning,
  getPrimaryExampleSentence,
  getWordLemma,
  normalizeGermanForCompare,
  toTagSlug,
} from './wordUtils.js';
import { canProceedWithWeakWordCard, enrichWord, hasStructuredWordAnalysis } from './wordEnricher.js';
import { chooseImage, chooseMeaning, chooseWordSentence, confirmSentenceWordSelection, confirmWordSelection } from './wordConfirm.js';
import { resolveImageAsset, resolveWordPronunciation, searchWordImages } from './wordSources.js';
import {
  checkConnection,
  createNote,
  createPictureWordNote,
  ensureDeck,
  findSimilarCards,
  findSentenceWordDuplicates,
  findWordDuplicates,
  getNoteTypes,
  storeAudio,
  storeMedia,
} from './anki.js';
import { generateSimpleSpeech, generateSpeech } from './tts.js';
import { enrich, reviewEnrichedText } from './enricher.js';

const DEFAULT_WORD_NOTE_TYPE = config.wordNoteType || '2. Picture Words';
const SENTENCE_NOUN_PHRASE_PATTERN = /\b(der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines|kein|keine|keinen|keinem|keiner|keines|mein(?:e|en|em|er|es)?|dein(?:e|en|em|er|es)?|sein(?:e|en|em|er|es)?|ihr(?:e|en|em|er|es)?|unser(?:e|en|em|er|es)?|euer(?:e|en|em|er|es)?)\s+([A-ZÄÖÜ][\p{L}-]+)/gu;

function isNounWord(wordData = {}) {
  return (wordData.lexicalType || 'noun') === 'noun';
}

function formatWordDisplay(wordData) {
  return isNounWord(wordData)
    ? formatGenderColoredWord(wordData.canonical, wordData.gender)
    : formatPlainWord(wordData.canonical);
}

function formatWordPreviewSummary(chalk, wordData, translation, cefrLevel = null) {
  const meta = [isNounWord(wordData) ? 'noun' : 'adj'];

  if (cefrLevel) {
    meta.push(cefrLevel);
  }

  const head = `${chalk.bold.cyan(wordData.canonical)} ${chalk.dim(`(${meta.join(', ')})`)}`;

  return translation ? `${head} ${chalk.dim('—')} ${translation}` : head;
}

export function resolveWordAudioPlan(wordData = {}) {
  return {
    spokenText: String(wordData.canonical || getWordLemma(wordData) || '').trim(),
    preferHumanAudio: !isNounWord(wordData),
    speed: config.ttsSpeed || 0.75,
  };
}

function buildWordMetadata(wordData, selectedMeaning, frequencyInfo) {
  return {
    canonical: wordData.canonical,
    meaning: selectedMeaning.russian,
    lemma: frequencyInfo.lemma,
    lexicalType: wordData.lexicalType || 'noun',
    gender: wordData.gender || null,
  };
}

function resolveWordRoute(wordData = {}) {
  if (isNounWord(wordData)) {
    return 'picture-word';
  }

  return wordData.recommendedMode === 'sentence-form' ? 'sentence-form' : 'picture-word';
}

function buildWordSentenceFrontFooter(wordData) {
  if ((wordData?.lexicalType || 'adjective') !== 'adjective') {
    return null;
  }

  return buildWordSentenceContrastFooter(wordData?.opposite || null);
}

function buildSentenceImageTerms(wordData, chosenSentence) {
  const sentenceTerm = String(chosenSentence?.german || '').replace(/[.!?]+$/g, '').trim();
  const anchorTerm = String(wordData?.anchorPhrase || '').trim();
  const focusForm = String(chosenSentence?.focusForm || wordData?.canonical || '').trim();
  const normalizedFocus = normalizeGermanForCompare(focusForm);
  const nounAnchors = [];
  let match;

  while ((match = SENTENCE_NOUN_PHRASE_PATTERN.exec(sentenceTerm)) !== null) {
    const [, article, noun] = match;
    const articlePhrase = `${article} ${noun}`;
    nounAnchors.push(`${articlePhrase} ${focusForm}`.trim());
    nounAnchors.push(`${noun} ${focusForm}`.trim());
  }

  if (normalizedFocus && sentenceTerm) {
    const rawWords = sentenceTerm.split(/\s+/).map((part) => part.replace(/[.,!?;:()"]/g, '')).filter(Boolean);
    const focusIndex = rawWords.findIndex((word) => normalizeGermanForCompare(word) === normalizedFocus);
    if (focusIndex >= 0) {
      const capitalized = [];
      for (let index = Math.max(0, focusIndex - 4); index < focusIndex; index++) {
        if (/^[A-ZÄÖÜ][\p{L}-]+$/u.test(rawWords[index])) {
          capitalized.push(rawWords[index]);
        }
      }
      if (capitalized.length > 0) {
        const noun = capitalized[capitalized.length - 1];
        nounAnchors.push(`${noun} ${focusForm}`.trim());
      }
    }
  }

  const dedupedTerms = [];

  for (const term of [...nounAnchors, anchorTerm, sentenceTerm]) {
    const trimmed = String(term || '').trim();
    if (!trimmed) continue;
    if (dedupedTerms.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) continue;
    dedupedTerms.push(trimmed);
  }

  return dedupedTerms;
}

function buildSentenceImageBriefTerms(chosenSentence) {
  const brief = chosenSentence?.imageBrief;
  if (!brief || typeof brief !== 'object') {
    return [];
  }

  const terms = [];

  if (brief.searchQuery) {
    terms.push(brief.searchQuery);
  }

  if (Array.isArray(brief.queryVariants)) {
    terms.push(...brief.queryVariants);
  }

  const dedupedTerms = [];
  for (const term of terms) {
    const trimmed = String(term || '').trim();
    if (!trimmed) continue;
    if (dedupedTerms.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) continue;
    dedupedTerms.push(trimmed);
  }

  return dedupedTerms;
}

export function buildSentenceImageMeaning(selectedMeaning, chosenSentence, wordData) {
  const briefTerms = buildSentenceImageBriefTerms(chosenSentence);
  const sentenceTerms = buildSentenceImageTerms(wordData, chosenSentence);
  const existingTerms = Array.isArray(selectedMeaning?.imageSearchTerms) ? selectedMeaning.imageSearchTerms : [];
  const dedupedTerms = [];

  for (const term of [...briefTerms, ...sentenceTerms, ...existingTerms]) {
    const trimmed = String(term || '').trim();
    if (!trimmed) continue;
    if (dedupedTerms.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) continue;
    dedupedTerms.push(trimmed);
  }

  return {
    ...selectedMeaning,
    imageSearchTerms: dedupedTerms,
    visualBrief: chosenSentence?.imageBrief || selectedMeaning?.visualBrief || null,
  };
}

function showWordHeader(rawInput) {
  const label = String(rawInput || '').trim();
  if (!label) return;

  console.log();
  console.log(chalk.bold(label));
}

async function ensureWordSetup(deck, dryRun) {
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

  return deck;
}

async function buildWordAudio(wordData, spinner) {
  spinner.start('Resolving pronunciation audio...');
  let wiktionaryIpa = null;
  const audioPlan = resolveWordAudioPlan(wordData);

  try {
    const pronunciation = await resolveWordPronunciation(wordData);
    if (pronunciation?.ipa) {
      wordData.ipa = pronunciation.ipa;
      wiktionaryIpa = pronunciation.ipa;
    }

    if (audioPlan.preferHumanAudio && pronunciation?.audioPath) {
      spinner.succeed(wiktionaryIpa
        ? 'Using Wikimedia human audio and Wiktionary IPA'
        : 'Using Wikimedia human audio');
      return {
        audioPath: pronunciation.audioPath,
        source: pronunciation.source,
      };
    }
  } catch {
    // Fall back to TTS below.
  }

  const audioPath = join(config.dataDir, `word_tts_${Date.now()}.mp3`);
  await generateSimpleSpeech(audioPlan.spokenText, audioPath, {
    speed: audioPlan.speed,
    ipa: wiktionaryIpa,
  });
  spinner.succeed(audioPlan.preferHumanAudio
    ? (wiktionaryIpa
      ? 'Using Google TTS fallback audio (IPA from Wiktionary)'
      : 'Using Google TTS fallback audio')
    : (wiktionaryIpa
      ? 'Using Google TTS noun audio with article (IPA from Wiktionary)'
      : 'Using Google TTS noun audio with article'));
  return {
    audioPath,
    source: 'Google TTS',
  };
}

async function buildWordSentenceAudio(sentence, spinner) {
  spinner.start('Generating sentence audio...');
  const audioPath = join(config.dataDir, `word_sentence_${Date.now()}.mp3`);
  await generateSpeech(sentence, audioPath);
  spinner.succeed('Sentence audio ready');
  return {
    audioPath,
    source: 'Google TTS',
  };
}

async function rebuildSentenceWordPreview(prepared, feedback, options, spinner) {
  const {
    wordData,
    selectedMeaning,
    chosenSentence,
    sentenceData,
    imageChoice: currentImageChoice,
    similarCards: currentSimilarCards,
    audio: currentAudio,
  } = prepared;
  const focusForm = chosenSentence?.focusForm || wordData.canonical;

  spinner.start('Reviewing sentence with AI...');
  const reviewed = await reviewEnrichedText({
    german: sentenceData.german,
    ipa: sentenceData.ipa,
    russian: sentenceData.russian,
  }, feedback, {
    cardPurpose: `Sentence-form ${wordData.lexicalType || 'adjective'} card for "${wordData.canonical}"`,
    requiredTerms: focusForm ? [focusForm] : [],
    extraGuidance: 'Keep the sentence short, natural, and centered on the target word.',
    includeImageBrief: true,
  });

  const germanChanged = normalizeGermanForCompare(reviewed.german) !== normalizeGermanForCompare(sentenceData.german);
  const reviewedChosenSentence = {
    ...chosenSentence,
    german: reviewed.german,
    russian: reviewed.russian || chosenSentence?.russian || sentenceData.russian,
    imageBrief: reviewed.imageBrief || (germanChanged ? null : chosenSentence?.imageBrief || null),
  };
  const reviewedSentenceData = applyChosenSentenceGloss(reviewed, reviewedChosenSentence);
  spinner.succeed(`Sentence reviewed: ${reviewedSentenceData.german}`);

  let imageChoice = germanChanged ? null : currentImageChoice;
  if (germanChanged || reviewed.imageBrief) {
    spinner.start('Searching optional image...');
    const imageSearchMeaning = buildSentenceImageMeaning(selectedMeaning, reviewedChosenSentence, wordData);
    const imageCandidates = await searchWordImages(wordData, imageSearchMeaning, {
      pageSize: config.wordImagePreviewCount || 6,
      total: config.wordImageSearchResults || 12,
    });
    spinner.stop();

    if (imageCandidates.length > 0) {
      const revisedImageChoice = await chooseImage(wordData, selectedMeaning, imageCandidates);
      imageChoice = revisedImageChoice;
    }
  }

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
    audio = await buildWordSentenceAudio(reviewedSentenceData.german, spinner);
  }

  return {
    ...prepared,
    chosenSentence: reviewedChosenSentence,
    sentenceData: reviewedSentenceData,
    imageChoice,
    similarCards,
    audio,
  };
}

async function prepareWord(rawInput, options, spinner) {
  spinner.start('Analyzing word...');
  const wordData = options.analysisResult || await enrichWord(rawInput);
  const route = resolveWordRoute(wordData);
  const structuredAnalysis = hasStructuredWordAnalysis(wordData);
  const recoverableWeakCandidate = route === 'picture-word' && canProceedWithWeakWordCard(wordData);
  const articleNormalizationWarning = isNounWord(wordData)
    ? getArticleNormalizationWarning(rawInput, wordData.canonical)
    : null;

  if (!wordData.shouldCreateWordCard && !structuredAnalysis && !recoverableWeakCandidate) {
    spinner.warn(`Rejected: ${wordData.rejectionReason}`);
    return { rejected: true };
  }

  if (route === 'picture-word' && !wordData.isImageable && !recoverableWeakCandidate) {
    spinner.warn(`Rejected: ${wordData.imageabilityReason || 'not imageable enough for picture-word cards'}`);
    return { rejected: true };
  }

  if (route === 'sentence-form' && !structuredAnalysis) {
    spinner.warn(`Rejected: ${wordData.rejectionReason || 'not enough adjective analysis for sentence cards'}`);
    return { rejected: true };
  }

  if (route === 'sentence-form' && (!wordData.shouldCreateWordCard || !wordData.isImageable)) {
    const warning = wordData.rejectionReason || wordData.imageabilityReason || 'better learned in context';
    console.log(chalk.yellow(`Using sentence-form: ${warning}.`));
  } else if (recoverableWeakCandidate && (!wordData.shouldCreateWordCard || !wordData.isImageable)) {
    const warning = wordData.rejectionReason || wordData.imageabilityReason || 'weak picture candidate';
    console.log(chalk.yellow(`Weak picture candidate: ${warning}. Continuing anyway.`));
  }

  spinner.succeed(`Ready: ${wordData.canonical}`);

  if (articleNormalizationWarning) {
    console.log(chalk.yellow(articleNormalizationWarning));
  }

  const frequencyInfo = getWordFrequencyInfo(getWordLemma(wordData));

  if (route === 'picture-word') {
    const selectedMeaning = await chooseMeaning(wordData, options.meaning);
    if (!selectedMeaning) {
      console.log(chalk.yellow('Skipped: no meaning selected'));
      return { rejected: true };
    }

    let duplicateInfo = { exactMatches: [], headwordMatches: [] };
    spinner.start('Checking duplicates...');
    try {
      duplicateInfo = await findWordDuplicates({
        canonical: wordData.canonical,
        meaning: selectedMeaning.russian,
        lexicalType: wordData.lexicalType || 'noun',
        modelName: DEFAULT_WORD_NOTE_TYPE,
      });
    } catch (err) {
      if (!options.dryRun) {
        throw err;
      }
      console.log(chalk.dim(`Duplicate check skipped in dry run: ${err.message}`));
    } finally {
      spinner.stop();
    }

    if (duplicateInfo.exactMatches.length > 0) {
      console.log(chalk.yellow(`Exact duplicate exists for ${wordData.canonical} (${selectedMeaning.russian})`));
      return { rejected: true };
    }

    let lexicalCefr = null;
    try {
      spinner.start('Estimating lexical CEFR...');
      lexicalCefr = await estimateLexicalCEFR(wordData.canonical, {
        lexicalType: wordData.lexicalType || 'noun',
        meaning: selectedMeaning.russian,
      });
      spinner.stop();
    } catch (err) {
      spinner.stop();
      console.log(chalk.dim(`Lexical CEFR skipped: ${err.message}`));
    }

    spinner.start('Searching images...');
    const imageCandidates = await searchWordImages(wordData, selectedMeaning, {
      pageSize: config.wordImagePreviewCount || 6,
      total: config.wordImageSearchResults || 12,
    });
    spinner.stop();

    const imageChoice = await chooseImage(wordData, selectedMeaning, imageCandidates);
    if (!imageChoice) {
      console.log(chalk.dim('Continuing without image.'));
    }

    const audio = await buildWordAudio(wordData, spinner);

    return {
      route,
      wordData,
      frequencyInfo,
      selectedMeaning,
      lexicalCefr,
      duplicateInfo,
      imageChoice,
      audio,
    };
  }

  const chosenSentence = await chooseWordSentence(wordData, options.sentence);
  if (!chosenSentence) {
    console.log(chalk.yellow('Skipped: no example sentence selected'));
    return { rejected: true };
  }

  const selectedMeaning = await chooseMeaning(wordData, options.meaning, {
    manualPrompt: `Enter the intended meaning/gloss for "${wordData.canonical}" (not an example sentence), or press Enter to skip: `,
    editPrompt: 'Enter the intended meaning/gloss (not an example sentence): ',
    allowBlank: true,
  });

  let duplicateInfo = { exactMatches: [], headwordMatches: [] };
  spinner.start('Checking duplicates...');
  try {
    duplicateInfo = await findSentenceWordDuplicates({
      canonical: wordData.canonical,
      meaning: selectedMeaning.russian,
      lexicalType: wordData.lexicalType || 'adjective',
    });
  } catch (err) {
    if (!options.dryRun) {
      throw err;
    }
    console.log(chalk.dim(`Duplicate check skipped in dry run: ${err.message}`));
  } finally {
    spinner.stop();
  }

  if (duplicateInfo.exactMatches.length > 0) {
    console.log(chalk.yellow(`Exact duplicate exists for ${wordData.canonical} (${selectedMeaning.russian})`));
    return { rejected: true };
  }

  spinner.start('Preparing example sentence...');
  const sentenceData = applyChosenSentenceGloss(
    await enrich(chosenSentence.german),
    chosenSentence
  );
  spinner.succeed(`Sentence ready: ${sentenceData.german}`);

  spinner.start('Searching optional image...');
  const imageSearchMeaning = buildSentenceImageMeaning(selectedMeaning, chosenSentence, wordData);
  const imageCandidates = await searchWordImages(wordData, imageSearchMeaning, {
    pageSize: config.wordImagePreviewCount || 6,
    total: config.wordImageSearchResults || 12,
  });
  spinner.stop();

  const imageChoice = imageCandidates.length > 0
    ? await chooseImage(wordData, selectedMeaning, imageCandidates)
    : null;

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

  const audio = await buildWordSentenceAudio(sentenceData.german, spinner);

  return {
    route,
    wordData,
    frequencyInfo,
    selectedMeaning,
    duplicateInfo,
    chosenSentence,
    sentenceData,
    imageChoice,
    similarCards,
    audio,
  };
}

async function finalizePictureWord(prepared, options, spinner) {
  const { wordData, frequencyInfo, selectedMeaning, duplicateInfo, imageChoice, audio } = prepared;

  const confirmation = await confirmWordSelection({
    wordData,
    selectedMeaning,
    cefrLevel: prepared.lexicalCefr?.level || null,
    frequencyInfo,
    duplicateInfo,
    imageChoice,
    audioSource: audio.source,
    audioPath: audio.audioPath,
    theme: options.theme || null,
  });

  if (!confirmation.confirmed) {
    console.log(chalk.yellow('Word dismissed'));
    return false;
  }

  const metadata = {
    ...buildWordMetadata(wordData, selectedMeaning, frequencyInfo),
  };

  const pluralLabel = isNounWord(wordData) ? formatPluralLabel(wordData) : null;
  const nounExample = isNounWord(wordData) ? getPrimaryExampleSentence(wordData) : { german: null, russian: null };
  const extraInfoField = buildWordExtraInfo({
    meaning: selectedMeaning.russian,
    plainMeaning: isNounWord(wordData),
    plural: pluralLabel,
    exampleSentence: nounExample.german || wordData.anchorPhrase,
    exampleSentenceTranslation: nounExample.russian,
    contrast: wordData.opposite,
    personalConnection: confirmation.personalConnection,
    metadata,
  });

  if (options.dryRun) {
    console.log();
    console.log(chalk.bold('Word preview'));
    console.log(`  ${formatWordPreviewSummary(chalk, wordData, selectedMeaning.russian, prepared.lexicalCefr?.level || null)}`);
    if (pluralLabel) {
      console.log(`  ${chalk.cyan('Plural:')} ${pluralLabel}`);
    }
    if (nounExample.german) {
      console.log(`  ${chalk.cyan('Example:')} ${nounExample.german}`);
      if (nounExample.russian) {
        console.log(`  ${chalk.cyan('Example (RU):')} ${nounExample.russian}`);
      }
    }
    if (wordData.anchorPhrase) {
      console.log(`  ${chalk.cyan('Anchor:')} ${wordData.anchorPhrase}`);
    }
    if (wordData.opposite) {
      console.log(`  ${chalk.cyan('Contrast:')} ${wordData.opposite}`);
    }
    console.log(`  ${chalk.cyan('Frequency:')} ${frequencyInfo.bandLabel}${frequencyInfo.rank ? ` (#${frequencyInfo.rank})` : ''}`);
    console.log(`  ${chalk.cyan('Audio:')} ${audio.source}`);
    console.log(`  ${chalk.cyan('Image:')} ${imageChoice ? (imageChoice.source || imageChoice.type || 'image') : 'none'}`);
    console.log(chalk.yellow('\n⚡ DRY RUN: Note previewed'));
    return true;
  }

  let imageFilename = null;
  if (imageChoice) {
    spinner.start('Downloading chosen image...');
    const imagePath = await resolveImageAsset(imageChoice);
    spinner.succeed('Image ready');
    imageFilename = await storeMedia(imagePath);
  }

  spinner.start('Creating Anki note...');
  const audioFilename = await storeAudio(audio.audioPath);
  const pronunciationField = formatPronunciationField(audioFilename, wordData.ipa);

  await createPictureWordNote({
    canonical: wordData.canonical,
    coloredWord: formatWordDisplay(wordData),
    imageFilename,
    pronunciationField,
    extraInfoField,
    gender: isNounWord(wordData) ? wordData.gender : null,
    frequencyBand: frequencyInfo.bandKey,
    lemma: getWordLemma(wordData),
    imageSource: imageChoice?.source || imageChoice?.type || 'none',
    audioSource: audio.source,
    lexicalType: wordData.lexicalType || 'noun',
    theme: options.theme || null,
    deck: options.deck,
    modelName: DEFAULT_WORD_NOTE_TYPE,
  });
  spinner.succeed(`Created ${wordData.canonical}`);

  console.log(chalk.green(`✓ Added ${wordData.canonical} (${selectedMeaning.russian})`));
  return true;
}

async function finalizeSentenceWord(prepared, options, spinner) {
  let current = prepared;
  let autoPlay = true;

  while (true) {
    const confirmation = await confirmSentenceWordSelection({
      wordData: current.wordData,
      selectedMeaning: current.selectedMeaning,
      sentenceData: current.sentenceData,
      chosenSentence: current.chosenSentence,
      duplicateInfo: current.duplicateInfo,
      imageChoice: current.imageChoice,
      audioPath: current.audio.audioPath,
      similarCards: current.similarCards,
      autoPlay,
    });

    if (confirmation.reviewFeedback) {
      current = await rebuildSentenceWordPreview(current, confirmation.reviewFeedback, options, spinner);
      autoPlay = true;
      continue;
    }

    if (!confirmation.confirmed) {
      console.log(chalk.yellow('Word dismissed'));
      return false;
    }

    break;
  }

  const { wordData, selectedMeaning, chosenSentence, sentenceData, imageChoice, audio } = current;

  if (options.dryRun) {
    console.log();
    console.log(chalk.bold('Word sentence preview'));
    console.log(`  ${formatWordPreviewSummary(chalk, wordData, selectedMeaning?.russian, sentenceData.cefr?.level || null)}`);
    console.log(`  ${chalk.cyan('Sentence:')} ${sentenceData.german}`);
    if (sentenceData.ipa) {
      console.log(`  ${chalk.cyan('IPA:')} ${sentenceData.ipa}`);
    }
    if (sentenceData.russian) {
      console.log(`  ${chalk.cyan('Russian:')} ${sentenceData.russian}`);
    }
    if (wordData.opposite) {
      console.log(`  ${chalk.cyan('Contrast:')} ${wordData.opposite}`);
    }
    if (chosenSentence?.focusForm) {
      console.log(`  ${chalk.cyan('Focus form:')} ${chosenSentence.focusForm}`);
    }
    console.log(chalk.yellow('\n⚡ DRY RUN: Word sentence previewed'));
    return true;
  }

  let imageFilename = null;
  if (imageChoice) {
    spinner.start('Downloading chosen image...');
    const imagePath = await resolveImageAsset(imageChoice, 'word_sentence_image');
    spinner.succeed('Image ready');
    imageFilename = await storeMedia(imagePath);
  }

  spinner.start('Creating sentence note...');
  const audioFilename = await storeAudio(audio.audioPath);
  await createNote({
    german: sentenceData.german,
    ipa: sentenceData.ipa,
    russian: sentenceData.russian,
    audioFilename,
    imageFilename,
    frontFooterHtml: buildWordSentenceFrontFooter(wordData),
    cefr: sentenceData.cefr,
    metadata: {
      canonical: wordData.canonical,
      meaning: selectedMeaning.russian || null,
      lemma: getWordLemma(wordData),
      lexicalType: wordData.lexicalType || 'adjective',
    },
    deck: options.deck,
    tags: [
      'mode-word-sentence',
      `word-${wordData.lexicalType || 'adjective'}`,
      `lemma-${toTagSlug(getWordLemma(wordData))}`,
      `canonical-${toTagSlug(wordData.canonical)}`,
      ...(chosenSentence?.focusForm ? [`word-form-${toTagSlug(chosenSentence.focusForm)}`] : []),
    ],
  });

  spinner.succeed(`Created sentence card for ${wordData.canonical}`);
  console.log(chalk.green(`✓ Added word sentence for ${wordData.canonical}`));
  return true;
}

export async function runWordWorkflow(rawInput, options = {}) {
  const spinner = ora();

  try {
    if (!options.skipHeader) {
      showWordHeader(rawInput);
    }
    await ensureWordSetup(options.deck || config.ankiDeck, options.dryRun);
    const prepared = await prepareWord(rawInput, options, spinner);
    if (!prepared || prepared.rejected) {
      return false;
    }
    if (prepared.route === 'sentence-form') {
      return finalizeSentenceWord(prepared, options, spinner);
    }
    return finalizePictureWord(prepared, options, spinner);
  } catch (err) {
    spinner.fail(err.message);
    throw err;
  }
}

export async function processSingleWord(rawInput, options = {}) {
  try {
    return await runWordWorkflow(rawInput, options);
  } catch {
    process.exit(1);
  }
}

export async function processWordBatch(options = {}) {
  try {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.bold('\nEnter German nouns or adjectives (one per line, empty line to finish):\n'));

    const words = await new Promise((resolve) => {
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

    if (words.length === 0) {
      console.log(chalk.yellow('No words entered'));
      return;
    }

    console.log(chalk.bold(`\nProcessing ${words.length} words...\n`));

    let completed = 0;
    for (const word of words) {
      try {
        const added = await runWordWorkflow(word, options);
        if (added) {
          completed++;
        }
      } catch (err) {
        console.log(chalk.red(`Skipped "${word}": ${err.message}`));
      }
    }

    console.log();
    if (options.dryRun) {
      console.log(chalk.yellow(`⚡ DRY RUN: ${completed} word notes previewed`));
    } else {
      console.log(chalk.green(`✓ Added ${completed} word notes`));
    }
  } catch {
    process.exit(1);
  }
}
