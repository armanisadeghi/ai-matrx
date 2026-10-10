"use client";

/**
 * THE TAG FILTER — pick tags, then Any (a keyword carries one of them) or All
 * (it carries every one). A SERVER filter: `tags` / `tags_match` in the shared
 * dialect fold into `seo.gsc_stamp_keyword_set`, so it intersects with every
 * other filter and pages honestly.
 *
 * Like the Offering filter it lives beside the shared `FilterBar` rather than
 * inside it, because only the keyword table holds the site's tag names.
 */

import { Check, Tags, X } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { SegmentedControl } from "@ai-matrx/design-system/controls";
import { cn } from "@/styles/themes/utils";
import type { FacetValue } from "@/features/marketing/seo/value-system/dimensions/data";
import type { TagMatch } from "../tagFilter";

export function TagFilterControl({
  tags,
  values,
  match,
  onChange,
}: {
  /** The site's tags (the Tags dimension's values). */
  tags: FacetValue[];
  /** The tag value keys currently filtered on. */
  values: string[];
  match: TagMatch;
  onChange: (values: string[], match: TagMatch) => void;
}) {
  const labelFor = (key: string) =>
    tags.find((tag) => tag.key === key)?.label ?? key;
  const active = values.length > 0;
  const summary = values.map(labelFor).join(match === "any" ? " or " : " and ");

  const toggle = (key: string) =>
    onChange(
      values.includes(key) ? values.filter((v) => v !== key) : [...values, key],
      match,
    );

  return (
    <span className="inline-flex max-w-full min-w-0 items-center">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Filter by tag"
            className={cn(
              "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs max-lg:min-h-11 sm:max-w-72",
              active
                ? "border-border bg-card text-foreground"
                : "border-dashed border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Tags className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="shrink-0 whitespace-nowrap text-muted-foreground">
              {active ? "Tags:" : "Tags"}
            </span>
            {active ? (
              <span className="min-w-0 truncate whitespace-nowrap font-medium" title={summary}>
                {summary}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent sizing="content" align="start" className="flex flex-col gap-2 p-2">
          <SegmentedControl
            aria-label="Match"
            value={match}
            onValueChange={(next) => onChange(values, next === "any" ? "any" : "all")}
            data={[
              { value: "any", label: "Any of" },
              { value: "all", label: "All of" },
            ]}
          />
          <div className="flex max-h-64 flex-col overflow-y-auto" role="group" aria-label="Tags">
            {tags.map((tag) => {
              const on = values.includes(tag.key);
              return (
                <button
                  key={tag.value_id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(tag.key)}
                  className="flex items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent max-lg:min-h-11"
                >
                  <Check className={cn("h-3 w-3 shrink-0", on ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">{tag.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {tag.keyword_count.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {active ? (
        <button
          type="button"
          aria-label="Remove Tags filter"
          className="ml-0.5 shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground max-lg:min-h-11 max-lg:min-w-11"
          onClick={() => onChange([], match)}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}
