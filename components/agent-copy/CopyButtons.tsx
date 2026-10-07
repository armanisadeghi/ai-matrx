"use client";

import {
  MatrxCopyMenu,
  type MatrxCopyMenuProps,
} from "@ai-matrx/alchemy/react/workspace";
import { sendRowsToSheetOutcome } from "@/components/agent-copy/useExportActions";

import { copyRichContent } from "@/components/agent-copy/copy-commands";
import { useAlchemyDisclosure } from "@/components/agent-copy/useAlchemyDisclosure";

export type CopyButtonsProps = MatrxCopyMenuProps;

/**
 * Existing caller contract over the package-owned content-transfer menu. A caller whose `human` is
 * markdown passes `contentFlavor="markdown"`; the click and both panel choices then run THE rich
 * copy (`copyRichContent`), the same one every other rich-content surface uses.
 */
export function CopyButtons(props: CopyButtonsProps) {
  useAlchemyDisclosure(!props.hide?.includes("ai"));
  return (
    <MatrxCopyMenu
      {...props}
      {...(props.contentFlavor === "markdown" && !props.richCopy
        ? { richCopy: (markdown: string, flavor: "default" | "markdown" | "text") => copyRichContent(markdown, flavor) }
        : {})}
      {...(props.export?.sheetRows
        ? { sendToSheet: sendRowsToSheetOutcome }
        : {})}
    />
  );
}
