# yt2anki

Create Anki flashcards from YouTube videos — auto-extract audio clips, transcribe German speech, generate IPA, and translate to Russian.

## Features

- Mark timestamps while watching YouTube in Safari (bookmarklet)
- Download and cut audio clips automatically
- Transcribe German speech using local Whisper (offline, free)
- Generate IPA transcription and Russian translation via OpenAI
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

### 1. Install bookmarklet

```bash
npm run bookmarklet   # Copies to clipboard
```

Create a Safari bookmark, edit it, and paste the bookmarklet as the URL.

### 2. Mark clips in Safari

1. Open a YouTube video
2. Click the bookmarklet (panel appears)
3. Press **M** to mark start, **M** again to mark end
4. Repeat for multiple clips
5. Press **E** to copy clips to clipboard

### 3. Create Anki cards

```bash
npm start             # Process clips from clipboard

# Or with options
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
| `npm run bookmarklet` | Copy bookmarklet to clipboard |

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
  "ankiNoteType": "Basic (and reversed card)",
  "openaiModel": "gpt-4o-mini",
  "whisperModel": "base",
  "dataDir": "/tmp/yt2anki"
}
```

## Tech Stack

- **yt-dlp** — YouTube audio download
- **ffmpeg** — Audio cutting
- **whisper.cpp** — Local speech-to-text
- **OpenAI API** — IPA + translation
- **AnkiConnect** — Card creation

## License

MIT
