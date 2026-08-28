/**
 * A trigger's stored answers, against the SERVED input surface.
 *
 * The subject changed with the surface: these helpers used to walk
 * `deriveRunForm`'s per-node sections and flatten them. The compiled surface is
 * already flat and name-unique, so what is left to pin is the part that is not
 * obvious — what a schedule may store, and which inputs a schedule is about to
 * fire WITHOUT.
 */

import { parseServedInput, type ServedInput } from "../../served-form/served-input";
import {
  collidingInputNames,
  expandDefaultInputs,
  missingTriggerInputs,
  triggerDefaultInputs,
} from "../default-inputs";

function input(raw: Record<string, unknown>): ServedInput {
  const parsed = parseServedInput({ kind: "text", ...raw });
  if (!parsed) throw new Error("fixture is not a served input");
  return parsed;
}

const INPUTS: ServedInput[] = [
  input({ name: "topic", label: "Topic", sourcing: "require" }),
  input({ name: "depth", label: "Depth", sourcing: "optional", default: 3 }),
  input({ name: "deep", label: "Go deep", sourcing: "optional", default: false }),
  input({ name: "tone", label: "Tone", sourcing: "ask" }),
  input({
    name: "brand",
    label: "Brand",
    sourcing: "require",
    pinned: true,
    pinned_value: "Matrx",
  }),
];

describe("triggerDefaultInputs", () => {
  it("stores what the author filled in, by name", () => {
    expect(
      triggerDefaultInputs(INPUTS, { topic: "Rome", depth: 5, tone: "warm" }),
    ).toEqual({ topic: "Rome", depth: 5, tone: "warm" });
  });

  it("omits blanks so the server's declared default still wins", () => {
    expect(
      triggerDefaultInputs(INPUTS, { topic: "", depth: undefined }),
    ).toEqual({});
  });

  it("keeps false — a no answer is an answer", () => {
    expect(triggerDefaultInputs(INPUTS, { deep: false })).toEqual({
      deep: false,
    });
  });

  it("never stores a pinned value — pinning is resolved server-side each run", () => {
    expect(
      triggerDefaultInputs(INPUTS, { brand: "Matrx", topic: "Rome" }),
    ).toEqual({ topic: "Rome" });
  });
});

describe("expandDefaultInputs", () => {
  it("round-trips a stored payload back into the editor", () => {
    const stored = { topic: "Rome", depth: 5 };
    const draft = expandDefaultInputs(INPUTS, stored);
    expect(draft.topic).toBe("Rome");
    expect(draft.depth).toBe(5);
    expect(triggerDefaultInputs(INPUTS, draft)).toMatchObject(stored);
  });

  it("seeds an unstored input from its declared default", () => {
    expect(expandDefaultInputs(INPUTS, {}).depth).toBe(3);
    expect(expandDefaultInputs(INPUTS, {}).deep).toBe(false);
  });
});

describe("missingTriggerInputs", () => {
  it("names a required input nobody will be present to answer", () => {
    expect(missingTriggerInputs(INPUTS, {})).toContain("Topic");
    expect(missingTriggerInputs(INPUTS, { topic: "Rome" })).not.toContain(
      "Topic",
    );
  });

  it("names an `ask` input, which has no default to fall back on", () => {
    // "A person answers this EVERY run" and nobody is there: the one person
    // who IS here has to answer it now, ahead of time.
    expect(missingTriggerInputs(INPUTS, { topic: "Rome" })).toContain("Tone");
    expect(
      missingTriggerInputs(INPUTS, { topic: "Rome", tone: "warm" }),
    ).toEqual([]);
  });

  it("never names an optional input, or one a mandate pins", () => {
    const missing = missingTriggerInputs(INPUTS, {});
    expect(missing).not.toContain("Depth");
    expect(missing).not.toContain("Brand");
  });
});

describe("collidingInputNames", () => {
  it("is empty for a surface that honours its name-unique contract", () => {
    expect(collidingInputNames(INPUTS)).toEqual([]);
  });

  it("names a duplicate, because a broken surface must not fail silently", () => {
    expect(
      collidingInputNames([
        ...INPUTS,
        input({ name: "topic", label: "Topic again" }),
      ]),
    ).toEqual(["topic"]);
  });
});
