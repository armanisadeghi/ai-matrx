"use client";

/**
 * RoutingPanel — Creator Hub "Routing" tab.
 *
 * Ground-truth answer to "where did this turn actually go, and did the sandbox
 * bind?" Reads the per-request `routing` record stamped at send time in the
 * execute thunks (the literal fetch URL + payload), so nothing here is inferred.
 *
 * Per turn it shows: the target URL + channel, the active server toggle, the
 * resolved sandbox (and its source), whether the binding actually attached
 * (ref-present-but-not-attached === token mint failed → agent got no sandbox
 * tools), the wire capabilities, and the tool names sent.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { selectRequestsForInstance } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { RequestRouting } from "@/features/agents/types/request.types";
import {
  Server,
  Box,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wrench,
} from "lucide-react";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function channelLabel(channel: RequestRouting["channel"]): string {
  switch (channel) {
    case "ec2-dedicated":
      return "EC2 dedicated server";
    case "override":
      return "Per-conversation override (in-box proxy)";
    default:
      return "Global server";
  }
}

/** The one-line verdict on the sandbox binding for a turn. */
function SandboxVerdict({ routing }: { routing: RequestRouting }) {
  if (!routing.sandboxRef) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Box className="h-3.5 w-3.5" />
        No sandbox selected — agent ran with no box.
      </span>
    );
  }
  if (!routing.sandboxAttached) {
    return (
      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
        <XCircle className="h-3.5 w-3.5" />
        Box selected ({routing.sandboxRef.rowId.slice(0, 8)}) but binding FAILED
        — token mint did not return. Agent got no sandbox tools.
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Bound ({routing.sandboxRef.tier ?? "?"} ·{" "}
      {routing.sandboxRef.source}) — tools route into the box.
    </span>
  );
}

export function RoutingPanel({ conversationId }: { conversationId: string }) {
  const requests = useAppSelector(selectRequestsForInstance(conversationId));
  // Newest first, only those that actually sent (have a routing record).
  const routed = [...requests]
    .reverse()
    .map((r) => ({ requestId: r.requestId, routing: r.routing }))
    .filter(
      (r): r is { requestId: string; routing: RequestRouting } =>
        r.routing != null,
    );

  if (routed.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        No turns sent yet. Send a message and this tab will show exactly where
        each request went and whether the sandbox bound.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto">
      {routed.map(({ requestId, routing }, idx) => {
        const sandboxToolsMissing =
          routing.sandboxRef &&
          routing.sandboxAttached &&
          !routing.toolNames.some((n) => n.startsWith("fs_") || n.startsWith("shell_"));
        return (
          <div
            key={requestId}
            className="rounded-md border border-border bg-card p-3 text-xs"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-foreground">
                {idx === 0 ? "Latest turn" : `Turn -${idx}`}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(routing.recordedAt).toLocaleTimeString()}
              </span>
            </div>

            {/* Where it went */}
            <div className="flex items-start gap-1.5 mb-1.5">
              <Server className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="font-mono text-foreground break-all">
                  {hostOf(routing.url)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {channelLabel(routing.channel)} · server toggle:{" "}
                  <span className="font-medium">{routing.activeServer}</span>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground/70 break-all mt-0.5">
                  {routing.url}
                </div>
              </div>
            </div>

            {/* Sandbox verdict */}
            <div className="mb-1.5">
              <SandboxVerdict routing={routing} />
            </div>

            {/* Capabilities */}
            <div className="text-[11px] text-muted-foreground mb-1">
              <span className="font-medium text-foreground">capabilities:</span>{" "}
              {routing.capabilities.length > 0
                ? routing.capabilities.join(", ")
                : "(none)"}
            </div>

            {/* Tools */}
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Wrench className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="break-words">
                {routing.toolNames.length > 0
                  ? routing.toolNames.join(", ")
                  : "(no additive tools sent)"}
              </span>
            </div>

            {sandboxToolsMissing && (
              <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Box is bound but no fs_/shell_ tools were sent — the agent can't
                act in it. Check that the sandbox-fs capability arms tools (or
                the client stopgap).
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
