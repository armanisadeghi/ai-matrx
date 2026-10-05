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
  className,
}: LensChipProps) {
  const dots = swatches(nodes);
  const empty = nodes.length === 0;
  const summary = summarizeLensSelection(nodes);
  const name = empty ? "Set scopes" : `Scopes: ${summary}`;
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={name}
      title={empty ? "Set scopes" : summary}
      className={cn(
        "inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-2.5 text-xs text-foreground hover:bg-muted",
        fill && "w-full",
        iconOnly && "relative w-7 shrink-0 justify-center px-0",
        attention &&
          "border-amber-500/60 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400",
        // Icon-only on a phone (below): a round 28px button that never shrinks away.
        empty && "max-[480px]:w-7 max-[480px]:shrink-0 max-[480px]:justify-center max-[480px]:px-0",
        // The same fold inside a narrow composer meta row (container query).
        empty && "@max-[20rem]/composer-meta:w-7 @max-[20rem]/composer-meta:shrink-0 @max-[20rem]/composer-meta:justify-center @max-[20rem]/composer-meta:px-0",
        className,
      )}
    >
      {iconOnly ? (
        <>
          <Layers
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              attention ? "text-amber-500" : "text-muted-foreground",
            )}
          />
          {!empty && (
            <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold leading-none text-primary-foreground">
              {nodes.length}
            </span>
          )}
          {attention && empty && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
          )}
        </>
      ) : empty ? (
        <>
          <Layers
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              attention ? "text-amber-500" : "text-muted-foreground",
            )}
          />
          {/* A phone header has no room for the words: the chip goes
              icon-only (named by its aria-label), never a clipped "Se". */}
          <span
            className={cn(
              "min-w-0 truncate max-[480px]:hidden @max-[20rem]/composer-meta:hidden",
              !attention && "text-muted-foreground",
            )}
          >
            Set scopes
          </span>
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
          <span className="min-w-0 truncate">{summary}</span>
        </>
      )}
      {!iconOnly && (
        <SelectChevron
          size="sm"
          className={cn(fill && "ml-auto", empty && "max-[480px]:hidden")}
        />
      )}
    </button>
  );
}
