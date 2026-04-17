import { jest } from "@jest/globals"

const mockChooseMeaning = jest.fn(async () => ({
  russian: "довольно",
  english: "quite",
}))

const mockChooseImage = jest.fn(async () => null)

const mockConfirmWordSelection = jest.fn(async () => ({
  confirmed: true,
  personalConnection: null,
}))

const mockCheckConnection = jest.fn(async () => true)
const mockGetNoteTypes = jest.fn(async () => ["2. Picture Words", "Basic (optional reversed card)"])
const mockEnsureDeck = jest.fn(async () => {})
const mockFindWordDuplicates = jest.fn(async () => ({ exactMatches: [], headwordMatches: [] }))
const mockStoreAudio = jest.fn(async () => "ziemlich.mp3")
const mockStoreMedia = jest.fn(async () => "unused.jpg")
const mockCreatePictureWordNote = jest.fn(async () => 123)
const mockGenerateSimpleSpeech = jest.fn(async () => {})
const mockResolveWordPronunciation = jest.fn(async () => ({
  ipa: "[ˈtsiːmlɪç]",
  audioPath: null,
  source: "Wiktionary",
}))
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
  chooseWordSentence: jest.fn(),
  confirmSentenceWordSelection: jest.fn(),
  confirmWordSelection: mockConfirmWordSelection,
}))

jest.unstable_mockModule("../src/anki.js", () => ({
  checkConnection: mockCheckConnection,
  createNote: jest.fn(),
  createPictureWordNote: mockCreatePictureWordNote,
  ensureDeck: mockEnsureDeck,
  findSimilarCards: jest.fn(),
  findSentenceWordDuplicates: jest.fn(),
  findWordDuplicates: mockFindWordDuplicates,
  getNoteTypes: mockGetNoteTypes,
  storeAudio: mockStoreAudio,
  storeMedia: mockStoreMedia,
}))

jest.unstable_mockModule("../src/tts.js", () => ({
  generateSimpleSpeech: mockGenerateSimpleSpeech,
  generateSpeech: jest.fn(),
}))

jest.unstable_mockModule("../src/wordSources.js", () => ({
  resolveImageAsset: jest.fn(),
  resolveWordPronunciation: mockResolveWordPronunciation,
  searchWordImages: jest.fn(async () => []),
}))

jest.unstable_mockModule("../src/wordEnricher.js", () => ({
  canProceedWithWeakWordCard: jest.fn(() => false),
  enrichWord: jest.fn(),
  hasStructuredWordAnalysis: jest.fn(() => true),
}))

jest.unstable_mockModule("../src/enricher.js", () => ({
  enrich: jest.fn(),
  reviewEnrichedText: jest.fn(),
}))

jest.unstable_mockModule("../src/cefr.js", () => ({
  estimateLexicalCEFR: jest.fn(async () => null),
}))

const { runWordWorkflow } = await import("../src/wordMode.js")

describe("word mode picture flow", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test("runWordWorkflow can create a picture-word note without an image", async () => {
    const added = await runWordWorkflow("ziemlich", {
      analysisResult: {
        shouldCreateWordCard: true,
        isImageable: true,
        recommendedMode: "picture-word",
        lexicalType: "adjective",
        canonical: "ziemlich",
        lemma: "ziemlich",
        meanings: [{ russian: "довольно", english: "quite" }],
        exampleSentences: [],
      },
      meaning: "довольно",
      deck: "German::Test",
      skipHeader: true,
    })

    expect(added).toBe(true)
    expect(mockChooseImage).toHaveBeenCalled()
    expect(mockStoreMedia).not.toHaveBeenCalled()
    expect(mockStoreAudio).toHaveBeenCalled()
    expect(mockCreatePictureWordNote).toHaveBeenCalledWith(expect.objectContaining({
      canonical: "ziemlich",
      imageFilename: null,
      imageSource: "none",
      deck: "German::Test",
    }))
  })
})
