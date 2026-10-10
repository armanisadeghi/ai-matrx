import "@/providers/chatUiRegistration";
/**
 * The inspector prints what a value means: a reference cell reads as its
 * summary, never its stored fence bytes, and two fence spellings of the same
 * reference read identically.
 */
import { referenceFence, type ContextValue } from "@ai-matrx/records/scopes";
import { displayValue } from "@ai-matrx/chat/agents/components/context-preview/inspector/ContextInspector";

jest.mock("@/features/scopes/service/scopesService", () => ({ scopesService: {} }));

const cell = (patch: Partial<ContextValue>): ContextValue => ({
  scope_id: "s",
  field_id: "i",
  key: "k",
  kind: "string",
  value: null,
  references: [],
  version: 1,
  set_at: "2026-10-01T00:00:00Z",
  source_type: "manual",
  authored_by: null,
  whole_value: null,
  incomplete: null,
  ...patch,
});

const ID = "3f0e2d1c-4b5a-4968-8776-5a4b3c2d1e0f";
const references = [{ id: ID, type: "scope", label: "Meridian" }];

it("a reference cell reads as its summary, not the fence", () => {
  const shown = displayValue(cell({ kind: "reference", value: [ID], references }));
  expect(shown).toBe("Meridian");
  expect(shown).not.toContain("```");
});

it("a text cell that holds a fence (either spelling) reads as the same summary", () => {
  const spaced =
    "```matrx\n" +
    JSON.stringify({ items: [{ label: "Meridian", id: ID }], __kind: "directive_v1_reference_scope" }, null, 4) +
    "\n```";
  expect(displayValue(cell({ value: spaced }))).toBe(displayValue(cell({ value: referenceFence(references) })));
});

it("plain values are unchanged", () => {
  expect(displayValue(cell({ kind: "phone", value: "(619) 555-0177" }))).toBe("(619) 555-0177");
  expect(displayValue(cell({ kind: "boolean", value: false }))).toBe("No");
  expect(displayValue(null)).toBeNull();
});
