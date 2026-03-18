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

export async function enrichWord(input) {
  const client = getClient();

  const systemPrompt = `You are a German language expert and Fluent Forever consultant.

Analyze a single German input for noun-based picture-word flashcards.

Rules:
- Accept ONLY nouns that can work as picture-word cards.
- Always normalize accepted nouns into canonical singular form with article.
- Reject non-nouns, phrases, verbs, adjectives, and abstract nouns that do not produce clear image-based cards.
- For nouns with multiple meanings, provide up to 3 short meaning options.
- Russian glosses should be concise and represent a single intended sense.
- English glosses are used for image search and should be concrete.
- imageSearchTerms must be ordered from best visual search to broadest fallback.
- Prefer prototypical everyday depictions over scenic/background scenes.
- For substances like water, milk, coffee, beer, etc., prefer container/use views such as "glass of water", "bottle of water", or "tap water", not landscapes or lakes.
- IPA must be in square brackets.
- For plural, return the plain plural noun without article. If the noun usually has no plural, set noPlural=true.

Respond in JSON only:
{
  "shouldCreateWordCard": true,
  "rejectionReason": null,
  "canonical": "das Wasser",
  "bareNoun": "Wasser",
  "article": "das",
  "gender": "neuter",
  "ipa": "[...]",
  "register": "neutral",
  "isImageable": true,
  "imageabilityReason": "concrete substance, clear visual association",
  "plural": null,
  "noPlural": true,
  "meanings": [
    {
      "russian": "вода",
      "english": "water",
      "imageSearchTerms": ["glass of water", "tap water", "water"]
    }
  ]
}

Gender must be one of: masculine, feminine, neuter.
Register must be one of: neutral, colloquial, formal, specialized.
If rejected, set shouldCreateWordCard=false and explain why.`;

  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const content = response.choices[0].message.content;
  const result = JSON.parse(content);

  if (result.ipa && !String(result.ipa).startsWith('[')) {
    result.ipa = `[${result.ipa}]`;
  }

  result.meanings = Array.isArray(result.meanings) ? result.meanings.filter(Boolean).slice(0, 3) : [];

  return result;
}
