"use client";

// features/education/memory/components/MemoryHome.tsx
//
// The list-first home for the Memory Tools (VISION §11). Lists every memory-aid
// set the user owns or can see (RLS-filtered, recent-first) with a New button.
// Mirrors MindMapHome. React Compiler is on: no manual memo.
//
// Emits the `list` view of the `matrx-user/education-memory` surface. The route
// has been mapped to that surface since the tool shipped, but nothing mounted a
// runtime — so agents run from the Agents popover here launched with an empty
// application scope. See education-memory.manifest.ts.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brain, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  createEducationMemoryScope,
  type MemoryLibraryEntry,
} from "@/features/surfaces/manifests/education-memory.manifest";
import { studyMediaService } from "@/features/education/media/service";
import type { StudyMediaRow } from "@/features/education/media/types";

const SURFACE_NAME = "matrx-user/education-memory";

export function MemoryHome() {
  const router = useRouter();
  const [rows, setRows] = useState<StudyMediaRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Read at trigger time, never from stale closure state.
  const buildScope = () =>
    createEducationMemoryScope({
      view: "list",
      library_loaded: !loading,
      ...(loading
        ? {}
        : {
            aid_count: rows.length,
            aid_library: rows.map(
              (r): MemoryLibraryEntry => ({
                id: r.id,
                title: r.title,
                source_title: r.source_title,
              }),
            ),
          }),
    });

  useEffect(() => {
    let active = true;
    studyMediaService.listByKind("memory_aid").then((res) => {
      if (!active) return;
      setRows(res.data ?? []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={buildScope}>
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Memory Aids</h1>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => router.push("/education/memory/new")}
        >
          <Plus className="h-4 w-4" />
          New memory aid
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Mnemonics, analogies, and memory-palace scaffolds from your material — turn
        hard-to-retain lists and abstract concepts into things that stick.
      </p>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
          <Brain className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No memory aids yet. Turn a deck or a topic into mnemonics, analogies,
            and a memory palace.
          </p>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => router.push("/education/memory/new")}
          >
            <Plus className="h-4 w-4" />
            New memory aid
          </Button>
        </div>
      ) : (
        <ul className="space-y-2" data-surface-value="aid_library">
          {rows.map((row) => (
            <li key={row.id}>
              {/* A record with its own page — an anchor, not a <button>.
                  As a button the card navigated on click and offered nothing
                  else: no cmd-click, no middle-click, no new tab. */}
              <Link
                href={`/education/memory/${row.id}`}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
              >
                <Brain className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {row.title}
                  </div>
                  {row.source_title && (
                    <div className="truncate text-[11px] text-muted-foreground">
                      from {row.source_title}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
    </SurfaceRuntimeProvider>
  );
}
