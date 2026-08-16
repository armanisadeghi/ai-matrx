/** Generated run-start form derivation (Phase 4) — sections from
 * io.user_input nodes, tolerant parsing, default seeding, required gating. */

import {
  deriveRunForm,
  missingRequiredFields,
  seedRunFormValues,
} from "../run-form";
import type { WorkflowDefinitionLike } from "../../trigger-points";

const def: WorkflowDefinitionLike = {
  nodes: [
    {
      id: "seed",
      data: {
        spec_type: "io.user_input",
        label: "Seed",
        config: {
          title: "Start here",
          fields: [
            { key: "topic", type: "text", label: "Topic", required: true },
            { key: "count", type: "number", label: "How many", default: 3 },
            { key: "fast", type: "yes_no", label: "Fast mode" },
            { key: "tone", type: "choice", label: "Tone", options: ["warm", "formal"] },
            { key: 42, type: "text" }, // malformed — dropped
          ],
        },
      },
    },
    { id: "worker", data: { spec_type: "ai.agent" } },
    // user_input with no valid fields — no section.
    { id: "empty", data: { spec_type: "io.user_input", config: { fields: [] } } },
  ],
  edges: [{ id: "e1", source: "seed", target: "worker" }],
};

describe("deriveRunForm", () => {
  it("derives one section per io.user_input node with valid fields", () => {
    const sections = deriveRunForm(def);
    expect(sections).toHaveLength(1);
    expect(sections[0].nodeId).toBe("seed");
    expect(sections[0].title).toBe("Start here");
    expect(sections[0].fields.map((f) => f.key)).toEqual([
      "topic",
      "count",
      "fast",
      "tone",
    ]);
  });

  it("returns [] for a definition with no user-input nodes", () => {
    expect(deriveRunForm({ nodes: [{ id: "a" }], edges: [] })).toEqual([]);
  });
});

describe("seed + required gating", () => {
  it("seeds defaults (yes_no seeds false) and gates required fields", () => {
    const sections = deriveRunForm(def);
    const values = seedRunFormValues(sections);
    expect(values.seed.count).toBe(3);
    expect(values.seed.fast).toBe(false);
    expect(missingRequiredFields(sections, values)).toEqual(["Topic"]);
    values.seed.topic = "Bees";
    expect(missingRequiredFields(sections, values)).toEqual([]);
  });
});
