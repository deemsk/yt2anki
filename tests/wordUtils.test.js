import {
  buildWordExtraInfo,
  extractCanonicalWord,
  extractWordMeaning,
  formatGenderColoredWord,
  normalizeWordIpa,
  normalizeGermanForCompare,
  toTagSlug,
} from "../src/wordUtils.js"
import { getWordFrequencyInfo } from "../src/wordFrequency.js"

describe("word helpers", () => {
  test("formatGenderColoredWord wraps canonical noun with inline color", () => {
    const html = formatGenderColoredWord("das Wasser", "neuter")

    expect(html).toContain("das Wasser")
    expect(html).toContain("color:#111111")
  })

  test("buildWordExtraInfo stores hidden metadata for duplicate checks", () => {
    const extra = buildWordExtraInfo({
      meaning: "вода",
      plural: "usually no plural",
      personalConnection: "glass on the kitchen table",
      metadata: {
        canonical: "das Wasser",
        meaning: "вода",
      },
    })

    expect(extractCanonicalWord("", extra)).toBe("das Wasser")
    expect(extractWordMeaning(extra)).toBe("вода")
  })

  test("normalization and tag slug keep canonical noun comparisons stable", () => {
    expect(normalizeGermanForCompare("<span>das Wasser</span>")).toBe("das wasser")
    expect(toTagSlug("das Wasser")).toBe("das-wasser")
  })

  test("normalizeWordIpa keeps noun IPA aligned with the canonical article", () => {
    expect(normalizeWordIpa("die Wohnung", "[ˈvoːnʊŋ]")).toBe("[diː ˈvoːnʊŋ]")
    expect(normalizeWordIpa("die Apotheke", "[diː apɔˈteːkə]")).toBe("[diː apɔˈteːkə]")
    expect(normalizeWordIpa("das Bad", "baːt")).toBe("[das baːt]")
  })

  test("frequency info uses configured learner bands", () => {
    expect(getWordFrequencyInfo("ich")).toEqual(
      expect.objectContaining({
        rank: 1,
        bandKey: "essential",
        bandLabel: "Essential",
      })
    )

    expect(getWordFrequencyInfo("definitely-not-in-frequency-list")).toEqual(
      expect.objectContaining({
        rank: null,
        bandKey: "rare",
        bandLabel: "Rare",
      })
    )
  })
})
