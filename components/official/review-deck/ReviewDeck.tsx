"use client";

/**
 * components/official/review-deck/ReviewDeck.tsx — ONE review grammar
 * (CONTRACTS §4.2, platform law 5).
 *
 * Proposals, page intents, agent suggestions and anything else a person says
 * yes or no to all arrive here. Before this component each of those grew its
 * own accept/reject affordance, its own keyboard shortcuts and its own idea of
 * what "accept all" costs — and only some of them said what accepting all
 * would do.
 *
 * THE MODE IS THE HOST'S (a knob), NEVER THIS COMPONENT'S TASTE. `mode` comes
 * in and `onModeChange` goes out; the switcher is rendered so a person can
 * override the org's default for one sitting without an admin.
 *
 * 🚨 accept_all / reject_all / batch NEVER run on the click. They open a
 * `ConfirmDialog` whose description is the host's `consequence(ids, verb)` —
 * the platform's destructive-and-expensive-actions law: a confirmation names
 * what is about to change, and "Are you sure?" is not a confirmation.
 */

import type { ReactNode } from "react";
import { useState } from "react";

import { Button, Checkbox } from "@ai-matrx/design-system";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

export type ReviewMode = "one_by_one" | "accept_all" | "reject_all" | "batch";

export interface ReviewItem {
  id: string;
  title: string;
  subtitle?: string;
  body?: ReactNode;
  meta?: ReactNode;
}

export interface ReviewDeckProps {
  items: readonly ReviewItem[];
  /** From the knob. A switcher is rendered so the person can change it here. */
  mode: ReviewMode;
  onModeChange: (mode: ReviewMode) => void;
  cursorId: string | null;
  onCursorChange: (id: string | null) => void;
  onAccept: (ids: string[]) => Promise<void> | void;
  onReject: (ids: string[]) => Promise<void> | void;
  onSkip?: (id: string) => void;
  acceptLabel?: string;
  rejectLabel?: string;
  /** Rendered beside the reject control (e.g. the reject policy picker). */
  rejectOptions?: ReactNode;
  /** The sentence shown before accept_all / reject_all / batch runs. */
  consequence: (ids: string[], verb: "accept" | "reject") => string;
  emptyState?: ReactNode;
  className?: string;
}

const MODE_LABELS: Record<ReviewMode, string> = {
  one_by_one: "One by one",
  accept_all: "Accept all",
  reject_all: "Reject all",
  batch: "Batch",
};

const MODE_ORDER: readonly ReviewMode[] = [
  "one_by_one",
  "batch",
  "accept_all",
  "reject_all",
];

