"use client";

/**
 * The route manifest — the hero of the bench.
 *
 * This is not a confirmation step; it IS the screen. Every route the archetype
 * would create is listed with its live state against `plan.node`:
 *   NEW    — will be created
 *   IN PLAN — already exists, will be skipped (re-running is safe)
 * plus everything already in the plan that the archetype does not touch, so an
 * existing/partial site reads honestly instead of looking like a fresh start.
 */
import { useState } from "react";
import { CircleSlash, FileWarning, Plus, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableLoadingComponent } from "@/components/matrx/LoadingComponents";
import { cn } from "@/lib/utils";

import type { Archetype, ExpandedArchetype } from "../_lib/archetypes";
import type { ManifestRow, PlanDiff } from "../_lib/data";
import type { SiteState } from "../_lib/readiness";

export interface RouteManifestProps {
  expanded: ExpandedArchetype | null;
  diff: PlanDiff | null;
  nodesLoading: boolean;
  nodesError: string | null;
  onRetryNodes: () => void;
  archetypes: Archetype[];
  onSelect: (key: string) => void;
  unmappedPageTypes: string[];
  siteState: SiteState;
}

export function RouteManifest(props: RouteManifestProps) {
  const {
    expanded,
    diff,
    nodesLoading,
    nodesError,
    onRetryNodes,
    archetypes,
    onSelect,
    unmappedPageTypes,
    siteState,
  } = props;
  const [query, setQuery] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [showExtra, setShowExtra] = useState(false);

  if (nodesError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <FileWarning className="h-8 w-8 text-destructive" />
        <div>
          <p className="text-sm font-medium text-foreground">
            The plan for this site could not be read.
          </p>
          <p className="mx-auto mt-1 max-w-md break-words text-xs text-muted-foreground">
            {nodesError}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onRetryNodes}>
          Try again
        </Button>
      </div>
    );
  }

  if (siteState !== "ready") {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          {siteState === "loading"
            ? "Loading your sites…"
            : siteState === "missing"
              ? "The site in this URL is not one your account can administer. Pick a site from the header."
              : "Pick a site in the header. The bench reads its live plan and shows you exactly which routes a shape would add."}
        </p>
      </div>
    );
  }

  if (!expanded) {
    return <ShapeGallery archetypes={archetypes} onSelect={onSelect} />;
  }

  if (nodesLoading && !diff) {
    return (
      <div className="p-4">
        <TableLoadingComponent />
      </div>
    );
  }

  if (!diff) return null;

  const needle = query.trim().toLowerCase();
  const visible = diff.rows.filter((row) => {
    if (onlyNew && row.state !== "new") return false;
    if (!needle) return true;
    return (
      row.node.route.toLowerCase().includes(needle) ||
      row.node.label.toLowerCase().includes(needle)
    );
  });

  const groups: { key: string; label: string; rows: ManifestRow[] }[] = [];
  for (const row of visible) {
    const last = groups[groups.length - 1];
    if (last && last.key === row.node.group) last.rows.push(row);
    else
      groups.push({
        key: row.node.group,
        label: row.node.groupLabel,
        rows: [row],
      });
  }

  const countOnly = expanded.families.filter(
    (family) => family.materialize === "count_only" && family.count > 0,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="shrink-0 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Routes
        </h2>
        <div className="relative ml-1 min-w-0 flex-1 sm:ml-2 sm:w-56 sm:flex-none">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter routes…"
            className="h-7 pl-7 text-[13px]"
          />
        </div>
        <Button
          variant={onlyNew ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => setOnlyNew((value) => !value)}
        >
          <Plus className="h-3 w-3" />
          Only new
        </Button>
        <span className="ml-auto hidden shrink-0 whitespace-nowrap font-mono text-[11px] text-muted-foreground sm:inline">
          {visible.length} shown
        </span>
      </div>

      {unmappedPageTypes.length > 0 ? (
        <div className="border-b border-warning/30 bg-warning/10 px-3 py-1.5 text-[11px] text-warning">
          No <code>plan_page_type</code> category matches{" "}
          {unmappedPageTypes.join(", ")} — those pages will be created without a
          page type. Add the category, then reload.
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {groups.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {onlyNew
              ? "Nothing new — every route in this shape already exists in the plan."
              : "No route matches that filter."}
          </div>
        ) : null}

        {groups.map((group, index) => (
          <div key={`${group.key}-${index}`}>
            <div className="sticky top-0 z-10 border-y border-border bg-muted/80 px-3 py-1 backdrop-blur-glass">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </span>
            </div>
            {group.rows.map((row) => (
              <RouteRow key={row.node.route} row={row} />
            ))}
          </div>
        ))}

        {countOnly.length > 0 && !onlyNew && !needle ? (
          <div className="border-y border-border bg-muted/40 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">
              Count-only families create the hub and record the target — the real
              titles come from research, not a template:{" "}
              {countOnly
                .map((family) => `${family.label} × ${family.count}`)
                .join(", ")}
              .
            </p>
          </div>
        ) : null}

        {diff.extra.length > 0 ? (
          <div className="border-t border-border">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent"
              onClick={() => setShowExtra((value) => !value)}
            >
              <CircleSlash className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Already in the plan, untouched by this shape
              </span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {diff.extra.length}
              </span>
            </button>
            {showExtra
              ? diff.extra.map((extra) => (
                  <div
                    key={extra.node.id}
                    className="flex items-center gap-2 px-3 py-1 pl-9"
                  >
                    <span className="truncate font-mono text-[12px] text-muted-foreground">
                      {extra.route}
                    </span>
                    <span className="truncate text-[12px] text-muted-foreground/70">
                      {extra.node.label}
                    </span>
                  </div>
                ))
              : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RouteRow({ row }: { row: ManifestRow }) {
  const isNew = row.state === "new";
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b border-border/50 px-3 py-1.5",
        isNew ? "bg-success/5" : "opacity-70",
      )}
      style={{ paddingLeft: `${12 + row.depth * 14}px` }}
    >
      <span
        className={cn(
          "w-[4.25rem] shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide",
          isNew
            ? "bg-success/15 text-success"
            : "bg-muted text-muted-foreground",
        )}
      >
        {isNew ? "New" : "In plan"}
      </span>
      {/* The route is the point of this screen — on a phone it keeps the width
          and the softer columns drop away rather than squeezing it to "…". */}
      <span className="truncate font-mono text-[12.5px] text-foreground">
        {row.node.route}
      </span>
      <span className="hidden truncate text-[12.5px] text-muted-foreground sm:inline">
        {row.node.label}
      </span>
      <span className="ml-auto hidden shrink-0 font-mono text-[10.5px] text-muted-foreground/70 sm:inline">
        {row.node.pageType ?? row.node.nodeType}
      </span>
    </div>
  );
}

function ShapeGallery({
  archetypes,
  onSelect,
}: {
  archetypes: Archetype[];
  onSelect: (key: string) => void;
}) {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-5">
      <h2 className="text-sm font-semibold text-foreground">
        How big is this site?
      </h2>
      <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
        Pick a shape. You are not picking a template — you are declaring
        concepts and counts (services × N, locations × M). Everything is
        adjustable, and nothing is written until you say so.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {archetypes.map((archetype) => (
          <button
            key={archetype.key}
            type="button"
            onClick={() => onSelect(archetype.key)}
            className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-foreground">
                {archetype.label}
              </span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {archetype.pageEstimate} pages
              </span>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
              {archetype.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {archetype.families.map((family) => (
                <span
                  key={family.key}
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
                >
                  {family.key} × {family.count}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
