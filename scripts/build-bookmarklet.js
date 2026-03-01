#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function build() {
  const sourcePath = join(__dirname, '..', 'bookmarklet', 'marker.js');
  const source = await readFile(sourcePath, 'utf-8');

  // Minify (simple: remove comments and extra whitespace)
  const minified = source
    .replace(/\/\/.*$/gm, '') // Remove line comments
    .replace(/\s+/g, ' ')     // Collapse whitespace
    .replace(/\s*([{}();,:])\s*/g, '$1') // Remove space around punctuation
    .trim();

  const bookmarklet = `javascript:${encodeURIComponent(minified)}`;

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
  console.log('- Press E to export markers JSON');
  console.log('- Press H to hide/show panel');

  // Also save to file
  const outputPath = join(__dirname, '..', 'bookmarklet', 'bookmarklet.txt');
  await writeFile(outputPath, bookmarklet);
  console.log(`\nAlso saved to: ${outputPath}`);
}

build().catch(console.error);
