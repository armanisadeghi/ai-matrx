"use client";

/**
 * "Take me there" — the guided way to capture a page our data provider could
 * not read (private, restricted, behind a sign-in). NOT the preferred route;
 * it is for the page you cannot get the normal way.
 *
 *   1. Before sending: one line on what will happen, the numbered steps, and
 *      one button. (The words come from the server's door, so this dialog and
 *      the guide drawn on the page can never disagree.)
 *   2. The extension opens the page in a new tab with a small guide on it.
 *   3. When the person comes back to this tab the job already shows its state;
 *      a finished capture links straight to what it saved.
 *
 * Status is live (`useGuidedJob`): realtime plus a floor that re-reads on
 * focus, so nothing needs refreshing.
 */

import { useCallback, useState } from "react";
import Link from "next/link";

import { Button } from "@ai-matrx/design-system/controls";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EXTENSION_SETUP_ROUTE } from "@/features/capture-ladder/needsYouAssist";
import { guideCapture } from "@/lib/extension-bridge/guideCapture";
import { socialErrorMessage } from "../server";
import {
  startGuidedCapture,
  type GuidedCaptureStart,
  type GuidedCaptureTarget,
} from "./guidedApi";
import { guidedIntroBefore, guidedResultHref } from "./guidedJob";
import { useGuidedJob } from "./useGuidedJob";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
type Stage =
  | { kind: "intro" }
  | { kind: "sending" }
  | { kind: "no_extension"; sentence: string }
  | { kind: "error"; sentence: string }
  | { kind: "watching"; start: GuidedCaptureStart };

export function GuidedCaptureDialog({
  open,
  onOpenChange,
  organizationId,
  target,
  platformLabel,
  onCaptured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  target: GuidedCaptureTarget;
  /** "Instagram" — named in the line shown before the person goes. */
  platformLabel?: string;
  /** Called once when the job reaches Done, so the caller can refresh its data. */
  onCaptured?: () => void;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "intro" });
  const start = stage.kind === "watching" ? stage.start : null;
  const { view, readError } = useGuidedJob(start?.job.id ?? null, start?.job ?? null);

  const go = useCallback(async () => {
    setStage({ kind: "sending" });
    try {
      const started = await startGuidedCapture(target, organizationId);
      const opened = await guideCapture({
        organizationId,
        handoffId: started.job.id,
      });
      if (opened.kind === "no_extension") {
        setStage({ kind: "no_extension", sentence: opened.sentence });
      } else if (opened.kind === "refused") {
        setStage({ kind: "error", sentence: opened.sentence });
      } else {
        setStage({ kind: "watching", start: started });
      }
    } catch (err) {
      setStage({
        kind: "error",
        sentence: socialErrorMessage(err, "We couldn't start that capture"),
      });
    }
  }, [organizationId, target]);

  const close = (next: boolean) => {
    if (!next) setStage({ kind: "intro" });
    onOpenChange(next);
  };

  const phase = view?.phase ?? null;
  const finished = phase === "done" || phase === "saved_unread";
  const failed = phase === "failed" || phase === "skipped";

  // Fire once per finished job.
  const [notified, setNotified] = useState<string | null>(null);
  if (finished && start && notified !== start.job.id) {
    setNotified(start.job.id);
    onCaptured?.();
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="matrx-touch-targets max-w-md">
        <DialogHeader>
          <DialogTitle>{platformLabel ? `Capture ${platformLabel} in your browser` : "Capture in your browser"}</DialogTitle>
        </DialogHeader>

        {(stage.kind === "intro" ||
          stage.kind === "sending" ||
          stage.kind === "no_extension" ||
          stage.kind === "error") && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{guidedIntroBefore(platformLabel)}</p>
            {stage.kind === "no_extension" && (
              <p role="status" className="text-amber-600">
                {stage.sentence}{" "}
                <Link className="underline" href={EXTENSION_SETUP_ROUTE}>
                  Add the extension
                </Link>
              <ErrorAlchemyMenu /></p>
            )}
            {stage.kind === "error" && (
              <p role="alert" className="text-destructive">
                {stage.sentence}
              <ErrorAlchemyMenu /></p>
            )}
          </div>
        )}

        {stage.kind === "watching" && (
          <div className="space-y-3 text-sm" aria-live="polite">
            <p>
              <span className="font-medium">{view?.label ?? "Waiting for you"}</span>
              {phase === "waiting_for_you" && (
                <span className="text-muted-foreground">
                  {" "}
                  — finish on the other tab, then come back here.
                </span>
              )}
              {phase === "capturing" && (
                <span className="text-muted-foreground"> — saving what you captured.</span>
              )}
            </p>
            {!finished && !failed && start && start.steps.length > 0 && (
              <ol className="list-decimal space-y-1 pl-5">
                {start.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
            {finished && view?.sourceId && (
              <p data-error-box>
                {phase === "saved_unread"
                  ? "The page is saved with your captures. We couldn't read it into fields yet."
                  : "Your results are saved and attached to this account."}{" "}
                <Link
                  className="underline"
                  href={guidedResultHref(view.sourceId)}
                  target="_blank"
                >
                  See what was saved
                </Link>
              <ErrorAlchemyMenu /></p>
            )}
            {failed && (
              <p role="alert" className="text-destructive">
                {view?.failure ?? "This capture was closed before it finished."}
              <ErrorAlchemyMenu error={view?.failure} /></p>
            )}
            {readError && (
              <p role="status" className="text-amber-600">
                {readError}
              <ErrorAlchemyMenu error={readError} /></p>
            )}
          </div>
        )}

        <DialogFooter>
          {stage.kind === "watching" ? (
            finished ? (
              <Button onClick={() => close(false)}>Done</Button>
            ) : failed ? (
              <>
                <Button variant="outline" onClick={() => close(false)}>
                  Close
                </Button>
                <Button onClick={() => void go()}>Try again</Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => close(false)}>
                Close
              </Button>
            )
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => void go()}
                disabled={stage.kind === "sending"}
              >
                {stage.kind === "sending"
                  ? "Opening…"
                  : stage.kind === "error"
                    ? "Try again"
                    : "Take me there"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
