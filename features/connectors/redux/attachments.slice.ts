/**
 * What is attached to THIS conversation — the durable half of the two-kinds
 * split (`features/connectors/attachable-resources.ts`).
 *
 * Two states live here and they are not the same thing:
 *
 *   `rows`    — attachments the server has, read back from
 *               `GET /conversations/{id}/attachments`. These survive a reload
 *               because they are association edges, not browser state.
 *   `pending` — picks CARRIED IN from somewhere else (an agent switch copies
 *               the source chat's selections forward) that have not yet been
 *               written to this conversation.
 *
 * 🚨 `pending` is NOT a `/chat/new` holding pen any more. The server creates
 * the conversation row on the first write against the browser-minted id
 * (aidream 7e7ebf6da2), so a pick made on `/chat/new` is POSTed the moment it
 * is made and comes back as a real row. Holding it would mean showing a chip
 * for something the server has never heard of — the optimistic lie a reload
 * exposes. The only picks that wait are the inherited ones, and they are
 * flushed the instant the read of this conversation succeeds.
 *
 * 🚨 A FAILED READ IS NEVER AN EMPTY LIST. `status: "failed"` + `error` is a
 * distinct state from "nothing attached", and the surfaces render it as such.
 * Collapsing them is the lie that a green checkmark told over a dead MCP
 * connection (Arman, 2026-09-13).
 */

import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";
import {
  attachmentKey,
  type ConversationAttachment,
  type PendingAttachment,
} from "@/features/connectors/attachable-resources";
import {
  attachConversationResource,
  detachConversationResource,
  fetchConversationAttachments,
} from "@/features/connectors/attachments.service";

export type AttachmentsStatus = "idle" | "loading" | "succeeded" | "failed";

export interface ConversationAttachmentsEntry {
  rows: ConversationAttachment[];
  pending: PendingAttachment[];
  status: AttachmentsStatus;
  error: string | null;
  /** Attachment keys with a write in flight — per-row busy, never a page spinner. */
  busyKeys: string[];
  /** The last write that failed, with the server's own sentence. */
  writeError: string | null;
  /** Keys inherited during an agent switch, retained as removal tombstones. */
  handoffInheritedKeys: string[];
  /** Inherited picks explicitly removed on this destination. */
  handoffRemovedKeys: string[];
}

interface AttachmentsSliceState {
  byConversationId: Record<string, ConversationAttachmentsEntry>;
}

const initialState: AttachmentsSliceState = { byConversationId: {} };

/**
 * The stable "nothing known yet" entry. Exported because every consumer must
 * coalesce to the SAME object — a fresh `{}` per render would re-run every
 * effect downstream of it forever.
 */
export const EMPTY_ATTACHMENTS_ENTRY: ConversationAttachmentsEntry = {
  rows: [],
  pending: [],
  status: "idle",
  error: null,
  busyKeys: [],
  writeError: null,
  handoffInheritedKeys: [],
  handoffRemovedKeys: [],
};

