/**
 * BREAKER-2 B2-02 / B2-03 (DATA-V2-BASICS-2): a paste of 15 patient visits was refused whole. Now every
 * cell is read by its column, what cannot be read is named by row and column with the rest kept, and the
 * new choice words of the whole paste are one question.
 */
import { answerNewWords, planPaste } from "../paste-plan";

const columns = [
  { sourceHeader: "Patient", field: { field_name: "title", display_name: "Patient", data_type: "string" } },
  { sourceHeader: "Copay", field: { field_name: "copay", display_name: "Copay", data_type: "number", metadata: { format: { id: "currency" } } } },
  { sourceHeader: "Insurance Verified", field: { field_name: "insured", display_name: "Insurance Verified", data_type: "boolean" } },
  {
    sourceHeader: "Body Areas",
    field: {
      field_name: "body_areas",
      display_name: "Body Areas",
      data_type: "array",
      metadata: { format: { id: "multi_choice", options: { choices: [{ value: "Neck" }, { value: "Shoulder" }, { value: "Knee" }], allowOther: false } } },
    },
  },
];
const rows = [
  { index: 0, cells: { Patient: "Grace Kim", Copay: "$30", "Insurance Verified": "Yes", "Body Areas": "Neck, Shoulder" } },
  { index: 1, cells: { Patient: "Mateo Álvarez", Copay: "25", "Insurance Verified": "maybe", "Body Areas": "knee, Ankle" } },
  { index: 2, cells: { Patient: "Siobhán O'Neill", Copay: "thirty", "Insurance Verified": "no", "Body Areas": "Hip" } },
];

describe("a paste never fails whole", () => {
  const plan = planPaste(rows, columns);

  it("writes each cell as its column keeps it", () => {
    expect(plan.rows[0]!.data).toEqual({ title: "Grace Kim", copay: 30, insured: true, body_areas: ["Neck", "Shoulder"] });
  });

  it("names what cannot be read by row and column, and keeps the rest of the row", () => {
    expect(plan.unreadable.map((u) => `${u.row}:${u.column}`)).toEqual(["2:Insurance Verified", "3:Copay"]);
    expect(plan.rows[1]!.data).toEqual({ title: "Mateo Álvarez", copay: 25, body_areas: ["Knee", "Ankle"] });
    expect(plan.rows[2]!.data.insured).toBe(false);
  });

  it("asks one question for every new choice word of the paste", () => {
    expect(plan.newWords).toEqual([{ field_name: "body_areas", display_name: "Body Areas", words: ["Ankle", "Hip"], canKeep: false }]);
  });

  it("leaving the new words out keeps each cell's known choices", () => {
    const left = answerNewWords(plan, "leave");
    expect(left[1]!.data.body_areas).toEqual(["Knee"]);
    expect("body_areas" in left[2]!.data).toBe(false);
    expect(answerNewWords(plan, "add")[1]!.data.body_areas).toEqual(["Knee", "Ankle"]);
  });
});
