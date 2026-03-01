# yt2anki

Create Anki flashcards from YouTube videos for German learning.

## Features

- Mark timestamps while watching YouTube in Safari
- Automatically download and cut audio clips
- Transcribe German speech using local Whisper
- Get IPA transcription and Russian translation via OpenAI
- Create Anki cards with audio via AnkiConnect

## Prerequisites

```bash
# Install whisper-cpp
brew install whisper-cpp

# Download German model (run once)
whisper-cpp-model-download base

# Install AnkiConnect add-on in Anki
# Tools → Add-ons → Get Add-ons → Code: 2055492159
```

## Setup

```bash
# Install dependencies
npm install

# Set OpenAI API key
export OPENAI_API_KEY="sk-..."

# Check setup
node src/index.js check
```

## Usage

### 1. Mark clips in Safari

1. Create a bookmark with this URL (from `bookmarklet/bookmarklet.txt`)
2. Open a YouTube video
3. Click the bookmarklet
4. Press **M** to mark start, **M** again to mark end
5. Repeat for multiple clips
6. Press **E** to export JSON file

### 2. Process markers

```bash
# Process all marked clips
node src/index.js process ~/Downloads/yt2anki-markers-*.json

# Or add single card manually
node src/index.js add "https://youtu.be/VIDEO_ID" --start 1:23 --end 1:27
```

## Card Format

| Front | Back |
|-------|------|
| German text | Russian translation |
| [audio] | |
| IPA transcription | |

## Configuration

Edit `src/config.js` to change:

- `ankiDeck` - Target deck name (default: `German::YouTube`)
- `ankiNoteType` - Note type (default: `Basic (and reversed card)`)
- `whisperModel` - Whisper model size (default: `base`)
- `openaiModel` - OpenAI model (default: `gpt-4o-mini`)

## Keyboard Shortcuts (in bookmarklet)

| Key | Action |
|-----|--------|
| M | Mark start/end |
| E | Export JSON |
| H | Hide/show panel |
