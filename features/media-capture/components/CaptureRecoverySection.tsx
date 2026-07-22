"use client";

/**
 * features/media-capture/components/CaptureRecoverySection.tsx
 *
 * The ONE recoverable-recording-journal surface, rendered by BOTH the /camera
 * library and the Media window's Camera tab (extracted from CaptureLibrary so
 * the two can never drift). Lists every journal `listRecoverable()` reports
 * and offers exactly two actions:
 *
 *   • **Finish & save** → the SHARED `finishJournalRecovery(entry)` flow (the
 *     same code the Capture Studio banner runs — never a second assemble path);
 *   • **Discard** → drops the journal.
 *
 * Phrasing is LOUD and honest by rule (invariant 11): an interrupted journal is
 * described as interrupted, the segment count is shown before the user commits,
 * and the toast repeats the flow's own "Recovered N of M segment(s)" note. A
 * partial file is NEVER presented as whole.
 */

import { useCallback, useEffect, useState } from "react";
import { History, Loader2, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  discardJournal,
  listRecoverable,
  type RecoverableJournal,
} from "@/features/media-capture/recording/chunk-journal";
import { finishJournalRecovery } from "@/features/media-capture/recording/journal-recovery";
import { refreshCaptureJournals } from "@/features/media-capture/runtime/mediaCaptureDiagnostics";
import { formatBytes } from "@/features/media-capture/components/RecordingHud";

export interface CaptureRecoverySectionProps {
  /** Bumped by the host to force a re-read (e.g. after a studio save). */
  refreshToken?: number;
  /** Render a heading above the list (the Camera tab wants one). */
  heading?: string;
  /** Fired after a recovery successfully saved a new file. */
  onRecovered?: () => void;
}

export function CaptureRecoverySection({
  refreshToken = 0,
  heading,
  onRecovered,
}: CaptureRecoverySectionProps) {
  const [recoverables, setRecoverables] = useState<RecoverableJournal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const found = await listRecoverable();
        if (!cancelled) setRecoverables(found);
      } catch (err) {
        console.error("[CaptureRecoverySection] recovery listing failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const remove = useCallback((captureId: string) => {
    setRecoverables((prev) =>
      prev.filter((r) => r.manifest.capture_id !== captureId),
    );
    void refreshCaptureJournals();
  }, []);

  const handleFinish = useCallback(
    async (entry: RecoverableJournal) => {
      const id = entry.manifest.capture_id;
      setBusy(id);
      try {
        const result = await finishJournalRecovery(entry);
        remove(id);
        if (result.outcome === "empty") {
          toast.error("Nothing recoverable — no media chunks survived.");
        } else {
          // `recoveredNote` carries the flow's own "Recovered N of M
          // segment(s)" phrasing — never soften it to "saved".
          toast.success(`${result.recoveredNote} — saved to your captures.`);
          onRecovered?.();
        }
      } catch (err) {
        console.error("[CaptureRecoverySection] recovery failed", err);
        toast.error(
          err instanceof Error ? err.message : "Recovering the recording failed.",
        );
      } finally {
        setBusy(null);
      }
    },
    [onRecovered, remove],
  );

  const handleDiscard = useCallback(
    async (captureId: string) => {
      setBusy(captureId);
      try {
        await discardJournal(captureId);
      } catch (err) {
        console.error("[CaptureRecoverySection] recovery discard failed", err);
      } finally {
        setBusy(null);
      }
      remove(captureId);
    },
    [remove],
  );

  if (recoverables.length === 0) return null;

  return (
    <div className="space-y-1">
      {heading && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
          {heading} ({recoverables.length})
        </p>
      )}
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5">
        {recoverables.map((entry) => {
          const segments = entry.manifest.last_sequence + 1;
          const isAudio = entry.manifest.mime?.startsWith("audio/") ?? false;
          return (
            <div
              key={entry.manifest.capture_id}
              className="flex flex-wrap items-center gap-2 py-0.5 text-xs"
            >
              <History className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="min-w-0 flex-1 text-muted-foreground">
                {entry.interrupted ? "Interrupted" : "Unsaved"}{" "}
                {isAudio ? "audio" : "video"} recording —{" "}
                {segments} segment{segments === 1 ? "" : "s"},{" "}
                {formatBytes(entry.manifest.emitted_bytes)}, from{" "}
                {new Date(entry.manifest.created_at).toLocaleString()}.
                {entry.interrupted &&
                  " Only media captured before the interruption can be recovered."}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                disabled={busy !== null}
                onClick={() => void handleFinish(entry)}
              >
                {busy === entry.manifest.capture_id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Finish & save"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[11px]"
                disabled={busy !== null}
                onClick={() => void handleDiscard(entry.manifest.capture_id)}
                aria-label="Discard recovered recording"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
