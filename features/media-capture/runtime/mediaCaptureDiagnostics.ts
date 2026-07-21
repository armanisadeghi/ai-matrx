/**
 * features/media-capture/runtime/mediaCaptureDiagnostics.ts
 *
 * The media-capture diagnostics registry — a framework-free, referentially
 * stable AGGREGATOR (audioSessionRegistry discipline: no React, no Redux, no
 * allocation until first use, snapshot recomputed ONLY on mutation). It owns
 * NO capture state of its own; it projects the live sources into one snapshot
 * for the Media control window's Camera tab, /camera, and /camera/admin:
 *
 *   • camera stream state (leases / pin owner / active spec) — subscribed
 *     from the camera stream manager;
 *   • captureLock holder (the app-wide recording arbiter);
 *   • media-capture recording sessions — filtered from audioSessionRegistry
 *     (source === "media-capture");
 *   • capture upload/transport state — FED IN from Redux (`feedUploadState`),
 *     called by a tiny client host hook (`useCaptureUploadFeed`) so this
 *     module never imports the store;
 *   • recoverable recording journals — refreshed ON DEMAND via
 *     `refreshCaptureJournals()` (listRecoverable is async IndexedDB; never
 *     polled from here);
 *   • a bounded recent-failure ring (`recordCaptureFailure`, MAX 50) written
 *     by the uploader / studio terminal-error paths. Retry payloads (the
 *     original File + validated metadata) live in a side table — they never
 *     enter the snapshot.
 *
 * Wiring to the live sources is LAZY (first getter/subscriber), never an
 * import side effect — importing this module must not touch the camera, the
 * lock, or the session registry.
 */

import {
  getCameraStreamState,
  subscribeCameraStream,
  type CameraStreamSnapshot,
} from "@/features/media-capture/runtime/camera-stream-manager";
import {
  getActiveCaptureId,
  subscribeCapture,
} from "@/features/audio/captureLock";
import { subscribeAudioSessions } from "@/features/audio/session/audioSessionRegistry";
import {
  listRecoverable,
  type JournalStatus,
} from "@/features/media-capture/recording/chunk-journal";
import type { CaptureMetadata } from "@/features/media-capture/core/capture-types";

// ─── Snapshot types ──────────────────────────────────────────────────────────

/** Upload/transport state fed from the cloudFiles slice (serializable). */
export interface CaptureUploadFeedEntry {
  requestId: string;
  fileName: string;
  fileSize: number;
  status: "pending" | "uploading" | "success" | "error" | "cancelled";
  bytesUploaded: number;
  error: string | null;
  fileId: string | null;
}

export interface CaptureRecordingSessionInfo {
  id: string;
  label: string;
  status: string;
  createdAtMs: number;
}

export interface CaptureJournalSummary {
  captureId: string;
  status: JournalStatus;
  interrupted: boolean;
  mime: string | null;
  emittedBytes: number;
  lastSequence: number;
  createdAt: number;
  sourceFeature: string;
}

export type CaptureFailureScope =
  | "upload"
  | "recording"
  | "recovery"
  | "camera";

export interface CaptureFailureEntry {
  id: string;
  at: number; // epoch ms
  scope: CaptureFailureScope;
  message: string;
  /** True when a retry payload (File + metadata) is retained for this entry. */
  retryable: boolean;
}

export interface MediaCaptureDiagnosticsSnapshot {
  camera: CameraStreamSnapshot;
  /** captureLock holder id (e.g. "media-capture-recording"), or null. */
  captureLockOwner: string | null;
  /** Human label of the lock holder when it provided one. */
  captureLockLabel: string | null;
  /** Live + recent recording sessions registered by media-capture. */
  recordingSessions: CaptureRecordingSessionInfo[];
  /** Capture upload transport state (fed by useCaptureUploadFeed). */
  uploads: CaptureUploadFeedEntry[];
  /** Recoverable recording journals (as of the last refresh). */
  journals: CaptureJournalSummary[];
  /** Epoch ms of the last successful journal refresh, or null. */
  journalsRefreshedAt: number | null;
  /** Bounded recent-failure ring, newest first. */
  failures: CaptureFailureEntry[];
}

