/**
 * `pnpm perf:bundle` compares each bundle part with its own door. A part the bundle computes itself
 * (server_rows, a knob read) has no door; the script must skip it by name instead of calling a function
 * that does not exist and exiting red on every run.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

it("the equivalence script knows which bundle parts have no door", () => {
  const r = spawnSync("node", [path.join(__dirname, "bundle-equivalence.mjs"), "--self-test"], { encoding: "utf8" });
  expect(r.stdout).toContain("self-test ok");
  expect(r.status).toBe(0);
});
