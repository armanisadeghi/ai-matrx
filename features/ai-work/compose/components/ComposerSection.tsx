"use client";

/**
 * ComposerSection — one numbered step of the `/work/new` progressive form.
 *
 * The composer is read top-to-bottom by someone who does not know what an
 * agent, a skill, or a context slot is, so every step states its question in
 * plain language and shows its current answer in the header. A step that is
 * not ready yet says WHY instead of disappearing — a step that vanishes is a
 * dead end.
 */

import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComposerSectionProps {
  step: number;
  title: string;
  question: string;
  /** The current answer, rendered in the header. Keep it to a few words. */
  answer?: ReactNode;
  /** Marks the step as answered (check mark in the number bubble). */
  complete?: boolean;
  /** When set, the body is replaced by this sentence and cannot be opened. */
  blockedReason?: string | null;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function ComposerSection({
  step,
  title,
  question,
  answer,
  complete = false,
  blockedReason = null,
  open,
  onToggle,
  children,
}: ComposerSectionProps) {
  const isOpen = open && !blockedReason;
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        disabled={Boolean(blockedReason)}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
          blockedReason ? "cursor-default" : "hover:bg-accent/40",
        )}
      >
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            complete
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {complete ? <Check className="h-3.5 w-3.5" /> : step}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            {title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {answer ?? question}
          </span>
        </span>
        {!blockedReason && (
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              isOpen && "rotate-180",
            )}
          />
        )}
      </button>

      {blockedReason ? (
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {blockedReason}
        </p>
      ) : (
        isOpen && (
          <div className="border-t border-border px-4 py-3">{children}</div>
        )
      )}
    </section>
  );
}
