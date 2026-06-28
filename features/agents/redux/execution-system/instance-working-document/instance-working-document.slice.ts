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
import { destroyInstance } from "../conversations/conversations.slice";
import type { WorkingDocumentKind } from "./cx-working-document.service";

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
  markWorkingDocSaving,
  markWorkingDocError,
  removeInstanceWorkingDocument,
} = instanceWorkingDocumentSlice.actions;

export default instanceWorkingDocumentSlice.reducer;
