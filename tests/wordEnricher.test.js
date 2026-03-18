import { canProceedWithWeakWordCard, shouldRetryImageableNounRejection } from "../src/wordEnricher.js"

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
})
