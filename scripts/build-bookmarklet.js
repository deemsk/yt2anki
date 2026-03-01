#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function build() {
  const sourcePath = join(__dirname, '..', 'bookmarklet', 'marker.js');
  const source = await readFile(sourcePath, 'utf-8');

  // Remove comments first (before any whitespace changes)
  let code = source
    .split('\n')
    .map(line => {
      // Remove line comments, but not inside strings
      const stringMatch = line.match(/^([^'"]*(['"`]).*?\2)*[^'"]*$/);
      if (stringMatch) {
        // Simple case: remove // comments that aren't inside strings
        const commentIndex = line.indexOf('//');
        if (commentIndex !== -1) {
          // Check if // is inside a string by counting quotes before it
          const before = line.slice(0, commentIndex);
          const singleQuotes = (before.match(/'/g) || []).length;
          const doubleQuotes = (before.match(/"/g) || []).length;
          const backticks = (before.match(/`/g) || []).length;
          // If all quotes are balanced, it's a comment
          if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0 && backticks % 2 === 0) {
            return line.slice(0, commentIndex);
          }
        }
      }
      return line;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const bookmarklet = `javascript:${encodeURIComponent(code)}`;

  console.log('\n📚 yt2anki Bookmarklet\n');
  console.log('To install:');
  console.log('1. Create a new bookmark in Safari');
  console.log('2. Name it "yt2anki Marker"');
  console.log('3. Paste this as the URL:\n');
  console.log('─'.repeat(60));
  console.log(bookmarklet);
  console.log('─'.repeat(60));
  console.log('\nUsage on YouTube:');
  console.log('- Click bookmarklet to activate');
  console.log('- Press M to mark start/end of clips');
  console.log('- Press E to send clips to server');
  console.log('- Press H to hide/show panel');

  // Also save to file
  const outputPath = join(__dirname, '..', 'bookmarklet', 'bookmarklet.txt');
  await writeFile(outputPath, bookmarklet);
  console.log(`\nAlso saved to: ${outputPath}`);
}

build().catch(console.error);
