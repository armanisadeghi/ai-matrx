import { readFileSync } from "node:fs";
import { join } from "node:path";

const stacked = readFileSync(join(__dirname, "../SmartAgentInputStacked.tsx"), "utf8");
const buttons = readFileSync(join(__dirname, "../InputActionButtons.tsx"), "utf8");

describe("responsive chat run controls", () => {
  it("keeps the variables-only Run mode on the 44px touch-target floor", () => {
    // The Run mode's shell is the one composer surface that opts into the
    // subtree touch floor (globals.css `.matrx-touch-targets`).
    const shell = stacked.slice(stacked.indexOf("const shellClassName"));
    expect(shell.slice(0, shell.indexOf(");"))).toContain('"matrx-touch-targets"');
  });

  it("draws Stop and Send as the composer's own 32px controls", () => {
    expect(buttons).toContain('aria-label="Stop the run"');
    const send = buttons.slice(buttons.indexOf("function ComposerSendButton"));
    expect(send).toContain("h-8 w-8");
  });
});
