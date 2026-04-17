import { createPictureWordNote, findSentenceWordDuplicates, findWordDuplicates } from "../src/anki.js"
import { buildWordExtraInfo } from "../src/wordUtils.js"

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
    expect(requests[0].params.note.fields.Word).toBe("<span>das Wasser</span>")
    expect(requests[0].params.note.fields.Picture).toContain("wasser.jpg")
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
})
