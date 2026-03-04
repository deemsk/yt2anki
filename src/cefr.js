import { createRequire } from 'module';
import OpenAI from 'openai';
import { config } from './config.js';

const require = createRequire(import.meta.url);
const frequencyData = require('./data/german-frequency.json');

// O(1) frequency lookup map
const frequencyMap = new Map(Object.entries(frequencyData));

// Token normalization cache (LRU-style, max 1000 entries)
const tokenCache = new Map();
const TOKEN_CACHE_MAX = 1000;

// Lemma cache for inflected forms
const lemmaCache = new Map();

let openai = null;

function getClient() {
  if (!openai) {
    const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not set');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const LEVEL_INDEX = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4 };

// ============================================================
// LEMMATIZATION
// ============================================================

// Common verb endings and their infinitive mappings
const VERB_SUFFIXES = [
  // Present tense
  { suffix: 'st', replace: 'en' },   // du gehst → gehen
  { suffix: 't', replace: 'en' },    // er geht → gehen
  { suffix: 'e', replace: 'en' },    // ich gehe → gehen
  { suffix: 'en', replace: 'en' },   // wir gehen → gehen
  // Past tense (weak verbs)
  { suffix: 'te', replace: 'en' },   // ich machte → machen
  { suffix: 'test', replace: 'en' }, // du machtest → machen
  { suffix: 'tet', replace: 'en' },  // ihr machtet → machen
  { suffix: 'ten', replace: 'en' },  // sie machten → machen
  // Konjunktiv II
  { suffix: 'te', replace: 'en' },
  { suffix: 'test', replace: 'en' },
];

// Irregular verb forms → infinitive
const IRREGULAR_VERBS = new Map([
  // sein
  ['bin', 'sein'], ['bist', 'sein'], ['ist', 'sein'],
  ['sind', 'sein'], ['seid', 'sein'],
  ['war', 'sein'], ['warst', 'sein'], ['waren', 'sein'], ['wart', 'sein'],
  ['wäre', 'sein'], ['wärst', 'sein'], ['wären', 'sein'], ['wärt', 'sein'],
  ['gewesen', 'sein'],
  // haben
  ['habe', 'haben'], ['hast', 'haben'], ['hat', 'haben'], ['habt', 'haben'],
  ['hatte', 'haben'], ['hattest', 'haben'], ['hatten', 'haben'], ['hattet', 'haben'],
  ['hätte', 'haben'], ['hättest', 'haben'], ['hätten', 'haben'], ['hättet', 'haben'],
  ['gehabt', 'haben'],
  // werden
  ['werde', 'werden'], ['wirst', 'werden'], ['wird', 'werden'], ['werdet', 'werden'],
  ['wurde', 'werden'], ['wurdest', 'werden'], ['wurden', 'werden'], ['wurdet', 'werden'],
  ['würde', 'werden'], ['würdest', 'werden'], ['würden', 'werden'], ['würdet', 'werden'],
  ['geworden', 'werden'],
  // können
  ['kann', 'können'], ['kannst', 'können'], ['könnt', 'können'],
  ['konnte', 'können'], ['konntest', 'können'], ['konnten', 'können'], ['konntet', 'können'],
  ['könnte', 'können'], ['könntest', 'können'], ['könnten', 'können'], ['könntet', 'können'],
  ['gekonnt', 'können'],
  // müssen
  ['muss', 'müssen'], ['musst', 'müssen'], ['müsst', 'müssen'],
  ['musste', 'müssen'], ['musstest', 'müssen'], ['mussten', 'müssen'], ['musstet', 'müssen'],
  ['müsste', 'müssen'], ['müsstest', 'müssen'], ['müssten', 'müssen'], ['müsstet', 'müssen'],
  ['gemusst', 'müssen'],
  // wollen
  ['will', 'wollen'], ['willst', 'wollen'], ['wollt', 'wollen'],
  ['wollte', 'wollen'], ['wolltest', 'wollen'], ['wollten', 'wollen'], ['wolltet', 'wollen'],
  ['gewollt', 'wollen'],
  // sollen
  ['soll', 'sollen'], ['sollst', 'sollen'], ['sollt', 'sollen'],
  ['sollte', 'sollen'], ['solltest', 'sollen'], ['sollten', 'sollen'], ['solltet', 'sollen'],
  ['gesollt', 'sollen'],
  // mögen/möchten
  ['mag', 'mögen'], ['magst', 'mögen'], ['mögt', 'mögen'],
  ['mochte', 'mögen'], ['mochtest', 'mögen'], ['mochten', 'mögen'], ['mochtet', 'mögen'],
  ['möchte', 'mögen'], ['möchtest', 'mögen'], ['möchten', 'mögen'], ['möchtet', 'mögen'],
  ['gemocht', 'mögen'],
  // gehen
  ['gehe', 'gehen'], ['gehst', 'gehen'], ['geht', 'gehen'],
  ['ging', 'gehen'], ['gingst', 'gehen'], ['gingen', 'gehen'], ['gingt', 'gehen'],
  ['ginge', 'gehen'], ['gingest', 'gehen'], ['gingen', 'gehen'],
  ['gegangen', 'gehen'],
  // kommen
  ['komme', 'kommen'], ['kommst', 'kommen'], ['kommt', 'kommen'],
  ['kam', 'kommen'], ['kamst', 'kommen'], ['kamen', 'kommen'], ['kamt', 'kommen'],
  ['käme', 'kommen'], ['kämest', 'kommen'], ['kämen', 'kommen'], ['kämet', 'kommen'],
  ['gekommen', 'kommen'],
  // wissen
  ['weiß', 'wissen'], ['weißt', 'wissen'], ['wisst', 'wissen'],
  ['wusste', 'wissen'], ['wusstest', 'wissen'], ['wussten', 'wissen'], ['wusstet', 'wissen'],
  ['wüsste', 'wissen'], ['wüsstest', 'wissen'], ['wüssten', 'wissen'], ['wüsstet', 'wissen'],
  ['gewusst', 'wissen'],
  // tun
  ['tue', 'tun'], ['tust', 'tun'], ['tut', 'tun'],
  ['tat', 'tun'], ['tatest', 'tun'], ['taten', 'tun'], ['tatet', 'tun'],
  ['täte', 'tun'], ['tätest', 'tun'], ['täten', 'tun'], ['tätet', 'tun'],
  ['getan', 'tun'],
]);

// Noun/adjective endings to strip
const NOUN_SUFFIXES = ['en', 'er', 'es', 'em', 'e', 's', 'n'];

// Adjective comparative/superlative suffixes
// engsten → eng, größer → groß, etc.
const ADJ_SUFFIXES = [
  { suffix: 'sten', replace: '' },   // superlative: engsten → eng
  { suffix: 'ste', replace: '' },    // superlative: engste → eng
  { suffix: 'sten', replace: 'ss' }, // größten → groß (with ß→ss)
  { suffix: 'er', replace: '' },     // comparative: größer → groß (handled below)
];

/**
 * Attempt to lemmatize a German word
 * Returns the base form if found, otherwise the original word
 */
function lemmatize(word) {
  if (lemmaCache.has(word)) {
    return lemmaCache.get(word);
  }

  let lemma = word;

  // Check irregular verbs first
  if (IRREGULAR_VERBS.has(word)) {
    lemma = IRREGULAR_VERBS.get(word);
  }
  // Try verb suffix stripping
  else if (word.length > 4) {
    for (const { suffix, replace } of VERB_SUFFIXES) {
      if (word.endsWith(suffix)) {
        const stem = word.slice(0, -suffix.length);
        const candidate = stem + replace;
        if (frequencyMap.has(candidate)) {
          lemma = candidate;
          break;
        }
      }
    }
  }

  // If still not found, try adjective comparative/superlative
  if (!frequencyMap.has(lemma) && word.length > 4) {
    for (const { suffix, replace } of ADJ_SUFFIXES) {
      if (word.endsWith(suffix)) {
        const stem = word.slice(0, -suffix.length) + replace;
        if (frequencyMap.has(stem)) {
          lemma = stem;
          break;
        }
        // Try with umlaut restoration: ä→a, ö→o, ü→u
        const withoutUmlaut = stem.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u');
        if (withoutUmlaut !== stem && frequencyMap.has(withoutUmlaut)) {
          lemma = withoutUmlaut;
          break;
        }
      }
    }
  }

  // If still not found, try noun/adjective endings
  if (!frequencyMap.has(lemma) && word.length > 3) {
    for (const suffix of NOUN_SUFFIXES) {
      if (word.endsWith(suffix) && word.length > suffix.length + 2) {
        const stem = word.slice(0, -suffix.length);
        if (frequencyMap.has(stem)) {
          lemma = stem;
          break;
        }
      }
    }
  }

  // Cache result
  if (lemmaCache.size >= TOKEN_CACHE_MAX) {
    const firstKey = lemmaCache.keys().next().value;
    lemmaCache.delete(firstKey);
  }
  lemmaCache.set(word, lemma);

  return lemma;
}

// ============================================================
// TOKENIZATION
// ============================================================

/**
 * Normalize a token (lowercase, strip punctuation)
 * Results are cached for repeated lookups
 */
function normalizeToken(token) {
  if (tokenCache.has(token)) {
    return tokenCache.get(token);
  }

  const normalized = token.toLowerCase().replace(/[^\wäöüß]/g, '');

  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const firstKey = tokenCache.keys().next().value;
    tokenCache.delete(firstKey);
  }
  tokenCache.set(token, normalized);

  return normalized;
}

/**
 * Tokenize and normalize a sentence
 */
function tokenize(sentence) {
  return sentence
    .split(/\s+/)
    .map(normalizeToken)
    .filter((w) => w.length > 0);
}

// Common loanwords/compounds not in frequency list but clearly A1/A2
const COMMON_WORDS = new Map([
  ['email', 500],      // E-Mail
  ['emails', 500],
  ['internet', 800],
  ['computer', 600],
  ['smartphone', 1500],
  ['app', 2000],
  ['apps', 2000],
  ['online', 1000],
  ['offline', 2000],
  ['website', 1500],
  ['download', 2000],
  ['upload', 2500],
]);

/**
 * Get word rank with lemmatization fallback
 */
function getWordRank(word) {
  // Try direct lookup first
  let rank = frequencyMap.get(word);
  if (rank !== undefined) return rank;

  // Try common loanwords
  rank = COMMON_WORDS.get(word);
  if (rank !== undefined) return rank;

  // Try lemmatized form
  const lemma = lemmatize(word);
  if (lemma !== word) {
    rank = frequencyMap.get(lemma);
    if (rank !== undefined) return rank;
  }

  return undefined;
}

// ============================================================
// COMPLEXITY HEURISTIC
// ============================================================

/**
 * Get CEFR level based on sentence complexity heuristics
 * Note: Comma count removed as it causes false positives with lists
 */
export function getComplexityLevel(sentence) {
  const words = tokenize(sentence);
  const wordCount = words.length;

  // Long sentences indicate higher complexity
  if (wordCount > 15) return 'B1';
  if (wordCount > 10) return 'A2';

  return 'A1';
}

// ============================================================
// FREQUENCY ANALYSIS
// ============================================================

// Frequency thresholds for CEFR levels
const FREQ_THRESHOLDS = {
  A1: 4000,
  A2: 7000,
  B1: 10000,
  B2: 20000,
};

/**
 * Get the CEFR level for a given frequency rank
 */
function rankToLevel(rank) {
  if (rank <= FREQ_THRESHOLDS.A1) return 'A1';
  if (rank <= FREQ_THRESHOLDS.A2) return 'A2';
  if (rank <= FREQ_THRESHOLDS.B1) return 'B1';
  if (rank <= FREQ_THRESHOLDS.B2) return 'B2';
  return 'C1';
}

/**
 * Analyze word frequencies in a sentence
 * Returns level based on rarest word + adjustment for multiple rare words
 */
export function getFrequencyLevel(sentence) {
  const words = tokenize(sentence);
  const ranks = [];

  for (const word of words) {
    const rank = getWordRank(word);
    if (rank !== undefined) {
      ranks.push(rank);
    } else if (word.length > 3) {
      // Unknown word = very rare (skip short words/acronyms <= 3 chars)
      ranks.push(20001);
    }
  }

  if (ranks.length === 0) return 'A1';

  const maxRank = Math.max(...ranks);
  let level = rankToLevel(maxRank);

  // Rare-word count adjustment:
  // If 2+ words are B1+ level (rank > 7000), increase level by one step
  const rareWordCount = ranks.filter((r) => r > FREQ_THRESHOLDS.A2).length;
  if (rareWordCount >= 2 && LEVEL_INDEX[level] < LEVEL_INDEX['C1']) {
    const newIndex = Math.min(LEVEL_INDEX[level] + 1, LEVEL_INDEX['C1']);
    level = LEVELS[newIndex];
  }

  return level;
}

/**
 * Get detailed frequency analysis (for confidence calculation)
 */
function analyzeFrequency(sentence) {
  const words = tokenize(sentence);
  const ranks = [];

  for (const word of words) {
    const rank = getWordRank(word);
    if (rank !== undefined) {
      ranks.push(rank);
    } else if (word.length > 3) {
      ranks.push(20001);
    }
  }

  const maxRank = ranks.length > 0 ? Math.max(...ranks) : 0;
  const rareWordCount = ranks.filter((r) => r > FREQ_THRESHOLDS.A2).length;

  return { maxRank, rareWordCount, totalWords: words.length };
}

// ============================================================
// GRAMMAR ANALYSIS
// ============================================================

// Konjunktiv II markers (for conditional wenn detection)
const KONJUNKTIV_PATTERN = /\b(wäre|wärst|wären|wärt|hätte|hättest|hätten|hättet|könnte|könntest|könnten|könntet|müsste|müsstest|müssten|müsstet|würde|würdest|würden|würdet|sollte|solltest|sollten|solltet|dürfte|dürftest|dürften|dürftet|möchte|möchtest|möchten|möchtet)\b/;

// Relative pronouns after comma (relative clause marker)
const RELATIVE_CLAUSE_PATTERN = /,\s*(der|die|das|den|dem|dessen|deren|denen|welcher|welche|welches|welchen|welchem)\b/;

// Perfect tense: auxiliary + (0-2 words) + ge-participle
// Participle must be at least 5 chars (ge + stem + ending) to avoid "gegen", "gehen"
const PERFECT_HABEN_PATTERN = /\b(habe|hast|hat|haben|habt)\s+(\w+\s+){0,2}ge\w{3,}(t|en)\b/;
const PERFECT_SEIN_PATTERN = /\b(bin|bist|ist|sind|seid)\s+(\w+\s+){0,2}ge\w{3,}en\b/;

// Plusquamperfekt pattern
const PLUSQUAMPERFEKT_PATTERN = /\b(hatte|hattest|hatten|hattet|war|warst|waren|wart)\s+(\w+\s+){0,2}ge\w{3,}(t|en)\b/;

// Passive voice patterns - participle can end in t or en (gelesen, gemacht)
const PASSIVE_PRESENT_PATTERN = /\b(werde|wirst|wird|werden|werdet)\s+(\w+\s+){0,3}ge\w{3,}(t|en)\b/;
const PASSIVE_PAST_PATTERN = /\b(wurde|wurdest|wurden|wurdet)\s+(\w+\s+){0,3}ge\w{3,}(t|en)\b/;

// Passive with modal verb: modal + ... + participle + werden (B2)
// e.g., "konnten überprüft werden", "müssen gemacht werden"
// Note: Participles can be:
//   - ge- prefix (gemacht, gesehen)
//   - inseparable prefix verbs without ge- (überprüft, verstanden, erklärt, besucht)
//   - -iert verbs without ge- (kontrolliert, organisiert)
// Note: \w doesn't match umlauts in JS, so we use [\wäöüß]
const MODAL_VERBS = /\b(kann|kannst|können|könnt|konnte|konntest|konnten|konntet|muss|musst|müssen|müsst|musste|musstest|mussten|musstet|soll|sollst|sollen|sollt|sollte|solltest|sollten|solltet|darf|darfst|dürfen|dürft|durfte|durftest|durften|durftet|will|willst|wollen|wollt|wollte|wolltest|wollten|wolltet|mag|magst|mögen|mögt|mochte|mochtest|mochten|mochtet)\b/;
const PARTICIPLE_PATTERN = /(ge[\wäöüß]{3,}(t|en)\b|(über|unter|ver|be|er|ent|emp|zer|miss|wider|hinter)[\wäöüß]{2,}(t|en)\b|[\wäöüß]+iert\b)/;
const PASSIVE_MODAL_PATTERN = new RegExp(MODAL_VERBS.source + '.*' + PARTICIPLE_PATTERN.source + '\\s+werden\\b');

// Genitive prepositions
const GENITIVE_PATTERN = /\b(wegen|trotz|während|anstatt|aufgrund|innerhalb|außerhalb|oberhalb|unterhalb)\s+(des|der|eines|einer)\b/;

/**
 * Check if "wenn" is conditional (B1) or temporal (A2)
 * Conditional wenn requires Konjunktiv II or würde-construction
 */
function isConditionalWenn(sentence) {
  const lower = sentence.toLowerCase();
  if (!/\bwenn\b/.test(lower)) return false;

  // If Konjunktiv II is present, it's conditional (B1)
  if (KONJUNKTIV_PATTERN.test(lower)) return true;

  // If würde + infinitive is present, it's conditional (B1)
  if (/\bwürde\s+\w+en\b/.test(lower)) return true;

  // Otherwise it's temporal wenn (A2)
  return false;
}

/**
 * Get CEFR level based on grammar patterns
 */
export function getGrammarLevel(sentence) {
  const lower = sentence.toLowerCase();

  // === C1 patterns ===
  // (none currently - reserved for future)

  // === B2 patterns ===
  if (/\bobwohl\b/.test(lower)) return 'B2';
  if (/\bobgleich\b/.test(lower)) return 'B2';
  if (/\bwenngleich\b/.test(lower)) return 'B2';
  if (PASSIVE_PRESENT_PATTERN.test(lower)) return 'B2';
  if (PASSIVE_PAST_PATTERN.test(lower)) return 'B2';
  if (PASSIVE_MODAL_PATTERN.test(lower)) return 'B2'; // Passiv mit Modalverb
  if (GENITIVE_PATTERN.test(lower)) return 'B2';
  // Futur II: wird + participle + haben/sein
  if (/\bwird\s+\w+\s+(haben|sein)\b/.test(lower)) return 'B2';

  // === B1 patterns ===
  // Konjunktiv II (standalone, not just with wenn)
  if (KONJUNKTIV_PATTERN.test(lower)) return 'B1';
  // Subordinate conjunctions
  if (/\bweil\b/.test(lower)) return 'B1';
  if (/\bdass\b/.test(lower)) return 'B1';
  if (/\bdamit\b/.test(lower)) return 'B1';
  if (/\bals\s+ob\b/.test(lower)) return 'B1';
  // Conditional wenn (with Konjunktiv)
  if (isConditionalWenn(sentence)) return 'B1';
  // Relative clauses
  if (RELATIVE_CLAUSE_PATTERN.test(lower)) return 'B1';
  // Plusquamperfekt
  if (PLUSQUAMPERFEKT_PATTERN.test(lower)) return 'B1';

  // === A2 patterns ===
  // Temporal wenn (without Konjunktiv)
  if (/\bwenn\b/.test(lower)) return 'A2';
  if (/\bseit\b/.test(lower)) return 'A2';
  if (/\bbevor\b/.test(lower)) return 'A2';
  if (/\bnachdem\b/.test(lower)) return 'A2';
  // Perfect tense (tightened regex)
  if (PERFECT_HABEN_PATTERN.test(lower)) return 'A2';
  if (PERFECT_SEIN_PATTERN.test(lower)) return 'A2';

  return 'A1';
}

// ============================================================
// LLM CLASSIFICATION
// ============================================================

/**
 * Batch LLM classification for multiple sentences
 */
export async function getLLMLevelBatch(sentences) {
  if (sentences.length === 0) return [];
  if (sentences.length === 1) {
    return [await getLLMLevel(sentences[0])];
  }

  const client = getClient();
  const numberedSentences = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n');

  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: 'system',
        content: `Classify the CEFR level of each German sentence. Reply with JSON array only.

Example input:
1. Ich bin Student.
2. Obwohl es regnet, gehe ich spazieren.

Example output:
[{"id":1,"level":"A1"},{"id":2,"level":"B2"}]

Levels: A1 (basic), A2 (elementary), B1 (intermediate), B2 (upper-intermediate), C1 (advanced)`,
      },
      {
        role: 'user',
        content: numberedSentences,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  try {
    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);
    const results = Array.isArray(parsed) ? parsed : parsed.results || parsed.levels || [];

    const levelMap = new Map();
    for (const item of results) {
      const id = item.id || item.index;
      const level = (item.level || 'B1').toUpperCase();
      levelMap.set(id, LEVELS.includes(level) ? level : 'B1');
    }

    return sentences.map((_, i) => levelMap.get(i + 1) || 'B1');
  } catch {
    return Promise.all(sentences.map(getLLMLevel));
  }
}

