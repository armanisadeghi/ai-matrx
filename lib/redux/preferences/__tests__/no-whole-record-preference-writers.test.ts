/**
 * GUARD — nothing in the browser writes `users.user_preferences.preferences`
 * as a whole record. The one sanctioned writer is the sync policy's
 * compare-and-swap key merge (userPreferencesSlice → preferencePatch). A new
 * `.update({ preferences … })` / `.upsert(…)` on that table anywhere else is
 * the 2026-09-27 stale-tab overwrite class coming back.
 */
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["app", "lib", "features", "components", "providers", "hooks", "utils"];
/**
 * Known and NOT sanctioned — each needs its owner's ruling, never a silent pass.
 *  - providers/usePreferenceSync.ts: an unmounted whole-record upsert (no
 *    importer on 2026-09-27). Deleting it is Arman's call (unfinished-work alarm).
 */
const KNOWN_UNMOUNTED = new Set(["providers/usePreferenceSync.ts"]);

function* files(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.|__tests__/.test(full)) yield full;
  }
}

/**
 * Every `.from("user_preferences")` chain that writes the `preferences` column
 * WITHOUT the compare-and-swap (`.eq("version", …)`) — i.e. a blind replace.
 */
export function wholeRecordWriters(source: string): number {
  let hits = 0;
  const re = /from\(\s*["']user_preferences["']\s*\)/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const chain = source.slice(m.index, m.index + 400);
    if (/\.(update|upsert)\(\s*\{[^}]*\bpreferences\b/.test(chain) && !/\.eq\(\s*["']version["']/.test(chain)) {
      hits += 1;
    }
  }
  return hits;
}

it("detects the old whole-record write (self-test)", () => {
  expect(wholeRecordWriters(`db.from("user_preferences").update({ preferences: body }).eq("user_id", id)`)).toBe(1);
  expect(wholeRecordWriters(`db.from('user_preferences').upsert({ organization_id, user_id, preferences })`)).toBe(1);
  expect(wholeRecordWriters(`db.from("user_preferences").update({ auto_rag_enabled: next })`)).toBe(0);
  // The sanctioned CAS merge is not a blind replace.
  expect(
    wholeRecordWriters(`table().from("user_preferences").update({ preferences: value, version: nextVersion }).eq("user_id", id).eq("version", expectedVersion)`),
  ).toBe(0);
});

it("no browser code writes the whole preferences record outside the CAS merge", () => {
  const cwd = process.cwd();
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of files(path.join(cwd, root))) {
      const rel = path.relative(cwd, file);
      if (KNOWN_UNMOUNTED.has(rel)) continue;
      if (wholeRecordWriters(fs.readFileSync(file, "utf8")) > 0) offenders.push(rel);
    }
  }
  expect(offenders).toEqual([]);
});

it("the known unmounted writer is still unmounted", () => {
  const cwd = process.cwd();
  const importers: string[] = [];
  for (const root of ROOTS) {
    for (const file of files(path.join(cwd, root))) {
      const rel = path.relative(cwd, file);
      if (rel === "providers/usePreferenceSync.ts") continue;
      const src = fs.readFileSync(file, "utf8");
      if (/^\s*import\s[^;]*?\b(usePreferenceSync|PreferenceSyncProvider)\b[^;]*?from\s|<PreferenceSyncProvider\b|\busePreferenceSync\(\)/m.test(src)) importers.push(rel);
    }
  }
  expect(importers).toEqual([]);
});