/** Retry payload retained beside a failed-upload ring entry. */
export interface CaptureRetryPayload {
  file: File;
  capture: CaptureMetadata;
}

/** Ring bound — oldest entries fall off past this. */
export const MAX_CAPTURE_FAILURES = 50;

// ─── Internals ───────────────────────────────────────────────────────────────

interface RegistryInternal {
  wired: boolean;
  captureLockOwner: string | null;
  captureLockLabel: string | null;
  recordingSessions: CaptureRecordingSessionInfo[];
  uploads: CaptureUploadFeedEntry[];
  journals: CaptureJournalSummary[];
  journalsRefreshedAt: number | null;
  failures: CaptureFailureEntry[];
  unsubscribers: Array<() => void>;
}

const m: RegistryInternal = {
  wired: false,
  captureLockOwner: null,
  captureLockLabel: null,
  recordingSessions: [],
  uploads: [],
  journals: [],
  journalsRefreshedAt: null,
  failures: [],
  unsubscribers: [],
};

const retryPayloads = new Map<string, CaptureRetryPayload>();

let failureSeq = 0;

type Listener = (snapshot: MediaCaptureDiagnosticsSnapshot) => void;
const listeners = new Set<Listener>();

// Referentially stable snapshot — recomputed ONLY inside emit().
let cachedSnapshot: MediaCaptureDiagnosticsSnapshot = buildSnapshot();

function buildSnapshot(): MediaCaptureDiagnosticsSnapshot {
  return {
    camera: getCameraStreamState(),
    captureLockOwner: m.captureLockOwner,
    captureLockLabel: m.captureLockLabel,
    recordingSessions: m.recordingSessions,
    uploads: m.uploads,
    journals: m.journals,
    journalsRefreshedAt: m.journalsRefreshedAt,
    failures: m.failures,
  };
}

function emit(): void {
  cachedSnapshot = buildSnapshot();
  for (const l of listeners) {
    try {
      l(cachedSnapshot);
    } catch (err) {
      console.error("[mediaCaptureDiagnostics] listener threw:", err);
    }
  }
}

