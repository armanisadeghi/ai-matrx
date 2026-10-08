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
import { FileText, Plus } from "lucide-react";
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
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationSummariesScope } from "@/features/surfaces/manifests/education-summaries.manifest";
import { collectionWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { parseCreateSummaries, parseSummaryIds, parseUpdateSummaries } from "../summaryWrites";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

export function SummaryHome() {
  const userId = useAppSelector(selectUserId);
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
            version: r.version,
            title: r.title,
            source_title: r.source_title,
            source_kind: r.source_kind,
            status: r.status,
          })),
    });
  const getWriteHandlers = () => collectionWriteHandlers({
    plural: "summaries", singular: "summary",
    create: {
      parse: parseCreateSummaries,
      run: async (summary) => {
        const result = await studyMediaService.create({ mediaKind: "summary", title: summary.title, irEnvelope: summary, status: "ready" });
        if (result.error || !result.data) throw new Error(result.error ?? "Could not create summary.");
        await read.retry();
        return { id: result.data.id, name: result.data.title };
      }, nameOf: (summary) => summary.title,
    },
    update: {
      parse: (value) => parseUpdateSummaries(value, rows),
      run: async (plan) => {
        const result = await studyMediaService.updateVersioned(plan.id, plan.version, { title: plan.summary.title, ir_envelope: plan.irEnvelope, trust: plan.trust });
        if (result.error || !result.data) throw new Error(result.error ?? "Could not update summary.");
        await read.retry();
        return { id: result.data.id, name: result.data.title };
      }, nameOf: (plan) => plan.summary.title, changedOf: (plan) => plan.changed,
    },
    delete: {
      parse: (value) => parseSummaryIds(value, "delete_summaries", rows.filter((row) => row.created_by === userId)).map((id) => {
        const row = rows.find((candidate) => candidate.id === id && candidate.created_by === userId);
        if (!row) throw new Error(`Summary ${id} is no longer available.`);
        return row;
      }),
      run: async (row) => {
        const result = await studyMediaService.softDelete(row.id);
        if (result.error) throw new Error(result.error);
        await read.retry();
        return { id: row.id, name: row.title };
      }, nameOf: (row) => row.title,
    },
  }, refuseSurfaceWrite);

  return (
    <SurfaceRuntimeProvider surfaceName="matrx-user/education-summaries" getScope={getScope} getWriteHandlers={getWriteHandlers}>
      <EducationToolHeader title="Study Summaries" />
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <EducationCollectionSearch
            value={search}
            onValueChange={setSearch}
            label="study summaries"
          />
          <div className="flex gap-2"><Button asChild variant="outline"><Link href="/education/kits/new"><AGENT_ICON className="h-4 w-4" />Summarize something</Link></Button><Button variant="primary" asChild><Link href="/education/summaries/new"><Plus className="h-4 w-4" />New summary</Link></Button></div>
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
            <Button variant="primary" asChild>
              <Link href="/education/kits/new">
                <AGENT_ICON className="h-4 w-4" />
                Create a study kit
              </Link>
            </Button>
            <Button asChild variant="outline"><Link href="/education/summaries/new"><Plus className="h-4 w-4" />Write a summary</Link></Button>
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
