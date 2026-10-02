import fs from "node:fs";
import path from "node:path";

describe("agent widget display-layer handoff", () => {
  it("waits for the launch dropdown body lock to close before opening a display layer", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "features/agents/components/widgets/AgentWidgetsPage.tsx",
      ),
      "utf8",
    );
    const handler = source.slice(
      source.indexOf("const openWithDisplayType"),
      source.indexOf("// Clear variable values"),
    );

    expect(handler).toContain("await afterCurrentLayerCloses()");
    expect(handler.indexOf("await afterCurrentLayerCloses()")).toBeLessThan(
      handler.indexOf("await launchAgent("),
    );
  });
});
