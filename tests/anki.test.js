import { createNote, createNotes, ensureDerDieDeckStyling, findSimilarCards, findVerbSentenceDuplicates, migrateAdjectiveSentenceFronts, migrateProductionCardFronts, migrateSentenceVerbReverseCards, migrateSentenceWordReverseCards, migrateTemplateInlineStyles, migrateVerbSentenceFronts } from "../src/anki.js"

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
    expect(note.fields.Back).toContain("yt2anki-ipa")
    expect(note.fields.Back).toContain('class="ddd-answer-translation"')
    expect(note.fields.Back).not.toContain("style=")
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

  test("createNotes tags learning intent and sibling staging", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body))
      return {
        async json() {
          return { result: requests.length, error: null }
        },
      }
    }

    await createNotes([
      {
        type: "comprehension",
        intent: {
          id: "sound-meaning",
          trains: ["sound-map"],
        },
        siblingStage: { index: 0, total: 2 },
        front: { audio: true },
        back: { german: "Hallo.", ipa: "[haˈloː]", russian: "Привет." },
      },
      {
        type: "production",
        intent: {
          id: "meaning-to-german",
          trains: ["active-production"],
        },
        siblingStage: { index: 1, total: 2 },
        front: { russian: "Привет." },
        back: { german: "Hallo.", ipa: "[haˈloː]", audio: true },
      },
    ], "hallo.mp3", { sourceId: "src-1" })

    expect(requests).toHaveLength(2)
    expect(requests[0].params.note.tags).toEqual(expect.arrayContaining([
      "intent-sound-meaning",
      "trains-sound-map",
      "sibling-stage-day-0",
    ]))
    expect(requests[1].params.note.tags).toEqual(expect.arrayContaining([
      "intent-meaning-to-german",
      "trains-active-production",
      "sibling-stage-day-1",
    ]))
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
    expect(updateRequest.params.note.fields.Front).toContain("yt2anki-word-contrast")
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
    expect(updateRequest.params.note.fields.Front).toContain("Say in German")
    expect(updateRequest.params.note.fields.Front).toContain("Я хочу кофе.")
    expect(updateRequest.params.note.fields.Front).toContain(">в кафе<")
    expect(updateRequest.params.note.fields.Front).not.toContain("yt2anki-task-production")
  })

  test("migrateSentenceWordReverseCards clears Add Reverse on word sentence notes", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)
      requests.push(body)

      if (body.action === "findNotes") {
        return {
          async json() {
            return { result: [31, 32], error: null }
          },
        }
      }

      if (body.action === "findCards") {
        return {
          async json() {
            return { result: [3102], error: null }
          },
        }
      }

      if (body.action === "notesInfo") {
        return {
          async json() {
            return {
              result: [
                {
                  noteId: 31,
                  fields: {
                    "Add Reverse": { value: "1" },
                  },
                  tags: ["yt2anki", "mode-word-sentence"],
                },
                {
                  noteId: 32,
                  fields: {
                    "Add Reverse": { value: "" },
                  },
                  tags: ["yt2anki", "mode-word-sentence"],
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

      if (body.action === "suspend") {
        return {
          async json() {
            return { result: true, error: null }
          },
        }
      }

      throw new Error(`Unexpected action: ${body.action}`)
    }

    const result = await migrateSentenceWordReverseCards()

    expect(result).toEqual(expect.objectContaining({
      matched: 2,
      updated: 1,
      skipped: 1,
      suspendedCards: 1,
    }))

    const updateRequest = requests.find((entry) => entry.action === "updateNoteFields")
    expect(updateRequest.params.note.id).toBe(31)
    expect(updateRequest.params.note.fields["Add Reverse"]).toBe("")

    const suspendRequest = requests.find((entry) => entry.action === "suspend")
    expect(suspendRequest.params.cards).toEqual([3102])
  })

  test("migrateSentenceVerbReverseCards clears Add Reverse on verb sentence notes", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)
      requests.push(body)

      if (body.action === "findNotes") {
        expect(body.params.query).toBe("tag:mode-verb-sentence")
        return {
          async json() {
            return { result: [41, 42], error: null }
          },
        }
      }

      if (body.action === "findCards") {
        expect(body.params.query).toBe("tag:mode-verb-sentence card:2")
        return {
          async json() {
            return { result: [4102], error: null }
          },
        }
      }

      if (body.action === "notesInfo") {
        return {
          async json() {
            return {
              result: [
                {
                  noteId: 41,
                  fields: {
                    "Add Reverse": { value: "1" },
                  },
                  tags: ["yt2anki", "mode-verb-sentence"],
                },
                {
                  noteId: 42,
                  fields: {
                    "Add Reverse": { value: "" },
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

      if (body.action === "suspend") {
        return {
          async json() {
            return { result: true, error: null }
          },
        }
      }

      throw new Error(`Unexpected action: ${body.action}`)
    }

    const result = await migrateSentenceVerbReverseCards()

    expect(result).toEqual(expect.objectContaining({
      matched: 2,
      updated: 1,
      skipped: 1,
      suspendedCards: 1,
    }))

    const updateRequest = requests.find((entry) => entry.action === "updateNoteFields")
    expect(updateRequest.params.note.id).toBe(41)
    expect(updateRequest.params.note.fields["Add Reverse"]).toBe("")

    const suspendRequest = requests.find((entry) => entry.action === "suspend")
    expect(suspendRequest.params.cards).toEqual([4102])
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
    expect(updateRequest.params.note.fields.Front).toContain("[sound:gehoert.mp3]")
    expect(updateRequest.params.note.fields.Front).toContain('class="yt2anki-front-context ddd-focus"')
    expect(updateRequest.params.note.fields.Front).toContain("gehört → gehören")
    expect(updateRequest.params.note.fields.Front).not.toContain("Context:")
  })

  test("migrateVerbSentenceFronts normalizes legacy arrows in focus pills", async () => {
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
                    Front: { value: '[sound:verb_sentence_1777816847491.mp3]<div class="yt2anki-front-context ddd-focus"><span>Focus</span><span>sagt -> sagen</span></div>' },
                    Back: { value: "Er sagt, dass er morgen kommt.<br>[ɛɐ̯ zaːkt das ɛɐ̯ ˈmɔʁɡn̩ kɔmt]<br>Он говорит, что придет завтра." },
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
    expect(updateRequest.params.note.fields.Front).toContain("[sound:verb_sentence_1777816847491.mp3]")
    expect(updateRequest.params.note.fields.Front).toContain("sagt → sagen")
    expect(updateRequest.params.note.fields.Front).not.toContain("sagt -> sagen")
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
    expect(updateRequest.params.note.fields.Front).toContain("Hear the form")
    expect(updateRequest.params.note.fields.Front).toContain("[sound:erreichen.mp3]")
    expect(updateRequest.params.note.fields.Front).not.toContain("Context:")
  })

  test("migrateTemplateInlineStyles removes legacy style attributes and adds ddd classes", async () => {
    const requests = []
    const legacyFront = [
      '[sound:kaffee.mp3]',
      '<div class="ddd-task-header" style="margin:0 auto 12px;max-width:520px;text-align:center;"><div style="font-size:11px;font-weight:800;">Say in German</div><div style="margin-top:4px;font-size:14px;">Produce the sentence</div></div>',
      '<div class="yt2anki-production-source" style="font-size:20px;font-weight:700;text-align:center;">Я хочу кофе.</div>',
    ].join("")
    const legacyBack = [
      '<div class="ddd-answer-stack" style="margin:0 auto;max-width:720px;text-align:center;">',
      '<div class="ddd-answer-german" style="font-size:1.28em;font-weight:500;">Ich will Kaffee.</div>',
      '<div class="ddd-answer-ipa" style="margin-top:7px;"><span class="yt2anki-ipa" style="color:#475569;font-size:0.92em;">[ɪç vɪl ˈkafe]</span></div>',
      '<div class="ddd-answer-translation" style="margin-top:9px;font-weight:700;">Я хочу кофе.</div>',
      '</div>',
    ].join("")
    const legacyWord = '<span style="color:#111111">das Wasser</span><br><div class="yt2anki-personal-cue" style="margin:12px auto 0;"><span style="display:block;">Personal connection</span><span style="display:block;">glass cue</span></div>'

    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)
      requests.push(body)

      if (body.action === "findNotes") {
        return {
          async json() {
            return { result: [71], error: null }
          },
        }
      }

      if (body.action === "notesInfo") {
        return {
          async json() {
            return {
              result: [
                {
                  noteId: 71,
                  fields: {
                    Front: { value: legacyFront },
                    Back: { value: legacyBack },
                    Word: { value: legacyWord },
                  },
                  tags: ["yt2anki", "gender-neuter"],
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

    const result = await migrateTemplateInlineStyles()

    expect(result).toEqual(expect.objectContaining({
      matched: 1,
      updated: 1,
      skipped: 0,
    }))

    const updateRequest = requests.find((entry) => entry.action === "updateNoteFields")
    expect(updateRequest.params.note.id).toBe(71)
    const nextFields = updateRequest.params.note.fields
    expect(nextFields.Front).toContain('class="ddd-task-header"')
    expect(nextFields.Front).toContain('class="ddd-task-title"')
    expect(nextFields.Front).toContain('class="ddd-task-detail"')
    expect(nextFields.Front).toContain("ddd-production-source")
    expect(nextFields.Back).toContain("ddd-ipa")
    expect(nextFields.Back).toContain("ddd-answer-translation")
    expect(nextFields.Word).toContain("yt2anki-word-display ddd-word-display yt2anki-gender yt2anki-gender-neuter")
    expect(nextFields.Word).toContain("ddd-personal-cue-label")
    expect(Object.values(nextFields).join(" ")).not.toContain("style=")
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

  test("findVerbSentenceDuplicates checks existing sentence-mode verbs by lemma tag", async () => {
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)

      if (body.action === "findNotes") {
        expect(body.params.query).toBe("tag:mode-verb-sentence tag:lemma-bleiben")
        return {
          async json() {
            return { result: [91, 92], error: null }
          },
        }
      }

      throw new Error(`Unexpected action: ${body.action}`)
    }

    await expect(findVerbSentenceDuplicates({ infinitive: "bleiben" })).resolves.toEqual({
      exactMatches: [
        { noteId: 91, infinitive: "bleiben" },
        { noteId: 92, infinitive: "bleiben" },
      ],
    })
  })
})
