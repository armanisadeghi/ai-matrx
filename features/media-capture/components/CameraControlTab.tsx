"use client";

/**
 * features/media-capture/components/CameraControlTab.tsx
 *
 * The Camera tab of the Media control window — the capture twin of the
 * Recording tab, in the same order and with the same vocabulary:
 *
 *   1. **Live capture** — the pinging REC dot, the kind/label, the recorder's
 *      REAL pause-aware elapsed clock (polled from the diagnostics live-capture
 *      readers, never wall clock), and Stop (routed through the audio session
 *      registry's control side-table — the same `control(id, "stop")` the
 *      Recording tab uses; no parallel recorder handle here).
 *   2. **Recovery** — recoverable journals, actionable IN PLACE via the shared
 *      `<CaptureRecoverySection>` (Finish & save runs the one
 *      `finishJournalRecovery` flow). Previously this tab could only link to
 *      /camera.
 *   3. **Transport** — in-flight uploads, failed uploads with Retry, TUS
 *      resume-pending, via the shared `<CaptureTransportStrip>`.
 *   4. **This session** — every capture uploaded from this browser session,
 *      each with a thumbnail, kind, status, and the full per-item action menu
 *      (`<CaptureItemActions>` → Preview / Download / Rename / Move / Share /
 *      Transcribe / Delete, all on the canonical files action stack).
 *   5. **Diagnostics** — the original read-only lease/lock/spec readout, now
 *      collapsed behind a disclosure so the tab leads with what a user cares
 *      about. It still NEVER acquires a camera or prompts — snapshots only.
 *
 * Mobile: the parent window renders this inside a stacked section (no tabs),
 * so this component only ever emits a vertical stack.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Camera,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileAudio,
  ImageIcon,
  Loader2,
  Lock,
  StopCircle,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files";
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import { useAudioSessions } from "@/features/audio/session/useAudioSessions";
import {
  getLiveCaptureProgress,
  getMediaCaptureDiagnostics,
  refreshCaptureJournals,
  subscribeMediaCaptureDiagnostics,
  type CaptureUploadFeedEntry,
  type LiveCaptureInfo,
} from "@/features/media-capture/runtime/mediaCaptureDiagnostics";
import { useCaptureUploadFeed } from "@/features/media-capture/hooks/useCaptureUploadFeed";
import { CaptureRecoverySection } from "@/features/media-capture/components/CaptureRecoverySection";
import { CaptureTransportStrip } from "@/features/media-capture/components/CaptureTransportStrip";
import {
  CaptureItemActions,
  type CaptureItemKind,
} from "@/features/media-capture/components/CaptureItemActions";
import { formatClock } from "@/features/media-capture/components/RecordingHud";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function Row({
  label,
  value,
  alert,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right font-mono text-[11px] tabular-nums",
          alert ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function CameraControlTab() {
  // Keep the registry fed with upload/transport state while this tab shows it.
  const uploads = useCaptureUploadFeed();
  const snap = useSyncExternalStore(
    subscribeMediaCaptureDiagnostics,
    getMediaCaptureDiagnostics,
    getMediaCaptureDiagnostics,
  );

  // Journal summaries are on-demand (IndexedDB) — refresh when the tab opens.
  const [recoveryToken, setRecoveryToken] = useState(0);
  useEffect(() => {
    void refreshCaptureJournals();
  }, []);

  return (
    <div className="space-y-3">
      <LiveCapture live={snap.liveCapture} />

      <CaptureRecoverySection
        refreshToken={recoveryToken}
        heading="Unsaved recordings"
        onRecovered={() => setRecoveryToken((t) => t + 1)}
      />

      <CaptureTransportStrip />

      <SessionCaptures uploads={uploads} />

      <DiagnosticsDisclosure snap={snap} />
    </div>
  );
}

// ─── 1. Live capture ─────────────────────────────────────────────────────────

function LiveCapture({ live }: { live: LiveCaptureInfo | null }) {
  const { recording, control, can } = useAudioSessions();
  // Poll the recorder's own PAUSE-AWARE clock (never wall clock). A 250ms tick
  // is smooth at the 1s resolution we display. `tick` is the render trigger;
  // the value itself is read fresh below, so there is no synchronous setState
  // in the effect and no stale-clock cascade.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, [live]);
  const progress = live ? getLiveCaptureProgress() : null;

  if (!live) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
        <Camera className="h-4 w-4 shrink-0" />
        Not capturing
      </div>
    );
  }

  const paused = progress?.state === "paused";
  // The ONE media-capture session in the registry is this capture (captureLock
  // guarantees one at a time) — it carries the stop control.
  const session = recording.find(
    (s) =>
      s.source === "media-capture" &&
      (s.status === "active" || s.status === "paused"),
  );

  return (
    <section className="space-y-1.5">
      <SectionLabel>Capturing</SectionLabel>
      <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {!paused && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70" />
            )}
            <span
              className={cn(
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                paused ? "bg-amber-500" : "bg-red-500",
              )}
            />
          </span>
          {live.kind === "video" ? (
            <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <FileAudio className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">
              {live.label}
              {paused && (
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                  (paused)
                </span>
              )}
            </p>
          </div>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {progress ? formatClock(progress.elapsedMs) : "--:--"}
          </span>
          {session && can(session.id, "stop") && (
            <button
              type="button"
              onClick={() => control(session.id, "stop")}
              title="Stop capture"
              aria-label="Stop capture"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-600 transition-colors hover:bg-red-500/20 dark:text-red-400 [&_svg]:h-3.5 [&_svg]:w-3.5"
            >
              <StopCircle />
            </button>
          )}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {live.sourceFeature} · capture {live.captureId}
        </p>
      </div>
    </section>
  );
}

// ─── 4. This session's captures ──────────────────────────────────────────────

function SessionCaptures({ uploads }: { uploads: CaptureUploadFeedEntry[] }) {
  // Newest first — the feed is oldest-first by upload start.
  const rows = [...uploads].reverse();
  return (
    <section className="space-y-1.5">
      <SectionLabel>This session ({rows.length})</SectionLabel>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
          No captures saved in this browser session. Everything you have ever
          captured lives on{" "}
          <Link href="/camera" className="text-primary underline">
            /camera
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((u) => (
            <SessionCaptureRow key={u.requestId} entry={u} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionCaptureRow({ entry }: { entry: CaptureUploadFeedEntry }) {
  const file = useAppSelector((s) =>
    entry.fileId ? selectFileById(s, entry.fileId) : undefined,
  );

  const mime = file?.mimeType ?? "";
  const kind: CaptureItemKind = mime.startsWith("video/")
    ? "video"
    : mime.startsWith("audio/")
      ? "audio"
      : mime.startsWith("image/")
        ? "photo"
        : guessKindFromName(entry.fileName);

  const saved = entry.status === "success" && entry.fileId !== null;
  const failed = entry.status === "error" || entry.status === "cancelled";

  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/40">
        {saved && entry.fileId && kind !== "audio" ? (
          <CaptureThumb fileId={entry.fileId} alt={entry.fileName} />
        ) : kind === "video" ? (
          <Video className="h-3.5 w-3.5 text-muted-foreground" />
        ) : kind === "audio" ? (
          <FileAudio className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-foreground">{entry.fileName}</p>
        <p
          className={cn(
            "truncate text-[10px]",
            failed ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {statusLine(entry)}
        </p>
      </div>

      {entry.status === "uploading" || entry.status === "pending" ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      ) : null}

      {saved && entry.fileId ? (
        <CaptureItemActions
          fileId={entry.fileId}
          fileName={file?.fileName ?? entry.fileName}
          kind={kind}
          parentFolderId={file?.parentFolderId ?? null}
        />
      ) : null}
    </li>
  );
}

function statusLine(entry: CaptureUploadFeedEntry): string {
  switch (entry.status) {
    case "pending":
      return "Queued";
    case "uploading":
      return entry.fileSize > 0
        ? `Uploading ${Math.round((entry.bytesUploaded / entry.fileSize) * 100)}%`
        : "Uploading";
    case "success":
      // A "success" with no file id is NOT a saved capture — say so.
      return entry.fileId ? "Saved" : "Uploaded, but no file id was returned";
    case "cancelled":
      return "Cancelled";
    case "error":
      return entry.error ?? "Upload failed";
  }
}

function guessKindFromName(name: string): CaptureItemKind {
  const lower = name.toLowerCase();
  if (/\.(mp4|webm|mov|mkv)$/.test(lower)) return "video";
  if (/\.(m4a|mp3|ogg|wav|webm-audio)$/.test(lower)) return "audio";
  return "photo";
}

// ─── 5. Diagnostics (collapsed) ──────────────────────────────────────────────

function DiagnosticsDisclosure({
  snap,
}: {
  snap: ReturnType<typeof getMediaCaptureDiagnostics>;
}) {
  const [open, setOpen] = useState(false);
  const spec = snap.camera.activeSpec;

  return (
    <section className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Diagnostics
      </button>
      {open && (
        <div className="space-y-3">
          <div className="space-y-1 rounded-lg border border-border bg-card px-2.5 py-2">
            <div className="flex items-center gap-2 pb-1 text-xs">
              <Camera
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  snap.camera.state === "active"
                    ? "text-green-600 dark:text-green-400"
                    : "text-muted-foreground",
                )}
              />
              <span className="font-medium capitalize text-foreground">
                {snap.camera.state}
              </span>
            </div>
            <Row label="Active leases" value={String(snap.camera.leaseCount)} />
            <Row
              label="Requested spec"
              value={
                spec
                  ? `${spec.profile} · ${spec.facingMode ?? "auto-facing"} · ${spec.deviceId ? "pinned device" : "auto device"}`
                  : "—"
              }
            />
            <Row
              label="Recording pin"
              value={snap.camera.pinnedBy ?? "none"}
              alert={snap.camera.pinnedBy !== null}
            />
          </div>

          <div className="space-y-1 rounded-lg border border-border bg-card px-2.5 py-2">
            <div className="flex items-center gap-2 pb-1 text-xs">
              <Lock
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  snap.captureLockOwner
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground",
                )}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">
                {snap.captureLockOwner
                  ? `Capture lock held by ${snap.captureLockLabel ?? snap.captureLockOwner}`
                  : "Capture lock free"}
              </span>
            </div>
            {snap.recordingSessions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No media-capture recording sessions this browser session.
              </p>
            ) : (
              snap.recordingSessions.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <CircleDot
                    className={cn(
                      "h-3 w-3 shrink-0",
                      s.status === "active"
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {s.label}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                    {s.status}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="space-y-1 rounded-lg border border-border bg-card px-2.5 py-2">
            <Row
              label="Recoverable journals"
              value={String(snap.journals.length)}
              alert={snap.journals.length > 0}
            />
            <Row
              label="Recent failures"
              value={String(snap.failures.length)}
              alert={snap.failures.length > 0}
            />
            <Row
              label="Journals refreshed"
              value={
                snap.journalsRefreshedAt
                  ? new Date(snap.journalsRefreshedAt).toLocaleTimeString()
                  : "never"
              }
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Full read-only diagnostics live on{" "}
            <Link href="/camera/admin" className="text-primary underline">
              /camera/admin
            </Link>
            .
          </p>
        </div>
      )}
    </section>
  );
}
