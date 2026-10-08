"use client";

// features/education/convert/LineageArtifactList.tsx
//
// THE list of study artifacts on a lineage edge — "Also made from it" (siblings
// of one Source) and "Generated from this" (children of one artifact). Both
// lineage renderers draw their items here; there is no third.
//
// Why a LIST and not chips (owner, 2026-10-04): every sibling of one Source
// carries the SAME title — the kit's name — and a `detail` that can be a
// sentence ("140 cards - 1 section could not be covered (...)"). As pills that
// read as identical quarter-width capsules each holding a sentence. A sentence
// is not a button. Each item is the canonical `ItemRow`: the KIND (the thing
// that differs between siblings) as the label, the detail as its clamped
// secondary label, the full title in the tooltip, and the row opens the record.

import { Boxes, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ItemRow } from "@ai-matrx/design-system/item";
import { TARGET_PRESENTATION } from "./targetPresentation";
import type { GeneratedArtifact } from "./lineage";

function presentationFor(a: GeneratedArtifact): {
  Icon: LucideIcon;
  fg: string;
  kindLabel: string | null;
} {
  const p = a.targetKind ? TARGET_PRESENTATION[a.targetKind] : undefined;
  if (p) return { Icon: p.icon, fg: p.fg, kindLabel: p.label };
  return { Icon: Boxes, fg: "text-muted-foreground", kindLabel: null };
}

export function LineageArtifactList({
  heading,
  items,
  className,
}: {
  /** One-line heading above the rows ("Also made from it"). */
  heading: string;
  items: GeneratedArtifact[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={cn("min-w-0", className)}>
      <p className="mb-0.5 text-xs font-medium text-muted-foreground">
        {heading}
      </p>
      <ul className="grid min-w-0 grid-cols-1 gap-x-4 sm:grid-cols-2">
        {items.map((a) => {
          const { Icon, fg, kindLabel } = presentationFor(a);
          return (
            <li key={a.edgeId} className="min-w-0" title={a.title}>
              <ItemRow
                size="sm"
                // Lineage rows are written by the convert/ingest pipeline.
                sourceFeature="education-ingest"
                // The kind names the row when we know it: siblings share the
                // kit's title, so the title alone cannot tell them apart.
                label={kindLabel ?? a.title}
                secondaryLabel={a.detail ?? undefined}
                leading={<Icon className={cn("h-3.5 w-3.5", fg)} />}
                href={a.href}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
