"use client";

// features/masterwork/record/InterviewChooser.tsx
//
// "Pick up the one I was having, or have a new one."
//
// Shown when a Rulebook already has interview conversations. Every prior
// interview is a row the Expert can RECOGNISE — when it happened, how many
// turns they took, how much they said, how many rules it produced, and the
// first line of what they actually said — with Continue on each, and Start a
// new interview beside them. THE DOOR LAW: every row also opens the full
// conversation in a new tab.
//
// Silently minting a new conversation when prior ones exist is the defect this
// exists to prevent.

import Link from "next/link";
import { ArrowRight, ExternalLink, MessagesSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RulebookInterview } from "./service";

function relativeWhen(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function wordCount(chars: number): string {
  // Characters mean nothing to an Expert; roughly-spoken words do.
  const words = Math.round(chars / 5.5);
  if (words < 1000) return `${words} words`;
  return `${(words / 1000).toFixed(1)}k words`;
}

export interface InterviewChooserProps {
  interviews: RulebookInterview[];
  onContinue: (conversationId: string) => void;
  onStartNew: () => void;
}

export function InterviewChooser({
  interviews,
  onContinue,
  onStartNew,
}: InterviewChooserProps) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto px-4 py-4">
      <p className="text-sm text-muted-foreground">
        You&apos;ve talked this through before. Pick up where you left off, or
        start fresh.
      </p>

      <ul className="space-y-2">
        {interviews.map((interview) => (
          <li
            key={interview.conversationId}
            className="rounded-lg border border-border bg-card p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <MessagesSquare
                    className="h-3.5 w-3.5 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span className="truncate">
                    {relativeWhen(interview.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {interview.expertTurnCount === 0
                    ? "You didn't say anything yet"
                    : `${interview.expertTurnCount} thing${
                        interview.expertTurnCount === 1 ? "" : "s"
                      } you said · ${wordCount(interview.expertChars)}`}
                  {interview.rulesProduced > 0
                    ? ` · ${interview.rulesProduced} rule${
                        interview.rulesProduced === 1 ? "" : "s"
                      } from it`
                    : ""}
                </p>
                {interview.firstExpertLine ? (
                  <p className="mt-1.5 line-clamp-2 text-xs italic text-muted-foreground">
                    &ldquo;{interview.firstExpertLine}&rdquo;
                  </p>
                ) : null}
              </div>
              <Button
                asChild
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                title="Open the full conversation in a new tab"
              >
                <Link
                  href={`/chat/${interview.conversationId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="sr-only">Open in a new tab</span>
                </Link>
              </Button>
            </div>
            <Button
              size="sm"
              className="mt-2 h-8 w-full"
              onClick={() => onContinue(interview.conversationId)}
            >
              Continue this one
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>

      <Button
        size="sm"
        variant="outline"
        className="h-9"
        onClick={onStartNew}
      >
        <Plus className="mr-1 h-4 w-4" />
        Start a new interview
      </Button>
    </div>
  );
}
