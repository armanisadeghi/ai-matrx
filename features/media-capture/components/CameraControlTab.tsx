"use client";

/**
 * features/media-capture/components/CameraControlTab.tsx
 *
 * The Camera tab of the Media control window (AudioControlWindow) — a
 * READ-ONLY live view over `mediaCaptureDiagnostics`: active camera leases
 * (count / spec / effective settings), the recording pin + captureLock
 * owners, live media-capture recording sessions, capture upload/transport
 * state, and recoverable recording journals (with a link to /camera where
 * recovery lives). It NEVER acquires a camera or prompts — snapshots only.
 */

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { Camera, CircleDot, HardDriveDownload, Lock, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getMediaCaptureDiagnostics,
  subscribeMediaCaptureDiagnostics,
  refreshCaptureJournals,
} from "@/features/media-capture/runtime/mediaCaptureDiagnostics";
import { useCaptureUploadFeed } from "@/features/media-capture/hooks/useCaptureUploadFeed";

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
  useCaptureUploadFeed();
  const snap = useSyncExternalStore(
    subscribeMediaCaptureDiagnostics,
    getMediaCaptureDiagnostics,
    getMediaCaptureDiagnostics,
  );

  // Journal summaries are on-demand (IndexedDB) — refresh when the tab opens.
  useEffect(() => {
    void refreshCaptureJournals();
  }, []);

  const spec = snap.camera.activeSpec;
  const activeUploads = snap.uploads.filter(
    (u) => u.status === "uploading" || u.status === "pending",
  );
  const failedUploads = snap.uploads.filter((u) => u.status === "error");

  return (
    <div className="space-y-3">
      <section className="space-y-1.5">
        <SectionLabel>Camera stream</SectionLabel>
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
            <span className="font-medium text-foreground capitalize">
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
      </section>

      <section className="space-y-1.5">
        <SectionLabel>Recording</SectionLabel>
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
      </section>

      <section className="space-y-1.5">
        <SectionLabel>Transport</SectionLabel>
        <div className="space-y-1 rounded-lg border border-border bg-card px-2.5 py-2">
          <div className="flex items-center gap-2 pb-1 text-xs">
            <UploadCloud className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-foreground">
              {activeUploads.length} uploading · {failedUploads.length} failed
            </span>
          </div>
          {activeUploads.map((u) => (
            <Row
              key={u.requestId}
              label={u.fileName}
              value={
                u.fileSize > 0
                  ? `${Math.round((u.bytesUploaded / u.fileSize) * 100)}%`
                  : "…"
              }
            />
          ))}
          {failedUploads.map((u) => (
            <Row key={u.requestId} label={u.fileName} value="failed" alert />
          ))}
          {(failedUploads.length > 0 || snap.failures.length > 0) && (
            <p className="pt-1 text-[11px] text-muted-foreground">
              Retry failed capture uploads on{" "}
              <Link href="/camera" className="text-primary underline">
                /camera
              </Link>
              .
            </p>
          )}
        </div>
      </section>

      <section className="space-y-1.5">
        <SectionLabel>Recovery</SectionLabel>
        <div className="space-y-1 rounded-lg border border-border bg-card px-2.5 py-2">
          <div className="flex items-center gap-2 text-xs">
            <HardDriveDownload
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                snap.journals.length > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground",
              )}
            />
            <span className="min-w-0 flex-1 truncate text-foreground">
              {snap.journals.length === 0
                ? "No recoverable recording journals"
                : `${snap.journals.length} recoverable recording journal${snap.journals.length === 1 ? "" : "s"}`}
            </span>
            {snap.journals.length > 0 && (
              <Link
                href="/camera"
                className="shrink-0 text-[11px] text-primary underline"
              >
                Recover on /camera
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
