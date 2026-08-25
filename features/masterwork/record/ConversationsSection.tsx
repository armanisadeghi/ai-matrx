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
  ChevronDown,
  ExternalLink,
  Expand,
  MessagesSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  /** Reports how many interviews loaded (the parent heading shows it). */
  onCount?: (count: number) => void;
}

export function ConversationsSection({
  rulebookId,
  rules,
  rulebookVersion,
  canEdit,
  onContinue,
  onStartNew,
  onCount,
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
      onCount?.(res.interviews.length);
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
        <div className="flex justify-center px-3 py-4">
          <LoadingSpinner size="sm" />
        </div>
      ) : interviews.length === 0 ? (
        <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">
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
        <ul className="divide-y divide-border/70">
          {interviews.map((interview) => (
            <li
              key={interview.conversationId}
              className="flex min-h-14 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/20"
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
              {/* ONE Continue (Arman, 2026-08-21): "those three are all
                  continue, but only one of them is called Continue, which
                  confuses things." The row now has exactly one action —
                  Continue — and a small chevron for the two other WAYS of
                  continuing (full page, new tab). Same three doors, one name. */}
              <div className="flex shrink-0 items-center gap-1">
                {canEdit ? (
                  <div className="flex items-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-r-none"
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-6 rounded-l-none border-l-0"
                          aria-label="Other ways to continue"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/masterwork/${rulebookId}/interview?conversation=${interview.conversationId}`}
                            className="flex items-center gap-2"
                          >
                            <Expand className="h-3.5 w-3.5" />
                            Continue on a full page
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/chat/${interview.conversationId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Read it in a new tab
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        asChild
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                      >
                        <Link
                          href={`/chat/${interview.conversationId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span className="sr-only">Read it in a new tab</span>
                        </Link>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Read the whole conversation in a new tab
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 ? (
        <p className="border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
          {hiddenCount === 1
            ? "1 more interview exists that isn't yours to read."
            : `${hiddenCount} more interviews exist that aren't yours to read.`}
        </p>
      ) : null}
    </div>
  );
}
