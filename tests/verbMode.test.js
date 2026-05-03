import { jest } from "@jest/globals"

const mockChooseMeaning = jest.fn(async () => ({
  russian: "принадлежать",
  english: "belong",
}))

const mockChooseVerbSentence = jest.fn(async () => ({
  german: "Der Hund gehört meiner Schwester.",
  russian: "Собака принадлежит моей сестре.",
  focusForm: "gehört",
}))

const mockConfirmSentenceVerbSelection = jest.fn(async () => ({
  confirmed: true,
  addDictionaryForm: true,
}))
const mockConfirmPictureVerbSelection = jest.fn(async () => ({
  confirmed: true,
  personalConnection: null,
  addDictionaryForm: false,
}))
const mockChooseImage = jest.fn(async () => ({
  source: "Brave Images",
  downloadUrl: "https://example.com/laufen.jpg",
  previewUrl: "https://example.com/laufen-preview.jpg",
}))

const mockCheckConnection = jest.fn(async () => true)
const mockGetNoteTypes = jest.fn(async () => ["2. Picture Words", "Basic (optional reversed card)"])
const mockEnsureDeck = jest.fn(async () => {})
const mockFindSimilarCards = jest.fn(async () => [])
const mockFindWordDuplicates = jest.fn(async () => ({ exactMatches: [], headwordMatches: [] }))
const mockStoreAudio = jest.fn(async () => "verb-sentence.mp3")
const mockStoreMedia = jest.fn(async () => "verb-image.jpg")
const mockCreateNote = jest.fn(async () => 123)
const mockCreatePictureWordNote = jest.fn(async () => 789)
const mockCreateBasicNote = jest.fn(async () => 456)
const mockGenerateSimpleSpeech = jest.fn(async () => {})
const mockGenerateSpeech = jest.fn(async () => {})
const mockResolveImageAsset = jest.fn(async () => "/tmp/laufen.jpg")
const mockSearchVerbImages = jest.fn(async () => ([{
  source: "Brave Images",
  downloadUrl: "https://example.com/laufen.jpg",
  previewUrl: "https://example.com/laufen-preview.jpg",
}]))
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
  chooseMeaning: mockChooseMeaning,
  chooseImage: mockChooseImage,
}))

jest.unstable_mockModule("../src/verbConfirm.js", () => ({
  chooseVerbSentence: mockChooseVerbSentence,
  confirmPictureVerbSelection: mockConfirmPictureVerbSelection,
  confirmSentenceVerbSelection: mockConfirmSentenceVerbSelection,
  formatVerbPreviewSummary: jest.fn((_chalk, verbData, translation, cefrLevel = null) =>
    `${verbData.infinitive}${cefrLevel ? ` (${cefrLevel})` : ""} — ${translation}`
  ),
  resolveVerbFocusForm: jest.fn((verbData, chosenSentence = null) =>
    chosenSentence?.focusForm ||
    (verbData.displayForm && verbData.displayForm !== verbData.infinitive ? verbData.displayForm : null)
  ),
}))

jest.unstable_mockModule("../src/anki.js", () => ({
  checkConnection: mockCheckConnection,
  createBasicNote: mockCreateBasicNote,
  createNote: mockCreateNote,
  createPictureWordNote: mockCreatePictureWordNote,
  ensureDeck: mockEnsureDeck,
  findSimilarCards: mockFindSimilarCards,
  findWordDuplicates: mockFindWordDuplicates,
  getNoteTypes: mockGetNoteTypes,
  storeAudio: mockStoreAudio,
  storeMedia: mockStoreMedia,
}))

jest.unstable_mockModule("../src/lib/tts.js", () => ({
  generateSimpleSpeech: mockGenerateSimpleSpeech,
  generateSpeech: mockGenerateSpeech,
}))

jest.unstable_mockModule("../src/enricher.js", () => ({
  enrich: jest.fn(async () => ({
    german: "Der Hund gehört meiner Schwester.",
    ipa: "[deːɐ̯ hʊnt ɡəˈhøːrt ˈmaɪ̯nɐ ˈʃvɛstɐ]",
    russian: "Собака принадлежит моей сестре.",
    cefr: { level: "A2" },
  })),
  reviewEnrichedText: jest.fn(),
}))

jest.unstable_mockModule("../src/cefr.js", () => ({
  estimateLexicalCEFR: jest.fn(async () => null),
}))

