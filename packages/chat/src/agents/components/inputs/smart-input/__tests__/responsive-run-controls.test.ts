import { readFileSync } from "node:fs";
import { join } from "node:path";

const stacked = readFileSync(join(__dirname, "../SmartAgentInputStacked.tsx"), "utf8");
const buttons = readFileSync(join(__dirname, "../InputActionButtons.tsx"), "utf8");

describe("responsive chat run controls", () => {
  it("keeps every style — Form included — on the 44px touch-target floor", () => {
    // Each style's root opts into the subtree touch floor (globals.css `.matrx-touch-targets`).
    const form = stacked.slice(stacked.indexOf('data-composer-style="form"') - 600, stacked.indexOf('data-composer-style="form"'));
    expect(form).toContain("matrx-touch-targets");
    const roots = stacked.match(/"matrx-touch-targets mx-auto flex w-full/g) ?? [];
    expect(roots.length).toBeGreaterThanOrEqual(2); // Form + Full/Compact (Launcher separately)
    expect(stacked).toContain('className="matrx-touch-targets mx-auto flex w-full min-w-0 max-w-[420px]');
  });

  it("draws Stop and Send as the composer's own control (the one Button), not a hand-sized box", () => {
    // 2026-10: the composer row moved onto the one design-system Button (commit 381e69b1c0), which owns
    // the size; a hand-rolled h-8 w-8 box here would be the drift this test now guards against.
    expect(buttons).toContain('aria-label="Stop the run"');
    const send = buttons.slice(buttons.indexOf("function ComposerSendButton"));
    expect(send).toContain('<Button variant="quiet" icon={<CornerDownLeft />}');
    expect(send).not.toContain("h-8 w-8");
  });
});
