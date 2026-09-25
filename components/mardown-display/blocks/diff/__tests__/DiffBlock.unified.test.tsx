/**
 * A ```diff fence carrying a plain unified diff renders as a diff-colored code
 * block — the break this guards: every such fence showed "Diff needs a JSON
 * object with `old` and `new` strings" (seen on /markdown-studio, 2026-09-25).
 * A JSON {old,new} spec still takes the before/after canvas.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// CodeBlock is the code surface this block delegates to (it has its own
// tests); the probe records exactly what it was handed.
jest.mock("@/features/code-editor/components/code-block/CodeBlock", () => ({
  __esModule: true,
  default: ({ code, language }: { code: string; language: string }) => (
    <pre data-probe="code-block" data-language={language}>
      {code}
    </pre>
  ),
}));
jest.mock("next/dynamic", () => () => () => <div data-probe="diff-canvas" />);

import { DiffBlock, isUnifiedDiff } from "../DiffBlock";

const TARIFF_DIFF = `--- a/pricing/tariff.sql
+++ b/pricing/tariff.sql
@@ -1,3 +1,3 @@
 SELECT zone, rate
-FROM tariff_2025
+FROM tariff_2026
 WHERE active;`;

const PRICE_SPEC = JSON.stringify({
  title: "Pickup fee",
  old: "Curbside pickup: $35",
  new: "Curbside pickup: $40",
});

describe("isUnifiedDiff", () => {
  it.each([
    [TARIFF_DIFF, true],
    ["@@ -4,2 +4,2 @@\n-rate = 1.10\n+rate = 1.15", true],
    ["-FROM tariff_2025\n+FROM tariff_2026", true],
    [PRICE_SPEC, false],
    ["The route changed on Tuesday.", false],
    ["", false],
  ])("%#", (raw, expected) => {
    expect(isUnifiedDiff(raw)).toBe(expected);
  });
});

describe("DiffBlock routing", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders a unified diff as a diff-language code block, verbatim", async () => {
    await act(async () => root.render(<DiffBlock content={TARIFF_DIFF} />));
    const probe = container.querySelector('[data-probe="code-block"]');
    expect(probe?.getAttribute("data-language")).toBe("diff");
    expect(probe?.textContent).toBe(TARIFF_DIFF);
    expect(container.textContent).not.toContain("needs a JSON object");
  });

  it("keeps a JSON spec on the before/after canvas", async () => {
    await act(async () => root.render(<DiffBlock content={PRICE_SPEC} />));
    expect(container.querySelector('[data-probe="code-block"]')).toBeNull();
    expect(container.querySelector('[data-probe="diff-canvas"]')).not.toBeNull();
    expect(container.textContent).toContain("Pickup fee");
  });
});
