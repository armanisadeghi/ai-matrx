"use client";

/**
 * Keyword picker: searches the universal keyword plane (REUSES the canonical
 * `listKeywordsWithMarket` read from features/seo) and annotates each result
 * with THIS site's `seo.site_keyword_value` (workflow_status / content_role /
 * priority_score). The plan READS keyword value — it never re-decides it
 * (content-planning invariant #5), so the value chips are display-only.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { listKeywordsWithMarket } from "@/features/marketing/seo/keyword-research/data/queries";
import {
  KeywordCompetitionBadge,
  KeywordIntentChip,
  formatSearchVolume,
} from "@/features/marketing/seo/keyword-research/components/KeywordMetrics";
import type {
  KeywordMarketRow,
  KeywordWithMarket,
} from "@/features/marketing/seo/keyword-research/types";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";

import { useKeywordLabels, useSiteKeywordValues } from "../data/hooks";

/** US market first (location 2840), else the first fetched market row. */
function pickerMarket(row: KeywordWithMarket): KeywordMarketRow | null {
  return (
    row.keyword_market.find((market) => market.location_code === 2840) ??
    row.keyword_market[0] ??
    null
  );
}

export function KeywordPicker({
  siteId,
  value,
  onChange,
  placeholder = "Pick keyword",
  clearable = true,
}: {
  siteId: string;
  value: string | null;
  onChange: (keywordId: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const keywords = useQuery({
    queryKey: ["content-plan", "keyword-search", debounced],
    queryFn: ({ signal }) =>
      listKeywordsWithMarket({ search: debounced, limit: 50, signal }),
    enabled: open,
  });
  const siteValues = useSiteKeywordValues(open ? siteId : null);
  const valueByKeyword = useMemo(() => {
    const map = new Map<
      string,
      { workflow_status: string | null; content_role: string | null; priority_score: number | null }
    >();
    for (const row of siteValues.data ?? []) map.set(row.keyword_id, row);
    return map;
  }, [siteValues.data]);

  const selectedLabel = useKeywordLabels(value ? [value] : []);
  const selectedPhrase = value
    ? (selectedLabel.data?.find((row) => row.id === value)?.phrase ?? "…")
    : null;

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 min-w-0 flex-1 justify-start text-sm font-normal"
          >
            <Search className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className={cn("truncate", !selectedPhrase && "text-muted-foreground")}>
              {selectedPhrase ?? placeholder}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-2" align="start">
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search keywords…"
            className="mb-2 h-8"
          />
          <div className="max-h-72 overflow-y-auto">
            {keywords.isLoading ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">Searching…</p>
            ) : keywords.isError ? (
              <p className="px-2 py-3 text-xs text-destructive">
                {extractErrorMessage(keywords.error)}
              </p>
            ) : (keywords.data ?? []).length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                No keywords match. Keywords are created in Keyword Research.
              </p>
            ) : (
              (keywords.data ?? []).map((keyword) => {
                const siteValue = valueByKeyword.get(keyword.id);
                return (
                  <button
                    key={keyword.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                      keyword.id === value && "bg-accent",
                    )}
                    onClick={() => {
                      onChange(keyword.id);
                      setOpen(false);
                    }}
                  >
                    {keyword.id === value ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 truncate">{keyword.phrase}</span>
                        <KeywordIntentChip
                          intentClass={keyword.intent_class}
                          hideUnclassified
                          className="shrink-0"
                        />
                      </span>
                      <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="tabular-nums">
                          {formatSearchVolume(
                            pickerMarket(keyword)?.search_volume,
                          )}
                          /mo
                        </span>
                        <KeywordCompetitionBadge
                          competition={pickerMarket(keyword)?.competition}
                          className="text-[10px]"
                        />
                      </span>
                    </span>
                    {siteValue ? (
                      <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                        {siteValue.workflow_status ? (
                          <span className="rounded bg-muted px-1">{siteValue.workflow_status}</span>
                        ) : null}
                        {siteValue.content_role ? (
                          <span className="rounded bg-muted px-1">{siteValue.content_role}</span>
                        ) : null}
                        {siteValue.priority_score != null ? (
                          <span className="rounded bg-muted px-1">
                            {Number(siteValue.priority_score).toFixed(0)}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        no site value
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      {clearable && value ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          aria-label="Clear keyword"
          onClick={() => onChange(null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
