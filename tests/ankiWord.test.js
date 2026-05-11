import { createPictureWordNote, findLexicalClozeDuplicates, findSentenceWordDuplicates, findWordDuplicates, migratePictureWordExtraInfo, migratePictureWordPersonalConnections } from "../src/anki.js"
import { buildWordExtraInfo } from "../src/templates/word/extraInfo.js"

describe("word note helpers", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  test("createPictureWordNote uses the Picture Words model fields", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body))
      return {
        async json() {
          return { result: 321, error: null }
        },
      }
    }

    await createPictureWordNote({
      canonical: "das Wasser",
      coloredWord: "<span>das Wasser</span>",
      imageFilename: "wasser.jpg",
      personalConnection: "glass on the kitchen table",
      pronunciationField: "[sound:wasser.mp3]<br>[ˈvasɐ]",
      extraInfoField: buildWordExtraInfo({
        meaning: "вода",
        plural: "usually no plural",
        metadata: {
          canonical: "das Wasser",
          meaning: "вода",
          lexicalType: "noun",
        },
      }),
      gender: "neuter",
      frequencyBand: "essential",
      lemma: "Wasser",
      imageSource: "Openverse",
      audioSource: "OpenAI TTS",
      modelName: "2. Picture Words",
    })

    expect(requests).toHaveLength(1)
    expect(requests[0].action).toBe("addNote")
    expect(requests[0].params.note.modelName).toBe("2. Picture Words")
    expect(requests[0].params.note.fields.Word).toContain("<span>das Wasser</span>")
    expect(requests[0].params.note.fields.Word).toContain("yt2anki-personal-cue")
    expect(requests[0].params.note.fields.Picture).toContain("wasser.jpg")
    expect(requests[0].params.note.fields.Picture).toContain("yt2anki-personal-cue")
    expect(requests[0].params.note.fields.Picture).toContain("glass on the kitchen table")
    expect(requests[0].params.note.fields["Gender, Personal Connection, Extra Info (Back side)"]).not.toContain("Personal connection")
  })

  test("createPictureWordNote can leave the picture field blank when no image is chosen", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body))
      return {
        async json() {
          return { result: 322, error: null }
        },
      }
    }

    await createPictureWordNote({
      canonical: "ziemlich",
      coloredWord: "<span>ziemlich</span>",
      imageFilename: null,
      pronunciationField: "[sound:ziemlich.mp3]<br>[ˈtsiːmlɪç]",
      extraInfoField: buildWordExtraInfo({
        meaning: "довольно",
        metadata: {
          canonical: "ziemlich",
          meaning: "довольно",
          lexicalType: "adjective",
        },
      }),
      frequencyBand: "core",
      lemma: "ziemlich",
      imageSource: null,
      audioSource: "Google TTS",
      lexicalType: "adjective",
      modelName: "2. Picture Words",
    })

    const note = requests[0].params.note
    expect(note.fields.Picture).toBe("")
    expect(note.tags).toContain("img-none")
  })

  test("findWordDuplicates distinguishes exact duplicates from same-headword warnings", async () => {
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
                  noteId: 1,
                  fields: {
                    Word: { value: '<span style="color:#111111">das Wasser</span>' },
                    "Gender, Personal Connection, Extra Info (Back side)": {
                      value: buildWordExtraInfo({
                        meaning: "вода",
                        plural: "usually no plural",
                        metadata: {
                          canonical: "das Wasser",
                          meaning: "вода",
                          lexicalType: "noun",
                        },
                      }),
                    },
                  },
                },
                {
                  noteId: 2,
                  fields: {
                    Word: { value: '<span style="color:#111111">das Wasser</span>' },
                    "Gender, Personal Connection, Extra Info (Back side)": {
                      value: buildWordExtraInfo({
                        meaning: "минеральная вода",
                        plural: "usually no plural",
                        metadata: {
                          canonical: "das Wasser",
                          meaning: "минеральная вода",
                          lexicalType: "noun",
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

    const duplicates = await findWordDuplicates({
      canonical: "das Wasser",
      meaning: "вода",
      lexicalType: "noun",
      modelName: "2. Picture Words",
    })

    expect(duplicates.exactMatches).toEqual([
      expect.objectContaining({
        noteId: 1,
        canonical: "das Wasser",
        meaning: "вода",
      }),
    ])

    expect(duplicates.headwordMatches).toEqual([
      expect.objectContaining({
        noteId: 2,
        canonical: "das Wasser",
        meaning: "минеральная вода",
      }),
    ])
  })

  test("findWordDuplicates ignores notes with a different lexical type when metadata is present", async () => {
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
                  noteId: 1,
                  fields: {
                    Word: { value: "<span>offen</span>" },
                    "Gender, Personal Connection, Extra Info (Back side)": {
                      value: buildWordExtraInfo({
                        meaning: "открытый",
                        exampleSentence: "offene Tür",
                        metadata: {
                          canonical: "offen",
                          meaning: "открытый",
                          lexicalType: "adjective",
                        },
                      }),
                    },
                  },
                },
                {
                  noteId: 2,
                  fields: {
                    Word: { value: "<span>offen</span>" },
                    "Gender, Personal Connection, Extra Info (Back side)": {
                      value: buildWordExtraInfo({
                        meaning: "имя существительное",
                        metadata: {
                          canonical: "offen",
                          meaning: "имя существительное",
                          lexicalType: "noun",
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

    const duplicates = await findWordDuplicates({
      canonical: "offen",
      meaning: "открытый",
      lexicalType: "adjective",
      modelName: "2. Picture Words",
    })

    expect(duplicates.exactMatches).toHaveLength(1)
    expect(duplicates.exactMatches[0]).toEqual(
      expect.objectContaining({
        noteId: 1,
        lexicalType: "adjective",
      })
    )
    expect(duplicates.headwordMatches).toEqual([])
  })

  test("findSentenceWordDuplicates reads hidden lexical metadata from sentence notes", async () => {
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)

      if (body.action === "findNotes") {
        return {
          async json() {
            return { result: [11, 12], error: null }
          },
        }
      }

      if (body.action === "notesInfo") {
        return {
          async json() {
            return {
              result: [
                {
                  noteId: 11,
                  fields: {
                    Front: { value: "[sound:gut.mp3]<br>Context: Adjective: gut" },
                    Back: {
                      value: 'Das ist gut.<br>[das ɪst ɡuːt]<br>Это хорошо.<!-- yt2anki-word:%7B%22canonical%22%3A%22gut%22%2C%22meaning%22%3A%22%D1%85%D0%BE%D1%80%D0%BE%D1%88%D0%B8%D0%B9%22%2C%22lexicalType%22%3A%22adjective%22%7D -->',
                    },
                  },
                  tags: ["yt2anki", "mode-word-sentence", "word-adjective"],
                },
                {
                  noteId: 12,
                  fields: {
                    Front: { value: "[sound:besser.mp3]<br>Context: Adjective: besser" },
                    Back: { value: "Das ist besser.<br>[das ɪst ˈbɛsɐ]<br>Это лучше." },
                  },
                  tags: ["yt2anki", "mode-word-sentence", "word-adjective", "canonical-gut"],
                },
              ],
              error: null,
            }
          },
        }
      }

      throw new Error(`Unexpected action: ${body.action}`)
    }

    const duplicates = await findSentenceWordDuplicates({
      canonical: "gut",
      meaning: "хороший",
      lexicalType: "adjective",
    })

    expect(duplicates.exactMatches).toEqual([
      expect.objectContaining({
        noteId: 11,
        canonical: "gut",
        meaning: "хороший",
      }),
    ])

    expect(duplicates.headwordMatches).toEqual([
      expect.objectContaining({
        noteId: 12,
        canonical: "gut",
      }),
    ])
  })

  test("findSentenceWordDuplicates falls back to adverb tags when hidden metadata is absent", async () => {
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)

      if (body.action === "findNotes") {
        return {
          async json() {
            return { result: [31], error: null }
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
                    Front: { value: "[sound:sofort.mp3]<br><img src=\"sofort.jpg\" />" },
                    Back: { value: "Komm sofort.<br>[kɔm zɔˈfɔʁt]<br>Иди немедленно." },
                  },
                  tags: ["yt2anki", "mode-word-sentence", "word-adverb", "canonical-sofort", "lemma-sofort"],
                },
              ],
              error: null,
            }
          },
        }
      }

      throw new Error(`Unexpected action: ${body.action}`)
    }

    const duplicates = await findSentenceWordDuplicates({
      canonical: "sofort",
      lexicalType: "adverb",
    })

    expect(duplicates.headwordMatches).toEqual([
      expect.objectContaining({
        noteId: 31,
        canonical: "sofort",
        lexicalType: "adverb",
      }),
    ])
  })

  test("findLexicalClozeDuplicates reads hidden metadata from Cloze fields", async () => {
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)

      if (body.action === "findNotes") {
        expect(body.params.query).toBe("tag:mode-lexical-cloze tag:lemma-aber")
        return {
          async json() {
            return { result: [41], error: null }
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
                    Text: { value: "Ich bin müde, {{c1::aber::contrast connector}} ich komme." },
                    "Back Extra": {
                      value: 'Я устал, но я приду.<!-- yt2anki-word:%7B%22canonical%22%3A%22aber%22%2C%22meaning%22%3A%22%D0%BD%D0%BE%22%2C%22lexicalType%22%3A%22conjunction%22%7D -->',
                    },
                  },
                  tags: ["yt2anki", "mode-lexical-cloze", "word-conjunction", "lemma-aber"],
                },
              ],
              error: null,
            }
          },
        }
      }

      throw new Error(`Unexpected action: ${body.action}`)
    }

    const duplicates = await findLexicalClozeDuplicates({
      canonical: "aber",
      meaning: "но",
      lexicalType: "conjunction",
    })

    expect(duplicates.exactMatches).toEqual([
      expect.objectContaining({
        noteId: 41,
        canonical: "aber",
        meaning: "но",
      }),
    ])
  })

  test("migratePictureWordExtraInfo rewrites legacy inline example styles to classes", async () => {
    const requests = []
    const legacyExtra = '<div class="yt2anki-extra-example" style="margin:14px auto 0;max-width:520px;padding:10px 12px;border-radius:14px;background:var(--ddd-panel, rgba(148, 163, 184, 0.12));color:var(--ddd-text, #111827);"><span class="yt2anki-extra-label">Example</span><span class="yt2anki-extra-value" style="display:block;margin-top:4px;font-size:0.88em;line-height:1.24;">Der Unfall war sehr schlimm.</span></div><div class="yt2anki-extra-example-translation" style="margin-top:6px;font-size:0.76em;line-height:1.2;color:var(--ddd-muted, #475569);">Авария была очень серьезной.</div>'

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
                    "Gender, Personal Connection, Extra Info (Back side)": { value: legacyExtra },
                  },
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

    const result = await migratePictureWordExtraInfo()

    expect(result.updated).toBe(1)
    const update = requests.find((request) => request.action === "updateNoteFields")
    const nextExtra = update.params.note.fields["Gender, Personal Connection, Extra Info (Back side)"]
    expect(nextExtra).toContain("yt2anki-extra-example ddd-extra-example")
    expect(nextExtra).toContain("yt2anki-extra-label ddd-extra-label")
    expect(nextExtra).toContain("yt2anki-extra-value ddd-extra-value ddd-extra-example-value")
    expect(nextExtra).toContain("yt2anki-extra-example-translation ddd-extra-example-translation")
    expect(nextExtra).not.toContain("style=")
  })

  test("migratePictureWordPersonalConnections moves old back-side personal connection to picture front cue", async () => {
    const requests = []
    const legacyExtra = '<div class="yt2anki-extra-meaning">возможность</div><div class="yt2anki-extra-row yt2anki-extra-personal" style="margin-top:8px;"><span class="yt2anki-extra-label">Personal connection</span><span class="yt2anki-extra-value">Important life cue</span></div>'

    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)
      requests.push(body)

      if (body.action === "findNotes") {
        return {
          async json() {
            return { result: [45], error: null }
          },
        }
      }

      if (body.action === "notesInfo") {
        return {
          async json() {
            return {
              result: [
                {
                  noteId: 45,
                  fields: {
                    Picture: { value: '<img src="moeglichkeit.jpg" />' },
                    "Gender, Personal Connection, Extra Info (Back side)": { value: legacyExtra },
                  },
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

    const result = await migratePictureWordPersonalConnections()

    expect(result.updated).toBe(1)
    const update = requests.find((request) => request.action === "updateNoteFields")
    expect(update.params.note.fields.Word).toContain("yt2anki-personal-cue")
    expect(update.params.note.fields.Word).toContain("Important life cue")
    expect(update.params.note.fields.Picture).toContain("moeglichkeit.jpg")
    expect(update.params.note.fields.Picture).toContain("yt2anki-personal-cue")
    expect(update.params.note.fields.Picture).toContain("Important life cue")
    expect(update.params.note.fields["Gender, Personal Connection, Extra Info (Back side)"]).not.toContain("yt2anki-extra-personal")
    expect(update.params.note.fields["Gender, Personal Connection, Extra Info (Back side)"]).not.toContain("Important life cue")
  })
})
