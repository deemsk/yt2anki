import { jest } from "@jest/globals"

const mockChooseMeaning = jest.fn(async () => ({
  russian: "большой",
  english: "big",
}))

const mockChooseWordSentence = jest.fn(async () => ({
  german: "Das Haus ist groß.",
  russian: "Дом большой.",
  focusForm: "groß",
}))

const mockChooseImage = jest.fn(async () => ({
  source: "Brave Images",
  downloadUrl: "https://example.com/gross.jpg",
  previewUrl: "https://example.com/gross-preview.jpg",
}))

const mockConfirmSentenceWordSelection = jest.fn(async () => ({
  confirmed: true,
}))

const mockCheckConnection = jest.fn(async () => true)
const mockGetNoteTypes = jest.fn(async () => ["2. Picture Words", "Basic (optional reversed card)"])
const mockEnsureDeck = jest.fn(async () => {})
const mockFindSentenceWordDuplicates = jest.fn(async () => ({ exactMatches: [], headwordMatches: [] }))
const mockFindSimilarCards = jest.fn(async () => [])
const mockStoreAudio = jest.fn(async () => "word-sentence.mp3")
const mockStoreMedia = jest.fn(async () => "word-sentence-image.jpg")
const mockCreateNote = jest.fn(async () => 123)
const mockGenerateSpeech = jest.fn(async () => {})
const mockResolveImageAsset = jest.fn(async () => "/tmp/gross.jpg")
const mockSpinnerFactory = jest.fn(() => ({
  start: jest.fn(),
  succeed: jest.fn(),
  stop: jest.fn(),
  warn: jest.fn(),
  fail: jest.fn(),
}))

jest.unstable_mockModule("ora", () => ({
  default: mockSpinnerFactory,
}))

jest.unstable_mockModule("../src/wordConfirm.js", () => ({
  chooseImage: mockChooseImage,
  chooseMeaning: mockChooseMeaning,
  chooseWordSentence: mockChooseWordSentence,
  confirmSentenceWordSelection: mockConfirmSentenceWordSelection,
  confirmWordSelection: jest.fn(),
}))

jest.unstable_mockModule("../src/anki.js", () => ({
  checkConnection: mockCheckConnection,
  createNote: mockCreateNote,
  createPictureWordNote: jest.fn(),
  ensureDeck: mockEnsureDeck,
  findSimilarCards: mockFindSimilarCards,
  findSentenceWordDuplicates: mockFindSentenceWordDuplicates,
  findWordDuplicates: jest.fn(),
  getNoteTypes: mockGetNoteTypes,
  storeAudio: mockStoreAudio,
  storeMedia: mockStoreMedia,
}))

jest.unstable_mockModule("../src/tts.js", () => ({
  generateSimpleSpeech: jest.fn(),
  generateSpeech: mockGenerateSpeech,
}))

jest.unstable_mockModule("../src/wordSources.js", () => ({
  resolveImageAsset: mockResolveImageAsset,
  resolveWordPronunciation: jest.fn(),
  searchWordImages: jest.fn(async () => ([{
    source: "Brave Images",
    downloadUrl: "https://example.com/gross.jpg",
    previewUrl: "https://example.com/gross-preview.jpg",
  }])),
}))

jest.unstable_mockModule("../src/wordEnricher.js", () => ({
  canProceedWithWeakWordCard: jest.fn(() => false),
  enrichWord: jest.fn(),
  hasStructuredWordAnalysis: jest.fn(() => true),
}))

jest.unstable_mockModule("../src/enricher.js", () => ({
  enrich: jest.fn(async () => ({
    german: "Das Haus ist groß.",
    ipa: "[das haʊs ɪst ɡʁoːs]",
    russian: "Дом большой.",
    cefr: { level: "A1" },
  })),
  reviewEnrichedText: jest.fn(),
}))

jest.unstable_mockModule("../src/cefr.js", () => ({
  estimateLexicalCEFR: jest.fn(async () => null),
}))

const { runWordWorkflow } = await import("../src/wordMode.js")

describe("word mode sentence flow", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test("runWordWorkflow renders adjective contrast separately instead of auto context text", async () => {
    const added = await runWordWorkflow("groß", {
      analysisResult: {
        shouldCreateWordCard: true,
        isImageable: false,
        recommendedMode: "sentence-form",
        lexicalType: "adjective",
        canonical: "groß",
        lemma: "groß",
        opposite: "klein",
        meanings: [{ russian: "большой", english: "big" }],
        exampleSentences: [{ german: "Das Haus ist groß.", russian: "Дом большой." }],
      },
      meaning: "большой",
      sentence: "Das Haus ist groß.",
      deck: "German::Test",
      skipHeader: true,
    })

    expect(added).toBe(true)
    expect(mockCreateNote).toHaveBeenCalledWith(expect.objectContaining({
      german: "Das Haus ist groß.",
      imageFilename: "word-sentence-image.jpg",
      deck: "German::Test",
    }))

    const payload = mockCreateNote.mock.calls[0][0]
    expect(payload.context).toBeUndefined()
    expect(payload.frontFooterHtml).toContain("Contrast")
    expect(payload.frontFooterHtml).toContain("klein")
  })
})
