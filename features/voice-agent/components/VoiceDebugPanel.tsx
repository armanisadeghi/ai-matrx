"use client";

// VoiceDebugPanel — admin-only live X-ray of the xAI voice session.
//
// The voice stack is imperative module singletons (token manager, WebSocket,
// audio capture/playback) that never touch Redux, so when "Live" misbehaves
// there is nothing to inspect. This panel subscribes to `voiceDebugBus` and
// renders the live connection state + a rolling lifecycle log, so the actual
// failure ("token rejected", "ws closed network", "mic permission = prompt",
// "watchdog: connection lost") is visible on the page instead of guessed at.
//
// Dense, dark, monospace — a diagnostic tool, not a product surface. Gated to
// admins by the caller.

import { useEffect, useReducer, useState } from "react";
import { Bug, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  voiceDebugClear,
  voiceDebugGetEntries,
  voiceDebugGetFlags,
  voiceDebugSubscribe,
  type VoiceDebugEntry,
} from "../debug/voiceDebugBus";
import { micStreamDebug } from "@/features/audio/micStream";

interface VoiceDebugPanelProps {
  instanceId: string;
  /** Start collapsed by default. */
  defaultOpen?: boolean;
}

function agoLabel(ms: number | null): string {
  if (ms === null) return "—";
  const d = Date.now() - ms;
  if (d < 1000) return "just now";
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
  return `${Math.floor(d / 60_000)}m ago`;
}

function Flag({
  label,
  on,
  tone = "bool",
}: {
  label: string;
  on: boolean;
  tone?: "bool" | "warn";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
        on
          ? tone === "warn"
            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          on
            ? tone === "warn"
              ? "bg-amber-500"
              : "bg-emerald-500"
            : "bg-muted-foreground/40",
        )}
      />
      {label}
    </span>
  );
}

const LEVEL_CLASS: Record<VoiceDebugEntry["level"], string> = {
  info: "text-muted-foreground",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-red-600 dark:text-red-400",
};

export function VoiceDebugPanel({
  instanceId,
  defaultOpen = false,
}: VoiceDebugPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [, force] = useReducer((n: number) => n + 1, 0);

  // Re-render on every bus notify (lifecycle events) AND on a 500ms tick so
  // time-derived values (token countdown, "x s ago") stay live.
  useEffect(() => {
    const unsub = voiceDebugSubscribe(instanceId, force);
    const id = setInterval(force, 500);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [instanceId]);

  const flags = voiceDebugGetFlags(instanceId);
  const entries = voiceDebugGetEntries(instanceId);
  const mic = micStreamDebug();

  const sessionAge =
    flags.sessionStartedAt !== null
      ? `${Math.floor((Date.now() - flags.sessionStartedAt) / 1000)}s`
      : "—";

  return (
    <div className="pointer-events-auto w-full overflow-hidden rounded-lg border border-border bg-zinc-950/95 text-zinc-100 shadow-lg backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold">
          <Bug className="h-3.5 w-3.5 text-emerald-400" />
          Live voice debug
        </span>
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase",
              flags.status === "error"
                ? "bg-red-500/20 text-red-400"
                : flags.status === "idle"
                  ? "bg-zinc-700 text-zinc-300"
                  : "bg-emerald-500/20 text-emerald-400",
            )}
          >
            {flags.status}
          </span>
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-zinc-400" />
          )}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-zinc-800 px-3 py-2">
          {/* Flags */}
          <div className="flex flex-wrap gap-1">
            <Flag label="ws open" on={flags.wsOpen} />
            <Flag label="streaming" on={flags.streamingReady} />
            <Flag label="mic active" on={flags.captureActive} />
            <Flag label="token" on={flags.tokenPresent} />
            <Flag
              label={`mic: ${flags.micPermission}`}
              on={flags.micPermission === "granted"}
              tone={flags.micPermission === "denied" ? "warn" : "bool"}
            />
          </div>

          {/* Numeric state grid */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] text-zinc-400 sm:grid-cols-3">
            <div>
              token exp:{" "}
              <span className="text-zinc-200">
                {flags.tokenExpiresInS === null
                  ? "—"
                  : `${flags.tokenExpiresInS}s`}
              </span>
            </div>
            <div>
              session: <span className="text-zinc-200">{sessionAge}</span>
            </div>
            <div>
              starts: <span className="text-zinc-200">{flags.startCount}</span>
            </div>
            <div>
              connects:{" "}
              <span className="text-zinc-200">{flags.connectOkCount}</span>
            </div>
            <div>
              closes: <span className="text-zinc-200">{flags.closeCount}</span>
            </div>
            <div>
              errors: <span className="text-zinc-200">{flags.errorCount}</span>
            </div>
            <div>
              last close:{" "}
              <span className="text-zinc-200">
                {flags.lastCloseCode ?? "—"}
                {flags.lastCloseIntentional === null
                  ? ""
                  : flags.lastCloseIntentional
                    ? " (intent)"
                    : " (net)"}
              </span>
            </div>
            <div className="col-span-2">
              last event:{" "}
              <span className="text-zinc-200">
                {flags.lastEventType ?? "—"} · {agoLabel(flags.lastEventAt)}
              </span>
            </div>
            <div
              className={cn(
                "col-span-full",
                flags.micFramesSent === 0 && flags.streamingReady
                  ? "text-red-400"
                  : "",
              )}
            >
              mic flow:{" "}
              <span className="text-zinc-200">
                captured={flags.micFramesCaptured} · sent={flags.micFramesSent}{" "}
                · rms={flags.micRms.toFixed(3)}
              </span>
            </div>
            <div
              className={cn(
                "col-span-full",
                flags.captureActive && flags.micCtxState !== "running"
                  ? "text-red-400"
                  : "",
              )}
            >
              audio ctx:{" "}
              <span className="text-zinc-200">{flags.micCtxState}</span>
            </div>
            <div className="col-span-full">
              mic mgr:{" "}
              <span className="text-zinc-200">
                {mic.state} · refs={mic.refCount} · live={String(mic.live)}
              </span>
            </div>
          </div>

          {/* Event log */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Event log
            </span>
            <button
              type="button"
              onClick={() => voiceDebugClear(instanceId)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <Trash2 className="h-3 w-3" />
              clear
            </button>
          </div>
          <div className="max-h-44 overflow-y-auto rounded bg-black/40 font-mono text-[10px] leading-relaxed">
            {entries.length === 0 ? (
              <div className="px-2 py-1.5 text-zinc-600">No events yet.</div>
            ) : (
              [...entries].reverse().map((e) => (
                <div
                  key={e.id}
                  className="flex gap-2 border-b border-zinc-900 px-2 py-0.5 last:border-0"
                >
                  <span className="shrink-0 text-zinc-600">
                    {new Date(e.t).toLocaleTimeString([], {
                      hour12: false,
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-semibold",
                      LEVEL_CLASS[e.level],
                    )}
                  >
                    {e.label}
                  </span>
                  {e.detail && (
                    <span className="truncate text-zinc-500" title={e.detail}>
                      {e.detail}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
