import { buildSentenceImageMeaning, resolveWordAudioPlan } from "../src/wordMode.js"

describe("word mode sentence image helpers", () => {
  test("resolveWordAudioPlan keeps noun TTS on the canonical form with article", () => {
    expect(
      resolveWordAudioPlan({
        lexicalType: "noun",
        canonical: "der Arzt",
        lemma: "Arzt",
      })
    ).toEqual(
      expect.objectContaining({
        spokenText: "der Arzt",
        preferHumanAudio: false,
      })
    )
  })

  test("resolveWordAudioPlan still allows human pronunciation audio for non-nouns", () => {
    expect(
      resolveWordAudioPlan({
        lexicalType: "adjective",
        canonical: "früh",
        lemma: "früh",
      })
    ).toEqual(
      expect.objectContaining({
        spokenText: "früh",
        preferHumanAudio: true,
      })
    )
  })

  test("resolveWordAudioPlan treats adverbs like sentence-based lexical items", () => {
    expect(
      resolveWordAudioPlan({
        lexicalType: "adverb",
        canonical: "sofort",
        lemma: "sofort",
      })
    ).toEqual(
      expect.objectContaining({
        spokenText: "sofort",
        preferHumanAudio: true,
      })
    )
  })

  test("buildSentenceImageMeaning prefers noun-anchored adjective phrases before bare adjective glosses", () => {
    const meaning = buildSentenceImageMeaning(
      {
        russian: "уродливый",
        english: "ugly",
        imageSearchTerms: ["hässlich"],
      },
      {
        german: "Ich finde das Kleid hässlich.",
        focusForm: "hässlich",
      },
      {
        canonical: "hässlich",
        lexicalType: "adjective",
      }
    )

    expect(meaning.imageSearchTerms.slice(0, 3)).toEqual([
      "das Kleid hässlich",
      "Kleid hässlich",
      "Ich finde das Kleid hässlich",
    ])
    expect(meaning.imageSearchTerms).toContain("hässlich")
  })

  test("buildSentenceImageMeaning prioritizes AI visual brief queries before heuristic sentence terms", () => {
    const meaning = buildSentenceImageMeaning(
      {
        russian: "уродливый",
        english: "ugly",
        imageSearchTerms: ["hässlich"],
      },
      {
        german: "Ich finde das Kleid hässlich.",
        focusForm: "hässlich",
        imageBrief: {
          searchQuery: "hässliches Kleid",
          queryVariants: ["unschönes Kleid", "Kleid mit hässlichem Muster"],
          mustShow: ["dress main subject"],
          avoid: ["meme cartoon"],
        },
      },
      {
        canonical: "hässlich",
        lexicalType: "adjective",
      }
    )

    expect(meaning.imageSearchTerms.slice(0, 5)).toEqual([
      "hässliches Kleid",
      "unschönes Kleid",
      "Kleid mit hässlichem Muster",
      "das Kleid hässlich",
      "Kleid hässlich",
    ])
    expect(meaning.visualBrief).toEqual(
      expect.objectContaining({
        searchQuery: "hässliches Kleid",
      })
    )
  })
})
