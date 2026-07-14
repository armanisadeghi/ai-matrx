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
import { deckGenerator } from "./deck";
import { summaryGenerator } from "./summary";
import { mindMapGenerator } from "./mindMap";
import { memoryAidGenerator } from "./memoryAid";
import { notesGenerator } from "@/features/education/notes/notesGenerator";
import { audioStudyGenerator } from "@/features/education/media/audio/audioGenerator";
import {
  quizGenerator,
  practiceTestGenerator,
} from "@/features/education/assessment/data/quizGenerator";

// ── Live generators ────────────────────────────────────────────────────────
registerGenerator(deckGenerator);
registerGenerator(summaryGenerator);
registerGenerator(mindMapGenerator);
// memory_aid (VISION §11 Memory Tools) → mnemonics/analogies/palace via
// studyMediaService. Owned by features/education/memory.
registerGenerator(memoryAidGenerator);
// notes (P4 Smart Notes) → a real platform note. Owned by features/education/notes.
registerGenerator(notesGenerator);
// quiz + practice_test (P1 Assessment Engine) → a real education.assessment via
// assessmentService. Owned by features/education/assessment.
registerGenerator(quizGenerator);
registerGenerator(practiceTestGenerator);
// audio (P3 Audio Study) → a streamed audio overview via studyMediaService.
// Owned by features/education/media.
registerGenerator(audioStudyGenerator);

// ── Progressive placeholders ────────────────────────────────────────────────
// All converter targets now have a live generator (deck / summary / mind_map /
// memory_aid / notes / quiz / practice_test / audio). Re-add a placeholder(targetKind,label,
// owner) here if a NEW TargetKind is introduced before its generator lands.
