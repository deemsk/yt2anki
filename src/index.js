#!/usr/bin/env node

import { program } from 'commander';
import { readFile } from 'fs/promises';
import ora from 'ora';
import chalk from 'chalk';

import { downloadAudio, extractVideoId } from './downloader.js';
import { cutClip, parseTimestamp } from './clipper.js';
import { transcribe } from './transcriber.js';
import { enrich } from './enricher.js';
import { checkConnection, ensureDeck, storeAudio, createNote, createNotes, getNoteTypes, getNoteFields, findSimilarCards } from './anki.js';
import { config, CONFIG_PATH_DISPLAY } from './config.js';
import { confirmCard, confirmCardSet } from './confirm.js';
import { analyzeSentence, selectCards } from './analyzer.js';
import { generateCards } from './cardTypes.js';
import { processSingleGrammar } from './grammarMode.js';
import { processSingleWord, processWordBatch } from './wordMode.js';
import { processSingleVerb, processVerbBatch } from './verbMode.js';

/**
 * Session state for tracking accepted units and pattern usage.
 * Used to throttle pattern cards and prevent fatigue.
 */
class SessionState {
  constructor() {
    this.acceptedUnitsSinceLastPattern = 0;
    this.recentPatternFamilies = [];
  }

  /** Record that a unit was accepted (passed gate and cards created) */
  recordAcceptedUnit() {
    this.acceptedUnitsSinceLastPattern++;
  }

  /** Record that a pattern card was used */
  recordPatternUsed(family) {
    this.recentPatternFamilies.push(family);
    // Keep only last 10 families
    if (this.recentPatternFamilies.length > 10) {
      this.recentPatternFamilies.shift();
    }
    this.acceptedUnitsSinceLastPattern = 0;
  }

  /** Check if a pattern card should be allowed */
  shouldAllowPattern(family, strength) {
    if (strength !== 'strong') return false;
    if (this.acceptedUnitsSinceLastPattern < 6) return false;
    if (this.recentPatternFamilies.includes(family)) return false;
    return true;
  }
}

// Global session state (reset each CLI invocation)
const sessionState = new SessionState();

program
  .name('yt2anki')
  .description('Create Anki cards from YouTube videos for German learning')
  .version('1.0.0');

program
  .command('process')
  .description('Process markers file and create Anki cards')
  .argument('<file>', 'Path to markers JSON file')
  .option('-d, --deck <name>', 'Anki deck name', config.ankiDeck)
  .option('-n, --dry-run', 'Preview generated content without creating Anki cards')
  .action(processMarkers);

program
  .command('add')
  .description('Add single card from YouTube URL with timestamps')
  .argument('<url>', 'YouTube URL')
  .requiredOption('-s, --start <time>', 'Start timestamp (e.g., 1:23 or 83)')
  .requiredOption('-e, --end <time>', 'End timestamp')
  .option('-d, --deck <name>', 'Anki deck name', config.ankiDeck)
  .option('-n, --dry-run', 'Preview generated content without creating Anki card')
  .action(addSingleCard);

program
  .command('check')
  .description('Quick check of installed tools')
  .action(checkSetup);

program
  .command('test')
  .description('Test all integrations (tools, APIs, Anki) without making changes')
  .option('-d, --deck <name>', 'Anki deck name to verify', config.ankiDeck)
  .action(testIntegrations);

program
  .command('init')
  .description('Create config file at ~/.yt2anki.json')
  .action(initConfig);

program
  .command('config')
  .description('Show current configuration')
  .action(showConfig);

program
  .command('clip')
  .description('Process clips from clipboard (copied from browser)')
  .option('-n, --dry-run', 'Preview cards without creating them')
  .option('-d, --deck <name>', 'Anki deck name', config.ankiDeck)
  .action(processClipboard);

program
  .command('text')
  .description('Create cards from text input (one phrase per line)')
  .option('-n, --dry-run', 'Preview cards without creating them')
  .option('-d, --deck <name>', 'Anki deck name', config.ankiDeck)
  .action(processTextBatch);

program
  .command('word')
  .description('Create a Fluent Forever noun/adjective note with picture or sentence fallback')
  .argument('<word>', 'German noun/adjective, with or without article when applicable')
  .option('-m, --meaning <gloss>', 'Preferred meaning/gloss')
  .option('-s, --sentence <text>', 'Preferred example sentence for sentence-form adjectives')
  .option('-t, --theme <name>', 'Optional theme tag')
  .option('-n, --dry-run', 'Preview the word note without creating it')
  .option('-d, --deck <name>', 'Anki deck name', config.ankiDeck)
  .action(processSingleWord);

program
  .command('words')
  .description('Create Fluent Forever noun/adjective notes from text input (one noun/adjective per line)')
  .option('-t, --theme <name>', 'Optional theme tag for all words in the batch')
  .option('-n, --dry-run', 'Preview word notes without creating them')
  .option('-d, --deck <name>', 'Anki deck name', config.ankiDeck)
  .action(processWordBatch);

program
  .command('grammar')
  .description('Create grammar cloze notes from a supported grammar family')
  .argument('<family>', 'Grammar family, for example: possessive')
  .argument('<lemma>', 'Base lemma or one inflected form from that family')
  .option('-n, --dry-run', 'Preview grammar notes without creating them')
  .option('-d, --deck <name>', 'Anki deck name', config.ankiDeck)
  .action(processSingleGrammar);

