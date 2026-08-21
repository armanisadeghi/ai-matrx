// Guards the converter's lineage contract: every artifact token a generator
// produces must be declared, because each declared token has registered
// association pairs in the live DB. A generator that returns an undeclared
// `resourceType` writes an edge the DB refuses (23514) and silently loses the
// artifact's provenance — which is precisely what happened to notes, quizzes,
// and practice tests until 2026-08-20.

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { CONVERT_ARTIFACT_TOKENS } from "../lineageTokens";

const ROOT = join(__dirname, "..", "..");

/** Every generator file that feeds the converter registry. */
const GENERATOR_FILES = [
  "convert/generators/deck.ts",
  "convert/generators/summary.ts",
  "convert/generators/mindMap.ts",
  "convert/generators/memoryAid.ts",
  "notes/notesGenerator.ts",
  "assessment/data/quizGenerator.ts",
  "media/audio/audioGenerator.ts",
];

describe("converter lineage tokens", () => {
  it("declares every resourceType the generators produce", () => {
    const declared = new Set<string>(CONVERT_ARTIFACT_TOKENS);
    const found = new Set<string>();
    for (const rel of GENERATOR_FILES) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      for (const m of src.matchAll(/resourceType:\s*"([a-z_]+)"/g)) {
        found.add(m[1]);
      }
    }
    expect(found.size).toBeGreaterThan(0);
    for (const token of found) {
      expect(declared.has(token)).toBe(true);
    }
  });

  it("covers every generator file that exists", () => {
    const generatorDir = join(ROOT, "convert", "generators");
    const onDisk = readdirSync(generatorDir).filter(
      (f) =>
        f.endsWith(".ts") &&
        f !== "index.ts" &&
        statSync(join(generatorDir, f)).isFile(),
    );
    for (const f of onDisk) {
      expect(GENERATOR_FILES).toContain(`convert/generators/${f}`);
    }
  });
});
