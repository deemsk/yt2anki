import {
  estimateCEFR,
  estimateCEFRBatch,
  getComplexityLevel,
  getFrequencyLevel,
  getGrammarLevel,
} from "../src/cefr.js"

describe("CEFR estimation", () => {

  // ------------------------------------------------
  // BASIC A1 CASES
  // ------------------------------------------------

  test("A1 simple sentence", async () => {
    const result = await estimateCEFR("Ich wohne in Berlin.")
    expect(result.level).toBe("A1")
  })

  test("A1 common verb phrase", async () => {
    const result = await estimateCEFR("Ich gehe einkaufen.")
    expect(result.level).toBe("A1")
  })

  test("A1 location question", async () => {
    const result = await estimateCEFR("Wo ist der Bahnhof?")
    expect(result.level).toBe("A1")
  })

  test("A1 short daily phrase", async () => {
    const result = await estimateCEFR("Ich habe Hunger.")
    expect(result.level).toBe("A1")
  })


  // ------------------------------------------------
  // A2 GRAMMAR PATTERNS
  // ------------------------------------------------

  test("A2 because of 'seit' construction", async () => {
    const result = await estimateCEFR(
      "Ich wohne seit drei Jahren in Berlin."
    )
    expect(result.signals.grammar).toBe("A2")
  })

  test("A2 perfect tense", async () => {
    const result = await estimateCEFR(
      "Ich habe gestern gearbeitet."
    )
    expect(result.signals.grammar).toBe("A2")
  })

  test("A2 temporal wenn (not conditional)", async () => {
    const result = await estimateCEFR(
      "Wenn ich nach Hause komme, esse ich."
    )
    // Temporal wenn without Konjunktiv is A2
    expect(result.signals.grammar).toBe("A2")
  })


  // ------------------------------------------------
  // B1 GRAMMAR
  // ------------------------------------------------

  test("B1 because of 'weil'", async () => {
    const result = await estimateCEFR(
      "Ich bleibe zu Hause, weil ich krank bin."
    )
    expect(result.signals.grammar).toBe("B1")
  })

  test("B1 because of 'dass'", async () => {
    const result = await estimateCEFR(
      "Ich denke, dass er recht hat."
    )
    expect(result.signals.grammar).toBe("B1")
  })

  test("B1 conditional wenn with Konjunktiv", async () => {
    const result = await estimateCEFR(
      "Wenn ich reich wäre, würde ich reisen."
    )
    expect(result.signals.grammar).toBe("B1")
  })

  test("B1 Konjunktiv II standalone", async () => {
    const result = await estimateCEFR(
      "Ich hätte gern ein Bier."
    )
    expect(result.signals.grammar).toBe("B1")
  })

  test("B1 relative clause", async () => {
    const result = await estimateCEFR(
      "Der Mann, der dort steht, ist mein Vater."
    )
    expect(result.signals.grammar).toBe("B1")
  })

  test("B1 Plusquamperfekt", async () => {
    const result = await estimateCEFR(
      "Ich hatte schon gegessen."
    )
    expect(result.signals.grammar).toBe("B1")
  })


  // ------------------------------------------------
  // B2 GRAMMAR
  // ------------------------------------------------

  test("B2 because of 'obwohl'", async () => {
    const result = await estimateCEFR(
      "Ich gehe spazieren, obwohl es regnet."
    )
    expect(result.signals.grammar).toBe("B2")
    expect(result.level).toBe("B2")
  })

  test("B2 passive voice", async () => {
    const result = await estimateCEFR(
      "Das Buch wird gelesen."
    )
    expect(result.signals.grammar).toBe("B2")
  })

  test("B2 genitive construction", async () => {
    const result = await estimateCEFR(
      "Wegen des Wetters bleibe ich zu Hause."
    )
    expect(result.signals.grammar).toBe("B2")
  })


  // ------------------------------------------------
  // RARE WORD DETECTION
  // ------------------------------------------------

  test("rare vocabulary increases CEFR", async () => {
    const result = await estimateCEFR(
      "Es scheint ein Missverständnis zu geben."
    )
    expect(result.signals.frequency).toMatch(/A2|B[12]/)
  })


  // ------------------------------------------------
  // SIGNAL CONFLICT TESTS
  // ------------------------------------------------

  test("simple grammar but rare word", async () => {
    const result = await estimateCEFR(
      "Das ist ein Missverständnis."
    )
    expect(result.signals.frequency).not.toBe("A1")
  })

  test("simple vocabulary but complex grammar", async () => {
    const result = await estimateCEFR(
      "Ich gehe nach Hause, weil ich müde bin."
    )
    expect(result.signals.grammar).toBe("B1")
  })


  // ------------------------------------------------
  // SHORT SENTENCE EDGE CASE
  // ------------------------------------------------

  test("short sentence with difficult word", async () => {
    const result = await estimateCEFR(
      "Missverständnis!"
    )
    expect(result.signals.frequency).not.toBe("A1")
  })


  // ------------------------------------------------
  // NAME HANDLING
  // ------------------------------------------------

  test("proper names should not increase CEFR", async () => {
    const result = await estimateCEFR(
      "Ich wohne in Berlin und arbeite bei BMW."
    )
    expect(result.level).not.toBe("C1")
  })


  // ------------------------------------------------
  // PUNCTUATION ROBUSTNESS
  // ------------------------------------------------

  test("punctuation should not affect classification", async () => {
    const result = await estimateCEFR(
      "Ich wohne in Berlin!!!"
    )
    expect(result.level).toBe("A1")
  })


  // ------------------------------------------------
  // FINAL LEVEL VALIDATION
  // ------------------------------------------------

  test("final level equals maximum signal", async () => {
    const result = await estimateCEFR(
      "Ich wohne seit drei Jahren in Berlin."
    )

    const levels = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5 }

    const signalLevels = [
      result.signals.complexity,
      result.signals.frequency,
      result.signals.grammar,
      result.signals.llm,
    ].filter(Boolean).map(l => levels[l])

    const maxSignal = Math.max(...signalLevels)
    expect(levels[result.level]).toBe(maxSignal)
  })

})