program
  .command('verb')
  .description('Create a Fluent Forever verb note')
  .argument('<verb>', 'German verb or verb form')
  .option('-m, --meaning <gloss>', 'Preferred meaning/gloss')
  .option('-s, --sentence <text>', 'Preferred example sentence')
  .option('--mode <mode>', 'Force mode: picture or sentence')
  .option('-n, --dry-run', 'Preview the verb note without creating it')
  .option('-d, --deck <name>', 'Anki deck name', config.ankiDeck)
  .action(processSingleVerb);

program
  .command('verbs')
  .description('Create Fluent Forever verb notes from text input (one verb per line)')
  .option('--mode <mode>', 'Force mode: picture or sentence')
  .option('-n, --dry-run', 'Preview verb notes without creating them')
  .option('-d, --deck <name>', 'Anki deck name', config.ankiDeck)
  .action(processVerbBatch);

program.parse();

async function processMarkers(file, options) {
  const spinner = ora();
  const dryRun = options.dryRun;

  try {
    // Read markers file
    spinner.start('Reading markers file...');
    const content = await readFile(file, 'utf-8');
    const markers = JSON.parse(content);
    spinner.succeed(`Found ${markers.clips.length} clips from ${markers.url}`);

    if (dryRun) {
      console.log(chalk.yellow('\n⚡ DRY RUN MODE - No cards will be created\n'));
    } else {
      // Check Anki
      spinner.start('Checking AnkiConnect...');
      if (!await checkConnection()) {
        spinner.fail('AnkiConnect not available. Make sure Anki is running with AnkiConnect add-on.');
        process.exit(1);
      }
      await ensureDeck(options.deck);
      spinner.succeed('AnkiConnect ready');
    }

    // Download audio
    spinner.start('Downloading audio...');
    const audioPath = await downloadAudio(markers.url);
    spinner.succeed(`Downloaded: ${audioPath}`);

    // Fetch subtitles for CC verification
    const { fetchSubtitles, getSubtitleContext } = await import('./subtitles.js');
    spinner.start('Fetching subtitles for context...');
    const subtitleEntries = await fetchSubtitles(markers.url);
    if (subtitleEntries) {
      spinner.succeed(`Subtitles fetched (${subtitleEntries.length} entries)`);
    } else {
      spinner.warn('No German subtitles available');
    }

    const results = [];

    // Process each clip
    for (let i = 0; i < markers.clips.length; i++) {
      const clip = markers.clips[i];
      const progress = `[${i + 1}/${markers.clips.length}]`;

      spinner.start(`${progress} Cutting clip...`);
      const { wavPath, aacPath } = await cutClip(audioPath, clip.start, clip.end, i + 1);
      spinner.succeed(`${progress} Cut clip: ${clip.start} - ${clip.end}`);

      const ccHint = getSubtitleContext(subtitleEntries, clip.start, clip.end);
      if (ccHint) {
        console.log(chalk.dim(`   CC: "${ccHint}"`));
      }

      spinner.start(`${progress} Transcribing...`);
      const rawGerman = await transcribe(wavPath, ccHint);
      spinner.succeed(`${progress} Transcribed: "${rawGerman}"`);

      spinner.start(`${progress} Getting IPA and translation...`);
      const subtitleContext = subtitleEntries ? subtitleEntries.map(e => e.text).join(' ') : null;
      const { german, ipa, russian, cefr } = await enrich(rawGerman, subtitleContext, ccHint);
      spinner.succeed(`${progress} Enriched`);

      if (dryRun) {
        results.push({ german, ipa, russian, cefr, audioFile: aacPath });
        spinner.succeed(`${progress} Card preview ready`);
      } else {
        spinner.start(`${progress} Creating Anki card...`);
        const audioFilename = await storeAudio(aacPath);
        await createNote({ german, ipa, russian, audioFilename, cefr, deck: options.deck });
        spinner.succeed(`${progress} Card created!`);
      }

      console.log(chalk.dim(`   German:  ${german}${rawGerman !== german ? ` (was: ${rawGerman})` : ''}`));
      console.log(chalk.dim(`   IPA:     ${ipa}`));
      console.log(chalk.dim(`   Russian: ${russian}`));
      console.log();
    }

    if (dryRun) {
      console.log(chalk.yellow.bold(`\n⚡ DRY RUN: ${markers.clips.length} cards previewed (not created)`));
      console.log(chalk.dim('Run without --dry-run to create cards in Anki'));
    } else {
      console.log(chalk.green.bold(`\n✓ Created ${markers.clips.length} cards in deck "${options.deck}"`));
    }
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }
}

