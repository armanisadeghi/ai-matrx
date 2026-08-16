"use client";

// features/vision-interview/components/TurnCard.tsx
//
// One transcript turn, in the canonical conversation visual language
// (/chat's message displays): avatar disc + speaker name + round meta on a
// header line, the PERSISTED markdown through the canonical front door
// (<RichDocument> → MarkdownStream → EnhancedChatMarkdown → BlockRenderer),
// and a hover copy action. Role turns render plain (assistant treatment —
// no box); the human's turns get the subtle primary-tinted bubble user
// messages get in /chat. Never a hand-rolled markdown/stream parser here.

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { RichDocument } from "@/features/rich-document/RichDocument";
import { ROLES, type InterviewTurnRow, type RoleKey } from "../types";
import { RoleAvatar } from "./RoleAvatar";

function turnTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TurnCard({ turn }: { turn: InterviewTurnRow }) {
  const isHuman = turn.speaker === "human";
  const role = isHuman ? null : ROLES[turn.speaker as RoleKey];
  const name = role?.name ?? "You";
  const [copied, setCopied] = useState(false);

  const copyTurn = async () => {
    try {
      await navigator.clipboard.writeText(turn.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <div className="group flex gap-2.5 px-1 py-1.5">
      <RoleAvatar role={isHuman ? null : (turn.speaker as RoleKey)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-[13px] font-semibold",
              role ? role.accent.text : "text-foreground",
            )}
            title={role?.description}
          >
            {name}
          </span>
          <span className="text-[11px] text-muted-foreground">
            Round {turn.round}
            {turnTime(turn.created_at) && ` · ${turnTime(turn.created_at)}`}
          </span>
          <button
            type="button"
            onClick={() => void copyTurn()}
            aria-label={copied ? "Copied" : "Copy turn"}
            title="Copy turn"
            className={cn(
              "ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground",
              "opacity-0 transition-opacity hover:bg-accent hover:text-foreground",
              "focus-visible:opacity-100 group-hover:opacity-100",
              copied && "opacity-100 text-green-500 hover:text-green-500",
            )}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <div
          className={cn(
            "mt-0.5",
            isHuman &&
              "rounded-xl rounded-tl-sm border border-primary/15 bg-primary/5 px-3 py-2",
          )}
        >
          <RichDocument
            content={turn.content}
            source={{ type: "raw" }}
            hideCopyButton
            contentClassName="text-sm"
          />
        </div>
      </div>
    </div>
  );
}
