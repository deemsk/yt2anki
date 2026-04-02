import { createBasicNote, createPictureWordNote } from "../src/anki.js"
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
})
