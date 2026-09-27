"use client";

// features/mandates/filled-by/FillsMandatesCell.tsx
//
// The "Fills mandates" cell for any list whose rows are mandate holders
// (agents, workflows). The count is the door: it opens a small list of the
// mandates this holder fills for the viewer, each linking to its place on the
// Intelligence page. No count, no door — an em dash, like every empty cell.

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { Muted } from "@/lib/entity-list/columns";
import { mandateDisplayName } from "@/features/mandates/mandate-words";
import { featureIntelligenceHref } from "@/features/mandates/feature-intelligence/hrefs";
import type { FilledMandates } from "./service";

export function FillsMandatesCell({
  mandates,
}: {
  mandates: FilledMandates | undefined;
}) {
  if (mandates === null) {
    return (
      <span
        className="inline-flex text-muted-foreground"
        title="Could not read which mandates this fills — reload to try again"
        aria-label="Not measured"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (!mandates || mandates.length === 0) return <Muted>—</Muted>;

  const n = mandates.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex min-h-7 min-w-7 items-center justify-end tabular-nums text-muted-foreground hover:text-foreground hover:underline pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          title={`Fills ${n} ${n === 1 ? "mandate" : "mandates"}`}
          aria-label={`Fills ${n} ${n === 1 ? "mandate" : "mandates"}`}
        >
          {n}
        </button>
      </PopoverTrigger>
      <PopoverContent
        sizing="content"
        align="end"
        className="p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <ul className="max-h-72 min-w-56 max-w-80 overflow-y-auto py-1">
          {mandates.map((m) => (
            <li key={m.mandateId}>
              <Link
                href={featureIntelligenceHref("", { mandateKey: m.mandateKey })}
                className="block truncate px-3 py-1.5 text-[13px] text-foreground hover:bg-accent"
                title={m.mandateKey}
              >
                {mandateDisplayName(m.mandateKey, m.label)}
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
