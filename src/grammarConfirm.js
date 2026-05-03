import { createInterface } from 'readline';
import chalk from 'chalk';

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

export async function confirmGrammarSelection({
  family,
  lemma,
  units,
  duplicateMatches = [],
}) {
  const enabled = units.map(() => true);

  while (true) {
    console.log();
    console.log(chalk.bold(`Grammar: ${family.title}`));
    console.log(`Lemma: ${lemma}`);
    console.log(`Generated slots: ${units.length}`);

    if (duplicateMatches.length > 0) {
      console.log();
      console.log(chalk.yellow('Existing slots already in Anki:'));
      duplicateMatches.slice(0, 8).forEach((match) => {
        console.log(`  - ${match.slotLabel || match.slotId}${match.surfaceForm ? ` (${match.surfaceForm})` : ''}`);
      });
    }

    console.log();
    units.forEach((unit, index) => {
      const status = enabled[index] ? chalk.green('✓') : chalk.dim('○');
      console.log(`${status} [${index + 1}] ${unit.slotHint} → ${unit.surfaceForm}`);
      console.log(chalk.dim(`    Sentence: ${unit.previewGerman}`));
      console.log(chalk.dim(`    Back:     ${unit.russian}`));
      console.log(chalk.dim(`    Rule:     ${unit.explanation}`));
    });

    const enabledCount = enabled.filter(Boolean).length;
    console.log();
    const answer = await ask(`[A]dd ${enabledCount}, [T]oggle #, [D]ismiss: `);
    const normalized = answer.toLowerCase();

    if (normalized === '' || normalized === 'a' || normalized === 'add') {
      if (enabledCount === 0) {
        console.log(chalk.yellow('Enable at least one slot before adding.'));
        continue;
      }

      return {
        confirmed: true,
        units: units.filter((_, index) => enabled[index]),
      };
    }

    if (normalized === 'd' || normalized === 'dismiss') {
      return {
        confirmed: false,
        units: [],
      };
    }

    const slotNumber = parseInt(normalized.replace(/[^\d]/g, ''), 10);
    if (!Number.isNaN(slotNumber) && slotNumber >= 1 && slotNumber <= units.length) {
      const index = slotNumber - 1;
      enabled[index] = !enabled[index];
      continue;
    }
  }
}
