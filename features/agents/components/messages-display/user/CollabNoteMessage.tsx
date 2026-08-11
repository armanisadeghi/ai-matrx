"use client";

/**
 * CollabNoteMessage — a DELIVERED collaboration note in the transcript.
 *
 * The turn-boundary inbox drain persists an `agent_call` `remember=true`
 * write-back as a user-role cx_message whose text starts
 * `[Collaboration note] Agent '<name>' reviewed this conversation …`.
 * It is NOT something the user typed, so it must never wear the user bubble:
 * this renders it as an info-styled, agent-attributed note (violet, like the
 * collaboration call card it came from). Hidden notes
 * (is_visible_to_user=false) never reach this component — every message read
 * path filters them.
 *
 * Grouping: `display-groups.ts` emits kind "collab-note" for these rows
 * (detection: `isCollabNoteRecord`); `AgentConversationDisplay` routes here.
 */

import React, { useMemo } from "react";
import { Handshake } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  extractFlatText,
  selectMessageById,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";

interface CollabNoteMessageProps {
  conversationId: string;
  messageId: string;
  compact?: boolean;
}

const PREFIX_RE =
  /^\[Collaboration note\]\s+Agent\s+'([^']+)'[^\n]*(?:\n|$)/;

export function CollabNoteMessage({
  conversationId,
  messageId,
  compact = false,
}: CollabNoteMessageProps) {
  const record = useAppSelector(
    useMemo(
      () => selectMessageById(conversationId, messageId),
      [conversationId, messageId],
    ),
  );

  const { agentName, body } = useMemo(() => {
    const text = extractFlatText(record);
    const match = PREFIX_RE.exec(text);
    return {
      agentName: match?.[1] ?? null,
      // Strip the plumbing prefix line — the header row carries attribution.
      body: match ? text.slice(match[0].length).trim() : text,
    };
  }, [record]);

  if (!record) return null;

  return (
    <div
      className={`${compact ? "" : "mr-12"} overflow-hidden rounded-lg border border-violet-500/25 bg-violet-500/[0.05] dark:bg-violet-400/[0.06]`}
    >
      <div className="flex items-center gap-1.5 border-b border-violet-500/15 px-2.5 py-1.5">
        <Handshake className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
        <span className="text-xs font-medium text-foreground">
          Collaboration note
          {agentName ? ` — ${agentName}` : ""}
        </span>
        <span className="text-[11px] text-muted-foreground">
          left after reviewing this conversation
        </span>
      </div>
      <div className="px-2.5 py-2 text-sm">
        <BasicMarkdownContent content={body} showCopyButton={false} />
      </div>
    </div>
  );
}
