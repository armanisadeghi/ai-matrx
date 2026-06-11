// features/voice-agent/debug/voiceDebugBus.ts
//
// A tiny, React-free, Redux-free instrumentation bus for the xAI voice
// session. The voice stack is mostly imperative module singletons (token
// manager, WebSocket client, audio capture/playback) whose lifecycle never
// touches Redux — so when "Live" misbehaves there is nothing to look at.
//
// This bus is the missing window. The orchestrator hook and (optionally) the
// transport modules push two kinds of signal here:
//
//   1. LOG entries — discrete, timestamped lifecycle events (a ring buffer,
//      newest last). "start clicked", "token minted", "ws open", "ws closed
//      (network)", "mic granted", "watchdog: connection lost", etc.
//   2. FLAGS — a live snapshot of the current connection state (ws open,
//      streaming-ready, mic active, token seconds-to-expiry, mic permission).
//
// Everything is keyed by `instanceId` so multiple voice surfaces don't bleed
// into each other. A UI panel subscribes and renders. Nothing here runs in the
// hot audio path — only lifecycle transitions are logged.

export type VoiceDebugLevel = "info" | "warn" | "error";

export interface VoiceDebugEntry {
  id: number;
  /** Date.now() at emit. */
  t: number;
  level: VoiceDebugLevel;
  /** Short, scannable label, e.g. "ws.open" or "watchdog.connection-lost". */
  label: string;
  /** Optional one-line detail. */
  detail?: string;
}

export type MicPermissionState = "unknown" | "granted" | "denied" | "prompt";

export interface VoiceDebugFlags {
  /** Current UI status mirrored here for the panel header. */
  status: string;
  wsOpen: boolean;
  streamingReady: boolean;
  captureActive: boolean;
  /** Mic PCM frames produced by the worklet this session. */
  micFramesCaptured: number;
  /** Mic frames actually sent to the WebSocket this session. */
  micFramesSent: number;
  /** Most recent mic RMS [0..1] — non-zero means audio is reaching the worklet. */
  micRms: number;
  /** Capture AudioContext state — must be "running" for frames to flow. */
  micCtxState: string;
  /** Worklet process() call count — 0 means the worklet isn't being scheduled. */
  micProcessCalls: number;
  /** Whether the worklet's last heartbeat saw input channel data. */
  micHasInput: boolean;
  tokenPresent: boolean;
  /** Seconds until the cached token expires, or null if none. */
  tokenExpiresInS: number | null;
  micPermission: MicPermissionState;
  /** Date.now() of the last server event received (any type). */
  lastEventAt: number | null;
  /** Type string of the last server event. */
  lastEventType: string | null;
  /** Monotonic counters across the lifetime of the page. */
  startCount: number;
  connectOkCount: number;
  closeCount: number;
  errorCount: number;
  /** Last WebSocket close code + whether it was intentional. */
  lastCloseCode: number | null;
  lastCloseIntentional: boolean | null;
  /** Date.now() when the active session started (session.updated). */
  sessionStartedAt: number | null;
}

const MAX_ENTRIES = 120;

function emptyFlags(): VoiceDebugFlags {
  return {
    status: "idle",
    wsOpen: false,
    streamingReady: false,
    captureActive: false,
    micFramesCaptured: 0,
    micFramesSent: 0,
    micRms: 0,
    micCtxState: "none",
    micProcessCalls: 0,
    micHasInput: false,
    tokenPresent: false,
    tokenExpiresInS: null,
    micPermission: "unknown",
    lastEventAt: null,
    lastEventType: null,
    startCount: 0,
    connectOkCount: 0,
    closeCount: 0,
    errorCount: 0,
    lastCloseCode: null,
    lastCloseIntentional: null,
    sessionStartedAt: null,
  };
}

interface Channel {
  entries: VoiceDebugEntry[];
  flags: VoiceDebugFlags;
  subscribers: Set<() => void>;
}

const channels = new Map<string, Channel>();
let nextEntryId = 1;

function getChannel(instanceId: string): Channel {
  let ch = channels.get(instanceId);
  if (!ch) {
    ch = { entries: [], flags: emptyFlags(), subscribers: new Set() };
    channels.set(instanceId, ch);
  }
  return ch;
}

function notify(ch: Channel): void {
  for (const cb of ch.subscribers) {
    try {
      cb();
    } catch {
      // a bad subscriber must never break instrumentation
    }
  }
}

export function voiceDebugLog(
  instanceId: string,
  level: VoiceDebugLevel,
  label: string,
  detail?: string,
): void {
  const ch = getChannel(instanceId);
  ch.entries.push({ id: nextEntryId++, t: Date.now(), level, label, detail });
  if (ch.entries.length > MAX_ENTRIES) {
    ch.entries.splice(0, ch.entries.length - MAX_ENTRIES);
  }
  if (level === "error") ch.flags.errorCount += 1;
  notify(ch);
}

export function voiceDebugSetFlags(
  instanceId: string,
  patch: Partial<VoiceDebugFlags>,
): void {
  const ch = getChannel(instanceId);
  ch.flags = { ...ch.flags, ...patch };
  notify(ch);
}

/** Bump a monotonic counter flag by one and notify. */
export function voiceDebugIncr(
  instanceId: string,
  key: "startCount" | "connectOkCount" | "closeCount",
): void {
  const ch = getChannel(instanceId);
  ch.flags = { ...ch.flags, [key]: (ch.flags[key] as number) + 1 };
  notify(ch);
}

export function voiceDebugGetEntries(
  instanceId: string,
): ReadonlyArray<VoiceDebugEntry> {
  return getChannel(instanceId).entries;
}

export function voiceDebugGetFlags(instanceId: string): VoiceDebugFlags {
  return getChannel(instanceId).flags;
}

export function voiceDebugSubscribe(
  instanceId: string,
  cb: () => void,
): () => void {
  const ch = getChannel(instanceId);
  ch.subscribers.add(cb);
  return () => {
    ch.subscribers.delete(cb);
  };
}

export function voiceDebugClear(instanceId: string): void {
  const ch = getChannel(instanceId);
  ch.entries = [];
  notify(ch);
}
