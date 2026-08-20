/**
 * THE GUARD. `recordAttemptOfflineAware` is not a "nice to have" per mode — it
 * is the only difference between an answer that survives a dropped connection
 * and one that is destroyed. For a year six of seven study modes called
 * `studyService.recordAttempt` directly (STATE.md §4.1 B item 8), and nothing
 * caught it: the wrapper's own tests passed, every mode's own tests passed, and
 * the wrapper's header comment asserted the opposite of the truth.
 *
 * That is the shape of bug a behavioral test cannot see, because the defect is
 * an ABSENCE — the mode never calls the thing. So this suite reads the source
 * and fails on any NEW learner-facing writer that reaches past the outbox.
 *
 * Adding a study mode? Call `recordAttemptOfflineAware`. If a new file truly
 * belongs on the direct path, add it to ALLOWED with the reason — deliberately
 * a diff a human has to justify, not a lint rule anyone can silence.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");

/**
 * Files permitted to call `studyService.recordAttempt` directly, and WHY.
 * Every entry is a claim that this path can never be a learner answering
 * offline. Nothing may be added here to make a test pass.
 */
const ALLOWED: Record<string, string> = {
  "features/education/study/service/studyService.ts":
    "the writer itself — this IS the canonical RPC call",
  "features/education/study/offline/recordAttemptOffline.ts":
    "the wrapper — its whole job is calling the writer and catching the drop",
  "features/education/study/offline/replay.ts":
    "the flush loop — it only ever runs online, draining the outbox",
};

/**
 * Learner-facing writers still on the direct path, each with the reason it is
 * not yet converted. These are NOT study modes — they are assessment and
 * practice surfaces with their own submission semantics (a graded assessment
 * offline raises integrity questions a flashcard never does), and converting
 * them is its own scoped decision. Listed here so they are visible and counted,
 * never silently exempt.
 */
const KNOWN_DIRECT: Record<string, string> = {
  "features/education/assessment/grade-work/useGradeWork.ts":
    "graded work submission — offline capture needs an integrity ruling first",
  "features/education/assessment/components/take/useTakeAssessment.ts":
    "proctored-style assessment take — same ruling as grade-work",
  "features/education/spoken-practice/data/gradePracticeAnswer.ts":
    "spoken practice — server-graded like FastFire; convert with the same split",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no study mode bypasses the offline outbox (STATE §4.1 B8)", () => {
  const offenders: string[] = [];

  beforeAll(() => {
    for (const dir of ["features", "app", "components"]) {
      const base = join(ROOT, dir);
      let files: string[];
      try {
        files = walk(base);
      } catch {
        continue; // directory absent in this checkout
      }
      for (const file of files) {
        const rel = relative(ROOT, file).split("\\").join("/");
        if (/__tests__|\.test\.tsx?$|\.spec\.tsx?$/.test(rel)) continue;
        if (rel in ALLOWED || rel in KNOWN_DIRECT) continue;
        const src = readFileSync(file, "utf8");
        // Match the CALL, not a mention in prose — comments cite it constantly.
        if (/(?<!\/[/*].*)studyService\s*\n?\s*\.?\s*recordAttempt\s*\(/.test(
          src.replace(/^\s*(\/\/|\*).*$/gm, ""),
        )) {
          offenders.push(rel);
        }
      }
    }
  });

  it("no new file calls studyService.recordAttempt directly", () => {
    expect(offenders).toEqual([]);
  });

  it("all seven study modes are on the offline-aware writer", () => {
    const modes = [
      "features/flashcards/data/useFlashcardStudy.ts",
      "features/flashcards/data/useQuizStudy.ts",
      "features/flashcards/data/useDueReview.ts",
      "features/flashcards/data/useWeakAreaDrill.ts",
      "features/flashcards/data/useMatchGame.ts",
      "features/flashcards/fast-fire/agents/gradeCard.thunk.ts",
      "features/flashcards/fast-fire/agents/gradeSpokenAnswer.thunk.ts",
    ];
    for (const mode of modes) {
      const src = readFileSync(join(ROOT, mode), "utf8");
      expect({ mode, wired: src.includes("recordAttemptOfflineAware(") }).toEqual({
        mode,
        wired: true,
      });
    }
  });
});
