import { createBasicNote, createPictureWordNote, migrateVerbDictionaryIpaBacks } from "../src/anki.js"
import { buildWordExtraInfo } from "../src/wordUtils.js"

describe("verb note helpers", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  test("createPictureWordNote tags picture verbs without gender", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body))
      return {
        async json() {
          return { result: 123, error: null }
        },
      }
    }

    await createPictureWordNote({
      canonical: "laufen",
      coloredWord: "<span>laufen</span>",
      imageFilename: "laufen.jpg",
      pronunciationField: "[sound:laufen.mp3]<br>[ˈlaʊfn̩]",
      extraInfoField: buildWordExtraInfo({
        meaning: "бежать",
        exampleSentence: "Er läuft im Park.",
        metadata: {
          canonical: "laufen",
          meaning: "бежать",
        },
      }),
      frequencyBand: "core",
      lemma: "laufen",
      imageSource: "Brave Images",
      audioSource: "Google TTS",
      lexicalType: "verb",
      modelName: "2. Picture Words",
    })

    const note = requests[0].params.note
    expect(note.tags).toContain("word-verb")
    expect(note.tags.some((tag) => tag.startsWith("gender-"))).toBe(false)
  })

  test("createBasicNote writes Front/Back and optional reverse field", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body))
      return {
        async json() {
          return { result: 456, error: null }
        },
      }
    }

    await createBasicNote({
      front: "läuft",
      back: "laufen<br>[ˈlaʊfn̩]<br>бежать",
      modelName: "Basic (optional reversed card)",
      addReversed: true,
      tags: ["mode-verb-dictionary"],
    })

    expect(requests[0].params.note.fields.Front).toBe("läuft")
    expect(requests[0].params.note.fields.Back).toContain("laufen")
    expect(requests[0].params.note.fields["Add Reverse"]).toBe("1")
    expect(requests[0].params.note.tags).toContain("mode-verb-dictionary")
  })

  test("migrateVerbDictionaryIpaBacks rewrites plain IPA lines with shared styling", async () => {
    const requests = []

    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body)
      requests.push(body)

      if (body.action === "findNotes") {
        return {
          async json() {
            return { result: [88], error: null }
          },
        }
      }

      if (body.action === "notesInfo") {
        return {
          async json() {
            return {
              result: [
                {
                  noteId: 88,
                  fields: {
                    Front: { value: "erreichen" },
                    Back: { value: "erreichen<br>[ɛˈʁaɪ̯çn̩]<br>достигать" },
                  },
                  tags: ["yt2anki", "mode-verb-dictionary"],
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

    const result = await migrateVerbDictionaryIpaBacks()

    expect(result).toEqual(
      expect.objectContaining({
        matched: 1,
        updated: 1,
        skipped: 0,
      })
    )

    const updateRequest = requests.find((entry) => entry.action === "updateNoteFields")
    expect(updateRequest.params.note.id).toBe(88)
    expect(updateRequest.params.note.fields.Back).toContain('class="yt2anki-ipa"')
    expect(updateRequest.params.note.fields.Back).toContain("erreichen")
    expect(updateRequest.params.note.fields.Back).toContain("достигать")
  })
})
