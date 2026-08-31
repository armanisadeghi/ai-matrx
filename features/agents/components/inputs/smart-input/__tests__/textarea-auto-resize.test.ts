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

  it("suspends the height transition around the zero-measure", () => {
    // `Npx → 0px` is animatable (unlike `auto`), so measuring scrollHeight with
    // `transition-[height]` live catches the transition at t=0 and reads back
    // the OLD height — a ratchet where the composer grows but never shrinks
    // (stuck-tall empty composer, 2026-08-31). The measurement must disable the
    // transition first and re-enable it only after restoring the rendered
    // height, so the final height write still animates.
    const suspendIndex = source.indexOf('el.style.transitionProperty = "none";');
    const resetIndex = source.indexOf('el.style.height = "0px";');
    const measureIndex = source.indexOf("el.scrollHeight", resetIndex);
    const restoreIndex = source.indexOf(
      'el.style.transitionProperty = "";',
      measureIndex,
    );

    expect(suspendIndex).toBeGreaterThan(-1);
    expect(suspendIndex).toBeLessThan(resetIndex);
    expect(restoreIndex).toBeGreaterThan(measureIndex);
    // The untransitioned restore must be committed (forced reflow) before the
    // transition comes back, or the browser coalesces the styles and the final
    // write starts from 0 instead of the rendered height.
    const reflowIndex = source.indexOf("void el.offsetHeight;", measureIndex);
    expect(reflowIndex).toBeGreaterThan(-1);
    expect(reflowIndex).toBeLessThan(restoreIndex);
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
