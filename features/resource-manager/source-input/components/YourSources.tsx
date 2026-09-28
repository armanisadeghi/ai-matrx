"use client";

/**
 * "Your sources" — the input OPENS here (reuse first, Arman 2026-09-27). The
 * person's own Sources, newest first, read through the ONE Sources list read
 * (`useSources`, direct Supabase under RLS, server-side search), with their
 * Stage in the Knowledge hub's words. One click adds or removes a Source.
 * "Search everything" hands off to the resource picker, whose search row is
 * the ⌘K Knowledge bar.
 */

import { useState } from "react";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useSources } from "@/features/sources/hooks/useSources";
import {
  SOURCE_KIND_LABEL,
  SOURCE_STAGE_LABEL,
  sourceKindGroup,
  sourceListedAt,
  sourceStage,
  type SourceKindGroup,
  type SourceListRow,
} from "@/features/sources/sourceRows";
import { cn } from "@/utils/cn";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type StageFilter = "any" | "searchable" | "reading" | "not_searchable";

const STAGE_FILTERS: { id: StageFilter; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "searchable", label: "Ready" },
  { id: "reading", label: "Being read" },
  { id: "not_searchable", label: "Not searchable" },
];

const KIND_FILTERS: ("all" | Exclude<SourceKindGroup, "other">)[] = [
  "all",
  "file",
  "web_page",
  "transcript",
  "note",
  "pasted_text",
];

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function YourSources({
  isPicked,
  onToggle,
  onSearchEverything,
}: {
  isPicked: (processedDocumentId: string) => boolean;
  onToggle: (row: SourceListRow) => void;
  onSearchEverything: () => void;
}) {
  const userId = useAppSelector(selectUserId);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<(typeof KIND_FILTERS)[number]>("all");
  const [stage, setStage] = useState<StageFilter>("any");
  const list = useSources({ kind: "mine" }, userId, 0, {
    saved: false,
    search,
  });

  const rows = list.rows.filter((row) => {
    if (kind !== "all" && sourceKindGroup(row.source_kind) !== kind) return false;
    if (stage === "any") return true;
    const facts = list.facts.get(row.id);
    if (!facts) return false;
    const s = sourceStage(facts);
    if (stage === "searchable") return s === "searchable" || s === "entities";
    if (stage === "reading") return s === "indexing";
    return s === "not_searchable" || s === "stale";
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your sources by name or address"
            className="pl-8 text-base sm:text-sm"
            aria-label="Search your sources"
          />
        </div>
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger className="h-11 w-full sm:h-9 sm:w-40" aria-label="Kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_FILTERS.map((k) => (
              <SelectItem key={k} value={k}>
                {k === "all" ? "Every kind" : SOURCE_KIND_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Stage">
        {STAGE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={stage === f.id}
            onClick={() => setStage(f.id)}
            className={cn(
              "min-h-9 rounded-full border px-3 text-xs transition-colors matrx-touch-targets",
              stage === f.id
                ? "border-primary/60 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-accent/50",
            )}
          >
            {f.label}
          </button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto gap-1.5 text-muted-foreground"
          onClick={onSearchEverything}
        >
          <Search className="h-3.5 w-3.5" />
          Search everything
        </Button>
      </div>

      {list.loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Finding your sources…
        </div>
      ) : list.error ? (
        <p role="alert" className="flex items-center gap-2 py-4 text-sm text-destructive">
          {list.error}
          <ErrorAlchemyMenu error={list.error} operation="List your Sources" />
        </p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {list.rows.length === 0 && !search
            ? "You have no sources yet — add something new with the tiles above."
            : "Nothing matches. Try other words, or another kind or stage."}
        </p>
      ) : (
        <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {rows.map((row) => {
            const picked = isPicked(row.id);
            const facts = list.facts.get(row.id);
            const stageLabel = facts
              ? SOURCE_STAGE_LABEL[sourceStage(facts)]
              : list.factsFailed.has(row.id)
                ? "Status unknown"
                : "Checking…";
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onToggle(row)}
                  aria-pressed={picked}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                    picked ? "bg-primary/5" : "hover:bg-accent/40",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                      picked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {picked ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{row.name || "Untitled"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {SOURCE_KIND_LABEL[sourceKindGroup(row.source_kind)]} · {stageLabel}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {shortDate(sourceListedAt(row))}
                  </span>
                </button>
              </li>
            );
          })}
          {list.hasMore ? (
            <li>
              <button
                type="button"
                onClick={list.loadMore}
                disabled={list.loadingMore}
                className="flex min-h-11 w-full items-center justify-center gap-2 text-sm text-muted-foreground hover:bg-accent/40"
              >
                {list.loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Show more
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
