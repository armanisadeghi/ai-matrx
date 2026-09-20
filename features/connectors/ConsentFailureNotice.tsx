"use client";

// features/connectors/ConsentFailureNotice.tsx
//
// WHAT A FAILED PRESS LOOKS LIKE — one sentence the person can act on, with the
// server's own words one click away and never inline.
//
// The defect this exists to end (VERIFY-U-P2-R2, N4): both consent surfaces
// rendered `extractErrorMessage(cause)` verbatim, so the hub's refusal — "None
// of the selected Google products is available to this account yet: calendar
// (google_oauth_internal_test_required)" — put a capability key and a machine
// code on the screen of a non-technical person. The sentence now comes from the
// provider adapter's one translator (`consentFailureAnswer`), and the raw text
// lives behind a REAL button, not a hover: on a phone there is no hover, so a
// tooltip is no disclosure at all (the same rule as `ProductPermissions`).
//
// Provider-agnostic: it takes the translated answer, never an error.

import { useId, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConsentFailureAnswer } from "./google-adapter";

export function ConsentFailureNotice({
  failure,
  className,
}: {
  failure: ConsentFailureAnswer;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Both consent surfaces can be on screen at once (Settings mounts the panel's
  // own notice AND the dialog body), so the disclosure's id is per instance.
  const detailsId = useId();
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive",
        className,
      )}
    >
      <p className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">{failure.sentence}</span>
      </p>
      {failure.details ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls={detailsId}
            className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs underline underline-offset-2 sm:min-h-0"
          >
            <ChevronDown
              className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")}
              aria-hidden
            />
            {open ? "Hide details" : "Show details"}
          </button>
          {open ? (
            <p
              id={detailsId}
              className="mt-1 break-words font-mono text-[11px] text-destructive/80"
            >
              {failure.details}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default ConsentFailureNotice;
