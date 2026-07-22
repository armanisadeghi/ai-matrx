"use client";

/**
 * CaptureInspectorPanel — every HTTP exchange the application made, both
 * directions, newest first.
 *
 * Replaces the agents-only StreamDebugPanel view of the world. That panel could
 * only ever show streams that went through `processStream`; this one shows
 * everything, because its source is a tap on `fetch` itself.
 */

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { clearCapturedExchanges } from "@/lib/diagnostics/stream-capture/recorder";
import { useCaptureEnabled } from "@/lib/diagnostics/stream-capture/capture-mode";
import {
  useCaptureMode,
  useCapturedExchanges,
} from "@/lib/diagnostics/stream-capture/useCapturedExchanges";
import type { CapturedExchange } from "@/lib/diagnostics/stream-capture/types";

function StatusDot({ exchange }: { exchange: CapturedExchange }) {
  const tone =
    exchange.status === "open"
      ? "bg-sky-500 animate-pulse"
      : exchange.status === "errored"
        ? "bg-destructive"
        : exchange.status === "aborted"
          ? "bg-amber-500"
          : exchange.httpStatus >= 400
            ? "bg-destructive"
            : "bg-emerald-500";
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", tone)} />;
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-muted/60 p-2 text-[11px] leading-relaxed text-foreground">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function CaptureInspectorPanel({
  isAdmin,
}: {
  isAdmin: boolean;
}) {
  const exchanges = useCapturedExchanges();
  const mode = useCaptureMode();
  const { enabled, setEnabled } = useCaptureEnabled(isAdmin);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected =
    exchanges.find((e) => e.id === selectedId) ?? exchanges[0] ?? null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-3 py-2">
        <span className="text-sm font-medium">Capture Inspector</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {mode}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {exchanges.length} exchange{exchanges.length === 1 ? "" : "s"}
        </span>

        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={!isAdmin}
            />
            Full retention
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              clearCapturedExchanges();
              setSelectedId(null);
            }}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </div>

      {mode === "minimal" && (
        <p className="border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          Minimal retention: only the last 3 exchanges are kept so the buffer
          can never accumulate. Switch on full retention to record a session.
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <ul className="w-[38%] shrink-0 overflow-y-auto border-r border-border">
          {exchanges.length === 0 && (
            <li className="px-3 py-4 text-xs text-muted-foreground">
              Nothing captured yet.
            </li>
          )}
          {exchanges.map((exchange) => (
            <li key={exchange.id}>
              <button
                type="button"
                onClick={() => setSelectedId(exchange.id)}
                className={cn(
                  "flex w-full items-center gap-2 border-b border-border/60 px-3 py-1.5 text-left text-xs hover:bg-accent",
                  selected?.id === exchange.id && "bg-accent",
                )}
              >
                <StatusDot exchange={exchange} />
                <span className="font-mono text-[10px] text-muted-foreground">
                  {exchange.method}
                </span>
                <span className="truncate">
                  {exchange.url.replace(/^https?:\/\/[^/]+/, "")}
                </span>
                <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                  {exchange.isStream ? `${exchange.events.length} ev` : exchange.httpStatus}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="min-w-0 flex-1 overflow-y-auto p-3">
          {!selected ? (
            <p className="text-xs text-muted-foreground">
              Select an exchange.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                  Request
                </p>
                <p className="mb-1 break-all font-mono text-[11px] text-muted-foreground">
                  {selected.method} {selected.url}
                </p>
                {selected.requestBody && <Json value={selected.requestBody} />}
                {selected.requestBodyTruncated && (
                  <p className="mt-1 text-[10px] text-amber-600">
                    Request body truncated by the active retention cap.
                  </p>
                )}
              </div>

              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  Response — {selected.httpStatus} {selected.statusText} ·{" "}
                  {selected.status} · {selected.bytes} bytes
                </p>
                {selected.error && (
                  <p className="mb-1 text-[11px] text-destructive">
                    {selected.error}
                  </p>
                )}
                {selected.truncated && (
                  <p className="mb-1 text-[10px] text-amber-600">
                    Truncated — earlier events were dropped. Event indexes are
                    the true wire positions, so the gap is visible below.
                  </p>
                )}

                {selected.isStream ? (
                  <ol className="space-y-1">
                    {selected.events.map((event) => (
                      <li
                        key={event.idx}
                        className="rounded border border-border/60 p-1.5"
                      >
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="tabular-nums">#{event.idx}</span>
                          <span className="font-medium text-foreground">
                            {event.eventType}
                          </span>
                          <span className="ml-auto tabular-nums">
                            +{event.ts - selected.startedAt}ms
                          </span>
                        </div>
                        <Json value={event.unparsed ?? event.data} />
                      </li>
                    ))}
                  </ol>
                ) : (
                  selected.responseBody && (
                    <Json value={selected.responseBody} />
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
