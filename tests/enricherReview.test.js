import { jest } from "@jest/globals"

const mockCreate = jest.fn(async ({ messages }) => {
  const systemPrompt = messages.find((message) => message.role === "system")?.content ?? ""
  const userPrompt = messages.find((message) => message.role === "user")?.content ?? ""

  if (userPrompt.includes("Return no IPA while changing German")) {
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            german: "Das ist neu.",
            russian: "Это новое.",
          }),
        },
      }],
    }
  }

  if (systemPrompt.includes("Also return imageBrief")) {
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            german: "Der Kaffee ist gut.",
            ipa: "deːr ˈkafeː ɪst ɡuːt",
            russian: "Кофе хороший.",
            imageBrief: {
              searchQuery: "guter Kaffee",
              queryVariants: ["Kaffee gut", "Tasse guter Kaffee"],
              sceneSummary: "A good cup of coffee is the subject.",
              focusRole: "The coffee should look appealing and clearly good.",
              mustShow: ["coffee cup", "coffee as main subject"],
              avoid: ["logos", "text overlays"],
              imagePrompt: "Photo of an appealing cup of coffee.",
            },
          }),
        },
      }],
    }
  }

  return {
    choices: [{
      message: {
        content: JSON.stringify({
          german: "Das ist besser.",
          ipa: "das ɪst ˈbɛsɐ",
          russian: "Так лучше.",
        }),
      },
    }],
  }
})

jest.unstable_mockModule("openai", () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}))

jest.unstable_mockModule("../src/secrets.js", () => ({
  resolveSecret: jest.fn(async (value) => value || "test-key"),
}))

jest.unstable_mockModule("../src/cardContent/cefr.js", () => ({
  estimateCEFR: jest.fn(async () => ({ level: "A1" })),
}))

function normalizeMockIpa(ipa = "") {
  const body = String(ipa || "").trim().replace(/^\[/, "").replace(/\]$/, "").trim()
  return body ? `[${body}]` : ""
}

const mockGenerateGermanIpa = jest.fn(async (_german, options = {}) => normalizeMockIpa(options.fallbackIpa))

jest.unstable_mockModule("../src/cardContent/ipa.js", () => ({
  generateGermanIpa: mockGenerateGermanIpa,
  normalizeSentenceIpa: normalizeMockIpa,
}))

const { enrich, reviewEnrichedText } = await import("../src/enricher.js")

describe("AI preview review helper", () => {
  beforeEach(() => {
    mockCreate.mockClear()
    mockGenerateGermanIpa.mockClear()
  })

  test("enrich regenerates IPA from the final German text", async () => {
    const result = await enrich("das ist besser")

    expect(result).toEqual(
      expect.objectContaining({
        german: "Das ist besser.",
        ipa: "[das ɪst ˈbɛsɐ]",
        russian: "Так лучше.",
      })
    )
    expect(mockGenerateGermanIpa).toHaveBeenCalledWith("Das ist besser.", {
      fallbackIpa: "das ɪst ˈbɛsɐ",
    })

    const call = mockCreate.mock.calls[0][0]
    expect(call.temperature).toBe(0)
    expect(call.response_format).toEqual(expect.objectContaining({
      type: "json_schema",
    }))
  })

  test("reviewEnrichedText applies feedback, normalizes IPA, and returns image brief when requested", async () => {
    const result = await reviewEnrichedText(
      {
        german: "Das Essen ist gut.",
        ipa: "[das ˈʔɛsn̩ ɪst ɡuːt]",
        russian: "Еда хорошая.",
      },
      "Use coffee instead of food, but keep gut as the focus word.",
      {
        cardPurpose: 'Sentence-form adjective card for "gut"',
        requiredTerms: ["gut"],
        includeImageBrief: true,
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        german: "Der Kaffee ist gut.",
        ipa: "[deːr ˈkafeː ɪst ɡuːt]",
        russian: "Кофе хороший.",
        cefr: expect.objectContaining({ level: "A1" }),
        imageBrief: expect.objectContaining({
          searchQuery: "guter Kaffee",
          queryVariants: expect.arrayContaining(["Kaffee gut"]),
        }),
      })
    )

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockGenerateGermanIpa).toHaveBeenCalledWith("Der Kaffee ist gut.", {
      fallbackIpa: "[deːr ˈkafeː ɪst ɡuːt]",
    })
    const [{ messages }] = mockCreate.mock.calls.map(([call]) => call)
    const systemPrompt = messages.find((message) => message.role === "system")?.content ?? ""
    expect(systemPrompt).toContain('Card purpose: Sentence-form adjective card for "gut"')
    expect(systemPrompt).toContain("Keep these German words or forms in the final text if possible: gut")
  })

  test("reviewEnrichedText does not reuse stale IPA when German changes", async () => {
    const result = await reviewEnrichedText(
      {
        german: "Das ist alt.",
        ipa: "[das ɪst alt]",
        russian: "Это старое.",
      },
      "Return no IPA while changing German"
    )

    expect(result).toEqual(
      expect.objectContaining({
        german: "Das ist neu.",
        ipa: "",
        russian: "Это новое.",
      })
    )
    expect(mockGenerateGermanIpa).toHaveBeenCalledWith("Das ist neu.", {
      fallbackIpa: "",
    })
  })
})
