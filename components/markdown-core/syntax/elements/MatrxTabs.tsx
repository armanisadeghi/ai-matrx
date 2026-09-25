"use client";

// `::::tabs` / `:::tab[Label]` — tabs. Every panel stays in the DOM (hidden
// when inactive) so search, print and the server render all see every tab.

import { Children, isValidElement, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

function parseLabels(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function MatrxTabs(props: { "data-labels"?: string; id?: string; children?: ReactNode }) {
  const panels = Children.toArray(props.children).filter(isValidElement);
  const labels = parseLabels(props["data-labels"]);
  const [active, setActive] = useState(0);
  const base = useId();
  if (panels.length === 0) return null;
  const current = Math.min(active, panels.length - 1);

  return (
    <div id={props.id} className="matrx-tabs my-3 overflow-hidden rounded-md border border-border" data-matrx-tabs="">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border bg-muted/40 px-1.5 pt-1.5">
        {panels.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            id={`${base}-tab-${i}`}
            aria-selected={i === current}
            aria-controls={`${base}-panel-${i}`}
            onClick={() => setActive(i)}
            className={cn(
              "-mb-px shrink-0 rounded-t-md border border-transparent px-3 py-1.5 text-xs font-medium transition-colors",
              i === current
                ? "border-border border-b-background bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {labels[i] || `Tab ${i + 1}`}
          </button>
        ))}
      </div>
      {panels.map((panel, i) => (
        <div
          key={i}
          role="tabpanel"
          id={`${base}-panel-${i}`}
          aria-labelledby={`${base}-tab-${i}`}
          hidden={i !== current}
          className="px-3 py-2 print:block [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        >
          {panel}
        </div>
      ))}
    </div>
  );
}

/** One tab's body; the label lives on the parent (`data-labels`). */
export function MatrxTab(props: { children?: ReactNode }) {
  return <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{props.children}</div>;
}
