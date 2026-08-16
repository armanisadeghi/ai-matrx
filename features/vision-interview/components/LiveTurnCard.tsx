"use client";

// features/vision-interview/components/LiveTurnCard.tsx
//
// The IN-FLIGHT twin of TurnCard: one role's live token stream while its
// workflow node is speaking, read from the canonical execution system
// (activeRequests.nodeStreams via followWorkflowRunStream). Renders the
// accumulated markdown through BasicMarkdownContent — the exact precedent the
// collab agent_call child stream uses (CollabCallCard) — never a hand-rolled
// chunk renderer. Reasoning deltas surface only as the subtle "Thinking…"
// state (deliberate: chain-of-thought is not transcript content).
//
// The pane unmounts this card the moment the node settles or the persisted
// interview.turn row lands (TranscriptPane owns that no-double-render rule).

import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import type { WorkflowNodeStreamEntry } from "@/features/agents/types/request.types";
import { ROLES, type RoleKey } from "../types";

interface LiveTurnCardProps {
  role: RoleKey;
  stream: WorkflowNodeStreamEntry;
  round: number;
}

export function LiveTurnCard({ role, stream, round }: LiveTurnCardProps) {
  const meta = ROLES[role];
  const Icon = meta?.icon ?? User;
  const name = meta?.name ?? role;
  const isThinking = stream.text.length === 0;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-xs font-medium text-foreground",
          )}
          title={meta?.description}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {name}
        </span>
        <span className="text-[11px] text-muted-foreground">Round {round}</span>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
            aria-hidden
          />
          {isThinking ? "Thinking" : "Speaking"}
        </span>
      </div>
      {!isThinking && (
        <div className="text-sm">
          <BasicMarkdownContent
            content={stream.text}
            isStreamActive
            showCopyButton={false}
          />
        </div>
      )}
    </div>
  );
}
