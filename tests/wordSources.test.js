import { config } from "../src/config.js"
import { buildWordImageSearchTerms, searchWordImages } from "../src/wordSources.js"

describe("word image sources", () => {
  const originalFetch = global.fetch
  let originalBraveSearchApiKey

  beforeEach(() => {
    originalBraveSearchApiKey = config.braveSearchApiKey
    config.braveSearchApiKey = ""
  })

  afterEach(() => {
    global.fetch = originalFetch
    config.braveSearchApiKey = originalBraveSearchApiKey
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
      if (parsed.hostname === "api.search.brave.com") {
        return {
          ok: true,
          async json() {
            return { results: [] }
          },
        }
      }
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

  test("searchWordImages includes Brave image results first when configured", async () => {
    global.fetch = async (url) => {
      const parsed = new URL(url)

      if (parsed.hostname === "api.search.brave.com") {
        return {
          ok: true,
          async json() {
            return {
              results: [
                {
                  title: "Glass of water in a bottle and cup",
                  source: "images.example.com",
                  page_url: "https://images.example.com/water",
                  thumbnail: {
                    src: "https://img.example/brave-water-thumb.jpg",
                  },
                  properties: {
                    url: "https://img.example/brave-water.jpg",
                  },
                },
              ],
            }
          },
        }
      }

      if (parsed.hostname === "api.openverse.org") {
        return {
          ok: true,
          async json() {
            return { results: [] }
          },
        }
      }

      return {
        ok: true,
        async json() {
          return { query: { pages: [] } }
        },
      }
    }

    config.braveSearchApiKey = "test-key"

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
        source: "Brave Images",
        title: "Glass of water in a bottle and cup",
      })
    )
  })
})
