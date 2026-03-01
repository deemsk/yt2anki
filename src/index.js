#!/usr/bin/env node

import { program } from 'commander';
import { readFile } from 'fs/promises';
import ora from 'ora';
import chalk from 'chalk';

import { downloadAudio, extractVideoId } from './downloader.js';
import { cutClip, parseTimestamp } from './clipper.js';
import { transcribe } from './transcriber.js';
import { enrich } from './enricher.js';
import { checkConnection, ensureDeck, storeAudio, createNote, getNoteTypes, getNoteFields } from './anki.js';
import { config } from './config.js';

program
  .name('yt2anki')
  .description('Create Anki cards from YouTube videos for German learning')
  .version('1.0.0');

program
  .command('process')
  .description('Process markers file and create Anki cards')
  .argument('<file>', 'Path to markers JSON file')
  .option('-d, --deck <name>', 'Anki deck name', config.ankiDeck)
  .action(processMarkers);

program
  .command('add')
  .description('Add single card from YouTube URL with timestamps')
  .argument('<url>', 'YouTube URL')
  .requiredOption('-s, --start <time>', 'Start timestamp (e.g., 1:23 or 83)')
  .requiredOption('-e, --end <time>', 'End timestamp')
  .option('-d, --deck <name>', 'Anki deck name', config.ankiDeck)
  .action(addSingleCard);

program
  .command('check')
  .description('Check AnkiConnect connection and setup')
  .action(checkSetup);

program.parse();

async function processMarkers(file, options) {
  const spinner = ora();

  try {
    // Read markers file
    spinner.start('Reading markers file...');
    const content = await readFile(file, 'utf-8');
    const markers = JSON.parse(content);
    spinner.succeed(`Found ${markers.clips.length} clips from ${markers.url}`);

    // Check Anki
    spinner.start('Checking AnkiConnect...');
    if (!await checkConnection()) {
      spinner.fail('AnkiConnect not available. Make sure Anki is running with AnkiConnect add-on.');
      process.exit(1);
    }
    await ensureDeck(options.deck);
    spinner.succeed('AnkiConnect ready');

    // Download audio
    spinner.start('Downloading audio...');
    const audioPath = await downloadAudio(markers.url);
    spinner.succeed(`Downloaded: ${audioPath}`);

    // Process each clip
    for (let i = 0; i < markers.clips.length; i++) {
      const clip = markers.clips[i];
      const progress = `[${i + 1}/${markers.clips.length}]`;

      spinner.start(`${progress} Cutting clip...`);
      const { wavPath, aacPath } = await cutClip(audioPath, clip.start, clip.end, i + 1);
      spinner.succeed(`${progress} Cut clip: ${clip.start} - ${clip.end}`);

      spinner.start(`${progress} Transcribing...`);
      const german = await transcribe(wavPath);
      spinner.succeed(`${progress} Transcribed: "${german}"`);

      spinner.start(`${progress} Getting IPA and translation...`);
      const { ipa, russian } = await enrich(german);
      spinner.succeed(`${progress} Enriched: ${ipa} / ${russian}`);

      spinner.start(`${progress} Creating Anki card...`);
      const audioFilename = await storeAudio(aacPath);
      await createNote({ german, ipa, russian, audioFilename });
      spinner.succeed(`${progress} Card created!`);

      console.log(chalk.dim(`   German:  ${german}`));
      console.log(chalk.dim(`   IPA:     ${ipa}`));
      console.log(chalk.dim(`   Russian: ${russian}`));
      console.log();
    }

    console.log(chalk.green.bold(`\n✓ Created ${markers.clips.length} cards in deck "${options.deck}"`));
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }
}

async function addSingleCard(url, options) {
  const spinner = ora();

  try {
    // Check Anki
    spinner.start('Checking AnkiConnect...');
    if (!await checkConnection()) {
      spinner.fail('AnkiConnect not available. Make sure Anki is running with AnkiConnect add-on.');
      process.exit(1);
    }
    await ensureDeck(options.deck);
    spinner.succeed('AnkiConnect ready');

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
    const german = await transcribe(wavPath);
    spinner.succeed(`Transcribed: "${german}"`);

    // Enrich
    spinner.start('Getting IPA and Russian translation...');
    const { ipa, russian } = await enrich(german);
    spinner.succeed('Enriched');

    // Create card
    spinner.start('Creating Anki card...');
    const audioFilename = await storeAudio(aacPath);
    await createNote({ german, ipa, russian, audioFilename });
    spinner.succeed('Card created!');

    console.log();
    console.log(chalk.bold('Card details:'));
    console.log(`  German:  ${german}`);
    console.log(`  IPA:     ${ipa}`);
    console.log(`  Russian: ${russian}`);
    console.log(`  Audio:   ${audioFilename}`);
    console.log(`  Deck:    ${options.deck}`);
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }
}

async function checkSetup() {
  console.log(chalk.bold('\nChecking yt2anki setup...\n'));

  // Check tools
  const tools = ['yt-dlp', 'ffmpeg', 'whisper-cpp'];
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
}
