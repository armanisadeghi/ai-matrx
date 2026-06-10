"use client";

// app/(core)/podcast/studio/create-e/_components/SourceRail.tsx
//
// The left rail — every source, grouped by HOW you bring content in, as a real
// labeled list (the Spotify/Notion "left navigation" pattern). Selecting one
// reshapes the center stage. No popover, no hiding — all 8 are first-class and
// visible at once, which is the point of a creator console.

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SOURCE_OPTIONS } from "@/features/podcasts/generator/constants";
import type { PodcastSourceKind } from "@/features/podcasts/generator/types";

// Group the flat source list into meaningful buckets by their control type.
const GROUPS: { label: string; kinds: PodcastSourceKind[] }[] = [
  { label: "Start fresh", kinds: ["topic"] },
  { label: "Paste content", kinds: ["partial_content", "full_content"] },
  { label: "From a link", kinds: ["file_url", "website_url", "youtube"] },
  { label: "From your library", kinds: ["note", "audio_file"] },
];

export function SourceRail({
  value,
  onChange,
}: {
  value: PodcastSourceKind;
  onChange: (kind: PodcastSourceKind) => void;
}) {
  return (
    <nav className="p-2.5">
      <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Source
      </p>
      <div className="space-y-3">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.kinds.map((kind) => {
                const opt = SOURCE_OPTIONS.find((o) => o.kind === kind)!;
                const Icon = opt.icon;
                const selected = value === kind;
                return (
                  <li key={kind}>
                    <button
                      type="button"
                      onClick={() => onChange(kind)}
                      aria-pressed={selected}
                      className={cn(
                        "group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                        selected
                          ? "bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
                          selected
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground group-hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {opt.label.replace(/^From (an? )?/i, "")}
                      </span>
                      {selected && (
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
