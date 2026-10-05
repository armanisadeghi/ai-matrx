/**
 * A text cell edits through ProTextarea — the platform's one text field — so a
 * table cell has the same "…" menu (the one registry tree: Clean up, Help with
 * this, copy/save/share) as every other field (RC-B6 round 2: "cell editing
 * has no ProTextarea menu"). A bare Textarea in the cell editor fails this.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(path.join(__dirname, "../components/EditableCell.tsx"), "utf8");

it("the cell's text editors are ProTextarea", () => {
  expect(src).toMatch(/<ProTextarea\b/);
  expect(src).not.toMatch(/<Textarea\b/);
  expect(src).not.toMatch(/from "@\/components\/ui\/textarea"/);
});

it("blurring into the field's own menu keeps the edit open", () => {
  expect(src).toMatch(/data-radix-popper-content-wrapper/);
});