/**
 * Get CEFR level from LLM classification (single sentence)
 */
export async function getLLMLevel(sentence) {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: 'system',
        content: `Classify the CEFR level of this German sentence. Reply with ONLY the level: A1, A2, B1, B2, or C1.

Consider:
- A1: Basic phrases, present tense, simple vocabulary
- A2: Past tense, common expressions, daily topics
- B1: Complex sentences, opinions, familiar topics
- B2: Abstract topics, idioms, nuanced expression
- C1: Sophisticated language, implicit meaning, specialized vocabulary`,
      },
      {
        role: 'user',
        content: sentence,
      },
    ],
    max_tokens: 5,
    temperature: 0,
  });

  const level = response.choices[0].message.content.trim().toUpperCase();
  return LEVELS.includes(level) ? level : 'B1';
}

// ============================================================
// LEVEL UTILITIES
// ============================================================

function compareLevels(a, b) {
  return LEVEL_INDEX[a] - LEVEL_INDEX[b];
}

function maxLevel(...levels) {
  return levels.reduce((max, level) => (compareLevels(level, max) > 0 ? level : max), 'A1');
}

/**
 * Calculate confidence score based on signal agreement
 * @param {Object} signals - The signal levels
 * @param {string} finalLevel - The final CEFR level
 * @returns {number} Confidence score between 0 and 1
 */
