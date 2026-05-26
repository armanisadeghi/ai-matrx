"use client";

import { useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JsonViewer } from "./JsonViewer";

export type LogEntryKind =
  | "rpc-success"
  | "rpc-error"
  | "broadcast-inbound"
  | "append-success"
  | "append-error"
  | "info";

export interface LogEntry {
  id: string;
  ts: number;
  kind: LogEntryKind;
  title: string;
  body?: unknown;
}

export interface LiveEventLogProps {
  entries: LogEntry[];
  paused: boolean;
  onTogglePaused: () => void;
  onClear: () => void;
}

const KIND_BADGE: Record<
  LogEntryKind,
  { label: string; variant: "success" | "destructive" | "warning" | "outline" }
> = {
  "rpc-success": { label: "rpc ok", variant: "success" },
  "rpc-error": { label: "rpc err", variant: "destructive" },
  "broadcast-inbound": { label: "← inbound", variant: "outline" },
  "append-success": { label: "append ok", variant: "success" },
  "append-error": { label: "append err", variant: "destructive" },
  info: { label: "info", variant: "warning" },
};

export function LiveEventLog({
  entries,
  paused,
  onTogglePaused,
  onClear,
}: LiveEventLogProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Live event log
          <Badge variant="outline" className="ml-1 text-[10px]">
            {entries.length}
          </Badge>
          <div className="ml-auto flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onTogglePaused}
              className="h-7 text-xs"
            >
              {paused ? (
                <>
                  <Play className="mr-1 h-3 w-3" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="mr-1 h-3 w-3" />
                  Pause
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-7 text-xs"
              disabled={entries.length === 0}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Clear
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No events yet. Send a Direct or Broadcast RPC, post a message, or
            wait for an inbound event from the extension.
          </div>
        ) : (
          <div className="max-h-[28rem] divide-y divide-border overflow-auto rounded-md border border-border">
            {entries.map((e) => {
              const meta = KIND_BADGE[e.kind];
              const open = expanded.has(e.id);
              return (
                <div key={e.id} className="px-3 py-2 text-xs">
                  <button
                    type="button"
                    onClick={() => toggle(e.id)}
                    className="flex w-full items-center gap-2 text-left hover:text-primary"
                  >
                    {open ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    <span className="font-mono text-muted-foreground">
                      {new Date(e.ts).toLocaleTimeString()}
                    </span>
                    <Badge variant={meta.variant} className="text-[10px]">
                      {meta.label}
                    </Badge>
                    <span className="truncate">{e.title}</span>
                  </button>
                  {open && e.body !== undefined && (
                    <div className="mt-2 pl-6">
                      <JsonViewer value={e.body} maxHeight="max-h-48" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
