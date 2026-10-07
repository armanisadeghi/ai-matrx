// features/spaces/collab/join-room.ts — how a member joining a Space's room gets the page body: ONE
// source of truth, never two copies (round 28).
//
// The room has no server: a member that finds nobody holding the page builds the body from the stored
// snapshot (the seed). Two seeds of DIFFERENT stored versions are two independent copies of every block,
// and Yjs keeps both — the body would hold two block groups (y-prosemirror then throws one away: content
// lost). So a member seeds only when it KNOWS nobody else holds the page:
//   1. the room's answer (the provider's ready()) — a body arrived: take it, never seed;
//   2. presence not known yet (the presence channel has not reported): wait for it — "nobody listed"
//      before presence is connected means "not heard yet", never "nobody here";
//   3. someone else is here but their body has not arrived: wait for it (asking again halfway), and seed
//      only when the wait runs out (they left, or their tab cannot answer).
// No BlockNote here: the decision is testable in Jest (collab/__tests__/join-room.test.ts).

import type * as Y from "yjs";

export interface JoinRoomArgs {
  fragment: Y.XmlFragment;
  /** Join the room and wait for its first answer (or the provider's alone timer). */
  connect: () => Promise<void>;
  /** Ask the room again (a fresh provider). */
  reask: () => Promise<void>;
  /** Someone else on the page per presence; null = presence not known yet. */
  othersHere: () => boolean | null;
  /** Build the body from the stored snapshot. */
  seed: () => void;
  disposed: () => boolean;
  /** Longest wait for presence to report, then for a present member's body (ms). */
  presenceWaitMs?: number;
  roomWaitMs?: number;
}

export type JoinResult = "room" | "seed" | "disposed";

const PRESENCE_WAIT_MS = 5000;
const ROOM_WAIT_MS = 10000;
const POLL_MS = 50;

async function waitFor(cond: () => boolean, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (!cond() && Date.now() < until) await new Promise((r) => setTimeout(r, POLL_MS));
}

export async function joinRoom(a: JoinRoomArgs): Promise<JoinResult> {
  const has = () => a.fragment.length > 0;
  await a.connect();
  if (a.disposed()) return "disposed";
  if (!has()) await waitFor(() => has() || a.disposed() || a.othersHere() !== null, a.presenceWaitMs ?? PRESENCE_WAIT_MS);
  if (!has() && !a.disposed() && a.othersHere() === true) {
    const total = a.roomWaitMs ?? ROOM_WAIT_MS;
    await waitFor(() => has() || a.disposed() || a.othersHere() === false, total / 2);
    if (!has() && !a.disposed() && a.othersHere() === true) {
      await a.reask();
      await waitFor(() => has() || a.disposed() || a.othersHere() === false, total / 2);
    }
  }
  if (a.disposed()) return "disposed";
  if (has()) return "room";
  a.seed();
  return "seed";
}
