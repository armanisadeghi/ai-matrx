"use client";

/**
 * THE PR DIRECTOR'S MENU, AS BUTTONS (BRIEFS-STRATEGY-AND-ORG-CHART §2 Output, PARITY X19).
 *
 * Every play the Director offers is a button that starts that play:
 *
 * - `run_member` / `run_workflow` → the next turn of THIS conversation asks the Director to start it. The
 *   Director owns the routing (its member-selection rules §2.3 and the spend approval of a pipeline), so the
 *   button never calls a specialist behind its back — it says, in the person's words, "do this one".
 * - `open_surface` → navigates, when the target is a route in this app. A target that is not one is shown as
 *   plain text with the reason — never a dead button.
 *
 * The reader never sees field names, member titles, tool names or mandate keys: the kind is data for the
 * buttons only.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Compass, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import type { PrPlayView } from "@/features/content-ir/kinds/pr-play-menu";

const EFFORT_LABEL: Record<"one_or_two_moves" | "program", string> = {
  one_or_two_moves: "One or two moves",
  program: "A program",
};

/** What the person "says" when they press a play: plain words, no machinery. */
export function playRequestText(play: PrPlayView): string {
  const first = play.firstMove ? ` Start with: ${play.firstMove}` : "";
  return `Let's go with "${play.title}". Go ahead and start it now.${first}`;
}

/** A route inside this app, or null when the target is not one we can open. */
export function surfaceHref(target: string): string | null {
  const t = target.trim();
  if (t.startsWith("/") && !t.startsWith("//")) return t;
  return null;
}

export interface PrPlayMenuViewProps {
  plays: PrPlayView[];
  nextMove: string;
  /** The conversation the menu was answered in; the next turn goes there. */
  conversationId: string | null;
}

export function PrPlayMenuView({ plays, nextMove, conversationId }: PrPlayMenuViewProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const executing = useAppSelector((state) =>
    conversationId ? selectIsExecuting(conversationId)(state) : false,
  );
  const [started, setStarted] = useState<string | null>(null);

  const startPlay = useCallback(
    (play: PrPlayView) => {
      if (!conversationId) return;
      setStarted(play.title);
      dispatch(setUserInputText({ conversationId, text: playRequestText(play) }));
      void dispatch(smartExecute({ conversationId }));
    },
    [conversationId, dispatch],
  );

  if (plays.length === 0) {
    return nextMove ? <p className="text-sm font-medium">{nextMove}</p> : null;
  }

  return (
    <div className="my-2 flex flex-col gap-2" data-testid="pr-play-menu">
      {plays.map((play, i) => {
        const action = play.action;
        const href = action?.type === "open_surface" ? surfaceHref(action.target) : null;
        return (
          <div
            key={`${play.title}-${i}`}
            className={cn(
              "rounded-lg border bg-card p-3",
              i === 0 ? "border-primary/40" : "border-border",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">
                {i === 0 ? "Main play: " : "Or: "}
                {play.title}
              </p>
              {play.effort ? (
                <span className="text-[11px] text-muted-foreground">{EFFORT_LABEL[play.effort]}</span>
              ) : null}
            </div>
            {play.whyThisFounder ? (
              <p className="mt-1 text-xs text-muted-foreground">{play.whyThisFounder}</p>
            ) : null}
            {play.firstMove ? (
              <p className="mt-1.5 text-xs">
                <span className="font-medium">First move: </span>
                {play.firstMove}
              </p>
            ) : null}
            {play.trap ? (
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-medium">Watch out: </span>
                {play.trap}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {action?.type === "open_surface" ? (
                href ? (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => router.push(href)}>
                    <Compass className="mr-1 size-3.5" aria-hidden />
                    Open it
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    This play opens a screen that has no link yet — ask the director to take you through it here.
                  </span>
                )
              ) : conversationId ? (
                <Button
                  size="sm"
                  variant={i === 0 ? "default" : "outline"}
                  className="h-7 text-xs"
                  disabled={executing}
                  onClick={() => startPlay(play)}
                >
                  <Play className="mr-1 size-3.5" aria-hidden />
                  {started === play.title ? "Started" : "Start this play"}
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  Open this answer in its conversation to start the play.
                </span>
              )}
            </div>
          </div>
        );
      })}
      {nextMove ? (
        <p className="flex items-start gap-1.5 text-sm font-medium">
          <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {nextMove}
        </p>
      ) : null}
    </div>
  );
}
