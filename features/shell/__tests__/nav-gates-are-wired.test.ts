/**
 * GATED DESTINATIONS REACH THE MENUS. A nav child with `gate:` (Make, Records,
 * Kits) shows only where its switch is on — which needs every menu that lists
 * children to pass the resolved gates to `partitionNavChildren`. A bulk commit
 * once dropped that wiring and the three entries vanished for everyone, on
 * desktop and phone, with no error. PROVEN FAILING BEFORE PASSING: remove the
 * `gates` argument from either call → this test RED.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) => readFileSync(path.join(__dirname, "..", file), "utf8");

describe("nav gates are wired into every menu", () => {
  it.each([
    "components/sidebar/NavFlyoutGroup.tsx",
    "components/mobile-sheet/MobileNavigationDrawer.tsx",
  ])("%s resolves the gates and passes them to partitionNavChildren", (file) => {
    const src = read(file);
    expect(src).toMatch(/useShellNavGates\(\)/);
    const calls = src.match(/partitionNavChildren\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toMatch(/,\s*gates\s*,?\s*\)$/);
  });
});
