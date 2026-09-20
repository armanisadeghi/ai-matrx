"use client";

// features/masterwork/encore/OpenRunPanel.tsx
//
// 🚨 THE DELIVERABLE THE OPERATOR CLICKED, ON THE SCREEN THEY CLICKED IT FROM
// (walk 14, defect A).
//
// Walk 13's N10 replaced the developer door (`/workflows/runs/<id>`) with the
// in-app address `/masterwork/encore/<id>?run=<runId>`. The address landed;
// nothing else did. `EncoreRunPage` grew the search-param read, the fetch and
// the loading/ready state — and no JSX that consumed any of it. So walk 14
// clicked a finished run and measured the page: `main` innerText identical
// before and after, zero dialogs, no sentence. A dead click on the Expert's
// own result.
//
// This component is the missing half, and it is deliberately its OWN file so
// the render leg cannot be silently absent again: the page imports it and the
// guard renders the page through the real `?run=` entry.
//
// Three rules it keeps:
//   1. The ruling renders through the REGISTERED `masterwork_result` kind
//      component — the same one the run box uses — so cited rule ids resolve
//      into the Expert's own rule names. Never a second renderer.
//   2. Every non-result outcome says an honest sentence with a remedy (law 4).
//      "Kept nothing" and "we could not read it" are different truths and get
//      different sentences.
//   3. It survives a reload of the `?run=` address: everything it needs comes
//      from the address and the server, never from the click that opened it.

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { MASTERWORK_RESULT_KIND } from "@/features/content-ir/kinds/masterwork-result";
import { formatRelativeTime } from "@/utils/datetime";
import type { EncoreRun, EncoreRunResultRead } from "./service";

export interface OpenRunState {
  runId: string;
  /** Null while the read is still in flight. */
  read: EncoreRunResultRead | null;
}

/**
 * The sentence for a run that handed over nothing readable. The run's own
 * recorded status is what makes it honest: a failed run has no deliverable
 * because it never got there, and saying "run it again" to someone whose run
 * failed for a real reason would be telling them to repeat it blind.
 */
function keptNothingSentence(run: EncoreRun | null): string {
  if (run && run.status !== "completed") {
    const failed = run.error_message?.trim();
    const ended =
      run.status === "failed"
        ? "This run did not finish"
        : `This run ended as ${run.status}`;
    return failed
      ? `${ended}, so there is no result to open. What it reported: ${failed}`
      : `${ended}, so there is no result to open. Run it again below and the next one will open here.`;
  }
  return (
    "This run finished, but it kept no readable result — so there is nothing " +
    "to open here. Run it again below and the new one will open on this page."
  );
}

export function OpenRunPanel({
  open,
  run,
  onClose,
}: {
  open: OpenRunState;
  /** This run's own history row, when we have it — status, age, cost. */
  run: EncoreRun | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Opening a run from the list below scrolls it into view — the deliverable
  // is the thing they asked for, so it is the thing they should be looking at.
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [open.runId]);

  return (
    <div
      ref={ref}
      data-encore-open-run={open.runId}
      className="mb-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Your result</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {run
              ? `From the run you did ${formatRelativeTime(run.created_at)}.`
              : "From the run at this address."}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={onClose}
          aria-label="Close this result"
          title="Close this result"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3">
        {open.read === null ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoadingSpinner />
            <span>Opening your result…</span>
          </div>
        ) : open.read.status === "ready" ? (
          /* The canonical kind render — the same component the run box uses,
             inside the Rulebook's rule scope, so every cited rule resolves
             into its real name with a door to it. */
          <KindInstanceRender
            kind={MASTERWORK_RESULT_KIND}
            value={open.read.result}
            variant="bare"
            showRoutingNote={false}
          />
        ) : open.read.status === "unreadable" ? (
          <p className="text-xs text-muted-foreground">
            We could not open this run&apos;s result — the read was refused.
            That usually means it belongs to a different workspace than the one
            you have selected, or your access to it changed since it ran. Pick
            the workspace it was run in, or run this one again below.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {keptNothingSentence(run)}
          </p>
        )}
      </div>
    </div>
  );
}
