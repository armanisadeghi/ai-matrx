"use client";

/**
 * The work queue: this site's keywords with NO primary topic, demand-ordered.
 *
 * This is where the headline's third bucket comes from, so it is not hidden in
 * a tab — the number on the tree is only as honest as this queue is short.
 *
 * Two ways to empty it, both real:
 *   - place keywords by hand under any topic (the ONE write path,
 *     `seo.gsc_set_keyword_topic`, which answers with the band each keyword
 *     lands in);
 *   - hand a batch to the platform's existing Topic Assigner agent
 *     (`POST /seo/keywords/assign-topics`), surfaced here rather than rebuilt.
 *     That route is admin-only and takes an industry territory, so it is shown
 *     only to admins and it is told exactly which keywords to work on.
 */

import { useEffect, useState } from "react";
import { BrainCircuit, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/styles/themes/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { formatCount } from "@/features/marketing/search-console/types";
import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";
import { bandMetaFor, type BandMeta } from "../variants/c/lib";
import type { UnassignedKeywordRow } from "./types";

const ASSIGN_TOPICS_PATH = "/seo/keywords/assign-topics";

/** The server's own milestones, in the operator's words. Never invented. */
const ASSIGN_STAGES: Record<string, string> = {
  "seo.assign_topics_started": "Selecting unassigned keywords…",
  "seo.assign_topics_tree_loaded": "Reading the shared topic tree…",
  "seo.assign_topics_agent_completed": "Pinning keywords to topics…",
  "seo.assign_topics_applied": "Saving assignments…",
  "seo.assign_topics_completed": "Topic assignment complete",
};

interface AssignTopicsResult {
  eligible: number;
  topics_created: string[];
  keywords_assigned: number;
  unassignable: number;
  unknown_topic_refs: string[];
}

export function UnplacedQueue({
  rows,
  total,
  metas,
  loading,
  page,
  pageSize,
  search,
  onSearch,
  onPage,
  onPlace,
  onAgentFinished,
  busy,
  siteName,
}: {
  rows: UnassignedKeywordRow[];
  total: number;
  metas: BandMeta[];
  loading: boolean;
  page: number;
  pageSize: number;
  search: string;
  onSearch: (next: string) => void;
  onPage: (next: number) => void;
  onPlace: (keywordIds: string[], label: string) => void;
  onAgentFinished: () => void;
  busy: boolean;
  siteName: string;
}) {
  const isAdmin = useAppSelector(selectIsAdmin);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState(search);
  const [territory, setTerritory] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => onSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [onSearch, searchInput]);

  const assigner = useSeoCommandRun<AssignTopicsResult>({
    key: "assign-topics",
    path: ASSIGN_TOPICS_PATH,
    finalKind: "seo.assign_topics_completed",
    stageLabels: ASSIGN_STAGES,
    live: { label: "Topic assigner" },
  });

  useEffect(() => {
    if (assigner.result) onAgentFinished();
  }, [assigner.result, onAgentFinished]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const pageIds = rows.map((row) => row.keyword_id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);

  return (
    <section className="flex shrink-0 flex-col rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">
          Not placed on the tree
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
          aria-label="Select every keyword on this page"
        />
        <span className="text-[11px] text-muted-foreground">
          {selected.size > 0
            ? `${selected.size} selected`
            : "Select keywords to place them together"}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={busy || selected.size === 0}
          onClick={() =>
            onPlace(
              [...selected],
              selected.size === 1
                ? (rows.find((row) => row.keyword_id === [...selected][0])?.phrase ??
                  "1 keyword")
                : `${selected.size} keywords`,
            )
          }
        >
          Place under a topic…
        </Button>

        {isAdmin ? (
          <div className="ml-auto flex items-center gap-1.5">
            <Input
              value={territory}
              onChange={(event) => setTerritory(event.target.value)}
              placeholder="Industry (e.g. itad)"
              className="h-7 w-40 text-xs"
              aria-label="Industry territory for the topic assigner"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={assigner.running || !territory.trim() || pageIds.length === 0}
              onClick={() =>
                void assigner.launch(
                  {
                    territory: territory.trim(),
                    language: "en",
                    limit: Math.min(pageIds.length, 50),
                    keyword_ids: (selected.size > 0 ? [...selected] : pageIds).slice(
                      0,
                      50,
                    ),
                  },
                  `${siteName} · ${territory.trim()}`,
                )
              }
            >
              {assigner.running ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <BrainCircuit className="mr-1.5 h-3 w-3" />
              )}
              Let the assigner propose
            </Button>
          </div>
        ) : null}
      </div>

      {assigner.error ? (
        <p className="border-b border-border bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          {assigner.error}
        </p>
      ) : null}
      {assigner.result ? (
        <p className="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          Assigner placed {assigner.result.keywords_assigned} of{" "}
          {assigner.result.eligible} keywords
          {assigner.result.topics_created.length > 0
            ? `, creating ${assigner.result.topics_created.length} topic${assigner.result.topics_created.length === 1 ? "" : "s"}`
            : ""}
          {assigner.result.unassignable > 0
            ? `; ${assigner.result.unassignable} it could not place`
            : ""}
          .
        </p>
      ) : null}

      <div className="max-h-[50vh] overflow-y-auto">
        {loading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Reading the unplaced queue…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {search
              ? `Nothing unplaced matches “${search}”.`
              : "Every keyword with traffic in this window is on the tree. That is the goal state."}
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
                {/* The phrase always gets the first line; the metrics wrap
                    below it on a phone rather than squeezing it to nothing. */}
                <span className="min-w-[8rem] flex-1 truncate text-foreground">
                  {row.phrase}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
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
                  <span className="text-right text-[11px] tabular-nums text-muted-foreground">
                    {formatCount(row.impressions)} imp
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    disabled={busy}
                    onClick={() => onPlace([row.keyword_id], row.phrase)}
                  >
                    Place…
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
