import { jest } from "@jest/globals"

jest.unstable_mockModule("../src/confirm.js", () => ({
  askReviewFeedback: jest.fn(),
  playAudio: jest.fn(),
}))

const { formatVerbPreviewSummary, resolveVerbFocusForm } = await import("../src/verbConfirm.js")

describe("verb preview helpers", () => {
  const fakeChalk = {
    bold: {
      cyan: (value) => `<head>${value}</head>`,
    },
    dim: (value) => `<dim>${value}</dim>`,
  }

  test("formatVerbPreviewSummary matches the compact lexical summary style", () => {
    expect(
      formatVerbPreviewSummary(
        fakeChalk,
        { infinitive: "gehören" },
        "принадлежать",
        "A2"
      )
    ).toBe("<head>gehören</head> <dim>(verb, A2)</dim> <dim>—</dim> принадлежать")
  })

  test("resolveVerbFocusForm prefers chosen sentence focus form and falls back to encountered form", () => {
    expect(
      resolveVerbFocusForm(
        { infinitive: "gehören", displayForm: "gehört" },
        { focusForm: "gehörte" }
      )
    ).toBe("gehörte")

    expect(
      resolveVerbFocusForm({ infinitive: "gehören", displayForm: "gehört" })
    ).toBe("gehört")

    expect(
      resolveVerbFocusForm({ infinitive: "gehören", displayForm: "gehören" })
    ).toBe(null)
  })
})
