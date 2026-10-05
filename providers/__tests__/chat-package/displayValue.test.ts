import "@/providers/chatUiRegistration";
/**
 * The inspector prints what a value means: a reference cell reads as its
 * summary, never its stored fence bytes, and two fence spellings of the same
 * reference read identically.
 */
import { buildReferenceCellValue } from "@/features/scopes/utils/referenceCell";
import type { ContextItemValue } from "@/features/scopes/types";
import { displayValue } from "@ai-matrx/chat/agents/components/context-preview/inspector/ContextInspector";

jest.mock("@/features/scopes/service/scopesService", () => ({ scopesService: {} }));

const cell = (patch: Partial<ContextItemValue>): ContextItemValue =>
  ({
    context_item_id: "i",
    id: "v",
    version: 1,
    is_current: true,
    value_text: null,
    value_number: null,
    value_boolean: null,
    value_date: null,
    value_json: null,
    value_document_url: null,
    value_document_size_bytes: null,
    value_reference_id: null,
    value_reference_type: null,
    source_type: "user",
    authored_by: null,
    created_at: "2026-10-01T00:00:00Z",
    ...patch,
  }) as ContextItemValue;

const ID = "3f0e2d1c-4b5a-4968-8776-5a4b3c2d1e0f";
const fence = buildReferenceCellValue("scope", [{ id: ID, label: "Meridian" }] as never);

it("a reference cell reads as its summary, not the fence", () => {
  const shown = displayValue(cell({ value_text: fence }));
  expect(shown).toBe("Meridian");
  expect(shown).not.toContain("```");
});

it("two spellings of the same reference read the same", () => {
  const spaced =
    "```matrx\n" +
    JSON.stringify({ items: [{ label: "Meridian", id: ID }], __kind: "directive_v1_reference_scope" }, null, 4) +
    "\n```";
  expect(displayValue(cell({ value_text: spaced }))).toBe(displayValue(cell({ value_text: fence })));
});

it("plain values are unchanged", () => {
  expect(displayValue(cell({ value_text: "(619) 555-0177" }))).toBe("(619) 555-0177");
  expect(displayValue(cell({ value_boolean: false }))).toBe("No");
  expect(displayValue(null)).toBeNull();
});