function calculateConfidence(signals, finalLevel) {
  const signalValues = [
    signals.complexity,
    signals.frequency,
    signals.grammar,
    signals.llm,
  ].filter(Boolean);

  if (signalValues.length === 0) return 0.5;

  // Count how many signals agree with the final level
  const agreementCount = signalValues.filter((s) => s === finalLevel).length;
  const agreementRatio = agreementCount / signalValues.length;

  // Count how many signals are within 1 level of the final
  const closeCount = signalValues.filter((s) => {
    const diff = Math.abs(LEVEL_INDEX[s] - LEVEL_INDEX[finalLevel]);
    return diff <= 1;
  }).length;
  const closenessRatio = closeCount / signalValues.length;

  // Base confidence from agreement (0.4-0.8)
  let confidence = 0.4 + agreementRatio * 0.4;

  // Bonus for closeness (up to 0.15)
  confidence += (closenessRatio - agreementRatio) * 0.15;

  // Bonus if LLM was called and agrees (more reliable)
  if (signals.llm && signals.llm === finalLevel) {
    confidence += 0.05;
  }

  // Penalty if no LLM and signals don't fully agree
  if (!signals.llm && agreementRatio < 1) {
    confidence -= 0.1;
  }

  return Math.max(0.1, Math.min(0.99, confidence));
}

