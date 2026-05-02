import { createNote, ensureDerDieDeckStyling, findSimilarCards, migrateAdjectiveSentenceFronts, migrateProductionCardFronts, migrateVerbSentenceFronts } from "../src/anki.js"

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

  test("ensureDerDieDeckStyling installs shared CSS on configured note types", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)
      requests.push(body)

      if (body.action === "modelNames") {
        return {
          async json() {
            return { result: ["Basic (optional reversed card)"], error: null }
          },
        }
      }

      if (body.action === "modelStyling") {
        return {
          async json() {
            return { result: { css: ".card { font-size: 20px; }" }, error: null }
          },
        }
      }

      if (body.action === "updateModelStyling") {
        return {
          async json() {
            return { result: null, error: null }
          },
        }
      }

      throw new Error(`Unexpected action: ${body.action}`)
    }

    const result = await ensureDerDieDeckStyling({
      modelNames: ["Basic (optional reversed card)", "Missing Model"],
    })

    expect(result).toEqual([
      { modelName: "Basic (optional reversed card)", status: "updated" },
      { modelName: "Missing Model", status: "missing" },
    ])

    const update = requests.find((entry) => entry.action === "updateModelStyling")
    expect(update.params.model.name).toBe("Basic (optional reversed card)")
    expect(update.params.model.css).toContain("DerDieDeck shared styles start")
    expect(update.params.model.css).toContain(".card { font-size: 20px; }")
  })

  test("ensureDerDieDeckStyling dry run previews updates without writing", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)
      requests.push(body)

      if (body.action === "modelNames") {
        return {
          async json() {
            return { result: ["Basic"], error: null }
          },
        }
      }

      if (body.action === "modelStyling") {
        return {
          async json() {
            return { result: { css: "" }, error: null }
          },
        }
      }

      throw new Error(`Unexpected action: ${body.action}`)
    }

    const result = await ensureDerDieDeckStyling({
      modelNames: ["Basic"],
      dryRun: true,
    })

    expect(result).toEqual([
      { modelName: "Basic", status: "would-update" },
    ])
    expect(requests.some((entry) => entry.action === "updateModelStyling")).toBe(false)
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

  test("migrateProductionCardFronts rewrites boxed production fronts to the plain layout", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)
      requests.push(body)

      if (body.action === "findNotes") {
        return {
          async json() {
            return { result: [44], error: null }
          },
        }
      }

      if (body.action === "notesInfo") {
        return {
          async json() {
            return {
              result: [
                {
                  noteId: 44,
                  fields: {
                    Front: { value: '<div class="yt2anki-task yt2anki-task-production">🗣 СКАЖИ ПО-НЕМЕЦКИ</div><div>Скажи по-немецки вслух</div><div>Это перевод в немецкую фразу, а не ответ собеседнику</div><div class="yt2anki-production-source">Я хочу кофе.</div><div class="yt2anki-production-hint">🧭 Подсказка: в кафе</div>' },
                    Back: { value: "Ich möchte einen Kaffee.<br>[ɪç ˈmœçtə ˈaɪ̯nən ˈkafeː]<br>Я хочу кофе." },
                  },
                  tags: ["yt2anki", "card-production"],
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

    const result = await migrateProductionCardFronts()

    expect(result).toEqual(
      expect.objectContaining({
        matched: 1,
        updated: 1,
        skipped: 0,
      })
    )

    const updateRequest = requests.find((entry) => entry.action === "updateNoteFields")
    expect(updateRequest.params.note.id).toBe(44)
    expect(updateRequest.params.note.fields.Front).toContain("Скажи по-немецки")
    expect(updateRequest.params.note.fields.Front).toContain("Я хочу кофе.")
    expect(updateRequest.params.note.fields.Front).toContain(">в кафе<")
    expect(updateRequest.params.note.fields.Front).not.toContain("yt2anki-task-production")
  })

  test("migrateVerbSentenceFronts rewrites boxed verb contexts to the plain layout", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)
      requests.push(body)

      if (body.action === "findNotes") {
        return {
          async json() {
            return { result: [55], error: null }
          },
        }
      }

      if (body.action === "notesInfo") {
        return {
          async json() {
            return {
              result: [
                {
                  noteId: 55,
                  fields: {
                    Front: { value: '[sound:gehoert.mp3]<div class="yt2anki-front-context" style="margin:12px auto 10px;max-width:420px;padding:10px 14px;border-radius:16px;background:rgba(148, 163, 184, 0.12);color:#475569;font-size:14px;line-height:1.35;text-align:center;">Context: gehört -&gt; gehören</div>' },
                    Back: { value: "Der Hund gehört meiner Schwester.<br>[deːɐ̯ hʊnt ɡəˈhøːɐ̯t ˈmaɪ̯nɐ ˈʃvɛstɐ]<br>Собака принадлежит моей сестре." },
                  },
                  tags: ["yt2anki", "mode-verb-sentence"],
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

    const result = await migrateVerbSentenceFronts()

    expect(result).toEqual(
      expect.objectContaining({
        matched: 1,
        updated: 1,
        skipped: 0,
      })
    )

    const updateRequest = requests.find((entry) => entry.action === "updateNoteFields")
    expect(updateRequest.params.note.id).toBe(55)
    expect(updateRequest.params.note.fields.Front).toBe("[sound:gehoert.mp3]<br>Context: gehört -&gt; gehören")
  })

  test("migrateVerbSentenceFronts drops synthetic fallback verb contexts", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)
      requests.push(body)

      if (body.action === "findNotes") {
        return {
          async json() {
            return { result: [56], error: null }
          },
        }
      }

      if (body.action === "notesInfo") {
        return {
          async json() {
            return {
              result: [
                {
                  noteId: 56,
                  fields: {
                    Front: { value: '[sound:erreichen.mp3]<br>Context: Verb: erreichen' },
                    Back: { value: "Wir müssen das Ziel erreichen.<br>[viːɐ̯ ˈmʏsn̩ das tsiːl ɛɐ̯ˈʁaɪ̯çn̩]<br>Мы должны достичь цели." },
                  },
                  tags: ["yt2anki", "mode-verb-sentence"],
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

    const result = await migrateVerbSentenceFronts()

    expect(result).toEqual(
      expect.objectContaining({
        matched: 1,
        updated: 1,
        skipped: 0,
      })
    )

    const updateRequest = requests.find((entry) => entry.action === "updateNoteFields")
    expect(updateRequest.params.note.id).toBe(56)
    expect(updateRequest.params.note.fields.Front).toBe("[sound:erreichen.mp3]")
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
