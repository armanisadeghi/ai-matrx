"use client";

/**
 * Column 1 — the SHAPE. Compact selectable rows (not oversized cards: an
 * archetype is a one-line decision with a size hint), using the same
 * selected-state grammar as the plan tree: primary wash + 2px left rail +
 * heavier weight, clearly distinct from hover.
 */
import { Check } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { humanizeKey, type Archetype, type ExpandedArchetype } from "../archetypes";
import { SetupSection } from "./SetupSection";

export function SetupShapeColumn({
  archetypes,
  baseline,
  loading,
  selectedKey,
  committedKey,
  shadowed,
  onSelect,
}: {
  archetypes: Archetype[];
  /**
   * Each shape expanded at its own defaults, keyed by archetype. The summary
   * and the omits list are read from HERE, never off the raw config: a
   * selection-form archetype has no families until its concepts resolve.
   */
  baseline: Map<string, ExpandedArchetype | null>;
  loading: boolean;
  selectedKey: string | null;
  committedKey: string | null;
  /** Builtin keys an org profile overrides — said out loud, never hidden. */
  shadowed: string[];
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-3 md:h-full md:min-h-0 md:overflow-y-auto">
      <SetupSection title="Site shape">
        <p className="text-xs leading-relaxed text-muted-foreground">
          A shape is concepts and counts — not a design. Pick the one closest to
          this site, then tune the counts.
        </p>
      </SetupSection>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="space-y-1.5 rounded-md border border-border p-2.5"
            >
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      ) : archetypes.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-3">
          <p className="text-sm font-medium text-foreground">
            No site shapes available
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            The platform library lives on the system-org{" "}
            <code className="font-mono">plan.profile</code> row with vertical{" "}
            <code className="font-mono">platform-archetypes</code>. It is missing
            or empty — nothing can be scaffolded until it is seeded.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {archetypes.map((archetype) => {
            const selected = archetype.key === selectedKey;
            const committed = archetype.key === committedKey;
            const overrides = shadowed.includes(archetype.key);
            const expanded = baseline.get(archetype.key) ?? null;
            const families = (expanded?.families ?? [])
              .map((family) => `${family.label} × ${family.count}`)
              .join(" · ");
            // What the tier deliberately LEAVES OUT is the other half of the
            // decision — without it the menu only ever says yes.
            const omits = expanded?.omits ?? [];
            return (
              <li key={archetype.key}>
                <button
                  type="button"
                  onClick={() => onSelect(archetype.key)}
                  aria-pressed={selected}
                  className={cn(
                    "w-full rounded-md border border-l-2 px-2.5 py-2 text-left transition-colors",
                    selected
                      ? "border-border border-l-primary bg-primary/10"
                      : "border-border border-l-transparent hover:bg-accent",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        "text-sm leading-snug text-foreground",
                        selected ? "font-semibold" : "font-medium",
                      )}
                    >
                      {archetype.label}
                    </span>
                    <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground">
                      {archetype.pageEstimate || "—"}
                    </span>
                  </div>
                  {archetype.description ? (
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {archetype.description}
                    </p>
                  ) : null}
                  {families ? (
                    <p className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground">
                      {families}
                    </p>
                  ) : null}
                  {omits.length > 0 ? (
                    <p
                      className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/80"
                      title={`Left off this shape: ${omits.map(humanizeKey).join(", ")}`}
                    >
                      Leaves out {omits.map(humanizeKey).join(", ")}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] leading-none">
                    {committed ? (
                      <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 font-medium text-primary">
                        <Check className="h-3 w-3" />
                        Current shape
                      </span>
                    ) : null}
                    {archetype.source !== "builtin" ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                        from {archetype.source}
                      </span>
                    ) : null}
                    {overrides ? (
                      <span
                        className="rounded bg-warning/15 px-1.5 py-0.5 font-medium text-warning"
                        title="Your organization's profile overrides the platform archetype of this name."
                      >
                        overrides builtin
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