/**
 * Check if all cheap signals agree (for early exit)
 */
function signalsAgree(complexity, frequency, grammar) {
  return complexity === frequency && frequency === grammar;
}

// ============================================================
// MAIN ESTIMATION FUNCTIONS
// ============================================================

/**
 * Estimate CEFR level for a German sentence
 * Uses early exit to skip LLM when:
 * 1. Cheap signals already exceed target level, OR
 * 2. All cheap signals agree (high confidence without LLM)
 *
 * @param {string} sentence - German sentence
 * @param {Object} options - Options
 * @param {string} options.targetLevel - Skip LLM if cheap signals exceed this (default: 'B2')
 * @param {boolean} options.skipLLMOnAgreement - Skip LLM if all signals agree (default: true)
 * @returns {Promise<{level: string, confidence: number, signals: object}>}
 */
export async function estimateCEFR(sentence, options = {}) {
  const { targetLevel = 'B2', skipLLMOnAgreement = true } = options;

  const complexity = getComplexityLevel(sentence);
  const frequency = getFrequencyLevel(sentence);
  const grammar = getGrammarLevel(sentence);

  const cheapMax = maxLevel(complexity, frequency, grammar);
  const signals = { complexity, frequency, grammar, llm: null };

  // Early exit condition 1: cheap signals exceed target level
  if (compareLevels(cheapMax, targetLevel) >= 0) {
    const confidence = calculateConfidence(signals, cheapMax);
    return { level: cheapMax, confidence, signals };
  }

  // Early exit condition 2: all cheap signals agree
  if (skipLLMOnAgreement && signalsAgree(complexity, frequency, grammar)) {
    const confidence = calculateConfidence(signals, cheapMax);
    return { level: cheapMax, confidence, signals };
  }

  // Call LLM for uncertain cases
  const llm = await getLLMLevel(sentence);
  signals.llm = llm;

  const level = maxLevel(cheapMax, llm);
  const confidence = calculateConfidence(signals, level);

  return { level, confidence, signals };
}

