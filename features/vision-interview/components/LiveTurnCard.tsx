"use client";

// features/vision-interview/components/LiveTurnCard.tsx
//
// The IN-FLIGHT twin of TurnCard: one role's live token stream while its
// workflow node is speaking, read from the canonical execution system
// (activeRequests.nodeStreams via followWorkflowRunStream). Identical visual
// language to the persisted TurnCard (avatar disc + speaker header + plain
// assistant treatment) so the handover is seamless when the interview.turn
// row lands. Accumulated markdown renders through BasicMarkdownContent — the
// exact precedent the collab agent_call child stream uses (CollabCallCard) —
// never a hand-rolled chunk renderer. Reasoning deltas surface only as the
// subtle "Thinking" state (deliberate: chain-of-thought is not transcript
// content).
//
// The pane unmounts this card the moment the node settles or the persisted
// interview.turn row lands (TranscriptPane owns that no-double-render rule).

import { cn } from "@/lib/utils";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import type { WorkflowNodeStreamEntry } from "@/features/agents/types/request.types";
import { ROLES, type RoleKey } from "../types";
import { RoleAvatar } from "./RoleAvatar";

interface LiveTurnCardProps {
  role: RoleKey;
  stream: WorkflowNodeStreamEntry;
  round: number;
}

export function LiveTurnCard({ role, stream, round }: LiveTurnCardProps) {
  const meta = ROLES[role];
  const isThinking = stream.text.length === 0;

  return (
    <div className="flex gap-2.5 px-1 py-1.5">
      <RoleAvatar role={role} speaking />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn("text-[13px] font-semibold", meta.accent.text)}
            title={meta.description}
          >
            {meta.name}
          </span>
          <span className="text-[11px] text-muted-foreground">
            Round {round}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium",
              meta.accent.text,
            )}
          >
            <span
              className={cn(
                "inline-flex h-1.5 w-1.5 animate-pulse rounded-full",
                "bg-current",
              )}
              aria-hidden
            />
            {isThinking ? "Thinking" : "Speaking"}
          </span>
        </div>
        {!isThinking && (
          <div className="mt-0.5 text-sm">
            <BasicMarkdownContent
              content={stream.text}
              isStreamActive
              showCopyButton={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}
