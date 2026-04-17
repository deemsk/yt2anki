import { chooseLexicalRouteFromAnalyses, normalizeLexicalInput } from "../src/lexicalMode.js"

describe("lexical mode router", () => {
  test("normalizeLexicalInput joins variadic command parts into one lexical item", () => {
    expect(normalizeLexicalInput(["das", "Wasser"])).toBe("das Wasser")
    expect(normalizeLexicalInput([])).toBe("")
  })

  test("chooseLexicalRouteFromAnalyses routes noun/adjective inputs automatically", () => {
    const result = chooseLexicalRouteFromAnalyses(
      {
        lexicalType: "noun",
        canonical: "das Wasser",
        shouldCreateWordCard: true,
        meanings: [{ russian: "вода" }],
      },
      {
        infinitive: "",
        shouldCreateVerbCard: false,
        meanings: [],
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        route: "word",
        reason: "word-only",
      })
    )
  })

  test("chooseLexicalRouteFromAnalyses routes adverb inputs through the word workflow", () => {
    const result = chooseLexicalRouteFromAnalyses(
      {
        lexicalType: "adverb",
        canonical: "sofort",
        lemma: "sofort",
        shouldCreateWordCard: false,
        exampleSentences: [{ german: "Komm sofort.", russian: "Иди немедленно." }],
      },
      {
        infinitive: "",
        shouldCreateVerbCard: false,
        meanings: [],
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        route: "word",
        reason: "word-only",
      })
    )
  })

  test("chooseLexicalRouteFromAnalyses routes verb inputs automatically", () => {
    const result = chooseLexicalRouteFromAnalyses(
      {
        lexicalType: "noun",
        canonical: "laufen",
        shouldCreateWordCard: false,
        meanings: [],
      },
      {
        infinitive: "laufen",
        displayForm: "laufen",
        shouldCreateVerbCard: true,
        meanings: [{ russian: "бежать" }],
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        route: "verb",
        reason: "verb-only",
      })
    )
  })

  test("chooseLexicalRouteFromAnalyses marks both plausible analyses as ambiguous", () => {
    const result = chooseLexicalRouteFromAnalyses(
      {
        lexicalType: "adjective",
        canonical: "offen",
        lemma: "offen",
        shouldCreateWordCard: true,
        meanings: [{ russian: "открытый" }],
      },
      {
        infinitive: "offen",
        displayForm: "offen",
        shouldCreateVerbCard: true,
        meanings: [{ russian: "раскрывать" }],
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        route: null,
        reason: "both-plausible",
      })
    )
  })

  test("chooseLexicalRouteFromAnalyses marks both weak analyses as ambiguous", () => {
    const result = chooseLexicalRouteFromAnalyses(
      {
        lexicalType: "noun",
        canonical: "xyz",
        shouldCreateWordCard: false,
        meanings: [],
      },
      {
        infinitive: "",
        shouldCreateVerbCard: false,
        meanings: [],
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        route: null,
        reason: "both-weak",
      })
    )
  })
})
