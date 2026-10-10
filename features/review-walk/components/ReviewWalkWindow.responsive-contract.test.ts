import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Review walk responsive contract", () => {
  it("applies the shared 44px touch floor to both review entry points", () => {
    const windowSource = readFileSync(
      join(__dirname, "ReviewWalkWindow.tsx"),
      "utf8",
    );
    const followUpSource = readFileSync(
      join(__dirname, "NegativeVerdictFollowUp.tsx"),
      "utf8",
    );
    // The floor lives in the design-system package (below lg, inside `.matrx-touch-targets`).
    const controlsCss = readFileSync(
      join(__dirname, "../../../node_modules/@ai-matrx/design-system/dist/controls.css"),
      "utf8",
    );

    expect(windowSource).toContain(
      'className="matrx-touch-targets flex h-full min-h-0',
    );
    expect(followUpSource).toContain(
      '"matrx-touch-targets flex flex-wrap items-center gap-1.5"',
    );
    const ring = controlsCss.indexOf(".matrx-touch-targets .matrx-control:not([data-touch-exempt])::after");
    expect(ring).toBeGreaterThan(-1);
    expect(controlsCss.slice(controlsCss.lastIndexOf("@media", ring), ring)).toContain("(max-width: 1023px)");
  });
});
