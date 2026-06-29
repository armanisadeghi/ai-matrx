/**
 * Working-document agent-context builder.
 *
 * Builds the rich context-object value any conversation publishes into the
 * `instanceContext` slice under the `working_document` (mutable, agent-editable)
 * or `user_scratchpad` (read-only) key.
 *
 * The backend treats a value as the rich form when it is a dict with `content`
 * AND every key drawn from {content, mutable, persist, source, type, label,
 * description, max_inline_chars, summary_agent_id}. `mutable: true` exposes
 * `ctx_patch`; `source` routes auto-persisted writes to the matching writeback
 * handler.
 *
 * PERSISTENCE — the load-bearing invariant: an agent-editable working document is
 * ALWAYS `persist: "auto"`. `persist: "client"` is BANNED for it — that was the
 * data-loss bug (an unbound doc was offered as editable, the agent's edit was
 * the client's job to save, and the client dropped it). The doc always carries a
 * durable `source`, even before its row exists:
 *   - bound to a note / studio_document → write that existing row.
 *   - the conversation's working document → `source.kind = "working_document"`
 *     with the RESERVED id + a `materialize` spec. The server's writeback UPSERTs
 *     (materialize-on-write): the row is created on the agent's first write and
 *     the new id reported back. `base_version` is the optimistic-concurrency token.
 *
 * The scratchpad is `mutable: false` (the agent never writes it), so it has no
 * writeback and `persist: "client"` is harmless there — the client owns the
 * user's edits and materializes the scratch row itself on first edit.
 */

import type {
  WorkingDocumentBinding,
  WorkingDocumentKind,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";

export const WORKING_DOCUMENT_CONTEXT_KEY = "working_document";

export const WORKING_DOCUMENT_LABEL = "Working Document";

const WORKING_DOCUMENT_DESCRIPTION =
  "The collaborative working document you build with the user. Read it with " +
  "ctx_get(working_document); apply every change with ctx_patch on " +
  "working_document. Never discard the user's content.";

// The user's private scratchpad. The agent may READ it for context but must
// NEVER write it — the value is published `mutable: false` with no writeback
// `source`, so the backend exposes `ctx_get` only (no `ctx_patch`).
export const USER_SCRATCHPAD_CONTEXT_KEY = "user_scratchpad";

export const USER_SCRATCHPAD_LABEL = "My Scratchpad";

const USER_SCRATCHPAD_DESCRIPTION =
  "The user's private scratchpad. READ-ONLY: you may read it with " +
  "ctx_get(user_scratchpad) to understand what the user is thinking about, " +
  "but you must NEVER modify it. It belongs to the user alone.";

/** The create-if-missing spec the server uses for materialize-on-write. */
export interface WorkingDocumentMaterializeSpec {
  organization_id: string | null;
  conversation_id: string;
  kind: WorkingDocumentKind;
  title: string;
}

export interface WorkingDocumentSource {
  kind: string;
  id: string;
  field: string;
  /** Optimistic-concurrency base (the row version the content is based on). */
  base_version?: number;
  /** Present for a deferred-existence (reserved-id) working_document source. */
  materialize?: WorkingDocumentMaterializeSpec;
}

export interface WorkingDocumentContextValue {
  content: string;
  mutable: boolean;
  persist: "auto" | "client";
  type: "text";
  label: string;
  description: string;
  source?: WorkingDocumentSource;
  max_inline_chars: number;
}

/** Map the FE binding kind to the server writeback handler key (source.kind). */
function sourceKindFor(binding: WorkingDocumentBinding): string {
  switch (binding.kind) {
    case "cx_working_document":
      return "working_document";
    case "note":
      return "note";
    case "studio_document":
      return "studio_document";
    default:
      return "working_document";
  }
}

export interface BuildWorkingDocumentArgs {
  content: string;
  binding: WorkingDocumentBinding;
  /** The conversation this doc is published into (materialize provenance). */
  conversationId: string;
  /** Owner org for materialize-on-write (the conversation's org). */
  organizationId: string | null;
  /** working | scratch — the document kind (for materialize). */
  docKind: WorkingDocumentKind;
  /** Current title (so the agent-first materialize seeds a sensible name). */
  title: string;
  /** Row version the content is based on (conflict base). */
  version: number;
}

/**
 * Build the rich `working_document` context value. ALWAYS `persist: "auto"` with
 * a durable `source`. For the conversation's own document the source carries the
 * reserved id + a `materialize` spec, so the agent can edit it before its row
 * exists and the server creates the row on first write.
 *
 * Safety net: if no durable id is available (should never happen for an enabled
 * doc — enabling reserves an id), publish `mutable: false` so the agent can read
 * but can never make an edit that has nowhere to land.
 */
export function buildWorkingDocumentContextValue(
  args: BuildWorkingDocumentArgs,
): WorkingDocumentContextValue {
  const { content, binding, conversationId, organizationId, docKind, title, version } =
    args;
  const id = binding.id;

  if (!id) {
    // No durable home → read-only. Editing here would be lost; never offer it.
    return {
      content,
      mutable: false,
      persist: "client",
      type: "text",
      label: WORKING_DOCUMENT_LABEL,
      description: WORKING_DOCUMENT_DESCRIPTION,
      max_inline_chars: 0,
    };
  }

  const kind = sourceKindFor(binding);
  const source: WorkingDocumentSource = {
    kind,
    id,
    field: "content",
    base_version: version,
  };
  // Only the conversation's own working document materializes on write; a doc
  // bound to an existing note/studio_document row already exists.
  if (kind === "working_document") {
    source.materialize = {
      organization_id: organizationId,
      conversation_id: conversationId,
      kind: docKind,
      title,
    };
  }

  return {
    content,
    mutable: true,
    persist: "auto",
    type: "text",
    label: WORKING_DOCUMENT_LABEL,
    description: WORKING_DOCUMENT_DESCRIPTION,
    source,
    max_inline_chars: 0,
  };
}

/**
 * Build the READ-ONLY `user_scratchpad` context value. The agent receives the
 * content for context but gets no `ctx_patch` (mutable:false) and no writeback
 * `source` — it can never modify the user's scratchpad. Durability of the user's
 * own edits is handled client-side (the FE materializes the scratch row).
 */
export function buildUserScratchpadContextValue(
  content: string,
): WorkingDocumentContextValue {
  return {
    content,
    mutable: false,
    persist: "client",
    type: "text",
    label: USER_SCRATCHPAD_LABEL,
    description: USER_SCRATCHPAD_DESCRIPTION,
    max_inline_chars: 0,
  };
}
