import { resolveVerbMorphology } from "../src/cardContent/verbMorphology.js"

function form(form, tags) {
  return { form, tags: ["present", "indicative", ...tags] }
}

describe("verb morphology resolution", () => {
  test("selects du and er forms for a strong verb with stem change", async () => {
    const morphology = await resolveVerbMorphology("fahren", {
      payload: {
        tags: ["strong"],
        forms: [
          form("fährst", ["second-person", "singular"]),
          form("fährt", ["third-person", "singular"]),
          form("fahren", ["first-person", "plural"]),
        ],
      },
    })

    expect(morphology).toEqual(expect.objectContaining({
      classification: "strong",
      confidence: "high",
      source: "WiktApi",
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

  test("marks separable verbs and keeps irregular selected forms", async () => {
    const morphology = await resolveVerbMorphology("einsteigen", {
      payload: {
        tags: ["strong", "separable"],
        forms: [
          form("steigst ein", ["second-person", "singular"]),
          form("steigt ein", ["third-person", "singular"]),
        ],
      },
    })

    expect(morphology.isSeparable).toBe(true)
    expect(morphology.particle).toBe("ein")
    expect(morphology.selectedForms.map((entry) => entry.form)).toEqual(["steigst", "steigt"])
    expect(morphology.selectedForms.map((entry) => entry.displayForm)).toEqual(["steigst ein", "steigt ein"])
  })

  test("prefers the longest separable prefix match", async () => {
    const morphology = await resolveVerbMorphology("zurückfahren", {
      payload: {
        tags: ["strong", "separable"],
        forms: [
          form("fährst zurück", ["second-person", "singular"]),
          form("fährt zurück", ["third-person", "singular"]),
        ],
      },
    })

    expect(morphology.particle).toBe("zurück")
    expect(morphology.selectedForms.map((entry) => entry.form)).toEqual(["fährst", "fährt"])
    expect(morphology.selectedForms.map((entry) => entry.displayForm)).toEqual(["fährst zurück", "fährt zurück"])
  })
})
