"use client";

/**
 * "Use existing" — what the person already has, by kind, on the organization
 * resource inventory primitives (R10, lane A5-P): `useKindCounts` for the kind
 * tiles (the registry's `source_input_pickable` kinds; an empty kind is absent,
 * an uncountable one shows a dash) and `useKindItems` for each kind's list
 * (server-searched, recent first, paged by the `resources.inventory/page_size`
 * knob). The scope (Mine / an organization) is a FILTER, never permission.
 *
 * Also the answer to the input's one search box: with words typed, every kind
 * that has items shows its first matches, each kind openable for the rest.
 *
 * A row of a kind that has a stage (a saved Source) carries the Knowledge hub's
 * Stage word as a small badge (`itemStage.ts`, the hub's own facts read).
 *
 * UI only: picking goes through `useSourceIntake().addExisting`.
 */

import { useEffect, useEffectEvent, useState } from "react";
import { Building2, Check, Loader2, Plus } from "lucide-react";
import { Badge, Input } from "@ai-matrx/design-system";
import { useKindCounts } from "@/features/scopes/hooks/useKindCounts";
import { useKindItems } from "@/features/scopes/hooks/useKindItems";
import type { KindItem, KindScope } from "@/features/scopes/service/kindInventory";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useKindItemStages } from "@/features/resource-manager/source-input/itemStage";
import { cn } from "@/utils/cn";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import {
  ensureOrganizationContext,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";

/** How many matches each kind shows under the one search box before "Show more". */
const SEARCH_ROWS_PER_KIND = 5;

export interface UseExistingProps {
  scope: KindScope;
  /** The input's one search box. Empty = the kind tiles. */
  query: string;
  isPicked: (token: string, id: string) => boolean;
  onToggle: (token: string, item: KindItem) => void;
}

function kindWords(token: string) {
  const info = tryGetEntityInfo(token);
  return { plural: info?.labelPlural ?? token, Icon: info?.Icon ?? null };
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function UseExisting({ scope, query, isPicked, onToggle }: UseExistingProps) {
  const counts = useKindCounts(scope);
  const [open, setOpen] = useState<string | null>(null);
  const [openQuery, setOpenQuery] = useState("");
  // Matches per kind under the one search box, keyed by query so an old answer never counts.
  const [matchCounts, setMatchCounts] = useState<{ query: string; byToken: Record<string, number> }>({
    query: "",
    byToken: {},
  });
  const kinds = counts.tokens.filter((t) => counts.counts.get(t) !== 0);
  const searching = query.trim().length > 0;
  // A list's page size is an organization knob: with none active, ONE ask —
  // never the same error under every kind (verify-3).
  const hasOrganization = Boolean(useAppSelector(selectActiveOrganizationId));

  if (counts.error) {
    return (
      <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
        {counts.error.message}
        <ErrorAlchemyMenu error={counts.error.message} operation="Count what you have" />
        <button type="button" className="underline" onClick={counts.retry}>
          Try again
        </button>
      </p>
    );
  }
  if (counts.loading) {
    return (
      <div className="flex flex-wrap gap-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-11 w-28 animate-pulse rounded-lg border border-border bg-muted/40" />
        ))}
      </div>
    );
  }
  // Nothing of any offered kind: the row is absent (Add new is the way in).
  if (kinds.length === 0) return null;

  if (searching && !hasOrganization) return <OrganizationAsk />;

  if (searching) {
    const settled = matchCounts.query === query ? matchCounts.byToken : {};
    const none = kinds.every((t) => settled[t] === 0);
    return (
      <div className="flex flex-col gap-3">
        {none ? <p className="py-3 text-center text-sm text-muted-foreground">No matches</p> : null}
        {kinds.map((token) => (
          <KindMatches
            key={token}
            token={token}
            scope={scope}
            query={query}
            isPicked={isPicked}
            onToggle={onToggle}
            onSettled={(n) =>
              setMatchCounts((prev) =>
                prev.query === query && prev.byToken[token] === n
                  ? prev
                  : { query, byToken: { ...(prev.query === query ? prev.byToken : {}), [token]: n } },
              )
            }
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">Use existing</h3>
      <div className="flex flex-wrap gap-2">
        {kinds.map((token) => {
          const { plural, Icon } = kindWords(token);
          const n = counts.counts.get(token);
          const selected = open === token;
          return (
            <button
              key={token}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setOpen(selected ? null : token);
                setOpenQuery("");
              }}
              className={cn(
                "flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-left transition-colors",
                selected
                  ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                  : "border-border bg-card hover:border-primary/30 hover:bg-accent/40",
              )}
            >
              {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
              <span className="text-sm text-foreground">{plural}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {n === null || n === undefined ? "—" : n.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
      {open ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2">
          <Input
            value={openQuery}
            onChange={(e) => setOpenQuery(e.target.value)}
            placeholder={`Search ${kindWords(open).plural.toLowerCase()}`}
            aria-label={`Search ${kindWords(open).plural.toLowerCase()}`}
            className="text-base sm:text-sm"
          />
          {hasOrganization ? (
            <KindList token={open} scope={scope} query={openQuery} isPicked={isPicked} onToggle={onToggle} />
          ) : (
            <OrganizationAsk />
          )}
        </div>
      ) : null}
    </div>
  );
}

/** No organization is active: one line, one button — the org picker. */
function OrganizationAsk() {
  return (
    <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>No organization chosen.</span>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-foreground hover:bg-accent/40 sm:min-h-8"
        onClick={() =>
          void ensureOrganizationContext({ interactive: true }).catch((err: unknown) => {
            if (!isOrganizationSelectionCancelled(err)) toast.error(err instanceof Error ? err.message : String(err));
          })
        }
      >
        <Building2 className="h-3.5 w-3.5" />
        Choose organization
      </button>
    </p>
  );
}

/** One kind's matches under the one search box: the first few, then Show more. */
function KindMatches({
  token,
  scope,
  query,
  isPicked,
  onToggle,
  onSettled,
}: {
  token: string;
  scope: KindScope;
  query: string;
  isPicked: UseExistingProps["isPicked"];
  onToggle: UseExistingProps["onToggle"];
  /** How many matched, once this kind's search answered. */
  onSettled: (count: number) => void;
}) {
  const [all, setAll] = useState(false);
  const list = useKindItems(token, scope, query);
  const answered = !list.loading && !list.error;
  const reportSettled = useEffectEvent(() => onSettled(list.items.length));
  useEffect(() => {
    if (answered) reportSettled();
  }, [answered, list.items.length]);
  if (!list.loading && !list.error && list.items.length === 0) return null;
  const { plural } = kindWords(token);
  return (
    <section aria-label={plural} className="flex flex-col gap-1">
      <h4 className="text-xs font-medium text-muted-foreground">{plural}</h4>
      <Rows
        token={token}
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
  token,
  scope,
  query,
  isPicked,
  onToggle,
}: {
  token: string;
  scope: KindScope;
  query: string;
  isPicked: UseExistingProps["isPicked"];
  onToggle: UseExistingProps["onToggle"];
}) {
  const list = useKindItems(token, scope, query);
  return <Rows token={token} list={list} isPicked={isPicked} onToggle={onToggle} />;
}

function Rows({
  token,
  list,
  limit,
  onMore,
  isPicked,
  onToggle,
}: {
  token: string;
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
              onClick={() => onToggle(token, item)}
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
