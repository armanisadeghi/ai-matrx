// features/entitlements/__tests__/studySpineVocabulary.ts
//
// TEST-ONLY. Derives the vocabulary of CORE PRACTICE from the study spine
// itself, by reading the spine's source at test time.
//
// Why derived and not hand-typed: program law D-5 ("core practice is never
// metered") has to hold for study modes that do not exist yet. A hand-typed
// forbidden list guards the modes someone remembered on the day they wrote it
// and silently stops guarding the moment a new mode ships — which is exactly
// the failure this whole guard exists to prevent. So the mode half of the
// vocabulary is SCANNED: declare a mode anywhere in the spine's normal way and
// the invariant covers it with no edit here.
//
// Sources scanned (all of them are how a mode is actually declared today):
//   1. `features/education/study/modes.ts`         — the mode label register
//   2. `const *_MODE / *_METHOD = "…"`             — a surface's mode constant
//   3. `studyService.createSession({ mode: "…" })` — a literal at the call site
//   4. `export const *_MODES / *_METHODS = [ … ]`  — a mode vocabulary array
//
// It is deliberately LOUD: `deriveStudyModeVocabulary` throws if a scan comes
// back implausibly thin, so a refactor that breaks the patterns fails the suite
// instead of quietly narrowing the invariant to nothing.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Repo root — this file sits at <root>/features/entitlements/__tests__/. */
const ROOT = join(__dirname, "..", "..", "..");

