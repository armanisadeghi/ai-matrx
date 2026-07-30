"use client";

/**
 * GSC-style filter chip bar. Active filters render as removable chips; the
 * "+ New" menu adds one. Filter groups may not cross dimension profiles
 * ((query/page) | (country/device) | (search_appearance)) — the menu only
 * offers additions compatible with what is already active, so the RPC's
 * `gsc_filter_combination_unsupported` guard can never fire from this UI.
 */

import { useState } from "react";
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
} from "@/features/marketing/search-console/types";

const FILTER_LABELS: Record<GscFilterKey, string> = {
  query_contains: "Query contains",
  query_eq: "Query is",
  query_neq: "Query is not",
  page_contains: "Page contains",
  page_eq: "Page is",
  country: "Country",
  device: "Device",
  search_appearance: "Appearance",
};

const QUERY_PAGE_KEYS: GscFilterKey[] = [
  "query_contains",
  "query_eq",
  "query_neq",
  "page_contains",
  "page_eq",
];
const COUNTRY_DEVICE_KEYS: GscFilterKey[] = ["country", "device"];

function activeGroup(
  filters: GscFilters,
): "query_page" | "country_device" | "appearance" | null {
  const keys = Object.entries(filters)
    .filter(([, v]) => typeof v === "string" && v.trim() !== "")
    .map(([k]) => k as GscFilterKey);
  if (keys.length === 0) return null;
  if (keys.some((k) => QUERY_PAGE_KEYS.includes(k))) return "query_page";
  if (keys.some((k) => COUNTRY_DEVICE_KEYS.includes(k))) return "country_device";
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

export function FilterBar({
  filters,
  onChange,
  allowedKeys,
}: {
  filters: GscFilters;
  onChange: (next: GscFilters) => void;
  /** The keys the active tab's dimension can serve (url-state owns the map). */
  allowedKeys?: readonly GscFilterKey[];
}) {
  const [open, setOpen] = useState(false);
  const [draftKey, setDraftKey] = useState<GscFilterKey>("query_contains");
  const [draftValue, setDraftValue] = useState("");

  const active = Object.entries(filters).filter(
    ([, v]) => typeof v === "string" && v.trim() !== "",
  ) as Array<[GscFilterKey, string]>;
  const group = activeGroup(filters);

  const addable: GscFilterKey[] = (
    Object.keys(FILTER_LABELS) as GscFilterKey[]
  ).filter((key) => {
    if (filters[key]) return false;
    if (allowedKeys && !allowedKeys.includes(key)) return false;
    if (group === "query_page") return QUERY_PAGE_KEYS.includes(key);
    if (group === "country_device") return COUNTRY_DEVICE_KEYS.includes(key);
    if (group === "appearance") return false;
    return true;
  });

  const removeFilter = (key: GscFilterKey) => {
    const next = { ...filters };
    delete next[key];
    onChange(next);
  };

  const addFilter = () => {
    if (!draftValue.trim()) return;
    onChange({ ...filters, [draftKey]: draftValue.trim() });
    setDraftValue("");
    setOpen(false);
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {active.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex max-w-72 items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-foreground"
        >
          <span className="text-muted-foreground">{FILTER_LABELS[key]}:</span>
          <span className="truncate font-medium">{chipValue(key, value)}</span>
          <button
            type="button"
            aria-label={`Remove ${FILTER_LABELS[key]} filter`}
            className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => removeFilter(key)}
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
          <PopoverContent align="start" className="w-72 space-y-2 p-3">
            <Select
              value={addable.includes(draftKey) ? draftKey : addable[0]}
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
            <Input
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addFilter();
              }}
              placeholder={
                (addable.includes(draftKey) ? draftKey : addable[0]) ===
                "country"
                  ? "3-letter code, e.g. usa"
                  : (addable.includes(draftKey) ? draftKey : addable[0]) ===
                      "device"
                    ? "DESKTOP, MOBILE, or TABLET"
                    : "Value…"
              }
              className="h-8 text-xs"
              aria-label="Filter value"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!draftValue.trim()}
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
      {active.length > 0 ? (
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
