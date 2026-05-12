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

import { useAppSelector } from "@/lib/redux/hooks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JobPicker } from "@/features/page-extraction/components/JobPicker";
import { RunProgressBar } from "@/features/page-extraction/components/RunProgressBar";
import { ResultsTable } from "@/features/page-extraction/components/ResultsTable";
import { ChunksTab } from "@/features/page-extraction/components/ChunksTab";
import { selectSelectedJobForFile } from "@/features/page-extraction/redux/selectors";
import { usePageRunsRealtime } from "@/features/page-extraction/hooks/usePageRunsRealtime";

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
  const jobId = useAppSelector((s) => selectSelectedJobForFile(s, fileId));

  // Realtime fallback: even if the SSE stream is interrupted, the
  // per-chunk state (raw_response, parsed_payload) lands via Realtime.
  usePageRunsRealtime({ fileId, jobId });

  return (
    <div className="flex flex-col h-full bg-card">
      <JobPicker fileId={fileId} />
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
          <ResultsTable
            jobId={jobId}
            pageNumber={activePage ?? null}
            onJumpToPage={onJumpToPage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
