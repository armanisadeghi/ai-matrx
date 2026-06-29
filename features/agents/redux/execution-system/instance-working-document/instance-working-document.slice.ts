/**
 * Instance Working Document Slice
 *
 * Per-conversation editable text artifacts. TWO kinds share this slice:
 *   - "working" — the collaborative doc the user AND agent build together
 *                 (agent reads + writes via ctx_patch).
 *   - "scratch" — the user's private scratchpad (agent reads, never writes).
 *
 * Entries are keyed by `(conversationId, kind)` via `workingDocKey`. The
 * "working" kind keys on the bare `conversationId` (backward compatible);
 * other kinds suffix the key. Everything (selectors, actions) takes an
 * optional `kind` that defaults to "working", so existing call sites are
 * unchanged.
 *
 * - `enabled`  — whether this document is active for the conversation. OPT-IN:
 *                defaults OFF; the durable on/off lives in the
 *                `cx_conversation_documents` junction and is restored on mount
 *                by `hydrateConversationDocumentsThunk`.
 * - `content`  — canonical document text shared by every mount.
 * - `binding`  — durable source. `{ kind: "none" }` = ephemeral;
 *                `{ kind: "cx_working_document", id }` = a row in
 *                `cx_working_documents` (the chat default); `{ kind: "note" }`
 *                = a `workbench.notes` row (working kind only); `studio_document`
 *                = Scribe's source (shared context-value builder).
 * - `saving`   — true while a bound-source persist is in flight.
 *
 * Like every `instance-*` slice it never writes back to agent source slices and
 * is cleaned up on `destroyInstance`.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { v5 as uuidv5 } from "uuid";
import { destroyInstance } from "../conversations/conversations.slice";
import type { WorkingDocumentKind } from "./cx-working-document.service";

// Fixed namespace for deterministic working-document ids (generated once).
const WORKING_DOC_ID_NAMESPACE = "6f3b2e9a-1c4d-4f8a-9b2e-7d5c1a0f3e8b";

/**
 * The DETERMINISTIC reserved id for a conversation's primary document of a kind.
 *
 * The id is derived from `(conversationId, kind)` — NOT random — so every tab,
 * window, and session agrees on the same id BEFORE the row exists. That makes
 * materialize-on-write idempotent across clients: two tabs that both start
 * typing reserve the SAME id and the upsert collapses to ONE row (no duplicate /
 * orphan docs), and hydrate can recognise the conversation's own (born-here)
 * document. Attached documents from OTHER conversations keep their own ids.
 */
export function reservedWorkingDocumentId(
  conversationId: string,
  kind: WorkingDocumentKind = "working",
): string {
  return uuidv5(`${conversationId}:${kind}`, WORKING_DOC_ID_NAMESPACE);
}

// =============================================================================
// Types
// =============================================================================

export type { WorkingDocumentKind };

export const DEFAULT_DOC_KIND: WorkingDocumentKind = "working";

/**
 * Map a (conversationId, kind) to the slice key. "working" keeps the bare
 * conversationId (backward compatible with every existing call site); other
 * kinds suffix it.
 */
export function workingDocKey(
  conversationId: string,
  kind: WorkingDocumentKind = DEFAULT_DOC_KIND,
): string {
  return kind === "working" ? conversationId : `${conversationId}::${kind}`;
}

/**
 * Durable source the document is bound to.
 *   - "none"               — ephemeral (Redux only).
 *   - "note"               — a `workbench.notes` row (working kind only).
 *   - "cx_working_document"— a `public.cx_working_documents` row: the durable,
 *                            conversation-scoped default backing. The agent's
 *                            ctx_patch edits persist here (working kind) and
 *                            round-trip back via Supabase realtime.
 *   - "studio_document"    — a `studio_documents` row (Scribe's source).
 */
export type WorkingDocumentBindingKind =
  | "none"
  | "note"
  | "cx_working_document"
  | "studio_document";

export interface WorkingDocumentBinding {
  kind: WorkingDocumentBindingKind;
  /** Source row id (document / note id). Null when unbound. */
  id: string | null;
  /** Display label of the bound source, latched at bind time. */
  label?: string | null;
}

export const NO_BINDING: WorkingDocumentBinding = { kind: "none", id: null };