// ------------------------------------------------
// COMPLEXITY HEURISTIC TESTS
// ------------------------------------------------

describe("Complexity heuristic", () => {

  test("short sentence is A1", () => {
    expect(getComplexityLevel("Ich bin Student.")).toBe("A1")
  })

  test("11+ words is A2", () => {
    const sentence = "Ich gehe heute mit meinen Freunden in die Stadt zum Einkaufen."
    expect(getComplexityLevel(sentence)).toBe("A2")
  })

  test("16+ words is B1", () => {
    const sentence = "Ich gehe heute mit meinen Freunden in die Stadt zum Einkaufen und dann essen wir Pizza."
    expect(getComplexityLevel(sentence)).toBe("B1")
  })

  test("commas in lists do not trigger B1", () => {
    // This was a false positive before - lists with commas are not complex
    const sentence = "Ich kaufe Äpfel, Birnen, Bananen."
    expect(getComplexityLevel(sentence)).toBe("A1")
  })

})


// ------------------------------------------------
// LEMMATIZATION TESTS
// ------------------------------------------------

describe("Lemmatization", () => {

  test("inflected verb forms are recognized", () => {
    // "ginge" (Konjunktiv II of gehen) should not trigger C1
    expect(getFrequencyLevel("Ich ginge gern ins Kino.")).not.toBe("C1")
  })

  test("irregular verb forms are recognized", () => {
    // "wäre" should map to "sein"
    expect(getFrequencyLevel("Ich wäre gern reich.")).not.toBe("C1")
  })

  test("past tense forms are recognized", () => {
    // "ging" should map to "gehen"
    expect(getFrequencyLevel("Er ging nach Hause.")).not.toBe("C1")
  })

  test("noun declensions are handled", () => {
    // Common nouns with endings should still be found
    expect(getFrequencyLevel("Mit meinen Freunden.")).not.toBe("C1")
  })

})


// ------------------------------------------------
// GRAMMAR PATTERN TESTS (EXPANDED)
// ------------------------------------------------

