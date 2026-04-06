import { createInterface } from 'readline';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir, platform } from 'os';
import { spawn } from 'child_process';

async function askText(question) {
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

/**
 * Play audio file using system player
 */
export async function playAudio(audioPath) {
  const os = platform();
  let cmd, args;

  if (os === 'darwin') {
    cmd = 'afplay';
    args = [audioPath];
  } else if (os === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', audioPath];
  } else {
    // Linux - try common players
    cmd = 'aplay';
    args = [audioPath];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('close', resolve);
    child.on('error', reject);
  });
}

// Ask for action: add, edit, listen, or dismiss
export async function askAction(hasAudio = false, allowReview = false) {
  const reviewLabel = allowReview ? ', [R]eview' : '';
  const prompt = hasAudio
    ? `[A]dd, [E]dit${reviewLabel}, [L]isten, or [D]ismiss? `
    : `[A]dd, [E]dit${reviewLabel}, or [D]ismiss? `;

  const answer = await askText(prompt);
  const normalized = answer.toLowerCase();
  if (normalized === '' || normalized === 'a' || normalized === 'add') {
    return 'add';
  }
  if (normalized === 'e' || normalized === 'edit') {
    return 'edit';
  }
  if (allowReview && (normalized === 'r' || normalized === 'review')) {
    return 'review';
  }
  if (normalized === 'l' || normalized === 'listen') {
    return 'listen';
  }
  return 'dismiss';
}

