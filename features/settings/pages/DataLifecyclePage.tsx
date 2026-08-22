"use client";

/**
 * DataLifecyclePage — /settings/data, "Your data".
 *
 * The user-facing half of the platform data lifecycle (Phase 5). It answers one
 * question in plain English: *is anything of mine about to be deleted, and how
 * do I stop it?* The weekly digest email links here, and both read the SAME
 * function (`platform.lifecycle_user_notice`), so the page can never contradict
 * the email.
 *
 * Deliberately small. Arman, 2026-08-21: *"They should have a page they can go
 * to that shows all of their archived stuff with dates showing when they'll get
 * wiped… It needs to be easy to excuse and have it go away. Not a big deal."*
 * And: *"Most companies do not even warn you so don't over-engineer this."*
 *
 * Two rules this file exists to keep:
 *  - **No table names.** A person sees a policy label or a registry label — see
 *    `../data-lifecycle/labels.ts`. "fc_card" is code, not English.
 *  - **The empty state is the normal state.** Most people have nothing pending;
 *    that has to read as reassurance, not as an empty dashboard.
 *
 * Cross-repo authority: common-docs/projects/data-lifecycle-platform/.
 */

import { Archive, Clock, ShieldCheck, Undo2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RefreshCwTapButton } from "@/components/icons/tap-buttons";
import { useDataLifecycle } from "../data-lifecycle/useDataLifecycle";
import {
  itemCount,
  lifecycleLabel,
  longDate,
  whenPhrase,
} from "../data-lifecycle/labels";
import type {
  LifecycleArchived,
  LifecyclePending,
} from "../data-lifecycle/lifecycleService";

function PendingRow({
  item,
  busy,
  onKeep,
}: {
  item: LifecyclePending;
  busy: boolean;
  onKeep: () => void;
}) {
  const label = lifecycleLabel(item.entity_token, item.label);
  const date = longDate(item.wipe_on);
  const soon = item.in_warning_window;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
        soon
          ? "border-amber-400/60 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/30"
          : "border-border bg-card",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {itemCount(item.rows)} — {label}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {date
            ? `Deleted for good on ${date} (${whenPhrase(item.days_left)}).`
            : `Deleted for good ${whenPhrase(item.days_left)}.`}
        </p>
        {soon ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            This is what we emailed you about.
          </p>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 self-start sm:self-auto"
        disabled={busy}
        onClick={onKeep}
      >
        <Undo2 className="h-4 w-4" aria-hidden />
        {busy ? "Keeping…" : "Keep it"}
      </Button>
    </div>
  );
}

function ArchivedRow({ item }: { item: LifecycleArchived }) {
  const date = longDate(item.archived_on);
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <Archive className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {itemCount(item.rows)} — {lifecycleLabel(item.entity_token)}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {date ? `Moved to long-term storage on ${date}.` : "Moved to long-term storage."}{" "}
          {item.restorable
            ? "Still yours — ask us any time and we'll bring it back."
            : "Already brought back for you."}
        </p>
      </div>
    </div>
  );
}

export function DataLifecyclePage() {
  const { notice, loading, error, refresh, keep, keeping } = useDataLifecycle();

  const onKeep = (item: LifecyclePending) => {
    const label = lifecycleLabel(item.entity_token, item.label);
    keep(item.entity_token)
      .then((rows) =>
        toast.success(
          rows === 0
            ? `Nothing left to keep — ${label} is already staying.`
            : `Keeping ${itemCount(rows)}. Nothing there will be deleted.`,
        ),
      )
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : "We couldn't keep that."),
      );
  };

  const pending = notice?.pending ?? [];
  const archived = notice?.archived ?? [];
  const nothingAtAll = !loading && !error && !pending.length && !archived.length;

  return (
    <div className="flex h-full flex-col">
      <RouteHeader
        left={
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Your data</span>
            <span className="sr-only sm:hidden">Your data</span>
          </span>
        }
        right={
          <RefreshCwTapButton
            ariaLabel="Check again"
            disabled={loading}
            onClick={() => void refresh()}
          />
        }
      />

      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-3 pb-16 pt-[var(--shell-header-h)] sm:px-4">
          <div className="space-y-6 pt-4">
            {loading ? (
              <div className="space-y-3" aria-busy>
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
            ) : error ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm text-foreground">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void refresh()}
                >
                  Try again
                </Button>
              </div>
            ) : nothingAtAll ? (
              // The normal state. Short and calm on purpose — a person who
              // followed a link here from an email should be able to leave in
              // five seconds knowing nothing is wrong.
              <div className="rounded-xl border border-border bg-card p-6 text-center">
                <ShieldCheck
                  className="mx-auto h-6 w-6 text-green-600 dark:text-green-500"
                  aria-hidden
                />
                <p className="mt-3 text-sm font-medium text-foreground">
                  Nothing of yours is scheduled to be deleted.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Everything you've made is right where you left it. If that ever
                  changes, we'll tell you here first — and you'll be able to keep
                  it with one click.
                </p>
              </div>
            ) : (
              <>
                {pending.length ? (
                  <section className="space-y-3">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">
                        Scheduled to be deleted
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        You deleted these, so they're on their way out. Changed
                        your mind? Keep them and they stay.
                      </p>
                    </div>
                    {pending.map((item) => (
                      <PendingRow
                        key={item.entity_token}
                        item={item}
                        busy={keeping === item.entity_token}
                        onKeep={() => onKeep(item)}
                      />
                    ))}
                  </section>
                ) : null}

                {archived.length ? (
                  <section className="space-y-3">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">
                        Moved to long-term storage
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Not deleted — just tucked away so the app stays fast.
                        It's still yours.
                      </p>
                    </div>
                    {archived.map((item) => (
                      <ArchivedRow
                        key={`${item.entity_token}-${item.archived_on}`}
                        item={item}
                      />
                    ))}
                  </section>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
