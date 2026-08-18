"use client";

// features/vision-interview/components/ExpertFeedSection.tsx
//
// ONE collapsible section of the room's aggregate feed (right panel): the
// human, or one expert. The header carries that speaker's Lucide icon and
// name TOGETHER (RoleAvatar — the room's one avatar disc) plus a live count
// of their contributions; the body stacks everything they have said, in
// order, with the newest item tinted so it is findable at a glance.
//
// Rendering ownership — nothing is hand-rolled here:
//   * PERSISTED expert turns render through <TurnCard>, this feature's one
//     turn renderer (RichDocument → MarkdownStream → BlockRenderer, plus the
//     legacy-JSON healing and the audio/copy affordances).
//   * LIVE expert tokens render through <LiveTurnCard>, this feature's one
//     in-flight renderer (activeRequests.nodeStreams, fed by
//     followWorkflowRunStream). No chunk bucketing, no parse session.
//   * THE HUMAN'S OWN WORDS RENDER AS PLAIN TEXT — deliberate (Arman,
//     2026-08-18). What the Expert typed or dictated is never re-interpreted
//     as markdown here; it is shown back exactly as spoken.
//
// THE DUPLICATE-STREAM RULE: when this speaker's tab is the ACTIVE one in the
// center panel, their tokens are already streaming there, so this section
// shows an honest quiet line instead of a second copy of the same stream.
// A finished turn always lands here regardless of which tab is active.

import { cn } from "@/lib/utils";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { WorkflowNodeStreamEntry } from "@/features/agents/types/request.types";
import { ROLES, type InterviewTurnRow, type RoleKey } from "../types";
import { LiveTurnCard } from "./LiveTurnCard";
import { RoleAvatar } from "./RoleAvatar";
import { TurnCard } from "./TurnCard";

export interface ExpertFeedSectionProps {
  /** Accordion value — `"you"` for the human, otherwise the role key. */
  sectionKey: string;
  /** The expert this section belongs to; null = the human's pinned section. */
  role: RoleKey | null;
  /** Everything this speaker has said, oldest first. */
  turns: readonly InterviewTurnRow[];
  /** This speaker's in-flight node stream, when one is running. */
  live: WorkflowNodeStreamEntry | null;
  /** True when this role's tab is active in the center — suppress its tokens. */
  liveSuppressed: boolean;
  /** True when this role is running as a silent observer this round. */
  observing: boolean;
  /** The session's current round — the live card's meta line. */
  round: number;
}

function turnTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function ExpertFeedSection({
  sectionKey,
  role,
  turns,
  live,
  liveSuppressed,
  observing,
  round,
}: ExpertFeedSectionProps) {
  const meta = role ? ROLES[role] : null;
  const name = meta?.name ?? "You";
  const accentText = meta?.accent.text ?? "text-foreground";
  const streaming = live !== null;
  const lastIndex = turns.length - 1;

  return (
    <AccordionItem
      value={sectionKey}
      className="border-b border-border/60 last:border-b-0"
    >
      <AccordionTrigger
        className="gap-2 rounded-none px-2 py-1.5 text-left"
        rightElements={
          streaming ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide",
                accentText,
              )}
            >
              <span
                className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-current"
                aria-hidden
              />
              Live
            </span>
          ) : null
        }
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <RoleAvatar role={role} size="sm" speaking={streaming} />
          <span className={cn("truncate text-[13px] font-semibold", accentText)}>
            {name}
          </span>
          <span
            className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground"
            title={`${turns.length} contribution${turns.length === 1 ? "" : "s"}`}
          >
            {turns.length}
          </span>
        </span>
      </AccordionTrigger>

      <AccordionContent className="space-y-1 px-1 pb-1.5 pt-0">
        {turns.length === 0 && !streaming && (
          <p className="px-1.5 py-1 text-[11px] text-muted-foreground">
            Nothing yet.
          </p>
        )}

        {turns.map((turn, index) =>
          role === null ? (
            // PLAIN TEXT, on purpose — the Expert's own words, unformatted.
            <div
              key={turn.id}
              className={cn(
                "rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-1.5",
                index === lastIndex && lastIndex > 0 && "ring-1 ring-primary/25",
              )}
            >
              <p className="mb-0.5 text-[10px] text-muted-foreground">
                Round {turn.round}
                {turnTime(turn.created_at) && ` · ${turnTime(turn.created_at)}`}
              </p>
              <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                {turn.content}
              </p>
            </div>
          ) : (
            <div
              key={turn.id}
              className={cn(
                "rounded-md",
                index === lastIndex && lastIndex > 0 && "bg-muted/40",
              )}
            >
              <TurnCard turn={turn} />
            </div>
          ),
        )}

        {live && role !== null && (
          liveSuppressed ? (
            <p
              className={cn(
                "flex items-center gap-1.5 px-1.5 py-1 text-[11px]",
                accentText,
              )}
            >
              <span
                className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-current"
                aria-hidden
              />
              <span className="text-muted-foreground">
                Speaking in the conversation right now — their answer lands here
                when it finishes.
              </span>
            </p>
          ) : observing ? (
            <p className="px-1.5 py-1 text-[11px] italic text-muted-foreground">
              Taking notes quietly…
            </p>
          ) : (
            <LiveTurnCard role={role} stream={live} round={round} />
          )
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
