"use client";

// lib/reversible/ReversibleNotice.tsx
//
// THE ONE BODY OF EVERY REVERSIBLE-ACTION ANNOUNCEMENT, in three volumes (`@ai-matrx/kit/reversible`
// decides which):
//   teach — the first time a person does this verb: a card that stays until they close it or act,
//           a big Undo with its shortcut, where the thing went and a link that opens that place.
//   guide — their next few times, or the first times on a new kind of thing: Undo + the link.
//   plain — after that: Undo.
// Drawn inside sonner's toaster by `announceReversible`, so hovering or focusing it holds it.

import Link from "next/link";
import { ArrowUpRight, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReversibleFoundAt, ReversibleTier } from "@ai-matrx/kit/reversible";
import { foundAtHref } from "@ai-matrx/kit/reversible";
import { cn } from "@/lib/utils";

export interface ReversibleNoticeProps {
  tier: ReversibleTier;
  /** "Archived “Patient Visit Tracker”" */
  title: string;
  foundAt?: ReversibleFoundAt | undefined;
  /** "⌘Z" or "Ctrl+Z" */
  shortcut: string;
  onUndo: () => void;
  /** Close without undoing (Got it, ×, Escape). */
  onDismiss: () => void;
}

function Shortcut({ keys, className }: { keys: string; className?: string }) {
  return (
    <kbd
      className={cn(
        "rounded border border-current/30 px-1 font-sans text-[10px] font-medium leading-4 opacity-80",
        className,
      )}
    >
      {keys}
    </kbd>
  );
}

export function ReversibleNotice({ tier, title, foundAt, shortcut, onUndo, onDismiss }: ReversibleNoticeProps) {
  const teach = tier === "teach";
  const titleId = `reversible-${tier}-title`;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-reversible-notice={tier}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onDismiss();
        }
      }}
      className={cn(
        "relative flex w-[var(--width,356px)] flex-col rounded-lg border bg-card text-card-foreground shadow-lg outline-none",
        teach ? "gap-3 border-primary/40 p-4" : "gap-2 border-border p-3",
      )}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onDismiss}
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>

      <p id={titleId} className={cn("pr-6 font-medium", teach ? "text-base" : "text-sm")}>
        {title}
      </p>

      {teach ? (
        <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
          <span>{foundAt ? `Nothing is lost. It waits in ${foundAt.label}.` : "Nothing is lost."}</span>
          <span className="flex items-center gap-1">
            Next time, press <Shortcut keys={shortcut} /> right after.
          </span>
        </div>
      ) : null}

      <div className={cn("flex flex-wrap items-center", teach ? "gap-2" : "gap-1.5")}>
        <Button size={teach ? "default" : "sm"} onClick={onUndo} data-reversible-undo="">
          <Undo2 className="mr-1.5 h-4 w-4" aria-hidden />
          Undo
          <Shortcut keys={shortcut} className="ml-2" />
        </Button>
        {foundAt && tier !== "plain" ? (
          <Button asChild size={teach ? "default" : "sm"} variant="outline">
            <Link href={foundAtHref(foundAt)} onClick={onDismiss} data-reversible-found="">
              Open {foundAt.label}
              <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
        ) : null}
        {teach ? (
          <Button size="default" variant="ghost" onClick={onDismiss}>
            Got it
          </Button>
        ) : null}
      </div>
    </div>
  );
}
