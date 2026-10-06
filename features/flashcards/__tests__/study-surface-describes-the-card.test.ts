/**
 * The study page tells the agent which card is in view (Applets AP-6).
 *
 * 2026-10-06: a student on /education/flashcards/<set>/study asked "I'm stuck on this
 * card" and the agent, given only the URL and the LIBRARY surface, made 20 tool calls to
 * find it. These pin: the study routes resolve to the study surface, every blank of its
 * situation template is a declared value, and the emitter fills the card in view.
 */
import { surfaceFromPathname } from "@ai-matrx/chat/surfaces/utils/route-to-surface";
import {
  EDUCATION_FLASHCARD_STUDY_SITUATION,
  EDUCATION_FLASHCARD_STUDY_SURFACE,
} from "@/features/surfaces/manifests/education-flashcard-study.manifest";
import { getManifest } from "@/features/surfaces/manifests/registry";
import {
  buildFlashcardStudyValues,
  durationInWords,
  scoreInWords,
} from "@/features/flashcards/components/study/useFlashcardStudySurface";
import type { UseFlashcardStudyResult } from "@/features/flashcards/data/useFlashcardStudy";

const SET = "77f007db-e41d-4561-9f97-03d49ff5f2e0";

describe("flashcard study surface", () => {
  it.each(["study", "learn", "write"])("resolves /%s to the study surface, not the library", (mode) => {
    expect(surfaceFromPathname(`/education/flashcards/${SET}/${mode}`)).toBe(
      EDUCATION_FLASHCARD_STUDY_SURFACE,
    );
  });

  it("leaves the deck page and the editor on their own surfaces", () => {
    expect(surfaceFromPathname(`/education/flashcards/${SET}`)).toBe(
      "matrx-user/education-flashcard-set",
    );
    expect(surfaceFromPathname(`/education/flashcards/${SET}/edit`)).toBe(
      "matrx-user/education-flashcard-editor",
    );
  });

  it("inherits the whole deck from the deck page's surface", () => {
    const names = new Set(getManifest(EDUCATION_FLASHCARD_STUDY_SURFACE)?.values.map((v) => v.name));
    for (const name of ["set_loaded", "set_id", "set_details", "card_count", "cards", "card_mastery"]) {
      expect(names.has(name)).toBe(true);
    }
  });

  it("names only declared values (or the request's user) in its situation", () => {
    const declared = new Set(getManifest(EDUCATION_FLASHCARD_STUDY_SURFACE)?.values.map((v) => v.name));
    const blanks = [
      ...EDUCATION_FLASHCARD_STUDY_SITUATION.matchAll(/\{\s*([A-Za-z_][\w]*)/g),
    ].map((m) => m[1]);
    expect(blanks.length).toBeGreaterThan(10);
    for (const name of blanks) {
      expect(name === "user" || declared.has(name)).toBe(true);
    }
  });

  it("fills the card in view, the side shown, and whether the answer was seen", () => {
    const study = {
      set: { name: "Cleaner M — ADME", topic: "Toxicology", lesson: null, description: null, difficulty: null, visibility: "personal" },
      cards: [
        { id: "c1", front: "Q1", back: "A1", card_kind: "basic", dynamic_content: null, position: 0, details: [] },
        { id: "c2", front: "Which organ removes water-soluble substances?", back: "The kidneys.", card_kind: "basic", dynamic_content: null, position: 1, details: [] },
        { id: "c3", front: "Q3", back: "A3", card_kind: "basic", dynamic_content: null, position: 2, details: [] },
      ],
      loading: false,
      error: null,
      currentIndex: 1,
      isFlipped: false,
      resultsByCard: { c1: "correct" },
      progress: { done: 1, total: 3, correct: 1 },
      masteryByCard: { c2: { attempt_count: 4, lapses: 1 } },
      deckSize: 63,
    } as unknown as UseFlashcardStudyResult;

    const values = buildFlashcardStudyValues({ setId: SET, study, mode: "flip cards" }, 150);
    expect(values).toMatchObject({
      set_loaded: true,
      set_id: SET,
      set_details: expect.objectContaining({ name: "Cleaner M — ADME", topic: "Toxicology" }),
      card_count: 63,
      card_number: 2,
      cards_in_round: 3,
      side_shown: "front",
      card_front: "Which organ removes water-soluble substances?",
      card_back: "The kidneys.",
      back_status: "they have not seen the answer yet",
      time_on_page: "2 minutes 30 seconds",
      score: "1 of 1 graded cards right (100%)",
    });
    expect(values.card_history).toContain("4 times");
    // The whole deck travels as data, in the deck page's own shape.
    expect(values.cards?.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("says time and score in words", () => {
    expect(durationInWords(1)).toBe("1 second");
    expect(durationInWords(3720)).toBe("1 hour 2 minutes");
    expect(scoreInWords(0, 0)).toBe("no cards graded yet");
  });
});
