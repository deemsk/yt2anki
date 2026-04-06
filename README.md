# yt2anki

Create Anki flashcards from YouTube videos — auto-extract audio clips, transcribe German speech, generate IPA, and translate to Russian.

## Features

**Video mode** (YouTube):
- Mark timestamps while watching YouTube in Safari
- Download and cut audio clips automatically
- Transcribe German speech using local Whisper (offline, free)

**Text mode** (any webpage):
- Select German text on any webpage
- Generate voice-over using OpenAI TTS

**Word mode** (nouns and adjectives):
- Create Fluent Forever-style notes for German nouns and adjectives
- Pick an image manually from Brave/Openverse/Wikimedia previews
- Use single slow audio clips; nouns are spoken with their article
- Store nouns with article and gender color, plus plural/back-side info
- Store imageable adjectives with a concrete anchor phrase and optional contrast on the back
- Route non-visual but common adjectives into sentence cards instead of skipping them

**Verb mode**:
- Route verbs into picture-word or sentence/form mode
- Use picture-word cards for highly imageable action verbs
- Use sentence cards plus optional dictionary-form cards for abstract or grammar-heavy verbs
- Generate example sentences automatically when verbs are better learned in context

**Grammar mode**:
- Create true Anki `Cloze` notes for inflection-heavy grammar families
- Start with possessive determiner paradigms such as `mein`, `dein`, `sein`, `unser`, and `euer`
- Generate one cloze note per grammatical slot, with duplicate checks by family + lemma + slot

**Both modes:**
- Generate IPA transcription and Russian translation
- Auto-correct transcription errors and punctuation
- Create Anki cards with audio via AnkiConnect

## Card Format

yt2anki now creates multiple card types from the same source sentence, depending on the analysis result.

| Card Type | Front | Back |
|-----------|-------|------|
| Comprehension | `[audio]` + optional context | German + IPA + Russian |
| Dialogue | `[audio]` + `Antworte` | German reply, optional Russian hint |
| Production | Russian + optional situation | German + IPA + `[audio]` |
| Pattern | Pattern label + base example | Multiple example sentences + Russian gloss |
| Cloze | German sentence with blank + Russian + optional hint | Answer + full German sentence |

The default and most common card is the comprehension card, which is audio-first on the front.

## Prerequisites

```bash
# Install tools
brew install yt-dlp ffmpeg whisper-cpp

# Download Whisper model (~150MB, run once)
curl -L -o /opt/homebrew/share/whisper-cpp/ggml-base.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin

# Install Anki desktop app
# Download from https://apps.ankiweb.net

# Install AnkiConnect add-on (required for API access)
# 1. Open Anki
# 2. Tools → Add-ons → Get Add-ons...
# 3. Enter code: 2055492159
# 4. Click OK → Restart Anki
# 5. Keep Anki running while using yt2anki
```

## Setup

```bash
# Clone and install
git clone https://github.com/deemsk/yt2anki.git
cd yt2anki
npm install

# Create config file
npm run init

# Add your OpenAI API key
open ~/.yt2anki.json

# Verify setup
npm run check
npm run test:integration
```

## Usage

### Install bookmarklets

```bash
npm run bookmarklet        # Video mode (YouTube)
npm run bookmarklet:text   # Text mode (any webpage)
```

Create Safari bookmarks, edit them, and paste the bookmarklet URLs.

### Video Mode (YouTube)

1. Open a YouTube video
2. Click **yt2anki** bookmarklet (panel appears)
3. Press **M** to mark start, **M** again to mark end
4. Repeat for multiple clips
5. Press **E** to copy clips to clipboard
6. Run `npm start`

### Text Mode (any webpage)

1. Select German text on any webpage
2. Click **yt2anki Text** bookmarklet
3. Run `npm start`

### Word Mode

```bash
npm run word -- "das Wasser"
npm run words
npm run grammar -- possessive mein
npm run verb -- "laufen"
npm run verbs
```

Word mode uses the `2. Picture Words` note type for picture cards and falls back to the
regular sentence note type for adjectives that are better learned in context.
During creation you choose the intended meaning, then either pick an image or confirm an
example sentence before the note is added.

