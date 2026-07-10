// features/education/notes/GeneratedArtifactsChips.tsx
//
// Reverse-lineage strip: every study artifact generated FROM this note, shown as
// clickable chips ("generated from this"). Reads the incoming `source` edges via
// the canonical association system (features/education/notes/service). Lineage is
// visible both directions — the artifact links back to the note, the note lists
// its artifacts.

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, ListChecks, FileText, Network, Headphones, StickyNote, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { listGeneratedFromNote, type GeneratedArtifact } from "./service";
import type { TargetKind } from "@/features/education/convert/types";

const KIND_ICON: Record<TargetKind, typeof Layers> = {
  deck: Layers,
  quiz: ListChecks,
  practice_test: ListChecks,
  summary: FileText,
  mind_map: Network,
  audio: Headphones,
  notes: StickyNote,
};

function iconFor(a: GeneratedArtifact): typeof Layers {
  if (a.targetKind && KIND_ICON[a.targetKind]) return KIND_ICON[a.targetKind];
  if (a.artifactType === "fc_set") return Layers;
  if (a.artifactType === "note") return StickyNote;
  return Sparkles;
}

export function GeneratedArtifactsChips({
  noteId,
  refreshKey,
  className,
}: {
  noteId: string;
  /** Bump to re-fetch after a new conversion. */
  refreshKey?: number;
  className?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<GeneratedArtifact[]>([]);

  useEffect(() => {
    let active = true;
    void listGeneratedFromNote(noteId).then((rows) => {
      if (active) setItems(rows);
    });
    return () => {
      active = false;
    };
  }, [noteId, refreshKey]);

  if (items.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="text-[11px] font-medium text-muted-foreground">
        Generated from this:
      </span>
      {items.map((a) => {
        const Icon = iconFor(a);
        return (
          <button
            key={a.edgeId}
            type="button"
            onClick={() => router.push(a.href)}
            title={a.detail ? `${a.title} · ${a.detail}` : a.title}
            className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <Icon className="h-3 w-3 shrink-0 text-primary" />
            <span className="truncate">{a.title}</span>
          </button>
        );
      })}
    </div>
  );
}
