"use client";

/**
 * RESOURCE PICKER — the checkbox list of everything this topic holds.
 *
 * Dense on purpose: this is a power surface where a human decides what a model
 * reads, and the deciding factor is almost always SIZE. So every row carries its
 * real item count and its estimated token cost, computed from measured
 * characters — never a guess, and never hidden behind a click.
 *
 * Three rules the UI enforces:
 *   * Heavy kinds (full page bodies, raw payloads) are labelled and never
 *     pre-selected. Selecting 4.98M characters of page text must be a decision.
 *   * A kind row shows the count that WILL be used after its filters, not the
 *     raw holding — the number next to the checkbox is the number you get.
 *   * Nothing is silently unavailable: a kind with zero items renders greyed
 *     with "none yet" rather than disappearing, because "we have none" is
 *     information (it is exactly what a gap analysis is looking for).
 */

import { useMemo, useState } from "react";
import { ChevronRight, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { estimateTokens, formatTokens } from "@/lib/tokens/estimate";
import {
  CATALOG,
  GROUP_LABEL,
  GROUP_ORDER,
  isDerived,
  itemTokens,
  kindDef,
} from "../../resources/catalog";
import { applySelector } from "../../resources/selector";
import type {
  ResourceGroup,
  ResourceItem,
  ResourceKey,
  ResourceManifest,
  SelectorOrder,
} from "../../resources/types";
import type {
  KindSelection,
  SelectionMap,
} from "../../hooks/useContextBuilder";
import { AuthorityTierBadge } from "../sources/AuthorityTierBadge";

const ORDER_LABEL: Record<SelectorOrder, string> = {
  importance: "Importance",
  authority: "Authority",
  rank: "Search rank",
  recent: "Newest",
};

/** Quick filters, per applicable kind. Label copy states the consequence. */
const FILTER_CHIPS: Array<{
  key: "includedOnly" | "goodScrapeOnly" | "currentOnly" | "successOnly";
  label: string;
  applies: (kind: ResourceKey) => boolean;
}> = [
  {
    key: "includedOnly",
    label: "Kept in curation",
    applies: (k) => kindDef(k)?.granularity === "source",
  },
  {
    key: "goodScrapeOnly",
    label: "Read cleanly",
    applies: (k) => k === "page.content",
  },
  {
    key: "currentOnly",
    label: "Current version",
    applies: (k) =>
      k === "page.analysis" ||
      k === "synthesis.keyword" ||
      k === "synthesis.tag" ||
      k === "synthesis.topic" ||
      k === "document.report",
  },
  {
    key: "successOnly",
    label: "Succeeded",
    applies: (k) => k.startsWith("synthesis.") || k === "page.analysis" || k === "document.report",
  },
];

interface ResourcePickerProps {
  manifest: ResourceManifest;
  selection: SelectionMap;
  onToggleKind: (kind: ResourceKey, on: boolean) => void;
  onToggleItem: (kind: ResourceKey, itemId: string, on: boolean) => void;
  onPatchKind: (kind: ResourceKey, patch: Partial<KindSelection>) => void;
  /** Compact mode drops the per-item drill-down (used inside Outputs Studio). */
  compact?: boolean;
}

export function ResourcePicker({
  manifest,
  selection,
  onToggleKind,
  onToggleItem,
  onPatchKind,
  compact = false,
}: ResourcePickerProps) {
  const [expanded, setExpanded] = useState<Set<ResourceKey>>(new Set());

  const byGroup = useMemo(() => {
    const map = new Map<ResourceGroup, typeof CATALOG>();
    for (const def of CATALOG) {
      const list = map.get(def.group) ?? [];
      list.push(def);
      map.set(def.group, list);
    }
    return map;
  }, []);

  const toggleExpanded = (kind: ResourceKey) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <div className="space-y-3">
      {manifest.unknownKinds.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
          <span>
            The database returned resource kinds this app does not know how to
            use: {manifest.unknownKinds.join(", ")}. They are excluded — this
            client is behind the backend.
          </span>
        </div>
      )}

      {GROUP_ORDER.map((group) => {
        const defs = byGroup.get(group) ?? [];
        if (defs.length === 0) return null;
        return (
          <div key={group}>
            <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {GROUP_LABEL[group]}
            </div>
            <div className="rounded-lg border border-border/60 divide-y divide-border/50 overflow-hidden">
              {defs.map((def) => {
                const rollup = manifest.rollups.get(def.key);
                const holdingItems = rollup?.itemCount ?? 0;
                const holdingChars = rollup?.chars ?? 0;
                const sel = selection.get(def.key);
                const derived = isDerived(def);

                // What this row would actually contribute right now — the same
                // planner the run uses, so the number cannot drift from reality.
                const effective = sel
                  ? derived
                    ? { items: holdingChars > 0 ? 1 : 0, chars: holdingChars }
                    : (() => {
                        const r = applySelector(manifest, {
                          kind: def.key,
                          mode: sel.mode,
                          ids: sel.ids,
                          filter: { ...sel.filter, topN: sel.topN },
                          order: sel.order,
                        });
                        return {
                          items: r.items.length,
                          chars: r.items.reduce((s, i) => s + i.chars, 0),
                        };
                      })()
                  : null;

                const empty = holdingItems === 0;
                const chips = FILTER_CHIPS.filter((c) => c.applies(def.key));
                const isExpanded = expanded.has(def.key);
                const Icon = def.icon;

                return (
                  <div
                    key={def.key}
                    className={cn(
                      "px-2 py-1.5 transition-colors",
                      sel ? "bg-primary/[0.04]" : "bg-card/30",
                      empty && "opacity-55",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={sel !== undefined}
                        disabled={empty}
                        onCheckedChange={(v) => onToggleKind(def.key, v === true)}
                        aria-label={`Include ${def.label}`}
                        className="shrink-0"
                      />
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <button
                        type="button"
                        className="flex-1 min-w-0 text-left"
                        onClick={() =>
                          !empty && !derived && !compact && toggleExpanded(def.key)
                        }
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground truncate">
                            {def.label}
                          </span>
                          {def.heavy && (
                            <Badge
                              variant="outline"
                              className="h-4 px-1 text-[9px] font-semibold uppercase tracking-wide border-amber-500/40 text-amber-700 dark:text-amber-400"
                            >
                              Large
                            </Badge>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground/60" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              {def.description}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </button>

                      <div className="flex items-center gap-2 shrink-0 text-[11px] tabular-nums">
                        {empty ? (
                          <span className="text-muted-foreground">none yet</span>
                        ) : (
                          <>
                            <span className="text-muted-foreground">
                              {effective
                                ? `${effective.items} of ${holdingItems}`
                                : `${holdingItems}`}
                            </span>
                            <span
                              className={cn(
                                "font-medium",
                                sel ? "text-foreground" : "text-muted-foreground/70",
                              )}
                            >
                              {formatTokens(
                                estimateTokens(
                                  effective ? effective.chars : holdingChars,
                                  def.shape,
                                ),
                              )}
                            </span>
                          </>
                        )}
                        {!derived && !compact && !empty && (
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 text-muted-foreground transition-transform",
                              isExpanded && "rotate-90",
                            )}
                            onClick={() => toggleExpanded(def.key)}
                          />
                        )}
                      </div>
                    </div>

                    {/* Per-kind controls: only for a selected, non-derived kind. */}
                    {sel && !derived && (
                      <div className="flex flex-wrap items-center gap-1.5 pl-7 pt-1.5">
                        {sel.mode === "explicit" ? (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                            {sel.ids.length} hand-picked
                          </Badge>
                        ) : (
                          <>
                            {chips.map((chip) => {
                              const on = sel.filter[chip.key] === true;
                              return (
                                <button
                                  key={chip.key}
                                  type="button"
                                  onClick={() =>
                                    onPatchKind(def.key, {
                                      filter: { ...sel.filter, [chip.key]: !on },
                                    })
                                  }
                                  className={cn(
                                    "h-5 rounded-full border px-2 text-[10px] transition-colors",
                                    on
                                      ? "border-primary/40 bg-primary/10 text-foreground"
                                      : "border-border/60 text-muted-foreground hover:text-foreground",
                                  )}
                                >
                                  {chip.label}
                                </button>
                              );
                            })}
                            <select
                              value={sel.order}
                              onChange={(e) =>
                                onPatchKind(def.key, {
                                  order: e.target.value as SelectorOrder,
                                })
                              }
                              className="h-5 rounded-full border border-border/60 bg-transparent px-1.5 text-[10px] text-muted-foreground"
                              aria-label={`Order ${def.label} by`}
                            >
                              {(
                                ["importance", "authority", "rank", "recent"] as SelectorOrder[]
                              ).map((o) => (
                                <option key={o} value={o}>
                                  {ORDER_LABEL[o]}
                                </option>
                              ))}
                            </select>
                            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              Top
                              <input
                                type="number"
                                min={0}
                                value={sel.topN ?? ""}
                                placeholder="all"
                                onChange={(e) =>
                                  onPatchKind(def.key, {
                                    topN: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  })
                                }
                                className="h-5 w-14 rounded border border-border/60 bg-transparent px-1 text-[10px] text-foreground"
                              />
                            </label>
                          </>
                        )}
                      </div>
                    )}

                    {isExpanded && !derived && (
                      <ItemList
                        items={manifest.itemsByKind.get(def.key) ?? []}
                        selection={sel}
                        onToggleItem={(id, on) => onToggleItem(def.key, id, on)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const ITEM_PAGE = 50;

/**
 * The drill-down. Capped at a page at a time and it SAYS so — a list that
 * quietly showed the first 50 of 1,099 would read as "that's everything".
 */
function ItemList({
  items,
  selection,
  onToggleItem,
}: {
  items: ResourceItem[];
  selection: KindSelection | undefined;
  onToggleItem: (id: string, on: boolean) => void;
}) {
  const [shown, setShown] = useState(ITEM_PAGE);
  const explicitIds = new Set(
    selection?.mode === "explicit" ? selection.ids : [],
  );

  if (items.length === 0) {
    return (
      <div className="pl-7 pt-1 text-[11px] text-muted-foreground">
        Nothing here yet.
      </div>
    );
  }

  return (
    <div className="pl-7 pt-1.5 space-y-0.5">
      {items.slice(0, shown).map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent/40"
        >
          <Checkbox
            checked={explicitIds.has(item.id)}
            onCheckedChange={(v) => onToggleItem(item.id, v === true)}
            aria-label={`Include ${item.label}`}
            className="h-3 w-3 shrink-0"
          />
          <span className="flex-1 min-w-0 truncate text-[11px] text-foreground/90">
            {item.label}
          </span>
          {item.sublabel && (
            <span className="hidden sm:block truncate max-w-[9rem] text-[10px] text-muted-foreground">
              {item.sublabel}
            </span>
          )}
          {item.authority !== null && (
            <AuthorityTierBadge
              score={item.authority}
              tier={typeof item.flags.tier === "string" ? item.flags.tier : null}
            />
          )}
          {item.bestRank !== null && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              #{item.bestRank}
            </span>
          )}
          {!item.included && (
            <Badge variant="outline" className="h-4 px-1 text-[9px]">
              excluded
            </Badge>
          )}
          <span className="w-14 text-right text-[10px] tabular-nums text-muted-foreground">
            {formatTokens(itemTokens(item))}
          </span>
        </div>
      ))}
      {items.length > shown && (
        <button
          type="button"
          onClick={() => setShown((s) => s + ITEM_PAGE)}
          className="text-[11px] text-primary hover:underline"
        >
          Show more — {shown} of {items.length} listed
        </button>
      )}
    </div>
  );
}
