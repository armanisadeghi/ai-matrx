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

import { Badge, Button, Tile } from "@ai-matrx/design-system/controls";
import { useEffect, useReducer, useState } from "react";
import { Bug, Check, ChevronDown, ChevronUp, Copy, Trash2 } from "lucide-react";
import { toast } from "../../host/notify";
import { cn } from "@ai-matrx/design-system";
import {
  voiceDebugClear,
  voiceDebugGetEntries,
  voiceDebugGetFlags,
  voiceDebugSubscribe,
  type VoiceDebugEntry,
} from "../debug/voiceDebugBus";
import { micStreamDebug } from "@ai-matrx/browser-audio/core";
import { formatDurationMs, formatRelativeTime } from "@ai-matrx/kit/format";

interface VoiceDebugPanelProps {
  instanceId: string;
  /** Start collapsed by default. */
  defaultOpen?: boolean;
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
    <Badge tone={on ? (tone === "warn" ? "warning" : "success") : "neutral"}>{label}</Badge>
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
  const [copied, setCopied] = useState(false);
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
      ? formatDurationMs(Date.now() - flags.sessionStartedAt, {
          style: "compact",
        })
      : "—";

  const handleCopy = async () => {
    const lines = [
      `status: ${flags.status}`,
      `ws open: ${flags.wsOpen} · streaming: ${flags.streamingReady} · mic active: ${flags.captureActive}`,
      `token: ${flags.tokenPresent} · mic permission: ${flags.micPermission}`,
      `token exp: ${flags.tokenExpiresInS === null ? "—" : `${flags.tokenExpiresInS}s`} · session: ${sessionAge}`,
      `starts: ${flags.startCount} · connects: ${flags.connectOkCount} · closes: ${flags.closeCount} · errors: ${flags.errorCount}`,
      `last close: ${flags.lastCloseCode ?? "—"}${
        flags.lastCloseIntentional === null
          ? ""
          : flags.lastCloseIntentional
            ? " (intent)"
            : " (net)"
      }`,
      `last event: ${flags.lastEventType ?? "—"} · ${formatRelativeTime(flags.lastEventAt)}`,
      `mic flow: captured=${flags.micFramesCaptured} · sent=${flags.micFramesSent} · rms=${flags.micRms.toFixed(3)}`,
      `worklet: process calls=${flags.micProcessCalls} · hasInput=${flags.micHasInput}`,
      `audio ctx: ${flags.micCtxState}`,
      `mic mgr: ${mic.state} · refs=${mic.refCount} · live=${String(mic.live)}`,
      "",
      "EVENT LOG (newest first):",
      ...[...entries].reverse().map(
        (e) =>
          `${new Date(e.t).toLocaleTimeString([], {
            hour12: false,
            minute: "2-digit",
            second: "2-digit",
          })}  [${e.level}] ${e.label}${e.detail ? ` — ${e.detail}` : ""}`,
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Voice debug copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="pointer-events-auto w-full overflow-hidden rounded-lg border border-border bg-zinc-950/95 text-zinc-100 shadow-lg backdrop-blur">
      <div className="flex w-full items-center justify-between gap-2 px-3 py-1.5">
        <Tile variant="quiet" icon={<Bug />} title="Live voice debug" onClick={() => setOpen((o) => !o)} className="flex-1" />
        <span className="flex items-center gap-2">
          <Badge
            tone={
              flags.status === "error"
                ? "destructive"
                : flags.status === "idle"
                  ? "neutral"
                  : "success"
            }
          >
            {flags.status}
          </Badge>
          <Button
            type="button"
            variant="quiet"
            onClick={handleCopy}
            title="Copy debug data"
            aria-label="Copy debug data"
            icon={copied ? <Check /> : <Copy />}
          />
          <Button variant="quiet" icon={open ? <ChevronDown /> : <ChevronUp />} aria-label={open ? "Collapse" : "Expand"} onClick={() => setOpen((o) => !o)} />
        </span>
      </div>

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
                {flags.lastEventType ?? "—"} · {formatRelativeTime(flags.lastEventAt)}
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
            <div
              className={cn(
                "col-span-full",
                flags.captureActive &&
                  (flags.micProcessCalls === 0 || !flags.micHasInput)
                  ? "text-red-400"
                  : "",
              )}
            >
              worklet:{" "}
              <span className="text-zinc-200">
                process calls={flags.micProcessCalls} · hasInput=
                {String(flags.micHasInput)}
              </span>
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
            <Button
              type="button"
              variant="quiet"
              onClick={() => voiceDebugClear(instanceId)}
              icon={<Trash2 />}
            >
              Clear
            </Button>
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
