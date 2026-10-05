// features/block-state/remarkDurability.ts
//
// How an UNSENT chip that has no block of its own (a comment, an edit, a choice,
// a kind action's interaction) is kept server-side — through the same table and
// doors as every other block state (platform.block_states, kind `remark`,
// block key `remark:<chip key>`). The chip is "due" by the same rule as an
// answers chip (state_version > sent_version, not dismissed), carries
// `block_state_ref` on the wire so the server marks it sent with the message,
// and comes back on any device when the composer mounts.
//
// Scope note: a chip is found again through the conversation it was STAGED INTO
// that is also the conversation of the answer it is about. A chip staged into a
// different, brand-new conversation ("New chat about this") has no persisted
// conversation to hang off yet and is not covered.

import type { AppDispatch, AppStore, RootState } from "@/lib/redux/store";
import { toast } from "@/lib/toast";
import { durableRecordId } from "@ai-matrx/kit/ids";
import {
  attachRemarkRef,
  readStoredRemarks,
  registerRemarkDurability,
  remarkSourceOf,
  restageRemarks,
  type RemarkDurability,
  type RemarkItem,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks";
import type { ChatRootState } from "@ai-matrx/chat/store/root-state";
import { BlockStateWriteError, dismissBlockStateChip, setBlockState } from "./blockStateService";
import { selectAllBlockStateRows, upsertBlockStateRows } from "./redux/blockStatesSlice";
import { ensureBlockStatesLoaded, unitRefOf } from "./redux/blockStateThunks";
import { BLOCK_STATE_DEBOUNCE_MS } from "./useBlockState";
import { isChipDue } from "./types";

interface Slot {
  timer: ReturnType<typeof setTimeout> | null;
  chain: Promise<unknown>;
  /** The row that holds this chip once it has been written. */
  rowId: string | null;
  latest: { conversationId: string; resourceId: string; coalesceKey: string | null; item: RemarkItem } | null;
}

/** The record a remark is about: its answer, else the platform record it names. */
function entityOf(item: RemarkItem): { entityType: string; entityId: string } | null {
  const messageId = durableRecordId(item.target.messageId);
  if (messageId) return { entityType: "message", entityId: messageId };
  const record = item.target.record;
  if (record?.token && record.id) return { entityType: record.token, entityId: record.id };
  return null;
}

function stripRef(item: RemarkItem): RemarkItem {
  const { blockStateRef: _ref, ...rest } = item as RemarkItem & { blockStateRef?: unknown };
  return rest as RemarkItem;
}

function reportFailure(error: unknown): void {
  const signedOut = error instanceof BlockStateWriteError && error.detail.signedOut;
  toast.error(
    signedOut
      ? "Sign in to keep your notes on this answer. Nothing here is saved."
      : "Your note on this answer is not saved. Try again.",
    { id: "block-state-remark-save" },
  );
  console.error("[block-state] remark write failed:", error);
}

export function createRemarkDurability(store: AppStore): RemarkDurability {
  const slots = new Map<string, Slot>();
  const dispatch = store.dispatch as AppDispatch;

  const slotFor = (conversationId: string, key: string): Slot => {
    const id = `${conversationId}\u0000${key}`;
    let slot = slots.get(id);
    if (!slot) {
      slot = { timer: null, chain: Promise.resolve(), rowId: null, latest: null };
      slots.set(id, slot);
    }
    return slot;
  };

  const write = (conversationId: string, key: string, slot: Slot): void => {
    const latest = slot.latest;
    if (!latest) return;
    const entity = entityOf(latest.item);
    if (!entity) {
      console.warn("[block-state] a chip with no answer or record to belong to is not kept:", key);
      return;
    }
    slot.chain = slot.chain.then(async () => {
      try {
        const row = await setBlockState({
          entityType: entity.entityType,
          entityId: entity.entityId,
          blockKey: `remark:${key}`,
          kind: "remark",
          scope: "viewer",
          patch: {
            remark: stripRef(latest.item) as unknown as Record<string, unknown>,
            coalesceKey: latest.coalesceKey,
            stagedIn: latest.conversationId,
            resourceId: latest.resourceId,
          },
          fingerprint: null,
        });
        slot.rowId = row.id;
        dispatch(upsertBlockStateRows([row]));
        dispatch(attachRemarkRef(latest.conversationId, latest.resourceId, { id: row.id, stateVersion: row.state_version }));
      } catch (error) {
        reportFailure(error);
      }
    });
  };

  return {
    save(conversationId, resourceId, coalesceKey, item) {
      const key = coalesceKey ?? resourceId;
      const slot = slotFor(conversationId, key);
      slot.latest = { conversationId, resourceId, coalesceKey, item };
      if (slot.timer) clearTimeout(slot.timer);
      slot.timer = setTimeout(() => {
        slot.timer = null;
        write(conversationId, key, slot);
      }, BLOCK_STATE_DEBOUNCE_MS);
    },

    retire(conversationId, resourceId, coalesceKey, item) {
      const key = coalesceKey ?? resourceId;
      const slot = slotFor(conversationId, key);
      if (slot.timer) {
        clearTimeout(slot.timer);
        slot.timer = null;
      }
      slot.latest = null;
      slot.chain = slot.chain.then(async () => {
        const rowId = slot.rowId ?? item.blockStateRef?.id ?? null;
        if (!rowId) return;
        try {
          const row = await dismissBlockStateChip(rowId);
          if (row) dispatch(upsertBlockStateRows([row]));
        } catch (error) {
          reportFailure(error);
        }
      });
    },

    restore(conversationId) {
      const ref = unitRefOf("message", null, conversationId);
      if (!ref) return;
      void (async () => {
        await dispatch(ensureBlockStatesLoaded(ref));
        // Another block may have started the read: wait until the unit settles.
        for (let i = 0; i < 100 && (store.getState() as RootState).blockStates.hydration[ref.unit] === "loading"; i += 1) {
          await new Promise((r) => setTimeout(r, 100));
        }
        const rows = Object.values(selectAllBlockStateRows(store.getState() as RootState));
        const state = store.getState() as unknown as ChatRootState;
        const submitted = new Set(state.instanceResources.submittedIds[conversationId] ?? []);
        const sentRefs = new Set<string>();
        for (const resourceId of submitted) {
          const resource = state.instanceResources.byConversationId[conversationId]?.[resourceId];
          const sentRef = resource ? remarkSourceOf(resource)?.remark.blockStateRef : null;
          if (sentRef) sentRefs.add(`${sentRef.id}:${sentRef.stateVersion}`);
        }
        const stored = readStoredRemarks(
          rows
            .filter((r) => r.kind === "remark" && isChipDue(r) && r.state.stagedIn === conversationId)
            .filter((r) => !sentRefs.has(`${r.id}:${r.state_version}`))
            .map((r) => ({
              resourceId: typeof r.state.resourceId === "string" ? r.state.resourceId : r.id,
              coalesceKey: typeof r.state.coalesceKey === "string" ? r.state.coalesceKey : null,
              item: { ...(r.state.remark as object), blockStateRef: { id: r.id, stateVersion: r.state_version } },
            })),
        );
        if (stored.length > 0) dispatch(restageRemarks(conversationId, stored));
      })();
    },
  };
}

/** Register this app's durability with the chat package (once, with the store). Returns the release. */
export function registerBlockStateRemarkDurability(store: AppStore): () => void {
  return registerRemarkDurability(createRemarkDurability(store));
}
