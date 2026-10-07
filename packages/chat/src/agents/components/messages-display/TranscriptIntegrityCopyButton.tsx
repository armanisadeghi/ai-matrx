"use client";

/**
 * Super-admin-only: one click copies the transcript integrity report for the
 * conversation on screen (see ./transcript-integrity-report.ts). Renders
 * nothing for everyone else. Also publishes the anomaly count to the admin
 * debug context so "Copy Full Context" carries the same facts.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { toast as copyToast } from "@/lib/toast";
import { useEffect } from "react";
import { usePathname } from "../../../host/navigation";
import { Stethoscope } from "lucide-react";
import { useAppSelector, useAppStore } from "../../../store/hooks";
import { selectMessageCount } from "../../redux/execution-system/messages/messages.selectors";
import { selectStreamPhase } from "../../redux/execution-system/selectors/aggregate.selectors";
import { toast } from "../../../host/notify";
import { useDebugContext } from "../../../host/prefs-react";
import { cn } from "@ai-matrx/design-system";
import {
  buildTranscriptIntegrityReport,
  formatTranscriptIntegrityReport,
} from "./transcript-integrity-report";
import { selectIsSuperAdmin } from "../../../host/identity";
import { Button } from "@ai-matrx/design-system/controls";

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
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? copyToast.error(message) : copyToast.success(message),
  });
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
      if (!(await copyText(formatTranscriptIntegrityReport(report)))) return;
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
    <Button variant="quiet" icon={<Stethoscope />} onClick={() => void copy()} title="Copy transcript integrity report (admin) — paste it to an agent when a message is missing" aria-label="Copy transcript integrity report" data-testid="transcript-integrity-copy" className="absolute top-2 right-4 z-10" />
  );
}
