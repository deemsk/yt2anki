import { sanitizeVerbInfinitiveSuggestions, shouldSuggestVerbInfinitive } from "../src/verbCorrection.js"

describe("verb correction helpers", () => {
  test("suggests infinitive recovery for rejected participles", () => {
    expect(
      shouldSuggestVerbInfinitive("verbunden", {
        shouldCreateVerbCard: false,
        rejectionReason: "The input 'verbunden' is a past participle form and does not represent a verb in its infinitive form.",
      })
    ).toBe(true)
  })

  test("does not suggest infinitives for accepted or already normalized verbs", () => {
    expect(
      shouldSuggestVerbInfinitive("laufen", {
        shouldCreateVerbCard: true,
        infinitive: "laufen",
      })
    ).toBe(false)
  })

  test("still suggests recovery when rejected data includes a non-usable infinitive field", () => {
    expect(
      shouldSuggestVerbInfinitive("verbunden", {
        shouldCreateVerbCard: false,
        infinitive: "verbunden",
        rejectionReason: "Past participle form; please provide an infinitive.",
      })
    ).toBe(true)
  })

  test("sanitizes infinitive suggestions", () => {
    expect(
      sanitizeVerbInfinitiveSuggestions("verbunden", {
        suggestions: [
          { text: "verbinden", reason: "infinitive of verbunden" },
          { text: "verbinden", reason: "duplicate" },
          { text: "verbunden" },
          { text: "sich verbinden" },
        ],
      })
    ).toEqual([
      { text: "verbinden", reason: "infinitive of verbunden" },
    ])
  })
})
