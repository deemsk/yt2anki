import { resolveVerbMorphology } from "../src/cardContent/verbMorphology.js"

function form(form, tags) {
  return { form, tags: ["present", "indicative", ...tags] }
}

describe("verb morphology resolution", () => {
  test("selects only non-regular target forms for a strong verb with stem change", async () => {
    const morphology = await resolveVerbMorphology("fahren", {
      payload: {
        tags: ["strong"],
        forms: [
          form("fährst", ["second-person", "singular"]),
          form("fährt", ["third-person", "singular"]),
          form("fahrt", ["second-person", "plural"]),
          form("fahren", ["first-person", "plural"]),
        ],
      },
    })

    expect(morphology).toEqual(expect.objectContaining({
      classification: "strong",
      confidence: "high",
      source: "wiktapi",
    }))
    expect(morphology.selectedForms.map((entry) => [entry.key, entry.form])).toEqual([
      ["du", "fährst"],
      ["er", "fährt"],
    ])
  })

  test("does not select safely inferable weak forms", async () => {
    const morphology = await resolveVerbMorphology("machen", {
      payload: {
        tags: ["weak"],
        forms: [
          form("machst", ["second-person", "singular"]),
          form("macht", ["third-person", "singular"]),
        ],
      },
    })

    expect(morphology.classification).toBe("weak")
    expect(morphology.selectedForms).toEqual([])
  })

  test("does not infer strong classification from regular weak spelling changes", async () => {
    const arbeiten = await resolveVerbMorphology("arbeiten", {
      payload: {
        forms: [
          form("arbeitest", ["second-person", "singular"]),
          form("arbeitet", ["third-person", "singular"]),
        ],
      },
    })
    const reisen = await resolveVerbMorphology("reisen", {
      payload: {
        forms: [
          form("reist", ["second-person", "singular"]),
          form("reist", ["third-person", "singular"]),
        ],
      },
    })

    expect(arbeiten.classification).toBe("unknown")
    expect(arbeiten.confidence).toBe("low")
    expect(reisen.classification).toBe("unknown")
    expect(reisen.confidence).toBe("low")
  })

  test("selects non-regular present forms even without a strong classification label", async () => {
    const morphology = await resolveVerbMorphology("geben", {
      payload: {
        forms: [
          form("gibst", ["second-person", "singular"]),
          form("gibt", ["third-person", "singular"]),
          form("gebt", ["second-person", "plural"]),
        ],
      },
    })

    expect(morphology.classification).toBe("irregular-present")
    expect(morphology.confidence).toBe("high")
    expect(morphology.selectedForms.map((entry) => [entry.key, entry.form])).toEqual([
      ["du", "gibst"],
      ["er", "gibt"],
    ])
  })

  test("includes ihr when the ihr form is not safely inferable", async () => {
    const morphology = await resolveVerbMorphology("exampleln", {
      payload: {
        tags: ["mixed"],
        forms: [
          form("examplst", ["second-person", "singular"]),
          form("examplt", ["third-person", "singular"]),
          form("examplet", ["second-person", "plural"]),
        ],
      },
    })

    expect(morphology.confidence).toBe("high")
    expect(morphology.selectedForms.map((entry) => entry.key)).toEqual(["du", "er", "ihr"])
  })

  test("selects all essential forms for sein", async () => {
    const morphology = await resolveVerbMorphology("sein", {
      payload: {
        tags: ["irregular"],
        forms: [
          form("bin", ["first-person", "singular"]),
          form("bist", ["second-person", "singular"]),
          form("ist", ["third-person", "singular"]),
          form("sind", ["first-person", "plural"]),
          form("seid", ["second-person", "plural"]),
          form("sind", ["third-person", "plural"]),
        ],
      },
    })

    expect(morphology.classification).toBe("core-irregular")
    expect(morphology.selectedForms.map((entry) => entry.key)).toEqual(["ich", "du", "er", "wir", "ihr", "sie"])
  })

  test("keeps umlaut core irregulars eligible for morphology packages", async () => {
    const morphology = await resolveVerbMorphology("dürfen", {
      payload: {
        tags: ["modal"],
        forms: [
          form("darf", ["first-person", "singular"]),
          form("darfst", ["second-person", "singular"]),
          form("darf", ["third-person", "singular"]),
          form("dürfen", ["first-person", "plural"]),
          form("dürft", ["second-person", "plural"]),
          form("dürfen", ["third-person", "plural"]),
        ],
      },
    })

    expect(morphology.infinitive).toBe("dürfen")
    expect(morphology.classification).toBe("core-irregular")
    expect(morphology.confidence).toBe("high")
    expect(morphology.selectedForms.map((entry) => [entry.key, entry.form])).toEqual([
      ["ich", "darf"],
      ["du", "darfst"],
      ["er", "darf"],
      ["wir", "dürfen"],
      ["ihr", "dürft"],
      ["sie", "dürfen"],
    ])
  })

  test.each([
    ["dürfen", [["ich", "darf"], ["du", "darfst"], ["er", "darf"], ["wir", "dürfen"], ["ihr", "dürft"], ["sie", "dürfen"]]],
    ["mögen", [["ich", "mag"], ["du", "magst"], ["er", "mag"], ["wir", "mögen"], ["ihr", "mögt"], ["sie", "mögen"]]],
    ["können", [["ich", "kann"], ["du", "kannst"], ["er", "kann"], ["wir", "können"], ["ihr", "könnt"], ["sie", "können"]]],
  ])("uses curated core fallback for %s after forms lookup fails and search resolves the lemma", async (lemma, expectedForms) => {
    const originalFetch = global.fetch
    global.fetch = async (url) => {
      if (String(url).includes("/forms/")) {
        return { ok: false, async json() { return {} } }
      }

      return {
        ok: true,
        async json() {
          return {
            results: [{ word: lemma, lang_code: "de", pos: "verb" }],
          }
        },
      }
    }

    let morphology
    try {
      morphology = await resolveVerbMorphology(lemma, {
        urls: [`https://example.test/forms/${lemma}`],
        searchUrls: [`https://example.test/search/${lemma}`],
        timeoutMs: 100,
      })
    } finally {
      global.fetch = originalFetch
    }

    expect(morphology).toEqual(expect.objectContaining({
      infinitive: lemma,
      classification: "core-irregular",
      confidence: "high",
      source: "curated-core-fallback",
    }))
    expect(morphology.selectedForms.map((entry) => [entry.key, entry.form])).toEqual(expectedForms)
  })

  test("uses the real umlaut infinitive for WiktApi lookup before core fallback", async () => {
    const originalFetch = global.fetch
    const urls = []
    global.fetch = async (url) => {
      urls.push(url)
      if (String(url).includes("/search/")) {
        return {
          ok: true,
          async json() {
            return {
              results: [{ word: "dürfen", lang_code: "de", pos: "verb" }],
            }
          },
        }
      }

      return { ok: false, async json() { return {} } }
    }

    try {
      await resolveVerbMorphology("dürfen", {
        timeoutMs: 100,
        urls: ["https://example.test/forms/dürfen"],
        searchUrls: ["https://example.test/search/dürfen"],
      })
    } finally {
      global.fetch = originalFetch
    }

    expect(urls).toEqual([
      "https://example.test/forms/dürfen",
      "https://example.test/search/dürfen",
    ])
  })

  test("does not use curated fallback for non-core verbs even when search resolves the lemma", async () => {
    const originalFetch = global.fetch
    global.fetch = async () => ({ ok: false, async json() { return {} } })

    let morphology
    try {
      morphology = await resolveVerbMorphology("geben", {
        urls: ["https://example.test/forms/geben"],
        searchPayload: {
          results: [{ word: "geben", lang_code: "de", pos: "verb" }],
        },
        timeoutMs: 100,
      })
    } finally {
      global.fetch = originalFetch
    }

    expect(morphology).toEqual({
      infinitive: "geben",
      confidence: "low",
      reason: "wiktapi-unavailable",
      selectedForms: [],
    })
  })

  test("marks separable verbs without selecting regular present forms", async () => {
    const morphology = await resolveVerbMorphology("einsteigen", {
      payload: {
        tags: ["strong", "separable"],
        forms: [
          form("steigst ein", ["second-person", "singular"]),
          form("steigt ein", ["third-person", "singular"]),
          form("steigt ein", ["second-person", "plural"]),
        ],
      },
    })

    expect(morphology.isSeparable).toBe(true)
    expect(morphology.particle).toBe("ein")
    expect(morphology.confidence).toBe("low")
    expect(morphology.selectedForms).toEqual([])
  })

  test("prefers the longest separable prefix match", async () => {
    const morphology = await resolveVerbMorphology("zurückfahren", {
      payload: {
        tags: ["strong", "separable"],
        forms: [
          form("fährst zurück", ["second-person", "singular"]),
          form("fährt zurück", ["third-person", "singular"]),
          form("fahrt zurück", ["second-person", "plural"]),
        ],
      },
    })

    expect(morphology.particle).toBe("zurück")
    expect(morphology.selectedForms.map((entry) => entry.form)).toEqual(["fährst", "fährt"])
    expect(morphology.selectedForms.map((entry) => entry.displayForm)).toEqual(["fährst zurück", "fährt zurück"])
  })
})
