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

**Both modes:**
- Generate IPA transcription and Russian translation
- Auto-correct transcription errors and punctuation
- Create Anki cards with audio via AnkiConnect

## Card Format

| Front | Back |
|-------|------|
| [audio] German phrase | Russian translation |
| IPA transcription | |

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
npm test
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
| `npm run add -- <url> -s 0:10 -e 0:15` | Add single card manually |
| `npm run process -- <file.json>` | Process markers JSON file |
| `npm test` | Test all integrations |
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
  "openaiModel": "gpt-4o-mini",
  "whisperModel": "base",
  "ttsVoice": "nova",
  "dataDir": "/tmp/yt2anki"
}
```

TTS voices: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

## Tech Stack

- **yt-dlp** — YouTube audio download
- **ffmpeg** — Audio cutting
- **whisper.cpp** — Local speech-to-text
- **OpenAI API** — IPA, translation, TTS
- **AnkiConnect** — Card creation

## License

MIT
