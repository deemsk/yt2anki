import { createNote, findSimilarCards } from "../src/anki.js"

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
                    Front: { value: "[sound:reply.m4a]<br><b>Antworte</b>" },
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
