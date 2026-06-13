/**
 * Working-document agent-context builder.
 *
 * Generalises Scribe's `buildWorkingDocumentValue` (which is hard-wired to
 * `studio_documents`) into a reusable rich context-object value that any
 * conversation can publish into the `instanceContext` slice under the
 * `working_document` key.
 *
 * The backend treats a value as the rich form only when it is a dict with
 * `content` AND every key drawn from the allowed set
 * {content, mutable, persist, source, type, label, description,
 * max_inline_chars, summary_agent_id}. `mutable: true` makes the server expose
 * `ctx_patch`; `source` routes auto-persisted writes to the matching writeback
 * handler.
 *
 * Persistence strategy:
 *   - Bound to a durable source (note / studio_document) → `persist: "auto"` +
 *     `source: { kind, id, field }`. The backend writes that row directly on
 *     `ctx_patch`; the client reflects the change by re-reading the source (see
 *     process-stream handling).
 *   - Unbound → `persist: "client"`. The document is Redux-only and the client
 *     owns all durability; the server emits `context_changed` (without content)
 *     which the client treats as a non-fatal signal.
 *
 * This is the single working_document value shape across the app: Scribe's
 * `buildWorkingDocumentValue` delegates here with a `studio_document` binding.
 */

import type { WorkingDocumentBinding } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";

export const WORKING_DOCUMENT_CONTEXT_KEY = "working_document";

export const WORKING_DOCUMENT_LABEL = "Working Document";

const WORKING_DOCUMENT_DESCRIPTION =
  "The collaborative working document you build with the user. Read it with " +
  "ctx_get(working_document); apply every change with ctx_patch on " +
  "working_document. Never discard the user's content.";

export interface WorkingDocumentContextValue {
  content: string;
  mutable: true;
  persist: "auto" | "client";
  type: "text";
  label: string;
  description: string;
  source?: { kind: string; id: string; field: string };
  max_inline_chars: number;
}

/**
 * Build the rich `working_document` context value for the current content and
 * binding. Unbound docs are client-persisted; docs bound to a durable source
 * (note / studio_document) auto-persist to that row server-side.
 */
export function buildWorkingDocumentContextValue(
  content: string,
  binding: WorkingDocumentBinding,
): WorkingDocumentContextValue {
  const isBound = binding.kind !== "none" && !!binding.id;

  return {
    content,
    mutable: true,
    persist: isBound ? "auto" : "client",
    type: "text",
    label: WORKING_DOCUMENT_LABEL,
    description: WORKING_DOCUMENT_DESCRIPTION,
    ...(isBound
      ? {
          source: {
            kind: binding.kind,
            id: binding.id as string,
            field: "content",
          },
        }
      : {}),
    max_inline_chars: 0,
  };
}
