#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function build() {
  const sourcePath = join(__dirname, '..', 'bookmarklet', 'text-marker.js');
  const source = await readFile(sourcePath, 'utf-8');

  // Simple minification
  const code = source
    .split('\n')
    .map(line => line.replace(/\/\/.*$/, '').trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const bookmarklet = `javascript:${encodeURIComponent(code)}`;

  console.log('\n📝 DerDieDeck Text Bookmarklet\n');
  console.log('To install:');
  console.log('1. Create a new bookmark in Safari');
  console.log('2. Name it "DerDieDeck Text"');
  console.log('3. Paste this as the URL:\n');
  console.log('─'.repeat(60));
  console.log(bookmarklet);
  console.log('─'.repeat(60));
  console.log('\nUsage:');
  console.log('1. Select German text on any webpage');
  console.log('2. Click the bookmarklet');
  console.log('3. Run: npm start');

  const outputPath = join(__dirname, '..', 'bookmarklet', 'text-bookmarklet.txt');
  await writeFile(outputPath, bookmarklet);
  console.log(`\nSaved to: ${outputPath}`);
}

build().catch(console.error);
