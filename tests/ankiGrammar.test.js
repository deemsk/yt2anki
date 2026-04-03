import { createClozeNote, findGrammarDuplicates, resolveClozeFieldMap } from "../src/anki.js"
import { buildGrammarExtra } from "../src/grammar/utils.js"

describe("grammar Anki helpers", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  test("resolveClozeFieldMap accepts both Back Extra and Extra variants", () => {
    expect(resolveClozeFieldMap(["Text", "Back Extra"])).toEqual({
      textField: "Text",
      extraField: "Back Extra",
    })

    expect(resolveClozeFieldMap(["Text", "Extra"])).toEqual({
      textField: "Text",
      extraField: "Extra",
    })
  })

  test("createClozeNote writes the cloze text and extra fields", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body))
      return {
        async json() {
          return { result: 777, error: null }
        },
      }
    }

    await createClozeNote({
      text: "Ich sehe {{c1::meinen::ACC.M.SG}} Bruder.",
      extra: "<div>Rule: test</div>",
      tags: ["mode-grammar", "grammar-family-possessive"],
      modelName: "Cloze",
      fieldMap: { textField: "Text", extraField: "Back Extra" },
    })

    const note = requests[0].params.note
    expect(note.modelName).toBe("Cloze")
    expect(note.fields.Text).toContain("{{c1::meinen::ACC.M.SG}}")
    expect(note.fields["Back Extra"]).toContain("Rule: test")
    expect(note.tags).toContain("mode-grammar")
  })

  test("findGrammarDuplicates reads grammar slot metadata from cloze notes", async () => {
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)

      if (body.action === "findNotes") {
        return {
          async json() {
            return { result: [101], error: null }
          },
        }
      }

      if (body.action === "notesInfo") {
        return {
          async json() {
            return {
              result: [
                {
                  noteId: 101,
                  tags: ["mode-grammar", "grammar-family-possessive", "grammar-lemma-mein", "grammar-slot-acc-masc-sg"],
                  fields: {
                    Text: { value: "Ich sehe {{c1::meinen::ACC.M.SG}} Bruder." },
                    "Back Extra": {
                      value: buildGrammarExtra({
                        translation: "Я вижу моего брата.",
                        slotLabel: "Accusative masculine singular",
                        explanation: "Possessive determiner test.",
                        metadata: {
                          familyId: "possessive",
                          lemma: "mein",
                          slotId: "acc-masc-sg",
                          slotLabel: "Accusative masculine singular",
                          surfaceForm: "meinen",
                        },
                      }),
                    },
                  },
                },
              ],
              error: null,
            }
          },
        }
      }

      throw new Error(`Unexpected action: ${body.action}`)
    }

    const duplicates = await findGrammarDuplicates({
      familyId: "possessive",
      lemma: "mein",
    })

    expect(duplicates.lemmaMatches).toEqual([
      expect.objectContaining({
        noteId: 101,
        familyId: "possessive",
        lemma: "mein",
        slotId: "acc-masc-sg",
        slotLabel: "Accusative masculine singular",
        surfaceForm: "meinen",
      }),
    ])
  })
})