export interface InstanceWorkingDocumentState {
  conversationId: string;
  kind: WorkingDocumentKind;
  enabled: boolean;
  content: string;
  title: string;
  binding: WorkingDocumentBinding;
  /** True while a bound-source persist is in flight. */
  saving: boolean;
  lastError: string | null;
  /**
   * Monotonic counter bumped whenever the agent (stream) writes content, so
   * editors can distinguish agent-origin updates from user-origin ones.
   */
  agentRevision: number;
  /**
   * MATERIALIZE-ON-WRITE: when a working document is enabled it gets a RESERVED
   * id (`binding.id`) but NO durable row — the row is created on the first byte
   * of content from either party. `materialized` is false while reserved-but-
   * absent, true once the row exists. The association edge + auto-title persist
   * only on the materialize transition, so an enabled-but-untouched doc never
   * creates a record.
   */
  materialized: boolean;
  /**
   * The durable row's `version` the local content is based on — the optimistic-
   * concurrency token sent to the agent (`source.base_version`). A server-side
   * mismatch (a concurrent user edit) surfaces as a `context_conflict`.
   */
  version: number;
  /**
   * Set when the user's save was REFUSED because a concurrent edit (typically the
   * agent this turn) advanced the row. Holds the other party's version so the UI
   * can diff it against the user's preserved draft and let them reconcile. While
   * set, the user's draft is kept (never silently clobbered) and auto-save is
   * blocked until resolved. Both versions also live in `history.row_versions`.
   */
  conflict: { agentVersion: number; agentContent: string } | null;
}

export interface InstanceWorkingDocumentSliceState {
  byKey: Record<string, InstanceWorkingDocumentState>;
}

const initialState: InstanceWorkingDocumentSliceState = {
  byKey: {},
};

// =============================================================================
// Helpers
// =============================================================================

interface KeyedPayload {
  conversationId: string;
  kind?: WorkingDocumentKind;
}

function ensureEntry(
  state: InstanceWorkingDocumentSliceState,
  conversationId: string,
  kind: WorkingDocumentKind = DEFAULT_DOC_KIND,
): InstanceWorkingDocumentState {
  const key = workingDocKey(conversationId, kind);
  let entry = state.byKey[key];
  if (!entry) {
    entry = {
      conversationId,
      kind,
      // OPT-IN: documents start OFF. The persisted on/off lives in the
      // cx_conversation_documents junction and is restored on mount.
      enabled: false,
      content: "",
      // Unnamed by default; the user is encouraged to name it. Never persist a
      // placeholder as the real title.
      title: "",
      binding: { ...NO_BINDING },
      saving: false,
      lastError: null,
      agentRevision: 0,
      materialized: false,
      version: 0,
      conflict: null,
    };
    state.byKey[key] = entry;
  }
  return entry;
}

/** Delete every entry (all kinds) belonging to a conversation. */
function deleteConversation(
  state: InstanceWorkingDocumentSliceState,
  conversationId: string,
): void {
  for (const key of Object.keys(state.byKey)) {
    if (state.byKey[key]?.conversationId === conversationId) {
      delete state.byKey[key];
    }
  }
}

// =============================================================================
// Slice
// =============================================================================

