"use client";

import React, { useMemo, useState, useEffect } from "react";
import { WindowPanel } from "../../../host/ui-slots";
import { RichContent } from "@ai-matrx/chat/host/ui-slots";
import { Button } from "@ai-matrx/design-system/controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import {
  clearAssistantMarkdownDrafts,
  selectAgentAssistantMarkdownDraftState,
  type AgentAssistantMarkdownDraftEntry,
} from "../../../agents/redux/agent-assistant-markdown-draft.slice";
import { NonEditableContextMenu } from "../../../host/ui-slots";
import { CHAT_WINDOWS } from "../../../host/windows";

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
      overlayId={CHAT_WINDOWS.agentAssistantMarkdownDebugWindow}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0 bg-background text-foreground"
      actionsRight={
        <div className="flex flex-wrap items-center gap-2">
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
            // read-gate-exempt: in-memory debug sink of assistant edits in this tab; no read feeds it
            <span className="text-xs text-muted-foreground">
              No draft yet — edit a table, code block, etc. in an assistant
              message (debug sink mode).
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={keys.length === 0}
            onClick={() => dispatch(clearAssistantMarkdownDrafts())}
          >
            Clear drafts
          </Button>
        </div>
      }
    >
      {/* A debug sink dump of in-memory drafts — no db record behind either
          column, so entity is genuinely absent. resolveContextOnOpen picks
          which side was clicked so Copy/Export acts on the right column. */}
      {/* context-menu-exempt: entity — an in-memory debug draft, not a stored record */}
      {/* context-menu-exempt: surfaceName — no registered surface manifest for this window */}
      <NonEditableContextMenu
        sourceFeature="agent-builder"
        contentSource={{ type: "raw" }}
        contextData={{ content: draftMarkdown || baseMarkdown }}
        resolveContextOnOpen={(target) => {
          const pane = target?.closest<HTMLElement>("[data-debug-pane]")?.getAttribute("data-debug-pane");
          const content = pane === "source" ? baseMarkdown : pane === "sink" ? draftMarkdown : draftMarkdown || baseMarkdown;
          return { content };
        }}
      >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 flex-1 min-h-0 divide-y md:divide-y-0 md:divide-x divide-border">
          <div className="flex flex-col min-h-0 min-w-0" data-debug-pane="source">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-3 py-1 border-b border-border bg-muted/40 shrink-0">
              Source (conversation) — read-only preview
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-2">
              {baseMarkdown ? (
                <RichContent level="full" imagePolicy="ai"
                  source={baseMarkdown}
                  hideCopyButton
                  allowFullScreenEditor={false}
                  className="text-xs bg-textured"
                />
              ) : (
                <p className="text-xs text-muted-foreground p-2">—</p>
              )}
            </div>
          </div>
          <div className="flex flex-col min-h-0 min-w-0" data-debug-pane="sink">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-3 py-1 border-b border-border bg-muted/40 shrink-0">
              Debug sink (accumulated edits) — MarkdownStream
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-2">
              {draftMarkdown ? (
                <RichContent level="full" imagePolicy="ai"
                  source={draftMarkdown}
                  hideCopyButton
                  allowFullScreenEditor={false}
                  className="text-xs bg-textured"
                />
              ) : (
                // The main message UI stays on the source column until persistence is wired.
                <p className="text-xs text-muted-foreground p-2">
                  Assistant bubble edits appear here
                </p>
              )}
            </div>
          </div>
        </div>
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
