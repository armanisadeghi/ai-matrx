"use client";

// features/vision-interview/components/DocumentPane.tsx
//
// The center pane: the living document (interview.session.document — written
// ONLY by the Scribe's scribe_apply step; read-only here) rendered through the
// canonical markdown front door, plus the revision count.

import { FileText, History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { RichDocument } from "@/features/rich-document/RichDocument";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectRevisions,
  selectRoomHydrated,
  selectRoomSession,
} from "../redux/vision-interview.slice";

export function DocumentPane() {
  const session = useAppSelector(selectRoomSession);
  const hydrated = useAppSelector(selectRoomHydrated);
  const revisions = useAppSelector(selectRevisions);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-background/60 px-3 py-1">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="text-xs font-medium text-foreground">
          Living document
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
          <History className="h-3 w-3" aria-hidden />
          {revisions.length} revision{revisions.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!hydrated ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : session?.document?.trim() ? (
          <RichDocument
            content={session.document}
            source={{ type: "raw" }}
            hideCopyButton={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              The Scribe writes here after each round — nothing captured yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
