/**
 * THE PLACES MAP CANNOT DRIFT FROM THE CODE THAT RUNS THE JOBS.
 *
 * The feature intelligence page draws "where each job runs" from
 * `data/intelligence-places.ts`. This reads every Flashcards file that
 * registers a job (`useFlashcardMandates([...])` / `flashcardMandateRefs([...])`)
 * and fails when:
 *   - a file registers jobs but no place names it as a source, or
 *   - a file registers a job its place does not list, or
 *   - a place lists a source file that registers nothing.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { FLASHCARDS_PLACES } from "../data/intelligence-places";
import { FC_MANDATES, type FcMandateKey } from "../data/mandates";

const ROOT = process.cwd();
const FEATURE_DIR = join(ROOT, "features/flashcards");
const CALL = /(?:useFlashcardMandates|flashcardMandateRefs)\(/g;

/** The argument text of a call, parentheses balanced (nested calls kept). */
function argumentText(source: string, open: number): string {
  let depth = 1;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(open, index);
    }
  }
  return source.slice(open);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Job names a file registers, e.g. {"generateCards"}. */
function registeredJobs(source: string): Set<FcMandateKey> {
  const jobs = new Set<FcMandateKey>();
  for (const match of source.matchAll(CALL)) {
    const args = argumentText(source, (match.index ?? 0) + match[0].length);
    for (const quoted of args.matchAll(/"([A-Za-z]+)"/g)) {
      if (quoted[1] in FC_MANDATES) jobs.add(quoted[1] as FcMandateKey);
    }
  }
  return jobs;
}

const registering = walk(FEATURE_DIR)
  .filter((file) => !file.endsWith("data/mandate-disclosure.ts"))
  .map((file) => ({
    file: relative(ROOT, file),
    jobs: registeredJobs(readFileSync(file, "utf8")),
  }))
  .filter((entry) => entry.jobs.size > 0);

describe("Flashcards intelligence places", () => {
  it("finds the registering call sites (the parser is not blind)", () => {
    expect(registering.length).toBeGreaterThanOrEqual(10);
    const topic = registering.find((entry) =>
      entry.file.endsWith("create/CreateFromTopic.tsx"),
    );
    expect(topic?.jobs.has("generateCards")).toBe(true);
  });

  it.each(registering.map((entry) => [entry.file, entry] as const))(
    "%s is mapped to a place that lists every job it registers",
    (_file, entry) => {
      const places = FLASHCARDS_PLACES.places.filter((place) =>
        place.sources.includes(entry.file),
      );
      expect(places.map((place) => place.id)).not.toEqual([]);
      const listed = new Set(places.flatMap((place) => place.mandateKeys));
      for (const job of entry.jobs) {
        expect({ job, listed: listed.has(FC_MANDATES[job]) }).toEqual({
          job,
          listed: true,
        });
      }
    },
  );

  it("every declared source registers at least one job", () => {
    const files = new Set(registering.map((entry) => entry.file));
    for (const place of FLASHCARDS_PLACES.places) {
      for (const source of place.sources) {
        expect({ place: place.id, source, registers: files.has(source) }).toEqual({
          place: place.id,
          source,
          registers: true,
        });
      }
    }
  });

  it("the parser rejects a file with no registration", () => {
    expect(registeredJobs('const x = useOther(["generateCards"]);').size).toBe(0);
    expect(registeredJobs('useFlashcardMandates(["helpLive", "reviewBatch"]);')).toEqual(
      new Set(["helpLive", "reviewBatch"]),
    );
  });
});
