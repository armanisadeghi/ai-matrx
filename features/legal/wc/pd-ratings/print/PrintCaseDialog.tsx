"use client";

import { PrintOptionsDialog } from "@/features/chat/components/print/PrintOptionsDialog";
import { pdReportPrinter, type PdReportData } from "./pd-report-printer";

interface PrintCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PdReportData;
}

/**
 * Thin wrapper that imports the printer + the shared options dialog.
 * Mounted lazily (`next/dynamic`) by `PrintCaseButton` so neither the printer
 * code nor the dialog ship in the initial calculator bundle.
 */
export default function PrintCaseDialog({
  open,
  onOpenChange,
  data,
}: PrintCaseDialogProps) {
  return (
    <PrintOptionsDialog
      printer={pdReportPrinter}
      data={data}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
