import { sitePipelineDestination } from "./site-pipeline-navigation";

describe("sitePipelineDestination", () => {
  it.each([
    ["research", "setup"],
    ["plan", "tree"],
    ["seo_strategy", "setup"],
    ["content", "table"],
    ["design", "setup"],
    ["development", "table"],
    ["draft", "table"],
    ["live", "map"],
  ])("sends %s to its owning surface", (stage, view) => {
    expect(sitePipelineDestination(stage)).toBe(view);
  });

  it("fails soft to Setup for a new server stage", () => {
    expect(sitePipelineDestination("future_stage")).toBe("setup");
  });
});
