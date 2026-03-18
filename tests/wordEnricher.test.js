import { shouldRetryImageableNounRejection } from "../src/wordEnricher.js"

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
})
