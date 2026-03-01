import { createInterface } from 'readline';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

// Ask yes/no question, returns true/false
export async function askYesNo(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} [Y/n] `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === '' || normalized === 'y' || normalized === 'yes');
    });
  });
}

// Ask for action: edit or dismiss
export async function askEditOrDismiss() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('  [E]dit or [D]ismiss? ', (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (normalized === 'e' || normalized === 'edit') {
        resolve('edit');
      } else {
        resolve('dismiss');
      }
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
export async function confirmCard(cardData, chalk) {
  console.log();
  console.log(chalk.bold('Card preview:'));
  console.log(`  German:  ${cardData.german}`);
  console.log(`  IPA:     ${cardData.ipa}`);
  console.log(`  Russian: ${cardData.russian}`);
  console.log();

  const confirmed = await askYesNo('Create this card?');

  if (confirmed) {
    return { confirmed: true, data: cardData };
  }

  // User said no, ask what to do
  const action = await askEditOrDismiss();

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
