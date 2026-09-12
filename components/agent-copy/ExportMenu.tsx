"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import {
  MatrxCopyMenu,
  type MatrxCopyMenuProps,
} from "@ai-matrx/design-system/content-transfer";
import type { ExportItem } from "@/components/agent-copy/export";
import { sendRowsToSheetOutcome } from "@/components/agent-copy/useExportActions";

export interface ExportMenuProps {
  label: string;
  items: ExportItem[];
  size?: MatrxCopyMenuProps["size"];
  appearance?: MatrxCopyMenuProps["appearance"];
  grouped?: boolean;
  disabled?: boolean;
  className?: string;
  sheetRows?: () => Array<Record<string, unknown>>;
}

/** Standalone exports use the same package menu and authenticated Sheet port. */
export function ExportMenu({
  label,
  items,
  size = "icon",
  appearance = "segmented",
  grouped = false,
  disabled = false,
  className,
  sheetRows,
}: ExportMenuProps) {
  const sourceId = useId();
  if (!items.length && !sheetRows) return null;
  return (
    <MatrxCopyMenu
      sourceId={`standalone-export:${sourceId}`}
      label={label}
      export={{ items, ...(sheetRows ? { sheetRows } : {}) }}
      sendToSheet={sendRowsToSheetOutcome}
      hide={["copy", "ai"]}
      disabled={disabled}
      size={size}
      appearance={appearance}
      grouped={grouped}
      className={cn("matrx-alchemy-export", className)}
    />
  );
}