jest.unstable_mockModule("../src/verbEnricher.js", () => ({
  enrichVerb: jest.fn(),
  hasStructuredVerbAnalysis: jest.fn(() => true),
  shouldOfferDictionaryFormCard: jest.fn(() => true),
}))

jest.unstable_mockModule("../src/lib/wordSources.js", () => ({
  resolveImageAsset: mockResolveImageAsset,
  resolveWordPronunciation: jest.fn(),
  searchVerbImages: mockSearchVerbImages,
}))

const { runVerbWorkflow } = await import("../src/verbMode.js")

describe("verb mode sentence flow", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test("runVerbWorkflow uses the confirmed form-card flag when creating sentence-form verb cards", async () => {
    const added = await runVerbWorkflow("gehören", {
      analysisResult: {
        shouldCreateVerbCard: true,
        infinitive: "gehören",
        displayForm: "gehört",
        ipa: "[ɡəˈhøːʁən]",
        recommendedMode: "sentence-form",
        meanings: [{ russian: "принадлежать", english: "belong" }],
      },
      meaning: "принадлежать",
      sentence: "Der Hund gehört meiner Schwester.",
      deck: "German::Test",
      skipHeader: true,
    })

    expect(added).toBe(true)
    expect(mockCreateNote).toHaveBeenCalledWith(expect.objectContaining({
      german: "Der Hund gehört meiner Schwester.",
      russian: "Собака принадлежит моей сестре.",
      context: "gehört → gehören",
      contextStyle: "plain",
      addReversed: false,
      deck: "German::Test",
      tags: expect.arrayContaining(["mode-verb-sentence"]),
    }))
    expect(mockCreateBasicNote).toHaveBeenCalledWith(expect.objectContaining({
      front: "gehört",
      back: expect.stringContaining('class="yt2anki-ipa"'),
      deck: "German::Test",
      tags: expect.arrayContaining(["mode-verb-dictionary"]),
    }))
  })

  test("runVerbWorkflow omits synthetic fallback context when focus form matches the infinitive", async () => {
    mockChooseVerbSentence.mockResolvedValueOnce({
      german: "Wir müssen das Ziel erreichen.",
      russian: "Мы должны достичь цели.",
      focusForm: "erreichen",
    })
    mockConfirmSentenceVerbSelection.mockResolvedValueOnce({
      confirmed: true,
      addDictionaryForm: false,
    })

    const added = await runVerbWorkflow("erreichen", {
      analysisResult: {
        shouldCreateVerbCard: true,
        infinitive: "erreichen",
        displayForm: "erreichen",
        ipa: "[ɛˈʁaɪ̯çn̩]",
        recommendedMode: "sentence-form",
        meanings: [{ russian: "достигать", english: "reach" }],
      },
      meaning: "достигать",
      sentence: "Wir müssen das Ziel erreichen.",
      deck: "German::Test",
      skipHeader: true,
    })

    expect(added).toBe(true)
    expect(mockCreateNote).toHaveBeenCalledWith(expect.objectContaining({
      context: null,
      contextStyle: "plain",
      deck: "German::Test",
    }))
    expect(mockCreateBasicNote).not.toHaveBeenCalled()
  })

  test("runVerbWorkflow searches picture images after verb preview approval", async () => {
    mockChooseMeaning.mockResolvedValueOnce({
      russian: "бежать",
      english: "run",
    })

    const added = await runVerbWorkflow("laufen", {
      analysisResult: {
        shouldCreateVerbCard: true,
        infinitive: "laufen",
        displayForm: "läuft",
        ipa: "[ˈlaʊ̯fn̩]",
        recommendedMode: "picture-word",
        meanings: [{ russian: "бежать", english: "run" }],
      },
      meaning: "бежать",
      deck: "German::Test",
      skipHeader: true,
    })

    expect(added).toBe(true)
    expect(mockConfirmPictureVerbSelection).toHaveBeenCalledWith(expect.objectContaining({
      imageChoice: null,
      showImage: false,
    }))
    expect(mockConfirmPictureVerbSelection.mock.invocationCallOrder[0]).toBeLessThan(
      mockSearchVerbImages.mock.invocationCallOrder[0]
    )
    expect(mockCreatePictureWordNote).toHaveBeenCalledWith(expect.objectContaining({
      canonical: "laufen",
      imageFilename: "verb-image.jpg",
      imageSource: "Brave Images",
      deck: "German::Test",
    }))
  })
})
