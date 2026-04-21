import { jest } from "@jest/globals"

const mockExecFile = jest.fn()

jest.unstable_mockModule("child_process", () => ({
  execFile: mockExecFile,
}))

const { generateGermanIpa, normalizeSentenceIpa } = await import("../src/ipa.js")

describe("German IPA generation", () => {
  beforeEach(() => {
    mockExecFile.mockReset()
  })

  test("normalizes IPA brackets and whitespace", () => {
    expect(normalizeSentenceIpa(" ɪç\n ˈɡeːə ")).toBe("[ɪç ˈɡeːə]")
    expect(normalizeSentenceIpa("[ɪç ˈɡeːə]")).toBe("[ɪç ˈɡeːə]")
    expect(normalizeSentenceIpa("")).toBe("")
  })

  test("uses espeak-ng IPA before model fallback IPA", async () => {
    mockExecFile.mockImplementation((_cmd, _args, _options, callback) => {
      callback(null, "ɪç ˈɡeːə nax ˈhaʊzə\n", "")
    })

    const ipa = await generateGermanIpa("Ich gehe nach Hause.", {
      fallbackIpa: "[wrong]",
    })

    expect(ipa).toBe("[ɪç ˈɡeːə nax ˈhaʊzə]")
    expect(mockExecFile).toHaveBeenCalledWith(
      "espeak-ng",
      ["-q", "--ipa", "-v", "de", "Ich gehe nach Hause."],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    )
  })

  test("falls back to model IPA when espeak-ng is missing", async () => {
    mockExecFile.mockImplementation((_cmd, _args, _options, callback) => {
      const err = new Error("spawn espeak-ng ENOENT")
      err.code = "ENOENT"
      callback(err, "", "")
    })

    await expect(
      generateGermanIpa("Ich gehe nach Hause.", { fallbackIpa: "ɪç ˈɡeːə nax ˈhaʊzə" })
    ).resolves.toBe("[ɪç ˈɡeːə nax ˈhaʊzə]")
  })

  test("throws non-missing-binary espeak-ng errors", async () => {
    mockExecFile.mockImplementation((_cmd, _args, _options, callback) => {
      callback(new Error("espeak failed"), "", "")
    })

    await expect(
      generateGermanIpa("Ich gehe nach Hause.", { fallbackIpa: "[fallback]" })
    ).rejects.toThrow("espeak failed")
  })
})