async function addSingleCard(url, options) {
  const spinner = ora();
  const dryRun = options.dryRun;

  try {
    if (dryRun) {
      console.log(chalk.yellow('\n⚡ DRY RUN MODE - No card will be created\n'));
    } else {
      // Check Anki
      spinner.start('Checking AnkiConnect...');
      if (!await checkConnection()) {
        spinner.fail('AnkiConnect not available. Make sure Anki is running with AnkiConnect add-on.');
        process.exit(1);
      }
      await ensureDeck(options.deck);
      spinner.succeed('AnkiConnect ready');
    }

    // Download
    spinner.start('Downloading audio...');
    const audioPath = await downloadAudio(url);
    spinner.succeed(`Downloaded: ${audioPath}`);

    // Cut
    spinner.start('Cutting clip...');
    const { wavPath, aacPath } = await cutClip(audioPath, options.start, options.end, 1);
    spinner.succeed(`Cut: ${options.start} - ${options.end}`);

    // Transcribe
    spinner.start('Transcribing with Whisper...');
    const rawGerman = await transcribe(wavPath);
    spinner.succeed(`Transcribed: "${rawGerman}"`);

    // Enrich
    spinner.start('Getting IPA and Russian translation...');
    const { german, ipa, russian, cefr } = await enrich(rawGerman);
    spinner.succeed('Enriched');

    if (dryRun) {
      console.log();
      console.log(chalk.yellow.bold('⚡ DRY RUN - Card preview:'));
      console.log(`  German:  ${german}${rawGerman !== german ? ` (was: ${rawGerman})` : ''}`);
      console.log(`  IPA:     ${ipa}`);
      console.log(`  Russian: ${russian}`);
      console.log(`  CEFR:    ${cefr.level}`);
      console.log(`  Audio:   ${aacPath}`);
      console.log(`  Deck:    ${options.deck} (not created)`);
      console.log();
      console.log(chalk.dim('Run without --dry-run to create card in Anki'));
    } else {
      // Create card
      spinner.start('Creating Anki card...');
      const audioFilename = await storeAudio(aacPath);
      await createNote({ german, ipa, russian, audioFilename, cefr, deck: options.deck });
      spinner.succeed('Card created!');

      console.log();
      console.log(chalk.bold('Card details:'));
      console.log(`  German:  ${german}`);
      console.log(`  IPA:     ${ipa}`);
      console.log(`  Russian: ${russian}`);
      console.log(`  Audio:   ${audioFilename}`);
      console.log(`  Deck:    ${options.deck}`);
    }
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }
}

async function checkSetup() {
  console.log(chalk.bold('\nChecking yt2anki setup...\n'));

  // Check tools
  const tools = ['yt-dlp', 'ffmpeg', 'whisper-cli'];
  for (const tool of tools) {
    try {
      const { execSync } = await import('child_process');
      execSync(`which ${tool}`, { stdio: 'pipe' });
      console.log(chalk.green(`✓ ${tool} installed`));
    } catch {
      console.log(chalk.red(`✗ ${tool} not found`));
    }
  }

  // Check OpenAI using the same resolution logic as runtime code:
  // prefer config, then fall back to the environment variable.
  if (config.openaiApiKey || process.env.OPENAI_API_KEY) {
    console.log(chalk.green('✓ OpenAI API key configured'));
  } else {
    console.log(chalk.red(`✗ OpenAI API key not set (add to ${CONFIG_PATH_DISPLAY} or set OPENAI_API_KEY)`));
  }

  // Check AnkiConnect
  console.log();
  if (await checkConnection()) {
    console.log(chalk.green('✓ AnkiConnect connected'));

    const noteTypes = await getNoteTypes();
    console.log(chalk.dim(`  Note types: ${noteTypes.slice(0, 5).join(', ')}...`));

    if (noteTypes.includes(config.ankiNoteType)) {
      console.log(chalk.green(`✓ Sentence note type "${config.ankiNoteType}" exists`));
      const fields = await getNoteFields(config.ankiNoteType);
      console.log(chalk.dim(`  Fields: ${fields.join(', ')}`));
    } else {
      console.log(chalk.yellow(`⚠ Sentence note type "${config.ankiNoteType}" not found`));
      console.log(chalk.dim(`  Available: ${noteTypes.join(', ')}`));
    }

    const wordNoteType = config.wordNoteType || '2. Picture Words';
    if (noteTypes.includes(wordNoteType)) {
      console.log(chalk.green(`✓ Word note type "${wordNoteType}" exists`));
      const fields = await getNoteFields(wordNoteType);
      console.log(chalk.dim(`  Word fields: ${fields.join(', ')}`));
    } else {
      console.log(chalk.yellow(`⚠ Word note type "${wordNoteType}" not found`));
    }

    const grammarNoteType = config.grammarNoteType || 'Cloze';
    if (noteTypes.includes(grammarNoteType)) {
      console.log(chalk.green(`✓ Grammar note type "${grammarNoteType}" exists`));
      const fields = await getNoteFields(grammarNoteType);
      console.log(chalk.dim(`  Grammar fields: ${fields.join(', ')}`));
    } else {
      console.log(chalk.yellow(`⚠ Grammar note type "${grammarNoteType}" not found`));
    }
  } else {
    console.log(chalk.red('✗ AnkiConnect not available'));
    console.log(chalk.dim('  Make sure Anki is running with AnkiConnect add-on (code: 2055492159)'));
  }

  console.log();
  console.log(chalk.dim('Run "yt2anki test" for full integration testing'));
  console.log();
}

