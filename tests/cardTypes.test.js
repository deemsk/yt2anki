import { formatCardForAnki, generateProductionCard, normalizeRussianHint } from "../src/cardTypes.js"

describe("card type helpers", () => {
  test("normalizeRussianHint keeps Russian learner hints", () => {
    expect(normalizeRussianHint("в кафе")).toBe("в кафе")
  })

  test("normalizeRussianHint drops English learner hints", () => {
    expect(normalizeRussianHint("ordering coffee")).toBeNull()
  })

  test("production cards keep only Russian front hints", () => {
    const withEnglish = generateProductionCard(
      {
        german: "Ich möchte einen Kaffee.",
        ipa: "[ɪç ˈmœçtə ˈaɪ̯nən ˈkafeː]",
        russian: "Я хочу кофе.",
      },
      "ordering coffee",
      "test-1"
    )

    const withRussian = generateProductionCard(
      {
        german: "Ich möchte einen Kaffee.",
        ipa: "[ɪç ˈmœçtə ˈaɪ̯nən ˈkafeː]",
        russian: "Я хочу кофе.",
      },
      "в кафе",
      "test-2"
    )

    expect(withEnglish.front.situation).toBeNull()
    expect(formatCardForAnki(withEnglish, "clip.mp3").Front).toBe("Я хочу кофе.")
    expect(withRussian.front.situation).toBe("в кафе")
    expect(formatCardForAnki(withRussian, "clip.mp3").Front).toContain("<small>в кафе</small>")
  })
})
