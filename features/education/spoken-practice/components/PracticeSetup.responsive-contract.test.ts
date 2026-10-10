import { readFileSync } from "node:fs";
import { join } from "node:path";
import { touchFloorRing } from "@/tests/helpers/touchFloorCss";

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
    expect(touchFloorRing()).toEqual({ found: true, belowLgOnly: true });
  });
});
