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

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { AlertCircle, Brain, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { Skeleton } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAccessToken,
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { useLoginHref } from "@/hooks/auth/useLoginHref";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  createEducationMemoryScope,
  type MemoryLibraryEntry,
} from "@/features/surfaces/manifests/education-memory.manifest";
import { authenticatedStudyMediaLoadKey } from "@/features/education/media/authLoad";
import { useStudyMediaLibrary } from "@/features/education/media/useStudyMediaLibrary";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { parseCreateMemoryAids, parseMemoryIds, parseUpdateMemoryAids } from "../memoryWrites";
import { studyMediaService } from "@/features/education/media/service";
import {
  distinctSourceTitle,
  EducationCollectionNoResults,
  EducationCollectionSearch,
  filterEducationCollection,
} from "@/features/education/components/EducationCollectionSearch";

const SURFACE_NAME = "matrx-user/education-memory";

export function MemoryHome() {
  const router = useRouter();
  const loginHref = useLoginHref();
  const authReady = useAppSelector(selectAuthReady);
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
  const loadKey = authenticatedStudyMediaLoadKey({
    authReady,
    userId,
    accessToken,
  });
  const library = useStudyMediaLibrary("memory_aid", loadKey);
  const rows = library.rows;
  const loading = !authReady || library.loading;
  const [search, setSearch] = useState("");
  const filteredRows = filterEducationCollection(
    rows,
    search,
    (row) => [row.title, row.source_title],
  );
  const owned = rows.filter((row) => row.created_by === userId);
  const getWriteHandlers = () => collectionWriteHandlers({
    plural: "memory_aids", singular: "memory aid",
    create: {
      parse: parseCreateMemoryAids,
      run: async (aid) => {
        const result = await studyMediaService.create({ mediaKind: "memory_aid", title: aid.title,
          irEnvelope: aid, status: "ready" });
        if (result.error || !result.data) throw new Error(result.error ?? "Could not create memory aid.");
        await library.retry();
        return { id: result.data.id, name: result.data.title };
      },
      nameOf: (aid) => aid.title,
    },
    update: {
      parse: (value) => parseUpdateMemoryAids(value, owned),
      run: async (plan) => {
        const result = await studyMediaService.updateVersioned(plan.id, plan.version, { title: plan.aid.title, ir_envelope: plan.aid });
        if (result.error || !result.data) throw new Error(result.error ?? "Could not update memory aid.");
        await library.retry();
        return { id: result.data.id, name: result.data.title };
      },
      nameOf: (plan) => plan.aid.title,
      changedOf: (plan) => plan.changed,
    },
    delete: {
      parse: (value) => parseMemoryIds(value, "delete_memory_aids", owned).map((id) => {
        const row = owned.find((candidate) => candidate.id === id);
        if (!row) throw new Error(`delete_memory_aids: ${id} is no longer available.`);
        return row;
      }),
      run: async (row) => {
        const result = await studyMediaService.softDelete(row.id);
        if (result.error) throw new Error(result.error);
        await library.retry();
        return { id: row.id, name: row.title };
      },
      nameOf: (row) => row.title,
    },
  }, refuseSurfaceWrite);

  // Read at trigger time, never from stale closure state.
  const buildScope = () =>
    createEducationMemoryScope({
      view: "list",
      library_loaded: library.loaded,
      ...(!library.loaded
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

  if (authReady && !loadKey) {
    return (
      <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={buildScope}>
        <EducationToolHeader title="Memory Aids" />
        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Sign in to view and create your memory aids.
            </p>
            <Button asChild className="mt-4" size="sm">
              <Link href={loginHref}>Sign in</Link>
            </Button>
          </div>
        </div>
      </SurfaceRuntimeProvider>
    );
  }

  return (
    <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={buildScope} getWriteHandlers={getWriteHandlers}>
    <EducationToolHeader title="Memory Aids" />
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <EducationCollectionSearch
          value={search}
          onValueChange={setSearch}
          label="memory aids"
        />
        <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => router.push("/education/memory/new/manual")}>
          <Plus className="mr-1 h-4 w-4" /> Write my own
        </Button>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => router.push("/education/memory/new")}
        >
          <Plus className="h-4 w-4" />
          New memory aid
        </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : library.error ? (
        <LibraryError error={library.error} onRetry={library.retry} />
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
      ) : filteredRows.length === 0 ? (
        <EducationCollectionNoResults
          query={search}
          label="memory aids"
          onClear={() => setSearch("")}
        />
      ) : (
        <ul className="space-y-2" data-surface-value="aid_library">
          {filteredRows.map((row) => (
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

function LibraryError({ onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/40 p-10 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-muted-foreground">Could not load memory aids right now.</p>
      <Button size="sm" onClick={onRetry}>Try again</Button>
      <ErrorAlchemyMenu />
    </div>
  );
}
