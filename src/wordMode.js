import { createInterface } from 'readline';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { config } from './config.js';
import { getWordFrequencyInfo } from './wordFrequency.js';
import { buildWordExtraInfo, formatGenderColoredWord, formatPluralLabel, getArticleNormalizationWarning } from './wordUtils.js';
import { canProceedWithWeakWordCard, enrichWord } from './wordEnricher.js';
import { chooseImage, chooseMeaning, confirmWordSelection } from './wordConfirm.js';
import { resolveImageAsset, resolveWordPronunciation, searchWordImages } from './wordSources.js';
import {
  checkConnection,
  createPictureWordNote,
  ensureDeck,
  findWordDuplicates,
  getNoteTypes,
  storeAudio,
  storeMedia,
} from './anki.js';
import { generateSimpleSpeech } from './tts.js';

const DEFAULT_WORD_NOTE_TYPE = config.wordNoteType || '2. Picture Words';

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

  await ensureDeck(deck || config.ankiDeck);

  return deck;
}

async function buildWordAudio(wordData, spinner) {
  spinner.start('Resolving pronunciation audio...');
  let wiktionaryIpa = null;

  try {
    const pronunciation = await resolveWordPronunciation(wordData);
    if (pronunciation?.ipa) {
      wordData.ipa = pronunciation.ipa;
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
    // Fall back to TTS below.
  }

  const audioPath = join(config.dataDir, `word_tts_${Date.now()}.mp3`);
  await generateSimpleSpeech(wordData.canonical, audioPath, { speed: 0.9 });
  spinner.succeed(wiktionaryIpa
    ? 'Using OpenAI TTS fallback audio (IPA from Wiktionary)'
    : 'Using OpenAI TTS fallback audio');
  return {
    audioPath,
    source: 'OpenAI TTS',
  };
}

async function prepareWord(rawInput, options, spinner) {
  spinner.start('Analyzing noun...');
  const wordData = await enrichWord(rawInput);
  const recoverableWeakCandidate = canProceedWithWeakWordCard(wordData);
  const articleNormalizationWarning = getArticleNormalizationWarning(rawInput, wordData.canonical);

  if (!wordData.shouldCreateWordCard && !recoverableWeakCandidate) {
    spinner.warn(`Rejected: ${wordData.rejectionReason}`);
    return { rejected: true };
  }

  if (!wordData.isImageable && !recoverableWeakCandidate) {
    spinner.warn(`Rejected: ${wordData.imageabilityReason || 'not imageable enough for picture-word cards'}`);
    return { rejected: true };
  }

  if (recoverableWeakCandidate && (!wordData.shouldCreateWordCard || !wordData.isImageable)) {
    const warning = wordData.rejectionReason || wordData.imageabilityReason || 'weak picture candidate';
    console.log(chalk.yellow(`Weak picture candidate: ${warning}. Continuing anyway.`));
  }

  spinner.succeed(`Ready: ${wordData.canonical}`);

  if (articleNormalizationWarning) {
    console.log(chalk.yellow(articleNormalizationWarning));
  }

  const frequencyInfo = getWordFrequencyInfo(wordData.bareNoun);
  const selectedMeaning = await chooseMeaning(wordData, options.meaning);

  let duplicateInfo = { exactMatches: [], headwordMatches: [] };
  spinner.start('Checking duplicates...');
  try {
    duplicateInfo = await findWordDuplicates({
      canonical: wordData.canonical,
      meaning: selectedMeaning.russian,
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

  spinner.start('Searching images...');
  const imageCandidates = await searchWordImages(wordData, selectedMeaning, {
    pageSize: config.wordImagePreviewCount || 6,
    total: config.wordImageSearchResults || 12,
  });
  spinner.stop();

  const imageChoice = await chooseImage(wordData, selectedMeaning, imageCandidates);
  if (!imageChoice) {
    console.log(chalk.yellow('Skipped: no image selected'));
    return { rejected: true };
  }

  const audio = await buildWordAudio(wordData, spinner);

  return {
    wordData,
    frequencyInfo,
    selectedMeaning,
    duplicateInfo,
    imageChoice,
    audio,
  };
}

async function finalizeWord(prepared, options, spinner) {
  const { wordData, frequencyInfo, selectedMeaning, duplicateInfo, imageChoice, audio } = prepared;

  const confirmation = await confirmWordSelection({
    wordData,
    selectedMeaning,
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
    canonical: wordData.canonical,
    meaning: selectedMeaning.russian,
    lemma: frequencyInfo.lemma,
    gender: wordData.gender,
  };

  const pluralLabel = formatPluralLabel(wordData);
  const extraInfoField = buildWordExtraInfo({
    meaning: selectedMeaning.russian,
    plural: pluralLabel,
    personalConnection: confirmation.personalConnection,
    metadata,
  });

  if (options.dryRun) {
    console.log();
    console.log(chalk.bold('Word preview'));
    console.log(`  Word:      ${wordData.canonical}`);
    console.log(`  Meaning:   ${selectedMeaning.russian}`);
    console.log(`  Plural:    ${pluralLabel}`);
    console.log(`  Frequency: ${frequencyInfo.bandLabel}${frequencyInfo.rank ? ` (#${frequencyInfo.rank})` : ''}`);
    console.log(`  Audio:     ${audio.source}`);
    console.log(`  Image:     ${imageChoice.source || imageChoice.type}`);
    console.log(chalk.yellow('\n⚡ DRY RUN: Note previewed'));
    return true;
  }

  spinner.start('Downloading chosen image...');
  const imagePath = await resolveImageAsset(imageChoice);
  spinner.succeed('Image ready');

  spinner.start('Creating Anki note...');
  const imageFilename = await storeMedia(imagePath);
  const audioFilename = await storeAudio(audio.audioPath);
  const pronunciationField = `[sound:${audioFilename}]<br>${wordData.ipa}`;

  await createPictureWordNote({
    canonical: wordData.canonical,
    coloredWord: formatGenderColoredWord(wordData.canonical, wordData.gender),
    imageFilename,
    pronunciationField,
    extraInfoField,
    gender: wordData.gender,
    frequencyBand: frequencyInfo.bandKey,
    lemma: wordData.bareNoun,
    imageSource: imageChoice.source || imageChoice.type,
    audioSource: audio.source,
    theme: options.theme || null,
    deck: options.deck,
    modelName: DEFAULT_WORD_NOTE_TYPE,
  });
  spinner.succeed(`Created ${wordData.canonical}`);

  console.log(chalk.green(`✓ Added ${wordData.canonical} (${selectedMeaning.russian})`));
  return true;
}

async function processWord(rawInput, options = {}) {
  const spinner = ora();

  try {
    showWordHeader(rawInput);
    await ensureWordSetup(options.deck || config.ankiDeck, options.dryRun);
    const prepared = await prepareWord(rawInput, options, spinner);
    if (!prepared || prepared.rejected) {
      return false;
    }
    return finalizeWord(prepared, options, spinner);
  } catch (err) {
    spinner.fail(err.message);
    throw err;
  }
}

export async function processSingleWord(rawInput, options = {}) {
  try {
    return await processWord(rawInput, options);
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

    console.log(chalk.bold('\nEnter German nouns (one per line, empty line to finish):\n'));

    const words = await new Promise((resolve) => {
      const entries = [];
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (trimmed === '') {
          rl.close();
          resolve(entries);
          return;
        }

        entries.push(trimmed);
        console.log(chalk.dim(`  Added #${entries.length}: "${trimmed}"`));
      });
    });

    if (words.length === 0) {
      console.log(chalk.yellow('No nouns entered'));
      return;
    }

    console.log(chalk.bold(`\nProcessing ${words.length} nouns...\n`));

    let completed = 0;
    for (const word of words) {
      try {
        const added = await processWord(word, options);
        if (added) {
          completed++;
        }
      } catch (err) {
        console.log(chalk.red(`Skipped "${word}": ${err.message}`));
      }
    }

    console.log();
    if (options.dryRun) {
      console.log(chalk.yellow(`⚡ DRY RUN: ${completed} noun notes previewed`));
    } else {
      console.log(chalk.green(`✓ Added ${completed} noun notes`));
    }
  } catch {
    process.exit(1);
  }
}
