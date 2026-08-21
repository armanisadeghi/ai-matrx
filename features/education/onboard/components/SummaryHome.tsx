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

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, BrainCircuit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { studyMediaService } from "@/features/education/media/service";
import type { StudyMediaRow } from "@/features/education/media/types";

export function SummaryHome() {
  const [rows, setRows] = useState<StudyMediaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    studyMediaService.listByKind("summary").then((res) => {
      if (!active) return;
      setRows(res.data ?? []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <EducationToolHeader title="Study Summaries" />
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-8">
        <div className="flex items-center justify-end">
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/education/start">
              <BrainCircuit className="h-4 w-4" />
              Summarize something
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No summaries yet. Drop in a PDF, a lecture, or your notes and the
              kit builder writes a grounded summary with its sources attached.
            </p>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/education/start">
                <BrainCircuit className="h-4 w-4" />
                Create a study kit
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
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
    </>
  );
}
