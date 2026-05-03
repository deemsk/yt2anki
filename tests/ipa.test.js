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

  test("uses clean model fallback IPA before espeak-ng", async () => {
    const ipa = await generateGermanIpa("Ich gehe nach Hause.", {
      fallbackIpa: "[ɪç ˈɡeːə nax ˈhaʊzə]",
    })

    expect(ipa).toBe("[ɪç ˈɡeːə nax ˈhaʊzə]")
    expect(mockExecFile).not.toHaveBeenCalled()
  })

  test("uses espeak-ng IPA when no model fallback IPA is available", async () => {
    mockExecFile.mockImplementation((_cmd, _args, _options, callback) => {
      callback(null, "ɪç ˈɡeːə nax ˈhaʊzə\n", "")
    })

    const ipa = await generateGermanIpa("Ich gehe nach Hause.")

    expect(ipa).toBe("[ɪç ˈɡeːə nax ˈhaʊzə]")
    expect(mockExecFile).toHaveBeenCalledWith(
      "espeak-ng",
      ["-q", "--ipa", "-v", "de", "Ich gehe nach Hause."],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    )
  })

  test("prefers clean fallback IPA when espeak-ng emits non-standard German tap r", async () => {
    const ipa = await generateGermanIpa("Er sagt, dass er morgen kommt.", {
      fallbackIpa: "[ɛɐ̯ zaːkt das ɛɐ̯ ˈmɔʁɡn̩ kɔmt]",
    })

    expect(ipa).toBe("[ɛɐ̯ zaːkt das ɛɐ̯ ˈmɔʁɡn̩ kɔmt]")
    expect(mockExecFile).not.toHaveBeenCalled()
  })

  test("uses espeak-ng when model fallback IPA contains suspicious German symbols", async () => {
    mockExecFile.mockImplementation((_cmd, _args, _options, callback) => {
      callback(null, "ˈmɔʁɡn̩\n", "")
    })

    const ipa = await generateGermanIpa("morgen", {
      fallbackIpa: "[mˈɔɾɡən]",
    })

    expect(ipa).toBe("[ˈmɔʁɡn̩]")
  })

  test("normalizes non-standard espeak-ng German IPA symbols when no clean fallback exists", async () => {
    mockExecFile.mockImplementation((_cmd, _args, _options, callback) => {
      callback(null, "mˈɔɾɡən\n", "")
    })

    const ipa = await generateGermanIpa("morgen")

    expect(ipa).toBe("[mˈɔʁɡən]")
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
      generateGermanIpa("Ich gehe nach Hause.")
    ).rejects.toThrow("espeak failed")
  })
})