async function testIntegrations(options) {
  console.log(chalk.bold('\n🧪 Testing yt2anki integrations...\n'));

  const { execSync, spawn } = await import('child_process');
  const { resolveSecret } = await import('./secrets.js');
  const results = { passed: 0, warned: 0, failed: 0 };

  function pass(msg) {
    console.log(chalk.green(`✓ ${msg}`));
    results.passed++;
  }

  function warn(msg, hint) {
    console.log(chalk.yellow(`⚠ ${msg}`));
    if (hint) console.log(chalk.dim(`  ${hint}`));
    results.warned++;
  }

  function fail(msg, hint) {
    console.log(chalk.red(`✗ ${msg}`));
    if (hint) console.log(chalk.dim(`  ${hint}`));
    results.failed++;
  }

  // 1. Test yt-dlp
  console.log(chalk.bold.blue('\n[1/7] yt-dlp'));
  try {
    const version = execSync('yt-dlp --version', { stdio: 'pipe' }).toString().trim();
    pass(`yt-dlp installed (${version})`);

    // Test that it can fetch video info (using a known short video)
    try {
      execSync('yt-dlp --simulate --print title "https://www.youtube.com/watch?v=jNQXAC9IVRw"', {
        stdio: 'pipe',
        timeout: 15000,
      });
      pass('yt-dlp can access YouTube');
    } catch (err) {
      fail('yt-dlp cannot access YouTube', 'Check your internet connection');
    }
  } catch {
    fail('yt-dlp not found', 'Install with: brew install yt-dlp');
  }

  // 2. Test ffmpeg
  console.log(chalk.bold.blue('\n[2/7] ffmpeg'));
  try {
    const version = execSync('ffmpeg -version', { stdio: 'pipe' }).toString().split('\n')[0];
    pass(`ffmpeg installed (${version.replace('ffmpeg version ', '').split(' ')[0]})`);

    // Test AAC encoding support
    const codecs = execSync('ffmpeg -codecs 2>/dev/null | grep aac', { stdio: 'pipe' }).toString();
    if (codecs.includes('aac')) {
      pass('ffmpeg has AAC codec support');
    } else {
      fail('ffmpeg missing AAC codec', 'Reinstall ffmpeg with: brew reinstall ffmpeg');
    }
  } catch {
    fail('ffmpeg not found', 'Install with: brew install ffmpeg');
  }

  // 3. Test whisper-cli
  console.log(chalk.bold.blue('\n[3/7] whisper-cli'));
  try {
    execSync('which whisper-cli', { stdio: 'pipe' });
    pass('whisper-cli installed');

    // Check if model exists
    const { findModelPath } = await import('./transcriber.js');
    const modelPath = findModelPath();
    if (modelPath) {
      pass(`Whisper ${config.whisperModel} model found`);
      console.log(chalk.dim(`  Path: ${modelPath}`));
    } else {
      fail(`Whisper ${config.whisperModel} model not found`, `Download with: curl -L -o /opt/homebrew/share/whisper-cpp/ggml-${config.whisperModel}.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${config.whisperModel}.bin`);
    }
  } catch {
    fail('whisper-cli not found', 'Install with: brew install whisper-cpp');
  }

  // 4. Test OpenAI API
  console.log(chalk.bold.blue('\n[4/7] OpenAI API'));
  const rawOpenAiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!rawOpenAiKey) {
    fail('OpenAI API key not set', `Add to ${CONFIG_PATH_DISPLAY} or set OPENAI_API_KEY env var`);
  } else {
    pass('OpenAI API key found');

    try {
      const apiKey = await resolveSecret(rawOpenAiKey);
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey });

      // Make minimal API call to verify key works
      const response = await openai.chat.completions.create({
        model: config.openaiModel,
        messages: [{ role: 'user', content: 'Reply with just: OK' }],
        max_tokens: 5,
      });

      if (response.choices[0].message.content) {
        pass(`OpenAI API connected (model: ${config.openaiModel})`);
      }
    } catch (err) {
      fail(`OpenAI API error: ${err.message}`, 'Check your API key and billing status');
    }
  }

  // 5. Test AnkiConnect
  console.log(chalk.bold.blue('\n[5/7] AnkiConnect'));
  if (await checkConnection()) {
    pass('AnkiConnect is running');

    // Check deck
    try {
      const decks = await ankiConnectRequest('deckNames');
      if (decks.includes(options.deck)) {
        pass(`Deck "${options.deck}" exists`);
      } else {
        console.log(chalk.yellow(`⚠ Deck "${options.deck}" not found (will be created on first use)`));
        console.log(chalk.dim(`  Existing decks: ${decks.slice(0, 5).join(', ')}${decks.length > 5 ? '...' : ''}`));
      }
    } catch {
      // Fallback: just check note type
    }

    // Check note type
    const noteTypes = await getNoteTypes();
    if (noteTypes.includes(config.ankiNoteType)) {
      pass(`Sentence note type "${config.ankiNoteType}" exists`);

      const fields = await getNoteFields(config.ankiNoteType);
      if (fields.includes('Front') && fields.includes('Back')) {
        pass('Sentence note type has required fields (Front, Back)');
      } else {
        warn('Note type missing Front/Back fields', `Found fields: ${fields.join(', ')}`);
      }
    } else {
      warn(`Note type "${config.ankiNoteType}" not found`);
      console.log(chalk.dim(`  Available: ${noteTypes.join(', ')}`));
    }

    const wordNoteType = config.wordNoteType || '2. Picture Words';
    if (noteTypes.includes(wordNoteType)) {
      pass(`Word note type "${wordNoteType}" exists`);
      const wordFields = await getNoteFields(wordNoteType);
      if (wordFields.includes('Word') && wordFields.includes('Picture')) {
        pass('Word note type has required fields (Word, Picture)');
      } else {
        warn('Word note type missing Word/Picture fields', `Found fields: ${wordFields.join(', ')}`);
      }
    } else {
      warn(`Word note type "${wordNoteType}" not found`);
    }

    const grammarNoteType = config.grammarNoteType || 'Cloze';
    if (noteTypes.includes(grammarNoteType)) {
      pass(`Grammar note type "${grammarNoteType}" exists`);
      const grammarFields = await getNoteFields(grammarNoteType);
      if (grammarFields.includes('Text') && (grammarFields.includes('Back Extra') || grammarFields.includes('Extra'))) {
        pass('Grammar note type has required fields (Text, Back Extra/Extra)');
      } else {
        warn('Grammar note type missing Text or Back Extra/Extra', `Found fields: ${grammarFields.join(', ')}`);
      }
    } else {
      warn(`Grammar note type "${grammarNoteType}" not found`);
    }
  } else {
    warn('AnkiConnect not available (required only for non-dry-run)');
    console.log(chalk.dim('  1. Open Anki'));
    console.log(chalk.dim('  2. Install add-on: Tools → Add-ons → Get Add-ons → Code: 2055492159'));
    console.log(chalk.dim('  3. Restart Anki'));
  }

  // 6. Test Brave Search API
  console.log(chalk.bold.blue('\n[6/7] Brave Search API'));
  const rawBraveKey = config.braveApiKey || process.env.BRAVE_SEARCH_API_KEY;
  if (!rawBraveKey) {
    console.log(chalk.dim('  ⚠ Brave API key not set (optional — used for image search in word mode)'));
    console.log(chalk.dim(`  Add braveApiKey to ${CONFIG_PATH_DISPLAY} or set BRAVE_SEARCH_API_KEY`));
  } else {
    pass('Brave API key found');

    try {
      const apiKey = await resolveSecret(rawBraveKey);
      const url = new URL('https://api.search.brave.com/res/v1/images/search');
      url.searchParams.set('q', 'Hund');
      url.searchParams.set('count', '1');
      const response = await fetch(url, {
        headers: { 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey },
      });
      if (response.ok) {
        pass('Brave Search API connected');
      } else {
        fail(`Brave Search API error: HTTP ${response.status}`, 'Check your API key at https://api.search.brave.com/');
      }
    } catch (err) {
      fail(`Brave Search API error: ${err.message}`);
    }
  }

  // 7. Test Google TTS
  console.log(chalk.bold.blue('\n[7/7] Google TTS'));
  try {
    const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
    let clientOptions = {};
    const rawGoogleKey = config.googleApiKey;
    if (rawGoogleKey) {
      const credentialsJson = await resolveSecret(rawGoogleKey);
      clientOptions = { credentials: JSON.parse(credentialsJson) };
    } else {
      const keyFile = config.googleTtsKeyFile || process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (keyFile) clientOptions = { keyFilename: keyFile };
    }
    const ttsClient = new TextToSpeechClient(clientOptions);

    const [response] = await ttsClient.synthesizeSpeech({
      input: { ssml: '<speak><s>Test</s></speak>' },
      voice: { languageCode: 'de-DE', name: 'de-DE-Neural2-B' },
      audioConfig: { audioEncoding: 'MP3' },
    });

    if (response.audioContent?.length > 0) {
      pass('Google TTS connected (de-DE-Neural2-B)');
    } else {
      fail('Google TTS returned empty audio');
    }
  } catch (err) {
    if (err.message?.includes('Could not load the default credentials') || err.code === 16) {
      fail('Google TTS credentials not found', 'Run: gcloud auth application-default login');
    } else if (err.code === 7) {
      fail('Google TTS permission denied', 'Run: gcloud auth application-default set-quota-project YOUR_PROJECT_ID');
    } else {
      fail(`Google TTS error: ${err.message}`);
    }
  }

  // Summary
  console.log(chalk.bold('\n' + '─'.repeat(50)));
  if (results.failed === 0 && results.warned === 0) {
    console.log(chalk.green.bold(`\n✓ All ${results.passed} tests passed! Ready to use.\n`));
  } else if (results.failed === 0) {
    console.log(chalk.green(`\n✓ ${results.passed} passed`) + chalk.yellow(`, ${results.warned} warned`));
    console.log(chalk.dim('Warnings are non-blocking — dry-run mode works without Anki.\n'));
  } else {
    console.log(chalk.yellow(`\n${results.passed} passed, ${results.warned} warned, ${results.failed} failed`));
    console.log(chalk.dim('Fix the issues above before using yt2anki\n'));
    process.exit(1);
  }
}

