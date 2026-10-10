/**
 * EVERY LIST THAT NAMES A RECORD TYPE HAS ITS `lists.org_filter/<token>` ROW.
 *
 * THE DEFECT THIS PINS (production, 2026-10-09). `EntityListPage` reads
 * `{ feature: "lists.org_filter", key: config.registryToken ?? "default" }`. The key is COMPUTED, so
 * `every-knob-read-addresses-a-real-row` cannot see it, and the row seeder
 * (`platform.seed_list_landing_tab_knob`) only runs for types that have a "Shown to" knob — a
 * private type such as `conversation` never got one. /work/conversations therefore raised
 * "[knob] lists.org_filter.conversation could not be resolved" on every mount.
 *
 * The census: every literal `registryToken: "<token>"` in the app resolves to a row in the committed
 * live-register snapshot (`pnpm tsx scripts/refresh-knob-snapshot.ts` refreshes it after a seed).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const SCAN_DIRS = ["app", "components", "features", "hooks", "lib"];
const SKIP_DIR = /(node_modules|\.next|__tests__)/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (SKIP_DIR.test(full)) continue;
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("every list that names a record type has its organization-filter knob row", () => {
  it("resolves lists.org_filter/<registryToken> for every list config", () => {
    const snapshot = JSON.parse(
      readFileSync(join(__dirname, "..", "knob-keys.snapshot.json"), "utf8"),
    ) as { knobs: [string, string][] };
    const seeded = new Set(
      snapshot.knobs.filter(([f]) => f === "lists.org_filter").map(([, k]) => k),
    );
    const missing: string[] = [];
    let found = 0;
    for (const dir of SCAN_DIRS) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const text = readFileSync(file, "utf8");
        for (const m of text.matchAll(/registryToken:\s*"([a-z0-9_]+)"/g)) {
          found += 1;
          if (!seeded.has(m[1])) {
            missing.push(`${m[1]} (${file.slice(ROOT.length + 1)})`);
          }
        }
      }
    }
    expect(found).toBeGreaterThan(10);
    expect(missing).toEqual([]);
  });
});
