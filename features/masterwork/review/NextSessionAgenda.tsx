"use client";

// features/masterwork/review/NextSessionAgenda.tsx
//
// THE NEXT SESSION'S AGENDA, on the Rulebook page.
//
// Doctrine CORE.md §5: "the review is mine / not mine / mine but wrong, and the
// last two rows are the next session's agenda." §7: the review is "the starting
// point, revisited after every real run."
//
// This panel is a READING of rules that already carry the Expert's verdict — no
// new state, no second store (`./agenda.ts`). It exists so the Expert can see
// what the next interview will open on without hunting through a long Rulebook,
// and so the interview has somewhere to start that is not "so, tell me about
// your work" all over again. The SAME list already reaches the interviewer:
// `renderRulebookDocument` puts it in the bound Rulebook document before the
// agent's first turn, and the server's `rulebook action=read` returns it as
// `open_feedback`. Three surfaces, one derivation.
//
// THE KNOB: `masterwork.review` / `agenda_panel` (boolean, default on). An
// organization that does not want this on the page turns it off; the
// interviewer keeps receiving the agenda either way, because that is a
// provision, not a panel.
//
// EVERY ROW IS A DOOR (no-dead-ends): the rule name scrolls to the rule itself.

import { CalendarClock, MessageSquareWarning, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { cn } from "@/lib/utils";

import { ruleAnchorId } from "../components/detail/RuleRelations";
import type { Rulebook } from "../types";
import { AGENDA_KIND_LABELS, buildReviewAgenda } from "./agenda";
import type { ReviewVocabulary } from "./vocabulary";

export const AGENDA_PANEL_KNOB_FEATURE = "masterwork.review";
export const AGENDA_PANEL_KNOB_KEY = "agenda_panel";
export const AGENDA_PANEL_KNOB_FULL_KEY =
  `${AGENDA_PANEL_KNOB_FEATURE}.${AGENDA_PANEL_KNOB_KEY}` as const;

/**
 * Whether the page shows the panel. Read through the LADDER, because the row
 * declares an organization rung and a flat read would make that a lie.
 *
 * ON until the read lands and if it never lands: the agenda is the Expert's own
 * words about their own rules, and hiding their open review work on a failed
 * knob read would be the screen lying by omission. Only an explicit `false`
 * hides it.
 */
export function useAgendaPanelEnabled(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  const raw = useEffectiveKnob(
    organizationId,
    userId,
    AGENDA_PANEL_KNOB_FULL_KEY,
  );
  return raw !== false && raw !== "false";
}

export function NextSessionAgenda({
  rulebook,
  vocabulary,
  className,
}: {
  rulebook: Rulebook | null;
  vocabulary: ReviewVocabulary;
  className?: string;
}) {
  const items = buildReviewAgenda(rulebook);
  if (items.length === 0) return null;

  return (
    <section
      className={cn(
        "rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
        <h3 className="text-sm font-medium text-foreground">
          Next session starts here
        </h3>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-primary">
          {items.length}
        </Badge>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {vocabulary === "ownership"
          ? "Everything you said isn't yours, or is yours but came out wrong. The interviewer opens on these — in your words."
          : "Everything you rejected or asked to change. The interviewer opens on these — in your words."}
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li
            key={item.rule.id}
            className="rounded-md border border-border bg-card px-2.5 py-1.5"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {item.kind === "not_mine" ? (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
              ) : (
                <MessageSquareWarning className="h-3.5 w-3.5 shrink-0 text-primary" />
              )}
              <Badge
                variant="outline"
                className={cn(
                  "px-1.5 py-0 text-[10px]",
                  item.kind === "not_mine"
                    ? "border-destructive/50 text-destructive"
                    : "border-primary/40 text-primary",
                )}
              >
                {vocabulary === "ownership"
                  ? AGENDA_KIND_LABELS[item.kind].ownership
                  : AGENDA_KIND_LABELS[item.kind].standard}
              </Badge>
              {/* THE DOOR: the row opens the rule it is about. */}
              <a
                href={`#${ruleAnchorId(item.rule.id)}`}
                className="min-w-0 truncate text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                {item.rule.name}
              </a>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.words ? (
                <>
                  <span className="text-foreground">Your words: </span>
                  {item.words}
                </>
              ) : (
                // Honest: a verdict with no sentence is a real state, not a
                // blank to be filled with something nobody said.
                "You gave no reason — the interviewer will ask."
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