function entryFor(
  state: AttachmentsSliceState,
  conversationId: string,
): ConversationAttachmentsEntry {
  const existing = state.byConversationId[conversationId];
  if (existing) return existing;
  const created: ConversationAttachmentsEntry = {
    ...EMPTY_ATTACHMENTS_ENTRY,
    rows: [],
    pending: [],
    busyKeys: [],
    handoffInheritedKeys: [],
    handoffRemovedKeys: [],
  };
  state.byConversationId[conversationId] = created;
  return created;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ── Thunks ────────────────────────────────────────────────────────────────

export const loadConversationAttachments = createAsyncThunk(
  "conversationAttachments/load",
  async ({ conversationId }: { conversationId: string }) => ({
    conversationId,
    rows: await fetchConversationAttachments(conversationId),
  }),
);

/**
 * Attach one pick — ALWAYS a real request, including on `/chat/new`.
 *
 * The server creates the conversation row on first write against the minted id
 * (aidream 7e7ebf6da2), so there is no window in which a pick has nothing to
 * POST to. The old `conversationExists` hold existed only because that POST
 * used to 404; keeping it after the 404 was gone would mean the chip showed a
 * pick the server had never heard of — an optimistic lie that a reload erases.
 *
 * What comes back is the server's own row, so the chip and the picker state
 * are the server's answer, never the browser's hope.
 */
export const attachResource = createAsyncThunk(
  "conversationAttachments/attach",
  async ({
    conversationId,
    pick,
  }: {
    conversationId: string;
    pick: PendingAttachment;
  }) => {
    const row = await attachConversationResource(conversationId, pick);
    return { conversationId, pick, row };
  },
);

/**
 * Send every held pick to a conversation that now exists.
 *
 * Partial success is the normal case worth designing for: four picks, one
 * provider revoked in between. Each pick is settled on its own, landed ones
 * clear, and the ones that failed stay pending WITH the reason, so nothing
 * disappears quietly.
 */
export const flushPendingAttachments = createAsyncThunk(
  "conversationAttachments/flushPending",
  async ({ conversationId }: { conversationId: string }, { getState }) => {
    const state = getState() as {
      conversationAttachments: AttachmentsSliceState;
    };
    const pending =
      state.conversationAttachments.byConversationId[conversationId]?.pending ??
      [];
    const landed: ConversationAttachment[] = [];
    const failed: { pick: PendingAttachment; error: string }[] = [];
    for (const pick of pending) {
      try {
        landed.push(await attachConversationResource(conversationId, pick));
      } catch (error) {
        failed.push({ pick, error: messageOf(error) });
      }
    }
    return { conversationId, landed, failed };
  },
);

/** Remove a landed attachment. A pending pick is dropped by `dropPendingAttachment`. */
export const detachResource = createAsyncThunk(
  "conversationAttachments/detach",
  async ({
    conversationId,
    associationId,
  }: {
    conversationId: string;
    associationId: string;
  }) => {
    await detachConversationResource(conversationId, associationId);
    return { conversationId, associationId };
  },
);

// ── Slice ─────────────────────────────────────────────────────────────────

const attachmentsSlice = createSlice({
  name: "conversationAttachments",
  initialState,
  reducers: {
    /** Remove a pick that never reached the server. */
    dropPendingAttachment(
      state,
      action: PayloadAction<{ conversationId: string; key: string }>,
    ) {
      const entry = entryFor(state, action.payload.conversationId);
      entry.pending = entry.pending.filter(
        (pick) => attachmentKey(pick) !== action.payload.key,
      );
      if (
        entry.handoffInheritedKeys.includes(action.payload.key) &&
        !entry.handoffRemovedKeys.includes(action.payload.key)
      ) {
        entry.handoffRemovedKeys.push(action.payload.key);
      }
    },
    /** Clear a write failure the user has read. */
    clearAttachmentWriteError(
      state,
      action: PayloadAction<{ conversationId: string }>,
    ) {
      entryFor(state, action.payload.conversationId).writeError = null;
    },
    /** Copy selections as pending: association ids belong to the old chat. */
    mergePendingAttachments(
      state,
      action: PayloadAction<{
        conversationId: string;
        picks: PendingAttachment[];
      }>,
    ) {
      const entry = entryFor(state, action.payload.conversationId);
      for (const pick of action.payload.picks) {
        const key = attachmentKey(pick);
        if (!entry.handoffInheritedKeys.includes(key)) {
          entry.handoffInheritedKeys.push(key);
        }
        if (
          !entry.pending.some(
            (candidate) => attachmentKey(candidate) === attachmentKey(pick),
          ) &&
          !entry.rows.some(
            (candidate) => attachmentKey(candidate) === attachmentKey(pick),
          )
        ) {
          entry.pending.push(pick);
        }
      }
    },
    /** Reconcile only inherited pending picks; destination-local picks stay. */
    syncHandoffPendingAttachments(
      state,
      action: PayloadAction<{
        conversationId: string;
        picks: PendingAttachment[];
      }>,
    ) {
      const entry = entryFor(state, action.payload.conversationId);
      const nextByKey = new Map(
        action.payload.picks
          .filter(
            (pick) => !entry.handoffRemovedKeys.includes(attachmentKey(pick)),
          )
          .map((pick) => [attachmentKey(pick), pick]),
      );
      const inherited = new Set(entry.handoffInheritedKeys);
      entry.pending = entry.pending.filter((pick) => {
        const key = attachmentKey(pick);
        return !inherited.has(key) || nextByKey.has(key);
      });
      for (const [key, pick] of nextByKey) {
        if (
          !entry.pending.some(
            (candidate) => attachmentKey(candidate) === key,
          ) &&
          !entry.rows.some((candidate) => attachmentKey(candidate) === key)
        ) {
          entry.pending.push(pick);
        }
      }
      entry.handoffInheritedKeys = Array.from(nextByKey.keys());
    },
    /** Forget a conversation entirely (instance destroyed). */
    forgetConversationAttachments(state, action: PayloadAction<string>) {
      delete state.byConversationId[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadConversationAttachments.pending, (state, action) => {
        const entry = entryFor(state, action.meta.arg.conversationId);
        entry.status = "loading";
        entry.error = null;
      })
      .addCase(loadConversationAttachments.fulfilled, (state, action) => {
        const entry = entryFor(state, action.payload.conversationId);
        entry.rows = action.payload.rows;
        entry.status = "succeeded";
        entry.error = null;
        // A pick that landed while we were not looking stops being pending.
        const landed = new Set(
          action.payload.rows.map((row) => attachmentKey(row)),
        );
        entry.pending = entry.pending.filter(
          (pick) => !landed.has(attachmentKey(pick)),
        );
      })
      .addCase(loadConversationAttachments.rejected, (state, action) => {
        const entry = entryFor(state, action.meta.arg.conversationId);
        entry.status = "failed";
        entry.error =
          action.error.message ?? "Could not read this chat's attachments.";
      })

      .addCase(attachResource.pending, (state, action) => {
        const entry = entryFor(state, action.meta.arg.conversationId);
        const key = attachmentKey(action.meta.arg.pick);
        if (!entry.busyKeys.includes(key)) entry.busyKeys.push(key);
        entry.writeError = null;
      })
      .addCase(attachResource.fulfilled, (state, action) => {
        const entry = entryFor(state, action.payload.conversationId);
        const key = attachmentKey(action.payload.pick);
        entry.busyKeys = entry.busyKeys.filter((busy) => busy !== key);
        // The server's row replaces anything held under the same key: a pick
        // inherited from an agent switch stops being pending the instant the
        // real edge exists.
        const row = action.payload.row;
        const existing = entry.rows.findIndex(
          (candidate) => attachmentKey(candidate) === attachmentKey(row),
        );
        if (existing >= 0) entry.rows[existing] = row;
        else entry.rows.push(row);
        entry.pending = entry.pending.filter(
          (pick) => attachmentKey(pick) !== key,
        );
      })
      .addCase(attachResource.rejected, (state, action) => {
        const entry = entryFor(state, action.meta.arg.conversationId);
        const key = attachmentKey(action.meta.arg.pick);
        entry.busyKeys = entry.busyKeys.filter((busy) => busy !== key);
        entry.writeError =
          action.error.message ??
          `${action.meta.arg.pick.display_name} could not be attached.`;
      })

      .addCase(flushPendingAttachments.fulfilled, (state, action) => {
        const entry = entryFor(state, action.payload.conversationId);
        for (const row of action.payload.landed) {
          const key = attachmentKey(row);
          if (
            !entry.rows.some((candidate) => attachmentKey(candidate) === key)
          ) {
            entry.rows.push(row);
          }
        }
        const stillPending = new Set(
          action.payload.failed.map(({ pick }) => attachmentKey(pick)),
        );
        entry.pending = entry.pending.filter((pick) =>
          stillPending.has(attachmentKey(pick)),
        );
        entry.writeError =
          action.payload.failed.length > 0
            ? `${action.payload.failed.length} attachment${action.payload.failed.length === 1 ? "" : "s"} could not be carried over: ${action.payload.failed[0].error}`
            : null;
      })
      .addCase(flushPendingAttachments.rejected, (state, action) => {
        const entry = entryFor(state, action.meta.arg.conversationId);
        entry.writeError =
          action.error.message ??
          "The attachments you picked before this chat existed could not be carried over.";
      })

      .addCase(detachResource.pending, (state, action) => {
        const entry = entryFor(state, action.meta.arg.conversationId);
        const row = entry.rows.find(
          (candidate) =>
            candidate.association_id === action.meta.arg.associationId,
        );
        if (row && !entry.busyKeys.includes(attachmentKey(row))) {
          entry.busyKeys.push(attachmentKey(row));
        }
        entry.writeError = null;
      })
      .addCase(detachResource.fulfilled, (state, action) => {
        const entry = entryFor(state, action.payload.conversationId);
        const row = entry.rows.find(
          (candidate) =>
            candidate.association_id === action.payload.associationId,
        );
        entry.rows = entry.rows.filter(
          (candidate) =>
            candidate.association_id !== action.payload.associationId,
        );
        if (row) {
          entry.busyKeys = entry.busyKeys.filter(
            (busy) => busy !== attachmentKey(row),
          );
        }
      })
      .addCase(detachResource.rejected, (state, action) => {
        const entry = entryFor(state, action.meta.arg.conversationId);
        const row = entry.rows.find(
          (candidate) =>
            candidate.association_id === action.meta.arg.associationId,
        );
        if (row) {
          entry.busyKeys = entry.busyKeys.filter(
            (busy) => busy !== attachmentKey(row),
          );
        }
        entry.writeError =
          action.error.message ?? "That attachment could not be removed.";
      });
  },
});

export const {
  dropPendingAttachment,
  clearAttachmentWriteError,
  mergePendingAttachments,
  syncHandoffPendingAttachments,
  forgetConversationAttachments,
} = attachmentsSlice.actions;

export default attachmentsSlice.reducer;

// ── Selectors ─────────────────────────────────────────────────────────────

interface StateWithAttachments {
  conversationAttachments: AttachmentsSliceState;
}

export const selectConversationAttachmentsEntry =
  (conversationId: string) =>
  (state: StateWithAttachments): ConversationAttachmentsEntry =>
    state.conversationAttachments.byConversationId[conversationId] ??
    EMPTY_ATTACHMENTS_ENTRY;
