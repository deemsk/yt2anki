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
const mockFindLexicalClozeDuplicates = jest.fn(async () => ({ exactMatches: [], headwordMatches: [] }))
const mockFindSimilarCards = jest.fn(async () => [])
const mockStoreAudio = jest.fn(async (path = "") =>
  String(path).includes("word_sentence") ? "word-sentence.mp3" : "word-target.mp3"
)
const mockStoreMedia = jest.fn(async () => "word-sentence-image.jpg")
const mockCreateBasicNote = jest.fn(async () => 789)
const mockCreateClozeNote = jest.fn(async () => 456)
const mockCreateNote = jest.fn(async () => 123)
const mockGenerateSimpleSpeech = jest.fn(async () => {})
const mockGenerateSpeech = jest.fn(async () => {})
const mockResolveWordPronunciation = jest.fn(async () => ({
  ipa: "[ɡʁoːs]",
  audioPath: "/tmp/gross-human.mp3",
  source: "Wiktionary/Wikimedia",
}))
const mockResolveImageAsset = jest.fn(async () => "/tmp/gross.jpg")
const mockSearchWordImages = jest.fn(async () => ([{
  source: "Brave Images",
  downloadUrl: "https://example.com/gross.jpg",
  previewUrl: "https://example.com/gross-preview.jpg",
}]))
const mockReviewEnrichedText = jest.fn()
const mockEnrich = jest.fn(async () => ({
  german: "Das Haus ist groß.",
  ipa: "[das haʊs ɪst ɡʁoːs]",
  russian: "Дом большой.",
  cefr: { level: "A1" },
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
  chooseWordSentence: mockChooseWordSentence,
  confirmSentenceWordSelection: mockConfirmSentenceWordSelection,
  confirmWordSelection: jest.fn(),
}))

jest.unstable_mockModule("../src/anki.js", () => ({
  checkConnection: mockCheckConnection,
  createBasicNote: mockCreateBasicNote,
  createClozeNote: mockCreateClozeNote,
  createNote: mockCreateNote,
  createPictureWordNote: jest.fn(),
  ensureDeck: mockEnsureDeck,
  findLexicalClozeDuplicates: mockFindLexicalClozeDuplicates,
  findSimilarCards: mockFindSimilarCards,
  findSentenceWordDuplicates: mockFindSentenceWordDuplicates,
  findWordDuplicates: jest.fn(),
  getNoteTypes: mockGetNoteTypes,
  storeAudio: mockStoreAudio,
  storeMedia: mockStoreMedia,
}))

jest.unstable_mockModule("../src/lib/tts.js", () => ({
  generateSimpleSpeech: mockGenerateSimpleSpeech,
  generateSpeech: mockGenerateSpeech,
}))

jest.unstable_mockModule("../src/lib/wordSources.js", () => ({
  resolveImageAsset: mockResolveImageAsset,
  resolveWordPronunciation: mockResolveWordPronunciation,
  searchWordImages: mockSearchWordImages,
}))

jest.unstable_mockModule("../src/wordEnricher.js", () => ({
  canProceedWithWeakWordCard: jest.fn(() => false),
  enrichWord: jest.fn(),
  hasStructuredWordAnalysis: jest.fn(() => true),
}))

jest.unstable_mockModule("../src/enricher.js", () => ({
  enrich: mockEnrich,
  reviewEnrichedText: mockReviewEnrichedText,
}))

jest.unstable_mockModule("../src/cefr.js", () => ({
  estimateLexicalCEFR: jest.fn(async () => null),
}))

const { runWordWorkflow } = await import("../src/wordMode.js")

