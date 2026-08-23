"use client";

/**
 * GSC-style filter chip bar. Active filters render as removable chips; the
 * "+ Filter" menu adds one. Filter groups may not cross dimension profiles
 * ((query/page) | (country/device) | (search_appearance)) — the menu only
 * offers additions compatible with what is already active, so the RPC's
 * `gsc_filter_combination_unsupported` guard can never fire from this UI.
 *
 * C6 (2026-08-23) — DIMENSIONS EVERYWHERE (P9: "I only want the keywords that
 * have something to do with geo"): two keyword-level filters join the
 * query/page group — **Dimension** (`stamps`, ALL-OF: pick a dimension, pick
 * a value, add as many pairs as you like) and **Level** (`levels`). Both read
 * their vocabularies from the registry (`facet_dimension_catalog`,
 * `gsc_value_vocabulary`) — never a hardcoded list, because a site can invent
 * a dimension this afternoon. One chip per pair; removing a chip removes one
 * pair, not the whole filter.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  GscFilterKey,
  GscFilters,
} from "@/features/marketing/search-console/types";
import {
  countryLabel,
  deviceLabel,
  encodeLevelFilter,
  encodeStampFilter,
  parseLevelFilter,
  parseStampFilter,
} from "@/features/marketing/search-console/types";
import { getFacetDimensionCatalog } from "@/features/marketing/seo/value-system/dimensions/data";
import { getValueVocabulary } from "@/features/marketing/seo/value-system/data";

const FILTER_LABELS: Record<GscFilterKey, string> = {
  query_contains: "Query contains",
  query_eq: "Exact query",
  query_neq: "Query excludes",
  page_contains: "Page contains",
  page_eq: "Exact page",
  country: "Country",
  device: "Device",
  search_appearance: "Appearance",
  stamps: "Dimension",
  levels: "Level",
};

const FILTER_CHIP_LABELS: Record<GscFilterKey, string> = {
  ...FILTER_LABELS,
  query_eq: "Query",
  page_eq: "Page",
};

const QUERY_PAGE_KEYS: GscFilterKey[] = [
  "query_contains",
  "query_eq",
  "query_neq",
  "page_contains",
  "page_eq",
  "stamps",
  "levels",
];
const COUNTRY_DEVICE_KEYS: GscFilterKey[] = ["country", "device"];
/** Keys that hold a LIST (several chips, several adds) rather than one value. */
const MULTI_KEYS: GscFilterKey[] = ["stamps", "levels"];

function activeGroup(
  filters: GscFilters,
): "query_page" | "country_device" | "appearance" | null {
  const keys = Object.entries(filters)
    .filter(([, v]) => typeof v === "string" && v.trim() !== "")
    .map(([k]) => k as GscFilterKey);
  if (keys.length === 0) return null;
  if (keys.some((k) => QUERY_PAGE_KEYS.includes(k))) return "query_page";
  if (keys.some((k) => COUNTRY_DEVICE_KEYS.includes(k)))
    return "country_device";
  return "appearance";
}

function chipValue(key: GscFilterKey, value: string): string {
  if (key === "country") return countryLabel(value);
  if (key === "device") return deviceLabel(value);
  if (key === "page_eq" && value.length > 48) {
    return `…${value.slice(-46)}`;
  }
  return value;
}

/** One rendered chip: a scalar filter, one stamp pair, or one level. */
interface Chip {
  id: string;
  label: string;
  value: string;
  remove: () => void;
}

