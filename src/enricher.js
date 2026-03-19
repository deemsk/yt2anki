import OpenAI from 'openai';
import { config } from './config.js';
import { estimateCEFR } from './cefr.js';
import { resolveSecret } from './secrets.js';

let openai = null;

async function getClient() {
  if (!openai) {
    const apiKey = await resolveSecret(config.openaiApiKey || process.env.OPENAI_API_KEY);
    if (!apiKey) {
      throw new Error('OpenAI API key not set. Add to ~/.yt2anki.json or set OPENAI_API_KEY env var');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

/**
 * Get corrected German text, IPA transcription, and Russian translation
 * @param {string} germanText - German word or sentence (possibly with errors)
 * @param {string} [subtitleContext] - Optional full subtitle context from the video
 * @param {string} [ccHint] - Optional CC text for this specific clip (authoritative reference)
 * @returns {Promise<{german: string, ipa: string, russian: string}>}
 */
export async function enrich(germanText, subtitleContext = null, ccHint = null) {
  const client = await getClient();

  let systemPrompt = `You are a German language expert. For the given German text:
1. Correct any transcription errors (typos, missing letters, wrong words)
2. Fix punctuation (questions must end with ?, statements with .)
3. Ensure proper capitalization (sentence start, nouns)
4. Provide IPA transcription in square brackets
5. Provide Russian translation

Respond in JSON format only:
{"german": "...", "ipa": "[...]", "russian": "..."}

Examples of corrections:
- "Bis du verheiratet." → "Bist du verheiratet?"
- "wie heisst du" → "Wie heißt du?"
- "ich bin student" → "Ich bin Student."`;

  if (ccHint) {
    systemPrompt += `\n\nClosed captions for this clip (authoritative — prefer this over the whisper transcription when they conflict):\n"${ccHint}"`;
  }

  if (subtitleContext) {
    systemPrompt += `\n\nBroader video subtitle context:\n${subtitleContext.slice(0, 2000)}`;
  }

  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: germanText,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const content = response.choices[0].message.content;
  const result = JSON.parse(content);

  // Ensure IPA is always in square brackets
  let ipa = result.ipa || '';
  if (ipa && !ipa.startsWith('[')) {
    ipa = `[${ipa}]`;
  }

  const german = result.german || germanText;
  const cefr = await estimateCEFR(german);

  return {
    german,
    ipa,
    russian: result.russian || '',
    cefr,
  };
}
