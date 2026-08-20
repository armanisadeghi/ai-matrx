import { deriveRunForm } from "../../surface/run-form";
import type { WorkflowDefinitionLike } from "../../trigger-points";
import {
  collidingInputKeys,
  expandDefaultInputs,
  flattenRunFormValues,
  missingTriggerInputs,
} from "../default-inputs";

const DEF: WorkflowDefinitionLike = {
  nodes: [
    {
      id: "ask",
      data: {
        spec_type: "io.user_input",
        label: "Ask",
        config: {
          title: "About it",
          fields: [
            { key: "topic", label: "Topic", type: "text", required: true },
            { key: "depth", label: "Depth", type: "number", default: 3 },
            { key: "deep", label: "Go deep", type: "yes_no" },
          ],
        },
      },
    },
    {
      id: "ask2",
      data: {
        spec_type: "io.user_input",
        label: "Also",
        config: {
          fields: [{ key: "topic", label: "Topic again", type: "text" }],
        },
      },
    },
  ],
  edges: [],
};

const SECTIONS = deriveRunForm(DEF);

describe("flattenRunFormValues", () => {
  it("flattens per-node values onto the broadcast payload the engine merges", () => {
    expect(
      flattenRunFormValues(SECTIONS, {
        ask: { topic: "Rome", depth: 5, deep: true },
      }),
    ).toEqual({ topic: "Rome", depth: 5, deep: true });
  });

  it("omits blanks so an authored default still wins", () => {
    expect(
      flattenRunFormValues(SECTIONS, { ask: { topic: "", depth: undefined } }),
    ).toEqual({});
  });

  it("keeps false — a no answer is an answer", () => {
    expect(flattenRunFormValues(SECTIONS, { ask: { deep: false } })).toEqual({
      deep: false,
    });
  });
});

describe("expandDefaultInputs", () => {
  it("round-trips a stored payload back into the editor", () => {
    const flat = { topic: "Rome", depth: 5 };
    const expanded = expandDefaultInputs(SECTIONS, flat);
    expect(expanded.ask.topic).toBe("Rome");
    expect(expanded.ask.depth).toBe(5);
    expect(flattenRunFormValues(SECTIONS, expanded)).toMatchObject(flat);
  });

  it("seeds an untouched field from its authored default", () => {
    expect(expandDefaultInputs(SECTIONS, {}).ask.depth).toBe(3);
    expect(expandDefaultInputs(SECTIONS, {}).ask.deep).toBe(false);
  });
});

describe("missingTriggerInputs", () => {
  it("names a required field nobody will be present to answer", () => {
    expect(missingTriggerInputs(SECTIONS, {})).toContain("Topic");
    expect(missingTriggerInputs(SECTIONS, { topic: "Rome" })).not.toContain(
      "Topic",
    );
  });
});

describe("collidingInputKeys", () => {
  it("names a key two sections both claim", () => {
    expect(collidingInputKeys(SECTIONS)).toEqual(["topic"]);
  });

  it("is empty for a single-section workflow", () => {
    expect(collidingInputKeys([SECTIONS[0]])).toEqual([]);
  });
});
