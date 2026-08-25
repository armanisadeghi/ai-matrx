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
 *
 * P23 — and "this afternoon" means FROM HERE. Both pickers take new input: the
 * Dimension picker offers "+ New dimension" and "+ New value", the Level picker
 * "+ New level". Wanting to slice by something you have not named yet is the
 * most common reason a person reaches this bar, and sending them away to name
 * it first is the dead end the sweep exists to kill.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
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
  GSC_RANGE_FILTERS,
  STAMP_BLANK_LABEL,
  STAMP_BLANK_VALUE,
  countryLabel,
  deviceLabel,
  encodeLevelFilter,
  encodeStampFilter,
  parseLevelFilter,
  parseStampFilter,
} from "@/features/marketing/search-console/types";
import { getFacetDimensionCatalog } from "@/features/marketing/seo/value-system/dimensions/data";
import { getValueVocabulary } from "@/features/marketing/seo/value-system/data";
import { CreatablePicker } from "@/components/ui/creatable-picker";
import { AddDimensionDialog } from "@/features/marketing/seo/value-system/pickers/AddDimensionDialog";
import { AddLevelDialog } from "@/features/marketing/seo/value-system/pickers/AddLevelDialog";
import { useQuickAdd } from "@/features/marketing/seo/value-system/pickers/useQuickAdd";
import { toast } from "@/lib/toast";
import { marketingRoutes } from "@/features/marketing/lib/routes";

const FILTER_LABELS: Record<GscFilterKey, string> = {
  query_contains: "Query contains",
  query_word: "Query has the word",
  query_eq: "Exact query",
  query_neq: "Query excludes",
  page_contains: "Page contains",
  page_eq: "Exact page",
  country: "Country",
  device: "Device",
  search_appearance: "Appearance",
  location: "Location",
  stamps: "Dimension",
  levels: "Level",
  // THE OFFERING FILTER is set and shown by the surface that can NAME a topic
  // (the keyword workbench's own Offering control). This bar has no topic
  // catalog, so it never offers the key and never renders a raw uuid chip for
  // it — see SKIPPED_KEYS below.
  topic: "Offering",
  // WHOSE RULING a placement is. Like the offering filter, it is set by the
  // surface it MAKES (the topic tree's proposals queue), never chosen here —
  // see SKIPPED_KEYS below.
  placement: "Placement",
  clicks_min: "Clicks",
  clicks_max: "Clicks",
  impressions_min: "Impressions",
  impressions_max: "Impressions",
  position_min: "Position",
  position_max: "Position",
  ctr_min: "CTR",
  ctr_max: "CTR",
  traffic_classes: "Class",
  value_score_min: "Score",
  value_score_max: "Score",
};

const FILTER_CHIP_LABELS: Record<GscFilterKey, string> = {
  ...FILTER_LABELS,
  query_eq: "Query",
  page_eq: "Page",
  query_word: "Word",
};

/**
 * C14 — the range filters are added and removed as ONE thing ("Clicks 10–500"),
 * so the menu offers a range GROUP rather than six half-filters. `range:` keys
 * exist only inside this component; the URL and the RPC still see the bounds.
 */
type RangeMenuKey = `range:${(typeof GSC_RANGE_FILTERS)[number]["id"]}`;
type FilterMenuKey = GscFilterKey | RangeMenuKey;
const RANGE_MENU_KEYS: RangeMenuKey[] = GSC_RANGE_FILTERS.map(
  (r) => `range:${r.id}` as RangeMenuKey,
);
const RANGE_BOUND_KEYS = new Set<GscFilterKey>(
  GSC_RANGE_FILTERS.flatMap((r) => [r.min, r.max] as GscFilterKey[]),
);
function rangeSpecFor(key: RangeMenuKey) {
  const id = key.slice("range:".length);
  return GSC_RANGE_FILTERS.find((r) => r.id === id) ?? GSC_RANGE_FILTERS[0];
}
function rangeChipValue(min: string | undefined, max: string | undefined): string {
  if (min && max) return `${min} – ${max}`;
  if (min) return `≥ ${min}`;
  return `≤ ${max}`;
}

