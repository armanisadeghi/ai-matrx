"use client";

/**
 * "Use existing" — what the person already has, by kind. The kinds are EXACTLY
 * the organization page's Resources grid "Sources" + "Sources & Outputs"
 * entries — `sourceRoleEntries()` from the grid's own definition
 * (`features/organizations/resource-catalogue.ts`), in the grid's order, with
 * the grid's names and icons: Files, Transcripts, Websites, Datasets, Lists,
 * Workbooks, Notes. One flat list — no Utilities, Outputs or Workspaces
 * (Arman, 2026-09-30).
 *
 * Counts and lists: a kind with a registry token reads the kind inventory
 * (`useKindCounts` / `useKindItems`, server-searched, recent first, paged by
 * the `resources.inventory/page_size` knob). Websites has no token — it lists
 * the web pages the person saved as Sources (`savedWebPages.ts`), picked as
 * `processed_document`. The scope (All / Mine / an organization) is a FILTER,
 * never permission.
 *
 * Also the answer to the input's one search box: with words typed, every kind
 * that has items shows its first matches, each kind openable for the rest.
 *
 * A row of a kind that has a stage (a saved Source) carries the Knowledge hub's
 * Stage word as a small badge (`itemStage.ts`, the hub's own facts read).
 *
 * UI only: picking goes through `useSourceIntake().addExisting`.
 */

import { useCallback, useEffect, useEffectEvent, useState, type ComponentType } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Badge, Input } from "@ai-matrx/design-system";
import { useKindCounts } from "@/features/scopes/hooks/useKindCounts";
import { useKindItems } from "@/features/scopes/hooks/useKindItems";
import type { KindItem, KindScope } from "@/features/scopes/service/kindInventory";
import { sourceRoleEntries } from "@/features/organizations/resource-catalogue";
import { SOURCE_KIND_GROUP_KINDS } from "@/features/sources/sourceRows";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  countSavedSources,
  fetchSavedSourcesPage,
  SAVED_SOURCE_TOKEN,
  type SavedSourceGroup,
} from "@/features/resource-manager/source-input/savedWebPages";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { ReadGate, type ReadStatus } from "@/components/read-state/ReadGate";
import { useKindItemStages } from "@/features/resource-manager/source-input/itemStage";
import { cn } from "@/utils/cn";

/** How many matches each kind shows under the one search box before "Show more". */
const SEARCH_ROWS_PER_KIND = 5;

export interface UseExistingProps {
  scope: KindScope;
  /** The input's one search box. Empty = the kind tiles. */
  query: string;
  isPicked: (token: string, id: string) => boolean;
  /** `sourceKind`: the stored Source kind a saved-Source row is (Websites → "web_page"), so its card names it. */
  onToggle: (token: string, item: KindItem, sourceKind?: string) => void;
}

/** One kind offered: a Resources-grid Sources / Sources & Outputs entry. */
export interface OfferedKind {
  /** The grid entry's key — unique per kind. */
  key: string;
  /** The token a picked row is sent as. */
  token: string;
  /** The grid's name for it ("Files", "Websites"…). */
  plural: string;
  Icon: ComponentType<{ className?: string }>;
  /** Set when the kind is listed from the person's saved Sources (Websites). */
  savedSourceGroup?: SavedSourceGroup;
  /** The stored Source kind a picked row is (its card's noun), for saved-Source kinds. */
  sourceKind?: string;
}

/**
 * The kinds offered: the grid's Sources + Sources & Outputs entries, in the
 * grid's order. The grid's definition decides, never a list here. A grid entry
 * with neither a token nor a saved-Source group cannot be listed — the guard
 * test fails on it, never a silent drop.
 */
export function offeredKinds(): OfferedKind[] {
  return sourceRoleEntries().flatMap((e): OfferedKind[] => {
    const base = { key: e.key, plural: e.labelPlural, Icon: e.icon };
    if (e.savedSourceGroup) {
      return [
        {
          ...base,
          token: SAVED_SOURCE_TOKEN,
          savedSourceGroup: e.savedSourceGroup,
          sourceKind: SOURCE_KIND_GROUP_KINDS[e.savedSourceGroup][0],
        },
      ];
    }
    if (e.token) return [{ ...base, token: e.token }];
    console.error(`[UseExisting] grid kind "${e.key}" has no way to be listed`);
    return [];
  });
}

