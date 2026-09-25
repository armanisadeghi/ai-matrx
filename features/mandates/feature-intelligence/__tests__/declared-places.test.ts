/**
 * EVERY DECLARED PLACES MAP IS PROVED AGAINST THE CODE THAT RUNS THE JOBS.
 *
 * The intelligence page tells people "this job runs here, behind this button".
 * For each feature in the registry (flashcards and research carry their own
 * stricter guards), this reads the real files and fails when:
 *   - a place lists a job none of its source files runs,
 *   - a place names a source file that runs none of its jobs (or is gone),
 *   - a component inside the feature's roots runs one of its jobs but no place
 *     names that file for that job (the map has drifted behind the code),
 *   - a place lists a key that is not a real mandate key.
 *
 * A file "runs" a job when it names the key: `MANDATE_KEYS.<id>`, the literal
 * key string, or `<ALIAS>.<name>` through a key map the feature declares.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { DECLARED_FEATURES, featurePrefixes } from "../registry";
import type { FeaturePlaces } from "../types";

const ROOT = process.cwd();
const OWN_GUARD = new Set(["flashcards", "research"]);
const ALL_KEYS = new Set<string>(Object.values(MANDATE_KEYS) as string[]);
const BY_ID = MANDATE_KEYS as unknown as Record<string, string>;

/** Every mandate key a source names, restricted to the feature's prefixes. */
function keysNamedIn(source: string, feature: FeaturePlaces): Set<string> {
  const prefixes = featurePrefixes(feature.feature);
  const inFeature = (key: string) => prefixes.some((prefix) => key.startsWith(`${prefix}.`));
  const out = new Set<string>();
  for (const match of source.matchAll(/MANDATE_KEYS\.([A-Za-z0-9_]+)/g)) {
    const key = BY_ID[match[1]];
    if (key && inFeature(key)) out.add(key);
  }
  for (const match of source.matchAll(/["'`]([a-z][a-z0-9_]*\.[a-z0-9_.]+)["'`]/g)) {
    if (ALL_KEYS.has(match[1]) && inFeature(match[1])) out.add(match[1]);
  }
  for (const [alias, map] of Object.entries(feature.aliases ?? {})) {
    if (typeof map === "string") {
      if (new RegExp(`\\b${alias}\\b`).test(source) && inFeature(map)) out.add(map);
      continue;
    }
    const pattern = new RegExp(`\\b${alias}\\.([A-Za-z0-9_]+)`, "g");
    for (const match of source.matchAll(pattern)) {
      const key = map[match[1]];
      if (key && inFeature(key)) out.add(key);
    }
  }
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(full, out);
    } else if (name.endsWith(".tsx") && !name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
const features = DECLARED_FEATURES.filter((entry) => !OWN_GUARD.has(entry.feature));

describe("declared intelligence places", () => {
  it("covers features beyond flashcards and research", () => {
    expect(features.length).toBeGreaterThan(0);
  });

  it("the key reader is not blind", () => {
    const sample = features[0];
    const place = sample.places[0];
    const key = place.mandateKeys[0];
    const id = Object.entries(BY_ID).find(([, value]) => value === key)?.[0];
    expect(keysNamedIn(`run(MANDATE_KEYS.${id})`, sample)).toEqual(new Set([key]));
    expect(keysNamedIn(`run("${key}")`, sample)).toEqual(new Set([key]));
    expect(keysNamedIn('run("not.a_real_key")', sample).size).toBe(0);
  });

  describe.each(features.map((entry) => [entry.feature, entry] as const))("%s", (_name, feature) => {
    it.each(feature.places.map((place) => [place.id, place] as const))(
      "place %s: every job runs in its sources, every source runs a job",
      (_id, place) => {
        const named = new Set<string>();
        for (const source of place.sources) {
          expect({ source, exists: existsSync(join(ROOT, source)) }).toEqual({ source, exists: true });
          const keys = keysNamedIn(read(source), feature);
          const runsOne = place.mandateKeys.some((key) => keys.has(key));
          expect({ source, runsOneOfItsJobs: runsOne }).toEqual({ source, runsOneOfItsJobs: true });
          keys.forEach((key) => named.add(key));
        }
        for (const key of place.mandateKeys) {
          expect({ key, real: ALL_KEYS.has(key) }).toEqual({ key, real: true });
          expect({ key, runsHere: named.has(key) }).toEqual({ key, runsHere: true });
        }
      },
    );

    const components = (feature.roots ?? []).flatMap((root) =>
      walk(join(ROOT, root)).map((file) => relative(ROOT, file)),
    );
    const running = components
      .map((file) => ({ file, keys: keysNamedIn(read(file), feature) }))
      .filter((entry) => entry.keys.size > 0);

    if (running.length > 0) {
      it.each(running.map((entry) => [entry.file, entry] as const))(
        "component %s is named by a place for every job it runs",
        (_file, entry) => {
          const listed = new Set(
            feature.places
              .filter((place) => place.sources.includes(entry.file))
              .flatMap((place) => place.mandateKeys),
          );
          for (const key of entry.keys) {
            expect({ file: entry.file, key, mapped: listed.has(key) }).toEqual({
              file: entry.file,
              key,
              mapped: true,
            });
          }
        },
      );
    }
  });
});
