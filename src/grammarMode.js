import ora from 'ora';
import chalk from 'chalk';
import { config } from './config.js';
import {
  checkConnection,
  createClozeNote,
  ensureDeck,
  findGrammarDuplicates,
  getNoteFields,
  getNoteTypes,
  resolveClozeFieldMap,
} from './anki.js';
import { confirmGrammarSelection } from './grammarConfirm.js';
import { getGrammarFamily, listGrammarFamilies } from './grammar/registry.js';
import { buildGrammarExtra } from './grammar/utils.js';
import { toTagSlug } from './wordUtils.js';

const DEFAULT_GRAMMAR_NOTE_TYPE = config.grammarNoteType || 'Cloze';

function showGrammarHeader(familyName, lemma) {
  console.log();
  console.log(chalk.bold(`${familyName}: ${lemma}`));
}

function requireGrammarFamily(name) {
  const family = getGrammarFamily(name);
  if (family) {
    return family;
  }

  const available = listGrammarFamilies().map((item) => item.id).join(', ');
  throw new Error(`Unknown grammar family "${name}". Available families: ${available}`);
}

function buildGrammarTags(unit) {
  return [
    'yt2anki',
    'mode-grammar',
    `grammar-family-${toTagSlug(unit.familyId)}`,
    `grammar-lemma-${toTagSlug(unit.lemma)}`,
    `grammar-slot-${toTagSlug(unit.slotId)}`,
    `grammar-case-${toTagSlug(unit.caseKey)}`,
    `grammar-gender-${toTagSlug(unit.gender)}`,
    `grammar-number-${toTagSlug(unit.number)}`,
    `grammar-surface-${toTagSlug(unit.surfaceForm)}`,
  ];
}

async function ensureGrammarSetup(deck, dryRun) {
  if (dryRun) {
    return {
      modelName: DEFAULT_GRAMMAR_NOTE_TYPE,
      fieldMap: { textField: 'Text', extraField: 'Back Extra' },
    };
  }

  if (!await checkConnection()) {
    throw new Error('AnkiConnect not available. Make sure Anki is running.');
  }

  const noteTypes = await getNoteTypes();
  if (!noteTypes.includes(DEFAULT_GRAMMAR_NOTE_TYPE)) {
    throw new Error(`Required grammar note type "${DEFAULT_GRAMMAR_NOTE_TYPE}" not found in Anki.`);
  }

  const modelFields = await getNoteFields(DEFAULT_GRAMMAR_NOTE_TYPE);
  const fieldMap = resolveClozeFieldMap(modelFields);
  await ensureDeck(deck || config.ankiDeck);

  return {
    modelName: DEFAULT_GRAMMAR_NOTE_TYPE,
    fieldMap,
  };
}

function partitionDuplicateUnits(units, matches = []) {
  const bySlot = new Map(matches.map((match) => [match.slotId, match]));
  const duplicates = [];
  const pending = [];

  units.forEach((unit) => {
    if (bySlot.has(unit.slotId)) {
      duplicates.push(bySlot.get(unit.slotId));
      return;
    }
    pending.push(unit);
  });

  return { duplicates, pending };
}

async function prepareGrammar(familyName, rawLemma, options, spinner) {
  const family = requireGrammarFamily(familyName);
  const lemma = family.normalizeLemma(rawLemma);

  spinner.start('Generating grammar notes...');
  const units = family.buildUnits(lemma, options);
  spinner.succeed(`Ready: ${family.id} ${lemma}`);

  let duplicateMatches = [];
  let pendingUnits = units;

  if (!options.dryRun) {
    spinner.start('Checking duplicates...');
    duplicateMatches = await findGrammarDuplicates({
      familyId: family.id,
      lemma,
    });
    const partitioned = partitionDuplicateUnits(units, duplicateMatches.lemmaMatches);
    pendingUnits = partitioned.pending;
    duplicateMatches = partitioned.duplicates;
    spinner.stop();
  }

  if (pendingUnits.length === 0) {
    console.log(chalk.yellow(`All slots already exist for ${family.id} ${lemma}.`));
    return { rejected: true };
  }

  return {
    family,
    lemma,
    units: pendingUnits,
    duplicateMatches,
  };
}

async function finalizeGrammar(prepared, setup, options, spinner) {
  const { family, lemma, units, duplicateMatches } = prepared;
  const confirmation = await confirmGrammarSelection({
    family,
    lemma,
    units,
    duplicateMatches,
  });

  if (!confirmation.confirmed) {
    console.log(chalk.yellow('Grammar set dismissed'));
    return false;
  }

  if (options.dryRun) {
    console.log();
    console.log(chalk.bold('Grammar preview'));
    console.log(`  Family: ${family.id}`);
    console.log(`  Lemma:  ${lemma}`);
    console.log(`  Notes:  ${confirmation.units.length}`);
    console.log(chalk.yellow('\n⚡ DRY RUN: Grammar notes previewed'));
    return true;
  }

  spinner.start('Creating cloze notes...');
  let created = 0;

  for (const unit of confirmation.units) {
    const extra = buildGrammarExtra({
      translation: unit.russian,
      slotLabel: unit.slotLabel,
      explanation: unit.explanation,
      metadata: unit.metadata,
    });

    try {
      await createClozeNote({
        text: unit.clozeText,
        extra,
        tags: buildGrammarTags(unit),
        deck: options.deck,
        modelName: setup.modelName,
        fieldMap: setup.fieldMap,
      });
      created++;
    } catch (err) {
      if (!err.message.includes('duplicate')) {
        throw err;
      }
    }
  }

  spinner.succeed(`Created ${created} grammar notes`);
  console.log(chalk.green(`✓ Added ${created} grammar notes for ${family.id} ${lemma}`));
  return created > 0;
}

async function processGrammar(familyName, lemma, options = {}) {
  const spinner = ora();

  try {
    const family = requireGrammarFamily(familyName);
    const normalizedLemma = family.normalizeLemma(lemma);
    showGrammarHeader(family.id, normalizedLemma);
    const setup = await ensureGrammarSetup(options.deck || config.ankiDeck, options.dryRun);
    const prepared = await prepareGrammar(familyName, lemma, options, spinner);
    if (!prepared || prepared.rejected) {
      return false;
    }

    return finalizeGrammar(prepared, setup, options, spinner);
  } catch (err) {
    spinner.fail(err.message);
    throw err;
  }
}

export async function processSingleGrammar(familyName, lemma, options = {}) {
  try {
    return await processGrammar(familyName, lemma, options);
  } catch {
    process.exit(1);
  }
}
