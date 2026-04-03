import { buildBareLexicalAdjectiveFallback, canProceedWithWeakWordCard, hasStructuredWordAnalysis, shouldRetryBareLexicalRejection, shouldRetryImageableNounRejection } from "../src/wordEnricher.js"

describe("word enricher retries", () => {
  test("retries false abstract rejection for visible scene nouns like Himmel", () => {
    expect(
      shouldRetryImageableNounRejection("Himmel", {
        shouldCreateWordCard: false,
        rejectionReason: "The input 'himmel' is an abstract noun that does not produce a clear image-based card.",
      })
    ).toBe(true)
  })

  test("does not retry genuinely abstract nouns outside the visual-scene set", () => {
    expect(
      shouldRetryImageableNounRejection("Hoffnung", {
        shouldCreateWordCard: false,
        rejectionReason: "The input 'hoffnung' is an abstract noun that does not produce a clear image-based card.",
      })
    ).toBe(false)
  })

  test("does not retry already accepted nouns", () => {
    expect(
      shouldRetryImageableNounRejection("Himmel", {
        shouldCreateWordCard: true,
        isImageable: true,
      })
    ).toBe(false)
  })

  test("retries generic lexical rejection for frequent bare words like eng", () => {
    expect(
      shouldRetryBareLexicalRejection("eng", {
        shouldCreateWordCard: false,
        lexicalType: "noun",
        rejectionReason: "Input is not a noun or adjective.",
      })
    ).toBe(true)
  })

  test("does not retry obvious verb-style rejections through the bare lexical path", () => {
    expect(
      shouldRetryBareLexicalRejection("machen", {
        shouldCreateWordCard: false,
        rejectionReason: "Input is a verb, not a noun or adjective.",
      })
    ).toBe(false)
  })

  test("does not retry rare unknown bare inputs through the lexical path", () => {
    expect(
      shouldRetryBareLexicalRejection("xqzpt", {
        shouldCreateWordCard: false,
        rejectionReason: "Input is not a noun or adjective.",
      })
    ).toBe(false)
  })

  test("builds a sentence-form adjective fallback for stubborn bare lexical misses", () => {
    expect(
      buildBareLexicalAdjectiveFallback("eng", {
        shouldCreateWordCard: false,
        lexicalType: "noun",
        rejectionReason: "Input is not a noun or adjective.",
      })
    ).toEqual(
      expect.objectContaining({
        lexicalType: "adjective",
        canonical: "eng",
        lemma: "eng",
        recommendedMode: "sentence-form",
        isImageable: false,
      })
    )
  })

  test("allows recoverable abstract-style rejections for usable noun cards like Preis", () => {
    expect(
      canProceedWithWeakWordCard({
        shouldCreateWordCard: false,
        rejectionReason: "The noun 'der Preis' (the price) is abstract and does not produce a clear image-based card.",
        canonical: "der Preis",
        bareNoun: "Preis",
        article: "der",
        gender: "masculine",
        meanings: [{ russian: "цена", english: "price" }],
      })
    ).toBe(true)
  })

  test("allows weekday nouns through the weak-candidate path when noun analysis exists", () => {
    expect(
      canProceedWithWeakWordCard({
        shouldCreateWordCard: false,
        rejectionReason: "Not a noun that produces a clear image-based card; it is a day of the week.",
        canonical: "der Montag",
        bareNoun: "Montag",
        article: "der",
        gender: "masculine",
        meanings: [{ russian: "понедельник", english: "monday" }],
      })
    ).toBe(true)
  })

  test("does not allow non-noun rejections through the weak-candidate path when noun analysis is missing", () => {
    expect(
      canProceedWithWeakWordCard({
        shouldCreateWordCard: false,
        rejectionReason: "The input is a verb, not a noun.",
        canonical: "gehen",
        bareNoun: "gehen",
        meanings: [{ russian: "идти", english: "go" }],
      })
    ).toBe(false)
  })

  test("does not allow weak adjective analyses through the noun recovery path", () => {
    expect(
      canProceedWithWeakWordCard({
        lexicalType: "adjective",
        shouldCreateWordCard: false,
        rejectionReason: "The adjective is too abstract for a picture card.",
        canonical: "wichtig",
        lemma: "wichtig",
        meanings: [{ russian: "важный", english: "important" }],
      })
    ).toBe(false)
  })

  test("keeps structured adjective analyses usable for sentence-form fallback", () => {
    expect(
      hasStructuredWordAnalysis({
        lexicalType: "adjective",
        canonical: "wichtig",
        lemma: "wichtig",
        recommendedMode: "sentence-form",
        meanings: [{ russian: "важный", english: "important" }],
        exampleSentences: [{ german: "Das ist wichtig.", russian: "Это важно." }],
      })
    ).toBe(true)
  })

  test("treats bare adjective normalization as enough to continue into fallback mode", () => {
    expect(
      hasStructuredWordAnalysis({
        lexicalType: "adjective",
        canonical: "gut",
        lemma: "gut",
        recommendedMode: "sentence-form",
      })
    ).toBe(true)
  })
})