export async function askReviewFeedback(prompt = 'What should AI recheck and adjust? ') {
  return askText(prompt);
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

// Ask for optional context
export async function askContext() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Context (optional, Enter to skip): ', (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed || null);
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

// Format CEFR display
function formatCEFR(cefr) {
  if (!cefr) return '';
  return cefr.level;
}

/**
 * Format card front for preview display
 */
function formatCardFront(card) {
  switch (card.type) {
    case 'comprehension':
      let front = '[audio]';
      if (card.front.context) front += ` (${card.front.context})`;
      return front;
    case 'dialogue':
      return `[audio] ${card.front.prompt}`;
    case 'production':
      let prodFront = card.front.russian;
      if (card.front.situation) prodFront += ` (${card.front.situation})`;
      return prodFront;
    case 'pattern':
      return `${card.front.pattern}: ${card.front.baseExample}`;
    case 'cloze':
      return `${card.front.sentence}`;
    default:
      return '[audio]';
  }
}

/**
 * Format card back for preview display
 */
function formatCardBack(card) {
  switch (card.type) {
    case 'comprehension':
      return `${card.back.german} / ${card.back.russian}`;
    case 'dialogue':
      let back = card.back.german;
      if (card.back.russian) back += ` / ${card.back.russian}`;
      return back;
    case 'production':
      return `${card.back.german} ${card.back.ipa}`;
    case 'pattern':
      return card.back.examples.slice(0, 3).join(' | ');
    case 'cloze':
      return `${card.back.answer} - ${card.back.german}`;
    default:
      return '';
  }
}

/**
 * Ask for card set action with toggle support.
 * Returns: 'add', 'toggle', 'listen', 'dismiss', or a number (card to toggle)
 */
async function askCardSetAction(enabledCount, totalCount, hasAudio = false, allowReview = false) {
  const reviewLabel = allowReview ? ', [R]eview' : '';
  const prompt = hasAudio
    ? `[A]dd ${enabledCount}, [T]oggle #${reviewLabel}, [L]isten, [D]ismiss? `
    : `[A]dd ${enabledCount}, [T]oggle #${reviewLabel}, [D]ismiss? `;

  const answer = await askText(prompt);
  const normalized = answer.toLowerCase();

  if (normalized === '' || normalized === 'a' || normalized === 'add') {
    return 'add';
  }
  if (allowReview && (normalized === 'r' || normalized === 'review')) {
    return 'review';
  }
  if (normalized === 'l' || normalized === 'listen') {
    return 'listen';
  }
  if (normalized === 'd' || normalized === 'dismiss') {
    return 'dismiss';
  }
  if (normalized.startsWith('t')) {
    const num = parseInt(normalized.replace(/\D/g, ''), 10);
    if (!isNaN(num) && num >= 1 && num <= totalCount) {
      return { toggle: num };
    }
    return 'toggle';
  }

  const num = parseInt(normalized, 10);
  if (!isNaN(num) && num >= 1 && num <= totalCount) {
    return { toggle: num };
  }
  return 'dismiss';
}

/**
 * Show card set preview and ask for confirmation.
 * Supports toggling individual cards on/off.
 *
 * @param {Object[]} cards - Generated card objects
 * @param {Object} data - Original enriched data (german, ipa, russian, cefr)
 * @param {Object} chalk - Chalk instance for coloring
 * @param {Object[]} similarCards - Similar existing cards
 * @param {string} audioPath - Path to audio file
 * @param {boolean} autoPlay - Whether to auto-play audio
 * @returns {Object} { confirmed, cards, dismissed }
 */
export async function confirmCardSet(cards, data, chalk, similarCards = null, audioPath = null, autoPlay = true, options = {}) {
  const allowReview = Boolean(options.allowReview);
  // Track which cards are enabled (all enabled by default)
  const enabled = cards.map(() => true);

  const showPreview = async (playAudio = false) => {
    console.log();

    // Show sentence info
    console.log(chalk.bold('Sentence:'), data.german);
    console.log(chalk.dim(`${data.ipa}  ${data.russian}`));
    if (data.cefr) {
      console.log(chalk.dim(`CEFR: ${formatCEFR(data.cefr)}`));
    }

    // Show similar cards warning
    if (similarCards && similarCards.length > 0) {
      console.log();
      console.log(chalk.yellow('Similar cards found:'));
      for (const card of similarCards.slice(0, 3)) {
        const color = card.similarity === 100 ? chalk.red : chalk.yellow;
        console.log(color(`  ${card.similarity}% "${card.german}"`));
      }
    }

    // Play audio if requested
    if (playAudio && audioPath) {
      console.log();
      try {
        await playAudio(audioPath);
      } catch (err) {
        console.log(chalk.red(`  Could not play audio: ${err.message}`));
      }
    }

    // Show card set preview
    const enabledCount = enabled.filter(Boolean).length;
    console.log();
    console.log(chalk.bold('Card set preview:'));
    if (enabledCount !== cards.length) {
      console.log(chalk.dim(`Enabled: ${enabledCount} of ${cards.length}`));
      console.log();
    }
    if (enabledCount === cards.length) {
      console.log();
    }

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const num = i + 1;
      const status = enabled[i] ? chalk.green('✓') : chalk.dim('○');
      const label = enabled[i] ? chalk.bold(card.label) : chalk.dim(card.label);

      console.log(`${status} [${num}] ${label}`);
      console.log(chalk.dim(`    Front: ${formatCardFront(card)}`));
      console.log(chalk.dim(`    Back:  ${formatCardBack(card)}`));
      console.log();
    }

    return enabledCount;
  };

  // Initial preview with auto-play
  if (autoPlay && audioPath) {
    console.log();
    try {
      await playAudio(audioPath);
    } catch (err) {
      // Ignore audio errors on preview
    }
  }

  // Main interaction loop
  while (true) {
    const enabledCount = await showPreview(false);

    if (enabledCount === 0) {
      console.log(chalk.yellow('No cards enabled. Toggle cards or dismiss.'));
    }

    const action = await askCardSetAction(enabledCount, cards.length, !!audioPath, allowReview);

    if (action === 'add') {
      if (enabledCount === 0) {
        console.log(chalk.yellow('Enable at least one card before adding.'));
        continue;
      }
      const selectedCards = cards.filter((_, i) => enabled[i]);
      return { confirmed: true, cards: selectedCards, dismissed: false };
    }

    if (action === 'listen' && audioPath) {
      console.log(chalk.dim('  Playing audio...'));
      try {
        await playAudio(audioPath);
      } catch (err) {
        console.log(chalk.red(`  Could not play audio: ${err.message}`));
      }
      continue;
    }

    if (action === 'dismiss') {
      return { confirmed: false, cards: [], dismissed: true };
    }

    if (action === 'review' && allowReview) {
      const feedback = await askReviewFeedback();
      if (!feedback) {
        console.log(chalk.yellow('AI review skipped: no feedback provided.'));
        continue;
      }
      return { confirmed: false, cards: [], dismissed: false, reviewFeedback: feedback };
    }

    if (typeof action === 'object' && action.toggle) {
      const idx = action.toggle - 1;
      enabled[idx] = !enabled[idx];
      const card = cards[idx];
      const status = enabled[idx] ? 'enabled' : 'disabled';
      console.log(chalk.dim(`  Card ${action.toggle} (${card.label}) ${status}`));
      continue;
    }

    // Invalid action, show preview again
  }
}

