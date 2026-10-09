"use client";

/**
 * The "Linked" section of ONE message (AGENTS-ON-DATA item 4 — the seventh surface).
 *
 * "Link a record…" on a message's right-click (W1.4) writes an `anchored_to` edge between the
 * message (`dm_message`) and a record, but nothing showed it. Under each message that HAS a link,
 * the shared `LinkedRecordsSection` is drawn — the same one CRM, HR, tasks, notes, meetings and
 * store records mount. A message with no link draws nothing (a transcript is not a wall of empty
 * "Nothing linked yet").
 *
 * WHICH MESSAGES HAVE LINKS is asked ONCE per burst of mounted bubbles — one `assoc_for_sources`
 * and one `assoc_for_targets` over every id — never one read per message. A message linked later
 * (the store reloads both ends on `add`) is heard through the store's own subscription.
 */

import { useEffect, useState } from "react";
import { getAssociationsStore } from "@/features/scopes/host/associationsStore";
import {
  ANCHORED_TO,
  LinkedRecordsSection,
  isLinkEdge,
} from "@/features/scopes/components/linked-records/LinkedRecordsSection";

const MESSAGE = "dm_message";
const STORE_RECORD = "record";


const known = new Map<string, boolean>();
const waiting = new Map<string, Array<(linked: boolean) => void>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Which of these messages have at least one link — the two batched reads. */
export async function messagesWithLinks(ids: string[]): Promise<Set<string>> {
  const linked = new Set<string>();
  const { associations } = getAssociationsStore().services;
  // The package reads both edge lists COMPLETE (paged past the 1,000-row cap) through its doors.
  const [out, inc] = await Promise.all([
    associations.listForSources(MESSAGE, ids),
    associations.listForTargets(MESSAGE, ids),
  ]);
  for (const row of out.ok ? out.data.edges : []) {
    const edge = { direction: "outgoing" as const, otherType: row.targetType, otherId: row.targetId, role: row.role };
    if (row.sourceId && isLinkEdge(MESSAGE, edge)) linked.add(row.sourceId);
  }
  for (const row of inc.ok ? inc.data.edges : []) {
    const edge = { direction: "incoming" as const, otherType: row.sourceType || STORE_RECORD, otherId: row.sourceId, role: row.role };
    if (row.targetId && isLinkEdge(MESSAGE, edge)) linked.add(row.targetId);
  }
  return linked;
}

function flush(): void {
  flushTimer = null;
  const batch = [...waiting.entries()];
  waiting.clear();
  const ids = batch.map(([id]) => id);
  void messagesWithLinks(ids).then(
    (linked) => {
      for (const [id, callbacks] of batch) {
        known.set(id, linked.has(id));
        for (const cb of callbacks) cb(linked.has(id));
      }
    },
    () => {
      // A failed presence read draws nothing extra; the message itself is untouched, and the
      // right-click "Link a record…" still works and announces itself through the store.
      for (const [, callbacks] of batch) for (const cb of callbacks) cb(false);
    },
  );
}

function askLinked(id: string, cb: (linked: boolean) => void): void {
  const seen = known.get(id);
  if (seen !== undefined) {
    cb(seen);
    return;
  }
  waiting.set(id, [...(waiting.get(id) ?? []), cb]);
  flushTimer ??= setTimeout(flush, 0);
}

export function MessageLinks({ messageId, title }: { messageId: string; title: string }) {
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    let live = true;
    askLinked(messageId, (has) => {
      if (live && has) setLinked(true);
    });
    const store = getAssociationsStore();
    const unsubscribe = store.subscribe(`${MESSAGE}:${messageId}`, () => {
      const entry = store.getEdges(MESSAGE, messageId);
      const has = entry.edges.some((e) => e.role === ANCHORED_TO || isLinkEdge(MESSAGE, e));
      known.set(messageId, has);
      if (live) setLinked(has);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [messageId]);

  if (!linked) return null;
  return (
    <div className="px-3 pb-1" data-message-links={messageId}>
      <LinkedRecordsSection token={MESSAGE} id={messageId} title={title} className="flex flex-col gap-0.5 text-xs" />
    </div>
  );
}

/** Test seam: forget what was learned. */
export function forgetMessageLinks(): void {
  known.clear();
  waiting.clear();
}
