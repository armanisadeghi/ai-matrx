"use client";

// features/masterwork/record/ConversationsSection.tsx
//
// THE INTERVIEW LIST — every conversation the Expert ever had about this
// Rulebook, rendered as a LIST inside the one Sources section (never its own
// card, never a fat "conversation card").
//
// Arman, 2026-08-17: "we are not tracking the conversations for a particular
// masterwork being produced… I want to be able to see all of those
// conversations, click one, pick up right where I left off."
// Arman, 2026-08-18, on the card this used to be: "representing a conversation
// as though it's a card with a title and description and all this shit. No one
// gives a fuck. It's a session. The title is enough, and it needs to render a
// LIST."
//
// So: one row per interview — title, when, a tiny meta line — with Continue
// (resumes in the interview panel beside the rules), a full-page door, and a
// new-tab door to the whole conversation. The section header above owns
// "New interview" and "Your words"; this file renders NO chrome of its own.
//
// ONE query path: listRulebookInterviews. A second assembly is a defect.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  Expand,
  MessagesSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { relativeWhen, wordCount } from "./format";
import {
  listRulebookInterviewsWithAccess,
  type RulebookInterview,
} from "./service";
import type { RulebookRule } from "../types";

export interface ConversationsSectionProps {
  rulebookId: string;
  /** Rules power the read-time healing + rules-produced counts. */
  rules: RulebookRule[];
  /** Refetch when the Rulebook version moves (the Scout landed new drafts). */
  rulebookVersion: number;
  canEdit: boolean;
  /** Resume THIS conversation in the interview panel, beside the rules. */
  onContinue: (conversationId: string) => void;
  /** Start a brand-new interview in the panel. */
  onStartNew: () => void;
}

export function ConversationsSection({
  rulebookId,
  rules,
  rulebookVersion,
  canEdit,
  onContinue,
  onStartNew,
}: ConversationsSectionProps) {
  const [interviews, setInterviews] = useState<RulebookInterview[] | null>(
    null,
  );
  const [hiddenCount, setHiddenCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await listRulebookInterviewsWithAccess(rulebookId, rules);
      if (cancelled) return;
      setInterviews(res.interviews);
      setHiddenCount(res.hiddenCount);
    })();
    return () => {
      cancelled = true;
    };
    // rulebookVersion is the refresh signal: the Scout writing drafts bumps it.
  }, [rulebookId, rules, rulebookVersion]);

  return (
    <div data-surface-value="conversations">
      {interviews === null ? (
        <div className="flex justify-center py-3">
          <LoadingSpinner size="sm" />
        </div>
      ) : interviews.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          No interviews yet. Talk about how you work and rules get drafted as
          you speak
          {canEdit ? (
            <>
              {" — "}
              <button
                type="button"
                onClick={onStartNew}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                start the first one
              </button>
            </>
          ) : null}
          .
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {interviews.map((interview) => (
            <li
              key={interview.conversationId}
              className="flex items-center gap-2 px-1 py-1.5"
            >
              <MessagesSquare
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-foreground">
                  {interview.title ?? "Interview"}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {relativeWhen(interview.createdAt)}
                  {interview.expertTurnCount > 0
                    ? ` · ${wordCount(interview.expertChars)}`
                    : " · nothing said yet"}
                  {interview.rulesProduced > 0
                    ? ` · ${interview.rulesProduced} rule${
                        interview.rulesProduced === 1 ? "" : "s"
                      }`
                    : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                      <Link
                        href={`/masterwork/${rulebookId}/interview?conversation=${interview.conversationId}`}
                      >
                        <Expand className="h-3.5 w-3.5" />
                        <span className="sr-only">Continue full-screen</span>
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Continue on its own full page</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                      <Link
                        href={`/chat/${interview.conversationId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span className="sr-only">Open in a new tab</span>
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Read the whole conversation in a new tab
                  </TooltipContent>
                </Tooltip>
                {canEdit ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => onContinue(interview.conversationId)}
                      >
                        Continue
                        <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Pick this interview back up here, beside your rules
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 ? (
        <p className="px-1 pt-1 text-[11px] text-muted-foreground">
          {hiddenCount === 1
            ? "1 more interview exists that isn't yours to read."
            : `${hiddenCount} more interviews exist that aren't yours to read.`}
        </p>
      ) : null}
    </div>
  );
}
