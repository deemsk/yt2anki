import { chooseMeaning, chooseWordSentence } from "../src/wordConfirm.js"

describe("word confirmation helpers", () => {
  test("chooseMeaning accepts a preferred gloss even when analysis has no meaning list", async () => {
    const meaning = await chooseMeaning(
      {
        canonical: "gut",
        lemma: "gut",
        lexicalType: "adjective",
        meanings: [],
      },
      "хороший"
    )

    expect(meaning).toEqual(
      expect.objectContaining({
        russian: "хороший",
        english: "gut",
      })
    )
  })

  test("chooseWordSentence auto-builds a fallback sentence for adjectives without examples", async () => {
    const sentence = await chooseWordSentence({
      canonical: "gut",
      lexicalType: "adjective",
      meanings: [{ russian: "хороший", english: "good" }],
      exampleSentences: [],
    })

    expect(sentence).toEqual(
      expect.objectContaining({
        german: "Das ist gut.",
        focusForm: "gut",
      })
    )
  })

  test("chooseMeaning can return a blank gloss for sentence-form fallback without prompting", async () => {
    const meaning = await chooseMeaning(
      {
        canonical: "voll",
        lemma: "voll",
        lexicalType: "adjective",
        meanings: [],
      },
      null,
      { allowBlank: true }
    )

    expect(meaning).toEqual(
      expect.objectContaining({
        russian: "",
        english: "voll",
      })
    )
  })
})
