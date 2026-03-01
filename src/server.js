import { createServer } from 'http';
import { downloadAudio } from './downloader.js';
import { cutClip } from './clipper.js';
import { transcribe } from './transcriber.js';
import { enrich } from './enricher.js';
import { checkConnection, ensureDeck, storeAudio, createNote } from './anki.js';
import { config } from './config.js';

const PORT = 9876;

export async function startServer(options = {}) {
  const dryRun = options.dryRun || false;

  const server = createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/process') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const markers = JSON.parse(body);
          console.log(`\nReceived ${markers.clips.length} clips from ${markers.url}`);

          const results = await processMarkers(markers, dryRun);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, cards: results }));
        } catch (err) {
          console.error('Error:', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(PORT, () => {
    console.log(`\nyt2anki server running at http://localhost:${PORT}`);
    console.log(dryRun ? '(DRY RUN mode - no cards will be created)\n' : '');
    console.log('Waiting for clips from browser...\n');
  });

  return server;
}

async function processMarkers(markers, dryRun) {
  if (!dryRun) {
    if (!await checkConnection()) {
      throw new Error('AnkiConnect not available');
    }
    await ensureDeck(config.ankiDeck);
  }

  console.log('Downloading audio...');
  const audioPath = await downloadAudio(markers.url);
  console.log(`Downloaded: ${audioPath}`);

  const results = [];

  for (let i = 0; i < markers.clips.length; i++) {
    const clip = markers.clips[i];
    const progress = `[${i + 1}/${markers.clips.length}]`;

    console.log(`${progress} Cutting ${clip.start} - ${clip.end}...`);
    const { wavPath, aacPath } = await cutClip(audioPath, clip.start, clip.end, i + 1);

    console.log(`${progress} Transcribing...`);
    const german = await transcribe(wavPath);
    console.log(`${progress} "${german}"`);

    console.log(`${progress} Getting IPA and translation...`);
    const { ipa, russian } = await enrich(german);

    if (dryRun) {
      console.log(`${progress} Card preview: ${german} / ${russian}`);
    } else {
      console.log(`${progress} Creating Anki card...`);
      const audioFilename = await storeAudio(aacPath);
      await createNote({ german, ipa, russian, audioFilename });
      console.log(`${progress} Card created!`);
    }

    results.push({ german, ipa, russian });
  }

  console.log(`\nDone! ${results.length} cards ${dryRun ? 'previewed' : 'created'}.\n`);
  return results;
}
