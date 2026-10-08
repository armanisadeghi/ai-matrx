/**
 * A LONG VALUE CAN BE EXPANDED (Arman, 2026-10-08: "a floating icon that
 * expands it so you can see the full text easier when there is a lot in
 * there"). `ProTextarea expandable` shows an Expand button in the reserved
 * control row (never over text) once the text no longer fits, and opens the
 * SAME field large in a dialog bound to the same value. Off by default.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "../ProTextarea.tsx"), "utf8");

it("is opt-in and shows only when the text overflows", () => {
  expect(src).toContain("expandable = false");
  expect(src).toMatch(/expandable && !editor && overflowing \?/);
  expect(src).toContain("el.scrollHeight > el.clientHeight");
});

it("opens the same value and onChange in a dialog", () => {
  const dialog = src.slice(src.indexOf("<Dialog open={expandOpen}"));
  expect(dialog).toContain("value={value}");
  expect(dialog).toContain("onChange={onChange}");
});
