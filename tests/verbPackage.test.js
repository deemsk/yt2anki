import { buildStrongVerbPackagePlan, validateVerbFormSentence } from "../src/cardContent/verbPackage.js"
import { buildVerbKeyFormProductionBack } from "../src/templates/verb/keyForm.js"

const morphology = {
  infinitive: "einsteigen",
  confidence: "high",
  particle: "ein",
  selectedForms: [
    { key: "du", pronoun: "du", label: "du", form: "steigst" },
    { key: "er", pronoun: "er", label: "er/sie/es", form: "steigt" },
  ],
}

describe("strong verb package planning", () => {
  test("validates separated particles in finite clauses", () => {
    expect(validateVerbFormSentence(
      { german: "Du steigst in den Bus ein." },
      morphology.selectedForms[0],
      morphology
    )).toBe(true)

    expect(validateVerbFormSentence(
      { german: "Du steigst in den Bus." },
      morphology.selectedForms[0],
      morphology
    )).toBe(false)
  })

  test("builds package only when every selected form has a valid sentence", () => {
    const plan = buildStrongVerbPackagePlan({
      morphology,
      sentences: [
        { formKey: "du", german: "Du steigst in den Bus ein.", russian: "Ты садишься в автобус." },
        { formKey: "er", german: "Er steigt schnell ein.", russian: "Он быстро садится." },
      ],
    })

    expect(plan.forms).toHaveLength(2)
    expect(plan.sentences.map((sentence) => sentence.focusForm)).toEqual(["steigst", "steigt"])
  })

  test("returns null when a required sentence is invalid", () => {
    const plan = buildStrongVerbPackagePlan({
      morphology,
      sentences: [
        { formKey: "du", german: "Du steigst in den Bus ein.", russian: "Ты садишься в автобус." },
        { formKey: "er", german: "Er fährt schnell.", russian: "Он быстро едет." },
      ],
    })

    expect(plan).toBeNull()
  })

  test("key-form cards emphasize the primary translation consistently", () => {
    const back = buildVerbKeyFormProductionBack(
      { label: "du", form: "steigst" },
      { russian: "садиться" }
    )

    expect(back).toContain('class="ddd-answer-translation"')
    expect(back).toContain("font-weight:700")
    expect(back).toContain("садиться")
  })
})
