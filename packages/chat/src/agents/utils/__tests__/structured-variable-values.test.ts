import {
  variableValueToDisplay,
  variableValueToInputText,
} from "../variable-utils";
import { buildVariableDisplayLines } from "../variable-display-lines";

const hypotheses = {
  __kind: "hypotheses",
  items: [{ claim: "Teams need reliable inputs", confidence: 0.8 }],
};

describe("structured test-case variable values", () => {
  it("loads objects and every array into text inputs without losing their JSON structure", () => {
    for (const value of [hypotheses, [hypotheses], ["one", "two"], [[1, 2]]]) {
      expect(JSON.parse(variableValueToInputText(value))).toEqual(value);
    }
    expect(variableValueToInputText(false)).toBe("false");
    expect(variableValueToInputText(0)).toBe("0");
    expect(variableValueToInputText(null)).toBe("");
  });
  it("shows the complete object rather than object coercion", () => {
    expect(JSON.parse(variableValueToDisplay(hypotheses))).toEqual(hypotheses);
    expect(
      JSON.parse(
        buildVariableDisplayLines({ icp_hypotheses: hypotheses })[0].text,
      ),
    ).toEqual(hypotheses);
  });
  it("preserves arrays of objects and their nested values", () => {
    const values = [hypotheses, { approved: false, decisions: [1, 2] }];
    expect(JSON.parse(variableValueToDisplay(values))).toEqual(values);
  });
  it("keeps ordinary text and simple display lists readable", () => {
    expect(variableValueToDisplay("verbatim")).toBe("verbatim");
    expect(variableValueToDisplay(["one", "two"])).toBe("one, two");
  });
});
