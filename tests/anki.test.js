import { createNote, findSimilarCards, migrateAdjectiveSentenceFronts } from "../src/anki.js"

describe("anki helpers", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  test("createNote honors deck override", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body))
      return {
        async json() {
          return { result: 123, error: null }
        },
      }
    }

    await createNote({
      german: "Ich gehe nach Hause.",
      ipa: "[ɪç ˈɡeːə nax ˈhaʊ̯zə]",
      russian: "Я иду домой.",
      audioFilename: "clip.m4a",
      deck: "Custom::Deck",
    })

    expect(requests).toHaveLength(1)
    expect(requests[0].action).toBe("addNote")
    expect(requests[0].params.note.deckName).toBe("Custom::Deck")
  })

  test("createNote can embed image and hidden lexical metadata", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body))
      return {
        async json() {
          return { result: 124, error: null }
        },
      }
    }

    await createNote({
      german: "Das ist gut.",
      ipa: "[das ɪst ɡuːt]",
      russian: "Это хорошо.",
      audioFilename: "gut.mp3",
      imageFilename: "gut.jpg",
      metadata: {
        canonical: "gut",
        meaning: "хороший",
        lexicalType: "adjective",
      },
    })

    const note = requests[0].params.note
    expect(note.fields.Front).toContain("gut.jpg")
    expect(note.fields.Back).toContain('class="yt2anki-ipa"')
    expect(note.fields.Back).toContain("yt2anki-word:")
  })

  test("createNote can append a styled front footer without adding a context label", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body))
      return {
        async json() {
          return { result: 125, error: null }
        },
      }
    }

    await createNote({
      german: "Das Haus ist groß.",
      ipa: "[das haʊs ɪst ɡʁoːs]",
      russian: "Дом большой.",
      audioFilename: "gross.mp3",
      imageFilename: "gross.jpg",
      frontFooterHtml: '<div class="yt2anki-word-contrast">Contrast: klein</div>',
    })

    const note = requests[0].params.note
    expect(note.fields.Front).toContain('<img src="gross.jpg" />')
    expect(note.fields.Front).toContain("gross.jpg")
    expect(note.fields.Front).toContain("yt2anki-word-contrast")
    expect(note.fields.Front).not.toContain("Context:")
  })

  test("migrateAdjectiveSentenceFronts rewrites legacy adjective fronts and preserves media", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)
      requests.push(body)

      if (body.action === "findNotes") {
        return {
          async json() {
            return { result: [21], error: null }
          },
        }
      }

      if (body.action === "notesInfo") {
        return {
          async json() {
            return {
              result: [
                {
                  noteId: 21,
                  fields: {
                    Front: { value: '[sound:gross.mp3]<br>Context: Adjective: groß | Contrast: klein<br><img src="gross.jpg" />' },
                    Back: { value: "Das Haus ist groß.<br>[das haʊs ɪst ɡʁoːs]<br>Дом большой." },
                  },
                  tags: ["yt2anki", "mode-word-sentence", "word-adjective"],
                },
              ],
              error: null,
            }
          },
        }
      }

      if (body.action === "updateNoteFields") {
        return {
          async json() {
            return { result: null, error: null }
          },
        }
      }

      throw new Error(`Unexpected action: ${body.action}`)
    }

    const result = await migrateAdjectiveSentenceFronts()

    expect(result).toEqual(
      expect.objectContaining({
        matched: 1,
        updated: 1,
        skipped: 0,
      })
    )

    const updateRequest = requests.find((entry) => entry.action === "updateNoteFields")
    expect(updateRequest.params.note.id).toBe(21)
    expect(updateRequest.params.note.fields.Front).toContain('[sound:gross.mp3]')
    expect(updateRequest.params.note.fields.Front).toContain('<img src="gross.jpg" />')
    expect(updateRequest.params.note.fields.Front).toContain("gross.jpg")
    expect(updateRequest.params.note.fields.Front).toContain('class="yt2anki-word-contrast"')
    expect(updateRequest.params.note.fields.Front).not.toContain("Context:")
  })

  test("findSimilarCards matches current audio-first cards using back-side German text", async () => {
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)

      if (body.action === "findNotes") {
        return {
          async json() {
            return { result: [1, 2], error: null }
          },
        }
      }

      if (body.action === "notesInfo") {
        return {
          async json() {
            return {
              result: [
                {
                  fields: {
                    Front: { value: "[sound:clip.m4a]" },
                    Back: { value: "Ich gehe nach Hause.<br>[ɪç ˈɡeːə nax ˈhaʊ̯zə]<br>Я иду домой." },
                  },
                },
                {
                  fields: {
                    Front: {
                      value: '[sound:reply.m4a]<div class="yt2anki-task">💬 ТВОЙ ОТВЕТ</div><div>Ответь по-немецки вслух</div><div>Это ответ собеседнику, не перевод</div><div>💬 Твой ответ: ______</div>',
                    },
                    Back: { value: "Ganz gut.<br><small>Нормально</small>" },
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

    const similar = await findSimilarCards("Ich gehe nach Hause.")

    expect(similar).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          german: "Ich gehe nach Hause.",
          similarity: 100,
        }),
      ])
    )
  })
})
