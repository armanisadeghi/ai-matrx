import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { resultAsObject, getArg } from "../_shared";

/**
 * Parse the `document` tool result.
 *
 * The backend (`aidream/services/udt_content/tools.py`) emits THREE different
 * shapes, and reading only one of them is how a real call rendered as nothing
 * at all on production (2026-09-14):
 *
 *   create → `{ action, document: { id, document_name, … }, created, saved? }`
 *            — no `document_id`, no `name`, no `text` at the top level.
 *   read   → `{ action, document_id, name, text, … }`
 *   edit   → `{ action, document_id, applied: [...], saved }` — no name, no text.
 *
 * So identity is read from every place it can appear, and the two actions that
 * never echo content expose what they DID (`appliedOps`) and what the caller
 * sent (`submittedText`), so the card can be honest instead of empty.
 */
export interface ParsedDocument {
  id: string | null;
  title: string | null;
  /** The document body, when the result carried it (read). */
  text: string | null;
  action: string | null;
  /** Content the CALLER sent (create's `markdown`) when the result echoed none. */
  submittedText: string | null;
  /** How many edit ops the backend reported applying (edit). */
  appliedOps: number | null;
}

const asStr = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

const asObj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

export function parseDocument(entry: ToolLifecycleEntry): ParsedDocument {
  const r = resultAsObject(entry) ?? {};
  // `create` nests the whole row under `document` — the shape this parser used
  // to miss entirely, leaving the card with no id, no title and no text.
  const doc = asObj(r.document) ?? {};
  const applied = Array.isArray(r.applied) ? r.applied.length : null;
  const text = asStr(r.text);

  return {
    id:
      asStr(r.document_id) ??
      asStr(r.id) ??
      asStr(doc.id) ??
      asStr(getArg<string>(entry, "id")),
    // `name` is the user-facing document name; `title` is the inner heading.
    title:
      asStr(r.name) ??
      asStr(r.title) ??
      asStr(doc.document_name) ??
      asStr(doc.name) ??
      asStr(getArg<string>(entry, "name")),
    text,
    action: asStr(r.action) ?? asStr(getArg<string>(entry, "action")),
    submittedText: text ? null : asStr(getArg<string>(entry, "markdown")),
    appliedOps: applied,
  };
}
