"use client";

import * as React from "react";
import { ChevronDown, FileCode2, Type } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { CopySplitButton, type SplitCopyFlavor } from "@ai-matrx/rich-content/copy/CopySplitButton";
import { copyRichContent } from "@ai-matrx/rich-content/copy/copy-commands";

export interface TextCopySplitProps {
  /** The markdown to copy (or a function reading it at click time). */
  text: string | (() => string);
  /** What is copied, for the button's name ("Copy message"). */
  label?: string;
  size?: "sm" | "xs";
  className?: string;
  disabled?: boolean;
}

/**
 * The split Copy for hosts whose copy has no Alchemy palette (a person's own chat message, a flashcard side,
 * the phone note dock): one click copies the person's flavor, the chevron offers markdown or plain text.
 * Both end in `copyRichContent` over the same text — the button and its menu cannot disagree.
 * Guard: components/matrx/buttons/__tests__/rich-copy-hosts.census.test.ts.
 */
export function TextCopySplit({ text, label = "Copy", size = "sm", className, disabled }: TextCopySplitProps) {
  const copy = React.useCallback(
    (flavor: SplitCopyFlavor) => copyRichContent(typeof text === "function" ? text() : text, flavor),
    [text],
  );
  return <CopySplitButton copy={copy} label={label} size={size} className={className} disabled={disabled} />;
}

export default TextCopySplit;

/**
 * The chevron half of the split Copy for a host whose main control is already a one-click tile (the phone
 * note dock): it sits on the tile's corner and offers Copy markdown / Copy plain text. Same copy module.
 */
export function TextCopyChevron({ text, label = "Copy", className }: { text: string | (() => string); label?: string; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const run = (flavor: SplitCopyFlavor) => {
    setOpen(false);
    void copyRichContent(typeof text === "function" ? text() : text, flavor);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: more ways to copy`}
          data-copy-split-more=""
          className={cn("absolute right-0 top-0 z-20 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground", className)}
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto min-w-48 p-1" data-copy-split-menu="">
        <div role="menu" aria-label="Copy as">
          <button type="button" role="menuitem" data-copy-flavor="markdown" onClick={() => run("markdown")} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent">
            <FileCode2 className="h-4 w-4 text-muted-foreground" />
            Copy markdown
          </button>
          <button type="button" role="menuitem" data-copy-flavor="text" onClick={() => run("text")} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent">
            <Type className="h-4 w-4 text-muted-foreground" />
            Copy plain text
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