// Show card preview and ask for confirmation
// Returns: { confirmed: true, data } or { confirmed: false, dismissed: true } or loops for edit
export async function confirmCard(cardData, chalk, similarCards = null, audioPath = null, autoPlay = true, options = {}) {
  const allowReview = Boolean(options.allowReview);
  console.log();
  console.log(chalk.bold('Card preview:'));
  console.log(`  German:  ${cardData.german}`);
  console.log(`  IPA:     ${cardData.ipa}`);
  console.log(`  Russian: ${cardData.russian}`);
  if (cardData.cefr) {
    console.log(`  CEFR:    ${formatCEFR(cardData.cefr)}`);
  }

  if (similarCards && similarCards.length > 0) {
    console.log();
    console.log(chalk.yellow('Similar cards found:'));
    for (const card of similarCards.slice(0, 3)) {
      const color = card.similarity === 100 ? chalk.red : chalk.yellow;
      console.log(color(`  ${card.similarity}% "${card.german}"`));
    }
  }

  // Auto-play audio on first preview
  if (autoPlay && audioPath) {
    console.log();
    try {
      await playAudio(audioPath);
    } catch (err) {
      console.log(chalk.red(`  Could not play audio: ${err.message}`));
    }
  }

  console.log();

  // Ask for context first (shown below card preview)
  const context = cardData.context || await askContext();

  const action = await askAction(!!audioPath, allowReview);

  if (action === 'listen' && audioPath) {
    console.log(chalk.dim('  Replaying audio...'));
    try {
      await playAudio(audioPath);
    } catch (err) {
      console.log(chalk.red(`  Could not play audio: ${err.message}`));
    }
    // After listening, ask again (no auto-play, keep context)
    return confirmCard({ ...cardData, context }, chalk, similarCards, audioPath, false, options);
  }

  if (action === 'add') {
    const addReversed = await askReversed();
    return { confirmed: true, data: { ...cardData, context }, addReversed };
  }

  if (action === 'dismiss') {
    return { confirmed: false, dismissed: true };
  }

  if (action === 'review' && allowReview) {
    const feedback = await askReviewFeedback();
    if (!feedback) {
      return confirmCard({ ...cardData, context }, chalk, similarCards, audioPath, false, options);
    }
    return { confirmed: false, dismissed: false, reviewFeedback: feedback, data: { ...cardData, context } };
  }

  // Edit mode
  const edited = await editCardData(cardData);

  if (!edited) {
    // User deleted content in editor = dismiss
    return { confirmed: false, dismissed: true };
  }

  // Recursively confirm edited data (no auto-play after edit, preserve context)
  return confirmCard({ ...edited, context }, chalk, similarCards, audioPath, false, options);
}
