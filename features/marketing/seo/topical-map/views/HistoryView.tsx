"use client";

/**
 * HISTORY — proposals waiting, and what left the map.
 *
 * Two halves on one screen (vision §2.5: "a history control lists every
 * proposal — pending, accepted, rejected — with who, when, why"):
 *
 *   1. PROPOSALS WAITING — `ProposalReview` (ReviewDeck in the org's
 *      `proposal_review_mode`) over the tree the body already loaded. Shown
 *      only when something is proposed; absent, not disabled, otherwise.
 *   2. WHAT LEFT THE MAP — `seo.list_map_history`, filtered by status (the
 *      function's own `p_status`), by who and by when (client-side over the
 *      page the function returned — it offers neither filter, and inventing a
 *      server call the database does not have would be a lie about what was
 *      filtered). Rejecting NEVER deletes: every row can be restored.
 *
 * RESTORE puts a topic back where it came from (Lane G ruling, 2026-09-18):
 * a REJECTED topic was a proposal, so it returns to `proposed` (back into the
 * review deck above); a RETIRED topic was live, so it returns to `active`.
 * Both are `seo.patch_map_topics` status edits; a refusal shows the
 * function's own sentence. Cost if wrong: one word in `restoreTarget`.
 *
 * `changed_by_tier` is printed AS THE ROW SAYS IT — "agent", "human", "code",
 * whatever the snapshot recorded — never mapped to a friendlier word, because
 * a NULL tier reads as human by the provenance doctrine and this screen must
 * not invent a tier the snapshot did not record. `changed_by` is a bare uuid
 * (`platform.entity_types` has no user token, so there is no `EntityRef`);
 * it is shown short with the full id in the tooltip.
 */

import { useState } from "react";
import { ExternalLink, History, RotateCcw } from "lucide-react";

import { Button } from "@ai-matrx/design-system";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useOpenTopicalMapWindow } from "@/features/overlays/openers/topicalMapWindow";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import {
  TopicalMapEmpty,
  TopicalMapFailed,
  TopicalMapLoading,
} from "../components/TopicalMapStates";
import type { MapViewProps } from "../components/TopicalMapWorkspaceBody";
import { useMapHistory, useMapTree, usePatchMapTopics } from "../hooks";
import { ProposalReview } from "../proposals/ProposalReview";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectMapTotals } from "../redux/selectors";
import type {
  MapHistoryEntry,
  MapTopicAttachments,
  MapTopicStatus,
  MapTopicsPatchResult,
} from "../types";
import { TopicStatusMark } from "../ui/TopicStatusMark";
import { TREE_INCLUDE } from "./MapTreeHarness";

const PAGE_SIZE = 200;

/** Which statuses the history read may be narrowed to (the function's own list). */
const STATUS_CHOICES: readonly MapTopicStatus[] = ["rejected", "retired", "proposed", "active"];

/** Where a restored topic goes back to. Exported for tests. */
export function restoreTarget(status: MapTopicStatus): MapTopicStatus | null {
  if (status === "rejected") return "proposed";
  if (status === "retired") return "active";
  return null;
}

export interface HistoryFilters {
  statuses: MapTopicStatus[];
  changedBy: string | null;
  /** ISO date (yyyy-mm-dd); entries changed before it are hidden. */
  since: string | null;
}

/** The client-side narrowing over ONE returned page. Pure; exported for tests. */
export function filterHistoryEntries(
  items: readonly MapHistoryEntry[],
  filters: Pick<HistoryFilters, "changedBy" | "since">,
): MapHistoryEntry[] {
  const sinceMs = filters.since ? Date.parse(filters.since) : Number.NaN;
  return items.filter((entry) => {
    if (filters.changedBy && entry.changed_by !== filters.changedBy) return false;
    if (!Number.isNaN(sinceMs) && Date.parse(entry.changed_at) < sinceMs) return false;
    return true;
  });
}

