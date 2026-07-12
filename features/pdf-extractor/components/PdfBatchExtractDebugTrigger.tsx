"use client";

/**
 * Admin-only trigger for the PDF batch-extract debug window.
 *
 * Mounted at the pdf-extractor route root so it survives navigation from
 * `/tools/pdf-extractor` → `/tools/pdf-extractor/[id]` while extraction runs.
 */

import { useEffect, useRef } from "react";
import { Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  selectPdfBatchExtractDebugSelectedSession,
  selectPdfBatchExtractDebugSessions,
} from "@/features/pdf-extractor/state/pdfBatchExtractDebugSlice";
import { useOpenPdfBatchExtractDebugWindow } from "@/features/overlays/openers/pdfBatchExtractDebugWindow";
import { selectIsOverlayOpen } from "@/lib/redux/slices/overlaySlice";

interface PdfBatchExtractDebugTriggerProps {
  /** When true, auto-open the debug window once per new streaming session. */
  autoOpenOnStream?: boolean;
  className?: string;
}

export function PdfBatchExtractDebugTrigger({
  autoOpenOnStream = true,
  className,
}: PdfBatchExtractDebugTriggerProps) {
  const isAdmin = useAppSelector(selectIsAdmin);
  const openDebugWindow = useOpenPdfBatchExtractDebugWindow();
  const isOpen = useAppSelector((s) =>
    selectIsOverlayOpen(s, "pdfBatchExtractDebugWindow"),
  );
  const sessions = useAppSelector(selectPdfBatchExtractDebugSessions);
  const activeSession = useAppSelector(
    selectPdfBatchExtractDebugSelectedSession,
  );
  const lastAutoOpenedSessionId = useRef<string | null>(null);

  useEffect(() => {
    if (!isAdmin || !autoOpenOnStream) return;
    const streaming = sessions.find(
      (s) => s.status === "streaming" || s.status === "pending",
    );
    if (!streaming) return;
    if (lastAutoOpenedSessionId.current === streaming.id) return;
    lastAutoOpenedSessionId.current = streaming.id;
    openDebugWindow({ initialSessionId: streaming.id });
  }, [isAdmin, autoOpenOnStream, sessions, openDebugWindow]);

  if (!isAdmin) return null;

  const lineCount = activeSession?.lines.length ?? 0;
  const status = activeSession?.status;

  return (
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 border-dashed text-[10px] font-mono"
        onClick={() =>
          openDebugWindow({ initialSessionId: activeSession?.id ?? null })
        }
      >
        <Bug className="h-3 w-3" />
        {isOpen ? "Stream debug (open)" : "Stream debug"}
        {activeSession && (
          <span className="text-muted-foreground">
            · {status} · {lineCount} lines
          </span>
        )}
      </Button>
    </div>
  );
}