export function ReviewDeck({
  items,
  mode,
  onModeChange,
  cursorId,
  onCursorChange,
  onAccept,
  onReject,
  onSkip,
  acceptLabel = "Accept",
  rejectLabel = "Reject",
  rejectOptions,
  consequence,
  emptyState,
  className,
}: ReviewDeckProps) {
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [pending, setPending] = useState<{ ids: string[]; verb: "accept" | "reject" } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const allIds = items.map((item) => item.id);
  const cursorIndex = cursorId ? items.findIndex((item) => item.id === cursorId) : -1;
  const index = cursorIndex >= 0 ? cursorIndex : 0;
  const current = items[index] ?? null;

  function moveCursor(next: number): void {
    const bounded = Math.max(0, Math.min(items.length - 1, next));
    onCursorChange(items[bounded]?.id ?? null);
  }

  /** Runs one decision on the cursor and steps forward, so a deck drains itself. */
  async function decideCurrent(verb: "accept" | "reject"): Promise<void> {
    if (!current || busy) return;
    const id = current.id;
    setBusy(true);
    try {
      await (verb === "accept" ? onAccept([id]) : onReject([id]));
    } finally {
      setBusy(false);
    }
    // The host removes the item; if it has not yet, keep the cursor moving so
    // the person is never staring at a card they just answered.
    const next = items[index + 1] ?? items[index - 1] ?? null;
    onCursorChange(next && next.id !== id ? next.id : null);
  }

  async function runPending(): Promise<void> {
    if (!pending) return;
    setBusy(true);
    try {
      await (pending.verb === "accept" ? onAccept(pending.ids) : onReject(pending.ids));
      setCheckedIds([]);
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  const switcher = (
    <div
      role="group"
      aria-label="Review mode"
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
    >
      {MODE_ORDER.map((candidate) => (
        <button
          key={candidate}
          type="button"
          aria-pressed={mode === candidate}
          onClick={() => onModeChange(candidate)}
          className={cn(
            "rounded-sm px-2 py-1 text-xs transition-colors",
            mode === candidate
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {MODE_LABELS[candidate]}
        </button>
      ))}
    </div>
  );

  if (items.length === 0) {
    return (
      <div className={cn("flex h-full w-full min-h-0 flex-col gap-3", className)}>
        <div className="flex items-center justify-between gap-2">{switcher}</div>
        <div className="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
          {emptyState ?? "Nothing left to review."}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("flex h-full w-full min-h-0 flex-col gap-3", className)}
      onKeyDown={(event) => {
        if (mode !== "one_by_one") return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveCursor(index + 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          moveCursor(index - 1);
        } else if (event.key === "a" || event.key === "A") {
          event.preventDefault();
          void decideCurrent("accept");
        } else if (event.key === "r" || event.key === "R") {
          event.preventDefault();
          void decideCurrent("reject");
        } else if ((event.key === "s" || event.key === "S") && current) {
          event.preventDefault();
          onSkip?.(current.id);
          moveCursor(index + 1);
        }
      }}
      tabIndex={mode === "one_by_one" ? 0 : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {switcher}
        <span className="text-xs tabular-nums text-muted-foreground">
          {mode === "one_by_one"
            ? `${Math.min(index + 1, items.length)} of ${items.length}`
            : `${items.length} to review`}
        </span>
      </div>

      {mode === "one_by_one" && current ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card p-3">
            <div className="text-sm font-medium text-foreground">{current.title}</div>
            {current.subtitle ? (
              <div className="mt-0.5 text-xs text-muted-foreground">{current.subtitle}</div>
            ) : null}
            {current.meta ? <div className="mt-2">{current.meta}</div> : null}
            {current.body ? (
              <div className="mt-3 text-xs text-foreground/90">{current.body}</div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => void decideCurrent("accept")}>
              {acceptLabel}
              <kbd className="ml-1.5 text-[10px] opacity-70">A</kbd>
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void decideCurrent("reject")}
            >
              {rejectLabel}
              <kbd className="ml-1.5 text-[10px] opacity-70">R</kbd>
            </Button>
            {rejectOptions}
            {onSkip ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  onSkip(current.id);
                  moveCursor(index + 1);
                }}
              >
                Skip
                <kbd className="ml-1.5 text-[10px] opacity-70">S</kbd>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {mode === "accept_all" || mode === "reject_all" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <ReviewList items={items} />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={mode === "reject_all" ? "outline" : "default"}
              disabled={busy}
              onClick={() =>
                setPending({
                  ids: allIds,
                  verb: mode === "accept_all" ? "accept" : "reject",
                })
              }
            >
              {mode === "accept_all"
                ? `${acceptLabel} all ${items.length}`
                : `${rejectLabel} all ${items.length}`}
            </Button>
            {mode === "reject_all" ? rejectOptions : null}
          </div>
        </div>
      ) : null}

      {mode === "batch" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <ReviewList
            items={items}
            checkedIds={checkedIds}
            onToggle={(id) =>
              setCheckedIds((previous) =>
                previous.includes(id)
                  ? previous.filter((candidate) => candidate !== id)
                  : [...previous, id],
              )
            }
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
            <span className="text-xs text-muted-foreground">
              {checkedIds.length} selected
            </span>
            <Button
              size="sm"
              disabled={busy || checkedIds.length === 0}
              onClick={() => setPending({ ids: checkedIds, verb: "accept" })}
            >
              {acceptLabel}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || checkedIds.length === 0}
              onClick={() => setPending({ ids: checkedIds, verb: "reject" })}
            >
              {rejectLabel}
            </Button>
            {rejectOptions}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending?.verb === "reject" ? rejectLabel : acceptLabel}
        description={pending ? consequence(pending.ids, pending.verb) : undefined}
        confirmLabel={pending?.verb === "reject" ? rejectLabel : acceptLabel}
        variant={pending?.verb === "reject" ? "destructive" : "default"}
        busy={busy}
        onConfirm={runPending}
      />
    </div>
  );
}

/** The plain list every non-one_by_one mode shows, with or without checkboxes. */
function ReviewList({
  items,
  checkedIds,
  onToggle,
}: {
  items: readonly ReviewItem[];
  checkedIds?: string[];
  onToggle?: (id: string) => void;
}) {
  return (
    <ul className="min-h-0 flex-1 divide-y divide-border overflow-auto rounded-md border border-border">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-2 px-2 py-1.5">
          {onToggle ? (
            <Checkbox
              className="mt-0.5 h-3.5 w-3.5"
              checked={checkedIds?.includes(item.id) ?? false}
              aria-label={`Select ${item.title}`}
              onCheckedChange={() => onToggle(item.id)}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-foreground">{item.title}</div>
            {item.subtitle ? (
              <div className="truncate text-[11px] text-muted-foreground">
                {item.subtitle}
              </div>
            ) : null}
          </div>
          {item.meta ? <div className="shrink-0">{item.meta}</div> : null}
        </li>
      ))}
    </ul>
  );
}
