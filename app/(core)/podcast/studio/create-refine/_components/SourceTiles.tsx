"use client";

// app/(core)/podcast/studio/create-refine/_components/SourceTiles.tsx
//
// The refined SOURCE picker (brief point 1): SQUARE, smaller tiles in a SINGLE
// row, with the less-common sources revealed via a "More sources" expander so
// nothing is ever lost. No tile ever takes more than one row.
//
// The first row shows the four primary sources (topic / rough notes / full
// script / website). The rest live behind "More sources" and expand inline — the
// "show more without losing them" mechanism. The selected helper line sits below
// the grid (a single fixed line) so the grid height never changes.
//
// Pure presentation over the already-wired SOURCE_OPTIONS — it selects a real
// PodcastSourceKind; the parent owns the request.

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SOURCE_OPTIONS } from "@/features/podcasts/generator/constants";
import type { PodcastSourceKind } from "@/features/podcasts/generator/types";

// The four primary sources lead; the rest are behind the expander. Order is the
// product's recommended first-choice order.
const PRIMARY: PodcastSourceKind[] = [
  "topic",
  "partial_content",
  "full_content",
  "website_url",
];

const primaryOptions = PRIMARY.map(
  (k) => SOURCE_OPTIONS.find((o) => o.kind === k)!,
);
const moreOptions = SOURCE_OPTIONS.filter((o) => !PRIMARY.includes(o.kind));

interface SourceTilesProps {
  value: PodcastSourceKind;
  onChange: (kind: PodcastSourceKind) => void;
}

export function SourceTiles({ value, onChange }: SourceTilesProps) {
  // Auto-open the drawer if the active source lives inside it (e.g. on return).
  const [open, setOpen] = useState(() =>
    moreOptions.some((o) => o.kind === value),
  );
  const active = SOURCE_OPTIONS.find((o) => o.kind === value)!;

  return (
    <div className="space-y-2.5">
      {/* Primary row — 4 square tiles, one row at every breakpoint. */}
      <div className="grid grid-cols-4 gap-2.5">
        {primaryOptions.map((opt) => (
          <Tile
            key={opt.kind}
            kind={opt.kind}
            label={opt.label}
            Icon={opt.icon}
            selected={value === opt.kind}
            onSelect={onChange}
          />
        ))}
      </div>

      {/* "Show more without losing them" — the rest expand inline. */}
      {moreOptions.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            More sources
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
          <div
            className={cn(
              "grid grid-cols-4 gap-2.5 overflow-hidden transition-all duration-300",
              open ? "mt-1 max-h-72 opacity-100" : "max-h-0 opacity-0",
            )}
          >
            {moreOptions.map((opt) => (
              <Tile
                key={opt.kind}
                kind={opt.kind}
                label={opt.label}
                Icon={opt.icon}
                selected={value === opt.kind}
                onSelect={onChange}
              />
            ))}
          </div>
        </div>
      )}

      {/* The selected source's helper — a single line, so the grid never grows. */}
      <p className="px-0.5 text-xs leading-snug text-muted-foreground">
        <span className="font-medium text-foreground">{active.label}.</span>{" "}
        {active.helper}
      </p>
    </div>
  );
}

function Tile({
  kind,
  label,
  Icon,
  selected,
  onSelect,
}: {
  kind: PodcastSourceKind;
  label: string;
  Icon: (typeof SOURCE_OPTIONS)[number]["icon"];
  selected: boolean;
  onSelect: (kind: PodcastSourceKind) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(kind)}
      aria-pressed={selected}
      title={label}
      className={cn(
        "group relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center transition-all",
        selected
          ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
          : "border-border bg-card hover:border-primary/30 hover:bg-accent/40",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
          selected
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground group-hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span
        className={cn(
          "line-clamp-2 text-[11px] font-medium leading-tight",
          selected ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </button>
  );
}
