"use client";

/**
 * features/media-capture/components/CameraAdminDiagnostics.tsx
 *
 * Read-only client diagnostics for /camera/admin, fed by
 * `mediaCaptureDiagnostics` + the device manager + capability probes:
 * supported recording MIMEs (`recordingMimeCandidates` against
 * `MediaRecorder.isTypeSupported`), permission states, detected devices
 * (counts always; labels only when permission is already granted — labels
 * are never persisted), active lease/pin/lock owners, applied spec,
 * transport state, recoverable journals + TUS resume sessions, and the
 * recent-failure ring.
 *
 * HARD RULE: opening this page NEVER acquires a camera/mic and never
 * prompts — everything here is a snapshot of state other surfaces created.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import {
  getMediaDevicesSnapshot,
  subscribeMediaDevices,
} from "@/features/media-devices/deviceManager";
import { recordingMimeCandidates } from "@/features/media-capture/core/mime-selection";
import {
  getMediaCaptureDiagnostics,
  subscribeMediaCaptureDiagnostics,
  refreshCaptureJournals,
} from "@/features/media-capture/runtime/mediaCaptureDiagnostics";
import { useCaptureUploadFeed } from "@/features/media-capture/hooks/useCaptureUploadFeed";
import { listStoredTusUploads, type StoredTusUploadSummary } from "@/features/files/upload/tusUpload";

function probeRecordingMimes(kind: "video" | "audio"): string[] {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return [];
  }
  return recordingMimeCandidates(kind, (t) =>
    MediaRecorder.isTypeSupported(t),
  ).filter((c): c is string => c !== null);
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-1 align-top">{children}</td>;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="rounded-md border border-border bg-card px-2.5 py-2 text-xs">
        {children}
      </div>
    </section>
  );
}

function KV({ k, v, alert }: { k: string; v: string; alert?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right font-mono text-[11px]",
          alert ? "text-destructive" : "text-foreground",
        )}
      >
        {v}
      </span>
    </div>
  );
}

export function CameraAdminDiagnostics() {
  useCaptureUploadFeed();
  const snap = useSyncExternalStore(
    subscribeMediaCaptureDiagnostics,
    getMediaCaptureDiagnostics,
    getMediaCaptureDiagnostics,
  );
  const devices = useSyncExternalStore(
    subscribeMediaDevices,
    getMediaDevicesSnapshot,
    getMediaDevicesSnapshot,
  );

  // Client-only capability probe. Async by convention (never setState
  // synchronously in the effect body) — also sidesteps any SSR/hydration
  // mismatch since the server never sees a probed value.
  const [probes, setProbes] = useState<{
    video: string[];
    audio: string[];
  } | null>(null);
  const [tusPending, setTusPending] = useState<StoredTusUploadSummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setProbes({
        video: probeRecordingMimes("video"),
        audio: probeRecordingMimes("audio"),
      });
    });
    void refreshCaptureJournals();
    void listStoredTusUploads().then((entries) => {
      if (!cancelled) setTusPending(entries);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const videoMimes = probes?.video ?? [];
  const audioMimes = probes?.audio ?? [];

  const cameraLabelsUnlocked = devices.cameraPermissionState === "granted";
  const micLabelsUnlocked = devices.permissionState === "granted";
  const spec = snap.camera.activeSpec;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Section title="Supported recording MIMEs (this browser)">
        <KV k="Video ladder" v={videoMimes.length ? "" : "probing…"} />
        <ul className="mb-1 font-mono text-[11px] text-foreground">
          {videoMimes.map((m) => (
            <li key={m} className="truncate">
              {m}
            </li>
          ))}
        </ul>
        <KV k="Audio ladder" v={audioMimes.length ? "" : "probing…"} />
        <ul className="font-mono text-[11px] text-foreground">
          {audioMimes.map((m) => (
            <li key={m} className="truncate">
              {m}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Permissions & devices (no prompt — snapshot only)">
        <KV
          k="Camera permission"
          v={devices.cameraPermissionState}
          alert={devices.cameraPermissionState === "denied"}
        />
        <KV
          k="Microphone permission"
          v={devices.permissionState}
          alert={devices.permissionState === "denied"}
        />
        <KV k="Cameras detected" v={String(devices.cameras.length)} />
        <KV k="Microphones detected" v={String(devices.inputs.length)} />
        <KV k="Speakers detected" v={String(devices.outputs.length)} />
        {cameraLabelsUnlocked && devices.cameras.length > 0 && (
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            Cameras: {devices.cameras.map((c) => c.label || "(unnamed)").join(", ")}
          </p>
        )}
        {micLabelsUnlocked && devices.inputs.length > 0 && (
          <p className="truncate text-[11px] text-muted-foreground">
            Mics: {devices.inputs.map((c) => c.label || "(unnamed)").join(", ")}
          </p>
        )}
      </Section>

      <Section title="Camera stream / lock owners">
        <KV k="Stream state" v={snap.camera.state} />
        <KV k="Active leases" v={String(snap.camera.leaseCount)} />
        <KV
          k="Applied spec"
          v={
            spec
              ? `${spec.profile} · ${spec.facingMode ?? "auto"} · ${spec.deviceId ? "explicit device" : "auto device"}`
              : "—"
          }
        />
        <KV
          k="Recording pin"
          v={snap.camera.pinnedBy ?? "none"}
          alert={snap.camera.pinnedBy !== null}
        />
        <KV
          k="captureLock holder"
          v={
            snap.captureLockOwner
              ? (snap.captureLockLabel ?? snap.captureLockOwner)
              : "free"
          }
          alert={snap.captureLockOwner !== null}
        />
        <KV
          k="Live capture sessions"
          v={String(
            snap.recordingSessions.filter((s) => s.status === "active").length,
          )}
        />
      </Section>

      <Section title="Transport & recovery">
        <KV
          k="Capture uploads in flight"
          v={String(
            snap.uploads.filter(
              (u) => u.status === "uploading" || u.status === "pending",
            ).length,
          )}
        />
        <KV
          k="Failed capture uploads"
          v={String(snap.uploads.filter((u) => u.status === "error").length)}
          alert={snap.uploads.some((u) => u.status === "error")}
        />
        <KV k="TUS resume sessions stored" v={String(tusPending.length)} />
        <KV
          k="Recoverable journals"
          v={String(snap.journals.length)}
          alert={snap.journals.length > 0}
        />
        <KV
          k="Journals refreshed"
          v={
            snap.journalsRefreshedAt
              ? new Date(snap.journalsRefreshedAt).toLocaleTimeString()
              : "never"
          }
        />
      </Section>

      <section className="space-y-1 md:col-span-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Recent capture failures (ring, max 50, this session)
        </h3>
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          {snap.failures.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">
              No capture failures recorded this session.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase text-muted-foreground">
                  <th className="px-2 py-1 font-medium">Time</th>
                  <th className="px-2 py-1 font-medium">Scope</th>
                  <th className="px-2 py-1 font-medium">Message</th>
                  <th className="px-2 py-1 font-medium">Retryable</th>
                </tr>
              </thead>
              <tbody>
                {snap.failures.map((f) => (
                  <tr key={f.id} className="border-b border-border/50">
                    <Cell>
                      <span className="font-mono tabular-nums">
                        {new Date(f.at).toLocaleTimeString()}
                      </span>
                    </Cell>
                    <Cell>{f.scope}</Cell>
                    <Cell>
                      <span className="text-muted-foreground">{f.message}</span>
                    </Cell>
                    <Cell>{f.retryable ? "yes" : "no"}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
