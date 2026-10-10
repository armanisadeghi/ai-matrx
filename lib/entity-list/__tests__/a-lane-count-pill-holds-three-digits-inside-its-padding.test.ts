/**
 * A LANE'S COUNT PILL HOLDS THREE DIGITS INSIDE ITS OWN PADDING (/data CLS: "My Orgs 778" grew 8px when
 * the count landed because min-w-[3ch] is border-box and the pill's px-1 ate it). Break: the min width
 * loses the padding term -> red. Also pins the /messages kind strip (People | Agents | All | Unread):
 * one non-shrinking, non-wrapping row, so counts arriving move no line.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..");

it("the lane count pill's min width is four characters PLUS its horizontal padding", () => {
  const src = readFileSync(join(root, "lib/entity-list/components/EntityScopeTabs.tsx"), "utf8");
  expect(src).toContain("min-w-[calc(4ch+0.5rem)]");
  expect(src).not.toMatch(/min-w-\[3ch\]/);
});

it("the messages kind strip never wraps or shrinks and its kind chips hold room for a count badge", () => {
  const css = readFileSync(join(root, "features/messaging/messages-native.css"), "utf8");
  const rule = css.match(/\.messages-native \.mx-msg__list-kinds \{[^}]*\}/)?.[0] ?? "";
  expect(rule).toContain("flex-wrap: nowrap");
  expect(rule).toContain("flex: 0 0 auto");
  expect(css).toMatch(/\.mx-msg__chip:nth-child\(-n \+ 2\) \{\s*min-width: 77px/);
});

import { compactCount } from "../components/EntityScopeTabs";
it("no lane count is wider than the four-character slot", () => {
  expect([0, 7, 1833, 9999, 10000, 12345, 999999, 1200000].map(compactCount)).toEqual(["0", "7", "1833", "9999", "10k", "12k", "999k", "1m"]);
});
