/**
 * Canonical-path guard for spoken grading.
 *
 * The 2026-08-30 FastFire failure survived ordinary behavioral coverage because
 * one older caller launched the grader directly while the newer surfaces used
 * `runSpokenGrader`. This source census makes that absence testable: every
 * direct spoken-grade caller names the shared primitive, and no focused voice
 * module may rebuild the removed message-part wire.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");

const DIRECT_SPOKEN_GRADE_CALLERS = [
  "features/flashcards/fast-fire/agents/gradeCard.thunk.ts",
  "features/flashcards/fast-fire/agents/gradeSpokenAnswer.thunk.ts",
  "features/education/spoken-practice/data/gradePracticeAnswer.ts",
  "features/education/study/offline/resolvePendingGrade.ts",
] as const;

/**
 * Legitimate direct headless lanes inside the focused voice modules. Every
 * other direct launch is suspicious and must either join the shared grader or
 * be added here with a concrete non-grading reason.
 */
const ALLOWED_HEADLESS_LANES = [
  "features/education/spoken-practice/data/generateSession.ts",
  "features/education/spoken-practice/data/reviewPracticeSession.ts",
  "features/flashcards/fast-fire/agents/grading-core.ts",
  "features/flashcards/fast-fire/helper-audio/generateHelperAudio.thunk.ts",
] as const;

const FOCUSED_ROOTS = [
  "features/flashcards/fast-fire",
  "features/education/spoken-practice",
  "features/education/study/offline",
  "features/education/media/audio",
] as const;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("spoken grading canonical path", () => {
  const focusedFiles = FOCUSED_ROOTS.flatMap((root) => walk(join(ROOT, root)));

  it.each(DIRECT_SPOKEN_GRADE_CALLERS)("%s uses runSpokenGrader", (caller) => {
    const source = stripComments(readFileSync(join(ROOT, caller), "utf8"));

    expect(source).toMatch(/\brunSpokenGrader\s*\(/);
    expect(source).not.toMatch(/\brunHeadlessAgentJson\s*\(/);
    expect(source).not.toMatch(
      /\bmessageParts\s*:|\bsetUserInputMessageParts\s*\(|\btoContentPart\s*\(/,
    );
  });

  it("has no unreviewed direct headless lane in the focused voice modules", () => {
    const directHeadlessLanes = focusedFiles.flatMap((file) => {
      const source = stripComments(readFileSync(file, "utf8"));
      return /\brunHeadlessAgentJson\s*\(/.test(source)
        ? [relative(ROOT, file).split("\\").join("/")]
        : [];
    });

    expect(directHeadlessLanes.sort()).toEqual(
      [...ALLOWED_HEADLESS_LANES].sort(),
    );
  });

  it("has no message-part media construction in the focused voice modules", () => {
    const messagePartLanes = focusedFiles.flatMap((file) => {
      const source = stripComments(readFileSync(file, "utf8"));
      return /\bmessageParts\s*:|\bsetUserInputMessageParts\s*\(|\btoContentPart\s*\(/.test(
        source,
      )
        ? [relative(ROOT, file).split("\\").join("/")]
        : [];
    });

    expect(messagePartLanes).toEqual([]);
  });
});
