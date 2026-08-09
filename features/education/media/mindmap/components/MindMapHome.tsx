"use client";

// features/education/media/mindmap/components/MindMapHome.tsx
//
// The list-first home for the Mind Maps tool. Lists every mind map the user owns
// or can see (RLS-filtered, recent-first) with a New button.
// React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Network, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { studyMediaService } from "../../service";
import type { StudyMediaRow } from "../../types";

export function MindMapHome() {
  const router = useRouter();
  const [rows, setRows] = useState<StudyMediaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    studyMediaService.listByKind("mind_map").then((res) => {
      if (!active) return;
      setRows(res.data ?? []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Mind Maps</h1>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => router.push("/education/mind-maps/new")}>
          <Plus className="h-4 w-4" />
          New mind map
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Visual concept maps from your material — the key ideas as nodes, their relationships as
        labeled connections.
      </p>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
          <Network className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No mind maps yet. Turn a deck or a topic into a visual concept map.
          </p>
          <Button size="sm" className="gap-1.5" onClick={() => router.push("/education/mind-maps/new")}>
            <Plus className="h-4 w-4" />
            New mind map
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              {/* A record with its own page — an anchor, not a <button>.
                  As a button the card navigated on click and offered nothing
                  else: no cmd-click, no middle-click, no new tab. */}
              <Link
                href={`/education/mind-maps/${row.id}`}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
              >
                <Network className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{row.title}</div>
                  {row.source_title && (
                    <div className="truncate text-[11px] text-muted-foreground">from {row.source_title}</div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
