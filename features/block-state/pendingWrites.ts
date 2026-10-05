// features/block-state/pendingWrites.ts
//
// Who still has a block-state write queued. A send asks this before it freezes
// its chips: every mounted block (and the remark durability) registers here, so
// "flush everything for this conversation and wait for the saved refs" is one call.

export interface PendingWriter {
  conversationId: () => string | null;
  hasPending: () => boolean;
  flush: () => Promise<void>;
}

const writers = new Set<PendingWriter>();

/** Register a writer while it is mounted. Returns the release. */
export function registerPendingWriter(writer: PendingWriter): () => void {
  writers.add(writer);
  return () => {
    writers.delete(writer);
  };
}

function forConversation(conversationId: string): PendingWriter[] {
  return [...writers].filter((w) => w.conversationId() === conversationId);
}

export function hasPendingBlockStateWrites(conversationId: string): boolean {
  return forConversation(conversationId).some((w) => w.hasPending());
}

/** Write everything queued for this conversation now; resolves when every write has returned. */
export async function flushBlockStateWrites(conversationId: string): Promise<void> {
  await Promise.all(forConversation(conversationId).map((w) => w.flush()));
}
