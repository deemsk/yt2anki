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

const mockCheckConnection = jest.fn(async () => true)
const mockGetNoteTypes = jest.fn(async () => ["2. Picture Words", "Basic (optional reversed card)"])
const mockEnsureDeck = jest.fn(async () => {})
const mockFindSimilarCards = jest.fn(async () => [])
const mockStoreAudio = jest.fn(async () => "verb-sentence.mp3")
const mockCreateNote = jest.fn(async () => 123)
const mockCreateBasicNote = jest.fn(async () => 456)
const mockGenerateSpeech = jest.fn(async () => {})
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
  chooseImage: jest.fn(),
}))

jest.unstable_mockModule("../src/verbConfirm.js", () => ({
  chooseVerbSentence: mockChooseVerbSentence,
  confirmPictureVerbSelection: jest.fn(),
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
  createPictureWordNote: jest.fn(),
  ensureDeck: mockEnsureDeck,
  findSimilarCards: mockFindSimilarCards,
  findWordDuplicates: jest.fn(),
  getNoteTypes: mockGetNoteTypes,
  storeAudio: mockStoreAudio,
  storeMedia: jest.fn(),
}))

jest.unstable_mockModule("../src/tts.js", () => ({
  generateSimpleSpeech: jest.fn(),
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

jest.unstable_mockModule("../src/verbEnricher.js", () => ({
  enrichVerb: jest.fn(),
  hasStructuredVerbAnalysis: jest.fn(() => true),
  shouldOfferDictionaryFormCard: jest.fn(() => true),
}))

jest.unstable_mockModule("../src/wordSources.js", () => ({
  resolveImageAsset: jest.fn(),
  resolveWordPronunciation: jest.fn(),
  searchVerbImages: jest.fn(),
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
      context: "gehört -> gehören",
      deck: "German::Test",
      tags: expect.arrayContaining(["mode-verb-sentence"]),
    }))
    expect(mockCreateBasicNote).toHaveBeenCalledWith(expect.objectContaining({
      front: "gehört",
      deck: "German::Test",
      tags: expect.arrayContaining(["mode-verb-dictionary"]),
    }))
  })
})
