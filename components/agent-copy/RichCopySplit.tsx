"use client";

import * as React from "react";
import type { ContentTransferController } from "@ai-matrx/alchemy/react/workspace";
import { CopySplitButton, type SplitCopyFlavor } from "@ai-matrx/rich-content/copy/CopySplitButton";
import { copyRichContent } from "@ai-matrx/rich-content/copy/copy-commands";
import { cn } from "@/lib/utils";
import { CopyButtons, type CopyButtonsProps } from "./CopyButtons";

export type RichCopySplitProps = CopyButtonsProps & { human: NonNullable<CopyButtonsProps["human"]> };

/**
 * THE split Copy over a markdown host's Alchemy menu (Arman, 2026-10-04: "one click to get either
 * the markdown version or the no-markup version"). One click copies the person's flavor
 * (`copy.default_flavor`); the chevron offers Copy markdown and Copy plain text, then the Alchemy
 * palette (formatted, download, AI) below them. The button, the two rows and the palette's copy
 * tiles all end in `copyRichContent` over the same `human` — they cannot disagree.
 * Guard: components/matrx/buttons/__tests__/rich-copy-hosts.census.test.ts.
 */
export function RichCopySplit(props: RichCopySplitProps) {
  const { human, className, size } = props;
  const palette = React.useRef<ContentTransferController | null>(null);
  const copy = React.useCallback(
    (flavor: SplitCopyFlavor) => copyRichContent(typeof human === "function" ? human() : human, flavor),
    [human],
  );
  const mountMore = React.useCallback((element: HTMLElement | null, close: () => void) => {
    palette.current?.mountPalette(element, close);
  }, []);
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      <CopySplitButton copy={copy} size={size === "xs" || size === "icon" ? "xs" : "sm"} label={`Copy ${props.label ?? ""}`.trim()} mountMore={mountMore} />
      <CopyButtons {...props} className={undefined} contentFlavor="markdown" triggerHidden controllerRef={palette} />
    </span>
  );
}
