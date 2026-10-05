/**
 * GRIDS REVIEW 3: "+ Row" then fast typing lost five of six values. The row is now made in the grid,
 * and the keys typed while the store makes it are held: the letters before the first Tab open the
 * first cell, the rest reach the grid in order (`useInlineNewRow`).
 */
import { splitHeldKeys } from "../hooks/useInlineNewRow";

const keys = (s: string) => s.split("").map((c) => ({ key: c === "\t" ? "Tab" : c === "\n" ? "Enter" : c, shiftKey: false }));

it("opens the first cell with the letters before the first Tab and keeps the rest in order", () => {
  const { seed, rest } = splitHeldKeys(keys("Treadmill\t10601\tGood\n"));
  expect(seed).toBe("Treadmill");
  expect(rest.map((k) => k.key).join("|")).toBe("Tab|1|0|6|0|1|Tab|G|o|o|d|Enter");
});

it("a Backspace before the first Tab corrects the seed", () => {
  expect(splitHeldKeys([...keys("Treadmilx"), { key: "Backspace", shiftKey: false }, ...keys("l")]).seed).toBe("Treadmill");
});