async function ankiConnectRequest(action, params = {}) {
  const response = await fetch(config.ankiConnectUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, version: 6, params }),
  });
  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result.result;
}

async function initConfig() {
  const { writeFile, access } = await import('fs/promises');
  const { homedir } = await import('os');
  const { join } = await import('path');

  const configPath = join(homedir(), '.yt2anki.json');

  // Check if already exists
  try {
    await access(configPath);
    console.log(chalk.yellow(`\nConfig file already exists: ${configPath}`));
    console.log(chalk.dim('Edit it manually or delete to recreate.\n'));
    return;
  } catch {
    // File doesn't exist, create it
  }

  const defaultConfig = {
    openaiApiKey: '',
    ankiDeck: 'German::YouTube',
    ankiNoteType: 'Basic (optional reversed card)',
    wordNoteType: '2. Picture Words',
    grammarNoteType: 'Cloze',
    openaiModel: 'gpt-4o-mini',
    braveApiKey: '',
    whisperModel: 'base',
  };

  await writeFile(configPath, JSON.stringify(defaultConfig, null, 2) + '\n');

  console.log(chalk.green(`\n✓ Created config file: ${configPath}\n`));
  console.log('Edit it to add your settings:');
  console.log(chalk.cyan(`  open ${configPath}\n`));
  console.log('Required:');
  console.log(chalk.dim('  openaiApiKey  - Your OpenAI API key (from platform.openai.com)\n'));
  console.log('Optional:');
  console.log(chalk.dim('  ankiDeck      - Target Anki deck'));
  console.log(chalk.dim('  ankiNoteType  - Sentence note type to use'));
  console.log(chalk.dim('  wordNoteType  - Word note type to use (default: 2. Picture Words)'));
  console.log(chalk.dim('  grammarNoteType - Grammar cloze note type to use (default: Cloze)'));
  console.log(chalk.dim('  openaiModel   - OpenAI model (default: gpt-4o-mini)'));
  console.log(chalk.dim('  braveApiKey   - Brave Search API key for image search (optional)'));
  console.log(chalk.dim('  whisperModel  - Whisper model size (default: base)'));
  console.log(chalk.dim('  dataDir       - Cache folder for audio (default: system temp)\n'));
}

