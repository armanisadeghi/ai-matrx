"use client";

// features/action-requests/components/ParkedOnPersonCard.tsx — A TOOL CALL
// WAITING ON YOU, ANSWERED WHERE YOU ARE.
//
// Any tool may park its own call on a person: `seo_keywords.research` asks for
// money through an `approve_spend` request, and the server writes the request
// id onto the call (`chat.tool_call.metadata.parked_on`). The chat card for
// that call is THIS: the ask's own form (`ActionRequestInlineAnswer`, the same
// form the texted `/q/<token>` link draws), answered with the person's own
// session. The link itself is never shown here — its token exists only in the
// message that carried it; the in-app door needs none.
//
// IT UPDATES WHEN THE TURN RESUMES. Answering here re-reads the conversation
// (the resumed turn is already written when the answer door returns) and then
// FOLLOWS it like any reopen (`followWhatIsStillInFlight`): the server resumes
// the turn with the tools it parked with, so a page tool it calls next
// (`board_add_tile`, an `apply_surface_write` approval) is delegated back to
// THIS page, surfaced here and answered with its live handlers. Answered
// somewhere else — the texted link on a phone — the card finds out the next
// time this tab is looked at: the ask is gone from the pending list, so the
// conversation is re-read and the ordinary card for the finished call takes
// this one's place. One read per return to the tab, never a poll.

import { useEffect, useRef } from "react";
import { HandHelping } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useAppDispatch } from "@/lib/redux/hooks";
import { rereadAndFollow } from "@ai-matrx/chat/agents/runtime-reconnect/reread-and-follow";
import { ActionRequestInlineAnswer } from "@/features/action-requests/components/ActionRequestInlineAnswer";
import { usePendingActionRequest } from "@/features/action-requests/hooks/usePendingActionRequest";
import { fetchPendingActionRequests } from "@/features/action-requests/self-service";

export function ParkedOnPersonCard({
  actionRequestId,
  conversationId,
}: {
  /** The ask this call is parked on. `null` while live, before the row is
   *  re-read: the conversation's newest open ask is the one this turn made. */
  actionRequestId: string | null;
  conversationId?: string | null;
}) {
  const dispatch = useAppDispatch();
  const lookup = usePendingActionRequest({
    requestId: actionRequestId,
    conversationId: conversationId ?? null,
    kind: null,
    // Live and unnamed: the row may still be minting, so look a few times.
    stillMinting: actionRequestId === null,
  });
  const openId = lookup.phase === "open" ? lookup.request.request_id : actionRequestId;

  const reread = () => {
    if (!conversationId) return;
    void rereadAndFollow(dispatch, conversationId, "parked-call: answered");
  };

  // ANSWERED ELSEWHERE: a closed ask means the call has moved on. Re-read once.
  const rereadFor = useRef<string | null>(null);
  const closed = lookup.phase === "closed";
  useEffect(() => {
    const key = actionRequestId ?? "live";
    if (!closed || rereadFor.current === key || !conversationId) return;
    rereadFor.current = key;
    void rereadAndFollow(dispatch, conversationId, "parked-call: closed elsewhere");
  }, [closed, actionRequestId, conversationId, dispatch]);

  // BACK TO THE TAB: still waiting? One read of the pending list says.
  useEffect(() => {
    if (!conversationId || typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !openId) return;
      void fetchPendingActionRequests()
        .then((pending) => {
          if (!pending.some((row) => row.request_id === openId)) {
            void rereadAndFollow(dispatch, conversationId, "parked-call: back to the tab");
          }
        })
        .catch((err: unknown) => {
          console.warn("[parked-call] could not re-check the ask on return to the tab.", err);
        });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [openId, conversationId, dispatch]);

  if (lookup.phase === "open") {
    return (
      <div data-parked-ask="" className="rounded-md border border-border bg-card">
        <p className="flex items-center gap-2 px-4 pt-4 text-sm font-medium">
          <HandHelping className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          {lookup.request.render.title}
        </p>
        <ActionRequestInlineAnswer request={lookup.request} onAnswered={reread} />
      </div>
    );
  }

  if (lookup.phase === "unreachable") {
    return (
      <div data-parked-ask="" className="flex items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          This call is waiting for you, and we could not load what it needs just now. Nothing was
          lost — try again.
          <ErrorAlchemyMenu />
        </p>
        <Button variant="outline" onClick={lookup.retry}>
          Try again
        </Button>
      </div>
    );
  }

  if (closed) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        This ask has been answered. Your agent is picking the work back up.
      </p>
    );
  }

  return (
    <p data-parked-ask="" className="p-4 text-sm text-muted-foreground">
      Getting what your agent needs from you…
    </p>
  );
}
