/**
 * features/page-extraction/components/ExtractionsPane.tsx
 *
 * Top-level surface mounted as the "extractions" pane in the PDF
 * Extractor. Composes JobPicker + RunProgressBar + ResultsTable so the
 * PDF studio shell stays thin.
 */

"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { JobPicker } from "@/features/page-extraction/components/JobPicker";
import { RunProgressBar } from "@/features/page-extraction/components/RunProgressBar";
import { ResultsTable } from "@/features/page-extraction/components/ResultsTable";
import { selectSelectedJobForFile } from "@/features/page-extraction/redux/selectors";

export interface ExtractionsPaneProps {
  fileId: string | null;
  /** Current page in the PDF — used to optionally filter results. */
  activePage?: number | null;
  /** Hand a result row → make the PDF jump to that page. */
  onJumpToPage?: (page: number) => void;
}

export function ExtractionsPane({
  fileId,
  activePage,
  onJumpToPage,
}: ExtractionsPaneProps) {
  const jobId = useAppSelector((s) => selectSelectedJobForFile(s, fileId));

  return (
    <div className="flex flex-col h-full bg-card">
      <JobPicker fileId={fileId} />
      <RunProgressBar jobId={jobId} />
      <div className="flex-1 min-h-0">
        <ResultsTable
          jobId={jobId}
          pageNumber={activePage ?? null}
          onJumpToPage={onJumpToPage}
        />
      </div>
    </div>
  );
}
