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
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { SelectChevron } from "@ai-matrx/design-system";
import { Button } from "@ai-matrx/design-system/controls";

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
  /** Square 28px trigger (rails, tight bars): the icon plus a count badge. */
  iconOnly?: boolean;
  /** "This needs a scope": amber ring, glyph and dot — a prompt, not an error. */
  attention?: boolean;
  /** Stretch to the row's width (sidebars, list headers). */
  fill?: boolean;
  /** `outline` (default): the bordered control. `quiet`: no frame until hover (a composer row). */
  variant?: "outline" | "quiet";
  /** Placement only. */
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
  iconOnly = false,
  attention = false,
  fill = false,
  variant = "outline",
  className,
}: LensChipProps) {
  const dots = swatches(nodes);
  const empty = nodes.length === 0;
  const summary = summarizeLensSelection(nodes);
  const name = empty ? "Set scopes" : `Scopes: ${summary}`;
  return (
    <Button
      ref={buttonRef}
      variant={variant}
      tone={attention ? "warning" : undefined}
      onClick={onClick}
      aria-label={name}
      title={empty ? "Set scopes" : summary}
      icon={
        empty || iconOnly ? (
          <Layers />
        ) : (
          <span className="flex shrink-0 items-center -space-x-0.5">
            {dots.map((s) => (
              <span key={s} className={cn("h-2 w-2 rounded-full ring-1 ring-card", s)} />
            ))}
          </span>
        )
      }
      iconEnd={iconOnly ? undefined : <SelectChevron size="sm" />}
      badge={iconOnly ? (empty ? attention : nodes.length) : undefined}
      className={cn("min-w-0", fill && "w-full", className)}
    >
      {iconOnly ? undefined : empty ? (
        // A phone header has no room for the words: the chip goes icon-only
        // (named by its aria-label), never a clipped "Se".
        <span className="max-[480px]:hidden @max-[20rem]/composer-meta:hidden">Set scopes</span>
      ) : (
        <span className="min-w-0 truncate">{summary}</span>
      )}
    </Button>
  );
}
