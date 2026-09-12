"use client";

import {
  MatrxCopyMenu,
  type MatrxCopyMenuProps,
} from "@ai-matrx/design-system/content-transfer";
import { sendRowsToSheetOutcome } from "@/components/agent-copy/useExportActions";

import { useAlchemyDisclosure } from "@/components/agent-copy/useAlchemyDisclosure";

export type CopyButtonsProps = MatrxCopyMenuProps;

/** Existing caller contract over the package-owned content-transfer menu. */
export function CopyButtons(props: CopyButtonsProps) {
  useAlchemyDisclosure(!props.hide?.includes("ai"));
  return (
    <MatrxCopyMenu
      {...props}
      {...(props.export?.sheetRows
        ? { sendToSheet: sendRowsToSheetOutcome }
        : {})}
    />
  );
}
