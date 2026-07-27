"use client";

// features/scopes/components/active-context/LensChip.tsx
//
// THE Lens Chip trigger — colored scope-type dots + a compact summary
// ("PBW · 2 scopes · 1 project"), or a muted "Set context" empty state.
// Pure presentation: the host supplies the selection and what the click opens.
//
// Promoted from /demos/scopes/context-lab/reimagine (T2). Identical UI;
// Surface-A wiring lives in ActiveContextLensChip.

import React from "react";
import { ChevronsUpDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

/** Kind ladder shared with the reimagine picker engine. */
export type LensChipKind =
  "org" | "type" | "scope" | "item" | "project" | "task";

/** Minimal node the chip needs — kind for the summary, optional swatch class. */
export interface LensChipNode {
  kind: LensChipKind;
  /** Compact identity shown individually for an organization node. */
  label?: string;
  /** Tailwind swatch class from resolveColor (e.g. `bg-blue-500`). */
  colorSwatch?: string;
}

export interface LensChipProps {
  nodes: LensChipNode[];
  /** Omit when a PopoverTrigger owns the click (desktop). */
  onClick?: () => void;
  /** Ref target so popover hosts can anchor. */
  buttonRef?: React.Ref<HTMLButtonElement>;
  className?: string;
}

/** Compact human summary, e.g. "ME · PBW · 2 scopes · 1 project". */
export function summarizeLensSelection(nodes: LensChipNode[]): string {
  if (nodes.length === 0) return "";
  const counts = new Map<LensChipKind, number>();
  for (const n of nodes) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  const plural: Record<LensChipKind, [string, string]> = {
    org: ["org", "orgs"],
    type: ["type", "types"],
    scope: ["scope", "scopes"],
    item: ["item", "items"],
    project: ["project", "projects"],
    task: ["task", "tasks"],
  };
  const order: LensChipKind[] = [
    "org",
    "type",
    "scope",
    "item",
    "project",
    "task",
  ];
  return order
    .flatMap((k) => {
      if (!counts.has(k)) return [];
      if (k === "org") {
        const labels = nodes
          .filter((node) => node.kind === "org")
          .map((node) => node.label?.trim())
          .filter((label): label is string => Boolean(label));
        const unlabeledCount = (counts.get(k) ?? 0) - labels.length;
        return [
          ...labels,
          ...(unlabeledCount > 0
            ? [`${unlabeledCount} ${plural[k][unlabeledCount === 1 ? 0 : 1]}`]
            : []),
        ];
      }

      const c = counts.get(k) ?? 0;
      return [`${c} ${plural[k][c === 1 ? 0 : 1]}`];
    })
    .join(" · ");
}

/** Distinct color swatches represented in the selection (max `cap`). */
function swatches(nodes: LensChipNode[], cap = 4): string[] {
  const seen = new Set<string>();
  for (const n of nodes) {
    seen.add(n.colorSwatch ?? "bg-muted-foreground");
    if (seen.size >= cap) break;
  }
  return [...seen];
}

export function LensChip({
  nodes,
  onClick,
  buttonRef,
  className,
}: LensChipProps) {
  const dots = swatches(nodes);
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-2.5 text-xs text-foreground hover:bg-muted",
        className,
      )}
    >
      {nodes.length === 0 ? (
        <>
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Set context</span>
        </>
      ) : (
        <>
          <span className="flex shrink-0 items-center -space-x-0.5">
            {dots.map((s) => (
              <span
                key={s}
                className={cn("h-2 w-2 rounded-full ring-1 ring-card", s)}
              />
            ))}
          </span>
          <span className="min-w-0 truncate">
            {summarizeLensSelection(nodes)}
          </span>
        </>
      )}
      <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
  );
}
