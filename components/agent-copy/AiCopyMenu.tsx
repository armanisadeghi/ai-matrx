"use client";

import { useAlchemyDisclosure } from "./useAlchemyDisclosure";
import type React from "react";
import {
  MatrxCopyMenu,
  type AlchemyCopyVariant,
  type AlchemyCustomSource,
  type MatrxCopyMenuProps,
} from "@ai-matrx/design-system/content-transfer";
import type { AgentCopyGroomerConfig } from "@/components/agent-copy/groomer-types";
import type { ExportItem } from "@/components/agent-copy/export";
import { sendRowsToSheetOutcome } from "@/components/agent-copy/useExportActions";

export type AiIconType = React.ComponentType<{ className?: string }>;
export type AiVariant = AlchemyCopyVariant;
export type AiCustomOption = AlchemyCustomSource["options"][number];
export type AiOptionValues = Record<string, boolean | number>;
export type AiCustomSource = AlchemyCustomSource;

/** Compatibility shape for internal callers while the package owns the menu. */
export interface AiCopyMenuProps extends Omit<
  MatrxCopyMenuProps,
  "aiVariants" | "aiCustom" | "export" | "agent" | "human" | "json"
> {
  variants: AiVariant[];
  custom?: AiCustomSource;
  groomer?: () => AgentCopyGroomerConfig;
  exportConfig?: {
    items: ExportItem[];
    sheetRows?: () => Array<Record<string, unknown>>;
  };
  /** Package placement is canonical; retained only for source compatibility. */
  align?: "start" | "end";
  /** The package owns the Alchemy trigger glyph. */
  triggerIcon?: AiIconType;
}

export function AiCopyMenu({
  variants,
  custom,
  groomer,
  exportConfig,
  align: _align,
  triggerIcon: _triggerIcon,
  ...props
}: AiCopyMenuProps) {
  useAlchemyDisclosure(!props.hide?.includes("ai"));
  return (
    <MatrxCopyMenu
      {...props}
      aiVariants={variants}
      aiCustom={custom}
      groomer={groomer}
      export={exportConfig}
      {...(exportConfig?.sheetRows
        ? { sendToSheet: sendRowsToSheetOutcome }
        : {})}
    />
  );
}
