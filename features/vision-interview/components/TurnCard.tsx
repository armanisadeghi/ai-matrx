"use client";

// features/vision-interview/components/TurnCard.tsx
//
// One transcript turn: speaker chip (role icon + name, or the human) and the
// PERSISTED markdown content rendered through the canonical engine front door
// (<RichDocument> → MarkdownStream → EnhancedChatMarkdown → BlockRenderer).
// Never a hand-rolled markdown/stream parser here.

import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { RichDocument } from "@/features/rich-document/RichDocument";
import { ROLES, type InterviewTurnRow, type RoleKey } from "../types";

export function TurnCard({ turn }: { turn: InterviewTurnRow }) {
  const isHuman = turn.speaker === "human";
  const role = isHuman ? null : ROLES[turn.speaker as RoleKey];
  const Icon = role?.icon ?? User;
  const name = role?.name ?? "You";

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        isHuman ? "border-primary/30 bg-primary/5" : "border-border bg-card",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-xs font-medium",
            isHuman ? "text-primary" : "text-foreground",
          )}
          title={role?.description}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {name}
        </span>
        <span className="text-[11px] text-muted-foreground">
          Round {turn.round}
        </span>
      </div>
      <RichDocument
        content={turn.content}
        source={{ type: "raw" }}
        hideCopyButton
        contentClassName="text-sm"
      />
    </div>
  );
}
