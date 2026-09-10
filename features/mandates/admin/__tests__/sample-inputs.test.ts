import { sampleInputsForMandate } from "../sample-inputs";
import { parseServedInput } from "@/features/workflow-runtime/served-form/served-input";
const field = parseServedInput({
  name: "report",
  label: "Report",
  kind: "markdown",
  origin: "provision",
  sourcing: "required",
  pinned: false,
});
if (!field) throw new Error("Invalid served-input fixture");
const fields = [field];
const source = {
  mapType: "offered_value",
  target: "report",
  sourceChannel: "variable",
};
test("translates agent variables through the configured provision map", () => {
  expect(
    sampleInputsForMandate(
      { mandate_id: null, variables: { agent_report: "# Report" } },
      "job",
      fields,
      { agent_report: source },
    ),
  ).toEqual({ values: { report: "# Report" }, skipped: [] });
});
test("does not guess provision mapping from equal names", () => {
  expect(
    sampleInputsForMandate(
      { mandate_id: null, variables: { report: "wrong contract" } },
      "job",
      fields,
      {},
    ),
  ).toEqual({ values: {}, skipped: ["report"] });
});
test("same-mandate cases already contain provision inputs", () => {
  expect(
    sampleInputsForMandate(
      { mandate_id: "job", variables: { report: "saved" } },
      "job",
      fields,
      {},
    ),
  ).toEqual({ values: { report: "saved" }, skipped: [] });
});
test("rejects another mandate's inputs", () => {
  expect(() =>
    sampleInputsForMandate(
      { mandate_id: "other", variables: { report: "saved" } },
      "job",
      fields,
      {},
    ),
  ).toThrow("different mandate");
});
test("rejects conflicting inverse mappings", () => {
  expect(() =>
    sampleInputsForMandate(
      { mandate_id: null, variables: { a: "first", b: "second" } },
      "job",
      fields,
      { a: source, b: source },
    ),
  ).toThrow("different values");
});
test("rejects non-invertible multiple sources", () => {
  expect(() =>
    sampleInputsForMandate(
      { mandate_id: null, variables: { a: "combined" } },
      "job",
      fields,
      { a: [source, { ...source, target: "other" }] },
    ),
  ).toThrow("cannot be reversed");
});
test("fills an explicitly prompted holder variable", () => {
  const prompt = parseServedInput({
    name: "answer",
    label: "Answer",
    kind: "text",
    origin: "binding_prompt",
    sourcing: "required",
    pinned: false,
  });
  if (!prompt) throw new Error("Invalid prompt fixture");
  expect(
    sampleInputsForMandate(
      { mandate_id: null, variables: { answer: "Yes" } },
      "job",
      [prompt],
      {
        answer: {
          mapType: "prompt_user",
          prompt: "Answer",
          sourceChannel: "variable",
        },
      },
    ),
  ).toEqual({ values: { answer: "Yes" }, skipped: [] });
});
