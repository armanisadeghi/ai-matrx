/**
 * lesson-scripts + study-pack kinds — the STREAMING bridge contract
 * (study_pack_v2). Mirrors kind-keyword-research.test.ts: real ParseSession
 * feeds, cut mid-stream, and the load-bearing behavior pinned:
 *
 *  1. MID-STREAM (lessons): sections that have closed render immediately; a
 *     section whose heading arrived but whose narration hasn't maps to
 *     `script: null` — the per-section loader — never dropped, never raw JSON.
 *  2. COMPLETE (lessons): the full payload maps every section, isComplete=true,
 *     and mapped sections are reference-stable across envelope flushes.
 *  3. MID-STREAM (pack): whichever member artifacts have arrived are handed
 *     over as untouched subtrees for delegation; missing members are simply
 *     absent (the block shows their kind's skeleton).
 *  4. COMPLETE (pack): all members present, isComplete=true.
 */

import { ParseSession } from "../session/parse-session";
import type { KindSchema } from "../core/kind-schema.types";
import type { SchemaResolver } from "../core/kind-parser";
import { SYSTEM_KIND_DEFINITIONS } from "../registry/system-kinds";
import { lessonScriptsServerDataFromEnvelope } from "../kinds/lesson-scripts";
import { studyPackServerDataFromEnvelope } from "../kinds/study-pack";

const resolver: SchemaResolver = {
  get: (kind: string): KindSchema | undefined =>
    SYSTEM_KIND_DEFINITIONS.find((def) => def.kind === kind)?.schema ??
    undefined,
  request: () => {},
};

const LESSONS_JSON = JSON.stringify({
  __kind: "lesson_script_set",
  title: "Plate Tectonics, Spoken",
  overview: "Two short lessons that read the theory aloud.",
  sections: [
    {
      __kind: "lesson_script_section",
      heading: "What the theory says",
      script:
        "Picture the Earth's surface as a cracked eggshell. Each piece is a plate, and each plate is drifting — about as fast as your fingernails grow.",
      duration_seconds: 45,
      key_points: ["Plates are rigid pieces of the lithosphere."],
    },
    {
      __kind: "lesson_script_section",
      heading: "Where plates meet",
      script:
        "Everything interesting happens at the boundaries. Plates pull apart, collide, or grind past one another.",
      duration_seconds: 60,
      key_points: ["Three boundary types.", "Boundaries build features."],
    },
  ],
});

const PACK_JSON = JSON.stringify({
  __kind: "study_pack_set",
  title: "Plate Tectonics — Study Pack",
  topic: "Earth science",
  audience: "High school",
  notes: {
    __kind: "study_notes",
    title: "Plate tectonics notes",
    sections: [{ __kind: "study_notes_section", heading: "The theory" }],
  },
  flashcards: {
    __kind: "flashcard_set",
    title: "Boundary drills",
    cards: [
      {
        __kind: "flashcard",
        front: "Divergent boundary?",
        back: "Plates part.",
      },
    ],
  },
  quiz: {
    __kind: "quiz_set",
    title: "Quick check",
    questions: [
      {
        __kind: "quiz_question",
        type: "multiple_choice",
        question: "Which boundary makes new crust?",
        options: ["Divergent", "Convergent"],
        correct_answer: "Divergent",
      },
    ],
  },
  lessons: {
    __kind: "lesson_script_set",
    title: "Spoken lessons",
    sections: [
      {
        __kind: "lesson_script_section",
        heading: "What the theory says",
        script: "Picture a cracked eggshell.",
      },
    ],
  },
  sources_summary: { source_count: 2 },
});

