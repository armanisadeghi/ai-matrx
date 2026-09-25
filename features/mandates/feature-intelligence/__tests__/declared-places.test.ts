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
 *
 * WORKFLOW STUDIO PLACES (`app: "workflow-studio"`) live in the aidream repo
 * (`apps/workflow-studio`), read from the sibling checkout (`AIDREAM_DIR`, else
 * `../aidream`) and announced as UNMEASURED when it is absent. A studio source
 * either names its job, or makes the call the place declares (`calls`) — and
 * then a server file routes that call and a server file names the job. Every
 * studio file whose code names a job must be named by a place for that job.
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

function walk(dir: string, out: string[] = [], exts: readonly string[] = [".tsx"]): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(full, out, exts);
    } else if (exts.some((ext) => name.endsWith(ext)) && !name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
const features = DECLARED_FEATURES.filter((entry) => !OWN_GUARD.has(entry.feature)).map(
  (entry) => ({ ...entry, places: entry.places.filter((place) => !place.app) }),
);

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

// ── Workflow Studio places ──────────────────────────────────────────────────

const AIDREAM_ROOT = process.env.AIDREAM_DIR ?? join(process.cwd(), "..", "aidream");
const STUDIO_ROOT = join(AIDREAM_ROOT, "apps", "workflow-studio");
const hasStudio = existsSync(join(STUDIO_ROOT, "src"));
const studioFeatures = DECLARED_FEATURES.map((entry) => ({
  feature: entry,
  places: entry.places.filter((place) => place.app === "workflow-studio"),
})).filter((entry) => entry.places.length > 0);

/** Keys named in CODE (a quoted string, never a backticked comment mention). */
function keysInCode(source: string, feature: FeaturePlaces): Set<string> {
  const prefixes = featurePrefixes(feature.feature);
  const out = new Set<string>();
  for (const match of source.matchAll(/["']([a-z][a-z0-9_]*\.[a-z0-9_.]+)["']/g)) {
    if (ALL_KEYS.has(match[1]) && prefixes.some((prefix) => match[1].startsWith(`${prefix}.`))) {
      out.add(match[1]);
    }
  }
  return out;
}

const studioRead = (file: string) => readFileSync(join(STUDIO_ROOT, file), "utf8");
const serverRead = (file: string) => readFileSync(join(AIDREAM_ROOT, file), "utf8");

describe("workflow studio places", () => {
  it("are declared", () => {
    expect(studioFeatures.length).toBeGreaterThan(0);
  });

  it("says out loud when the cross-repo leg could not run", () => {
    if (!hasStudio) {
      console.warn(
        `UNMEASURED: the aidream checkout was not found at ${STUDIO_ROOT}, so the` +
          " Workflow Studio places were not proved against the studio's call sites." +
          " Set AIDREAM_DIR to the aidream checkout to run them.",
      );
    }
    expect(typeof hasStudio).toBe("boolean");
  });

  (hasStudio ? describe.each : describe.skip.each)(
    studioFeatures.map((entry) => [entry.feature.feature, entry] as const),
  )("%s", (_name, { feature, places }) => {
    it.each(places.map((place) => [place.id, place] as const))(
      "place %s: every job is run by its studio call site",
      (_id, place) => {
        const named = new Set<string>();
        for (const source of place.sources) {
          expect({ source, exists: existsSync(join(STUDIO_ROOT, source)) }).toEqual({
            source,
            exists: true,
          });
          const code = studioRead(source);
          keysNamedIn(code, feature).forEach((key) => named.add(key));
          if (place.calls) {
            expect({ source, calls: place.calls, found: code.includes(place.calls) }).toEqual({
              source,
              calls: place.calls,
              found: true,
            });
          }
        }
        if (place.calls) {
          const server = place.server ?? [];
          expect({ place: place.id, hasServer: server.length > 0 }).toEqual({
            place: place.id,
            hasServer: true,
          });
          let routed = false;
          for (const file of server) {
            expect({ file, exists: existsSync(join(AIDREAM_ROOT, file)) }).toEqual({
              file,
              exists: true,
            });
            const code = serverRead(file);
            if (code.includes(place.calls)) routed = true;
            keysNamedIn(code, feature).forEach((key) => named.add(key));
          }
          expect({ calls: place.calls, routedByServer: routed }).toEqual({
            calls: place.calls,
            routedByServer: true,
          });
        }
        for (const key of place.mandateKeys) {
          expect({ key, real: ALL_KEYS.has(key) }).toEqual({ key, real: true });
          expect({ key, runsHere: named.has(key) }).toEqual({ key, runsHere: true });
        }
      },
    );

    it("every studio file whose code names a job is named by a place for it", () => {
      const unmapped: string[] = [];
      for (const full of walk(join(STUDIO_ROOT, "src"), [], [".ts", ".tsx"])) {
        const file = relative(STUDIO_ROOT, full);
        for (const key of keysInCode(readFileSync(full, "utf8"), feature)) {
          const mapped = places.some(
            (place) => place.sources.includes(file) && place.mandateKeys.includes(key),
          );
          if (!mapped) unmapped.push(`${file} → ${key}`);
        }
      }
      expect(unmapped).toEqual([]);
    });
  });
});
