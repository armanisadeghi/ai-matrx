// features/block-state/blockStateRealtime.ts
//
// The live feed for one hydration unit: PRIVATE Database Broadcast topics the
// block-state door sends on (`realtime.send`, event `block_state`, payload
// {op: set|sent|dismiss, row}):
//   shared rows   block_states:<scope>:<entity id>
//   private rows  block_states:<scope>:<entity id>:<user id>
// where <scope> is `conversation` for chat answers and the entity token for any
// other record. The payload is the server's own shape (a foreign wire), so raw
// mode — and a send never originates here (no echo to suppress).

import {
  defineChannelNamespace,
  onRealtimeManagerChange,
  type ChannelHandle,
} from "@ai-matrx/realtime";
import { toBlockStateRow, type BlockStateRow } from "./types";

const sharedChannel = defineChannelNamespace({
  namespace: "block-states-shared",
  parts: ["scope", "entityId"],
  description: "Block state rows everyone on a record sees (private Database Broadcast)",
  foreignTopic: "block_states",
});
const privateChannel = defineChannelNamespace({
  namespace: "block-states-private",
  parts: ["scope", "entityId", "viewerId"],
  description: "One person's own block state rows on a record (private Database Broadcast)",
  foreignTopic: "block_states",
});

export interface BlockStateFeedUnit {
  /** `conversation` or the entity token of a non-message record. */
  scope: string;
  entityId: string;
}

export type BlockStateFeedSignal = { rows: BlockStateRow[] } | { resync: true };

interface Frame {
  op?: string;
  row?: unknown;
}

interface Entry {
  listeners: Set<(signal: BlockStateFeedSignal) => void>;
  handles: ChannelHandle[];
  stop: () => void;
}

const entries = new Map<string, Entry>();

/** Subscribe to a unit's feed (refcounted: one pair of channels per unit). Returns the release. */
export function subscribeBlockStateFeed(
  unit: BlockStateFeedUnit,
  userId: string,
  listener: (signal: BlockStateFeedSignal) => void,
): () => void {
  const id = `${unit.scope}:${unit.entityId}:${userId}`;
  let entry = entries.get(id);
  if (!entry) {
    const created: Entry = { listeners: new Set(), handles: [], stop: () => {} };
    const fan = (signal: BlockStateFeedSignal) => {
      for (const l of Array.from(created.listeners)) l(signal);
    };
    const closeAll = () => {
      for (const h of created.handles) h.close();
      created.handles = [];
    };
    created.stop = onRealtimeManagerChange((manager) => {
      closeAll();
      if (!manager) return;
      const open = (topic: string) =>
        manager.open({
          topic,
          private: true,
          wire: { mode: "raw", acceptEchoFromSelf: true },
          broadcast: [
            {
              event: "block_state",
              onMessage: ({ data }) => {
                const frame = data as Frame;
                const row = toBlockStateRow(frame?.row);
                if (row) fan({ rows: [row] });
              },
            },
          ],
          eventKey: (_source, payload) => {
            const frame = payload as Frame | undefined;
            const row = frame?.row as { id?: unknown; version?: unknown; state_version?: unknown; sent_version?: unknown } | undefined;
            return row?.id === undefined
              ? undefined
              : `${String(row.id)}:${String(row.version)}:${String(row.state_version)}:${String(row.sent_version)}:${frame?.op ?? ""}`;
          },
          // Realtime has no replay: whatever happened while the socket was away is re-read.
          onBackfill: () => fan({ resync: true }),
        });
      created.handles = [
        open(sharedChannel.topic({ scope: unit.scope, entityId: unit.entityId })),
        open(privateChannel.topic({ scope: unit.scope, entityId: unit.entityId, viewerId: userId })),
      ];
    });
    entries.set(id, created);
    entry = created;
  }
  entry.listeners.add(listener);
  return () => {
    const current = entries.get(id);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      current.stop();
      for (const h of current.handles) h.close();
      entries.delete(id);
    }
  };
}
