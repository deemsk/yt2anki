import {
  applyChosenSentenceGloss,
  buildWordExtraInfo,
  extractLeadingArticle,
  extractCanonicalWord,
  extractWordLexicalType,
  extractWordMeaning,
  formatGenderColoredWord,
  formatIpaHtml,
  formatPronunciationField,
  getArticleNormalizationWarning,
  getWordLemma,
  normalizeWordIpa,
  normalizeGermanForCompare,
  toTagSlug,
} from "../src/wordUtils.js"
import { getWordFrequencyInfo } from "../src/wordFrequency.js"

describe("word helpers", () => {
  test("formatGenderColoredWord wraps canonical noun with inline color", () => {
    const html = formatGenderColoredWord("das Wasser", "neuter")

    expect(html).toContain("das Wasser")
    expect(html).toContain('class="yt2anki-gender yt2anki-gender-neuter"')
    expect(html).toContain("color:var(--yt2anki-gender-neuter, #0f766e)")
  })

  test("formatIpaHtml renders IPA as neutral secondary text", () => {
    const html = formatIpaHtml("[das baːt]")

    expect(html).toContain('class="yt2anki-ipa"')
    expect(html).toContain("color:var(--yt2anki-ipa, #475569)")
    expect(html).toContain("[das baːt]")
  })

  test("formatPronunciationField joins audio and formatted IPA", () => {
    const field = formatPronunciationField("bad.mp3", "[das baːt]")

    expect(field).toBe('[sound:bad.mp3]<br><span class="yt2anki-ipa" style="color:var(--yt2anki-ipa, #475569);font-size:0.92em;font-style:italic;">[das baːt]</span>')
  })

  test("buildWordExtraInfo stores hidden metadata for duplicate checks", () => {
    const extra = buildWordExtraInfo({
      meaning: "вода",
      plural: "usually no plural",
      contrast: "сухой",
      personalConnection: "glass on the kitchen table",
      metadata: {
        canonical: "das Wasser",
        meaning: "вода",
        lexicalType: "noun",
      },
    })

    expect(extractCanonicalWord("", extra)).toBe("das Wasser")
    expect(extractWordMeaning(extra)).toBe("вода")
    expect(extractWordLexicalType(extra)).toBe("noun")
  })

  test("buildWordExtraInfo can render noun meaning without the visible label and include sentence translation", () => {
    const extra = buildWordExtraInfo({
      meaning: "вода",
      plainMeaning: true,
      plural: "usually no plural",
      exampleSentence: "Das Wasser ist kalt.",
      exampleSentenceTranslation: "Вода холодная.",
      metadata: {
        canonical: "das Wasser",
        meaning: "вода",
        lexicalType: "noun",
      },
    })

    expect(extra).toContain("<div>вода</div>")
    expect(extra).not.toContain("Meaning:")
    expect(extra).toContain("Example: Das Wasser ist kalt.")
    expect(extra).toContain("<small>Вода холодная.</small>")
    expect(extractWordMeaning(extra)).toBe("вода")
  })

  test("normalization and tag slug keep canonical noun comparisons stable", () => {
    expect(normalizeGermanForCompare("<span>das Wasser</span>")).toBe("das wasser")
    expect(toTagSlug("das Wasser")).toBe("das-wasser")
  })

  test("article helpers detect and report corrected articles", () => {
    expect(extractLeadingArticle("das Montag")).toBe("das")
    expect(extractLeadingArticle("Montag")).toBe(null)
    expect(getArticleNormalizationWarning("das Montag", "der Montag")).toBe('Normalized "das Montag" to "der Montag"')
    expect(getArticleNormalizationWarning("der Montag", "der Montag")).toBe(null)
    expect(getArticleNormalizationWarning("Montag", "der Montag")).toBe(null)
  })

  test("normalizeWordIpa keeps noun IPA aligned with the canonical article", () => {
    expect(normalizeWordIpa("die Wohnung", "[ˈvoːnʊŋ]")).toBe("[diː ˈvoːnʊŋ]")
    expect(normalizeWordIpa("die Apotheke", "[diː apɔˈteːkə]")).toBe("[diː apɔˈteːkə]")
    expect(normalizeWordIpa("das Bad", "baːt")).toBe("[das baːt]")
  })

  test("getWordLemma works for nouns and adjectives", () => {
    expect(getWordLemma({ canonical: "das Wasser", lemma: "Wasser" })).toBe("Wasser")
    expect(getWordLemma({ canonical: "rot", lexicalType: "adjective" })).toBe("rot")
  })

  test("applyChosenSentenceGloss keeps the selected Russian sentence gloss", () => {
    expect(
      applyChosenSentenceGloss(
        { german: "Der Becher ist voll.", russian: "Чаша полна" },
        { german: "Der Becher ist voll.", russian: "Чашка полная." }
      )
    ).toEqual(
      expect.objectContaining({
        russian: "Чашка полная.",
      })
    )
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

    expect(getWordFrequencyInfo("früh")).toEqual(
      expect.objectContaining({
        rank: 626,
        bandKey: "core",
        bandLabel: "Core",
      })
    )
  })
})
