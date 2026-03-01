import OpenAI from 'openai';
import { config } from './config.js';

let openai = null;

function getClient() {
  if (!openai) {
    const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not set. Add to ~/.yt2anki.json or set OPENAI_API_KEY env var');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

/**
 * Get IPA transcription and Russian translation for German text
 * @param {string} germanText - German word or sentence
 * @returns {Promise<{ipa: string, russian: string}>}
 */
export async function enrich(germanText) {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: 'system',
        content: `You are a German language expert. For the given German text:
1. Provide the IPA (International Phonetic Alphabet) transcription
2. Provide Russian translation

Respond in JSON format only:
{"ipa": "...", "russian": "..."}

Rules:
- IPA must be in square brackets, e.g., [ˈbʊntə ˈfaʁbən]
- Russian translation should be natural, not word-for-word
- Keep the same register/formality as the original`,
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

  return {
    ipa,
    russian: result.russian || '',
  };
}
