"use client";

/**
 * CollabCallCard — the collaboration `agent_call` presentation (history_mode
 * "snapshot" | "fork"): "{agent} is reviewing {conversation}" with a mode
 * chip, the live child token stream while the specialist runs, and Door Law
 * links to the source + child conversations. Contract: `collab.ts` header.
 *
 * The child streams its tokens on the PARENT's wire; the transcript walker
 * hides that block range (`selectUnifiedSlots`) and this card renders it via
 * `selectAgentCallChildStream` — the same text, attributed and contained.
 * Persisted turns have no live stream (the child text lives in the child
 * conversation); the card then shows the answer summary from the tool output.
 */

import React, { useMemo } from "react";
import { GitBranch, Handshake, Inbox, ScrollText, TriangleAlert } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentCallChildStream } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useConversationTitle } from "@/features/agents/hooks/useConversationTitle";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { ResultMarkdown } from "../../result-fields/ResultMarkdown";
import { cn } from "@/lib/utils";
import type { ToolRendererProps } from "../../types";
import { getCollabCallInfo, type CollabCallInfo } from "./collab";

const NO_CHILD_STREAM = () => null;

const MODE_CHIP: Record<CollabCallInfo["historyMode"], string> = {
  snapshot: "reading a copy",
  fork: "working in a branched copy",
};

export function CollabCallCard(props: ToolRendererProps) {
  const { entry, requestId, conversationId } = props;
  const info = getCollabCallInfo(entry);

  const childStreamSelector = useMemo(
    () =>
      requestId
        ? selectAgentCallChildStream(requestId, entry.callId)
        : NO_CHILD_STREAM,
    [requestId, entry.callId],
  );
  const childStream = useAppSelector(childStreamSelector);

  // Source conversation: null / same-id means "this conversation" — no door
  // needed, every door would lead back to where the user is standing.
  const sourceId = info?.sourceConversationId ?? null;
  const isCurrentSource = !sourceId || sourceId === conversationId;
  const sourceTitle = useConversationTitle(isCurrentSource ? null : sourceId);

  const childId = info?.childConversationId ?? childStream?.childConversationId ?? null;
  const childTitle = useConversationTitle(childId);

  if (!info) return null;

  const isActive =
    entry.status === "started" ||
    entry.status === "progress" ||
    entry.status === "step" ||
    entry.status === "result_preview";

  const agentLabel = info.agentName ?? childStream?.label ?? "Specialist agent";
  const isFork = info.historyMode === "fork";
  const childName = isFork
    ? `Branched copy of ${childTitle ?? sourceTitle ?? "this conversation"}`
    : (childTitle ?? "Specialist conversation");

  const liveText = childStream?.text ?? "";
  const showLiveStream =
    childStream !== null && (childStream.status === "running" || isActive) && liveText.length > 0;
  const answerText = !isActive ? (info.resultText ?? (liveText || null)) : null;

  return (
    <div className="overflow-hidden rounded-xl border border-violet-500/20 bg-violet-500/[0.04] dark:bg-violet-400/[0.05]">
      {/* Header — who is reviewing what */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
        <Handshake className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
        <span className="min-w-0 text-sm font-medium text-foreground">
          {agentLabel} {isActive ? "is reviewing" : "reviewed"}{" "}
          {isCurrentSource || !sourceId ? (
            "this conversation"
          ) : (
            <EntityRef
              token="conversation"
              id={sourceId}
              name={sourceTitle ?? "a conversation"}
              openInNewTab
              showIcon={false}
              className="inline-flex align-baseline"
            />
          )}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
          {isFork ? <GitBranch className="h-3 w-3" /> : <ScrollText className="h-3 w-3" />}
          {MODE_CHIP[info.historyMode]}
        </span>
        {info.messagesIncluded !== null && (
          <span className="text-xs text-muted-foreground">
            {info.messagesIncluded} message{info.messagesIncluded === 1 ? "" : "s"} shared
          </span>
        )}
      </div>

      {/* Live child stream — the specialist's tokens, contained + attributed */}
      {showLiveStream && (
        <div className="mx-3 mb-2 max-h-64 overflow-y-auto rounded-md border border-border bg-background/60 px-3 py-2">
          <BasicMarkdownContent
            content={liveText}
            isStreamActive={childStream?.status === "running"}
            showCopyButton={false}
          />
        </div>
      )}

      {/* Answer summary once complete */}
      {answerText && (
        <div className="px-3 pb-2">
          <ResultMarkdown content={answerText} density="inline" />
        </div>
      )}

      {/* Doors + remember status */}
      {(childId || info.remember) && (
        <div
          className={cn(
            "flex flex-col gap-1 border-t border-violet-500/15 px-3 py-1.5",
          )}
        >
          {childId && (
            <EntityRef
              token="conversation"
              id={childId}
              name={childName}
              openInNewTab
              alwaysShowActions
              labelClassName="text-xs"
            />
          )}
          {info.remember?.status === "queued" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Inbox className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
              Note queued for {isCurrentSource ? "this conversation" : (sourceTitle ?? "the source conversation")} — its agent will see it next turn
            </span>
          )}
          {info.remember?.status === "failed" && (
            <span className="inline-flex items-start gap-1.5 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Write-back note failed
                {info.remember.error ? `: ${info.remember.error}` : "."}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
