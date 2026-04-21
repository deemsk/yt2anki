import { sanitizeLexicalCorrectionSuggestions, shouldCheckLexicalCorrection } from "../src/lexicalCorrection.js"

describe("lexical correction helpers", () => {
  test("checks suspicious ASCII-only unknown inputs", () => {
    expect(shouldCheckLexicalCorrection("kuhlen")).toBe(true)
    expect(shouldCheckLexicalCorrection("mussen")).toBe(true)
  })

  test("does not check common valid inputs before analysis", () => {
    expect(shouldCheckLexicalCorrection("laufen")).toBe(false)
    expect(shouldCheckLexicalCorrection("schon")).toBe(false)
  })

  test("sanitizes correction suggestions", () => {
    expect(
      sanitizeLexicalCorrectionSuggestions("kuhlen", {
        suggestions: [
          { text: "kühlen", reason: "missing umlaut" },
          { text: "kühlen", reason: "duplicate" },
          { text: "kuhlen" },
          { text: "kühl" },
        ],
      })
    ).toEqual([
      { text: "kühlen", reason: "missing umlaut" },
      { text: "kühl", reason: null },
    ])
  })
})
