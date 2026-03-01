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

# Install AnkiConnect add-on
# Open Anki → Tools → Add-ons → Get Add-ons → Code: 2055492159 → Restart Anki
```

## Setup

```bash
# Clone and install
git clone https://github.com/USERNAME/yt2anki.git
cd yt2anki
npm install

# Create config file
node src/index.js init

# Add your OpenAI API key
open ~/.yt2anki.json

# Verify setup
node src/index.js test
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
| `npm run clip` | Same as above |
| `npm run clip -- -n` | Dry run (preview without creating cards) |
| `npm run bookmarklet` | Copy bookmarklet to clipboard |
| `node src/index.js test` | Test all integrations |
| `node src/index.js config` | Show current configuration |
| `node src/index.js add <url> -s 0:10 -e 0:15` | Add single card manually |

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
  "whisperModel": "base"
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
