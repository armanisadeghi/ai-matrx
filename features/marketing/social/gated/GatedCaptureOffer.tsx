"use client";

/**
 * The two ways to still get a page the data provider could not read (GATED-CAPTURE.md §6).
 * One component for every "couldn't read" state: Track dialog, account page, Accounts row.
 *
 *   Capture with my browser — background; inline status Queued → Capturing → Done / Failed.
 *   Take me there           — guided; the guided lane's dialog (steps, then the page).
 *
 * Results land on the account by themselves; `onCaptured` lets the host refresh its reads.
 */

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";

import { Button } from "@ai-matrx/design-system/controls";

import { CloudCaptureButton } from "./CloudCaptureButton";
import { GuidedCaptureButton } from "./GuidedCaptureButton";
import { startBackgroundCapture } from "./backgroundCapture";
import type { GuidedCaptureTarget } from "./guidedApi";
import { useGuidedJob } from "./useGuidedJob";
import type { CaptureHandoff } from "@/features/capture-ladder/types";

export function GatedCaptureOffer({
  organizationId,
  target,
  platformLabel,
  onCaptured,
  compact = false,
}: {
  organizationId: string;
  target: GuidedCaptureTarget;
  platformLabel?: string;
  onCaptured?: () => void;
  /** One row of buttons, no lead line (inside a dialog footer area). */
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<CaptureHandoff | null>(null);
  const [line, setLine] = useState<{ text: string; failed: boolean } | null>(null);
  const { view } = useGuidedJob(job?.id ?? null, job);

  useEffect(() => {
    if (view?.phase === "done" || view?.phase === "saved_unread") onCaptured?.();
  }, [view?.phase, onCaptured]);

  async function background() {
    setBusy(true);
    setLine(null);
    try {
      const started = await startBackgroundCapture(target, organizationId);
      setJob(started.job);
      if (started.handOff.kind !== "handed_over") {
        setLine({ text: started.handOff.sentence, failed: started.handOff.kind === "refused" });
      }
    } catch (err) {
      setLine({ text: err instanceof Error ? err.message : "Couldn't start the capture", failed: true });
    } finally {
      setBusy(false);
    }
  }

  const status = view
    ? view.failure ?? (view.phase === "saved_unread" ? "Saved, not read yet" : view.label)
    : null;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {compact ? null : (
        <p className="text-xs text-muted-foreground">Your own browser can still get it. Only your organization sees it.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button className="shrink-0" variant="outline" icon={<Globe />} onClick={() => void background()} disabled={busy || (view !== null && !view.terminal)}>
          {busy ? "Starting…" : "Capture with my browser"}
        </Button>
        <GuidedCaptureButton
          organizationId={organizationId}
          target={target}
          label="Take me there"
          {...(platformLabel ? { platformLabel } : {})}
          {...(onCaptured ? { onCaptured } : {})}
        />
        {status ? (
          <span role="status" aria-live="polite" className={`truncate text-xs ${view?.phase === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
            {status}
          </span>
        ) : null}
      </div>
      {line ? <p className={`text-xs ${line.failed ? "text-destructive" : "text-muted-foreground"}`}>{line.text}</p> : null}
      {compact ? null : (
        <CloudCaptureButton
          organizationId={organizationId}
          target={target}
          {...(onCaptured ? { onCaptured } : {})}
        />
      )}
    </div>
  );
}
