"use client";

/**
 * Proposals — what the assigner placed but is NOT sure about, waiting for a
 * person.
 *
 * P12 in one screen: agents apply, humans win. A placement at or above the
 * `confidence_floor` knob is a ruling; below it, the keyword still lands on the
 * tree (a candidate an expert can correct beats an empty tree) but it is
 * flagged here until someone confirms it or replaces it. Confirming stamps the
 * placement as the site's own; "Place under a topic…" writes
 * `assigned_by='human'` through the EXISTING write, which takes the keyword off
 * the agent's list forever.
 *
 * Same shape as the auto-applied class rules' unconfirmed chip
 * (`site_keyword_value.metadata.classification` → `gsc_confirm_keyword_class`) —
 * one confirmation pattern in this product, never two.
 */

import { useEffect, useState } from "react";
import { Check, Search, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/styles/themes/utils";
import { formatCount } from "@/features/marketing/search-console/types";
import { bandMetaFor, type BandMeta } from "../lib";
import type { ProposedKeywordRow } from "./types";

export function ProposedQueue({
  rows,
  total,
  metas,
  loading,
  page,
  pageSize,
  search,
  onSearch,
  onPage,
  onConfirm,
  onPlace,
  busy,
}: {
  rows: ProposedKeywordRow[];
  total: number;
  metas: BandMeta[];
  loading: boolean;
  page: number;
  pageSize: number;
  search: string;
  onSearch: (next: string) => void;
  onPage: (next: number) => void;
  onConfirm: (keywordIds: string[], label: string) => void;
  onPlace: (keywordIds: string[], label: string) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    const handle = setTimeout(() => onSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [onSearch, searchInput]);

  // Nothing waiting is the goal state, and an empty box on a screen that is
  // already long is noise — so the section simply is not there.
  if (!loading && total === 0 && !search) return null;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const pageIds = rows.map((row) => row.keyword_id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const label = (ids: string[]) =>
    ids.length === 1
      ? (rows.find((row) => row.keyword_id === ids[0])?.phrase ?? "1 keyword")
      : `${ids.length} keywords`;

  return (
    <section className="flex shrink-0 flex-col rounded-lg border border-warning/40 bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <UserCheck className="h-4 w-4 shrink-0 text-warning" />
        <h2 className="text-sm font-semibold text-foreground">
          The assigner placed these — is it right?
        </h2>
        <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-px text-[11px] tabular-nums text-warning">
          {formatCount(total)}
        </span>
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search these keywords…"
            className="h-8 pl-7 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
        <Checkbox
          checked={allSelected}
          onCheckedChange={(checked) => {
            const next = new Set(selected);
            for (const id of pageIds) {
              if (checked) next.add(id);
              else next.delete(id);
            }
            setSelected(next);
          }}
          aria-label="Select every proposal on this page"
        />
        <span className="text-[11px] text-muted-foreground">
          {selected.size > 0
            ? `${selected.size} selected`
            : "These are on the tree already — confirming makes them yours"}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          disabled={busy || selected.size === 0}
          onClick={() => {
            onConfirm([...selected], label([...selected]));
            setSelected(new Set());
          }}
        >
          <Check className="h-3 w-3" />
          Confirm
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={busy || selected.size === 0}
          onClick={() => onPlace([...selected], label([...selected]))}
        >
          Move to another topic…
        </Button>
      </div>

      <div className="max-h-[40vh] overflow-y-auto">
        {loading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Reading what is waiting for you…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {search
              ? `Nothing awaiting confirmation matches “${search}”.`
              : "Nothing is waiting for you."}
          </p>
        ) : (
          rows.map((row) => {
            const meta = bandMetaFor(metas, row.value_band);
            return (
              <div
                key={row.keyword_id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-3 py-1.5 text-sm last:border-b-0 hover:bg-muted/40"
              >
                <Checkbox
                  checked={selected.has(row.keyword_id)}
                  onCheckedChange={() => toggle(row.keyword_id)}
                  aria-label={`Select ${row.phrase}`}
                />
                <span className="min-w-[8rem] flex-1 truncate text-foreground">
                  {row.phrase}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  → {row.topic_name}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {row.confidence === null ? (
                    <span className="rounded border border-warning/40 px-1 py-px text-[10px] text-warning">
                      no confidence given
                    </span>
                  ) : (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {row.confidence}% sure
                    </span>
                  )}
                  <span
                    className={cn(
                      "rounded border px-1 py-px text-[10px] leading-tight",
                      meta.chip,
                    )}
                  >
                    {meta.label}
                  </span>
                  <span className="text-right text-[11px] tabular-nums text-muted-foreground">
                    {formatCount(row.clicks)} clk
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    disabled={busy}
                    onClick={() => onConfirm([row.keyword_id], row.phrase)}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    disabled={busy}
                    onClick={() => onPlace([row.keyword_id], row.phrase)}
                  >
                    Move…
                  </Button>
                </span>
              </div>
            );
          })
        )}
      </div>

      {total > pageSize ? (
        <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of{" "}
            {formatCount(total)}
          </span>
          <span className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              disabled={page === 0 || loading}
              onClick={() => onPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              disabled={page >= lastPage || loading}
              onClick={() => onPage(page + 1)}
            >
              Next
            </Button>
          </span>
        </div>
      ) : null}
    </section>
  );
}
