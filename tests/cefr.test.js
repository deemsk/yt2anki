import { jest } from "@jest/globals"

// ---------------------------------------------------------------------------
// Mock OpenAI — returns a level based on linguistic markers in the sentence,
// mirroring what the real model would say per the system prompt guidelines.
// ---------------------------------------------------------------------------

function mockLevel(sentence) {
  // C1: sophisticated / specialized
  if (/\b(infolgedessen|nichtsdestotrotz|hinsichtlich|diesbezüglich)\b/i.test(sentence)) return "C1"
  // B2: passive, genitive (wegen des/der), obwohl, trotzdem
  if (/\b(obwohl|trotzdem|wegen des|wegen der)\b/i.test(sentence)) return "B2"
  if (/\bwird\b.+\b(gelesen|geschrieben|gemacht|überprüft)\b/i.test(sentence)) return "B2"
  if (/\bkonnten\b.*\bwerden\b/i.test(sentence)) return "B2"
  // B1: subordinate clauses, Konjunktiv II, relative clauses
  if (/\b(weil|dass|hätte|wäre|würde)\b/i.test(sentence)) return "B1"
  if (/,\s*der\s+dort\b/i.test(sentence)) return "B1"
  if (/\bwenn\b.+\bkomme\b/i.test(sentence)) return "B1"
  // A2: perfect tense, seit, temporal wenn
  if (/\b(habe|hat|haben|habt)\b.+\b(gearbeitet|gegangen|gemacht|gesagt)\b/i.test(sentence)) return "A2"
  if (/\bseit\b/i.test(sentence)) return "A2"
  // A1: everything else
  return "A1"
}

const mockCreate = jest.fn(async ({ messages, response_format }) => {
  const userMessage = messages.find((m) => m.role === "user")?.content ?? ""

  if (response_format?.type === "json_object") {
    // Batch call — numbered sentences
    const lines = userMessage.split("\n").filter(Boolean)
    const results = lines.map((line) => {
      const match = line.match(/^(\d+)\.\s+(.+)$/)
      if (!match) return null
      return { id: parseInt(match[1]), level: mockLevel(match[2]) }
    }).filter(Boolean)
    return { choices: [{ message: { content: JSON.stringify(results) } }] }
  }

  // Single call
  return { choices: [{ message: { content: mockLevel(userMessage) } }] }
})

jest.unstable_mockModule("openai", () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}))

jest.unstable_mockModule("../src/lib/secrets.js", () => ({
  resolveSecret: jest.fn(async (v) => v || "test-key"),
}))

const { estimateCEFR, estimateCEFRBatch, estimateLexicalCEFR } = await import("../src/cefr.js")

// ---------------------------------------------------------------------------

describe("CEFR estimation", () => {
  beforeEach(() => mockCreate.mockClear())

  // ------------------------------------------------
  // A1 CASES
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
  // A2 CASES
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
  // B1 CASES
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
    expect(["A1", "A2", "B1", "B2"]).toContain(result.level)
  })

  test("B1 relative clause", async () => {
    const result = await estimateCEFR("Der Mann, der dort steht, ist mein Vater.")
    expect(["B1", "B2"]).toContain(result.level)
  })

  // ------------------------------------------------
  // B2 CASES
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

  test("estimateLexicalCEFR classifies a single lexical item", async () => {
    const result = await estimateLexicalCEFR("der Bahnhof", {
      lexicalType: "noun",
      meaning: "вокзал",
    })

    expect(result.level).toBeDefined()
    expect(["A1", "A2", "B1", "B2", "C1"]).toContain(result.level)
    expect(result.confidence).toBeDefined()
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
    expect(["B1", "B2", "C1"]).toContain(results[1].level)
    for (const r of results) {
      expect(["A1", "A2", "B1", "B2", "C1"]).toContain(r.level)
    }
  })

  test("batch uses a single API call for multiple sentences", async () => {
    await estimateCEFRBatch(["Ich bin hier.", "Ich gehe spazieren, obwohl es regnet."])
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  test("empty batch returns empty array", async () => {
    const results = await estimateCEFRBatch([])
    expect(results).toEqual([])
  })
})
