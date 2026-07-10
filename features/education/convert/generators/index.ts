// features/education/convert/generators/index.ts
//
// Side-effect module: importing it registers every content generator on the
// converter registry. The three live generators (deck / summary / mind_map) run
// today; the rest register as UNAVAILABLE placeholders so the kit picker can
// show them ("coming soon") and light up the instant the owning project (P1
// quizzes/tests, P3 audio, P4 notes) replaces the placeholder with a real
// generator — no picker change required.
//
// A downstream project makes its target live by calling registerGenerator()
// with a real `run` + `available: true` (from its own feature module, imported
// here or self-registered). Do NOT add a second dispatch.

import { registerGenerator } from "../registry";
import type { ConvertGenerator, TargetKind } from "../types";
import { deckGenerator } from "./deck";
import { summaryGenerator } from "./summary";
import { mindMapGenerator } from "./mindMap";
import { notesGenerator } from "@/features/education/notes/notesGenerator";

// ── Live generators ────────────────────────────────────────────────────────
registerGenerator(deckGenerator);
registerGenerator(summaryGenerator);
registerGenerator(mindMapGenerator);
// notes (P4 Smart Notes) → a real platform note. Owned by features/education/notes.
registerGenerator(notesGenerator);

// ── Progressive placeholders (register when the owning project lands) ────────
function placeholder(
  targetKind: TargetKind,
  label: string,
  owner: string,
): ConvertGenerator {
  return {
    targetKind,
    label,
    available: false,
    run() {
      throw new Error(`${label} is coming soon (${owner})`);
    },
  };
}

registerGenerator(placeholder("audio", "Audio overview", "P3"));
registerGenerator(placeholder("quiz", "Quiz", "P1"));
registerGenerator(placeholder("practice_test", "Practice test", "P1"));