describe("word mode sentence flow", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockChooseMeaning.mockResolvedValue({
      russian: "большой",
      english: "big",
    })
    mockFindLexicalClozeDuplicates.mockResolvedValue({ exactMatches: [], headwordMatches: [] })
    mockCreateClozeNote.mockResolvedValue(456)
    mockResolveWordPronunciation.mockResolvedValue({
      ipa: "[ɡʁoːs]",
      audioPath: "/tmp/gross-human.mp3",
      source: "Wiktionary/Wikimedia",
    })
    mockChooseWordSentence.mockResolvedValue({
      german: "Das Haus ist groß.",
      russian: "Дом большой.",
      focusForm: "groß",
    })
    mockChooseImage.mockResolvedValue({
      source: "Brave Images",
      downloadUrl: "https://example.com/gross.jpg",
      previewUrl: "https://example.com/gross-preview.jpg",
    })
    mockConfirmSentenceWordSelection.mockResolvedValue({
      confirmed: true,
    })
    mockSearchWordImages.mockResolvedValue([{
      source: "Brave Images",
      downloadUrl: "https://example.com/gross.jpg",
      previewUrl: "https://example.com/gross-preview.jpg",
    }])
    mockReviewEnrichedText.mockReset()
    mockEnrich.mockResolvedValue({
      german: "Das Haus ist groß.",
      ipa: "[das haʊs ɪst ɡʁoːs]",
      russian: "Дом большой.",
      cefr: { level: "A1" },
    })
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
    expect(mockConfirmSentenceWordSelection).toHaveBeenCalledWith(expect.objectContaining({
      imageChoice: null,
      showImage: false,
    }))
    expect(mockConfirmSentenceWordSelection.mock.invocationCallOrder[0]).toBeLessThan(
      mockSearchWordImages.mock.invocationCallOrder[0]
    )
    expect(mockCreateNote).toHaveBeenCalledWith(expect.objectContaining({
      german: "Das Haus ist groß.",
      imageFilename: "word-sentence-image.jpg",
      addReversed: false,
      deck: "German::Test",
    }))
    expect(mockCreateBasicNote).toHaveBeenCalledWith(expect.objectContaining({
      front: expect.stringContaining("[sound:word-target.mp3]"),
      back: expect.stringContaining("большой"),
      addReversed: true,
      deck: "German::Test",
      tags: expect.arrayContaining([
        "mode-word-main",
        "word-adjective",
        "lemma-gross",
        "canonical-gross",
        "intent-word-main",
        "trains-meaning-recall",
        "trains-active-production",
      ]),
    }))
    expect(mockCreateBasicNote.mock.calls[0][0].front).toContain("groß")
    expect(mockResolveWordPronunciation).toHaveBeenCalledWith(expect.objectContaining({
      canonical: "groß",
      lexicalType: "adjective",
    }))
    expect(mockGenerateSimpleSpeech).not.toHaveBeenCalled()

    const payload = mockCreateNote.mock.calls[0][0]
    expect(payload.context).toBeUndefined()
    expect(payload.frontFooterHtml).toContain("Contrast")
    expect(payload.frontFooterHtml).toContain("klein")
  })

  test("runWordWorkflow creates sentence-form adverb notes without adjective contrast UI", async () => {
    mockChooseMeaning.mockResolvedValue({
      russian: "сразу",
      english: "immediately",
    })
    mockChooseWordSentence.mockResolvedValue({
      german: "Komm sofort.",
      russian: "Иди немедленно.",
      focusForm: "sofort",
    })
    mockEnrich.mockResolvedValue({
      german: "Komm sofort.",
      ipa: "[kɔm zɔˈfɔʁt]",
      russian: "Иди немедленно.",
      cefr: { level: "A1" },
    })

    const added = await runWordWorkflow("sofort", {
      analysisResult: {
        shouldCreateWordCard: false,
        isImageable: false,
        recommendedMode: "sentence-form",
        lexicalType: "adverb",
        canonical: "sofort",
        lemma: "sofort",
        meanings: [{ russian: "сразу", english: "immediately" }],
        exampleSentences: [{ german: "Komm sofort.", russian: "Иди немедленно." }],
      },
      meaning: "сразу",
      sentence: "Komm sofort.",
      deck: "German::Test",
      skipHeader: true,
    })

    expect(added).toBe(true)

    const payload = mockCreateNote.mock.calls.at(-1)[0]
    expect(payload.german).toBe("Komm sofort.")
    expect(payload.metadata.lexicalType).toBe("adverb")
    expect(payload.tags).toContain("word-adverb")
    expect(payload.frontFooterHtml).toBe(null)
    expect(mockCreateBasicNote).not.toHaveBeenCalled()
  })

  test("runWordWorkflow creates cloze notes for lexical function words", async () => {
    mockChooseMeaning.mockResolvedValue({
      russian: "но",
      english: "but",
    })
    mockChooseWordSentence.mockResolvedValue({
      german: "Ich bin müde, aber ich komme.",
      russian: "Я устал, но я приду.",
      focusForm: "aber",
    })
    mockEnrich.mockResolvedValue({
      german: "Ich bin müde, aber ich komme.",
      ipa: "[ɪç bɪn ˈmyːdə ˈaːbɐ ɪç ˈkɔmə]",
      russian: "Я устал, но я приду.",
      cefr: { level: "A1" },
    })

    const added = await runWordWorkflow("aber", {
      analysisResult: {
        shouldCreateWordCard: true,
        isImageable: false,
        imageabilityReason: "function word; learned through sentence context",
        recommendedMode: "cloze-form",
        lexicalType: "conjunction",
        canonical: "aber",
        lemma: "aber",
        clozeHint: "contrast connector",
        meanings: [{ russian: "но", english: "but" }],
        exampleSentences: [{ german: "Ich bin müde, aber ich komme.", russian: "Я устал, но я приду.", focusForm: "aber" }],
      },
      meaning: "но",
      sentence: "Ich bin müde, aber ich komme.",
      deck: "German::Test",
      skipHeader: true,
    })

    expect(added).toBe(true)
    expect(mockCreateNote).not.toHaveBeenCalled()
    expect(mockSearchWordImages).not.toHaveBeenCalled()
    expect(mockCreateBasicNote).not.toHaveBeenCalled()
    expect(mockCreateClozeNote).toHaveBeenCalledWith(expect.objectContaining({
      text: "Ich bin müde, {{c1::aber::contrast connector}} ich komme.",
      deck: "German::Test",
      tags: expect.arrayContaining([
        "mode-lexical-cloze",
        "word-conjunction",
        "lemma-aber",
        "canonical-aber",
        "intent-lexical-cloze",
        "trains-function-word-recall",
        "trains-grammar-pattern",
      ]),
    }))
    expect(mockCreateClozeNote.mock.calls[0][0].extra).toContain("yt2anki-word")
    expect(mockCreateClozeNote.mock.calls[0][0].extra).toContain("Pattern:")
    expect(mockCreateClozeNote.mock.calls[0][0].extra).toContain("Я устал, но я приду.")
  })

  test("runWordWorkflow creates cloze notes for non-curated LLM-classified connectors", async () => {
    mockChooseMeaning.mockResolvedValue({
      russian: "чтобы",
      english: "so that",
    })
    mockChooseWordSentence.mockResolvedValue({
      german: "Ich lerne, damit ich die Prüfung bestehe.",
      russian: "Я учусь, чтобы сдать экзамен.",
      focusForm: "damit",
    })
    mockEnrich.mockResolvedValue({
      german: "Ich lerne, damit ich die Prüfung bestehe.",
      ipa: "[ɪç ˈlɛʁnə daˈmɪt ɪç diː ˈpʁyːfʊŋ bəˈʃteːə]",
      russian: "Я учусь, чтобы сдать экзамен.",
      cefr: { level: "A2" },
    })

    const added = await runWordWorkflow("damit", {
      analysisResult: {
        shouldCreateWordCard: true,
        isImageable: false,
        imageabilityReason: "connector learned through sentence context",
        recommendedMode: "cloze-form",
        lexicalType: "subjunction",
        canonical: "damit",
        lemma: "damit",
        clozeHint: "so that + subordinate clause",
        meanings: [{ russian: "чтобы", english: "so that" }],
        exampleSentences: [{ german: "Ich lerne, damit ich die Prüfung bestehe.", russian: "Я учусь, чтобы сдать экзамен.", focusForm: "damit" }],
      },
      meaning: "чтобы",
      sentence: "Ich lerne, damit ich die Prüfung bestehe.",
      deck: "German::Test",
      skipHeader: true,
    })

    expect(added).toBe(true)
    expect(mockCreateClozeNote).toHaveBeenCalledWith(expect.objectContaining({
      text: "Ich lerne, {{c1::damit::so that + subordinate clause}} ich die Prüfung bestehe.",
      tags: expect.arrayContaining([
        "mode-lexical-cloze",
        "word-subjunction",
        "lemma-damit",
      ]),
    }))
  })

  test("runWordWorkflow honors cloze-form for non-curated adverbs", async () => {
    mockChooseMeaning.mockResolvedValue({
      russian: "никогда",
      english: "never",
    })
    mockChooseWordSentence.mockResolvedValue({
      german: "Ich trinke nie Kaffee.",
      russian: "Я никогда не пью кофе.",
      focusForm: "nie",
    })
    mockEnrich.mockResolvedValue({
      german: "Ich trinke nie Kaffee.",
      ipa: "[ɪç ˈtʁɪŋkə niː ˈkafeː]",
      russian: "Я никогда не пью кофе.",
      cefr: { level: "A1" },
    })

    const added = await runWordWorkflow("nie", {
      analysisResult: {
        shouldCreateWordCard: true,
        isImageable: false,
        imageabilityReason: "frequency adverb learned through sentence context",
        recommendedMode: "cloze-form",
        lexicalType: "adverb",
        canonical: "nie",
        lemma: "nie",
        clozeHint: "frequency adverb",
        meanings: [{ russian: "никогда", english: "never" }],
        exampleSentences: [{ german: "Ich trinke nie Kaffee.", russian: "Я никогда не пью кофе.", focusForm: "nie" }],
      },
      meaning: "никогда",
      sentence: "Ich trinke nie Kaffee.",
      deck: "German::Test",
      skipHeader: true,
    })

    expect(added).toBe(true)
    expect(mockCreateClozeNote).toHaveBeenCalledWith(expect.objectContaining({
      text: "Ich trinke {{c1::nie::frequency adverb}} Kaffee.",
      tags: expect.arrayContaining([
        "mode-lexical-cloze",
        "word-adverb",
        "lemma-nie",
      ]),
    }))
  })

  test("runWordWorkflow skips lexical cloze duplicates before enriching the sentence", async () => {
    mockChooseMeaning.mockResolvedValue({
      russian: "ничего",
      english: "nothing",
    })
    mockChooseWordSentence.mockResolvedValue({
      german: "Ich sehe nichts.",
      russian: "Я ничего не вижу.",
      focusForm: "nichts",
    })
    mockFindLexicalClozeDuplicates.mockResolvedValue({
      exactMatches: [{ noteId: 99, canonical: "nichts", meaning: "ничего" }],
      headwordMatches: [],
    })

    const added = await runWordWorkflow("nichts", {
      analysisResult: {
        shouldCreateWordCard: true,
        isImageable: false,
        recommendedMode: "cloze-form",
        lexicalType: "pronoun",
        canonical: "nichts",
        lemma: "nichts",
        meanings: [{ russian: "ничего", english: "nothing" }],
        exampleSentences: [{ german: "Ich sehe nichts.", russian: "Я ничего не вижу.", focusForm: "nichts" }],
      },
      meaning: "ничего",
      sentence: "Ich sehe nichts.",
      deck: "German::Test",
      skipHeader: true,
    })

    expect(added).toBe(false)
    expect(mockEnrich).not.toHaveBeenCalled()
    expect(mockCreateClozeNote).not.toHaveBeenCalled()
  })

  test("sentence review waits to search images until final approval", async () => {
    mockConfirmSentenceWordSelection
      .mockResolvedValueOnce({ reviewFeedback: "Use coffee instead." })
      .mockResolvedValueOnce({ confirmed: true })
    mockReviewEnrichedText.mockResolvedValue({
      german: "Der Kaffee ist groß.",
      ipa: "[deːɐ̯ ˈkafeː ɪst ɡʁoːs]",
      russian: "Кофе большой.",
      cefr: { level: "A1" },
    })

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
    expect(mockReviewEnrichedText).toHaveBeenCalledWith(
      expect.objectContaining({ german: "Das Haus ist groß." }),
      "Use coffee instead.",
      expect.not.objectContaining({ includeImageBrief: true })
    )
    expect(mockSearchWordImages).toHaveBeenCalledTimes(1)
    expect(mockChooseImage).toHaveBeenCalledTimes(1)
    expect(mockConfirmSentenceWordSelection.mock.invocationCallOrder[1]).toBeLessThan(
      mockSearchWordImages.mock.invocationCallOrder[0]
    )

    const payload = mockCreateNote.mock.calls.at(-1)[0]
    expect(payload.german).toBe("Der Kaffee ist groß.")
    expect(payload.imageFilename).toBe("word-sentence-image.jpg")
  })

  test("translation-only sentence review still searches images after final approval", async () => {
    mockConfirmSentenceWordSelection
      .mockResolvedValueOnce({ reviewFeedback: "Improve the Russian only." })
      .mockResolvedValueOnce({ confirmed: true })
    mockReviewEnrichedText.mockResolvedValue({
      german: "Das Haus ist groß.",
      ipa: "[das haʊs ɪst ɡʁoːs]",
      russian: "Этот дом большой.",
      cefr: { level: "A1" },
    })

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
    expect(mockSearchWordImages).toHaveBeenCalledTimes(1)
    expect(mockChooseImage).toHaveBeenCalledTimes(1)
    expect(mockConfirmSentenceWordSelection.mock.invocationCallOrder[1]).toBeLessThan(
      mockSearchWordImages.mock.invocationCallOrder[0]
    )

    const payload = mockCreateNote.mock.calls.at(-1)[0]
    expect(payload.german).toBe("Das Haus ist groß.")
    expect(payload.russian).toBe("Этот дом большой.")
    expect(payload.imageFilename).toBe("word-sentence-image.jpg")
  })
})
