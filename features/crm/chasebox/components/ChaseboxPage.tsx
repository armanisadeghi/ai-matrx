"use client";

/**
 * ChaseboxPage — /crm/chasebox, "what needs me now" in one glance.
 *
 * Pitchbox's Chasebox, built the way research/03 ratified it: SAVED FILTERS
 * over the SAME schema (crm.interaction + crm.outreach_list_member), not a new
 * store and not a second outreach console. Five queues, each with a live count
 * that is itself a door, and every detected problem shipping with its one-click
 * fix (THE DOOR LAW's corollary).
 *
 * A queue with zero items renders a clean, honest empty state — never a spinner
 * and never "Loading…".
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Inbox, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EntityScopeTabs } from "@/lib/entity-list/components/EntityScopeTabs";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { relativeTime } from "@/lib/entity-list/columns";
import { makeScope, type ListScope } from "@/lib/list-scope/types";
import type { EntityScopeCounts } from "@/lib/entity-list/types";
import { cn } from "@/lib/utils";
import { CHASEBOX_ASSIST_SURFACE } from "../../inbox/constants";
import { fetchChaseboxCounts, fetchChaseboxItems } from "../service";
import {
  CHASEBOX_QUEUES,
  CHASEBOX_QUEUE_META,
  CHASEBOX_SCOPES,
  chaseboxFixHref,
  chaseboxFixLabel,
  EMPTY_CHASEBOX_COUNTS,
  type ChaseboxCounts,
  type ChaseboxQueue,
  type ChaseboxRow,
} from "../types";
import { ChaseboxDraftDialog } from "./ChaseboxDraftDialog";

const PAGE_SIZE = 25;

export function ChaseboxPage() {
  const [scope, setScope] = useState<ListScope>(makeScope("mine"));
  const [counts, setCounts] = useState<ChaseboxCounts | null>(null);
  const [scopeTotals, setScopeTotals] = useState<EntityScopeCounts>({
    byKind: {},
    narrow: {},
  });
  const [queue, setQueue] = useState<ChaseboxQueue>("fresh_replies");
  const [rows, setRows] = useState<ChaseboxRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [draftRow, setDraftRow] = useState<ChaseboxRow | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  // Counts for BOTH scopes, so the scope tabs carry true totals rather than a
  // number that only describes the tab you are already on.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    void Promise.all([
      fetchChaseboxCounts(makeScope("mine")),
      fetchChaseboxCounts(makeScope("orgs")),
    ])
      .then(([mine, orgs]) => {
        if (cancelled) return;
        const sum = (c: ChaseboxCounts) =>
          CHASEBOX_QUEUES.reduce((n, q) => n + c[q], 0);
        setScopeTotals({
          byKind: { mine: sum(mine), orgs: sum(orgs) },
          narrow: {},
        });
        setCounts(scope.kind === "orgs" ? orgs : mine);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load the queues.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [scope.kind, reloadToken]);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    void fetchChaseboxItems({ queue, scope, page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setTotal(result.total);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        // A failed read is NOT an empty queue — say so, and offer the retry.
        setRows([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load this queue.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [queue, scope, page, reloadToken]);

  const meta = CHASEBOX_QUEUE_META[queue];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 space-y-2 px-3 pt-[calc(var(--shell-header-h)+0.5rem)] pb-2">
        <AssistStrip surfaceName={CHASEBOX_ASSIST_SURFACE} />
        <div className="flex min-w-0 items-center justify-between gap-2">
          <EntityScopeTabs
            scope={scope}
            scopes={CHASEBOX_SCOPES}
            counts={scopeTotals}
            onChange={(next) => {
              setScope(next);
              setPage(1);
            }}
          />
          {/* The Chasebox answers "what needs me now"; the inbox answers "who
              replied". Each reaches the other. */}
          <Button asChild size="sm" variant="outline">
            <Link href="/crm/inbox">
              <Inbox className="h-4 w-4" aria-hidden />
              Inbox
            </Link>
          </Button>
        </div>

        {/* Every count is a door: clicking a card opens that queue. */}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
          {CHASEBOX_QUEUES.map((id) => {
            const queueMeta = CHASEBOX_QUEUE_META[id];
            const Icon = queueMeta.Icon;
            const count = counts?.[id];
            const active = id === queue;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setQueue(id);
                  setPage(1);
                }}
                className={cn(
                  "flex min-h-11 flex-col items-start gap-0.5 rounded-lg border p-2 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-muted",
                )}
                title={queueMeta.description}
              >
                <span className="flex w-full items-center gap-1.5">
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                  <span className="truncate text-xs font-medium">
                    {queueMeta.label}
                  </span>
                </span>
                <span className="text-lg font-semibold tabular-nums leading-none">
                  {count == null ? (
                    <Skeleton className="mt-1 h-5 w-8 rounded" />
                  ) : (
                    count
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          {meta.suggestionOnly && (
            <Lightbulb
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500"
              aria-hidden
            />
          )}
          <p>{meta.description}</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">{error}</span>
            <Button size="sm" variant="ghost" onClick={refresh}>
              Retry
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {rows === null ? (
          <div className="space-y-1.5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <p className="text-sm font-medium text-foreground">
              {meta.emptyLabel}
            </p>
            <p className="text-xs text-muted-foreground">
              Nothing in {meta.label.toLowerCase()} needs you right now.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((row) => (
              <ChaseboxItem
                key={`${row.queue}-${row.id}`}
                row={row}
                onOpenDraft={() => setDraftRow(row)}
              />
            ))}
          </ul>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 pt-4 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page * PAGE_SIZE >= total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      <ChaseboxDraftDialog
        row={draftRow}
        onClose={() => setDraftRow(null)}
        onSent={() => {
          setDraftRow(null);
          refresh();
        }}
      />
    </div>
  );
}

function ChaseboxItem({
  row,
  onOpenDraft,
}: {
  row: ChaseboxRow;
  onOpenDraft: () => void;
}) {
  const fixHref = chaseboxFixHref(row);
  const isDraft = row.queue === "pending_drafts";

  return (
    <li className="rounded-lg border border-border bg-card p-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {/* Every identity is a door — the person, and the campaign. */}
            {row.party_id ? (
              <EntityRef
                token="party"
                id={row.party_id}
                name={row.party_name ?? "Contact"}
                showIcon={false}
                className="font-medium"
              />
            ) : (
              <span className="font-medium">
                {row.party_name ?? "Unknown contact"}
              </span>
            )}
            {row.employer_name && (
              <span className="text-xs text-muted-foreground">
                {row.employer_name}
              </span>
            )}
            {/* No "·" separator: this row WRAPS on a narrow screen, and a
                bare middot is what ends up orphaned on its own line there. */}
            {row.outreach_list_id && (
              <EntityRef
                token="crm_outreach_list"
                id={row.outreach_list_id}
                name={row.outreach_list_name ?? "Campaign"}
                showIcon={false}
                className="text-xs text-muted-foreground"
              />
            )}
            {row.step != null && (
              <span className="text-xs text-muted-foreground tabular-nums">
                step {row.step}
              </span>
            )}
            {row.occurred_at && (
              <span
                className="text-xs text-muted-foreground tabular-nums"
                title={new Date(row.occurred_at).toLocaleString()}
              >
                {relativeTime(row.occurred_at)}
              </span>
            )}
          </div>

          {row.subject && (
            <p className="truncate text-sm">{row.subject}</p>
          )}
          {/* THE PROBLEM, then THE FIX, in the server's own words. */}
          <p className="text-xs text-muted-foreground">{row.problem_message}</p>
          {row.detail && (
            <p className="truncate text-xs text-muted-foreground/80">
              {row.detail}
            </p>
          )}
          <p className="text-xs text-foreground/80">Fix: {row.problem_fix}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {isDraft && (
            <Button size="sm" onClick={onOpenDraft}>
              Review and approve
            </Button>
          )}
          {fixHref && (
            <Button asChild size="sm" variant={isDraft ? "ghost" : "outline"}>
              <Link href={fixHref}>
                {isDraft ? "Open campaign" : chaseboxFixLabel(row)}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          )}
          {row.queue === "stalled_sequences" &&
            row.problem_code === "mailbox_paused" &&
            row.sending_identity_id && (
              <Button asChild size="sm" variant="ghost">
                <Link href={`/crm/sending-identities/${row.sending_identity_id}`}>
                  Mailbox checklist
                </Link>
              </Button>
            )}
        </div>
      </div>
    </li>
  );
}
