import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("GovernedActionDialog responsive contract", () => {
  it("enforces the shared 44px touch floor for every dialog action", () => {
    const dialog = readFileSync(
      join(__dirname, "GovernedActionDialog.tsx"),
      "utf8",
    );
    const globals = readFileSync(
      join(__dirname, "../../../app/globals.css"),
      "utf8",
    );
    const sharedDialog = readFileSync(
      join(__dirname, "../../../components/ui/dialog.tsx"),
      "utf8",
    );

    expect(dialog).toContain(
      '<DialogContent className="matrx-touch-targets sm:max-w-xl">',
    );
    expect(globals).toContain("@media (pointer: coarse), (max-width: 1023px)");
    expect(globals).toContain("min-height: 2.75rem; /* 44px */");
    expect(globals).toContain("min-width: 2.75rem;");
    expect(sharedDialog).toContain('aria-label="Close"');
    expect(sharedDialog).toContain(
      "h-11 w-11 items-center justify-center rounded-sm",
    );
    expect(sharedDialog).toContain("lg:h-10 lg:w-10");
  });
});