/** Lazy wiring to the live sources — first read/subscribe, never at import. */
function ensureWired(): void {
  if (m.wired) return;
  m.wired = true;

  m.unsubscribers.push(
    subscribeCameraStream(() => {
      // Camera snapshot is read live in buildSnapshot(); just re-emit.
      emit();
    }),
  );

  m.captureLockOwner = getActiveCaptureId();
  m.unsubscribers.push(
    subscribeCapture((holder) => {
      m.captureLockOwner = holder?.id ?? null;
      m.captureLockLabel = holder?.label ?? null;
      emit();
    }),
  );

  m.unsubscribers.push(
    subscribeAudioSessions((snap) => {
      const next: CaptureRecordingSessionInfo[] = snap.sessions
        .filter((s) => s.source === "media-capture")
        .map((s) => ({
          id: s.id,
          label: s.label,
          status: s.status,
          createdAtMs: s.createdAtMs,
        }));
      // Cheap identity guard — the audio registry notifies on EVERY session
      // change; only re-emit when our filtered projection actually changed.
      if (
        next.length === m.recordingSessions.length &&
        next.every((s, i) => {
          const prev = m.recordingSessions[i];
          return (
            s.id === prev.id &&
            s.status === prev.status &&
            s.label === prev.label
          );
        })
      ) {
        return;
      }
      m.recordingSessions = next;
      emit();
    }),
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Current referentially-stable snapshot (useSyncExternalStore-safe). */
export function getMediaCaptureDiagnostics(): MediaCaptureDiagnosticsSnapshot {
  ensureWired();
  return cachedSnapshot;
}

/** Subscribe to snapshot changes. Returns an unsubscribe fn. */
export function subscribeMediaCaptureDiagnostics(
  listener: Listener,
): () => void {
  ensureWired();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Feed capture upload/transport state from Redux. Called by the client host
 * hook (`useCaptureUploadFeed`) — this module stays framework-free. No-op
 * when the fed entries are shallow-equal to the current ones.
 */
export function feedUploadState(entries: CaptureUploadFeedEntry[]): void {
  if (
    entries.length === m.uploads.length &&
    entries.every((e, i) => {
      const prev = m.uploads[i];
      return (
        e.requestId === prev.requestId &&
        e.status === prev.status &&
        e.bytesUploaded === prev.bytesUploaded &&
        e.error === prev.error &&
        e.fileId === prev.fileId
      );
    })
  ) {
    return;
  }
  m.uploads = entries;
  emit();
}

/**
 * Refresh the recoverable-journal summaries from IndexedDB (on demand — the
 * registry never polls). Errors are loud but non-fatal: the previous
 * summaries stay in place.
 */
export async function refreshCaptureJournals(): Promise<void> {
  try {
    const found = await listRecoverable();
    m.journals = found.map((r) => ({
      captureId: r.manifest.capture_id,
      status: r.manifest.status,
      interrupted: r.interrupted,
      mime: r.manifest.mime,
      emittedBytes: r.manifest.emitted_bytes,
      lastSequence: r.manifest.last_sequence,
      createdAt: r.manifest.created_at,
      sourceFeature: r.manifest.source_feature,
    }));
    m.journalsRefreshedAt = Date.now();
    emit();
  } catch (err) {
    console.error("[mediaCaptureDiagnostics] journal refresh failed:", err);
  }
}

/**
 * Record a terminal capture failure into the bounded ring (newest first).
 * Pass `retry` (the original File + validated metadata) for failed UPLOADS so
 * surfaces can re-invoke the uploader; the payload lives in a side table and
 * is dropped when the entry falls off the ring or is dismissed.
 */
export function recordCaptureFailure(input: {
  scope: CaptureFailureScope;
  message: string;
  retry?: CaptureRetryPayload;
}): string {
  const id = `capfail_${Date.now().toString(36)}_${++failureSeq}`;
  const entry: CaptureFailureEntry = {
    id,
    at: Date.now(),
    scope: input.scope,
    message: input.message,
    retryable: !!input.retry,
  };
  if (input.retry) retryPayloads.set(id, input.retry);
  const next = [entry, ...m.failures];
  if (next.length > MAX_CAPTURE_FAILURES) {
    for (const dropped of next.splice(MAX_CAPTURE_FAILURES)) {
      retryPayloads.delete(dropped.id);
    }
  }
  m.failures = next;
  emit();
  return id;
}

/** Retained retry payload for a ring entry, if any. */
export function getCaptureRetryPayload(
  failureId: string,
): CaptureRetryPayload | null {
  return retryPayloads.get(failureId) ?? null;
}

/** Remove a ring entry (after a successful retry, or user dismissal). */
export function dismissCaptureFailure(failureId: string): void {
  const next = m.failures.filter((f) => f.id !== failureId);
  if (next.length === m.failures.length) return;
  retryPayloads.delete(failureId);
  m.failures = next;
  emit();
}

/** Test escape hatch — unwires sources and clears everything. */
export function __resetMediaCaptureDiagnostics(): void {
  for (const unsub of m.unsubscribers) {
    try {
      unsub();
    } catch {
      // ignore
    }
  }
  m.unsubscribers = [];
  m.wired = false;
  m.captureLockOwner = null;
  m.captureLockLabel = null;
  m.recordingSessions = [];
  m.uploads = [];
  m.journals = [];
  m.journalsRefreshedAt = null;
  m.failures = [];
  retryPayloads.clear();
  emit();
}
