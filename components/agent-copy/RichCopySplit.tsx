"use client";

import * as React from "react";
import type { ContentTransferController } from "@ai-matrx/alchemy/react/workspace";
import { CopySplitButton, type SplitCopyFlavor } from "@ai-matrx/rich-content/copy/CopySplitButton";
import { copyRichContent } from "@ai-matrx/rich-content/copy/copy-commands";
import { ExportPaletteAnchor } from "@ai-matrx/rich-content/copy/ExportPalette";
import { cn } from "@/lib/utils";
import { CopyButtons, type CopyButtonsProps } from "./CopyButtons";

export type RichCopySplitProps = CopyButtonsProps & { human: NonNullable<CopyButtonsProps["human"]> };

/**
 * THE split Copy of a markdown host (Arman, 2026-10-04: "one click to get either the markdown
 * version or the no-markup version"). One click copies the person's flavor (`copy.default_flavor`);
 * the chevron offers exactly Copy markdown and Copy plain text (2026-10-07). The Alchemy palette
 * (formatted, JSON, download, AI, the host's record copies) is "Export…" — the icon beside the
 * split, since these hosts have no rich-document ⋯ of their own. The button and the rows end in
 * `copyRichContent` over the same `human` — they cannot disagree.
 * Guard: components/matrx/buttons/__tests__/rich-copy-hosts.census.test.ts.
 */
export function RichCopySplit(props: RichCopySplitProps) {
  const { human, className, size } = props;
  const palette = React.useRef<ContentTransferController | null>(null);
  const copy = React.useCallback(
    (flavor: SplitCopyFlavor) => copyRichContent(typeof human === "function" ? human() : human, flavor),
    [human],
  );
  const splitSize = size === "xs" || size === "icon" ? "xs" : "sm";
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      <CopySplitButton copy={copy} size={splitSize} label={`Copy ${props.label ?? ""}`.trim()} />
      <ExportPaletteAnchor trigger controllerRef={palette} size={splitSize} label={props.label} />
      {/* richCopyFlavors={[]}: the split already offers Copy markdown / Copy plain text, so the
          palette behind Export… carries only what is unique to it (Formatted, JSON, download, AI) — once. */}
      <CopyButtons {...props} className={undefined} contentFlavor="markdown" richCopyFlavors={[]} triggerHidden controllerRef={palette} />
    </span>
  );
}