/** The kind inventory's counts plus the saved-Source counts, as one map keyed by kind key. */
function useOfferedCounts(scope: KindScope, offered: OfferedKind[]) {
  const userId = useAppSelector(selectUserId);
  const inventoryKinds = offered.filter((k) => !k.savedSourceGroup);
  const inventory = useKindCounts(scope, { tokens: inventoryKinds.map((k) => k.token) });
  const groups = offered.filter((k) => k.savedSourceGroup);
  const groupsKey = groups.map((k) => k.key).join(",");
  const scopeKey = JSON.stringify(scope);
  const [saved, setSaved] = useState<{ key: string; counts: Map<string, number | null> }>({
    key: "",
    counts: new Map(),
  });
  const requestKey = `${scopeKey}|${userId}|${groupsKey}`;
  useEffect(() => {
    if (!userId || !groupsKey) return undefined;
    let cancelled = false;
    const kinds = groupsKey.split(",").map((key) => offered.find((k) => k.key === key)!);
    void Promise.all(
      kinds.map(async (k) => [k.key, await countSavedSources(k.savedSourceGroup!, scope, userId)] as const),
    ).then((pairs) => {
      if (!cancelled) setSaved({ key: requestKey, counts: new Map(pairs) });
    });
    return () => {
      cancelled = true;
    };
    // requestKey carries every input; scope / offered are fresh objects each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);
  const counts = new Map<string, number | null>();
  for (const k of inventoryKinds) {
    // A count read that failed outright leaves every kind it carried uncounted: each shows a dash
    // and still opens its list — never one error block in place of the whole row.
    if (inventory.error) counts.set(k.key, null);
    else if (inventory.counts.has(k.token)) counts.set(k.key, inventory.counts.get(k.token)!);
  }
  const savedReady = !groupsKey || saved.key === requestKey;
  if (savedReady) for (const [key, n] of saved.counts) counts.set(key, n);
  return {
    counts,
    loading: inventory.loading || (Boolean(userId) && !savedReady),
  };
}

/** One kind's list — the kind inventory, or the person's saved Sources for Websites. */
function useOfferedKindItems(kind: OfferedKind, scope: KindScope, query: string) {
  const userId = useAppSelector(selectUserId);
  const group = kind.savedSourceGroup;
  const fetchSaved = useCallback(
    (args: { scope: KindScope; query?: string; offset: number; limit: number }) =>
      fetchSavedSourcesPage({
        group: group!,
        scope: args.scope,
        userId: userId ?? "",
        query: args.query,
        offset: args.offset,
        limit: args.limit,
      }),
    [group, userId],
  );
  return useKindItems(group && !userId ? null : kind.token, scope, query, group ? { fetchPage: fetchSaved } : undefined);
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function UseExisting({ scope, query, isPicked, onToggle }: UseExistingProps) {
  const offered = offeredKinds();
  const counts = useOfferedCounts(scope, offered);
  const [open, setOpen] = useState<string | null>(null);
  const [openQuery, setOpenQuery] = useState("");
  // Matches per kind under the one search box, keyed by query so an old answer never counts.
  // "failed" = that kind's search read failed (its section says so); it never counts as "no matches".
  const [matchCounts, setMatchCounts] = useState<{ query: string; byToken: Record<string, number | "failed"> }>({
    query: "",
    byToken: {},
  });
  // Offered order (the grid's), minus kinds with nothing in them; an uncountable kind stays.
  const kinds = offered.filter((k) => counts.counts.has(k.key) && counts.counts.get(k.key) !== 0);
  const searching = query.trim().length > 0;
  const openKind = kinds.find((k) => k.key === open) ?? null;
  // A list's page size is a knob that resolves with or without an organization
  // (user override -> platform default), so a read never waits on one.

  if (searching) {
    if (counts.loading) return <TileSkeleton />;
    const settled = matchCounts.query === query ? matchCounts.byToken : {};
    // The search's read is every kind's read: "No matches" only once each one ANSWERED with none.
    const anyMatched = kinds.some((k) => typeof settled[k.key] === "number" && settled[k.key] !== 0);
    const searchStatus: ReadStatus = kinds.some((k) => !(k.key in settled))
      ? "loading"
      : !anyMatched && kinds.some((k) => settled[k.key] === "failed")
        ? "error"
        : "ready";
    return (
      <div className="flex flex-col gap-3">
        <ReadGate
          status={searchStatus}
          what="matches"
          isEmpty={!anyMatched}
          loading={null}
          empty={<p className="py-3 text-center text-sm text-muted-foreground">No matches</p>}
        >
          {null}
        </ReadGate>
        {kinds.map((kind) => (
          <KindMatches
            key={kind.key}
            kind={kind}
            scope={scope}
            query={query}
            isPicked={isPicked}
            onToggle={onToggle}
            onSettled={(n) =>
              setMatchCounts((prev) =>
                prev.query === query && prev.byToken[kind.key] === n
                  ? prev
                  : { query, byToken: { ...(prev.query === query ? prev.byToken : {}), [kind.key]: n } },
              )
            }
          />
        ))}
      </div>
    );
  }

  // Nothing of any kind at all: the row is absent (Add new is the way in).
  if (!counts.loading && kinds.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-medium text-muted-foreground">Use existing</h3>
      {counts.loading ? (
        <TileSkeleton />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {kinds.map((kind) => {
              const { plural, Icon } = kind;
              const n = counts.counts.get(kind.key);
              const selected = open === kind.key;
              return (
                <button
                  key={kind.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setOpen(selected ? null : kind.key);
                    setOpenQuery("");
                  }}
                  className={cn(
                    "flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-left transition-colors",
                    selected
                      ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                      : "border-border bg-card hover:border-primary/30 hover:bg-accent/40",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm text-foreground">{plural}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {n === null || n === undefined ? "—" : n.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
          {openKind ? (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2">
              <Input
                value={openQuery}
                onChange={(e) => setOpenQuery(e.target.value)}
                placeholder={`Search ${openKind.plural.toLowerCase()}`}
                aria-label={`Search ${openKind.plural.toLowerCase()}`}
                className="text-base sm:text-sm"
              />
              <KindList kind={openKind} scope={scope} query={openQuery} isPicked={isPicked} onToggle={onToggle} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function TileSkeleton() {
  return (
    <div className="flex flex-wrap gap-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-11 w-28 animate-pulse rounded-lg border border-border bg-muted/40" />
      ))}
    </div>
  );
}


/** One kind's matches under the one search box: the first few, then Show more. */
function KindMatches({
  kind,
  scope,
  query,
  isPicked,
  onToggle,
  onSettled,
}: {
  kind: OfferedKind;
  scope: KindScope;
  query: string;
  isPicked: UseExistingProps["isPicked"];
  onToggle: UseExistingProps["onToggle"];
  /** How many matched once this kind's search answered, or "failed" when it could not. */
  onSettled: (count: number | "failed") => void;
}) {
  const [all, setAll] = useState(false);
  const list = useOfferedKindItems(kind, scope, query);
  const answered = !list.loading && !list.error;
  const failed = !list.loading && Boolean(list.error);
  const reportSettled = useEffectEvent(() => onSettled(failed ? "failed" : list.items.length));
  useEffect(() => {
    if (answered || failed) reportSettled();
  }, [answered, failed, list.items.length]);
  if (!list.loading && !list.error && list.items.length === 0) return null;
  const { plural, token } = kind;
  return (
    <section aria-label={plural} className="flex flex-col gap-1">
      <h4 className="text-xs font-medium text-muted-foreground">{plural}</h4>
      <Rows
        token={token}
        sourceKind={kind.sourceKind}
        list={list}
        limit={all ? undefined : SEARCH_ROWS_PER_KIND}
        onMore={() => setAll(true)}
        isPicked={isPicked}
        onToggle={onToggle}
      />
    </section>
  );
}

/** One kind's whole list: server-searched, recent first, a page at a time. */
function KindList({
  kind,
  scope,
  query,
  isPicked,
  onToggle,
}: {
  kind: OfferedKind;
  scope: KindScope;
  query: string;
  isPicked: UseExistingProps["isPicked"];
  onToggle: UseExistingProps["onToggle"];
}) {
  const list = useOfferedKindItems(kind, scope, query);
  return <Rows token={kind.token} sourceKind={kind.sourceKind} list={list} isPicked={isPicked} onToggle={onToggle} />;
}

function Rows({
  token,
  sourceKind,
  list,
  limit,
  onMore,
  isPicked,
  onToggle,
}: {
  token: string;
  sourceKind?: string;
  list: ReturnType<typeof useKindItems>;
  /** Show only this many (with Show more revealing the rest). */
  limit?: number;
  onMore?: () => void;
  isPicked: UseExistingProps["isPicked"];
  onToggle: UseExistingProps["onToggle"];
}) {
  const shown = limit === undefined ? list.items : list.items.slice(0, limit);
  const stageFor = useKindItemStages(
    token,
    shown.map((item) => item.id),
  );
  if (list.loading)
    return (
      <div className="flex justify-center py-4 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading" />
      </div>
    );
  if (list.error)
    return (
      <p role="alert" className="flex items-center gap-2 py-2 text-sm text-destructive">
        {list.error.message}
        <ErrorAlchemyMenu error={list.error.message} operation="List what you have" />
        <button type="button" className="underline" onClick={list.reload}>
          Try again
        </button>
      </p>
    );
  if (list.items.length === 0) return <p className="py-3 text-center text-sm text-muted-foreground">No matches</p>;
  const more = (limit !== undefined && list.items.length > limit) || (limit === undefined && list.hasMore);
  return (
    <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
      {shown.map((item) => {
        const picked = isPicked(token, item.id);
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onToggle(token, item, sourceKind)}
              aria-pressed={picked}
              className={cn(
                "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                picked ? "bg-primary/5" : "hover:bg-accent/40",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                  picked ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                )}
              >
                {picked ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.title}</span>
              {(() => {
                const stage = stageFor(item.id);
                return stage ? (
                  <Badge
                    variant={
                      stage.stage === "failed"
                        ? "error"
                        : stage.stage === "searchable"
                          ? "success"
                          : stage.stage === "indexing"
                            ? "info"
                            : "neutral"
                    }
                    className="shrink-0 px-1.5 py-0 text-[11px] font-normal"
                  >
                    {stage.label}
                  </Badge>
                ) : null;
              })()}
              <span className="shrink-0 text-xs text-muted-foreground">{shortDate(item.updatedAt)}</span>
            </button>
          </li>
        );
      })}
      {more ? (
        <li>
          <button
            type="button"
            onClick={() => (limit !== undefined ? onMore?.() : list.loadMore())}
            disabled={list.loadingMore}
            className="flex min-h-11 w-full items-center justify-center gap-2 text-sm text-muted-foreground hover:bg-accent/40"
          >
            {list.loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Show more
          </button>
        </li>
      ) : null}
    </ul>
  );
}