export function FilterBar({
  filters,
  onChange,
  allowedKeys,
  siteId,
}: {
  filters: GscFilters;
  onChange: (next: GscFilters) => void;
  /** The keys the active tab's dimension can serve (url-state owns the map). */
  allowedKeys?: readonly GscFilterKey[];
  /** Needed for the Dimension / Level pickers (vocabularies are per site). */
  siteId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [draftKey, setDraftKey] = useState<GscFilterKey>("query_contains");
  const [draftValue, setDraftValue] = useState("");
  const [draftDimension, setDraftDimension] = useState<string>("");
  const [draftStampValue, setDraftStampValue] = useState<string>("");
  const [draftLevel, setDraftLevel] = useState<string>("");

  const stampPairs = parseStampFilter(filters.stamps);
  const levelList = parseLevelFilter(filters.levels);
  const wantsVocab =
    !!siteId &&
    (stampPairs.length > 0 ||
      levelList.length > 0 ||
      (open && (draftKey === "stamps" || draftKey === "levels")));

  const catalog = useQuery({
    queryKey: ["marketing", "gsc", "filter-dimension-catalog", siteId],
    queryFn: ({ signal }) => getFacetDimensionCatalog(siteId as string, signal),
    enabled: wantsVocab,
    staleTime: 5 * 60_000,
  });
  const vocabulary = useQuery({
    queryKey: ["marketing", "gsc", "filter-level-vocabulary", siteId],
    queryFn: ({ signal }) =>
      getValueVocabulary(siteId as string, "value_band", signal),
    enabled: wantsVocab,
    staleTime: 5 * 60_000,
  });

  const dimensions = (catalog.data ?? []).filter((d) => d.values.length > 0);
  const dimensionLabel = (slug: string) =>
    dimensions.find((d) => d.slug === slug)?.label ?? slug;
  const valueLabel = (dimension: string, value: string) =>
    dimensions
      .find((d) => d.slug === dimension)
      ?.values.find((v) => v.key === value)?.label ?? value;
  const levelLabel = (level: string) =>
    (vocabulary.data ?? []).find((b) => b.value === level)?.label ??
    (level === "unvalued" ? "Unvalued" : level === "negative" ? "Negative" : level);

  const group = activeGroup(filters);

  const addable: GscFilterKey[] = (
    Object.keys(FILTER_LABELS) as GscFilterKey[]
  ).filter((key) => {
    if (filters[key] && !MULTI_KEYS.includes(key)) return false;
    if (allowedKeys && !allowedKeys.includes(key)) return false;
    if (MULTI_KEYS.includes(key) && !siteId) return false;
    if (group === "query_page") return QUERY_PAGE_KEYS.includes(key);
    if (group === "country_device") return COUNTRY_DEVICE_KEYS.includes(key);
    if (group === "appearance") return false;
    return true;
  });
  const effectiveKey: GscFilterKey = addable.includes(draftKey)
    ? draftKey
    : (addable[0] ?? "query_contains");

  const removeKey = (key: GscFilterKey) => {
    const next = { ...filters };
    delete next[key];
    onChange(next);
  };
  const setStamps = (pairs: { dimension: string; value: string }[]) => {
    const next = { ...filters };
    if (pairs.length === 0) delete next.stamps;
    else next.stamps = encodeStampFilter(pairs);
    onChange(next);
  };
  const setLevels = (levels: string[]) => {
    const next = { ...filters };
    if (levels.length === 0) delete next.levels;
    else next.levels = encodeLevelFilter(levels);
    onChange(next);
  };

  const chips: Chip[] = [];
  for (const [key, value] of Object.entries(filters) as Array<
    [GscFilterKey, string | undefined]
  >) {
    if (typeof value !== "string" || value.trim() === "") continue;
    if (key === "stamps") {
      stampPairs.forEach((pair, idx) => {
        chips.push({
          id: `stamp:${pair.dimension}:${pair.value}`,
          label: dimensionLabel(pair.dimension),
          value: valueLabel(pair.dimension, pair.value),
          remove: () => setStamps(stampPairs.filter((_, i) => i !== idx)),
        });
      });
      continue;
    }
    if (key === "levels") {
      levelList.forEach((level, idx) => {
        chips.push({
          id: `level:${level}`,
          label: "Level",
          value: levelLabel(level),
          remove: () => setLevels(levelList.filter((_, i) => i !== idx)),
        });
      });
      continue;
    }
    chips.push({
      id: key,
      label: FILTER_CHIP_LABELS[key],
      value: chipValue(key, value),
      remove: () => removeKey(key),
    });
  }

  const draftDimensionRow =
    dimensions.find((d) => d.slug === draftDimension) ?? dimensions[0];
  const draftValueRows = draftDimensionRow?.values.filter((v) => !v.abstain) ?? [];

  const canAdd =
    effectiveKey === "stamps"
      ? !!draftDimensionRow && !!draftStampValue
      : effectiveKey === "levels"
        ? !!draftLevel
        : !!draftValue.trim();

  const addFilter = () => {
    if (effectiveKey === "stamps") {
      if (!draftDimensionRow || !draftStampValue) return;
      const pair = { dimension: draftDimensionRow.slug, value: draftStampValue };
      if (
        !stampPairs.some(
          (p) => p.dimension === pair.dimension && p.value === pair.value,
        )
      ) {
        setStamps([...stampPairs, pair]);
      }
      setDraftStampValue("");
      setOpen(false);
      return;
    }
    if (effectiveKey === "levels") {
      if (!draftLevel) return;
      if (!levelList.includes(draftLevel)) setLevels([...levelList, draftLevel]);
      setDraftLevel("");
      setOpen(false);
      return;
    }
    if (!draftValue.trim()) return;
    onChange({ ...filters, [effectiveKey]: draftValue.trim() });
    setDraftValue("");
    setOpen(false);
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-foreground sm:max-w-72"
        >
          <span className="shrink-0 whitespace-nowrap text-muted-foreground">
            {chip.label}:
          </span>
          <span className="min-w-0 truncate whitespace-nowrap font-medium" title={chip.value}>
            {chip.value}
          </span>
          <button
            type="button"
            aria-label={`Remove ${chip.label} filter`}
            className="ml-0.5 shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={chip.remove}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {addable.length > 0 ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1 rounded-full border-dashed px-2 text-xs text-muted-foreground"
            >
              <Plus className="h-3 w-3" />
              Filter
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-2 p-3">
            <Select
              value={effectiveKey}
              onValueChange={(next) => setDraftKey(next as GscFilterKey)}
            >
              <SelectTrigger size="sm" aria-label="Filter type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {addable.map((key) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    {FILTER_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {effectiveKey === "stamps" ? (
              <div className="space-y-2">
                <Select
                  value={draftDimensionRow?.slug ?? ""}
                  onValueChange={(next) => {
                    setDraftDimension(next);
                    setDraftStampValue("");
                  }}
                >
                  <SelectTrigger size="sm" aria-label="Dimension">
                    <SelectValue
                      placeholder={
                        catalog.isPending ? "Loading dimensions…" : "Dimension"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {dimensions.map((d) => (
                      <SelectItem key={d.slug} value={d.slug} className="text-xs">
                        {d.label}
                        {d.scope === "site" ? " · yours" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={draftStampValue}
                  onValueChange={setDraftStampValue}
                  disabled={!draftDimensionRow}
                >
                  <SelectTrigger size="sm" aria-label="Value">
                    <SelectValue placeholder="Value" />
                  </SelectTrigger>
                  <SelectContent>
                    {draftValueRows.map((v) => (
                      <SelectItem key={v.key} value={v.key} className="text-xs">
                        {v.label}
                        {v.keyword_count > 0 ? (
                          <span className="ml-1 text-muted-foreground">
                            · {v.keyword_count.toLocaleString()}
                          </span>
                        ) : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Add several to intersect them — a keyword must carry every
                  stamp you pick. Stamps are keyword-level, so country / device /
                  appearance filters cannot combine with them.
                </p>
              </div>
            ) : effectiveKey === "levels" ? (
              <div className="space-y-2">
                <Select value={draftLevel} onValueChange={setDraftLevel}>
                  <SelectTrigger size="sm" aria-label="Level">
                    <SelectValue
                      placeholder={
                        vocabulary.isPending ? "Loading levels…" : "Level"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(vocabulary.data ?? []).map((b) => (
                      <SelectItem key={b.value} value={b.value} className="text-xs">
                        {b.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="negative" className="text-xs">
                      Negative
                    </SelectItem>
                    <SelectItem value="unvalued" className="text-xs">
                      Unvalued
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Levels come from this site&apos;s value scale. Several levels
                  are OR-ed.
                </p>
              </div>
            ) : (
              <Input
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addFilter();
                }}
                placeholder={
                  effectiveKey === "country"
                    ? "3-letter code, e.g. usa"
                    : effectiveKey === "device"
                      ? "DESKTOP, MOBILE, or TABLET"
                      : "Value…"
                }
                className="h-8 text-xs"
                aria-label="Filter value"
              />
            )}

            <div className="flex justify-end">
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!canAdd}
                onClick={addFilter}
              >
                Add filter
              </Button>
            </div>
            {group === null ? (
              <p className="text-[11px] leading-snug text-muted-foreground">
                Query/page, country/device, and appearance filters cannot be
                mixed — each group reads its own Search Console dimension set.
              </p>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}
      {chips.length > 0 ? (
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => onChange({})}
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}
