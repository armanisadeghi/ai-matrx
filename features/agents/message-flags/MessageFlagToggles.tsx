"use client";

/**
 * The three message-flag toggles, sized for the message header row (no extra
 * rows). An active flag always shows; an inactive one appears on hover. A flag
 * the selected model cannot honour stays clickable but greyed (or amber when
 * set), and its tooltip says exactly why — compatibility is never silent.
 */

import { BookMarked, DatabaseZap, TextCursorInput, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FlagVerdict, MessageFlagKey, MessageFlags } from "./flags";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface FlagToggleState {
  /** Absent (not rendered) — e.g. Prefill on a user message. */
  hidden?: boolean;
  verdict: FlagVerdict;
  /** A placement rule this message breaks while the flag is set. */
  placementProblem?: string | null;
}

const FLAG_META: Record<MessageFlagKey, { label: string; what: string; icon: LucideIcon }> = {
  prefill: {
    label: "Prefill",
    what: "The reply starts with this message's text.",
    icon: TextCursorInput,
  },
  cache_boundary: {
    label: "Cache from here",
    what: "Everything up to and including this message is cached for repeat runs.",
    icon: DatabaseZap,
  },
  example: {
    label: "Example",
    what: "A sample exchange that shows the model what a good answer looks like. Runs show examples collapsed.",
    icon: BookMarked,
  },
};

const ORDER: MessageFlagKey[] = ["example", "cache_boundary", "prefill"];

interface MessageFlagTogglesProps {
  flags: MessageFlags;
  states: Partial<Record<MessageFlagKey, FlagToggleState>>;
  onToggle: (flag: MessageFlagKey) => void;
  className?: string;
}

export function MessageFlagToggles({ flags, states, onToggle, className }: MessageFlagTogglesProps) {
  return (
    <div className={cn("flex items-center gap-0.5", className)} data-testid="message-flag-toggles">
      {ORDER.map((flag) => {
        const state = states[flag];
        if (!state || state.hidden) return null;
        const on = flags[flag] === true;
        const { label, what, icon: Icon } = FLAG_META[flag];
        const impaired = state.verdict.verdict === "refused" || state.verdict.verdict === "noop";
        const broken = on && (state.verdict.verdict === "refused" || !!state.placementProblem);
        return (
          <Tooltip key={flag}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={on}
                aria-label={label}
                data-testid={`message-flag-${flag}`}
                data-verdict={state.verdict.verdict}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(flag);
                }}
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded transition-opacity hover:bg-accent",
                  on
                    ? broken
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-primary"
                    : cn(
                        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                        impaired ? "text-muted-foreground/40" : "text-muted-foreground",
                      ),
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="z-[9999] max-w-xs text-xs">
              <p className="font-medium">
                {label}
                {on ? " — on" : ""}
              </p>
              <p className="text-muted-foreground">{what}</p>
              <p className="mt-1">{state.verdict.reason}</p>
              {state.placementProblem && (
                <p className="mt-1 text-amber-600 dark:text-amber-400">{state.placementProblem} <ErrorAlchemyMenu error={state.placementProblem} /></p>
              )}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
