"use client";

// components/rich-editor/panels/OutlinePanel.tsx
//
// The live outline: every heading of the text, indented by level, updating as
// the person types. Click to jump; the link icon copies a link to that
// heading (its id is the slug the rendered page uses).

import { Link2, ListTree } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { OutlineEntry } from "../core/outline";

export function OutlinePanel({
  entries,
  onJump,
  className,
}: {
  entries: readonly OutlineEntry[];
  onJump: (entry: OutlineEntry) => void;
  className?: string;
}) {
  const minLevel = Math.min(...entries.map((entry) => entry.level), 6);
  const copyLink = async (entry: OutlineEntry) => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${entry.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Link to “${entry.text}” copied.`);
    } catch {
      toast.error("Copy failed — your browser blocked clipboard access.");
    }
  };
  return (
    <nav aria-label="Outline" className={cn("flex h-full flex-col overflow-hidden", className)}>
      <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <ListTree className="h-3.5 w-3.5" /> Outline
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4">
        {entries.length === 0 && (
          <p className="px-2 text-xs text-muted-foreground">Headings you add appear here. Type “# ” at the start of a line, or use / → Heading.</p>
        )}
        {entries.map((entry, index) => (
          <div key={`${entry.slug}-${index}`} className="group/outline flex items-center">
            <button
              type="button"
              onClick={() => onJump(entry)}
              className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
              style={{ paddingLeft: `${0.5 + (entry.level - minLevel) * 0.75}rem` }}
              title={entry.text}
            >
              {entry.text || "(empty heading)"}
            </button>
            <button
              type="button"
              aria-label={`Copy link to ${entry.text}`}
              onClick={() => void copyLink(entry)}
              className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover/outline:opacity-100 focus:opacity-100"
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </nav>
  );
}