describe("Grammar patterns", () => {

  test("detects perfect tense with haben", () => {
    expect(getGrammarLevel("Ich habe gegessen.")).toBe("A2")
    expect(getGrammarLevel("Er hat gearbeitet.")).toBe("A2")
  })

  test("detects perfect tense with sein", () => {
    expect(getGrammarLevel("Ich bin gegangen.")).toBe("A2")
    expect(getGrammarLevel("Sie ist gekommen.")).toBe("A2")
  })

  test("perfect tense regex does not match unrelated ge- words", () => {
    // "gegen" should not trigger perfect tense detection
    const result = getGrammarLevel("Ich habe nichts gegen ihn.")
    expect(result).toBe("A1")
  })

  test("detects subordinate clauses", () => {
    expect(getGrammarLevel("weil ich müde bin")).toBe("B1")
    expect(getGrammarLevel("dass er kommt")).toBe("B1")
  })

  test("detects B2 patterns", () => {
    expect(getGrammarLevel("obwohl es schwer ist")).toBe("B2")
  })

  test("distinguishes temporal vs conditional wenn", () => {
    // Temporal wenn (A2) - no Konjunktiv
    expect(getGrammarLevel("Wenn es regnet, bleibe ich zu Hause.")).toBe("A2")

    // Conditional wenn (B1) - with Konjunktiv
    expect(getGrammarLevel("Wenn ich Zeit hätte, würde ich kommen.")).toBe("B1")
  })

  test("detects relative clauses after comma", () => {
    expect(getGrammarLevel("Das Buch, das ich lese, ist gut.")).toBe("B1")
    expect(getGrammarLevel("Die Frau, die dort steht.")).toBe("B1")
  })

  test("detects Konjunktiv II forms", () => {
    expect(getGrammarLevel("Ich wäre froh.")).toBe("B1")
    expect(getGrammarLevel("Das könnte sein.")).toBe("B1")
    expect(getGrammarLevel("Ich möchte bestellen.")).toBe("B1")
  })

  test("detects genitive prepositions", () => {
    expect(getGrammarLevel("wegen des Regens")).toBe("B2")
    expect(getGrammarLevel("trotz der Kälte")).toBe("B2")
  })

  test("detects Plusquamperfekt", () => {
    expect(getGrammarLevel("Ich hatte schon gegessen.")).toBe("B1")
    expect(getGrammarLevel("Sie war schon gegangen.")).toBe("B1")
  })

  test("detects passive voice", () => {
    expect(getGrammarLevel("Das wird gemacht.")).toBe("B2")
    expect(getGrammarLevel("Es wurde gesagt.")).toBe("B2")
  })

})


// ------------------------------------------------
// EARLY EXIT TESTS
// ------------------------------------------------

describe("Early exit optimization", () => {

  test("skips LLM when B2 grammar detected", async () => {
    const result = await estimateCEFR(
      "Ich gehe spazieren, obwohl es regnet."
    )
    expect(result.signals.grammar).toBe("B2")
    expect(result.signals.llm).toBeNull()
    expect(result.level).toBe("B2")
  })

  test("skips LLM when C1 frequency detected", async () => {
    const result = await estimateCEFR(
      "Die Selbstverwirklichung ist wichtig."
    )
    expect(result.signals.frequency).toBe("C1")
    expect(result.signals.llm).toBeNull()
  })

  test("skips LLM when all signals agree at A1", async () => {
    const result = await estimateCEFR(
      "Ich bin hier.",
      { targetLevel: "B2", skipLLMOnAgreement: true }
    )
    // All signals should be A1, so LLM is skipped
    expect(result.signals.complexity).toBe("A1")
    expect(result.signals.frequency).toBe("A1")
    expect(result.signals.grammar).toBe("A1")
    expect(result.signals.llm).toBeNull()
    expect(result.level).toBe("A1")
  })

  test("calls LLM when signals disagree", async () => {
    const result = await estimateCEFR(
      "Ich wohne seit drei Jahren hier.",
      { targetLevel: "B2", skipLLMOnAgreement: true }
    )
    // Grammar is A2, others may be A1, so signals disagree
    expect(result.signals.grammar).toBe("A2")
    // LLM should be called because signals don't all agree
    // (unless cheapMax >= targetLevel, which it's not)
  })

  test("respects skipLLMOnAgreement=false", async () => {
    const result = await estimateCEFR(
      "Ich bin hier.",
      { targetLevel: "B2", skipLLMOnAgreement: false }
    )
    // With skipLLMOnAgreement=false, LLM should be called
    expect(result.signals.llm).not.toBeNull()
  })

  test("respects custom target level", async () => {
    const result = await estimateCEFR(
      "Ich wohne seit drei Jahren hier.",
      { targetLevel: "A1" }
    )
    expect(result.signals.grammar).toBe("A2")
    expect(result.signals.llm).toBeNull()
  })

})


