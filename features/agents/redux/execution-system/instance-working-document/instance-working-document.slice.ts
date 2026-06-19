/**
 * Instance Working Document Slice
 *
 * Per-conversation "working document" — a collaborative, mutable text artifact
 * the user and the agent build together. Generalises Scribe's session-bound
 * working document (`studio_documents`) into a reusable primitive that attaches
 * to ANY agent conversation by `conversationId`.
 *
 * - `enabled`  — whether the working document is active for this conversation.
 *                When on, the hook publishes a `working_document` entry into the
 *                `instanceContext` slice (the same mechanism Scribe uses).
 * - `content`  — the canonical document text. Source of truth shared by every
 *                mount (inline panel, settings popup, floating window).
 * - `binding`  — optional durable source. `{ kind: "none" }` = ephemeral
 *                (Redux-only, cleared with the instance). `{ kind: "note", id }`
 *                = two-way synced with a `public.notes` row (debounced push on
 *                user edits; pull on agent writeback).
 * - `saving`   — true while a bound-source persist is in flight.
 *
 * Like every `instance-*` slice it never writes back to agent source slices and
 * is cleaned up on `destroyInstance`.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { destroyInstance } from "../conversations/conversations.slice";

// =============================================================================
// Types
// =============================================================================

/**
 * Durable source the working document is bound to.
 *   - "none"               — ephemeral (Redux only).
 *   - "note"               — a `public.notes` row (a generic binding offered in
 *                            the UI).
 *   - "cx_working_document"— a `public.cx_working_documents` row: the durable,
 *                            conversation-scoped default backing for chat. The
 *                            agent's ctx_patch edits persist here and round-trip
 *                            back via Supabase realtime (the Scribe pattern,
 *                            applied to chat conversations).
 *   - "studio_document"    — a `studio_documents` row (Scribe's source; consumed
 *                            by the shared context-value builder so there is one
 *                            working_document value shape across the app).
 */
export type WorkingDocumentBindingKind =
  | "none"
  | "note"
  | "cx_working_document"
  | "studio_document";

export interface WorkingDocumentBinding {
  kind: WorkingDocumentBindingKind;
  /** Source row id (note / studio_document id). Null when unbound. */
  id: string | null;
  /** Display label of the bound source, latched at bind time. */
  label?: string | null;
}

export const NO_BINDING: WorkingDocumentBinding = { kind: "none", id: null };

export interface InstanceWorkingDocumentState {
  conversationId: string;
  enabled: boolean;
  content: string;
  title: string;
  binding: WorkingDocumentBinding;
  /** True while a bound-source (note) persist is in flight. */
  saving: boolean;
  lastError: string | null;
  /**
   * Monotonic counter bumped whenever the agent (stream) writes content, so
   * editors can distinguish agent-origin updates from user-origin ones.
   */
  agentRevision: number;
}

export interface InstanceWorkingDocumentSliceState {
  byConversationId: Record<string, InstanceWorkingDocumentState>;
}

const initialState: InstanceWorkingDocumentSliceState = {
  byConversationId: {},
};

// =============================================================================
// Helpers
// =============================================================================

function ensureEntry(
  state: InstanceWorkingDocumentSliceState,
  conversationId: string,
): InstanceWorkingDocumentState {
  let entry = state.byConversationId[conversationId];
  if (!entry) {
    entry = {
      conversationId,
      enabled: false,
      content: "",
      title: "Working document",
      binding: { ...NO_BINDING },
      saving: false,
      lastError: null,
      agentRevision: 0,
    };
    state.byConversationId[conversationId] = entry;
  }
  return entry;
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
      action: PayloadAction<{ conversationId: string; enabled: boolean }>,
    ) {
      const entry = ensureEntry(state, action.payload.conversationId);
      entry.enabled = action.payload.enabled;
    },

    /** User-driven content edit. */
    setWorkingDocContent(
      state,
      action: PayloadAction<{ conversationId: string; content: string }>,
    ) {
      const entry = ensureEntry(state, action.payload.conversationId);
      entry.content = action.payload.content;
    },

    /**
     * Agent-driven content update (resolved from a stream `context_changed`
     * event — typically by re-reading the bound note). Bumps `agentRevision`
     * so editors that aren't actively typing can merge it in.
     */
    applyAgentWorkingDocContent(
      state,
      action: PayloadAction<{ conversationId: string; content: string }>,
    ) {
      const entry = ensureEntry(state, action.payload.conversationId);
      // LOUD recovery (mirrors Scribe's BUG-B guard): never let a transient
      // EMPTY remote wipe non-empty content. An empty realtime echo on row
      // creation, or a bad agent cycle, would otherwise blank the document and
      // then persist the blank. If this fires, a real upstream bug produced an
      // empty remote — keep the user's content and scream.
      if (action.payload.content === "" && entry.content !== "") {
        console.warn(
          "[working-document] blocked an empty remote from wiping a non-empty working document (BUG-B guard fired)",
          { conversationId: action.payload.conversationId },
        );
        return;
      }
      entry.content = action.payload.content;
      entry.agentRevision += 1;
    },

    setWorkingDocTitle(
      state,
      action: PayloadAction<{ conversationId: string; title: string }>,
    ) {
      const entry = ensureEntry(state, action.payload.conversationId);
      entry.title = action.payload.title;
    },

    setWorkingDocBinding(
      state,
      action: PayloadAction<{
        conversationId: string;
        binding: WorkingDocumentBinding;
      }>,
    ) {
      const entry = ensureEntry(state, action.payload.conversationId);
      entry.binding = action.payload.binding;
      entry.lastError = null;
    },

    markWorkingDocSaving(
      state,
      action: PayloadAction<{ conversationId: string; saving: boolean }>,
    ) {
      const entry = ensureEntry(state, action.payload.conversationId);
      entry.saving = action.payload.saving;
      if (action.payload.saving) entry.lastError = null;
    },

    markWorkingDocError(
      state,
      action: PayloadAction<{ conversationId: string; error: string | null }>,
    ) {
      const entry = ensureEntry(state, action.payload.conversationId);
      entry.saving = false;
      entry.lastError = action.payload.error;
    },

    removeInstanceWorkingDocument(state, action: PayloadAction<string>) {
      delete state.byConversationId[action.payload];
    },
  },

  extraReducers: (builder) => {
    builder.addCase(destroyInstance, (state, action) => {
      delete state.byConversationId[action.payload];
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
