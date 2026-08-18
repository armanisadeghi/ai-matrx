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

function prettifyKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * A turn's DISPLAY text. New rows already carry human-readable content, but
 * older structured-role rows (Scribe / Adversary) persisted the raw JSON
 * envelope as their speech — a user must NEVER see that blob, so it heals
 * here into the same summary the backend now writes. Parse-once on persisted
 * content (never stream parsing); anything unrecognized renders as-is.
 */
function displayContent(turn: InterviewTurnRow): string {
  const raw = (turn.content ?? "").trim();
  if (!raw.startsWith("{")) return raw;
  try {
    const parsed = JSON.parse(raw) as {
      doc_patches?: { section_key?: string; op?: string }[];
      question_updates?: { question_id?: string | null }[];
      gap_questions?: string[];
      holes?: { claim?: string; claim_attacked?: string }[];
    };
    if (Array.isArray(parsed.doc_patches)) {
      const parts: string[] = [];
      const touched = parsed.doc_patches
        .map((p) => (p.section_key ? `**${prettifyKey(p.section_key)}**` : null))
        .filter(Boolean);
      if (touched.length) {
        parts.push(`Updated the living document: ${touched.join(", ")}.`);
      }
      const fresh =
        (parsed.gap_questions?.length ?? 0) +
        (parsed.question_updates?.filter((u) => !u.question_id).length ?? 0);
      const updated =
        parsed.question_updates?.filter((u) => u.question_id).length ?? 0;
      if (fresh) parts.push(`Raised ${fresh} new question${fresh === 1 ? "" : "s"}.`);
      if (updated) parts.push(`Updated ${updated} open question${updated === 1 ? "" : "s"}.`);
      return parts.join(" ") || "Reviewed the round — no changes recorded.";
    }
    if (Array.isArray(parsed.holes)) {
      const names = parsed.holes
        .map((h) => h.claim_attacked ?? h.claim)
        .filter(Boolean);
      return names.length
        ? `Opened ${names.length} hole${names.length === 1 ? "" : "s"}:\n${names
            .map((n) => `- ${n}`)
            .join("\n")}`
        : "No holes found this round.";
    }
  } catch {
    // Not a JSON envelope after all — render as-is.
  }
  return raw;
}

export function TurnCard({ turn }: { turn: InterviewTurnRow }) {
  const isHuman = turn.speaker === "human";
  const isScribe = turn.speaker === "scribe";
  const role = isHuman ? null : ROLES[turn.speaker as RoleKey];
  const name = role?.name ?? "You";
  const [copied, setCopied] = useState(false);
  const content = displayContent(turn);

  const copyTurn = async () => {
    try {
      await navigator.clipboard.writeText(content);
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
            // The Scribe never speaks to the person — its turn is a quiet
            // activity record of what it changed, not a chat bubble.
            isScribe &&
              "rounded-lg border border-border/60 bg-muted/40 px-3 py-2",
          )}
        >
          <RichDocument
            content={content}
            source={{ type: "raw" }}
            hideCopyButton
            contentClassName={isScribe ? "text-[13px] text-muted-foreground" : "text-sm"}
          />
        </div>
      </div>
    </div>
  );
}
