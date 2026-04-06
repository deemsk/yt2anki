import { jest } from "@jest/globals"

const mockCreate = jest.fn(async ({ messages }) => {
  const systemPrompt = messages.find((message) => message.role === "system")?.content ?? ""

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

jest.unstable_mockModule("../src/cefr.js", () => ({
  estimateCEFR: jest.fn(async () => ({ level: "A1" })),
}))

const { reviewEnrichedText } = await import("../src/enricher.js")

describe("AI preview review helper", () => {
  beforeEach(() => {
    mockCreate.mockClear()
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
    const [{ messages }] = mockCreate.mock.calls.map(([call]) => call)
    const systemPrompt = messages.find((message) => message.role === "system")?.content ?? ""
    expect(systemPrompt).toContain('Card purpose: Sentence-form adjective card for "gut"')
    expect(systemPrompt).toContain("Keep these German words or forms in the final text if possible: gut")
  })
})
