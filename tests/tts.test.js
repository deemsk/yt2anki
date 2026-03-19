import { jest } from "@jest/globals"

// ---------------------------------------------------------------------------
// Minimal stubs — must be set up before importing tts.js
// ---------------------------------------------------------------------------

const mockSynthesizeSpeech = jest.fn()
jest.unstable_mockModule("@google-cloud/text-to-speech", () => ({
  TextToSpeechClient: jest.fn().mockImplementation(() => ({
    synthesizeSpeech: mockSynthesizeSpeech,
  })),
}))

jest.unstable_mockModule("fs/promises", () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}))

jest.unstable_mockModule("child_process", () => ({
  execFile: jest.fn((cmd, args, cb) => cb(null, "", "")),
}))

jest.unstable_mockModule("../src/secrets.js", () => ({
  resolveSecret: jest.fn(async (v) => v),
}))

const { config } = await import("../src/config.js")

// Clear googleApiKey so getClient() falls through to the keyFile/default path,
// avoiding a JSON.parse on the op:// reference in real config.
config.googleApiKey = ""

describe("TTS SSML generation", () => {
  let generateSpeech, generateSimpleSpeech

  beforeAll(async () => {
    mockSynthesizeSpeech.mockResolvedValue([{ audioContent: Buffer.from("audio") }])
    ;({ generateSpeech, generateSimpleSpeech } = await import("../src/tts.js"))
  })

  beforeEach(() => {
    mockSynthesizeSpeech.mockClear()
  })

  // -------------------------------------------------------------------------
  // generateSpeech — slow + normal clips
  // -------------------------------------------------------------------------

  test("slow clip uses SSML prosody rate from config.ttsSpeed", async () => {
    config.ttsSpeed = 0.75
    config.ttsNormalRate = 0.9

    await generateSpeech("Woher kommst du?", "/tmp/test.mp3")

    const calls = mockSynthesizeSpeech.mock.calls
    const slowCall = calls[0][0]
    expect(slowCall.input.ssml).toMatch(/prosody rate="75%"/)
    expect(slowCall.input.ssml).toContain("Woher kommst du?")
  })

  test("slow clip has pitch -1 in audioConfig", async () => {
    config.ttsSpeed = 0.75

    await generateSpeech("Test", "/tmp/test.mp3")

    const slowCall = mockSynthesizeSpeech.mock.calls[0][0]
    expect(slowCall.audioConfig.pitch).toBe(-1.0)
  })

  test("normal clip has no prosody rate wrapper in SSML", async () => {
    await generateSpeech("Test", "/tmp/test.mp3")

    const normalCall = mockSynthesizeSpeech.mock.calls[1][0]
    expect(normalCall.input.ssml).not.toMatch(/prosody/)
    expect(normalCall.input.ssml).toContain("Test")
  })

  test("normal clip uses speakingRate from config.ttsNormalRate", async () => {
    config.ttsNormalRate = 0.9

    await generateSpeech("Test", "/tmp/test.mp3")

    const normalCall = mockSynthesizeSpeech.mock.calls[1][0]
    expect(normalCall.audioConfig.speakingRate).toBe(0.9)
    expect(normalCall.audioConfig.pitch).toBeUndefined()
  })

  test("both clips include headphone-class-device effectsProfileId", async () => {
    await generateSpeech("Test", "/tmp/test.mp3")

    for (const [req] of mockSynthesizeSpeech.mock.calls) {
      expect(req.audioConfig.effectsProfileId).toEqual(["headphone-class-device"])
    }
  })

  test("slow clip SSML rate reflects custom config.ttsSpeed", async () => {
    config.ttsSpeed = 0.65

    await generateSpeech("Test", "/tmp/test.mp3")

    const slowCall = mockSynthesizeSpeech.mock.calls[0][0]
    expect(slowCall.input.ssml).toMatch(/prosody rate="65%"/)
  })

  test("normal rate reflects custom config.ttsNormalRate", async () => {
    config.ttsNormalRate = 0.85

    await generateSpeech("Test", "/tmp/test.mp3")

    const normalCall = mockSynthesizeSpeech.mock.calls[1][0]
    expect(normalCall.audioConfig.speakingRate).toBe(0.85)
  })

  // -------------------------------------------------------------------------
  // IPA phoneme wrapping
  // -------------------------------------------------------------------------

  test("slow clip wraps IPA inside prosody when both are present", async () => {
    config.ttsSpeed = 0.75

    await generateSimpleSpeech("Wohnung", "/tmp/word.mp3", { speed: 0.75, ipa: "ˈvoːnʊŋ" })

    const req = mockSynthesizeSpeech.mock.calls[0][0]
    // prosody must be the outer wrapper, phoneme inside
    expect(req.input.ssml).toMatch(/<prosody rate="75%"><phoneme[^>]+>Wohnung<\/phoneme><\/prosody>/)
  })

  test("normal word clip uses speakingRate not SSML prosody", async () => {
    config.ttsNormalRate = 0.9

    await generateSimpleSpeech("Hund", "/tmp/word.mp3", {})

    const req = mockSynthesizeSpeech.mock.calls[0][0]
    expect(req.input.ssml).not.toMatch(/prosody/)
    expect(req.audioConfig.speakingRate).toBe(0.9)
  })
})
