// features/vision-interview/hooks/useObserveRoleTurns.ts
//
// THE HIJACK'S CLIENT HALF (v3).
//
// The person now talks to an expert straight down the ORDINARY agent-chat
// path, which deleted the orchestrated round the Scribe used to ride on. So
// the room tells the server when an exchange finished, and the server does
// everything the round used to do: mirror the conversation's new messages
// into `interview.turn`, honour the `<answered_questions>` block, run the
// Scribe over the living document, run the answer tracker over the open
// questions (aidream `services/vision_interview/live_turns.py`).
//
// ── THE COMPLETION SIGNAL ──────────────────────────────────────────────────
// The real one, not a timer and not the send: the execution system mints an
// `activeRequests` row per user request on the mounted conversation
// (`selectLatestRequestId`), and that row's `status` walks
// pending → connecting → streaming → one of the FOUR terminal values
// (`complete` / `error` / `timeout` / `cancelled` — the same set
// `active-requests.slice.ts` stamps `completedAt` on). We fire ONCE per
// requestId the first time it settles.
//
// ── ONE PING COVERS BOTH SPEAKERS ──────────────────────────────────────────
// `ingest_role_conversation` mirrors EVERY not-yet-mirrored message in the
// conversation — the person's and the expert's — keyed on `chat.message.id`.
// So the single ping after the reply settles carries the human's words too;
// a second ping on send would mirror the same messages for nothing. Firing on
// EVERY terminal value (not just `complete`) is what keeps the person's words
// safe when the expert's reply errors out.
//
// ── AND ONE REPAIR PING ────────────────────────────────────────────────────
// Switching tabs unmounts the room, so a reply that settles after you leave
// has no one to report it. That is exactly the "missed call" the endpoint is
// designed for, and the repair is free: a pass with nothing new to mirror
// returns before a single model is called (`if not written: return`). So the
// room also pings once when it mounts an expert's conversation.
//
// Fire-and-forget throughout: failures are caught and dropped, nothing blocks
// the UI, and no toast is ever raised — a missed ping is repaired by the next.

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectRequestStatus } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { selectLatestRequestId } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import type { RequestStatus } from "@/features/agents/types/request.types";
import { observeRoleTurnCall } from "../roomApi";
import type { RoleKey } from "../types";

const SETTLED: ReadonlySet<RequestStatus> = new Set<RequestStatus>([
  "complete",
  "error",
  "timeout",
  "cancelled",
]);

export function useObserveRoleTurns({
  sessionId,
  role,
  conversationId,
}: {
  sessionId: string;
  role: RoleKey;
  conversationId: string;
}): void {
  const dispatch = useAppDispatch();
  const requestId = useAppSelector(selectLatestRequestId(conversationId));
  const status = useAppSelector(selectRequestStatus(requestId ?? ""));
  // requestIds already reported — a settled row stays settled, and re-renders
  // must not re-ping it.
  const reportedRef = useRef<Set<string>>(new Set());

  // (1) The repair ping when this expert's room mounts.
  useEffect(() => {
    void dispatch(observeRoleTurnCall(sessionId, role)).catch(() => {});
  }, [dispatch, sessionId, role, conversationId]);

  // (2) The real signal: this conversation's request settled.
  useEffect(() => {
    if (!requestId || !status) return;
    if (!SETTLED.has(status)) return;
    if (reportedRef.current.has(requestId)) return;
    reportedRef.current.add(requestId);
    void dispatch(observeRoleTurnCall(sessionId, role)).catch(() => {});
  }, [dispatch, sessionId, role, requestId, status]);
}
