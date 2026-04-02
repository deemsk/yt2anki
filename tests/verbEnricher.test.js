import { hasStructuredVerbAnalysis, shouldOfferDictionaryFormCard } from "../src/verbEnricher.js"

describe("verb enricher helpers", () => {
  test("structured analysis requires infinitive, display form, and meanings", () => {
    expect(
      hasStructuredVerbAnalysis({
        infinitive: "laufen",
        displayForm: "läuft",
        meanings: [{ russian: "бежать", english: "run" }],
      })
    ).toBe(true)

    expect(
      hasStructuredVerbAnalysis({
        infinitive: "laufen",
        displayForm: "",
        meanings: [],
      })
    ).toBe(false)
  })

  test("dictionary form card is suggested for non-infinitive display forms", () => {
    expect(
      shouldOfferDictionaryFormCard({
        infinitive: "laufen",
        displayForm: "läuft",
        dictionaryFormNeeded: false,
      })
    ).toBe(true)

    expect(
      shouldOfferDictionaryFormCard({
        infinitive: "laufen",
        displayForm: "laufen",
        dictionaryFormNeeded: false,
      })
    ).toBe(false)
  })

  test("dictionary form flag can force a card even when forms match", () => {
    expect(
      shouldOfferDictionaryFormCard({
        infinitive: "sein",
        displayForm: "sein",
        dictionaryFormNeeded: true,
      })
    ).toBe(true)
  })
})
