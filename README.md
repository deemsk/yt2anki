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

**Word mode** (single nouns):
- Create Fluent Forever-style picture-word notes for German nouns
- Pick an image manually from Brave/Openverse/Wikimedia previews
- Prefer Wikimedia pronunciation audio, fall back to Google TTS
- Store noun with article and gender color, plus plural/back-side info

**Verb mode**:
- Route verbs into picture-word or sentence/form mode
- Use picture-word cards for highly imageable action verbs
- Use sentence cards plus optional dictionary-form cards for abstract or grammar-heavy verbs
- Generate example sentences automatically when verbs are better learned in context

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
npm run verb -- "laufen"
npm run verbs
```

Word mode is noun-first and uses the `2. Picture Words` note type by default.
During creation you choose the intended meaning, pick an image, review frequency band,
and confirm before the note is added.

Verb mode routes imageable verbs to picture-word cards and routes abstract or form-heavy
verbs to sentence cards with an optional dictionary-form note.

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
| `npm run word -- <noun>` | Create one Fluent Forever noun note |
| `npm run words` | Create multiple noun notes interactively |
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

`googleTtsVoices` controls which Google Cloud TTS voices are rotated when generating speech.

`wordNoteType` controls the note type used for noun cards. The v1 word mode assumes a
Fluent Forever-compatible `2. Picture Words` note type exists in Anki.

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
