"use client";

import React from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/styles/themes/utils";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";

/**
 * Inline renderer for `{{variable_name}}` tokens.
 *
 * Spacing invariants (MUST preserve):
 *  - Root element is a `<span>` with `display: inline` (not inline-block)
 *    so it never breaks line flow or grows its parent line box.
 *  - `font-size`, `font-weight`, and `line-height` inherit from the parent
 *    (paragraph, heading, list item, blockquote, table cell, etc.). No
 *    text-sizing classes are applied.
 *  - Visual distinction comes from background + inset ring only
 *    (`ring-inset` uses box-shadow → does not expand layout box).
 *  - Horizontal padding (`px-1`) + tiny margin (`mx-0.5`) add breathing
 *    room without affecting vertical rhythm.
 *
 * Data invariants:
 *  - The raw snake_case name lives on the DOM as `data-name` (set by the
 *    remark plugin) and is preserved on every re-render.
 *  - The pretty-cased label shown to the user is derived at render time
 *    and is never persisted anywhere.
 */

interface MatrxVariableInlineProps {
  "data-name"?: string;
  name?: string;
  children?: React.ReactNode;
}

export const MatrxVariableInline: React.FC<MatrxVariableInlineProps> = (
  props,
) => {
  const rawName = props["data-name"] ?? props.name ?? "";

  if (!rawName) {
    return null;
  }

  const prettyLabel = (humanizeIdentifier(rawName) || rawName);
  const tokenString = `{{${rawName}}}`;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span
          className={cn(
            "inline rounded px-1 mx-0.5",
            "bg-primary/50 text-foreground",
            "ring-1 ring-inset ring-primary/20",
            "hover:bg-primary/75 hover:ring-primary/85",
            "cursor-help transition-colors",
            "border border-dashed border-primary",
          )}
          data-name={rawName}
          data-matrx-variable=""
        >
          {prettyLabel}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="top"
        sideOffset={6}
        className="w-64 p-3 border border-border rounded-xl"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Variable
            </span>
          </div>

          <div className="text-sm font-semibold text-foreground leading-tight">
            {prettyLabel}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Token
            </span>
            <code className="font-mono text-[11px] bg-muted text-foreground px-1.5 py-0.5 rounded self-start break-all">
              {tokenString}
            </code>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Raw Name
            </span>
            <code className="font-mono text-[11px] text-muted-foreground self-start break-all">
              {rawName}
            </code>
          </div>

          <div className="text-[11px] text-muted-foreground pt-1.5 border-t border-border">
            More details coming soon.
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default MatrxVariableInline;
