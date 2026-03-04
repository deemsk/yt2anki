#!/usr/bin/env node

import { program } from 'commander';
import { readFile } from 'fs/promises';
import ora from 'ora';
import chalk from 'chalk';

import { downloadAudio, extractVideoId } from './downloader.js';
import { cutClip, parseTimestamp } from './clipper.js';
import { transcribe } from './transcriber.js';
import { enrich } from './enricher.js';
import { checkConnection, ensureDeck, storeAudio, createNote, getNoteTypes, getNoteFields, findSimilarCards } from './anki.js';
import { config, CONFIG_PATH_DISPLAY } from './config.js';
import { confirmCard } from './confirm.js';

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

    const results = [];

    // Process each clip
    for (let i = 0; i < markers.clips.length; i++) {
      const clip = markers.clips[i];
      const progress = `[${i + 1}/${markers.clips.length}]`;

      spinner.start(`${progress} Cutting clip...`);
      const { wavPath, aacPath } = await cutClip(audioPath, clip.start, clip.end, i + 1);
      spinner.succeed(`${progress} Cut clip: ${clip.start} - ${clip.end}`);

      spinner.start(`${progress} Transcribing...`);
      const rawGerman = await transcribe(wavPath);
      spinner.succeed(`${progress} Transcribed: "${rawGerman}"`);

      spinner.start(`${progress} Getting IPA and translation...`);
      const { german, ipa, russian, cefr } = await enrich(rawGerman);
      spinner.succeed(`${progress} Enriched`);

      if (dryRun) {
        results.push({ german, ipa, russian, cefr, audioFile: aacPath });
        spinner.succeed(`${progress} Card preview ready`);
      } else {
        spinner.start(`${progress} Creating Anki card...`);
        const audioFilename = await storeAudio(aacPath);
        await createNote({ german, ipa, russian, audioFilename, cefr });
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
      await createNote({ german, ipa, russian, audioFilename, cefr });
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

  // Check OpenAI
  if (process.env.OPENAI_API_KEY) {
    console.log(chalk.green('✓ OPENAI_API_KEY set'));
  } else {
    console.log(chalk.red('✗ OPENAI_API_KEY not set'));
  }

  // Check AnkiConnect
  console.log();
  if (await checkConnection()) {
    console.log(chalk.green('✓ AnkiConnect connected'));

    const noteTypes = await getNoteTypes();
    console.log(chalk.dim(`  Note types: ${noteTypes.slice(0, 5).join(', ')}...`));

    if (noteTypes.includes(config.ankiNoteType)) {
      console.log(chalk.green(`✓ Note type "${config.ankiNoteType}" exists`));
      const fields = await getNoteFields(config.ankiNoteType);
      console.log(chalk.dim(`  Fields: ${fields.join(', ')}`));
    } else {
      console.log(chalk.yellow(`⚠ Note type "${config.ankiNoteType}" not found`));
      console.log(chalk.dim(`  Available: ${noteTypes.join(', ')}`));
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
  const results = { passed: 0, failed: 0 };

  function pass(msg) {
    console.log(chalk.green(`✓ ${msg}`));
    results.passed++;
  }

  function fail(msg, hint) {
    console.log(chalk.red(`✗ ${msg}`));
    if (hint) console.log(chalk.dim(`  ${hint}`));
    results.failed++;
  }

  // 1. Test yt-dlp
  console.log(chalk.bold.blue('\n[1/5] yt-dlp'));
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
  console.log(chalk.bold.blue('\n[2/5] ffmpeg'));
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
  console.log(chalk.bold.blue('\n[3/5] whisper-cli'));
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
      fail(`Whisper ${config.whisperModel} model not found`, `Download with: whisper-cpp-download-ggml-model ${config.whisperModel}`);
    }
  } catch {
    fail('whisper-cli not found', 'Install with: brew install whisper-cpp');
  }

  // 4. Test OpenAI API
  console.log(chalk.bold.blue('\n[4/5] OpenAI API'));
  const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    fail('OpenAI API key not set', `Add to ${CONFIG_PATH_DISPLAY} or set OPENAI_API_KEY env var`);
  } else {
    pass('OpenAI API key found');

    try {
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
  console.log(chalk.bold.blue('\n[5/5] AnkiConnect'));
  if (await checkConnection()) {
    pass('AnkiConnect is running');

    // Check deck
    try {
      const { getDecks } = await import('./anki.js');
      // We don't have getDecks, let's use ensureDeck logic
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
      pass(`Note type "${config.ankiNoteType}" exists`);

      const fields = await getNoteFields(config.ankiNoteType);
      if (fields.includes('Front') && fields.includes('Back')) {
        pass('Note type has required fields (Front, Back)');
      } else {
        fail('Note type missing Front/Back fields', `Found fields: ${fields.join(', ')}`);
      }
    } else {
      fail(`Note type "${config.ankiNoteType}" not found`);
      console.log(chalk.dim(`  Available: ${noteTypes.join(', ')}`));
    }
  } else {
    fail('AnkiConnect not available');
    console.log(chalk.dim('  1. Open Anki'));
    console.log(chalk.dim('  2. Install add-on: Tools → Add-ons → Get Add-ons → Code: 2055492159'));
    console.log(chalk.dim('  3. Restart Anki'));
  }

  // Summary
  console.log(chalk.bold('\n' + '─'.repeat(50)));
  if (results.failed === 0) {
    console.log(chalk.green.bold(`\n✓ All ${results.passed} tests passed! Ready to use.\n`));
  } else {
    console.log(chalk.yellow(`\n${results.passed} passed, ${results.failed} failed`));
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
    ankiNoteType: 'Basic (and reversed card)',
    openaiModel: 'gpt-4o-mini',
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
  console.log(chalk.dim('  ankiNoteType  - Anki note type to use'));
  console.log(chalk.dim('  openaiModel   - OpenAI model (default: gpt-4o-mini)'));
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
    displayConfig.openaiApiKey = displayConfig.openaiApiKey.slice(0, 7) + '...' + displayConfig.openaiApiKey.slice(-4);
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
    console.log(chalk.yellow('\n⚡ DRY RUN MODE - No card will be created\n'));
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

  const timestamp = Date.now();
  const audioPath = join(config.dataDir, `tts_${timestamp}.m4a`);

  spinner.start('Generating voice-over...');
  await generateSpeech(german, audioPath);
  spinner.succeed('Voice-over generated');

  if (data.german !== german) {
    console.log(chalk.dim(`   (corrected from: "${data.german}")`));
  }

  if (dryRun) {
    console.log();
    console.log(chalk.dim(`   German:  ${german}`));
    console.log(chalk.dim(`   IPA:     ${ipa}`));
    console.log(chalk.dim(`   Russian: ${russian}`));
    console.log(chalk.dim(`   CEFR:    ${cefr.level}`));
    console.log(chalk.yellow.bold('\n⚡ DRY RUN: Card previewed'));
    return;
  }

  // Check for similar cards
  spinner.start('Checking for similar cards...');
  const similarCards = await findSimilarCards(german);
  spinner.stop();

  // Interactive confirmation
  const result = await confirmCard({ german, ipa, russian, cefr }, chalk, similarCards);

  if (result.dismissed) {
    console.log(chalk.yellow('Card dismissed'));
    return;
  }

  spinner.start('Creating Anki card...');
  const audioFilename = await storeAudio(audioPath);
  await createNote({
    german: result.data.german,
    ipa: result.data.ipa,
    russian: result.data.russian,
    audioFilename,
    addReversed: result.addReversed,
    cefr: result.data.cefr,
  });
  spinner.succeed('Card created!');

  console.log(chalk.green.bold(`\n✓ Created card in "${options.deck}"`));
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
  const { fetchSubtitles } = await import('./subtitles.js');
  spinner.start('Fetching subtitles for context...');
  const subtitleContext = await fetchSubtitles(markers.url);
  if (subtitleContext) {
    spinner.succeed(`Subtitles fetched (${subtitleContext.length} chars)`);
  } else {
    spinner.warn('No German subtitles available');
  }

  let cardsCreated = 0;

  for (let i = 0; i < markers.clips.length; i++) {
    const clip = markers.clips[i];
    const progress = `[${i + 1}/${markers.clips.length}]`;

    spinner.start(`${progress} Cutting clip...`);
    const { wavPath, aacPath } = await cutClip(audioPath, clip.start, clip.end, i + 1);
    spinner.succeed(`${progress} Cut: ${clip.start.toFixed(1)}s - ${clip.end.toFixed(1)}s`);

    spinner.start(`${progress} Transcribing...`);
    const rawGerman = await transcribe(wavPath);
    spinner.succeed(`${progress} "${rawGerman}"`);

    spinner.start(`${progress} Getting IPA and translation...`);
    const { german, ipa, russian, cefr } = await enrich(rawGerman, subtitleContext);
    spinner.succeed(`${progress} Enriched`);

    if (rawGerman !== german) {
      console.log(chalk.dim(`   (corrected from: "${rawGerman}")`));
    }

    if (dryRun) {
      console.log(chalk.dim(`   German:  ${german}`));
      console.log(chalk.dim(`   IPA:     ${ipa}`));
      console.log(chalk.dim(`   Russian: ${russian}`));
      console.log(chalk.dim(`   CEFR:    ${cefr.level}\n`));
      cardsCreated++;
      continue;
    }

    // Check for similar cards
    spinner.start(`${progress} Checking for similar cards...`);
    const similarCards = await findSimilarCards(german);
    spinner.stop();

    // Interactive confirmation
    const result = await confirmCard({ german, ipa, russian, cefr }, chalk, similarCards);

    if (result.dismissed) {
      console.log(chalk.yellow(`${progress} Card dismissed\n`));
      continue;
    }

    spinner.start(`${progress} Creating Anki card...`);
    const audioFilename = await storeAudio(aacPath);
    await createNote({
      german: result.data.german,
      ipa: result.data.ipa,
      russian: result.data.russian,
      audioFilename,
      addReversed: result.addReversed,
      cefr: result.data.cefr,
    });
    spinner.succeed(`${progress} Card created!\n`);
    cardsCreated++;
  }

  if (dryRun) {
    console.log(chalk.yellow.bold(`⚡ DRY RUN: ${markers.clips.length} cards previewed`));
  } else {
    console.log(chalk.green.bold(`✓ Created ${cardsCreated} of ${markers.clips.length} cards in "${options.deck}"`));
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

  let cardsCreated = 0;

  for (let i = 0; i < phrases.length; i++) {
    const phrase = phrases[i];
    const progress = `[${i + 1}/${phrases.length}]`;

    spinner.start(`${progress} Enriching...`);
    const { german, ipa, russian, cefr } = await enrich(phrase);
    spinner.succeed(`${progress} "${german}"`);

    if (phrase !== german) {
      console.log(chalk.dim(`   (corrected from: "${phrase}")`));
    }

    if (dryRun) {
      console.log(chalk.dim(`   IPA:     ${ipa}`));
      console.log(chalk.dim(`   Russian: ${russian}`));
      console.log(chalk.dim(`   CEFR:    ${cefr.level}\n`));
      cardsCreated++;
      continue;
    }

    spinner.start(`${progress} Generating voice-over...`);
    const timestamp = Date.now();
    const audioPath = join(config.dataDir, `tts_${timestamp}.m4a`);
    await generateSpeech(german, audioPath);
    spinner.succeed(`${progress} Voice-over ready`);

    // Check for similar cards
    spinner.start(`${progress} Checking for similar cards...`);
    const similarCards = await findSimilarCards(german);
    spinner.stop();

    // Interactive confirmation
    const result = await confirmCard({ german, ipa, russian, cefr }, chalk, similarCards);

    if (result.dismissed) {
      console.log(chalk.yellow(`${progress} Card dismissed\n`));
      continue;
    }

    spinner.start(`${progress} Creating Anki card...`);
    const audioFilename = await storeAudio(audioPath);
    await createNote({
      german: result.data.german,
      ipa: result.data.ipa,
      russian: result.data.russian,
      audioFilename,
      addReversed: result.addReversed,
      cefr: result.data.cefr,
    });
    spinner.succeed(`${progress} Card created!\n`);
    cardsCreated++;
  }

  if (dryRun) {
    console.log(chalk.yellow.bold(`⚡ DRY RUN: ${phrases.length} cards previewed`));
  } else {
    console.log(chalk.green.bold(`✓ Created ${cardsCreated} of ${phrases.length} cards in "${options.deck}"`));
  }
}