describe("lesson_script_set — streaming bridge", () => {
  it("MID-STREAM: closed sections render; a heading-only section gets the per-section loader", () => {
    const session = new ParseSession({
      identity: "lessons-partial",
      schemas: resolver,
    });
    // Cut right after the second section's heading, before its script.
    const cut =
      LESSONS_JSON.indexOf('"Where plates meet"') +
      '"Where plates meet"'.length;
    session.write(LESSONS_JSON.slice(0, cut));

    const serverData = lessonScriptsServerDataFromEnvelope(
      session.buildEnvelope(),
    );
    expect(serverData).toBeDefined();
    expect(serverData?.isComplete).toBe(false);
    expect(serverData?.title).toBe("Plate Tectonics, Spoken");
    expect(serverData?.sections.length).toBeGreaterThanOrEqual(1);
    expect(serverData?.sections[0]).toMatchObject({
      heading: "What the theory says",
      durationSeconds: 45,
      keyPoints: ["Plates are rigid pieces of the lithosphere."],
    });
    expect(typeof serverData?.sections[0].script).toBe("string");
    // The still-streaming second section, if surfaced, shows its loader.
    const second = serverData?.sections[1];
    if (second) {
      expect(second.heading).toBe("Where plates meet");
      expect(second.script).toBeNull();
    }
    session.dispose();
  });

  it("COMPLETE: full payload maps every section, isComplete=true", () => {
    const session = new ParseSession({
      identity: "lessons-complete",
      schemas: resolver,
    });
    session.write(LESSONS_JSON);
    session.end();

    const serverData = lessonScriptsServerDataFromEnvelope(
      session.buildEnvelope(),
    );
    expect(serverData).toMatchObject({
      title: "Plate Tectonics, Spoken",
      overview: "Two short lessons that read the theory aloud.",
      isComplete: true,
    });
    expect(serverData?.sections).toHaveLength(2);
    expect(serverData?.sections[1]).toMatchObject({
      heading: "Where plates meet",
      durationSeconds: 60,
    });
    expect(serverData?.sections[1].script).toContain("boundaries");
    session.dispose();
  });

  it("reference stability: unchanged sections keep identity across envelope builds", () => {
    const session = new ParseSession({
      identity: "lessons-stable",
      schemas: resolver,
    });
    session.write(LESSONS_JSON);
    session.end();

    const first = lessonScriptsServerDataFromEnvelope(session.buildEnvelope());
    const second = lessonScriptsServerDataFromEnvelope(session.buildEnvelope());
    expect(first?.sections[0]).toBe(second?.sections[0]);
    session.dispose();
  });

  it("a title-only mid-stream value renders as the document taking shape (empty sections, isComplete=false)", () => {
    // The kernel normalizes a declared child-kind array to [] the moment the
    // root opens, so "sections hasn't opened yet" surfaces as an EMPTY list —
    // a normal mid-stream state the component renders as the header plus
    // "Still writing", never a spinner and never raw JSON.
    const session = new ParseSession({
      identity: "lessons-thin",
      schemas: resolver,
    });
    session.write('{"__kind":"lesson_script_set","title":"T"');
    expect(
      lessonScriptsServerDataFromEnvelope(session.buildEnvelope()),
    ).toMatchObject({ title: "T", sections: [], isComplete: false });
    session.dispose();
  });
});

describe("study_pack_set — streaming delegation bridge", () => {
  it("MID-STREAM: arrived members are handed over; missing members are absent", () => {
    const session = new ParseSession({
      identity: "pack-partial",
      schemas: resolver,
    });
    // Cut inside `flashcards`, after `notes` closed.
    const cut =
      PACK_JSON.indexOf('"Boundary drills"') + '"Boundary drills"'.length;
    session.write(PACK_JSON.slice(0, cut));

    const serverData = studyPackServerDataFromEnvelope(session.buildEnvelope());
    expect(serverData).toBeDefined();
    expect(serverData?.isComplete).toBe(false);
    expect(serverData?.title).toBe("Plate Tectonics — Study Pack");
    expect(serverData?.topic).toBe("Earth science");
    expect(serverData?.audience).toBe("High school");

    const keys = serverData?.children.map((child) => child.key) ?? [];
    expect(keys).toContain("notes");
    expect(keys).not.toContain("quiz");
    expect(keys).not.toContain("lessons");

    const notes = serverData?.children.find((child) => child.key === "notes");
    expect(notes?.kind).toBe("study_notes");
    // The subtree is handed over UNTOUCHED for delegation.
    expect(notes?.value.title).toBe("Plate tectonics notes");
    session.dispose();
  });

  it("COMPLETE: all four members present in canonical order, isComplete=true", () => {
    const session = new ParseSession({
      identity: "pack-complete",
      schemas: resolver,
    });
    session.write(PACK_JSON);
    session.end();

    const serverData = studyPackServerDataFromEnvelope(session.buildEnvelope());
    expect(serverData).toMatchObject({ isComplete: true });
    expect(serverData?.children.map((child) => child.key)).toEqual([
      "notes",
      "flashcards",
      "quiz",
      "lessons",
    ]);
    expect(serverData?.children.map((child) => child.kind)).toEqual([
      "study_notes",
      "flashcard_set",
      "quiz_set",
      "lesson_script_set",
    ]);
    expect(serverData?.sourcesSummary).toMatchObject({ source_count: 2 });
    session.dispose();
  });
});
