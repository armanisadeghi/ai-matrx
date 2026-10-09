"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Copy, Check, Code2 } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectFullInstanceUIStateSlice,
  selectAllUIStateConversationIds,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { InstanceUIStateList } from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/components/InstanceUIStateList";
import { InstanceUIStateCore } from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/components/InstanceUIStateCore";
import { formatJson } from "@ai-matrx/kit/json-format";

// ─── Copy helper ──────────────────────────────────────────────────────────────

function useCopyText(text: string) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    copyText(text).then((copied) => {
      if (!copied) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return { copied, copy };
}

// ─── Full JSON view ───────────────────────────────────────────────────────────

function FullJsonView({ data }: { data: unknown }) {
  const json = formatJson(data, 2);
  const { copied, copy } = useCopyText(json);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
          Full Slice State
        </span>
        <button
          type="button"
          onClick={copy}
          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Copy full JSON"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <pre className="p-3 text-xs font-mono text-foreground whitespace-pre-wrap bg-muted/10">
          {json}
        </pre>
      </div>
    </div>
  );
}

// ─── Main slice viewer ────────────────────────────────────────────────────────

interface InstanceUIStateSliceViewerProps {
  className?: string;
}

export function InstanceUIStateSliceViewer({
  className,
}: InstanceUIStateSliceViewerProps) {
  const sliceState = useAppSelector(selectFullInstanceUIStateSlice);
  const allIds = useAppSelector(selectAllUIStateConversationIds);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => allIds[0] ?? null,
  );
  const [showFullSlice, setShowFullSlice] = useState(() => allIds.length === 0);

  const fullJson = formatJson(sliceState, 2);

  return (
    <div
      className={cn(
        "flex flex-col h-full min-h-0 bg-background border border-border rounded-md overflow-hidden",
        className,
      )}
    >
      {/* Top header bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0">
        <span className="text-xs font-semibold text-foreground flex-1">
          instanceUIState
        </span>
        <span className="text-[11px] text-muted-foreground">
          {Object.keys(sliceState.byConversationId).length} instances
        </span>
        <CopyButtons label="Content" human={fullJson} size="sm" className="shrink-0" />
        <button
          type="button"
          onClick={() => setShowFullSlice((v) => !v)}
          className={cn(
            "h-6 px-2 flex items-center gap-1 rounded text-xs transition-colors shrink-0",
            showFullSlice
              ? "bg-primary/10 text-primary-ink border border-primary/20"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
          title="Toggle full slice JSON"
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>Full State</span>
        </button>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — instance list */}
        <div
          className="w-56 shrink-0 border-r border-border h-full min-h-0 flex flex-col"
          style={{ overflow: "hidden" }}
        >
          <InstanceUIStateList
            openTabIds={selectedId ? [selectedId] : []}
            selectedConversationId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setShowFullSlice(false);
            }}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {showFullSlice ? (
            <FullJsonView data={sliceState} />
          ) : selectedId ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <InstanceUIStateCore
                conversationId={selectedId}
                className="h-auto"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6 text-muted-foreground">
              <p className="text-sm font-medium text-foreground">
                Select an instance
              </p>
              <p className="text-xs opacity-60">
                Pick an instance from the left panel, or toggle{" "}
                <button
                  type="button"
                  onClick={() => setShowFullSlice(true)}
                  className="underline text-primary hover:text-primary/80"
                >
                  Full State
                </button>{" "}
                to see the entire slice.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default InstanceUIStateSliceViewer;
