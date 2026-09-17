"use client";

// lib/entity-list/components/EntityBulkBar.tsx
//
// BULK SELECTION — the two pieces of chrome.
//
//   <EntityBulkActions>  the consumer-declared buttons. Rendered INSIDE the
//                        canonical table's own bulk bar (MatrxDataTable's
//                        `selection.actions` seam), which already owns the
//                        count, the Clear and copy-of-selection. A second bar
//                        beside it would be a fork of a control we own, and
//                        the two counts would eventually disagree.
//
//   <EntityBulkSelectAllBanner>  the ONE sentence the table cannot say: which
//                        of the two meanings of "all" is currently true.
//
// 🚨 WHY THE BANNER EXISTS AT ALL. The table's header checkbox is honest about
// what it does — it ticks the rows on this page — but a person looking at 25 of
// 4,613 rows reads it as "everything". Gmail answers this with a banner under
// the toolbar, and so does this: it states what is selected in full sentences,
// and when the surface can serve the bigger meaning it offers it as a separate,
// explicit click. Where the surface CANNOT serve it, the banner says so rather
// than leaving the larger number unmentioned — a silence a user fills in wrong.

import { useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { bulkCountLabel, type EntityBulkAction } from "../selection";
import type { EntityListSelection } from "../useEntityListSelection";

export function EntityBulkActions<TRow>({
  actions,
  selection,
  noun,
  onRemoveRows,
  onRefresh,
}: {
  actions: EntityBulkAction<TRow>[];
  selection: EntityListSelection<TRow>;
  noun: string;
  onRemoveRows: (ids: string[]) => void;
  onRefresh: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);

  const run = async (action: EntityBulkAction<TRow>) => {
    const target = selection.build();
    if (target.count === 0) return;

    // 🚨 THE DESTRUCTIVE / EXPENSIVE CLICK LAW. The surface writes the sentence
    // because only it knows what is lost, duplicated or spent; the shell only
    // guarantees the stop happens before anything runs.
    const question = action.confirm?.(target) ?? null;
    if (question) {
      const ok = await confirm({
        title: question.title,
        description: question.description,
        confirmLabel: question.confirmLabel ?? action.label,
        variant: question.variant ?? (action.variant === "destructive" ? "destructive" : "default"),
      });
      if (!ok) return;
    }

    setPending(action.id);
    try {
      const result = (await action.run(target)) ?? {};
      if (result.removedIds?.length) onRemoveRows(result.removedIds);
      if (result.refresh) onRefresh();
      if (!result.keepSelection) selection.clear();
      toast.success(
        result.message ??
          `${action.label} — ${bulkCountLabel(target.count, noun)}`,
      );
    } catch (error) {
      // NOTHING FAILS SILENTLY: the selection is kept on failure, so the person
      // can read the reason and try again without re-ticking 40 rows.
      toast.error(
        error instanceof Error
          ? error.message
          : `${action.label} did not finish. Nothing was changed.`,
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      {actions.map((action) => {
        const Icon = action.icon;
        const busy = pending === action.id;
        return (
          <Button
            key={action.id}
            type="button"
            size="sm"
            variant={action.variant ?? "outline"}
            className="h-11 gap-1.5 px-2 text-xs lg:h-7"
            disabled={pending !== null}
            aria-label={`${action.label} — ${bulkCountLabel(selection.count, noun)}`}
            data-entity-bulk-action={action.id}
            onClick={(event) => {
              event.stopPropagation();
              void run(action);
            }}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : Icon ? (
              <Icon className="h-3.5 w-3.5" />
            ) : null}
            {action.label}
          </Button>
        );
      })}
    </>
  );
}

function BannerShell({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warn";
}) {
  return (
    <div
      data-entity-bulk-banner
      role="status"
      aria-live="polite"
      className={
        tone === "warn"
          ? "flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-foreground"
          : "flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-foreground"
      }
    >
      {children}
    </div>
  );
}

export function EntityBulkSelectAllBanner<TRow>({
  selection,
  noun,
  plural,
  selectAllMatchingDeclared,
  actions,
}: {
  selection: EntityListSelection<TRow>;
  noun: string;
  /** The surface's plural label, for the "this view matches M" sentence. */
  plural: string;
  selectAllMatchingDeclared: boolean;
  /**
   * The bulk buttons, passed ONLY by a view that has no bulk bar of its own.
   *
   * The table renders them inside its own bar (see `EntityBulkActions`), so it
   * passes nothing here and there is exactly one set on screen. The cards and
   * dense-rows views have no bar at all, and a selection you cannot act on is a
   * dead end — so there the banner carries them.
   */
  actions?: ReactNode;
}) {
  if (!selection.enabled) return null;

  const { resolving, resolveError, count, mode, matchingTotal } = selection;

  // A resolution in flight is many sequential requests. It reports its own
  // progress and can be abandoned — never a frozen screen.
  if (resolving) {
    return (
      <BannerShell>
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span className="flex-1">
          Selecting every {noun} that matches this filter —{" "}
          <span className="tabular-nums">
            {resolving.done.toLocaleString()} of{" "}
            {resolving.total.toLocaleString()}
          </span>{" "}
          so far.
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-11 gap-1 px-2 text-xs lg:h-7"
          onClick={selection.cancelSelectAllMatching}
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
      </BannerShell>
    );
  }

  if (count === 0) return null;

  const actionsSlot = actions ? (
    <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div>
  ) : null;

  if (resolveError) {
    return (
      <BannerShell tone="warn">
        <span className="flex-1">
          Only {bulkCountLabel(count, noun)} could be selected —{" "}
          {resolveError} Whatever a bulk action does now will touch exactly
          those {count === 1 ? "one" : count.toLocaleString()}.
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-11 px-2 text-xs lg:h-7"
          onClick={selection.runSelectAllMatching}
        >
          Try again
        </Button>
      </BannerShell>
    );
  }

  if (mode === "matching") {
    return (
      <BannerShell>
        <span className="flex-1">
          Every {noun} matching this filter is selected —{" "}
          <span className="tabular-nums font-medium">
            {count.toLocaleString()}
          </span>{" "}
          in total, including the ones not on this page.
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-11 gap-1 px-2 text-xs lg:h-7"
          onClick={selection.clear}
        >
          <X className="h-3.5 w-3.5" />
          Clear selection
        </Button>
        {actionsSlot}
      </BannerShell>
    );
  }

  if (selection.canOfferSelectAllMatching) {
    return (
      <BannerShell>
        <span className="flex-1">
          All {bulkCountLabel(count, noun)} on this page are selected. This view
          matches <span className="tabular-nums">{matchingTotal.toLocaleString()}</span>.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-11 px-2 text-xs lg:h-7"
          data-entity-bulk-select-all-matching
          onClick={selection.runSelectAllMatching}
        >
          Select all {matchingTotal.toLocaleString()} matching this filter
        </Button>
        {actionsSlot}
      </BannerShell>
    );
  }

  // THE PAGE IS FULLY TICKED AND THERE IS MORE, AND THIS SURFACE CANNOT SERVE
  // "everything matching". Saying nothing would let the header checkbox imply
  // it did, so the limit is stated instead of left to be discovered.
  if (
    !selectAllMatchingDeclared &&
    selection.allLoadedSelected &&
    matchingTotal > count
  ) {
    return (
      <BannerShell tone="warn">
        <span className="flex-1">
          Only the {bulkCountLabel(count, noun)} on this page are selected — this
          view matches{" "}
          <span className="tabular-nums">{matchingTotal.toLocaleString()}</span>{" "}
          {plural}. A bulk action here touches this page only; page through to
          select more.
        </span>
        {actionsSlot}
      </BannerShell>
    );
  }

  // A view with no bar of its own still has to state the count and offer a way
  // out and a way to act — otherwise its checkboxes lead nowhere.
  if (actionsSlot) {
    return (
      <BannerShell>
        <span className="font-medium">
          {bulkCountLabel(count, noun)} selected
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-11 gap-1 px-2 text-xs lg:h-7"
          onClick={selection.clear}
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
        {actionsSlot}
      </BannerShell>
    );
  }

  return null;
}