async function showConfig() {
  const { existsSync } = await import('fs');

  console.log(chalk.bold('\nCurrent Configuration\n'));
  console.log(chalk.dim(`Config file: ${CONFIG_PATH_DISPLAY}`));
  console.log(chalk.dim(`Exists: ${existsSync(CONFIG_PATH_DISPLAY) ? 'yes' : 'no'}\n`));

  const displayConfig = { ...config };
  // Mask API key
  if (displayConfig.openaiApiKey) {
    const k = displayConfig.openaiApiKey;
    displayConfig.openaiApiKey = k.startsWith('op://') ? k : k.slice(0, 7) + '...' + k.slice(-4);
  }
  if (displayConfig.braveApiKey) {
    const k = displayConfig.braveApiKey;
    displayConfig.braveApiKey = k.startsWith('op://') ? k : k.slice(0, 7) + '...' + k.slice(-4);
  }

  for (const [key, value] of Object.entries(displayConfig)) {
    console.log(`  ${chalk.cyan(key)}: ${value || chalk.dim('(not set)')}`);
  }
  console.log();
}

async function processClipboard(options) {
  const { execSync } = await import('child_process');
  const spinner = ora();
  const dryRun = options.dryRun;

  try {
    // Read from clipboard using pbpaste
    spinner.start('Reading from clipboard...');
    const clipboardData = execSync('pbpaste', { encoding: 'utf-8' });
    const data = JSON.parse(clipboardData);

    // Detect mode: text selection or video clips
    if (data.type === 'text') {
      await processTextMode(data, options, spinner, dryRun);
    } else if (data.url && data.clips) {
      await processVideoMode(data, options, spinner, dryRun);
    } else {
      throw new Error('Invalid clipboard data. Use yt2anki bookmarklet first.');
    }
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }
}

async function processTextMode(data, options, spinner, dryRun) {
  const { generateSpeech } = await import('./tts.js');
  const { join } = await import('path');

  spinner.succeed(`Text mode: "${data.german.slice(0, 50)}${data.german.length > 50 ? '...' : ''}"`);

  if (dryRun) {
    console.log(chalk.yellow('\n⚡ DRY RUN MODE - No cards will be created\n'));
  } else {
    spinner.start('Checking AnkiConnect...');
    if (!await checkConnection()) {
      spinner.fail('AnkiConnect not available. Make sure Anki is running.');
      process.exit(1);
    }
    await ensureDeck(options.deck);
    spinner.succeed('AnkiConnect ready');
  }

  spinner.start('Getting IPA and translation...');
  const { german, ipa, russian, cefr } = await enrich(data.german);
  spinner.succeed('Enriched');

  if (data.german !== german) {
    console.log(chalk.dim(`   (corrected from: "${data.german}")`));
  }

  // Analyze sentence for card types
  spinner.start('Analyzing for card types...');
  const enrichedData = { german, ipa, russian, cefr };
  const analysis = await analyzeSentence(enrichedData, sessionState);
  spinner.succeed('Analysis complete');

  // Select cards based on analysis
  const selection = selectCards(analysis, sessionState);

  // Handle rejection
  if (selection.rejected) {
    console.log(chalk.yellow(`\nSentence rejected: ${selection.reason}`));
    return;
  }

  // Handle split suggestion
  if (selection.needsSplit) {
    console.log(chalk.yellow('\nSentence should be split:'));
    selection.splits.forEach((part, i) => {
      console.log(chalk.dim(`  ${i + 1}. ${part}`));
    });
    console.log(chalk.dim('\nPlease process each part separately.'));
    return;
  }

  // Generate audio
  const timestamp = Date.now();
  const sourceId = `${timestamp}`;
  const audioPath = join(config.dataDir, `tts_${timestamp}.mp3`);

  spinner.start('Generating voice-over...');
  await generateSpeech(german, audioPath);
  spinner.succeed('Voice-over generated');

  // Generate cards
  const cards = generateCards(enrichedData, selection.cards, sourceId);

  if (dryRun) {
    console.log();
    console.log(chalk.bold(`Card set (${cards.length} cards):`));
    cards.forEach((card, i) => {
      console.log(chalk.dim(`  ${i + 1}. ${card.label}: ${card.reason}`));
    });
    console.log(chalk.yellow.bold('\n⚡ DRY RUN: Cards previewed'));
    return;
  }

  // Check for similar cards
  spinner.start('Checking for similar cards...');
  const similarCards = await findSimilarCards(german);
  spinner.stop();

  // Interactive confirmation (with card set preview)
  const result = await confirmCardSet(cards, enrichedData, chalk, similarCards, audioPath);

  if (result.dismissed) {
    console.log(chalk.yellow('Cards dismissed'));
    return;
  }

  spinner.start(`Creating ${result.cards.length} Anki cards...`);
  const audioFilename = await storeAudio(audioPath);
  const noteIds = await createNotes(result.cards, audioFilename, {
    sourceId,
    cefr,
    deck: options.deck,
  });
  spinner.succeed(`Created ${noteIds.length} cards!`);

  // Update session state
  sessionState.recordAcceptedUnit();
  const patternCard = result.cards.find(c => c.type === 'pattern');
  if (patternCard) {
    sessionState.recordPatternUsed(patternCard.reason);
  }

  console.log(chalk.green.bold(`\n✓ Created ${noteIds.length} cards in "${options.deck}"`));
}

