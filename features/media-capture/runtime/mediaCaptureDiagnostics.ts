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
 * It also carries two side tables for the ONE live capture — progress READERS
 * (`registerLiveCapture`, written by the recorder) and persistence CONTROLS
 * (`registerLiveCaptureControls`, written by the Capture Studio). Both hold
 * functions, so neither is in the snapshot; surfaces poll them. The controls
 * are what let the app-wide indicator and the navigation guard stop-and-SAVE a
 * recording from outside the studio component.
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

/**
 * The ONE live media-capture recording, as registered by the recording
 * orchestrator. Serializable identity only — the pause-aware elapsed clock and
 * controller state are READERS in a side table (`getLiveCaptureProgress`), so
 * the snapshot never churns on every tick.
 */
export interface LiveCaptureInfo {
  captureId: string;
  kind: "video" | "audio";
  label: string;
  sourceFeature: string;
  /** Epoch ms the recorder started. */
  startedAt: number;
}

/** Live readers for the active capture — polled by surfaces, never pushed. */
export interface LiveCaptureProgress {
  /** Pause-aware elapsed from the recorder controller (NOT wall clock). */
  elapsedMs: number;
  /** Controller state — "recording" | "paused" | "ended" | … */
  state: string;
}

/** Outcome of a salvage — a stop that finalizes AND persists in one step. */
export interface LiveCaptureSaveResult {
  fileId: string;
  /** True when chunks were lost or the stop was environmental. Callers MUST
   *  say so — a salvage never presents a partial artifact as whole. */
  partial: boolean;
}

/**
 * Controls for the live capture, registered by the SURFACE that owns
 * persistence (the Capture Studio) — deliberately NOT by the recorder.
 *
 * Layering: `video-recorder` owns capture and knows nothing about metadata,
 * folders, or uploads; the studio owns those. So identity + progress are
 * registered by the recorder (`registerLiveCapture`) while the controls that
 * can SAVE the artifact are registered here by the studio.
 *
 * These exist so a recording can be stopped-and-saved from OUTSIDE the studio
 * component — the app-wide indicator chip and the navigation guard. Before
 * this, leaving the route silently downgraded a live recording into an
 * "interrupted, recover what survived" journal.
 */
export interface LiveCaptureControls {
  pause(): void;
  resume(): void;
  /** Route the owning studio is mounted on, for "return to the recording". */
  returnPath: string;
  /**
   * Stop the recorder, assemble the artifact from the journal, and upload it.
   * Idempotent for one recording — concurrent callers share one salvage.
   * Throws when the media could not be saved; the journal stays preserved so
   * the recovery banner can still offer it.
   */
  stopAndSave(): Promise<LiveCaptureSaveResult>;
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
  /** The ONE live media-capture recording, or null. */
  liveCapture: LiveCaptureInfo | null;
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
  liveCapture: LiveCaptureInfo | null;
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
  liveCapture: null,
  unsubscribers: [],
};

const retryPayloads = new Map<string, CaptureRetryPayload>();

/** Live readers for the active capture — side table, never in the snapshot. */
let liveCaptureReaders: {
  getElapsedMs: () => number;
  getState: () => string;
} | null = null;

/** Live controls for the active capture — side table (functions), keyed by the
 *  capture they belong to so a stale registration can never drive a new one. */
let liveCaptureControls: {
  captureId: string;
  controls: LiveCaptureControls;
} | null = null;

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
    liveCapture: m.liveCapture,
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

/**
 * Register the live recording so surfaces (the Media window's Camera tab)
 * can show a REAL, pause-aware clock and identity without holding the
 * recorder handle. Called by the recording orchestrator on start; the
 * returned unregister runs on every terminal path.
 *
 * `readers` stay OUT of the snapshot (they are functions, and elapsed changes
 * continuously) — surfaces poll `getLiveCaptureProgress()` on their own tick.
 * Registering a second capture while one is live is a bug (captureLock
 * guarantees one at a time) and screams.
 */
export function registerLiveCapture(
  info: LiveCaptureInfo,
  readers: { getElapsedMs: () => number; getState: () => string },
): () => void {
  if (m.liveCapture !== null) {
    console.error(
      `[mediaCaptureDiagnostics] a live capture (${m.liveCapture.captureId}) was already registered when ${info.captureId} started — captureLock should make this impossible.`,
    );
  }
  m.liveCapture = info;
  liveCaptureReaders = readers;
  emit();
  return () => {
    if (m.liveCapture?.captureId !== info.captureId) return;
    m.liveCapture = null;
    liveCaptureReaders = null;
    // The capture is over — its controls can never be valid again. Clearing
    // here means no terminal path can strand a stop-and-save handle that would
    // drive a dead recorder.
    if (liveCaptureControls?.captureId === info.captureId) {
      liveCaptureControls = null;
    }
    emit();
  };
}

/**
 * Register the persistence controls for the live capture (see
 * `LiveCaptureControls`). Called by the Capture Studio right after the
 * recorder handle exists; the returned unregister runs on every terminal path.
 *
 * Controls stay OUT of the snapshot (they are functions). Surfaces read them
 * with `getLiveCaptureControls()` at interaction time — they already poll
 * `getLiveCaptureProgress()` on their own tick, so the brief window between
 * the recorder publishing its identity and the studio publishing its controls
 * resolves on the next tick with no extra emit.
 */
export function registerLiveCaptureControls(
  captureId: string,
  controls: LiveCaptureControls,
): () => void {
  liveCaptureControls = { captureId, controls };
  return () => {
    if (liveCaptureControls?.captureId !== captureId) return;
    liveCaptureControls = null;
  };
}

/** Controls for the active capture, or null when none is registered yet. */
export function getLiveCaptureControls(): LiveCaptureControls | null {
  if (!liveCaptureControls) return null;
  // Never hand back controls for a capture that is no longer the live one.
  if (m.liveCapture?.captureId !== liveCaptureControls.captureId) return null;
  return liveCaptureControls.controls;
}

/** Live elapsed + controller state for the active capture, or null. */
export function getLiveCaptureProgress(): LiveCaptureProgress | null {
  if (!liveCaptureReaders) return null;
  try {
    return {
      elapsedMs: liveCaptureReaders.getElapsedMs(),
      state: liveCaptureReaders.getState(),
    };
  } catch (err) {
    console.error("[mediaCaptureDiagnostics] live capture reader threw:", err);
    return null;
  }
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
  m.liveCapture = null;
  liveCaptureReaders = null;
  liveCaptureControls = null;
  retryPayloads.clear();
  emit();
}
