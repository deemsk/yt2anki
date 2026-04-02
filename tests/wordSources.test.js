import { config } from "../src/config.js"
import { buildVerbImageSearchTerms, buildWordImageSearchTerms, resolveWordPronunciation, searchVerbImages, searchWordImages } from "../src/wordSources.js"

describe("word image sources", () => {
  const originalFetch = global.fetch
  let originalBraveSearchApiKey

  beforeEach(() => {
    originalBraveSearchApiKey = config.braveApiKey
    config.braveApiKey = ""
  })

  afterEach(() => {
    global.fetch = originalFetch
    config.braveApiKey = originalBraveSearchApiKey
  })

  test("buildWordImageSearchTerms prefers specific visual queries before broad fallbacks", () => {
    const terms = buildWordImageSearchTerms(
      { bareNoun: "Wasser" },
      {
        english: "water",
        imageSearchTerms: ["Wasser", "Glas Wasser"],
      }
    )

    expect(terms.slice(0, 4)).toEqual(["Glas Wasser", "Flasche Wasser", "Trinkwasser", "Leitungswasser"])
    expect(terms).toContain("water")
    expect(terms).toContain("Wasser")
  })

  test("buildWordImageSearchTerms expands weak substance queries into prototype views", () => {
    const terms = buildWordImageSearchTerms(
      { bareNoun: "Milch" },
      {
        english: "milk",
        imageSearchTerms: ["Milch"],
      }
    )

    expect(terms.slice(0, 3)).toEqual(["Glas Milch", "Milchpackung", "Milchkarton"])
    expect(terms).toContain("Milch trinken")
    expect(terms).toContain("Milchkuh")
    expect(terms).toContain("milk")
    expect(terms).toContain("Milch")
  })

  test("buildWordImageSearchTerms adds German place-specific queries for Apotheke", () => {
    const terms = buildWordImageSearchTerms(
      { bareNoun: "Apotheke" },
      {
        english: "pharmacy",
        imageSearchTerms: ["Apotheke"],
      }
    )

    expect(terms).toContain("Apotheke Schild")
    expect(terms).toContain("Apotheke Eingang")
    expect(terms).toContain("Apotheke innen")
    expect(terms).toContain("deutsche Apotheke")
  })

  test("buildWordImageSearchTerms separates Wohnung from Zimmer with different visual anchors", () => {
    const wohnungTerms = buildWordImageSearchTerms(
      { bareNoun: "Wohnung" },
      {
        english: "apartment",
        imageSearchTerms: ["Wohnung"],
      }
    )

    const zimmerTerms = buildWordImageSearchTerms(
      { bareNoun: "Zimmer" },
      {
        english: "room",
        imageSearchTerms: ["Zimmer"],
      }
    )

    expect(wohnungTerms).toContain("Wohnung Klingel")
    expect(wohnungTerms).toContain("Wohnung Grundriss")
    expect(zimmerTerms).toContain("leeres Zimmer")
    expect(zimmerTerms).toContain("Zimmer Tür")
    expect(wohnungTerms).not.toContain("leeres Wohnung")
    expect(zimmerTerms).not.toContain("Wohnung Grundriss")
  })

  test("buildWordImageSearchTerms biases calendar words toward German calendar views", () => {
    const terms = buildWordImageSearchTerms(
      { bareNoun: "Montag" },
      {
        english: "monday",
        imageSearchTerms: ["Montag"],
      }
    )

    expect(terms.slice(0, 4)).toEqual([
      "Montag Kalender deutsch",
      "Montag Wochenplan deutsch",
      "Montag Kalenderblatt",
      "Montag Datum",
    ])
    expect(terms).toContain("Montag in Deutschland")
    expect(terms).toContain("monday")
  })

  test("buildVerbImageSearchTerms keeps German action queries ahead of fallbacks", () => {
    const terms = buildVerbImageSearchTerms(
      { infinitive: "laufen", displayForm: "läuft" },
      {
        english: "run",
        imageSearchTerms: ["Mann läuft", "laufen im Park"],
      }
    )

    expect(terms.slice(0, 3)).toEqual(["Mann läuft", "laufen im Park", "läuft"])
    expect(terms).toContain("laufen")
    expect(terms).toContain("run")
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
        if (query === "Glas Wasser") {
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

        if (query === "Wasser") {
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
        imageSearchTerms: ["Glas Wasser", "Wasser"],
      },
      { pageSize: 6, total: 6 }
    )

    expect(results[0]).toEqual(
      expect.objectContaining({
        title: "Glass of water on table",
        queryUsed: "Glas Wasser",
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

    config.braveApiKey = "test-key"

    const results = await searchWordImages(
      { bareNoun: "Wasser" },
      {
        english: "water",
        imageSearchTerms: ["Glas Wasser", "Wasser"],
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

  test("searchWordImages uses German Brave locale for German Apotheke queries", async () => {
    const braveRequests = []

    global.fetch = async (url) => {
      const parsed = new URL(url)

      if (parsed.hostname === "api.search.brave.com") {
        braveRequests.push({
          q: parsed.searchParams.get("q"),
          search_lang: parsed.searchParams.get("search_lang"),
          country: parsed.searchParams.get("country"),
        })
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
          return { query: { pages: [] }, results: [] }
        },
      }
    }

    config.braveApiKey = "test-key"

    await searchWordImages(
      { bareNoun: "Apotheke" },
      {
        english: "pharmacy",
        imageSearchTerms: ["Apotheke"],
      },
      { pageSize: 6, total: 6 }
    )

    const apothekeRequest = braveRequests.find((request) => request.q === "Apotheke Schild")
    expect(apothekeRequest).toEqual({
      q: "Apotheke Schild",
      search_lang: "de",
      country: "de",
    })
  })

  test("searchWordImages prefers German Apotheke imagery over generic pharmacy results", async () => {
    global.fetch = async (url) => {
      const parsed = new URL(url)

      if (parsed.hostname === "api.search.brave.com") {
        const query = parsed.searchParams.get("q")

        if (query === "Apotheke Schild") {
          return {
            ok: true,
            async json() {
              return {
                results: [
                  {
                    title: "Apotheke Schild in Berlin",
                    source: "apotheke.de",
                    page_url: "https://www.apotheke.de/berlin",
                    thumbnail: { src: "https://img.example/apotheke-sign.jpg" },
                    properties: { url: "https://img.example/apotheke-sign-full.jpg" },
                  },
                  {
                    title: "Pharmacy storefront",
                    source: "walgreens.com",
                    page_url: "https://www.walgreens.com/storelocator",
                    thumbnail: { src: "https://img.example/pharmacy-store.jpg" },
                    properties: { url: "https://img.example/pharmacy-store-full.jpg" },
                  },
                ],
              }
            },
          }
        }

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
          return { query: { pages: [] }, results: [] }
        },
      }
    }

    config.braveApiKey = "test-key"

    const results = await searchWordImages(
      { bareNoun: "Apotheke" },
      {
        english: "pharmacy",
        imageSearchTerms: ["Apotheke"],
      },
      { pageSize: 6, total: 6 }
    )

    expect(results[0]).toEqual(
      expect.objectContaining({
        title: "Apotheke Schild in Berlin",
        queryUsed: "Apotheke Schild",
      })
    )
  })

  test("searchWordImages prefers German Montag calendar imagery over English Monday calendars", async () => {
    global.fetch = async (url) => {
      const parsed = new URL(url)

      if (parsed.hostname === "api.search.brave.com") {
        const query = parsed.searchParams.get("q")

        if (query === "Montag Kalender deutsch") {
          return {
            ok: true,
            async json() {
              return {
                results: [
                  {
                    title: "Montag Kalenderblatt auf deutsch",
                    source: "kalender.example.de",
                    page_url: "https://kalender.example.de/montag",
                    thumbnail: { src: "https://img.example/montag.jpg" },
                    properties: { url: "https://img.example/montag-full.jpg" },
                  },
                  {
                    title: "Monday calendar page printable",
                    source: "calendar.example.com",
                    page_url: "https://calendar.example.com/monday",
                    thumbnail: { src: "https://img.example/monday.jpg" },
                    properties: { url: "https://img.example/monday-full.jpg" },
                  },
                ],
              }
            },
          }
        }

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
          return { query: { pages: [] }, results: [] }
        },
      }
    }

    config.braveApiKey = "test-key"

    const results = await searchWordImages(
      { bareNoun: "Montag" },
      {
        english: "monday",
        imageSearchTerms: ["Montag"],
      },
      { pageSize: 6, total: 6 }
    )

    expect(results[0]).toEqual(
      expect.objectContaining({
        title: "Montag Kalenderblatt auf deutsch",
        queryUsed: "Montag Kalender deutsch",
      })
    )
  })

  test("searchVerbImages prefers German action imagery over generic verb labels", async () => {
    global.fetch = async (url) => {
      const parsed = new URL(url)

      if (parsed.hostname === "api.search.brave.com") {
        const query = parsed.searchParams.get("q")
        if (query === "Mann läuft") {
          return {
            ok: true,
            async json() {
              return {
                results: [
                  {
                    title: "Mann läuft im Park",
                    source: "laufen.example.de",
                    page_url: "https://laufen.example.de/park",
                    thumbnail: { src: "https://img.example/laufen.jpg" },
                    properties: { url: "https://img.example/laufen-full.jpg" },
                  },
                  {
                    title: "Run icon symbol",
                    source: "icons.example.com",
                    page_url: "https://icons.example.com/run",
                    thumbnail: { src: "https://img.example/run-icon.jpg" },
                    properties: { url: "https://img.example/run-icon-full.jpg" },
                  },
                ],
              }
            },
          }
        }

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
          return { query: { pages: [] }, results: [] }
        },
      }
    }

    config.braveApiKey = "test-key"

    const results = await searchVerbImages(
      { infinitive: "laufen", displayForm: "läuft" },
      {
        english: "run",
        imageSearchTerms: ["Mann läuft", "laufen im Park"],
      },
      { pageSize: 6, total: 6 }
    )

    expect(results[0]).toEqual(
      expect.objectContaining({
        title: "Mann läuft im Park",
        queryUsed: "Mann läuft",
      })
    )
  })

  test("searchWordImages diversifies first-page milk results across visual archetypes", async () => {
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

      if (parsed.hostname === "api.openverse.org") {
        const query = parsed.searchParams.get("q")

        if (query === "Glas Milch") {
          return {
            ok: true,
            async json() {
              return {
                results: [
                  {
                    title: "Glass of milk on table",
                    thumbnail: "https://img.example/milk-glass.jpg",
                    url: "https://img.example/milk-glass-full.jpg",
                    creator: "tester",
                    license: "cc0",
                  },
                ],
              }
            },
          }
        }

        if (query === "Milchpackung") {
          return {
            ok: true,
            async json() {
              return {
                results: [
                  {
                    title: "Milk carton on breakfast table",
                    thumbnail: "https://img.example/milk-carton.jpg",
                    url: "https://img.example/milk-carton-full.jpg",
                    creator: "tester",
                    license: "cc0",
                  },
                ],
              }
            },
          }
        }

        if (query === "Milch trinken") {
          return {
            ok: true,
            async json() {
              return {
                results: [
                  {
                    title: "Child drinking milk",
                    thumbnail: "https://img.example/milk-drinking.jpg",
                    url: "https://img.example/milk-drinking-full.jpg",
                    creator: "tester",
                    license: "cc0",
                  },
                ],
              }
            },
          }
        }

        if (query === "Milchkuh") {
          return {
            ok: true,
            async json() {
              return {
                results: [
                  {
                    title: "Cow with milk pail",
                    thumbnail: "https://img.example/milk-cow.jpg",
                    url: "https://img.example/milk-cow-full.jpg",
                    creator: "tester",
                    license: "cc0",
                  },
                ],
              }
            },
          }
        }

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

    const results = await searchWordImages(
      { bareNoun: "Milch" },
      {
        english: "milk",
        imageSearchTerms: ["Milch"],
      },
      { pageSize: 6, total: 6 }
    )

    expect(results.slice(0, 4)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Glass of milk on table", queryBucket: "container" }),
        expect.objectContaining({ title: "Milk carton on breakfast table", queryBucket: "container" }),
        expect.objectContaining({ title: "Child drinking milk", queryBucket: "action" }),
        expect.objectContaining({ title: "Cow with milk pail", queryBucket: "source" }),
      ])
    )
  })

  test("resolveWordPronunciation uses Wiktionary IPA even when no audio is available", async () => {
    global.fetch = async (url) => {
      const parsed = new URL(url)

      if (parsed.hostname === "de.wiktionary.org") {
        return {
          ok: true,
          async json() {
            return {
              parse: {
                text: `
                  <div>
                    <p>Aussprache:</p>
                    <p><a>IPA</a>: [ˈvoːnʊŋ]</p>
                  </div>
                `,
              },
            }
          },
        }
      }

      throw new Error(`Unexpected URL: ${url}`)
    }

    const pronunciation = await resolveWordPronunciation({
      canonical: "die Wohnung",
      bareNoun: "Wohnung",
    })

    expect(pronunciation).toEqual({
      ipa: "[diː ˈvoːnʊŋ]",
      audioPath: null,
      source: "Wiktionary",
    })
  })
})