async function processVideoMode(markers, options, spinner, dryRun) {
  spinner.succeed(`Video mode: ${markers.clips.length} clips from ${markers.url}`);

  if (dryRun) {
    console.log(chalk.yellow('\n⚡ DRY RUN MODE - No cards will be created\n'));
  } else {
    spinner.start('Checking AnkiConnect...');
    if (!await checkConnection()) {
      spinner.fail('AnkiConnect not available. Make sure Anki is running.');
      process.exit(1);
    }
    await ensureDeck(options.deck);
    spinner.succeed('AnkiConnect ready');
  }

  spinner.start('Downloading audio...');
  const audioPath = await downloadAudio(markers.url);
  spinner.succeed(`Downloaded: ${audioPath}`);

  // Fetch subtitles for context
  const { fetchSubtitles, getSubtitleContext } = await import('./subtitles.js');
  spinner.start('Fetching subtitles for context...');
  const subtitleEntries = await fetchSubtitles(markers.url);
  if (subtitleEntries) {
    spinner.succeed(`Subtitles fetched (${subtitleEntries.length} entries)`);
  } else {
    spinner.warn('No German subtitles available');
  }

  let totalCardsCreated = 0;
  let clipsProcessed = 0;

  for (let i = 0; i < markers.clips.length; i++) {
    const clip = markers.clips[i];
    const progress = `[${i + 1}/${markers.clips.length}]`;

    spinner.start(`${progress} Cutting clip...`);
    const { wavPath, aacPath } = await cutClip(audioPath, clip.start, clip.end, i + 1);
    spinner.succeed(`${progress} Cut: ${clip.start.toFixed(1)}s - ${clip.end.toFixed(1)}s`);

    const ccHint = getSubtitleContext(subtitleEntries, clip.start, clip.end);
    if (ccHint) {
      console.log(chalk.dim(`   CC: "${ccHint}"`));
    }

    spinner.start(`${progress} Transcribing...`);
    const rawGerman = await transcribe(wavPath, ccHint);
    spinner.succeed(`${progress} "${rawGerman}"`);

    spinner.start(`${progress} Getting IPA and translation...`);
    const subtitleContext = subtitleEntries ? subtitleEntries.map(e => e.text).join(' ') : null;
    const { german, ipa, russian, cefr } = await enrich(rawGerman, subtitleContext, ccHint);
    spinner.succeed(`${progress} Enriched`);

    if (rawGerman !== german) {
      console.log(chalk.dim(`   (corrected from: "${rawGerman}")`));
    }

    // Analyze sentence for card types
    spinner.start(`${progress} Analyzing...`);
    const enrichedData = { german, ipa, russian, cefr };
    const analysis = await analyzeSentence(enrichedData, sessionState);
    const selection = selectCards(analysis, sessionState);
    spinner.succeed(`${progress} Analysis complete`);

    // Handle rejection
    if (selection.rejected) {
      console.log(chalk.yellow(`${progress} Rejected: ${selection.reason}\n`));
      continue;
    }

    // Handle split suggestion
    if (selection.needsSplit) {
      console.log(chalk.yellow(`${progress} Should be split:`));
      selection.splits.forEach((part, idx) => {
        console.log(chalk.dim(`      ${idx + 1}. ${part}`));
      });
      console.log();
      continue;
    }

    // Generate cards
    const timestamp = Date.now();
    const sourceId = `${timestamp}`;
    const cards = generateCards(enrichedData, selection.cards, sourceId);

    if (dryRun) {
      console.log(chalk.dim(`   ${cards.length} cards: ${cards.map(c => c.label).join(', ')}`));
      console.log();
      totalCardsCreated += cards.length;
      clipsProcessed++;
      continue;
    }

    // Check for similar cards
    spinner.start(`${progress} Checking for similar cards...`);
    const similarCards = await findSimilarCards(german);
    spinner.stop();

    // Interactive confirmation (with card set preview)
    const result = await confirmCardSet(cards, enrichedData, chalk, similarCards, aacPath);

    if (result.dismissed) {
      console.log(chalk.yellow(`${progress} Cards dismissed\n`));
      continue;
    }

    spinner.start(`${progress} Creating ${result.cards.length} Anki cards...`);
    const audioFilename = await storeAudio(aacPath);
    const noteIds = await createNotes(result.cards, audioFilename, {
      sourceId,
      cefr,
      deck: options.deck,
    });
    spinner.succeed(`${progress} Created ${noteIds.length} cards!\n`);

    // Update session state
    sessionState.recordAcceptedUnit();
    const patternCard = result.cards.find(c => c.type === 'pattern');
    if (patternCard) {
      sessionState.recordPatternUsed(patternCard.reason);
    }

    totalCardsCreated += noteIds.length;
    clipsProcessed++;
  }

  if (dryRun) {
    console.log(chalk.yellow.bold(`⚡ DRY RUN: ${totalCardsCreated} cards from ${clipsProcessed} clips previewed`));
  } else {
    console.log(chalk.green.bold(`✓ Created ${totalCardsCreated} cards from ${clipsProcessed} clips in "${options.deck}"`));
  }
}

