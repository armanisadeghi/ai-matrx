/**
 * verify-RC-B9 F7: the code block's "More actions" menu showed Show minimap,
 * Format code and Reset to original as greyed "UNAVAILABLE" rows outside edit
 * mode. A control that cannot work is ABSENT (`hidden`), never dead.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const src = readFileSync(path.resolve(__dirname, "../CodeBlockHeader.tsx"), "utf8");

it("never greys out an edit-mode-only item — it hides it", () => {
  expect(src).not.toMatch(/disabled:\s*!isEditing/);
  expect(src).not.toContain("Only available in edit mode");
  expect(src.match(/hidden:\s*!isEditing/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
});
