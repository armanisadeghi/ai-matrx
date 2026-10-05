/**
 * S1 (KIND_NEVER_RAW_CHECKLIST round 4): the collaboration card's folded
 * header subtitle printed the first 90 chars of a kind answer as raw JSON.
 */
import type { ToolLifecycleEntry } from "../../../../agents/types/request.types";
import { collabHeaderSubtitle } from "../collab-subtitle";

const SET_JSON = JSON.stringify({
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" }],
});

function entry(result: unknown): ToolLifecycleEntry {
  return {
    callId: "c1",
    toolName: "agent_call",
    displayName: "agent_call",
    status: "completed",
    arguments: { agent_id: "a1", history_mode: "fork" },
    startedAt: "2026-08-11T00:00:00Z",
    completedAt: null,
    latestMessage: null,
    latestData: null,
    result,
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [],
  } as unknown as ToolLifecycleEntry;
}

test("a kind answer text reads as its kind and title, never JSON", () => {
  const s = collabHeaderSubtitle(entry({ agent_name: "Tutor", result: SET_JSON }))!;
  expect(s).toContain("Tutor");
  expect(s).toContain("Cell biology");
  expect(s).not.toContain("__kind");
  expect(s).not.toContain("{");
});

test("a stored preview of a kind (reference mode) is never raw either", () => {
  const s = collabHeaderSubtitle(
    entry({ agent_name: "Tutor", stored: { preview: SET_JSON.slice(0, 60) } }),
  )!;
  expect(s).not.toContain("__kind");
});

test("a structured kind value reads as its label", () => {
  const s = collabHeaderSubtitle(
    entry({ agent_name: "Tutor", result: JSON.parse(SET_JSON) }),
  )!;
  expect(s).toContain("Cell biology");
  expect(s).not.toContain("__kind");
});

test("prose answers keep their snippet", () => {
  expect(collabHeaderSubtitle(entry({ agent_name: "R", result: "Weak pricing." }))).toBe(
    "R — Weak pricing.",
  );
});
