"use client";

/**
 * features/media-capture/components/LiveCaptureIndicator.tsx
 *
 * App-wide floating control for a LIVE media capture (Capture Studio video or
 * audio recording), plus the in-app navigation guard that keeps a recording
 * from being thrown away by a sidebar click.
 *
 * Why both live in one component: they are two faces of one question — "a
 * recording is live, what happens now?" — and both need the same subscription,
 * the same `stopAndSave`, and the same saving state. Splitting them would mean
 * two mounts and two copies of that state.
 *
 * The chip deliberately reuses the Scribe indicator's visual language
 * (`features/transcript-studio/components/recording/GlobalRecordingIndicator`)
 * so the app has ONE recording-chip idiom: bottom-centre pill, pulsing REC dot,
 * monospace clock, pause/resume, red stop with a finalizing spinner. Like that
 * one, it hides while you are on the surface that owns the recording — the
 * studio's own HUD is the control there.
 *
 * State sources (never wall clock, never a parallel store):
 *   • identity  → `mediaCaptureDiagnostics` snapshot (`liveCapture`)
 *   • clock     → `getLiveCaptureProgress()` — the recorder controller's own
 *                 PAUSE-AWARE monotonic clock, polled on a 250ms tick
 *   • controls  → `getLiveCaptureControls()` — registered by the Capture Studio
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Mic, Pause, Play, Square, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  getLiveCaptureControls,
  getLiveCaptureProgress,
  getMediaCaptureDiagnostics,
  subscribeMediaCaptureDiagnostics,
  type LiveCaptureInfo,
} from "@/features/media-capture/runtime/mediaCaptureDiagnostics";
import { interceptableHref } from "@/features/media-capture/runtime/live-capture-nav";
import { formatClock } from "@/features/media-capture/components/RecordingHud";

/** The live capture, or null. Server snapshot is null — capture is client-only. */
function useLiveCapture(): LiveCaptureInfo | null {
  return useSyncExternalStore(
    subscribeMediaCaptureDiagnostics,
    () => getMediaCaptureDiagnostics().liveCapture,
    () => null,
  );
}

export function LiveCaptureIndicator() {
  const live = useLiveCapture();
  const router = useRouter();
  const pathname = usePathname();
  const [saving, setSaving] = useState(false);

  // Render trigger for the clock. The value itself is read fresh below, so
  // there is no stored duration to go stale and no setState-in-effect cascade.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, [live]);

  /**
   * Stop the recording, finalize it, upload it. Resolves true when the media
   * is safely saved (or there was nothing live), false when it failed — the
   * caller decides whether to still navigate.
   */
  const stopAndSave = useCallback(async (): Promise<boolean> => {
    const controls = getLiveCaptureControls();
    if (!controls) return true;
    setSaving(true);
    try {
      const { partial } = await controls.stopAndSave();
      toast.success(
        partial
          ? "Recording saved to your captures — it was interrupted, so only the media captured before the interruption is included."
          : "Recording saved to your captures.",
      );
      return true;
    } catch (err) {
      console.error("[LiveCaptureIndicator] stop and save failed", err);
      toast.error(
        "Saving the recording failed. Open the camera to recover it from the interrupted-recording banner.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  // ── In-app navigation guard ───────────────────────────────────────────────
  //
  // `beforeunload` (armed by the studio) covers a tab close or reload, but it
  // does NOT fire on a client-side route change — which is exactly how a user
  // loses a recording: they click "Notes" in the sidebar and the studio
  // unmounts. Next.js App Router has no supported router-blocker, so the guard
  // intercepts the click that WOULD start the navigation, in the capture phase
  // before Link's own handler sees it.
  //
  // Coverage is honest: this catches anchor/`<Link>` clicks (the sidebar, the
  // header, tool grids). It does NOT catch browser back/forward or a
  // programmatic `router.push`. Those still land on the studio's unmount
  // salvage, which stops AND uploads the recording rather than dropping it to
  // the recovery banner.
  useEffect(() => {
    if (!live) return;
    const onClick = (e: MouseEvent): void => {
      const href = interceptableHref(e, window.location);
      if (href === null) return;
      e.preventDefault();
      e.stopPropagation();
      void (async () => {
        const ok = await confirm({
          title: "Recording in progress",
          description:
            "Leaving this page ends the recording. It can be stopped and saved to your captures first — or stay here and keep recording.",
          confirmLabel: "Stop, save, and leave",
          cancelLabel: "Keep recording",
        });
        if (!ok) return;
        await stopAndSave();
        router.push(href);
      })();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [live, router, stopAndSave]);

  if (!live) return null;

  const controls = getLiveCaptureControls();
  const progress = getLiveCaptureProgress();
  const paused = progress?.state === "paused";
  const returnPath = controls?.returnPath ?? "/camera";
  // The owning surface has its own record HUD — a second control there is
  // redundant clutter. While SAVING it stays up everywhere, so the user can
  // see their recording being rescued as the route changes under them.
  if (!saving && pathname === returnPath) return null;

  const KindIcon = live.kind === "video" ? Video : Mic;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      data-live-capture-allow-nav
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/95 py-1.5 pl-3 pr-1.5 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() => router.push(returnPath)}
          className="flex items-center gap-2 text-sm font-medium text-foreground"
          aria-label="Return to the recording"
        >
          <span className="relative flex h-2.5 w-2.5">
            {!paused && !saving && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
            )}
            <span
              className={cn(
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                paused || saving ? "bg-muted-foreground" : "bg-destructive",
              )}
            />
          </span>
          <KindIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono tabular-nums">
            {formatClock(progress?.elapsedMs ?? 0)}
          </span>
          <span className="text-xs text-muted-foreground">
            {saving
              ? "Saving…"
              : paused
                ? "Paused"
                : live.kind === "video"
                  ? "Recording video"
                  : "Recording audio"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => (paused ? controls?.resume() : controls?.pause())}
          disabled={!controls || saving}
          aria-label={paused ? "Resume recording" : "Pause recording"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground active:bg-accent disabled:opacity-60"
        >
          {paused ? (
            <Play className="h-4 w-4" />
          ) : (
            <Pause className="h-4 w-4" />
          )}
        </button>

        <button
          type="button"
          onClick={() => void stopAndSave()}
          disabled={!controls || saving}
          aria-label="Stop recording and save it"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground active:scale-95 disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Square className="h-4 w-4 fill-current" />
          )}
        </button>
      </div>
    </div>
  );
}

export default LiveCaptureIndicator;
