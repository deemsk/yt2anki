import { createPictureWordNote, findWordDuplicates } from "../src/anki.js"
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
})
