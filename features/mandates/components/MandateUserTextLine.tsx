"use client";

/**
 * MandateUserTextLine — THE one place either host says whether a mandate takes
 * free text from the caller.
 *
 * WHAT THIS FIXES (V2-2, production walk 2026-08-31). One mandate, one minute,
 * two screens, opposite claims: the user host's triad printed a hardcoded
 * "Free text from the caller is accepted (platform default)." — a sentence
 * that never asked anything — while the admin panel printed "This Mandate
 * forbids user text" out of the code-truth report's `passes_user_input`, which
 * describes what the CALLING CODE passes and is false as a statement about the
 * mandate whenever no code declares it at all.
 *
 * The authority is the SERVED input surface's `accepts_user_input`
 * (`GET /mandates/{key}/input-surface`) — the same answer the run door uses.
 * Both hosts render this component; neither derives the sentence again.
 * Nothing here falls back to a guess: a surface that could not be read says so.
 */

import { MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMandateInputSurface, userTextSentence } from "../input-surface";

export interface MandateUserTextLineProps {
  mandateKey: string;
  /** Extra classes for the host's own type scale. */
  className?: string;
  /** The triad shows the icon; the admin fact grid does not. */
  showIcon?: boolean;
}

export function MandateUserTextLine({
  mandateKey,
  className,
  showIcon = true,
}: MandateUserTextLineProps) {
  const state = useMandateInputSurface(mandateKey);

  const body =
    state.status === "loading"
      ? "Reading whether this job takes free text…"
      : state.status === "error"
        ? state.message
        : userTextSentence(state.surface);

  return (
    <p
      className={cn(
        "flex items-center gap-1.5",
        state.status === "error" ? "text-destructive" : undefined,
        className,
      )}
    >
      {showIcon ? <MessageSquareText className="h-3 w-3 shrink-0" /> : null}
      <span>{body}</span>
    </p>
  );
}
