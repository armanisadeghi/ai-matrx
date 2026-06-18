"use client";

import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface Props {
  /** Controlled open state. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Summary row shown when collapsed (and as the trigger label). */
  summary: React.ReactNode;
  /** Optional trailing content on the trigger row (badges, counts). */
  trailing?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /** When true, the trigger uses the compact pill style from orchestra.css. */
  pill?: boolean;
}

/**
 * Reusable fold/unfold section for live-pipeline surfaces. Completed work
 * collapses to a one-line summary; click to expand the full detail again.
 */
export function FoldableSection({
  open,
  onOpenChange,
  summary,
  trailing,
  children,
  className,
  contentClassName,
  pill = false,
}: Props) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className={className}>
      <CollapsibleTrigger
        className={cn(
          "group/trigger flex w-full items-center gap-2 text-left transition-colors",
          pill
            ? "orchestra-collapsed-pill justify-between"
            : "rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5 hover:bg-muted/40",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">{summary}</div>
        {trailing}
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className={cn("pt-2", contentClassName)}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
