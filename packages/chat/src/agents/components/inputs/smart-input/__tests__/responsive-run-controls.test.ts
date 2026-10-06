import { readFileSync } from "node:fs";
import { join } from "node:path";

const stacked = readFileSync(join(__dirname, "../SmartAgentInputStacked.tsx"), "utf8");
const buttons = readFileSync(join(__dirname, "../InputActionButtons.tsx"), "utf8");

describe("responsive chat run controls", () => {
  it("puts every style on the 44px touch floor on a TOUCH device only", () => {
    // Every style's root (Form, Launcher, Full/Compact) opts into the subtree
    // touch floor — but only when the device is touch-only. The shared class
    // also fires under a 1024px viewport, which stretched a narrowed desktop
    // window's buttons and pills to 44px (2026-10-06).
    expect(stacked).toContain("const touchOnly = useTouchOnlyDevice();");
    expect(stacked.match(/touchOnly && "matrx-touch-targets"/g) ?? []).toHaveLength(3);
    expect(stacked).not.toMatch(/["`]matrx-touch-targets /);
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
