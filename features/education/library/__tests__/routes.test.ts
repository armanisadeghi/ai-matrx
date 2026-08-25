import { educationLibraryHref, type EducationLibraryRow } from "../types";

function row(kind: string, subtype: string): EducationLibraryRow {
  return {
    access_level: "owner",
    accuracy_pct: 0,
    created_at: "2026-08-21T00:00:00Z",
    created_by: "00000000-0000-0000-0000-000000000001",
    description: "",
    difficulty: "",
    due_count: 0,
    duration_seconds: 0,
    id: "00000000-0000-0000-0000-000000000002",
    is_owner: true,
    item_count: 0,
    kind,
    last_studied_at: "",
    organization_id: "00000000-0000-0000-0000-000000000003",
    organization_name: "Personal",
    owner_email: "learner@example.com",
    source_title: "",
    status: "ready",
    studied_count: 0,
    subtype,
    title: "Study item",
    topic: "",
    total_count: 1,
    updated_at: "2026-08-21T00:00:00Z",
    visibility: "internal",
  };
}

describe("Education Library doors", () => {
  it.each([
    ["fc_set", "flashcards", "/education/flashcards/"],
    ["assessment", "quiz", "/education/quizzes/"],
    ["assessment", "practice_test", "/education/practice-tests/"],
    ["study_media", "audio", "/education/audio-study/"],
    ["study_media", "summary", "/education/summaries/"],
    ["study_media", "mind_map", "/education/mind-maps/"],
    ["study_media", "memory_aid", "/education/memory/"],
    ["note", "notes", "/education/notes/"],
  ])("routes %s/%s to its owning surface", (kind, subtype, prefix) => {
    expect(educationLibraryHref(row(kind, subtype))).toBe(
      `${prefix}00000000-0000-0000-0000-000000000002`,
    );
  });
});
