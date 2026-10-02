"use client";

/**
 * Super-admin-only: one click copies the transcript integrity report for the
 * conversation on screen (see ./transcript-integrity-report.ts). Renders
 * nothing for everyone else. Also publishes the anomaly count to the admin
 * debug context so "Copy Full Context" carries the same facts.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Stethoscope } from "lucide-react";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { selectMessageCount } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectStreamPhase } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { writeClipboard } from "@/components/agent-copy/clipboard";
import { toast } from "@/lib/toast";
import { useDebugContext } from "@/hooks/useDebugContext";
import { cn } from "@/lib/utils";
import {
  buildTranscriptIntegrityReport,
  formatTranscriptIntegrityReport,
} from "./transcript-integrity-report";

interface TranscriptIntegrityCopyButtonProps {
  conversationId: string;
  surfaceKey: string;
  effectiveVisibleGroupLimit: number | null;
}

export function TranscriptIntegrityCopyButton(
  props: TranscriptIntegrityCopyButtonProps,
) {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  if (!isSuperAdmin) return null;
  return <TranscriptIntegrityCopyButtonInner {...props} />;
}

function TranscriptIntegrityCopyButtonInner({
  conversationId,
  surfaceKey,
  effectiveVisibleGroupLimit,
}: TranscriptIntegrityCopyButtonProps) {
  const store = useAppStore();
  const pathname = usePathname() ?? "";
  const messageCount = useAppSelector(selectMessageCount(conversationId));
  const phase = useAppSelector(selectStreamPhase(conversationId));
  const { publish, isActive } = useDebugContext("Transcript");

  useEffect(() => {
    if (!isActive) return;
    const report = buildTranscriptIntegrityReport(store.getState(), {
      conversationId,
      surfaceKey,
      pathname,
      effectiveVisibleGroupLimit,
    });
    publish({
      "Conversation": conversationId,
      "Loaded rows": report.spine.loadedRows,
      "Groups rendered": `${report.groups.filter((g) => g.rendered).length}/${report.groups.length}`,
      "Stream phase": report.request.streamPhase,
      "Anomalies": report.anomalies.length === 0 ? "none" : report.anomalies,
    });
  }, [
    isActive,
    publish,
    store,
    conversationId,
    surfaceKey,
    pathname,
    effectiveVisibleGroupLimit,
    messageCount,
    phase,
  ]);

  const copy = async () => {
    const report = buildTranscriptIntegrityReport(store.getState(), {
      conversationId,
      surfaceKey,
      pathname,
      effectiveVisibleGroupLimit,
    });
    try {
      await writeClipboard(formatTranscriptIntegrityReport(report));
      toast.success(
        report.anomalies.length === 0
          ? "Transcript report copied — no anomalies detected"
          : `Transcript report copied — ${report.anomalies.length} anomal${report.anomalies.length === 1 ? "y" : "ies"} flagged`,
      );
    } catch (err) {
      toast.error(
        `Could not copy the transcript report: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={cn(
        "absolute top-2 right-4 z-10 flex h-7 w-7 items-center justify-center rounded-full",
        "matrx-glass-thin-border text-muted-foreground/60 hover:text-foreground",
        "transition-colors",
      )}
      title="Copy transcript integrity report (admin) — paste it to an agent when a message is missing"
      aria-label="Copy transcript integrity report"
      data-testid="transcript-integrity-copy"
    >
      <Stethoscope className="h-3.5 w-3.5" />
    </button>
  );
}
