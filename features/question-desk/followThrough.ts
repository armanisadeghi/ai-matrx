// features/question-desk/followThrough.ts
//
// WHAT THE SERVER DID WITH AN ANSWER, read off the row the screen already has.
//
// The moment an answer's undo window passes, aidream's follow-through
// (`aidream/services/question_desk/follow_through.py`) turns it into work: a
// confirmed decision is delivered; an overturned one is refiled as a real
// question; a ruling in the person's own words becomes a Work Loop item in the
// system-owned campaign `question-desk` that an agent claims and records. The
// server writes that state onto the question row as `metadata.follow_through`,
// which is how the screen can show it without a second read.
//
// 🚨 WHY THE SCREEN READS THE ROW AND NOT `runtime.work_item` DIRECTLY (V2
// finding 6, 2026-09-14): the campaign lives in the SYSTEM organization and its
// items are not the reader's rows, so a client read of them under RLS returns
// nothing — a count that is always zero is worse than no count. The stamp is
// one-to-one with the item (the server writes `work_item_key` beside the state
// it is in), so this IS the campaign's waiting work, seen through the rows the
// person is already entitled to. What it must never become is a guess: a row
// only counts as waiting when the server itself said `awaiting_work`.

import type { DecisionQuestionRow } from "./types";

export interface FollowThroughStamp {
  state?: string;
  kind?: string;
  work_item_key?: string;
  campaign_id?: string;
}

/** The server's follow-through stamp on a row, or null when it has none yet. */
export function followThroughStamp(
  row: DecisionQuestionRow,
): FollowThroughStamp | null {
  const metadata = row.metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }
  const stamp = (metadata as Record<string, unknown>).follow_through;
  if (typeof stamp !== "object" || stamp === null || Array.isArray(stamp)) {
    return null;
  }
  return stamp as FollowThroughStamp;
}

/**
 * True when this answer is sitting in the `question-desk` campaign waiting for
 * an agent to claim it and write the ruling down. `status_note` on such a row
 * reads "recording…", which a person reads as work in flight — it is work
 * WAITING, and the screen now says how much of it there is.
 */
export function isAwaitingAgent(row: DecisionQuestionRow): boolean {
  return followThroughStamp(row)?.state === "awaiting_work";
}

/** How many answers in this interview are waiting for an agent to record them. */
export function awaitingAgentCount(rows: DecisionQuestionRow[]): number {
  return rows.filter(isAwaitingAgent).length;
}
