import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "../AgentTextarea.tsx"), "utf8");
const stackedSource = readFileSync(
  join(__dirname, "../SmartAgentInputStacked.tsx"),
  "utf8",
);
const smartInputSource = readFileSync(
  join(__dirname, "../SmartAgentInput.tsx"),
  "utf8",
);
const connectorSource = readFileSync(
  join(__dirname, "../../../../../connectors/ConnectorStrip.tsx"),
  "utf8",
);
const windowPanelSource = readFileSync(
  join(__dirname, "../../../../../window-panels/WindowPanel.tsx"),
  "utf8",
);

describe("AgentTextarea auto-resize", () => {
  it("measures content from zero instead of reusing a flex-stretched auto height", () => {
    const resetIndex = source.indexOf('el.style.height = "0px";');
    const measureIndex = source.indexOf("el.scrollHeight", resetIndex);

    expect(resetIndex).toBeGreaterThan(-1);
    expect(measureIndex).toBeGreaterThan(resetIndex);
    expect(source).not.toContain('el.style.height = "auto";');
  });

  it("hard-caps the unexpanded textarea when a flex host reflows", () => {
    expect(source).toContain("maxHeight: isExpanded ? undefined : 200");
    expect(stackedSource).toContain('"w-full shrink-0 border"');
  });

  it("keeps the connector reminder dense without shrinking mobile hit areas", () => {
    expect(smartInputSource).toContain(
      '<ChatConnectorStrip className="mt-0.5 pl-5" />',
    );
    expect(connectorSource).toContain("flex h-4 w-full");
    expect(connectorSource).toContain("before:-inset-y-3");
  });

  it("paints the window body guard ring with the canonical background", () => {
    expect(windowPanelSource).toContain(
      "overflow-hidden bg-background p-1.5 pointer-events-none",
    );
    expect(windowPanelSource).toContain("data-window-panel-body-shell");
  });
});
