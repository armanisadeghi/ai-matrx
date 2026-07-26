"use client";

/**
 * features/media-capture/components/CaptureTransportStrip.tsx
 *
 * The ONE upload/transport strip for captures, rendered by BOTH the /camera
 * library and the Media window's Camera tab (extracted from CaptureLibrary so
 * the two can never drift):
 *
 *   • in-flight capture uploads with real percentages (the cloudFiles slice,
 *     via `useCaptureUploadFeed`);
 *   • failed uploads from the diagnostics ring, each with **Retry** — which
 *     re-invokes the CANONICAL `uploadCapture` from the ring's retained retry
 *     payload (the original File + validated metadata), never a second upload
 *     path — and Dismiss;
 *   • a resume-pending count for stored TUS sessions.
 *
 * Renders nothing when there is nothing to say — no empty chrome.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AlertTriangle, History, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { UploadCloud } from "lucide-react";
import { listStoredTusUploads, type StoredTusUploadSummary } from "@/features/files/upload/tusUpload";
import { uploadCapture } from "@/features/media-capture/upload/capture-uploader";
import {
  dismissCaptureFailure,
  getCaptureRetryPayload,
  getMediaCaptureDiagnostics,
  subscribeMediaCaptureDiagnostics,
} from "@/features/media-capture/runtime/mediaCaptureDiagnostics";
import { useCaptureUploadFeed } from "@/features/media-capture/hooks/useCaptureUploadFeed";

export function CaptureTransportStrip() {
  const uploads = useCaptureUploadFeed();
  const diagnostics = useSyncExternalStore(
    subscribeMediaCaptureDiagnostics,
    getMediaCaptureDiagnostics,
    getMediaCaptureDiagnostics,
  );
  const [tusPending, setTusPending] = useState<StoredTusUploadSummary[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listStoredTusUploads().then((entries) => {
      if (!cancelled) setTusPending(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [uploads.length]);

  const inFlight = uploads.filter(
    (u) => u.status === "uploading" || u.status === "pending",
  );
  const failedRing = diagnostics.failures.filter(
    (f) => f.scope === "upload" && f.retryable,
  );

  const handleRetry = useCallback(async (failureId: string) => {
    const payload = getCaptureRetryPayload(failureId);
    if (!payload) {
      // The payload fell off the bounded ring — say so, don't pretend.
      toast.error("The original capture is no longer held for retry.");
      dismissCaptureFailure(failureId);
      return;
    }
    setRetrying(failureId);
    try {
      await uploadCapture({ file: payload.file, capture: payload.capture });
      dismissCaptureFailure(failureId);
      toast.success(`"${payload.file.name}" uploaded.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed — try again.");
    } finally {
      setRetrying(null);
    }
  }, []);

  if (inFlight.length === 0 && failedRing.length === 0 && tusPending.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-card px-2.5 py-1.5">
      {inFlight.map((u) => (
        <div key={u.requestId} className="flex items-center gap-2 text-xs">
          <UploadCloud className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            Uploading {u.fileName}
          </span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {u.fileSize > 0
              ? `${Math.round((u.bytesUploaded / u.fileSize) * 100)}%`
              : "…"}
          </span>
        </div>
      ))}
      {failedRing.map((f) => (
        <div key={f.id} className="flex items-center gap-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            Upload failed — {f.message}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            disabled={retrying !== null}
            onClick={() => void handleRetry(f.id)}
          >
            {retrying === f.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <RefreshCw className="mr-1 h-3 w-3" />
                Retry
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px]"
            disabled={retrying !== null}
            onClick={() => dismissCaptureFailure(f.id)}
            aria-label="Dismiss failed upload"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      {tusPending.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <History className="h-3.5 w-3.5 shrink-0" />
          {tusPending.length} resumable upload session
          {tusPending.length === 1 ? "" : "s"} pending — re-saving the same file
          resumes instead of restarting.
        </div>
      )}
    </div>
  );
}
