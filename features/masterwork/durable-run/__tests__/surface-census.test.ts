/**
 * EVERY DECLARED MASTERWORK RUN SURFACE IS ACTUALLY LAUNCHED WITH.
 *
 * THE CLASS BEHIND THE 2026-09-13 BUGBOT FINDING. `MasterworkRunSurface` is
 * what keys the browser-side durable-run pointer (`${surface}:${rulebookId}`),
 * so adding a surface is how a new lane stops sharing another lane's receipt.
 * `timeline` was added to the union AND given its own measured `EXPECTED_MS` —
 * and then no call site ever passed it, so every timeline distillation wrote
 * the ingest pointer and the separation existed only on paper.
 *
 * A surface nobody launches is therefore never cosmetic: it means some lane is
 * writing a pointer that belongs to a different lane. This reads the union and
 * the real call sites off disk, so it catches the next one the same way.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FEATURE_ROOT = join(__dirname, "..", "..");
const HOOK = join(FEATURE_ROOT, "durable-run", "useMasterworkRun.ts");

function declaredSurfaces(): string[] {
  const source = readFileSync(HOOK, "utf8");
  const union = source.match(
    /export type MasterworkRunSurface =([\s\S]*?);/,
  )?.[1];
  if (!union) throw new Error("MasterworkRunSurface union not found");
  return [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && full !== HOOK) {
      out.push(full);
    }
  }
  return out;
}

function launchedSurfaces(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles(FEATURE_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const line of source.split("\n")) {
      if (!/\bsurface:/.test(line)) continue;
      for (const match of line.matchAll(/"([a-z_]+)"/g)) found.add(match[1]);
    }
  }
  return found;
}

describe("MasterworkRunSurface", () => {
  it("declares no surface that nothing launches with", () => {
    const launched = launchedSurfaces();
    const orphans = declaredSurfaces().filter((s) => !launched.has(s));
    expect(orphans).toEqual([]);
  });
});
