"use client";

/**
 * BlindAccessAsk — the one "Ask for access" on the not-found page (lane V24-TAILS, chair ruling
 * 2026-09-25).
 *
 * A stranger who opens an unshared object and a person who opens a random id see the SAME page:
 * "We couldn't find this <kind>. If someone shared a link with you, you can ask for access." and
 * this one control. Pressing it calls `public.access_request_blind`, which files the ordinary
 * request (the owner's /settings/access-requests inbox and an in-app notice) for a real object and
 * nothing for a missing one. The asker is told the same sentence either way and never who owns it.
 */

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askForAccessBlind, BLIND_ASK_ANSWER } from "@/features/access-gate/service/accessRequests";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function BlindAccessAsk({
  token,
  id,
  href,
}: {
  token: string;
  id: string;
  href?: string | null;
}) {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "asking" } | { kind: "asked"; says: string } | { kind: "failed"; why: string }
  >({ kind: "idle" });

  if (state.kind === "asked") {
    return (
      <p className="text-sm text-foreground" role="status" data-blind-ask="asked">
        {state.says || BLIND_ASK_ANSWER}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2" data-blind-ask={state.kind}>
      <Button
        size="sm"
        disabled={state.kind === "asking"}
        aria-busy={state.kind === "asking"}
        onClick={() => {
          setState({ kind: "asking" });
          void askForAccessBlind({
            resourceType: token,
            resourceId: id,
            href: href ?? (typeof window !== "undefined" ? window.location.pathname : null),
          }).then(
            (says) => setState({ kind: "asked", says }),
            (e: unknown) =>
              setState({
                kind: "failed",
                why: e instanceof Error ? e.message : "We could not send that just now.",
              }),
          );
        }}
        data-tap-target
      >
        <KeyRound className="mr-1.5 h-4 w-4" aria-hidden />
        {state.kind === "asking" ? "Asking…" : "Ask for access"}
      </Button>
      {state.kind === "failed" ? (
        <p className="text-xs text-destructive" role="alert">
          {state.why} Try again.
          <ErrorAlchemyMenu className="ml-auto" />
        </p>
      ) : null}
    </div>
  );
}