function attachmentWords(attachments: MapTopicAttachments | undefined): string | null {
  if (!attachments) return null;
  const parts = Object.entries(attachments)
    .filter(([, count]) => typeof count === "number" && count > 0)
    .map(([key, count]) => `${count} ${key.replace(/_/g, " ")}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function HistoryView({ mapId, siteId, host, readOnly }: MapViewProps) {
  const [filters, setFilters] = useState<HistoryFilters>({
    statuses: ["rejected", "retired"],
    changedBy: null,
    since: null,
  });
  const [offset, setOffset] = useState(0);

  // The tree feeds the proposal deck (and the "N proposed" count); the same
  // query key the other screens use, so a view switch never re-fetches.
  const tree = useMapTree(mapId, { include: TREE_INCLUDE, siteId: siteId ?? undefined });
  const totals = useAppSelector(selectMapTotals(mapId));
  const history = useMapHistory(mapId, {
    status: filters.statuses,
    limit: PAGE_SIZE,
    offset,
  });
  const openWindow = useOpenTopicalMapWindow();

  const proposedCount = totals.proposed;

  return (
    <>
      {host === "page" ? (
        <div className="flex justify-end">
          {/* The shell header is coordinator-owned; the map's own "open as a
              window" door lives here until the header carries it. */}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => openWindow({ mapId, screen: "history", siteId })}
            title="Float this map over any screen"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Open as window
          </Button>
        </div>
      ) : null}

      {tree.isError ? (
        <TopicalMapFailed what="this map's topics" error={tree.error} />
      ) : tree.isPending ? (
        <TopicalMapLoading what="this map's topics" />
      ) : proposedCount > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {proposedCount} proposal{proposedCount === 1 ? "" : "s"} waiting
          </p>
          <p className="mb-3 mt-1 text-sm text-muted-foreground">
            Proposed topics are not part of the map until accepted. Rejecting keeps them here.
          </p>
          <ProposalReview mapId={mapId} host={host} readOnly={readOnly} />
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <History className="h-3.5 w-3.5" aria-hidden />
          What left the map
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Rejecting never deletes — the row stays and can be restored.
        </p>
        <HistoryFilterBar
          filters={filters}
          onChange={(next) => {
            setOffset(0);
            setFilters(next);
          }}
          actors={[...new Set((history.data?.items ?? []).map((e) => e.changed_by).filter(Boolean))] as string[]}
        />
      </section>

      {history.isPending ? (
        <TopicalMapLoading what="this map's history" />
      ) : history.isError ? (
        <TopicalMapFailed what="this map's history" error={history.error} />
      ) : (
        <HistoryList
          mapId={mapId}
          items={filterHistoryEntries(history.data.items, filters)}
          total={history.data.total}
          pageCount={history.data.items.length}
          offset={offset}
          onPage={setOffset}
          readOnly={readOnly}
        />
      )}
    </>
  );
}

function HistoryFilterBar({
  filters,
  onChange,
  actors,
}: {
  filters: HistoryFilters;
  onChange: (next: HistoryFilters) => void;
  actors: string[];
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      <div role="group" aria-label="Status" className="inline-flex flex-wrap items-center gap-1">
        {STATUS_CHOICES.map((status) => {
          const on = filters.statuses.includes(status);
          return (
            <button
              key={status}
              type="button"
              aria-pressed={on}
              className={cn(
                "rounded-md border px-2 py-1 capitalize transition-colors",
                on
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                const next = on
                  ? filters.statuses.filter((s) => s !== status)
                  : [...filters.statuses, status];
                // An empty status list would mean "what left the map" to the
                // function — say so by refusing to empty it instead.
                if (next.length === 0) return;
                onChange({ ...filters, statuses: next });
              }}
            >
              {status}
            </button>
          );
        })}
      </div>
      <label className="inline-flex items-center gap-1.5">
        <span className="text-muted-foreground">Who</span>
        <select
          className="h-7 rounded-md border border-border bg-background px-1.5 text-xs"
          value={filters.changedBy ?? ""}
          onChange={(event) =>
            onChange({ ...filters, changedBy: event.target.value || null })
          }
        >
          <option value="">Anyone</option>
          {actors.map((id) => (
            <option key={id} value={id}>
              {id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      <label className="inline-flex items-center gap-1.5">
        <span className="text-muted-foreground">Since</span>
        <input
          type="date"
          className="h-7 rounded-md border border-border bg-background px-1.5 text-xs"
          value={filters.since ?? ""}
          onChange={(event) => onChange({ ...filters, since: event.target.value || null })}
        />
      </label>
      <span className="text-muted-foreground">
        Who and since narrow the page shown; status narrows the read.
      </span>
    </div>
  );
}

function HistoryList({
  mapId,
  items,
  total,
  pageCount,
  offset,
  onPage,
  readOnly,
}: {
  mapId: string;
  items: MapHistoryEntry[];
  total: number;
  pageCount: number;
  offset: number;
  onPage: (offset: number) => void;
  readOnly: boolean;
}) {
  const patch = usePatchMapTopics(mapId);
  const [pending, setPending] = useState<MapHistoryEntry | null>(null);
  const [failure, setFailure] = useState<{ what: string; error: unknown } | null>(null);
  const [patchErrors, setPatchErrors] = useState<MapTopicsPatchResult["errors"]>([]);

  async function restore(entry: MapHistoryEntry): Promise<void> {
    const target = restoreTarget(entry.status);
    if (!target) return;
    setFailure(null);
    setPatchErrors([]);
    try {
      const result = await patch.mutateAsync([{ slug: entry.slug, status: target }]);
      setPatchErrors(result.errors);
      if (result.updated.includes(entry.slug)) {
        toast.success(`"${entry.name}" is ${target} again.`);
      }
    } catch (error) {
      setFailure({ what: `restoring "${entry.name}"`, error });
    } finally {
      setPending(null);
    }
  }

  if (total === 0) {
    return (
      <TopicalMapEmpty
        title="Nothing has left this map"
        detail="No topic matches these statuses, so there is nothing to review or restore."
      />
    );
  }

  const pendingTarget = pending ? restoreTarget(pending.status) : null;

  return (
    <>
      {failure ? <TopicalMapFailed what={failure.what} error={failure.error} /> : null}
      {patchErrors.length > 0 ? (
        <ul role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
          {patchErrors.map((err, i) => (
            <li key={`${err.slug ?? "?"}:${i}`}>
              <span className="font-mono">{err.slug ?? "(no slug)"}</span>: {err.message}
            </li>
          ))}
        </ul>
      ) : null}

      {items.length === 0 ? (
        <TopicalMapEmpty
          title="No entry matches who or since"
          detail={`${pageCount} of ${total} entries were read; none match the who/since filters. Clear them to see the page.`}
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {items.map((entry) => {
            const target = restoreTarget(entry.status);
            const attachments = attachmentWords(entry.attachments);
            return (
              <li
                key={`${entry.slug}:${entry.changed_at}`}
                className="flex items-start gap-3 px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate font-medium">{entry.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{entry.slug}</span>
                    <TopicStatusMark status={entry.status} />
                    {entry.parent_slug ? (
                      <span className="text-xs text-muted-foreground">
                        under <span className="font-mono">{entry.parent_slug}</span>
                      </span>
                    ) : null}
                  </p>
                  {entry.description ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {entry.description}
                    </p>
                  ) : null}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <time dateTime={entry.changed_at}>
                      {new Date(entry.changed_at).toLocaleString()}
                    </time>
                    {entry.changed_by ? (
                      <span className="font-mono" title={entry.changed_by}>
                        by {entry.changed_by.slice(0, 8)}
                      </span>
                    ) : (
                      <span>by nobody recorded</span>
                    )}
                    {entry.changed_by_tier ? (
                      <span
                        className="rounded-sm border border-border px-1 py-px text-[10px]"
                        title="The actor tier the snapshot recorded, as recorded."
                      >
                        {entry.changed_by_tier}
                      </span>
                    ) : null}
                    {typeof entry.version === "number" ? <span>v{entry.version}</span> : null}
                    {attachments ? (
                      <span className="text-warning" title="Still attached to this topic">
                        still carries {attachments}
                      </span>
                    ) : null}
                  </p>
                </div>
                {!readOnly && target ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={patch.isPending}
                    onClick={() => setPending(entry)}
                    title={`Restore as ${target}`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Restore
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {offset + 1}–{Math.min(offset + pageCount, total)} of {total}
          </span>
          <span className="inline-flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={offset === 0}
              onClick={() => onPage(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous {PAGE_SIZE}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={offset + pageCount >= total}
              onClick={() => onPage(offset + PAGE_SIZE)}
            >
              Next {PAGE_SIZE}
            </Button>
          </span>
        </div>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? `Restore "${pending.name}"?` : "Restore"}
        description={
          pendingTarget === "proposed"
            ? "The topic goes back to proposed: it returns to the review deck and is not live until accepted. Nothing attached to it changes."
            : "The topic goes back to active: it is live in the map again immediately — pages can be placed on it and agents will treat it as real. Nothing attached to it changes."
        }
        confirmLabel="Restore"
        busy={patch.isPending}
        onConfirm={() => pending && void restore(pending)}
      />
    </>
  );
}