async function processTextBatch(options) {
  const { createInterface } = await import('readline');
  const { generateSpeech } = await import('./tts.js');
  const { join } = await import('path');
  const spinner = ora();
  const dryRun = options.dryRun;

  console.log(chalk.bold('\nEnter German phrases (one per line, empty line to finish):\n'));

  const phrases = [];
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Collect phrases
  await new Promise((resolve) => {
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed === '') {
        rl.close();
        resolve();
      } else {
        phrases.push(trimmed);
        console.log(chalk.dim(`  Added #${phrases.length}: "${trimmed}"`));
      }
    });
  });

  if (phrases.length === 0) {
    console.log(chalk.yellow('No phrases entered'));
    return;
  }

  console.log(chalk.bold(`\nProcessing ${phrases.length} phrases...\n`));

  if (dryRun) {
    console.log(chalk.yellow('⚡ DRY RUN MODE - No cards will be created\n'));
  } else {
    spinner.start('Checking AnkiConnect...');
    if (!await checkConnection()) {
      spinner.fail('AnkiConnect not available. Make sure Anki is running.');
      process.exit(1);
    }
    await ensureDeck(options.deck);
    spinner.succeed('AnkiConnect ready\n');
  }

  let totalCardsCreated = 0;
  let phrasesProcessed = 0;

  for (let i = 0; i < phrases.length; i++) {
    const phrase = phrases[i];

    console.log(chalk.bold(`[${i + 1}/${phrases.length}] "${phrase}"`));

    spinner.start('Enriching...');
    const { german, ipa, russian, cefr } = await enrich(phrase);
    spinner.succeed(`"${german}"`);

    if (phrase !== german) {
      console.log(chalk.dim(`   (corrected from: "${phrase}")`));
    }

    // Analyze sentence for card types
    spinner.start('Analyzing...');
    const enrichedData = { german, ipa, russian, cefr };
    const analysis = await analyzeSentence(enrichedData, sessionState);
    const selection = selectCards(analysis, sessionState);
    spinner.succeed('Analysis complete');

    // Handle rejection
    if (selection.rejected) {
      console.log(chalk.yellow(`Rejected: ${selection.reason}\n`));
      continue;
    }

    // Handle split suggestion
    if (selection.needsSplit) {
      console.log(chalk.yellow('Should be split:'));
      selection.splits.forEach((part, idx) => {
        console.log(chalk.dim(`      ${idx + 1}. ${part}`));
      });
      console.log();
      continue;
    }

    // Generate audio
    const timestamp = Date.now();
    const sourceId = `${timestamp}`;
    const audioPath = join(config.dataDir, `tts_${timestamp}.mp3`);

    spinner.start('Generating voice-over...');
    await generateSpeech(german, audioPath);
    spinner.succeed('Voice-over ready');

    // Generate cards
    const cards = generateCards(enrichedData, selection.cards, sourceId);

    if (dryRun) {
      console.log(chalk.dim(`   ${cards.length} cards: ${cards.map(c => c.label).join(', ')}`));
      const { execFile: execFileRaw } = await import('child_process');
      const { promisify } = await import('util');
      const { unlink } = await import('fs/promises');
      const execFileAsync = promisify(execFileRaw);
      spinner.start('Playing audio preview...');
      try {
        await execFileAsync('afplay', [audioPath]);
        spinner.succeed('Audio preview played');
      } catch {
        spinner.warn('Could not play audio (afplay not available)');
      }
      await unlink(audioPath).catch(() => {});
      console.log();
      totalCardsCreated += cards.length;
      phrasesProcessed++;
      continue;
    }

    // Check for similar cards
    spinner.start('Checking for similar cards...');
    const similarCards = await findSimilarCards(german);
    spinner.stop();

    // Interactive confirmation (with card set preview)
    const result = await confirmCardSet(cards, enrichedData, chalk, similarCards, audioPath);

    if (result.dismissed) {
      console.log(chalk.yellow('Cards dismissed\n'));
      continue;
    }

    spinner.start(`Creating ${result.cards.length} Anki cards...`);
    const audioFilename = await storeAudio(audioPath);
    const noteIds = await createNotes(result.cards, audioFilename, {
      sourceId,
      cefr,
      deck: options.deck,
    });
    spinner.succeed(`Created ${noteIds.length} cards!\n`);

    // Update session state
    sessionState.recordAcceptedUnit();
    const patternCard = result.cards.find(c => c.type === 'pattern');
    if (patternCard) {
      sessionState.recordPatternUsed(patternCard.reason);
    }

    totalCardsCreated += noteIds.length;
    phrasesProcessed++;
  }

  if (dryRun) {
    console.log(chalk.yellow.bold(`⚡ DRY RUN: ${totalCardsCreated} cards from ${phrasesProcessed} phrases previewed`));
  } else {
    console.log(chalk.green.bold(`✓ Created ${totalCardsCreated} cards from ${phrasesProcessed} phrases in "${options.deck}"`));
  }
}