/** Where study modes are declared. Every study surface lives under one of these. */
const SCAN_DIRS = [
  join(ROOT, "features", "education"),
  join(ROOT, "features", "flashcards"),
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** `const STUDY_MODE = "fast_fire"` / `const GAME_METHOD = "game"`. */
const MODE_CONST = /\bconst\s+[A-Z][A-Z0-9_]*(?:MODE|METHOD)[A-Z0-9_]*\s*(?::[^=]+)?=\s*"([a-z][a-z0-9_]*)"/g;

/** `studyService.createSession({ … mode: "grade_work" … })`. */
const CREATE_SESSION = /createSession\(\{/g;
const MODE_LITERAL = /\bmode:\s*"([a-z][a-z0-9_]*)"/;

/** `export const SPOKEN_PRACTICE_MODES: SpokenPracticeMode[] = [ "oral_exam", … ]`. */
const MODE_ARRAY = /\b[A-Z][A-Z0-9_]*_(?:MODES|METHODS)\b[^=]*=\s*\[([^\]]*)\]/g;
const ARRAY_ITEM = /"([a-z][a-z0-9_]*)"/g;

/**
 * Every `study_session.mode` token this codebase can currently write.
 *
 * @throws when the scan looks broken (too few files, too few modes, or a mode
 *   we know exists has gone missing) — a silently-empty vocabulary would turn
 *   the D-5 invariant into a test that can never fail.
 */
export function deriveStudyModeVocabulary(): Set<string> {
  const files = SCAN_DIRS.flatMap((d) => walk(d));
  if (files.length < 100) {
    throw new Error(
      `[study-spine-vocabulary] scanned only ${files.length} files under ` +
        `${SCAN_DIRS.join(", ")} — the study spine moved. Fix the scan roots; ` +
        `do NOT let the core-practice invariant run on an empty vocabulary.`,
    );
  }

  const modes = new Set<string>();

  for (const file of files) {
    const src = readFileSync(file, "utf8");

    for (const m of src.matchAll(MODE_CONST)) modes.add(m[1]);

    for (const m of src.matchAll(MODE_ARRAY)) {
      for (const item of m[1].matchAll(ARRAY_ITEM)) modes.add(item[1]);
    }

    // A `mode:` literal inside the ~400 chars following a createSession( call.
    for (const m of src.matchAll(CREATE_SESSION)) {
      const window = src.slice(m.index!, m.index! + 400);
      const hit = window.match(MODE_LITERAL);
      if (hit) modes.add(hit[1]);
    }
  }

  // Source 1: the mode label register. Read as text (not imported) so this
  // module stays a pure file scanner with no runtime coupling to the spine.
  const register = readFileSync(
    join(ROOT, "features", "education", "study", "modes.ts"),
    "utf8",
  );
  const body = register.slice(register.indexOf("STUDY_MODE_LABELS"));
  for (const m of body.matchAll(/^\s{2}([a-z][a-z0-9_]*):\s*"/gm)) modes.add(m[1]);

  // Canary. These are declared four different ways; if the scan stops seeing
  // them, the patterns broke and the invariant has quietly stopped guarding.
  const CANARY = [
    "classic_review", // const STUDY_MODE in useFlashcardStudy
    "fast_fire", // const STUDY_MODE in useFastFireLauncher
    "match", // const MATCH_MODE in useMatchGame
    "weak_area", // const STUDY_MODE in useWeakAreaDrill
    "adaptive", // const STUDY_MODE in useDueReview
    "grade_work", // createSession literal in useGradeWork
    "game", // const GAME_METHOD in engage/types
    "oral_exam", // SPOKEN_PRACTICE_MODES array
  ];
  const missing = CANARY.filter((c) => !modes.has(c));
  if (missing.length > 0) {
    throw new Error(
      `[study-spine-vocabulary] the scan lost known study modes: ` +
        `${missing.join(", ")}. The declaration patterns in this file no longer ` +
        `match the spine — repair them before trusting the core-practice test.`,
    );
  }

  return modes;
}

/**
 * Words that mark an AI COST rather than a practice act. A capability naming
 * one of these is metering generation/inference, which D-5 explicitly permits
 * ("gating applies to depth and convenience only"). Subtracted from the core
 * vocabulary so `education.quiz_generate` and `education.image_grade` stay
 * legal while `education.quiz_attempt` does not.
 */
export const AI_COST_TOKENS = new Set([
  "ai",
  "audio",
  "document",
  "enrich",
  "enrichment",
  "generate",
  "generated",
  "generation",
  "grade",
  "graded",
  "grading",
  "image",
  "images",
  "ingest",
  "live",
  "memory",
  "message",
  "mindmap",
  "notes",
  "source",
  "spoken",
  "transcribe",
  "tutor",
  "voice",
]);

/**
 * Nouns and verbs of the practice act itself, taken from the spine's own
 * surface: its tables (`study_session`, `study_attempt`, `item_mastery`,
 * `study_streak`, `study_goal`), its RPCs (`study_record_attempt`,
 * `study_override_attempt`), and the acts D-5 names in words — studying,
 * reviewing, recording an attempt, opening a deck, running a session.
 */
export const SPINE_ACT_TOKENS = [
  // tables + RPCs
  "study",
  "session",
  "sessions",
  "attempt",
  "attempts",
  "item",
  "mastery",
  "streak",
  "goal",
  "record",
  "override",
  // the acts, in D-5's own words
  "answer",
  "browse",
  "card",
  "cards",
  "deck",
  "decks",
  "drill",
  "due",
  "flip",
  "mode",
  "open",
  "play",
  "practice",
  "repetition",
  "resume",
  "review",
  "round",
  "run",
  "set",
  "sets",
  "srs",
  "start",
  "study_mode",
  "take",
];

/**
 * THE FORBIDDEN VOCABULARY. A capability whose action is built ENTIRELY from
 * these words is metering the act of practicing, which D-5 forbids.
 */
export function deriveCorePracticeTokens(): Set<string> {
  const tokens = new Set<string>();
  for (const mode of deriveStudyModeVocabulary()) {
    for (const part of mode.split("_")) tokens.add(part);
  }
  for (const t of SPINE_ACT_TOKENS) tokens.add(t);
  for (const t of AI_COST_TOKENS) tokens.delete(t);
  return tokens;
}

/**
 * Does `capabilityKey` meter a core practice act?
 *
 * True when EVERY word of its action segment is core-practice vocabulary. The
 * "every" is what keeps `education.quiz_generate` (generation) legal while
 * catching `education.quiz_attempt` (taking the quiz).
 */
export function metersCorePractice(
  capabilityKey: string,
  coreTokens: Set<string>,
): boolean {
  const action = capabilityKey.includes(".")
    ? capabilityKey.slice(capabilityKey.indexOf(".") + 1)
    : capabilityKey;
  const parts = action.split("_").filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => coreTokens.has(p));
}
