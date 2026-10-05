/**
 * The composer's Output types → the agent picker's filter
 * (composer/agent-output-filter.ts).
 */

import {
  agentOutputFilterSpec,
  modelMakesAny,
  modelOutputModalities,
} from "../composer/agent-output-filter";

describe("agentOutputFilterSpec", () => {
  it("asks for no filter on the default (Text only), on nothing, and on text-equivalent choices", () => {
    expect(agentOutputFilterSpec(["text"])).toBeNull();
    expect(agentOutputFilterSpec([])).toBeNull();
    expect(agentOutputFilterSpec(["document", "pdf"])).toBeNull();
    expect(agentOutputFilterSpec(["text", "code"])).toBeNull();
  });

  it("maps media types to model modalities and names them", () => {
    expect(agentOutputFilterSpec(["image"])).toEqual({ label: "Makes: Image", modalities: ["image"] });
    expect(agentOutputFilterSpec(["voice", "music", "spreadsheet"])).toEqual({
      label: "Makes: Voice, Music",
      modalities: ["audio"],
    });
    expect(agentOutputFilterSpec(["text", "video"])).toEqual({
      label: "Makes: Text, Video",
      modalities: ["text", "video"],
    });
  });
});

describe("modelMakesAny", () => {
  it("passes when ANY wanted modality is produced, and when outputs are unknown", () => {
    expect(modelMakesAny(["image"], ["image"])).toBe(true);
    expect(modelMakesAny(["text"], ["image"])).toBe(false);
    expect(modelMakesAny(["text", "image"], ["video", "image"])).toBe(true);
    expect(modelMakesAny(null, ["image"])).toBe(true);
    expect(modelMakesAny(["decision"], ["text", "image"])).toBe(true);
  });
});

describe("modelOutputModalities", () => {
  it("reads canonical capabilities and refuses anything else", () => {
    expect(modelOutputModalities({ input: ["text"], output: ["image"] })).toEqual(["image"]);
    expect(modelOutputModalities(null)).toBeNull();
    expect(modelOutputModalities({ output: [] })).toBeNull();
    expect(modelOutputModalities("text")).toBeNull();
  });
});
