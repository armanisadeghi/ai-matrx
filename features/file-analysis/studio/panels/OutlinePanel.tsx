/**
 * Right-rail Outline panel — TOC navigation. Thin wrapper over OutlineContent
 * so the rendering logic lives in one place + works in both the AnalysisTab
 * and the Studio.
 */

"use client";

import { Loader2 } from "lucide-react";
import { useFileAnalysis } from "@/features/file-analysis/hooks/useFileAnalysis";
import { OutlineContent } from "@/features/file-analysis/content/OutlineContent";

interface Props {
  fileId: string;
  onJumpToPage: (pageNumber: number, pageId?: string | null) => void;
}

export function OutlinePanel({ fileId, onJumpToPage }: Props) {
  const { data, loading } = useFileAnalysis(fileId);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading outline…
      </div>
    );
  }

  return (
    <div className="p-2">
      <OutlineContent
        results={data?.results ?? []}
        onJumpToPage={(p) => onJumpToPage(p, null)}
      />
    </div>
  );
}
