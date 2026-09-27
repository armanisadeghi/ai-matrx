// A learner reads a topic's name, never its import key.
import { topicLabel } from "../utils/topicLabel";

describe("topicLabel", () => {
  it("shows the leaf of an Anki deck path", () => {
    expect(topicLabel("Biology::Cell Structure")).toBe("Cell Structure");
  });
  it("humanizes a slug", () => {
    expect(topicLabel("data-resilience")).toBe("Data resilience");
    expect(topicLabel("telemetry_monitoring")).toBe("Telemetry monitoring");
    expect(topicLabel("diagnostics")).toBe("Diagnostics");
  });
  it("leaves a real name alone", () => {
    expect(topicLabel("Krebs Cycle")).toBe("Krebs Cycle");
    expect(topicLabel("Nucleus & DNA")).toBe("Nucleus & DNA");
  });
});
