/**
 * ONE FIELD SURFACE (page-pass 2026-09-27). ProInput and ProTextarea were
 * `bg-transparent` over `border-input`, so on a grey page they read grey beside
 * the white Selects of the same form (/hr/settings/employer, the message-template
 * editor) and looked disabled. They wear the design system's field surface —
 * `FIELD_SURFACE_CLASS` in @ai-matrx/design-system (`border border-border bg-card`),
 * the one Input, BasicInput, Textarea and the Select trigger share.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const FIELD_SURFACE = "border border-border bg-card";

describe("the Pro fields wear the one field surface", () => {
  for (const file of ["ProInput.tsx", "ProTextarea.tsx"]) {
    it(`${file} fills its field with the card and draws the regular border`, () => {
      const source = readFileSync(path.join(__dirname, "..", file), "utf8");
      const fieldLine = source
        .split("\n")
        .find((line) => /"flex (h-9 )?w-full .*px-3 py-[12]/.test(line));
      expect(fieldLine).toBeDefined();
      expect(fieldLine).toContain(FIELD_SURFACE);
      expect(fieldLine).not.toContain("bg-transparent");
      expect(fieldLine).not.toContain("border-input");
    });
  }
});
