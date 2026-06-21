"use client";

import { CompoundReferenceCopyButton } from "@/features/matrx-envelope/components/CompoundReferenceCopyButton";
import { buildWorkbookSheetReferenceFence } from "@/features/matrx-envelope/compoundReference";
import type { FUniver } from "@univerjs/presets";

type ActiveSheetInfo = { sheetId: string; sheetName?: string };

function readActiveSheet(api: FUniver | null): ActiveSheetInfo | null {
  if (!api) return null;
  try {
    const wb = (
      api as unknown as {
        getActiveWorkbook?: () =>
          | {
              getActiveSheet?: () => {
                getSheetId: () => string;
                getName?: () => string;
              } | null;
            }
          | undefined;
      }
    ).getActiveWorkbook?.();
    const sheet = wb?.getActiveSheet?.();
    if (!sheet) return null;
    const sheetId = sheet.getSheetId();
    if (!sheetId) return null;
    const sheetName = sheet.getName?.();
    return { sheetId, sheetName: sheetName?.trim() || undefined };
  } catch {
    return null;
  }
}

/** Copies a `workbook_sheet` reference for the currently active Univer tab. */
export function WorkbookSheetReferenceCopyButton({
  apiRef,
  workbookId,
  workbookName,
}: {
  apiRef: React.RefObject<FUniver | null>;
  workbookId: string;
  workbookName?: string;
}) {
  return (
    <CompoundReferenceCopyButton
      size="sm"
      title="Copy reference for active sheet"
      toastLabel={workbookName ? `${workbookName} (active sheet)` : "Active sheet"}
      buildFence={() => {
        const sheet = readActiveSheet(apiRef.current);
        if (!sheet) return null;
        return buildWorkbookSheetReferenceFence({
          workbookId,
          sheetId: sheet.sheetId,
          sheetName: sheet.sheetName,
          workbookName,
        });
      }}
    />
  );
}
