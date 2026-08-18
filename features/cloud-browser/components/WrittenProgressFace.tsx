"use client";

/**
 * WrittenProgressFace — the DEFAULT face (D-8 tier 1).
 *
 * The agent's live play-by-play: what it is doing, where it is, what it just
 * finished. NO pictures, NO video. Each step is discrete structured content from
 * the browser.action_event ledger (S1 §2.10) — this is NOT a token stream, so it
 * renders each line through the canonical markdown component
 * (BasicMarkdownContent → BlockRenderer), never a hand-rolled stream renderer.
 */

import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { cn } from "@/utils/cn";
import {
  Bot,
  CircleDot,
  User,
  Cog,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Clock,
} from "lucide-react";
import type { ProgressEvent } from "../types";

function ActorIcon({ actor }: { actor: ProgressEvent["actor"] }) {
  if (actor === "human") return <User className="h-3.5 w-3.5 text-primary" aria-label="Person" />;
  if (actor === "system") return <Cog className="h-3.5 w-3.5 text-muted-foreground" aria-label="System" />;
  return <Bot className="h-3.5 w-3.5 text-primary" aria-label="Agent" />;
}

function ResultIcon({ result }: { result: ProgressEvent["resultClass"] }) {
  switch (result) {
    case "ok":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-label="Done" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-red-500" aria-label="Failed" />;
    case "timeout":
      return <Clock className="h-3.5 w-3.5 text-amber-500" aria-label="Timed out" />;
    case "blocked_by_human_control":
    case "refused_by_policy":
      return <ShieldAlert className="h-3.5 w-3.5 text-amber-500" aria-label="Blocked" />;
    default:
      return <CircleDot className="h-3.5 w-3.5 text-muted-foreground" aria-label={result} />;
  }
}

export function WrittenProgressFace({
  events,
  className,
}: {
  events: ProgressEvent[];
  className?: string;
}) {
  if (events.length === 0) {
    return (
      <div className={cn("flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground", className)}>
        Nothing has happened yet. When this Cloud Browser starts working, its step-by-step progress shows here.
      </div>
    );
  }

  const ordered = [...events].sort((a, b) => b.sequence - a.sequence);

  return (
    <ScrollArea className={cn("h-full", className)}>
      <ol className="flex flex-col gap-1 p-2">
        {ordered.map((e) => (
          <li
            key={e.id}
            className="flex items-start gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
          >
            <div className="mt-0.5 flex items-center gap-1">
              <ActorIcon actor={e.actor} />
              <ResultIcon result={e.resultClass} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <BasicMarkdownContent content={e.summary} showCopyButton={false} />
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{new Date(e.occurredAt).toLocaleTimeString()}</span>
                {e.origin ? (
                  <span className="truncate">{new URL(e.origin).host}</span>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </ScrollArea>
  );
}
