import { createInterface } from 'readline';
import ora from 'ora';
import chalk from 'chalk';
import { enrichWord, hasStructuredWordAnalysis } from './wordEnricher.js';
import { enrichVerb, hasStructuredVerbAnalysis } from './verbEnricher.js';
import { runWordWorkflow } from './wordMode.js';
import { runVerbWorkflow } from './verbMode.js';

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

function showLexicalHeader(rawInput) {
  const label = String(rawInput || '').trim();
  if (!label) return;

  console.log();
  console.log(chalk.bold(label));
}

function isPlausibleWordAnalysis(result = {}) {
  return Boolean(
    result.lexicalType &&
    (result.shouldCreateWordCard || hasStructuredWordAnalysis(result))
  );
}

function isPlausibleVerbAnalysis(result = {}) {
  return Boolean(
    result.infinitive &&
    (result.shouldCreateVerbCard || hasStructuredVerbAnalysis(result))
  );
}

export function normalizeLexicalInput(inputParts = []) {
  return Array.isArray(inputParts)
    ? inputParts.join(' ').trim()
    : String(inputParts || '').trim();
}

export function chooseLexicalRouteFromAnalyses(wordAnalysis = {}, verbAnalysis = {}) {
  const wordPlausible = isPlausibleWordAnalysis(wordAnalysis);
  const verbPlausible = isPlausibleVerbAnalysis(verbAnalysis);

  if (wordPlausible && !verbPlausible) {
    return {
      route: 'word',
      analysisResult: wordAnalysis,
      wordPlausible,
      verbPlausible,
      wordAnalysis,
      verbAnalysis,
      reason: 'word-only',
    };
  }

  if (verbPlausible && !wordPlausible) {
    return {
      route: 'verb',
      analysisResult: verbAnalysis,
      wordPlausible,
      verbPlausible,
      wordAnalysis,
      verbAnalysis,
      reason: 'verb-only',
    };
  }

  return {
    route: null,
    analysisResult: null,
    wordPlausible,
    verbPlausible,
    wordAnalysis,
    verbAnalysis,
    reason: wordPlausible && verbPlausible ? 'both-plausible' : 'both-weak',
  };
}

function describeWordAnalysis(result = {}) {
  if (!result?.canonical) {
    return 'noun/adjective analysis unavailable';
  }

  const type = result.lexicalType || 'noun';
  return `${result.canonical} (${type})`;
}

function describeVerbAnalysis(result = {}) {
  if (!result?.infinitive) {
    return 'verb analysis unavailable';
  }

  if (result.displayForm && result.displayForm !== result.infinitive) {
    return `${result.infinitive} (${result.displayForm})`;
  }

  return result.infinitive;
}

async function askLexicalRoute(rawInput, classification) {
  console.log();
  console.log(chalk.yellow(`Could not confidently classify "${rawInput}".`));
  console.log(chalk.dim(
    classification.reason === 'both-plausible'
      ? 'Both noun/adjective and verb analyses look plausible.'
      : 'Both noun/adjective and verb analyses look weak.'
  ));
  console.log(chalk.dim(`  noun/adjective: ${describeWordAnalysis(classification.wordAnalysis)}`));
  console.log(chalk.dim(`  verb:           ${describeVerbAnalysis(classification.verbAnalysis)}`));

  while (true) {
    const answer = await ask('Choose [W]ord, [V]erb, or [S]kip: ');
    const normalized = answer.toLowerCase();

    if (normalized === 'w' || normalized === 'word') {
      return 'word';
    }

    if (normalized === 'v' || normalized === 'verb') {
      return 'verb';
    }

    if (normalized === '' || normalized === 's' || normalized === 'skip') {
      return null;
    }
  }
}

async function detectLexicalRoute(rawInput) {
  const spinner = ora('Detecting lexical type...');
  spinner.start();
  const [wordAnalysis, verbAnalysis] = await Promise.all([
    enrichWord(rawInput),
    enrichVerb(rawInput),
  ]);

  const classification = chooseLexicalRouteFromAnalyses(wordAnalysis, verbAnalysis);

  if (classification.route) {
    spinner.succeed(`Using ${classification.route === 'word' ? 'noun/adjective' : 'verb'} workflow`);
    return classification;
  }

  spinner.stop();
  const chosenRoute = await askLexicalRoute(rawInput, classification);
  if (!chosenRoute) {
    return {
      ...classification,
      skipped: true,
    };
  }

  console.log(chalk.dim(`Using ${chosenRoute === 'word' ? 'noun/adjective' : 'verb'} workflow.`));
  const analysisResult = chosenRoute === 'word'
    ? (classification.wordPlausible ? classification.wordAnalysis : null)
    : (classification.verbPlausible ? classification.verbAnalysis : null);

  return {
    ...classification,
    route: chosenRoute,
    analysisResult,
  };
}

async function processLexicalEntry(rawInput, options = {}) {
  showLexicalHeader(rawInput);
  const classification = await detectLexicalRoute(rawInput);

  if (classification.skipped) {
    console.log(chalk.yellow('Skipped: no lexical workflow selected'));
    return false;
  }

  if (classification.route === 'verb') {
    return runVerbWorkflow(rawInput, {
      ...options,
      analysisResult: classification.analysisResult,
      skipHeader: true,
    });
  }

  return runWordWorkflow(rawInput, {
    ...options,
    analysisResult: classification.analysisResult,
    skipHeader: true,
  });
}

function validateLexicalCommandOptions(rawInput, options = {}) {
  if (!rawInput && (options.meaning || options.sentence)) {
    throw new Error('--meaning and --sentence can only be used when processing a single lexical item.');
  }
}

export async function processLexicalCommand(inputParts, options = {}) {
  try {
    const rawInput = normalizeLexicalInput(inputParts);
    validateLexicalCommandOptions(rawInput, options);

    if (rawInput) {
      await processLexicalEntry(rawInput, options);
      return;
    }

    console.log(chalk.bold('\nEnter German nouns, adjectives, or verbs (one per line, empty line to finish):\n'));

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const entries = await new Promise((resolve) => {
      const items = [];
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (trimmed === '') {
          rl.close();
          return;
        }

        items.push(trimmed);
        console.log(chalk.dim(`  Added #${items.length}: "${trimmed}"`));
      });

      rl.on('close', () => resolve(items));
    });

    if (entries.length === 0) {
      console.log(chalk.yellow('No lexical items entered'));
      return;
    }

    console.log(chalk.bold(`\nProcessing ${entries.length} lexical items...\n`));

    let completed = 0;
    for (const entry of entries) {
      try {
        const added = await processLexicalEntry(entry, options);
        if (added) {
          completed++;
        }
      } catch (err) {
        console.log(chalk.red(`Skipped "${entry}": ${err.message}`));
      }
    }

    console.log();
    if (options.dryRun) {
      console.log(chalk.yellow(`⚡ DRY RUN: ${completed} lexical notes previewed`));
    } else {
      console.log(chalk.green(`✓ Added ${completed} lexical notes`));
    }
  } catch (err) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }
}
