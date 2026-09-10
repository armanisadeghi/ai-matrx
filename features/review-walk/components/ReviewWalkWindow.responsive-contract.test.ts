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
    const globals = readFileSync(
      join(__dirname, "../../../app/globals.css"),
      "utf8",
    );

    expect(windowSource).toContain(
      'className="matrx-touch-targets flex h-full min-h-0',
    );
    expect(followUpSource).toContain(
      '"matrx-touch-targets flex flex-wrap items-center gap-1.5"',
    );
    expect(globals).toContain("@media (pointer: coarse), (max-width: 1023px)");
    expect(globals).toContain("min-height: 2.75rem; /* 44px */");
  });
});