const instanceWorkingDocumentSlice = createSlice({
  name: "instanceWorkingDocument",
  initialState,
  reducers: {
    setWorkingDocEnabled(
      state,
      action: PayloadAction<KeyedPayload & { enabled: boolean }>,
    ) {
      const entry = ensureEntry(
        state,
        action.payload.conversationId,
        action.payload.kind,
      );
      entry.enabled = action.payload.enabled;
    },

    /** User-driven content edit. */
    setWorkingDocContent(
      state,
      action: PayloadAction<KeyedPayload & { content: string }>,
    ) {
      const entry = ensureEntry(
        state,
        action.payload.conversationId,
        action.payload.kind,
      );
      entry.content = action.payload.content;
    },

    /**
     * Agent-driven content update (resolved from a stream `context_changed`
     * event — typically by re-reading the bound source). Bumps `agentRevision`
     * so editors that aren't actively typing can merge it in.
     */
    applyAgentWorkingDocContent(
      state,
      action: PayloadAction<KeyedPayload & { content: string }>,
    ) {
      const entry = ensureEntry(
        state,
        action.payload.conversationId,
        action.payload.kind,
      );
      // LOUD recovery (mirrors Scribe's BUG-B guard): never let a transient
      // EMPTY remote wipe non-empty content. An empty realtime echo on row
      // creation, or a bad agent cycle, would otherwise blank the document and
      // then persist the blank. If this fires, a real upstream bug produced an
      // empty remote — keep the user's content and scream.
      if (action.payload.content === "" && entry.content !== "") {
        console.warn(
          "[working-document] blocked an empty remote from wiping a non-empty document (BUG-B guard fired)",
          {
            conversationId: action.payload.conversationId,
            kind: entry.kind,
          },
        );
        return;
      }
      entry.content = action.payload.content;
      entry.agentRevision += 1;
    },

    setWorkingDocTitle(
      state,
      action: PayloadAction<KeyedPayload & { title: string }>,
    ) {
      const entry = ensureEntry(
        state,
        action.payload.conversationId,
        action.payload.kind,
      );
      entry.title = action.payload.title;
    },

    setWorkingDocBinding(
      state,
      action: PayloadAction<KeyedPayload & { binding: WorkingDocumentBinding }>,
    ) {
      const entry = ensureEntry(
        state,
        action.payload.conversationId,
        action.payload.kind,
      );
      entry.binding = action.payload.binding;
      entry.lastError = null;
      // Unbinding (kind "none") clears the materialize state: a later re-enable
      // reserves a fresh id and starts unmaterialized again. Binding TO a source
      // (note/cx/studio) does not flip `materialized` here — the thunk that knows
      // whether the row exists sets it via markWorkingDocMaterialized.
      if (action.payload.binding.kind === "none") {
        entry.materialized = false;
        entry.version = 0;
      }
    },

    /**
     * Mark the durable row as existing (the materialize-on-write transition) and
     * latch its current `version`. Dispatched after a row is created or resolved
     * — by the FE on the user's first edit, or on a `context_persisted`
     * (materialized) event when the agent wrote first.
     */
    markWorkingDocMaterialized(
      state,
      action: PayloadAction<KeyedPayload & { version?: number }>,
    ) {
      const entry = ensureEntry(
        state,
        action.payload.conversationId,
        action.payload.kind,
      );
      entry.materialized = true;
      if (typeof action.payload.version === "number") {
        entry.version = action.payload.version;
      }
    },

    /** Latch the row `version` (the optimistic-concurrency base) from a read/echo. */
    setWorkingDocVersion(
      state,
      action: PayloadAction<KeyedPayload & { version: number }>,
    ) {
      const entry = ensureEntry(
        state,
        action.payload.conversationId,
        action.payload.kind,
      );
      entry.version = action.payload.version;
    },

    /**
     * The user's save was refused by a concurrent edit. Record the other party's
     * version so the UI can diff + reconcile. Does NOT touch content/draft — the
     * user's text is preserved as-is until they resolve.
     */
    markWorkingDocConflict(
      state,
      action: PayloadAction<
        KeyedPayload & { agentVersion: number; agentContent: string }
      >,
    ) {
      const entry = ensureEntry(
        state,
        action.payload.conversationId,
        action.payload.kind,
      );
      entry.conflict = {
        agentVersion: action.payload.agentVersion,
        agentContent: action.payload.agentContent,
      };
      entry.saving = false;
    },

    /** Clear the conflict (after the user reconciled). */
    clearWorkingDocConflict(state, action: PayloadAction<KeyedPayload>) {
      const entry = ensureEntry(
        state,
        action.payload.conversationId,
        action.payload.kind,
      );
      entry.conflict = null;
    },

    markWorkingDocSaving(
      state,
      action: PayloadAction<KeyedPayload & { saving: boolean }>,
    ) {
      const entry = ensureEntry(
        state,
        action.payload.conversationId,
        action.payload.kind,
      );
      entry.saving = action.payload.saving;
      if (action.payload.saving) entry.lastError = null;
    },

    markWorkingDocError(
      state,
      action: PayloadAction<KeyedPayload & { error: string | null }>,
    ) {
      const entry = ensureEntry(
        state,
        action.payload.conversationId,
        action.payload.kind,
      );
      entry.saving = false;
      entry.lastError = action.payload.error;
    },

    /** Remove all documents (every kind) for a conversation. */
    removeInstanceWorkingDocument(state, action: PayloadAction<string>) {
      deleteConversation(state, action.payload);
    },
  },

  extraReducers: (builder) => {
    builder.addCase(destroyInstance, (state, action) => {
      deleteConversation(state, action.payload);
    });
  },
});

export const {
  setWorkingDocEnabled,
  setWorkingDocContent,
  applyAgentWorkingDocContent,
  setWorkingDocTitle,
  setWorkingDocBinding,
  markWorkingDocMaterialized,
  setWorkingDocVersion,
  markWorkingDocConflict,
  clearWorkingDocConflict,
  markWorkingDocSaving,
  markWorkingDocError,
  removeInstanceWorkingDocument,
} = instanceWorkingDocumentSlice.actions;

export default instanceWorkingDocumentSlice.reducer;
