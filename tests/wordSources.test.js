import { buildWordImageSearchTerms, searchWordImages } from "../src/wordSources.js"

describe("word image sources", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  test("buildWordImageSearchTerms prefers specific visual queries before broad fallbacks", () => {
    const terms = buildWordImageSearchTerms(
      { bareNoun: "Wasser" },
      {
        english: "water",
        imageSearchTerms: ["water", "glass of water"],
      }
    )

    expect(terms.slice(0, 4)).toEqual(["glass of water", "bottle of water", "tap water", "drinking water"])
    expect(terms).toContain("water")
    expect(terms).toContain("Wasser")
  })

  test("buildWordImageSearchTerms expands weak substance queries into prototype views", () => {
    const terms = buildWordImageSearchTerms(
      { bareNoun: "Milch" },
      {
        english: "milk",
        imageSearchTerms: ["milk"],
      }
    )

    expect(terms.slice(0, 2)).toEqual(["glass of milk", "bottle of milk"])
    expect(terms).toContain("milk")
    expect(terms).toContain("Milch")
  })

  test("searchWordImages prefers prototypical specific results over scenic broad matches", async () => {
    global.fetch = async (url) => {
      const parsed = new URL(url)
      const openverseQuery = parsed.searchParams.get("q")
      const commonsQuery = parsed.searchParams.get("gsrsearch")
      const query = openverseQuery || commonsQuery

      if (openverseQuery) {
        if (query === "glass of water") {
          return {
            ok: true,
            async json() {
              return {
                results: [
                  {
                    title: "Glass of water on table",
                    thumbnail: "https://img.example/glass.jpg",
                    url: "https://img.example/glass-full.jpg",
                    creator: "tester",
                    license: "cc0",
                  },
                ],
              }
            },
          }
        }

        if (query === "water") {
          return {
            ok: true,
            async json() {
              return {
                results: [
                  {
                    title: "Waterfall landscape",
                    thumbnail: "https://img.example/waterfall.jpg",
                    url: "https://img.example/waterfall-full.jpg",
                    creator: "tester",
                    license: "cc0",
                  },
                  {
                    title: "Buffalo in water",
                    thumbnail: "https://img.example/buffalo.jpg",
                    url: "https://img.example/buffalo-full.jpg",
                    creator: "tester",
                    license: "cc0",
                  },
                ],
              }
            },
          }
        }
      }

      return {
        ok: true,
        async json() {
          return { query: { pages: [] } }
        },
      }
    }

    const results = await searchWordImages(
      { bareNoun: "Wasser" },
      {
        english: "water",
        imageSearchTerms: ["glass of water", "water"],
      },
      { pageSize: 6, total: 6 }
    )

    expect(results[0]).toEqual(
      expect.objectContaining({
        title: "Glass of water on table",
        queryUsed: "glass of water",
      })
    )
  })
})
