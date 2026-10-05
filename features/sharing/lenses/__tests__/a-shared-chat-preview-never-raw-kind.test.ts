/**
 * KIND_NEVER_RAW S-share (round 4): a shared chat's link-preview description is
 * its first user message. A pasted kind became `{"__kind":…` in OG / link
 * previews; it now reads as the kind's one-line label.
 */
import { resolveShareLensMeta, resolveShareLensOg } from "../metadata";

const SET_JSON = JSON.stringify({
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" }],
});

function shared(userText: string) {
  return {
    resourceType: "conversation",
    resource: { title: "Study help" },
    displayLabel: "Chat",
    children: {
      kind: "conversation_messages",
      total: 1,
      truncated: false,
      messages: [{ id: "u1", role: "user", blocks: [{ type: "text", text: userText }] }],
    },
  } as never;
}

it("a pasted kind describes the chat as the kind's label", () => {
  const meta = resolveShareLensMeta(shared(SET_JSON));
  expect(meta.description).toContain("Cell biology");
  expect(meta.description).not.toContain("__kind");
  expect(meta.description).not.toContain("{");
});

it("a cut-off pasted kind is never shown as its fragment", () => {
  const meta = resolveShareLensMeta(shared(SET_JSON.slice(0, 50)));
  expect(meta.description).not.toContain("__kind");
});

it("the OG card carries the same readable description", () => {
  const og = resolveShareLensOg(shared(SET_JSON)) as { description?: string };
  expect(og.description ?? "").not.toContain("__kind");
});

it("a plain opener is unchanged", () => {
  expect(resolveShareLensMeta(shared("Add a   pool room")).description).toBe("Add a pool room");
});
