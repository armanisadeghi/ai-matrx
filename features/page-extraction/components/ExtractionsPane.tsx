/**
 * features/page-extraction/components/ExtractionsPane.tsx
 *
 * Top-level surface mounted as the "extractions" pane in the PDF Extractor.
 * Two tabs:
 *
 *   ┌──────────────┬─────────────┐
 *   │ Chunks (input) │ Results (output)
 *   └──────────────┴─────────────┘
 *
 * - Chunks tab: visualizes the user's chunking config — every chunk that
 *   WOULD be sent to the agent, with stats, content, and per-variation
 *   char breakdowns. Live, no run needed.
 *
 * - Results tab: the structured rows the agent has emitted, joined back
 *   to the originating pages.
 *
 * The JobPicker stays at the top for switching between saved runs; the
 * RunProgressBar reacts to any active run on the currently-selected Job.
 */

"use client";

import Link from "next/link";
import { Maximize2 } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JobPicker } from "@/features/page-extraction/components/JobPicker";
import { RunProgressBar } from "@/features/page-extraction/components/RunProgressBar";
import { ResultsTable } from "@/features/page-extraction/components/ResultsTable";
import { ChunksTab } from "@/features/page-extraction/components/ChunksTab";
import { selectViewedJobForFile } from "@/features/page-extraction/redux/selectors";
import { EXTRACTIONS_ALL_VIEW } from "@/features/page-extraction/redux/pageExtractionSlice";
import { usePageRunsRealtime } from "@/features/page-extraction/hooks/usePageRunsRealtime";
import { usePersistedRunHydration } from "@/features/page-extraction/hooks/usePersistedRunHydration";

export interface ExtractionsPaneProps {
  fileId: string | null;
  /** processed_documents.id — needed to load page text for the chunk preview. */
  processedDocumentId: string | null;
  /** Current page in the PDF — used to optionally filter results. */
  activePage?: number | null;
  /** Click a result row or chunk header → jump the synced panes. */
  onJumpToPage?: (page: number) => void;
}

export function ExtractionsPane({
  fileId,
  processedDocumentId,
  activePage,
  onJumpToPage,
}: ExtractionsPaneProps) {
  // This pane shows the DATA view (chunks preview, results, run progress)
  // for whichever job the user has picked in the JobPicker dropdown.
  // It deliberately uses `viewedJobByFile` (with fallback to
  // `selectedJobByFile`) so the user can browse past run data without
  // pulling the right inspector's sidebar along — they can be looking
  // at template B's results while building a new template in the
  // sidebar. See pageExtractionSlice for the full rationale.
  const jobId = useAppSelector((s) => selectViewedJobForFile(s, fileId));

  // Realtime fallback: even if the SSE stream is interrupted, the
  // per-chunk state (raw_response, parsed_payload) lands via Realtime.
  usePageRunsRealtime({ fileId, jobId });

  // Reload fallback: after a full page reload the in-memory run state is
  // gone, so rehydrate the viewed job's latest run from the persisted
  // page_runs. This restores the Chunks tab's per-chunk Agent-output
  // overlay — and the connection between each row and its source pages —
  // instead of showing only the input preview.
  usePersistedRunHydration({ fileId, jobId });

  // The cramped pane is a quick-glance surface; the full review/management
  // workspace lives at /knowledge/extractions. Deep-link to the selected
  // dataset when a real template is viewed, else the cross-document catalog.
  const fullViewHref =
    jobId && jobId !== EXTRACTIONS_ALL_VIEW
      ? `/knowledge/extractions/${jobId}`
      : "/knowledge/extractions";

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <JobPicker fileId={fileId} />
        </div>
        <Link
          href={fullViewHref}
          title="Open full extraction workspace"
          className="mr-2 inline-flex h-6 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Maximize2 className="h-3 w-3" />
          <span className="hidden xl:inline">Full view</span>
        </Link>
      </div>
      <RunProgressBar jobId={jobId} />

      <Tabs defaultValue="chunks" className="flex-1 min-h-0 flex flex-col">
        <TabsList className="shrink-0 mx-2 mt-2 grid grid-cols-2 h-7 text-[10px]">
          <TabsTrigger value="chunks" className="text-[10px]">
            Chunks
          </TabsTrigger>
          <TabsTrigger value="results" className="text-[10px]">
            Results
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="chunks"
          className="flex-1 min-h-0 mt-1 data-[state=inactive]:hidden"
        >
          {fileId ? (
            <ChunksTab
              fileId={fileId}
              processedDocumentId={processedDocumentId}
              onJumpToPage={onJumpToPage}
            />
          ) : (
            <div className="p-4 text-[11px] text-muted-foreground">
              Load a document to see chunks.
            </div>
          )}
        </TabsContent>
        <TabsContent
          value="results"
          className="flex-1 min-h-0 mt-1 data-[state=inactive]:hidden"
        >
          {/* Show ALL results for the template. Filtering to the current
              page hid every row when the user was on page 1 and findings
              were on pages 11+. Click a row to jump instead.
              `fileId` is required for the All-view path, which fetches
              every result row across every template. */}
          <ResultsTable
            jobId={jobId}
            fileId={fileId}
            onJumpToPage={onJumpToPage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
