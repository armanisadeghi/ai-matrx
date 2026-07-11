"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ToolbarFacet } from "./types";

/**
 * Extensible toolbar facet strip. Today: button-group + custom.
 * Tomorrow: radio, switch, complex controls — add a discriminant, don't fork.
 */
export function ToolbarFacets({ facets }: { facets: ToolbarFacet[] }) {
  if (facets.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {facets.map((facet) => {
        if (facet.type === "custom") {
          return <div key={facet.id}>{facet.render()}</div>;
        }

        return (
          <div key={facet.id} className="flex flex-wrap items-center gap-1.5">
            {facet.label ? (
              <span className="mr-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {facet.label}
              </span>
            ) : null}
            {facet.options.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={facet.value === opt.value ? "default" : "outline"}
                className={cn("h-7 gap-1.5 px-2.5 text-xs")}
                onClick={() => facet.onChange(opt.value)}
              >
                {opt.icon}
                {opt.label}
              </Button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
