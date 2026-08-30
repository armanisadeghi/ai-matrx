import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("PracticeSetup responsive contract", () => {
  it("enforces the shared 44px touch floor across the setup form", () => {
    const setup = readFileSync(join(__dirname, "PracticeSetup.tsx"), "utf8");
    const globals = readFileSync(
      join(__dirname, "../../../../app/globals.css"),
      "utf8",
    );

    expect(setup).toContain(
      'className="matrx-touch-targets mx-auto w-full max-w-md',
    );
    expect(globals).toContain("@media (pointer: coarse), (max-width: 1023px)");
    expect(globals).toContain("min-height: 2.75rem; /* 44px */");
    expect(globals).toContain("min-width: 2.75rem;");
  });
});
