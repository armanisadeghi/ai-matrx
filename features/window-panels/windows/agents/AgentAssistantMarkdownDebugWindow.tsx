"use client";

import React, { useMemo, useState, useEffect } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import MarkdownStream from "@/components/MarkdownStream";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  clearAssistantMarkdownDrafts,
  selectAgentAssistantMarkdownDraftState,
  type AgentAssistantMarkdownDraftEntry,
} from "@/features/agents/redux/agent-assistant-markdown-draft.slice";

interface AgentAssistantMarkdownDebugWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AgentAssistantMarkdownDebugWindow({
  isOpen,
  onClose,
}: AgentAssistantMarkdownDebugWindowProps) {
  const dispatch = useAppDispatch();
  const { entries, lastUpdatedKey } = useAppSelector(
    selectAgentAssistantMarkdownDraftState,
  );
  const keys = useMemo(() => Object.keys(entries).sort(), [entries]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (keys.length === 0) {
      setSelectedKey(null);
      return;
    }
    const valid = selectedKey != null && entries[selectedKey];
    if (!valid) {
      setSelectedKey(lastUpdatedKey);
    }
  }, [keys, entries, selectedKey, lastUpdatedKey]);

  const activeKey = selectedKey ?? lastUpdatedKey;
  const entry: AgentAssistantMarkdownDraftEntry | null = activeKey
    ? (entries[activeKey] ?? null)
    : null;

  if (!isOpen) return null;

  const draftMarkdown = entry?.draftContent ?? "";
  const baseMarkdown = entry?.baseContent ?? "";

  return (
    <WindowPanel
      id="agent-assistant-markdown-debug-window"
      title="Agent assistant — markdown edit sink"
      onClose={onClose}
      width="88vw"
      height="82dvh"
      minWidth={480}
      minHeight={360}
      urlSyncKey="agent-md-debug"
      urlSyncId="agent-assistant-markdown-debug-window"
      urlSyncArgs={{ m: "amd" }}
      overlayId="agentAssistantMarkdownDebugWindow"
    >
      <div className="flex flex-col h-full min-h-0 bg-background text-foreground">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          {keys.length > 0 ? (
            <Select
              value={activeKey ?? undefined}
              onValueChange={(v) => setSelectedKey(v)}
            >
              <SelectTrigger className="w-[280px] h-8 text-xs">
                <SelectValue placeholder="Select draft" />
              </SelectTrigger>
              <SelectContent>
                {keys.map((k) => (
                  <SelectItem key={k} value={k} className="text-xs font-mono">
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted-foreground">
              No draft yet — edit a table, code block, etc. in an assistant
              message (debug sink mode).
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={keys.length === 0}
            onClick={() => dispatch(clearAssistantMarkdownDrafts())}
          >
            Clear drafts
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 flex-1 min-h-0 divide-y md:divide-y-0 md:divide-x divide-border">
          <div className="flex flex-col min-h-0 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-3 py-1 border-b border-border bg-muted/40 shrink-0">
              Source (conversation) — read-only preview
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-2">
              {baseMarkdown ? (
                <MarkdownStream
                  content={baseMarkdown}
                  hideCopyButton
                  allowFullScreenEditor={false}
                  className="text-xs bg-textured"
                />
              ) : (
                <p className="text-xs text-muted-foreground p-2">—</p>
              )}
            </div>
          </div>
          <div className="flex flex-col min-h-0 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-3 py-1 border-b border-border bg-muted/40 shrink-0">
              Debug sink (accumulated edits) — MarkdownStream
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-2">
              {draftMarkdown ? (
                <MarkdownStream
                  content={draftMarkdown}
                  hideCopyButton
                  allowFullScreenEditor={false}
                  className="text-xs bg-textured"
                />
              ) : (
                <p className="text-xs text-muted-foreground p-2">
                  Edits from the assistant bubble appear here; the main message
                  UI stays on the source column until you wire persistence.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </WindowPanel>
  );
}
