"use client";

// features/action-requests/hooks/usePendingActionRequest.ts — FIND ONE OPEN ASK.
//
// A chat tool card knows an ask by one of two things: the `action_request_id`
// in the parked tool output (once it exists), or — while the call is still
// streaming and nothing has been written back yet — the conversation it lives
// in plus the kind the agent asked for. Either way the ask itself (its render
// spec, its organization) comes from aidream's pending list, which is the only
// place that says whether it is STILL open.
//
// NOT IN THE LIST MEANS NOT OPEN. Answered, expired, withdrawn: the card says
// so in one quiet line and never draws a form that would fail at the end. The
// one exception is the few seconds while a live call is still minting its row,
// which is retried briefly so the form appears the moment the ask exists.

import { useEffect, useRef, useState } from "react";

import {
  fetchPendingActionRequests,
  type PendingActionRequest,
} from "@/features/action-requests/self-service";

export type PendingActionRequestState =
  | { phase: "loading" }
  | { phase: "open"; request: PendingActionRequest }
  | { phase: "closed" }
  | { phase: "unreachable"; retry: () => void };

/** How long a live, still-minting call is looked for before it reads as closed. */
const MINT_RETRY_ATTEMPTS = 10;
const MINT_RETRY_INTERVAL_MS = 2000;

export function usePendingActionRequest({
  requestId,
  conversationId,
  kind,
  stillMinting,
}: {
  /** The parked output's `action_request_id`, when the card has one. */
  requestId: string | null;
  /** The chat's conversation — the fallback match while the id is unknown. */
  conversationId: string | null;
  /** The kind the agent asked for (`ask_person`'s `kind` argument). */
  kind: string | null;
  /** True while the call is live and its row may not be written yet. */
  stillMinting: boolean;
}): PendingActionRequestState {
  const [state, setState] = useState<PendingActionRequestState>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  // Read inside the effect, not a dependency: the call going from live to
  // finished must not re-run the lookup.
  const stillMintingRef = useRef(stillMinting);
  useEffect(() => {
    stillMintingRef.current = stillMinting;
  }, [stillMinting]);
  // THE OPEN FORM IS NEVER TORN DOWN BY A REFETCH. Once the ask is found, a
  // re-render that learns the same id changes nothing — unmounting the form
  // would throw away what the person is typing.
  const openIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (openIdRef.current && (!requestId || requestId === openIdRef.current)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const look = async (tries: number) => {
      try {
        const pending = await fetchPendingActionRequests();
        if (cancelled) return;
        const match = pickMatch(pending, { requestId, conversationId, kind });
        if (match) {
          openIdRef.current = match.request_id;
          setState({ phase: "open", request: match });
          return;
        }
        if (stillMintingRef.current && !requestId && tries < MINT_RETRY_ATTEMPTS) {
          timer = setTimeout(() => void look(tries + 1), MINT_RETRY_INTERVAL_MS);
          return;
        }
        setState({ phase: "closed" });
      } catch {
        if (cancelled) return;
        setState({ phase: "unreachable", retry: () => setAttempt((n) => n + 1) });
      }
    };

    setState({ phase: "loading" });
    void look(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [requestId, conversationId, kind, attempt]);

  return state;
}

function pickMatch(
  pending: PendingActionRequest[],
  want: { requestId: string | null; conversationId: string | null; kind: string | null },
): PendingActionRequest | null {
  if (want.requestId) {
    return pending.find((row) => row.request_id === want.requestId) ?? null;
  }
  // No id yet: the newest open ask of this kind in this conversation. Never a
  // cross-conversation guess — a form for the wrong ask is worse than none.
  if (!want.conversationId) return null;
  const candidates = pending
    .filter(
      (row) =>
        row.conversation_id === want.conversationId &&
        (!want.kind || row.kind === want.kind),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return candidates[0] ?? null;
}