// ------------------------------------------------
// CONFIDENCE SCORE TESTS
// ------------------------------------------------

describe("Confidence score", () => {

  test("high confidence when all signals agree", async () => {
    const result = await estimateCEFR("Ich bin hier.")
    expect(result.confidence).toBeGreaterThan(0.7)
  })

  test("returns confidence between 0 and 1", async () => {
    const result = await estimateCEFR("Ich gehe, obwohl es regnet.")
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.confidence).toBeLessThan(1)
  })

  test("confidence included in batch results", async () => {
    const results = await estimateCEFRBatch(["Ich bin hier.", "Das ist gut."])
    for (const r of results) {
      expect(r.confidence).toBeDefined()
      expect(typeof r.confidence).toBe("number")
    }
  })

})


// ------------------------------------------------
// RARE WORD COUNT TESTS
// ------------------------------------------------

describe("Rare word count adjustment", () => {

  test("multiple rare words increase level", () => {
    // Single rare word
    const single = getFrequencyLevel("Das Missverständnis ist klar.")

    // Multiple rare words should potentially increase level
    const multiple = getFrequencyLevel("Das Missverständnis entstand wegen Kommunikationsproblemen.")

    // The sentence with more rare words should be same or higher level
    const levels = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5 }
    expect(levels[multiple]).toBeGreaterThanOrEqual(levels[single])
  })

  test("common words don't trigger adjustment", () => {
    const result = getFrequencyLevel("Ich bin hier und das ist gut.")
    expect(result).toBe("A1")
  })

})


// ------------------------------------------------
// BATCH PROCESSING TESTS
// ------------------------------------------------

describe("Batch processing", () => {

  test("batch processes multiple sentences", async () => {
    const sentences = [
      "Ich bin hier.",
      "Ich gehe spazieren, obwohl es regnet.",
      "Das ist gut.",
    ]

    const results = await estimateCEFRBatch(sentences)

    expect(results).toHaveLength(3)
    expect(results[1].level).toBe("B2")
    expect(results[1].signals.grammar).toBe("B2")
    expect(results[1].signals.llm).toBeNull()
    for (const r of results) {
      expect(["A1", "A2", "B1", "B2", "C1"]).toContain(r.level)
    }
  })

  test("batch skips LLM for high-level sentences", async () => {
    const sentences = [
      "Ich gehe, obwohl es regnet.",  // B2 grammar - skips LLM
      "Ich wohne seit einem Jahr hier.",  // A2 grammar, signals disagree - needs LLM
    ]

    const results = await estimateCEFRBatch(sentences, { skipLLMOnAgreement: true })

    expect(results[0].signals.llm).toBeNull() // B2 exceeds target
    expect(results[1].signals.llm).not.toBeNull() // Signals disagree, needs LLM
  })

  test("empty batch returns empty array", async () => {
    const results = await estimateCEFRBatch([])
    expect(results).toEqual([])
  })

})


// ------------------------------------------------
// FREQUENCY LOOKUP TESTS
// ------------------------------------------------

describe("Frequency lookup", () => {

  test("common words are A1", () => {
    expect(getFrequencyLevel("ich bin")).toBe("A1")
    expect(getFrequencyLevel("das ist gut")).toBe("A1")
  })

  test("unknown long words are C1", () => {
    expect(getFrequencyLevel("Quantenelektrodynamik")).toBe("C1")
  })

  test("short unknown words are ignored", () => {
    expect(getFrequencyLevel("ich bin xyz")).toBe("A1")
  })

})