/**
 * Batch estimate CEFR levels for multiple sentences
 * @param {string[]} sentences - Array of German sentences
 * @param {Object} options - Options
 * @param {string} options.targetLevel - Skip LLM if cheap signals exceed this (default: 'B2')
 * @param {boolean} options.skipLLMOnAgreement - Skip LLM if all signals agree (default: true)
 * @returns {Promise<Array<{level: string, confidence: number, signals: object}>>}
 */
export async function estimateCEFRBatch(sentences, options = {}) {
  const { targetLevel = 'B2', skipLLMOnAgreement = true } = options;

  const cheapResults = sentences.map((sentence) => {
    const complexity = getComplexityLevel(sentence);
    const frequency = getFrequencyLevel(sentence);
    const grammar = getGrammarLevel(sentence);
    const cheapMax = maxLevel(complexity, frequency, grammar);
    const allAgree = signalsAgree(complexity, frequency, grammar);

    return { sentence, complexity, frequency, grammar, cheapMax, allAgree };
  });

  const needsLLM = [];
  const needsLLMIndices = [];

  for (let i = 0; i < cheapResults.length; i++) {
    const { cheapMax, allAgree } = cheapResults[i];
    const exceedsTarget = compareLevels(cheapMax, targetLevel) >= 0;
    const canSkip = exceedsTarget || (skipLLMOnAgreement && allAgree);

    if (!canSkip) {
      needsLLM.push(sentences[i]);
      needsLLMIndices.push(i);
    }
  }

  const llmResults = needsLLM.length > 0 ? await getLLMLevelBatch(needsLLM) : [];

  const llmMap = new Map();
  for (let i = 0; i < needsLLMIndices.length; i++) {
    llmMap.set(needsLLMIndices[i], llmResults[i]);
  }

  return cheapResults.map((result, i) => {
    const { complexity, frequency, grammar, cheapMax } = result;
    const llm = llmMap.get(i) || null;
    const level = llm ? maxLevel(cheapMax, llm) : cheapMax;
    const signals = { complexity, frequency, grammar, llm };
    const confidence = calculateConfidence(signals, level);

    return { level, confidence, signals };
  });
}
