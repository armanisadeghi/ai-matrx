"use client";

// features/education/media/mindmap/components/MindMapHome.tsx
//
// The list-first home for the Mind Maps tool. Lists every mind map the user owns
// or can see (RLS-filtered, recent-first) with a New button.
// React Compiler is on: no manual memo.

import { useRead } from "@/components/read-state/useRead";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { Network, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationMindMapsScope } from "@/features/surfaces/manifests/education-mind-maps.manifest";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAccessToken,
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { authenticatedStudyMediaLoadKey } from "../../authLoad";
import { studyMediaService } from "../../service";
import type { StudyMediaRow } from "../../types";
import {
  distinctSourceTitle,
  EducationCollectionNoResults,
  EducationCollectionSearch,
  filterEducationCollection,
} from "@/features/education/components/EducationCollectionSearch";

export function MindMapHome() {
  const router = useRouter();
  // A persisted Redux identity can briefly precede Supabase's restored
  // browser session; firing the read before all three signals are ready
  // sends it as `anon`, which private study media refuses with 42501 —
  // "Couldn't load your mind maps" on every first load. Gate on the same
  // signal the library hook uses (see features/education/media/authLoad.ts).
  const authReady = useAppSelector(selectAuthReady);
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
  const loadKey = authenticatedStudyMediaLoadKey({ authReady, userId, accessToken });
  const read = useRead(
    async () => {
      const res = await studyMediaService.listByKind("mind_map");
      if (res.error) throw res.error;
      return res.data ?? [];
    },
    [loadKey],
    { enabled: loadKey !== null, initialData: [] as StudyMediaRow[] },
  );
  const rows = read.data ?? [];
  const loading = read.isLoading || loadKey === null;
  const [search, setSearch] = useState("");
  const filteredRows = filterEducationCollection(
    rows,
    search,
    (row) => [
      row.title,
      row.source_title,
      row.source_kind,
      row.status,
      row.description,
    ],
  );

  // Live surface scope for the Agents chrome (matrx-user/education-mind-maps,
  // list view). Synchronous over live render state — no fetch; the Surface
  // Context window polls this every 400ms. This mount registers NO write
  // handlers: search only filters loaded rows locally, so there is nothing here
  // an agent could stage.
  const getScope = () =>
    createEducationMindMapsScope({
      view: "list",
      maps_loaded: read.status === "ready" && loadKey !== null,
      ...(read.status !== "ready" || loadKey === null
        ? {}
        : {
            mind_map_count: rows.length,
            mind_maps: rows.map((row) => ({
              id: row.id,
              title: row.title,
              source_kind: row.source_kind,
              source_title: row.source_title,
              status: row.status,
              updated_at: row.updated_at,
            })),
          }),
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/education-mind-maps"
      getScope={getScope}
    >
    <EducationToolHeader title="Mind Maps" />
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <EducationCollectionSearch
          value={search}
          onValueChange={setSearch}
          label="mind maps"
        />
        <Button size="sm" className="gap-1.5" onClick={() => router.push("/education/mind-maps/new")}>
          <Plus className="h-4 w-4" />
          New mind map
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : read.isError && rows.length === 0 ? (
        <ReadFailure error={read.error} what="your mind maps" onRetry={read.retry} />
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
      ) : filteredRows.length === 0 ? (
        <EducationCollectionNoResults
          query={search}
          label="mind maps"
          onClear={() => setSearch("")}
        />
      ) : (
        <ul className="space-y-2">
          {filteredRows.map((row) => (
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
                  {distinctSourceTitle(row.title, row.source_title) && (
                    <div className="truncate text-[11px] text-muted-foreground">
                      from {distinctSourceTitle(row.title, row.source_title)}
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
