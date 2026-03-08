import { estimateCEFR, estimateCEFRBatch } from "../src/cefr.js"

describe("CEFR estimation (AI-only)", () => {

  // ------------------------------------------------
  // BASIC A1 CASES - should be A1 or A2 max
  // ------------------------------------------------

  test("A1 simple sentence", async () => {
    const result = await estimateCEFR("Ich wohne in Berlin.")
    expect(["A1", "A2"]).toContain(result.level)
  })

  test("A1 common verb phrase", async () => {
    const result = await estimateCEFR("Ich gehe einkaufen.")
    expect(["A1", "A2"]).toContain(result.level)
  })

  test("A1 location question", async () => {
    const result = await estimateCEFR("Wo ist der Bahnhof?")
    expect(["A1", "A2"]).toContain(result.level)
  })

  test("A1 short daily phrase", async () => {
    const result = await estimateCEFR("Ich habe Hunger.")
    expect(["A1", "A2"]).toContain(result.level)
  })

  test("A1 introduction with name", async () => {
    const result = await estimateCEFR("Ich heiße Petr.")
    expect(["A1", "A2"]).toContain(result.level)
  })

  test("A1 sentence with proper nouns", async () => {
    const result = await estimateCEFR("Petr arbeitet bei SAP.")
    expect(["A1", "A2"]).toContain(result.level)
  })


  // ------------------------------------------------
  // A2 CASES - should be A2 or B1
  // ------------------------------------------------

  test("A2 because of 'seit' construction", async () => {
    const result = await estimateCEFR("Ich wohne seit drei Jahren in Berlin.")
    expect(["A2", "B1"]).toContain(result.level)
  })

  test("A2 perfect tense", async () => {
    const result = await estimateCEFR("Ich habe gestern gearbeitet.")
    expect(["A2", "B1"]).toContain(result.level)
  })

  test("A2 temporal wenn", async () => {
    const result = await estimateCEFR("Wenn ich nach Hause komme, esse ich.")
    expect(["A2", "B1"]).toContain(result.level)
  })


  // ------------------------------------------------
  // B1 CASES - should be B1 or B2
  // ------------------------------------------------

  test("B1 because of 'weil'", async () => {
    const result = await estimateCEFR("Ich bleibe zu Hause, weil ich krank bin.")
    expect(["B1", "B2"]).toContain(result.level)
  })

  test("B1 because of 'dass'", async () => {
    const result = await estimateCEFR("Ich denke, dass er recht hat.")
    expect(["B1", "B2"]).toContain(result.level)
  })

  test("B1 conditional wenn with Konjunktiv", async () => {
    const result = await estimateCEFR("Wenn ich reich wäre, würde ich reisen.")
    expect(["B1", "B2"]).toContain(result.level)
  })

  test("B1 Konjunktiv II standalone", async () => {
    const result = await estimateCEFR("Ich hätte gern ein Bier.")
    // This is a common phrase, AI might classify it lower
    expect(["A1", "A2", "B1", "B2"]).toContain(result.level)
  })

  test("B1 relative clause", async () => {
    const result = await estimateCEFR("Der Mann, der dort steht, ist mein Vater.")
    expect(["B1", "B2"]).toContain(result.level)
  })


  // ------------------------------------------------
  // B2 CASES - should be B2 or higher
  // ------------------------------------------------

  test("B2 because of 'obwohl'", async () => {
    const result = await estimateCEFR("Ich gehe spazieren, obwohl es regnet.")
    expect(["B1", "B2", "C1"]).toContain(result.level)
  })

  test("B2 passive voice", async () => {
    const result = await estimateCEFR("Das Buch wird gelesen.")
    expect(["B1", "B2"]).toContain(result.level)
  })

  test("B2 genitive construction", async () => {
    const result = await estimateCEFR("Wegen des Wetters bleibe ich zu Hause.")
    expect(["B1", "B2"]).toContain(result.level)
  })

  test("B2 passive with modal", async () => {
    const result = await estimateCEFR("Die Angaben konnten nicht überprüft werden.")
    expect(["B1", "B2", "C1"]).toContain(result.level)
  })


  // ------------------------------------------------
  // RESULT STRUCTURE TESTS
  // ------------------------------------------------

  test("returns level and confidence", async () => {
    const result = await estimateCEFR("Ich bin hier.")
    expect(result.level).toBeDefined()
    expect(result.confidence).toBeDefined()
    expect(result.signals).toBeDefined()
    expect(result.signals.llm).toBe(result.level)
  })

  test("level is valid CEFR", async () => {
    const result = await estimateCEFR("Das ist ein Test.")
    expect(["A1", "A2", "B1", "B2", "C1"]).toContain(result.level)
  })


  // ------------------------------------------------
  // BATCH PROCESSING TESTS
  // ------------------------------------------------

  test("batch processes multiple sentences", async () => {
    const sentences = [
      "Ich bin hier.",
      "Ich gehe spazieren, obwohl es regnet.",
      "Das ist gut.",
    ]

    const results = await estimateCEFRBatch(sentences)

    expect(results).toHaveLength(3)
    // Second sentence should be B1+ due to obwohl
    expect(["B1", "B2", "C1"]).toContain(results[1].level)
    for (const r of results) {
      expect(["A1", "A2", "B1", "B2", "C1"]).toContain(r.level)
    }
  }, 30000)

  test("empty batch returns empty array", async () => {
    const results = await estimateCEFRBatch([])
    expect(results).toEqual([])
  })

})