Imageable adjectives such as colors, sizes, textures, and visible states can go through
picture-word mode. Abstract or weakly visual adjectives are routed into sentence cards
so frequent words like `wichtig` do not get dropped from the workflow.

Verb mode routes imageable verbs to picture-word cards and routes abstract or form-heavy
verbs to sentence cards with an optional dictionary-form note.

Grammar mode uses the Anki `Cloze` note type and currently starts with the `possessive`
family. It generates one note per slot such as nominative masculine singular or dative
plural, so forms like `mein`, `meinen`, and `meinem` are learned through cloze sentences
instead of isolated tables.

If `braveApiKey` is configured, Brave image search is queried first and
Openverse/Wikimedia remain as fallbacks.

### Options

```bash
npm start             # Process from clipboard
npm run clip -- -n    # Dry run (preview only)
```

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Process clips from clipboard |
| `npm run clip -- -n` | Dry run (preview without creating cards) |
| `npm run word -- <word>` | Create one Fluent Forever noun/adjective note |
| `npm run words` | Create multiple noun/adjective notes interactively |
| `npm run grammar -- <family> <lemma>` | Create grammar cloze notes, e.g. `possessive mein` |
| `npm run verb -- <verb>` | Create one Fluent Forever verb note |
| `npm run verbs` | Create multiple verb notes interactively |
| `npm run add -- <url> -s 0:10 -e 0:15` | Add single card manually |
| `npm run process -- <file.json>` | Process markers JSON file |
| `npm run check` | Quick check of installed tools, API key, and AnkiConnect |
| `npm run test:integration` | Test all integrations end-to-end |
| `npm test` | Run Jest tests |
| `npm run config` | Show current configuration |
| `npm run init` | Create config file |
| `npm run bookmarklet` | Copy video bookmarklet to clipboard |
| `npm run bookmarklet:text` | Copy text bookmarklet to clipboard |

## Keyboard Shortcuts (bookmarklet)

| Key | Action |
|-----|--------|
| **M** | Mark start/end |
| **E** | Copy clips to clipboard |
| **H** | Hide/show panel |

## Configuration

Edit `~/.yt2anki.json`:

```json
{
  "openaiApiKey": "sk-...",
  "ankiDeck": "German::YouTube",
  "ankiNoteType": "Basic (optional reversed card)",
  "wordNoteType": "2. Picture Words",
  "grammarNoteType": "Cloze",
  "openaiModel": "gpt-4o-mini",
  "googleTtsKeyFile": "",
  "googleApiKey": "",
  "googleTtsVoices": ["de-DE-Neural2-B", "de-DE-Neural2-C"],
  "braveApiKey": "",
  "whisperModel": "base",
  "ttsSpeed": 0.75,
  "ttsNormalRate": 0.9,
  "ttsPause": 1.0,
  "audioLeadIn": 0.4,
  "wordImagePreviewCount": 12,
  "wordImageSearchResults": 12,
  "dataDir": "/tmp/yt2anki"
}
```

`ttsSpeed` is the main rate used for generated word and sentence audio. `ttsPause` is a legacy
setting from the old repeated slow+normal sentence audio and is no longer used in the default
word/verb flows.

`googleTtsVoices` controls which Google Cloud TTS voices are rotated when generating speech.

`wordNoteType` controls the note type used for picture-word cards. The v1 word mode assumes a
Fluent Forever-compatible `2. Picture Words` note type exists in Anki.

`grammarNoteType` controls the note type used for grammar cloze cards. The current grammar mode
expects a Cloze-compatible model with `Text` and `Back Extra` (or `Extra`) fields.

`braveApiKey` is optional. If set, word and verb picture modes query Brave image search before
Openverse and Wikimedia.

## Tech Stack

- **yt-dlp** — YouTube audio download
- **ffmpeg** — Audio cutting
- **whisper.cpp** — Local speech-to-text
- **OpenAI API** — IPA, translation, routing, enrichment
- **Google Cloud TTS** — sentence and word audio
- **AnkiConnect** — Card creation

## License

MIT