const QUERY_PAGE_KEYS: GscFilterKey[] = [
  "query_contains",
  "query_word",
  "query_eq",
  "query_neq",
  "page_contains",
  "page_eq",
  "stamps",
  "levels",
  // The offering filter is a keyword-level filter like a stamp, so it belongs
  // to this profile group even though this bar does not render its control.
  "topic",
];
const COUNTRY_DEVICE_KEYS: GscFilterKey[] = ["country", "device"];
/** Keys that hold a LIST (several chips, several adds) rather than one value. */
const MULTI_KEYS: GscFilterKey[] = ["stamps", "levels"];
/**
 * Keys this bar deliberately leaves alone: they are part of the shared URL
 * dialect (so a pasted link means the same thing everywhere) but their own
 * surface owns the control AND the chip, because only that surface can turn
 * the stored id into a name a person recognises.
 */
const SKIPPED_KEYS: GscFilterKey[] = ["topic", "placement"];

function activeGroup(
  filters: GscFilters,
): "query_page" | "country_device" | "appearance" | null {
  const keys = Object.entries(filters)
    .filter(([, v]) => typeof v === "string" && v.trim() !== "")
    .map(([k]) => k as GscFilterKey)
    // Ranges belong to no group — see PROFILE_NEUTRAL_FILTER_KEYS in url-state.
    .filter((k) => !RANGE_BOUND_KEYS.has(k));
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
  const [draftKey, setDraftKey] = useState<FilterMenuKey>("query_contains");
  const [draftValue, setDraftValue] = useState("");
  const [draftMin, setDraftMin] = useState("");
  const [draftMax, setDraftMax] = useState("");
  const [draftDimension, setDraftDimension] = useState<string>("");
  const [draftStampValue, setDraftStampValue] = useState<string>("");
  const [draftLevel, setDraftLevel] = useState<string>("");
  // P23 — what was typed into a picker when nothing matched.
  const [newDimensionDraft, setNewDimensionDraft] = useState<string | null>(null);
  const [newLevelDraft, setNewLevelDraft] = useState<string | null>(null);
  const { quickAdd } = useQuickAdd(siteId ?? "");
  // P23 — the person may always type one that does not exist yet.
  const queryClient = useQueryClient();

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
    // KI-022 — the "not answered" sentinel is a real filter, so it gets a real
    // word. Falling through to the raw key would print `__none` on a chip.
    value === STAMP_BLANK_VALUE
      ? STAMP_BLANK_LABEL
      : (dimensions
          .find((d) => d.slug === dimension)
          ?.values.find((v) => v.key === value)?.label ?? value);
  const levelLabel = (level: string) =>
    (vocabulary.data ?? []).find((b) => b.value === level)?.label ??
    (level === "unvalued" ? "Unvalued" : level === "negative" ? "Negative" : level);

  const group = activeGroup(filters);

  const addable: FilterMenuKey[] = [
    ...(Object.keys(FILTER_LABELS) as GscFilterKey[]).filter((key) => {
      if (RANGE_BOUND_KEYS.has(key)) return false; // offered as a range group
      if (SKIPPED_KEYS.includes(key)) return false; // its own surface owns it
      if (filters[key] && !MULTI_KEYS.includes(key)) return false;
      if (allowedKeys && !allowedKeys.includes(key)) return false;
      if (MULTI_KEYS.includes(key) && !siteId) return false;
      if (group === "query_page") return QUERY_PAGE_KEYS.includes(key);
      if (group === "country_device") return COUNTRY_DEVICE_KEYS.includes(key);
      if (group === "appearance") return false;
      return true;
    }),
    ...RANGE_MENU_KEYS.filter((key) => {
      const spec = rangeSpecFor(key);
      if (filters[spec.min] || filters[spec.max]) return false;
      if (allowedKeys && !allowedKeys.includes(spec.min as GscFilterKey)) {
        return false;
      }
      return true;
    }),
  ];
  const effectiveKey: FilterMenuKey = addable.includes(draftKey)
    ? draftKey
    : (addable[0] ?? "query_contains");
  const rangeSpec = effectiveKey.startsWith("range:")
    ? rangeSpecFor(effectiveKey as RangeMenuKey)
    : null;

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
    if (RANGE_BOUND_KEYS.has(key)) continue; // one chip per range, added below
    if (SKIPPED_KEYS.includes(key)) continue; // its own surface renders the chip
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

  for (const spec of GSC_RANGE_FILTERS) {
    const min = filters[spec.min];
    const max = filters[spec.max];
    if (!min && !max) continue;
    chips.push({
      id: `range:${spec.id}`,
      label: spec.label,
      value: rangeChipValue(min, max),
      remove: () => {
        const next = { ...filters };
        delete next[spec.min];
        delete next[spec.max];
        onChange(next);
      },
    });
  }

  const draftDimensionRow =
    dimensions.find((d) => d.slug === draftDimension) ?? dimensions[0];
  const draftValueRows = draftDimensionRow?.values.filter((v) => !v.abstain) ?? [];

  const canAdd = rangeSpec
    ? Number.isFinite(Number(draftMin.trim())) && draftMin.trim() !== "" ||
      (Number.isFinite(Number(draftMax.trim())) && draftMax.trim() !== "")
    : effectiveKey === "stamps"
      ? !!draftDimensionRow && !!draftStampValue
      : effectiveKey === "levels"
        ? !!draftLevel
        : !!draftValue.trim();

  const addFilter = () => {
    if (rangeSpec) {
      const next = { ...filters };
      const min = draftMin.trim();
      const max = draftMax.trim();
      if (min !== "" && Number.isFinite(Number(min))) next[rangeSpec.min] = min;
      if (max !== "" && Number.isFinite(Number(max))) next[rangeSpec.max] = max;
      onChange(next);
      setDraftMin("");
      setDraftMax("");
      setOpen(false);
      return;
    }
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
          className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-foreground max-lg:min-h-11 sm:max-w-72"
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
            className="ml-0.5 shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground max-lg:min-h-11 max-lg:min-w-11"
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
              className="h-6 gap-1 rounded-full border-dashed px-2 text-xs text-muted-foreground max-lg:h-11 max-lg:min-w-11"
            >
              <Plus className="h-3 w-3" />
              Filter
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-2 p-3">
            <Select
              value={effectiveKey}
              onValueChange={(next) => setDraftKey(next as FilterMenuKey)}
            >
              <SelectTrigger size="sm" aria-label="Filter type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {addable.map((key) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    {key.startsWith("range:")
                      ? rangeSpecFor(key as RangeMenuKey).label
                      : FILTER_LABELS[key as GscFilterKey]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {rangeSpec ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step={rangeSpec.step}
                    value={draftMin}
                    onChange={(e) => setDraftMin(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addFilter();
                    }}
                    placeholder="Min"
                    className="h-8 text-xs"
                    aria-label={`${rangeSpec.label} minimum`}
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step={rangeSpec.step}
                    value={draftMax}
                    onChange={(e) => setDraftMax(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addFilter();
                    }}
                    placeholder="Max"
                    className="h-8 text-xs"
                    aria-label={`${rangeSpec.label} maximum`}
                  />
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {rangeSpec.hint}. Leave either side blank for an open end.
                </p>
              </div>
            ) : effectiveKey === "stamps" ? (
              <div className="space-y-2">
                <CreatablePicker
                  value={draftDimensionRow?.slug ?? null}
                  onSelect={(next) => {
                    setDraftDimension(next);
                    setDraftStampValue("");
                  }}
                  placeholder="Dimension"
                  noun="dimension"
                  ariaLabel="Dimension"
                  loading={catalog.isPending}
                  onCreateRequiresMore={(typed) => {
                    setOpen(false);
                    setNewDimensionDraft(typed);
                  }}
                  options={dimensions.map((d) => ({
                    value: d.slug,
                    label: d.label,
                    hint: d.scope === "site" ? "yours" : undefined,
                  }))}
                />
                <CreatablePicker
                  value={draftStampValue || null}
                  onSelect={setDraftStampValue}
                  disabled={!draftDimensionRow}
                  placeholder="Value"
                  noun="value"
                  ariaLabel="Value"
                  options={[
                    // KI-022 — the blanks are pickable here, not only through
                    // the coverage meter's door, so the filter bar can express
                    // the question a person asks out loud: "which ones has
                    // nobody answered?"
                    {
                      value: STAMP_BLANK_VALUE,
                      label: STAMP_BLANK_LABEL,
                      hint: "no answer yet",
                    },
                    ...draftValueRows.map((v) => ({
                      value: v.key,
                      label: v.label,
                      hint:
                        v.keyword_count > 0
                          ? v.keyword_count.toLocaleString()
                          : undefined,
                    })),
                  ]}
                  lockedNote={
                    draftDimensionRow && draftDimensionRow.scope !== "site"
                      ? `“${draftDimensionRow.label}” is a shared dimension every business uses, so its choices are platform-governed.`
                      : undefined
                  }
                  lockedAction={
                    draftDimensionRow && draftDimensionRow.scope !== "site"
                      ? {
                          label: "Make this your own dimension instead",
                          onSelect: () => {
                            setOpen(false);
                            setNewDimensionDraft(draftDimensionRow.label);
                          },
                        }
                      : undefined
                  }
                  onCreate={async (typed) => {
                    if (!draftDimensionRow || !siteId) return null;
                    const created = await quickAdd(typed, {
                      dimensionId: draftDimensionRow.dimension_id,
                    });
                    if (!created) return null;
                    await catalog.refetch();
                    return created.value_key;
                  }}
                />
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Add several to intersect them — a keyword must carry every
                  stamp you pick. Stamps are keyword-level, so country / device /
                  appearance filters cannot combine with them.
                </p>
              </div>
            ) : effectiveKey === "levels" ? (
              <div className="space-y-2">
                <CreatablePicker
                  value={draftLevel || null}
                  onSelect={setDraftLevel}
                  placeholder="Level"
                  noun="level"
                  ariaLabel="Level"
                  loading={vocabulary.isPending}
                  onCreateRequiresMore={(typed) => {
                    setOpen(false);
                    setNewLevelDraft(typed);
                  }}
                  options={[
                    ...(vocabulary.data ?? [])
                      .filter(
                        (b) => b.value !== "negative" && b.value !== "unvalued",
                      )
                      .map((b) => ({ value: b.value, label: b.label })),
                    { value: "negative", label: "Negative" },
                    { value: "unvalued", label: "Unvalued" },
                  ]}
                />
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Levels come from this site&apos;s value scale. Several levels
                  are OR-ed. Need one that does not exist yet? Add it from the
                  picker — it asks for the score it starts at, then joins your
                  scale for good.{" "}
                  {siteId ? (
                    <a
                      className="underline underline-offset-2 hover:text-foreground"
                      href={`${marketingRoutes.site(null, siteId, "/value")}?edit=levels`}
                    >
                      Rename or reorder your levels
                    </a>
                  ) : null}
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
                      : effectiveKey === "query_word"
                        ? "One word — matched whole, e.g. cost"
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

      {/* P23 — what the pickers hand off when creating needs more than a name.
          Both select the new row immediately and drop the person back into the
          filter they were building. */}
      {newDimensionDraft !== null && siteId ? (
        <AddDimensionDialog
          siteId={siteId}
          initialLabel={newDimensionDraft}
          onCancel={() => setNewDimensionDraft(null)}
          onCreated={(created) => {
            setNewDimensionDraft(null);
            void catalog.refetch();
            setDraftKey("stamps");
            setDraftDimension(created.dimension_slug);
            setDraftStampValue(created.value_key);
            setOpen(true);
          }}
        />
      ) : null}
      {newLevelDraft !== null && siteId ? (
        <AddLevelDialog
          siteId={siteId}
          kind="value_band"
          initialLabel={newLevelDraft}
          onCancel={() => setNewLevelDraft(null)}
          onCreated={(value) => {
            setNewLevelDraft(null);
            void vocabulary.refetch();
            setDraftKey("levels");
            setDraftLevel(value);
            setOpen(true);
          }}
        />
      ) : null}
    </div>
  );
}
