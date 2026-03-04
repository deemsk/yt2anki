import { createInterface } from 'readline';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

// Ask for action: add, edit, or dismiss
export async function askAction() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('[A]dd, [E]dit, or [D]ismiss? ', (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (normalized === '' || normalized === 'a' || normalized === 'add') {
        resolve('add');
      } else if (normalized === 'e' || normalized === 'edit') {
        resolve('edit');
      } else {
        resolve('dismiss');
      }
    });
  });
}

// Ask if reversed card is needed
export async function askReversed() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Add reversed card? [Y/n] ', (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === '' || normalized === 'y' || normalized === 'yes');
    });
  });
}

// Open card data in editor, returns edited data
export async function editCardData(cardData) {
  const editor = process.env.EDITOR || process.env.VISUAL || 'nano';
  const tempFile = join(tmpdir(), `yt2anki-edit-${Date.now()}.txt`);

  // Write card data to temp file
  const content = `# Edit card data below. Lines starting with # are ignored.
# Save and close the editor to continue, or delete all content to dismiss.

german: ${cardData.german}
ipa: ${cardData.ipa}
russian: ${cardData.russian}
`;

  await writeFile(tempFile, content, 'utf-8');

  // Open editor and wait for it to close
  await new Promise((resolve, reject) => {
    const child = spawn(editor, [tempFile], {
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Editor exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });

  // Read edited content
  const edited = await readFile(tempFile, 'utf-8');

  // Clean up temp file
  try {
    await unlink(tempFile);
  } catch {
    // Ignore cleanup errors
  }

  // Parse edited content
  const lines = edited.split('\n').filter((line) => !line.startsWith('#') && line.trim());

  if (lines.length === 0) {
    return null; // User deleted content = dismiss
  }

  const result = { ...cardData };

  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      if (key === 'german' || key === 'ipa' || key === 'russian') {
        result[key] = value.trim();
      }
    }
  }

  return result;
}

// Show card preview and ask for confirmation
// Returns: { confirmed: true, data } or { confirmed: false, dismissed: true } or loops for edit
export async function confirmCard(cardData, chalk, similarCards = null) {
  console.log();
  console.log(chalk.bold('Card preview:'));
  console.log(`  German:  ${cardData.german}`);
  console.log(`  IPA:     ${cardData.ipa}`);
  console.log(`  Russian: ${cardData.russian}`);

  if (similarCards && similarCards.length > 0) {
    console.log();
    console.log(chalk.yellow('Similar cards found:'));
    for (const card of similarCards.slice(0, 3)) {
      const color = card.similarity === 100 ? chalk.red : chalk.yellow;
      console.log(color(`  ${card.similarity}% "${card.german}"`));
    }
  }

  console.log();

  const action = await askAction();

  if (action === 'add') {
    const addReversed = await askReversed();
    return { confirmed: true, data: cardData, addReversed };
  }

  if (action === 'dismiss') {
    return { confirmed: false, dismissed: true };
  }

  // Edit mode
  const edited = await editCardData(cardData);

  if (!edited) {
    // User deleted content in editor = dismiss
    return { confirmed: false, dismissed: true };
  }

  // Recursively confirm edited data
  return confirmCard(edited, chalk);
}
