"use client";

import { lazy, Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/redux/hooks";
import type { ResearchDocument } from "../../types";

const ReactDiffViewer = lazy(() => import("react-diff-viewer-continued"));

interface VersionDiffProps {
  oldDoc: ResearchDocument;
  newDoc: ResearchDocument;
  onClose: () => void;
}

export function VersionDiff({ oldDoc, newDoc, onClose }: VersionDiffProps) {
  const mode = useAppSelector((s) => s.theme.mode);
  return (
    <div className="flex flex-col h-full min-h-0 p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7 rounded-full"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <h2 className="text-lg font-bold">Version Comparison</h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">v{oldDoc.version}</Badge>
          <span className="text-muted-foreground">&rarr;</span>
          <Badge variant="default">v{newDoc.version}</Badge>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <ReactDiffViewer
            oldValue={oldDoc.content}
            newValue={newDoc.content}
            splitView={false}
            useDarkTheme={mode === "dark"}
          />
        </Suspense>
      </div>
    </div>
  );
}
