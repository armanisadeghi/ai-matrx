"use client";

// features/masterwork/record/ConversationsSection.tsx
//
// CONVERSATIONS ARE FIRST-CLASS ON THE RULEBOOK PAGE.
//
// Arman, 2026-08-17, testing live: "we are not tracking the conversations for
// a particular masterwork being produced. I can't see it. So if it's in the
// UI, it's hidden… I want to be able to see all of those conversations, click
// one, pick up right where I left off, and be able to then create a new one."
//
// The machinery existed (the platform.associations edge, listRulebookInterviews,
// the InterviewChooser) — but the ONLY place it showed was inside the
// "Interview me" sheet, so an Expert who never reopened the sheet never saw
// their own conversations. This section puts every interview on the Rulebook
// page itself: when, how many turns, how much was said, rules produced, the
// first line — with Continue (resumes in the interview panel), a new-tab door
// to the full conversation, a full-page door to /masterwork/[id]/interview,
// and a prominent "New interview".
//
// ONE query path: listRulebookInterviews. A second assembly is a defect.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  Expand,
  MessagesSquare,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { relativeWhen, wordCount } from "./format";
import {
  listRulebookInterviewsWithAccess,
  type RulebookInterview,
} from "./service";
import type { RulebookRule } from "../types";
import { YourWordsActions } from "./YourWordsActions";

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
    <section
      className="rounded-lg border border-border bg-card p-4"
      data-surface-value="conversations"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessagesSquare className="h-4 w-4 text-primary" aria-hidden />
          Conversations
          {interviews && interviews.length > 0 ? (
            <span className="text-xs font-normal text-muted-foreground">
              {interviews.length}
            </span>
          ) : null}
        </h3>
        <div className="flex gap-2">
          <YourWordsActions rulebookId={rulebookId} compact variant="ghost" />
          {canEdit ? (
            <Button size="sm" className="h-7" onClick={onStartNew}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              New interview
            </Button>
          ) : null}
        </div>
      </div>

      {interviews === null ? (
        <div className="flex justify-center py-4">
          <LoadingSpinner size="sm" />
        </div>
      ) : interviews.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-border px-4 py-5 text-center">
          <p className="text-sm text-muted-foreground">
            Every interview you have about this Rulebook lives here — nothing
            you say is ever lost. Start the first one: talk about how you work,
            and rules get drafted as you speak.
          </p>
          {canEdit ? (
            <Button size="sm" className="mt-3" onClick={onStartNew}>
              <MessagesSquare className="mr-1 h-4 w-4" />
              Start your first interview
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {interviews.map((interview) => (
            <li
              key={interview.conversationId}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium text-foreground">
                    {interview.title ?? "Interview"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {relativeWhen(interview.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
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
                  <p className="mt-0.5 line-clamp-1 text-xs italic text-muted-foreground">
                    &ldquo;{interview.firstExpertLine}&rdquo;
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  asChild
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="Continue full-screen"
                >
                  <Link
                    href={`/masterwork/${rulebookId}/interview?conversation=${interview.conversationId}`}
                  >
                    <Expand className="h-3.5 w-3.5" />
                    <span className="sr-only">Continue full-screen</span>
                  </Link>
                </Button>
                <Button
                  asChild
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
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
                {canEdit ? (
                  <Button
                    size="sm"
                    className="h-7"
                    onClick={() => onContinue(interview.conversationId)}
                  >
                    Continue
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {hiddenCount === 1
            ? "1 more interview exists that isn't yours to read."
            : `${hiddenCount} more interviews exist that aren't yours to read.`}
        </p>
      ) : null}
    </section>
  );
}
