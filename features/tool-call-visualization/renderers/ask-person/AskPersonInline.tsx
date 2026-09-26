"use client";

/**
 * AskPersonInline — the chat card for `ask_person`, the ONE primitive an agent
 * uses to ask the person it works for for one thing (a yes, a choice, a
 * sign-in, a code, a vault item).
 *
 * By text, the person gets a link to `/q/<token>`. In the chat, they get THIS:
 * the same form (`ActionRequestAnswerForm`), inline, answered with their own
 * session. The ask is found in aidream's pending list — by the parked output's
 * `action_request_id` when it is known, else by this conversation + the kind —
 * because that list is the only thing that says whether it is still open.
 *
 * Shapes (live wire):
 *   args   { kind, payload, … }
 *   parked { __kind: "action_request.parked", action_request_id, kind, expires_at }
 *
 * A parked call ends the turn without a completed event, so a parked card is
 * normally NOT terminal; a real refusal (e.g. no channel) is `status: "error"`
 * with no parked marker and renders the canonical error card.
 */

import React from "react";
import { HandHelping } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ActionRequestInlineAnswer } from "@/features/action-requests/components/ActionRequestInlineAnswer";
import { usePendingActionRequest } from "@/features/action-requests/hooks/usePendingActionRequest";

import type { ToolRendererProps } from "../../types";
import { getArg, isTerminal, resultAsObject } from "../_shared";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";
import { ToolResultCard } from "../_shared-entity/ToolResultCard";

const ASK_PERSON_TINT = "text-amber-600 dark:text-amber-400";

export const AskPersonInline: React.FC<ToolRendererProps> = (props) => {
  const {
    entry,
    conversationId,
    isPersisted,
    onOpenOverlay,
    onOpenWindowPanel,
    toolGroupId,
    expanded,
    onToggleExpanded,
  } = props;

  const result = resultAsObject(entry);
  const parked = result?.__kind === "action_request.parked";
  const requestId =
    parked && typeof result?.action_request_id === "string" ? result.action_request_id : null;
  const argKind = getArg<string>(entry, "kind");
  const kind =
    typeof argKind === "string" && argKind
      ? argKind
      : parked && typeof result?.kind === "string"
        ? result.kind
        : null;

  const refusedOutright = entry.status === "error" && !parked;

  const lookup = usePendingActionRequest({
    requestId,
    conversationId: conversationId ?? null,
    kind,
    stillMinting: !isPersisted && !isTerminal(entry),
  });

  if (refusedOutright) {
    return <ToolErrorCard entry={entry} onOpenOverlay={onOpenOverlay} toolGroupId={toolGroupId} />;
  }

  const open = lookup.phase === "open" ? lookup.request : null;
  const title = open?.render.title ?? "Your agent needs you";
  const sub =
    lookup.phase === "loading"
      ? "Getting the form ready…"
      : lookup.phase === "closed"
        ? isTerminal(entry) && !parked
          ? "Answered"
          : "No longer needed"
        : lookup.phase === "unreachable"
          ? "Could not load this ask"
          : null;

  const body = open ? (
    <ActionRequestInlineAnswer request={open} />
  ) : lookup.phase === "unreachable" ? (
    <div className="flex items-center justify-between gap-3 p-4">
      <p className="text-sm text-muted-foreground">
        We could not reach your agent just now. Nothing was lost — try again.
      </p>
      <Button size="sm" variant="outline" onClick={lookup.retry}>
        Try again
      </Button>
    </div>
  ) : lookup.phase === "closed" ? (
    <p className="p-4 text-sm text-muted-foreground">
      {isTerminal(entry) && !parked
        ? "Done — your agent has what it asked for."
        : "This ask is no longer open."}
    </p>
  ) : (
    <p className="p-4 text-sm text-muted-foreground">{sub}</p>
  );

  // A PARKED CALL NEVER COMPLETES, so the shell draws it as its folded line
  // with this body beneath (card chrome is for terminal calls only). There the
  // line already names the tool, so the body carries the ask's own title and
  // no second header. Once terminal, the shell hands us the card chrome.
  if (!onToggleExpanded) {
    return (
      <div>
        {open ? (
          <p className="px-4 pt-4 text-sm font-medium">{open.render.title}</p>
        ) : null}
        {body}
      </div>
    );
  }

  return (
    <ToolResultCard
      icon={HandHelping}
      iconClassName={ASK_PERSON_TINT}
      title={title}
      sub={sub}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      onOpenWindowPanel={onOpenWindowPanel ? () => onOpenWindowPanel() : undefined}
      onOpenOverlay={onOpenOverlay ? () => onOpenOverlay() : undefined}
    >
      {body}
    </ToolResultCard>
  );
};

export default AskPersonInline;
