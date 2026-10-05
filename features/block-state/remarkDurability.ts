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
// Where a chip is found again: by the conversation it was staged into, and — while
// that conversation has no persisted record yet ("New chat about this" opens a
// brand-new chat whose id is minted on every mount) — by the person + surface it
// was staged on (`stagedSurface`). The row lives on the answer / record the remark
// is about, so it is durable from the first write; restoring re-keys it to the
// conversation now on screen. Board and task comment chips come back the same way.

import type { AppDispatch, AppStore, RootState } from "@/lib/redux/store";
import { toast } from "@/lib/toast";
import { durableRecordId } from "@ai-matrx/kit/ids";
import {
  attachRemarkRef,
  readStoredRemarks,
  registerRemarkDurability,
  remarkSourceOf,
  restageRemarks,
  unstageRemark,
  type RemarkDurability,
  type RemarkItem,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks";
import type { ChatRootState } from "@ai-matrx/chat/store/root-state";
import { BlockStateWriteError, dismissBlockStateChip, listStagedBlockStates, setBlockState } from "./blockStateService";
import { flushBlockStateWrites, hasPendingBlockStateWrites } from "./pendingWrites";
import { selectAllBlockStateRows, upsertBlockStateRows } from "./redux/blockStatesSlice";
import { BLOCK_STATE_DEBOUNCE_MS } from "./useBlockState";
import { isChipDue, type BlockStateRow } from "./types";
import { composerSurfaceAliasOf } from "@ai-matrx/chat/agents/redux/execution-system/instance-user-input/composer-draft-store";
import { purgeLegacyBrowserStores } from "./legacyPurge";
import { unitRefOf } from "./redux/blockStateThunks";
import { subscribeBlockStateFeed } from "./blockStateRealtime";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

interface Slot {
  timer: ReturnType<typeof setTimeout> | null;
  chain: Promise<unknown>;
  /** A write is running (its row/ref has not come back). */
  inFlight: number;
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

export function createRemarkDurability(
  store: AppStore,
  surfaceAliasOf?: (conversationId: string) => string | null,
): RemarkDurability {
  const slots = new Map<string, Slot>();
  const dispatch = store.dispatch as AppDispatch;

  const slotFor = (conversationId: string, key: string): Slot => {
    const id = `${conversationId}\u0000${key}`;
    let slot = slots.get(id);
    if (!slot) {
      slot = { timer: null, chain: Promise.resolve(), inFlight: 0, rowId: null, latest: null };
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
    const alias = surfaceAliasOf?.(conversationId) ?? null;
    console.info('[DBG-A] write', conversationId, key, 'alias=', alias);
    slot.inFlight += 1;
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
            // null clears it once the conversation is real (a surface key is not unique per conversation)
            stagedSurface: alias,
            resourceId: latest.resourceId,
          },
          fingerprint: null,
        });
        slot.rowId = row.id;
        dispatch(upsertBlockStateRows([row]));
        dispatch(attachRemarkRef(latest.conversationId, latest.resourceId, { id: row.id, stateVersion: row.state_version }));
      } catch (error) {
        reportFailure(error);
      } finally {
        slot.inFlight -= 1;
      }
    });
  };

  const slotsOf = (conversationId: string): Slot[] =>
    [...slots.entries()].filter(([id]) => id.startsWith(`${conversationId}\u0000`)).map(([, slot]) => slot);

  /** Stage (or refresh, or clear) this conversation's chips from saved rows, from any device. */
  const applyRows = async (conversationId: string, rows: BlockStateRow[], surfaceAlias: string | null): Promise<void> => {
    dispatch(upsertBlockStateRows(rows));
    const state = store.getState() as unknown as ChatRootState;
    const submitted = new Set(state.instanceResources.submittedIds[conversationId] ?? []);
    const sentRefs = new Set<string>();
    for (const resourceId of submitted) {
      const resource = state.instanceResources.byConversationId[conversationId]?.[resourceId];
      const sentRef = resource ? remarkSourceOf(resource)?.remark.blockStateRef : null;
      if (sentRef) sentRefs.add(`${sentRef.id}:${sentRef.stateVersion}`);
    }
    const isRemark = (r: BlockStateRow) => r.kind === "remark" && r.state.remark && typeof r.state.remark === "object";
    // A chip another tab sent or dismissed is no longer due: it leaves this composer too.
    for (const r of rows) {
      if (!isRemark(r) || isChipDue(r) || typeof r.state.coalesceKey !== "string") continue;
      dispatch(unstageRemark(conversationId, r.state.coalesceKey, { retire: false }));
    }
    const due = rows.filter((r) => isRemark(r) && isChipDue(r)).filter((r) => !sentRefs.has(`${r.id}:${r.state_version}`));
    const stored = readStoredRemarks(
      due.map((r) => ({
        resourceId: typeof r.state.resourceId === "string" ? r.state.resourceId : r.id,
        coalesceKey: typeof r.state.coalesceKey === "string" ? r.state.coalesceKey : null,
        item: { ...(r.state.remark as object), blockStateRef: { id: r.id, stateVersion: r.state_version } },
      })),
    );
    if (stored.length > 0) dispatch(restageRemarks(conversationId, stored));
    // RE-KEY: a chip found by its surface now belongs to the conversation on screen.
    for (const r of due) {
      if (r.state.stagedIn === conversationId) continue;
      const entity = { entityType: r.entity_type, entityId: r.entity_id };
      const coalesceKey = typeof r.state.coalesceKey === "string" ? r.state.coalesceKey : null;
      const held = Object.values(
        (store.getState() as unknown as ChatRootState).instanceResources.byConversationId[conversationId] ?? {},
      ).find((res) => coalesceKey && remarkSourceOf(res)?.coalesceKey === coalesceKey);
      const resourceId = held?.resourceId ?? (typeof r.state.resourceId === "string" ? r.state.resourceId : r.id);
      try {
        const saved = await setBlockState({
          ...entity,
          blockKey: r.block_key,
          kind: "remark",
          scope: "viewer",
          patch: { stagedIn: conversationId, stagedSurface: surfaceAlias },
          fingerprint: null,
        });
        dispatch(upsertBlockStateRows([saved]));
        // The new version is the one the send must name, or the chip would be due again.
        dispatch(attachRemarkRef(conversationId, resourceId, { id: saved.id, stateVersion: saved.state_version }));
      } catch (error) {
        reportFailure(error);
      }
    }
  };

  // THE LIVE FEED: a chip made in another tab or on another device lands here without a reload.
  // One feed per real conversation (a conversation with no answers yet has nothing to watch —
  // its topic would be refused, which is a CHANNEL_ERROR for nothing).
  const watching = new Map<string, () => void>();
  const watch = (conversationId: string, surfaceAlias: string | null): void => {
    if (watching.has(conversationId)) return;
    const answers = (store.getState() as unknown as ChatRootState).messages?.byConversationId?.[conversationId]?.orderedIds.length ?? 0;
    if (answers === 0) return;
    const ref = unitRefOf("message", null, conversationId);
    if (!ref) return;
    const userId = selectUserId(store.getState() as RootState);
    if (!userId) return;
    const release = subscribeBlockStateFeed({ scope: ref.scope, entityId: ref.entityId }, userId, (signal) => {
      if ("rows" in signal) {
        const mine = signal.rows.filter((r) => r.kind === "remark");
        if (mine.length > 0) void applyRows(conversationId, mine, surfaceAlias);
      } else {
        void listStagedBlockStates(conversationId, surfaceAlias).then(
          (all) => applyRows(conversationId, all, surfaceAlias),
          (e) => console.error("[block-state] resync failed:", e),
        );
      }
    });
    watching.set(conversationId, release);
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

    surfaceAliasOf,

    hasPending(conversationId) {
      return (
        slotsOf(conversationId).some((slot) => slot.timer !== null || slot.inFlight > 0) ||
        hasPendingBlockStateWrites(conversationId)
      );
    },

    async flush(conversationId) {
      const mine = slotsOf(conversationId);
      for (const [id, slot] of slots.entries()) {
        if (!id.startsWith(`${conversationId}\u0000`) || !slot.timer) continue;
        clearTimeout(slot.timer);
        slot.timer = null;
        write(conversationId, id.slice(conversationId.length + 1), slot);
      }
      await Promise.all([...mine.map((slot) => slot.chain), flushBlockStateWrites(conversationId)]);
    },

    restore(conversationId, surfaceAlias) {
      void (async () => {
        let rows: BlockStateRow[];
        try {
          rows = await listStagedBlockStates(conversationId, surfaceAlias ?? null);
        } catch (error) {
          console.error("[block-state] restoring unsent chips failed:", error);
          return;
        }
        if (rows.length > 0) await applyRows(conversationId, rows, surfaceAlias ?? null);
        watch(conversationId, surfaceAlias ?? null);
      })();
    },
  };
}

/** Register this app's durability with the chat package (once, with the store). Returns the release. */
export function registerBlockStateRemarkDurability(store: AppStore): () => void {
  purgeLegacyBrowserStores();
  const port = createRemarkDurability(store, (id) => composerSurfaceAliasOf(id));
  const releasePort = registerRemarkDurability(port);
  return releasePort;
}
