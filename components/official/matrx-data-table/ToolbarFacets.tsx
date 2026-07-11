"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ToolbarFacet } from "./types";

/**
 * Extensible toolbar facet strip. Today: button-group + custom.
 * Active non-default options get a clear (X) so you don't hunt for "All".
 */
export function ToolbarFacets({ facets }: { facets: ToolbarFacet[] }) {
  if (facets.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {facets.map((facet) => {
        if (facet.type === "custom") {
          return <div key={facet.id}>{facet.render()}</div>;
        }

        const defaultValue =
          facet.defaultValue ?? facet.options[0]?.value ?? "";
        const isNonDefault = facet.value !== defaultValue;

        return (
          <div key={facet.id} className="flex flex-wrap items-center gap-1.5">
            {facet.label ? (
              <span className="mr-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {facet.label}
              </span>
            ) : null}
            {facet.options.map((opt) => {
              const active = facet.value === opt.value;
              return (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className={cn(
                    "h-7 gap-1 px-2.5 text-xs",
                    active && isNonDefault && "pr-1.5",
                  )}
                  onClick={() => facet.onChange(opt.value)}
                >
                  {opt.icon}
                  {opt.label}
                  {active && isNonDefault ? (
                    <span
                      role="button"
                      tabIndex={0}
                      title="Clear this filter"
                      className="ml-0.5 inline-flex rounded-sm p-0.5 hover:bg-primary-foreground/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        facet.onChange(defaultValue);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          facet.onChange(defaultValue);
                        }
                      }}
                    >
                      <X className="h-3 w-3" />
                    </span>
                  ) : null}
                </Button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Reset every button-group facet to its default. */
export function resetToolbarFacets(facets: ToolbarFacet[] | undefined): void {
  if (!facets) return;
  for (const facet of facets) {
    if (facet.type !== "button-group") continue;
    const def = facet.defaultValue ?? facet.options[0]?.value;
    if (def !== undefined && facet.value !== def) facet.onChange(def);
  }
}
