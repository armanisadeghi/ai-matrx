"use client";

// features/education/onboard/components/SummaryHome.tsx
//
// The list-first home for Study Summaries — `/education/summaries`, the index
// that closes the Door Law gap where this tool had only an `[id]` leaf and the
// bare URL 404'd. Summaries were reachable ONLY from a converter result link,
// so a learner who closed that tab could never find them again.
//
// Mirrors MemoryHome / MindMapHome: every summary the caller owns or can see
// (`education.study_media`, media_kind='summary'), RLS-filtered, recent-first.
//
// There is no `/new` route by design — a summary is produced by the ingest
// converter, so the empty state sends the learner to the kit builder rather
// than to a create form that does not exist.

import { useRead } from "@/components/read-state/useRead";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import Link from "next/link";
import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { studyMediaService } from "@/features/education/media/service";
import type { StudyMediaRow } from "@/features/education/media/types";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import {
  EducationCollectionNoResults,
  EducationCollectionSearch,
  filterEducationCollection,
} from "@/features/education/components/EducationCollectionSearch";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationSummariesScope } from "@/features/surfaces/manifests/education-summaries.manifest";

export function SummaryHome() {
  const read = useRead(
    async () => {
      const res = await studyMediaService.listByKind("summary");
      if (res.error) throw res.error;
      return res.data ?? [];
    },
    [],
    { initialData: [] as StudyMediaRow[] },
  );
  const rows = read.data ?? [];
  const loading = read.isLoading;
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

  const getScope = () =>
    createEducationSummariesScope({
      view: "list",
      summaries_loaded: !loading,
      summary_count: loading ? undefined : rows.length,
      summaries: loading
        ? undefined
        : rows.map((r) => ({
            id: r.id,
            title: r.title,
            source_title: r.source_title,
            source_kind: r.source_kind,
            status: r.status,
          })),
    });

  return (
    <SurfaceRuntimeProvider surfaceName="matrx-user/education-summaries" getScope={getScope}>
      <EducationToolHeader title="Study Summaries" />
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <EducationCollectionSearch
            value={search}
            onValueChange={setSearch}
            label="study summaries"
          />
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/education/start">
              <AGENT_ICON className="h-4 w-4" />
              Summarize something
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : read.isError && rows.length === 0 ? (
          <ReadFailure error={read.error} what="your summaries" onRetry={read.retry} />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No summaries yet. Drop in a PDF, a lecture, or your notes and the
              kit builder writes a grounded summary with its sources attached.
            </p>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/education/start">
                <AGENT_ICON className="h-4 w-4" />
                Create a study kit
              </Link>
            </Button>
          </div>
        ) : filteredRows.length === 0 ? (
          <EducationCollectionNoResults
            query={search}
            label="study summaries"
            onClear={() => setSearch("")}
          />
        ) : (
          <ul className="space-y-2">
            {filteredRows.map((row) => (
              <li key={row.id}>
                {/* A record with its own page — an anchor, so cmd-click and
                    middle-click open it in a new tab (Door Law). */}
                <Link
                  href={`/education/summaries/${row.id}`}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
                >
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
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
