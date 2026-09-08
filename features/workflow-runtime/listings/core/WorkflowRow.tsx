"use client";

import Link from "next/link";
import { Star, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { workflowHref, type WorkflowListRecord } from "../types";

export interface WorkflowRowProps {
  workflow: WorkflowListRecord;
  isActive: boolean;
  isHovered: boolean;
  isMobile: boolean;
  /** Row href. Defaults to the entity registry's workflow door. */
  href?: string;
  onClick: () => void;
  onHover: () => void;
  onHoverEnd: () => void;
  onDetailPress: () => void;
}

/**
 * One workflow in the picker's list. Deliberately the same anatomy as
 * `AgentRow`: a real anchor (so cmd/ctrl-click opens the record in a tab),
 * plain click selects, a favorite star on the left, and an origin badge on the
 * right that says how you can see this record at all.
 */
export function WorkflowRow({
  workflow,
  isActive,
  isHovered,
  isMobile,
  href,
  onClick,
  onHover,
  onHoverEnd,
  onDetailPress,
}: WorkflowRowProps) {
  const rowHref = href ?? workflowHref(workflow.id);

  return (
    <div
      className={cn(
        "flex items-center w-full text-left transition-colors group",
        "hover:bg-muted/50 active:bg-muted/70",
        isActive && "bg-primary/5",
        !isMobile && isHovered && "bg-muted/40",
      )}
      onMouseEnter={isMobile ? undefined : onHover}
      onMouseLeave={isMobile ? undefined : onHoverEnd}
    >
      <Link
        href={rowHref}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          onClick();
        }}
        className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2"
      >
        {workflow.isFavorite && (
          <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
        )}
        <span
          className={cn(
            "text-[13px] font-medium truncate",
            isActive ? "text-primary" : "text-foreground",
          )}
        >
          {workflow.name}
        </span>
        {workflow.stepCount !== null && (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
            {workflow.stepCount} step{workflow.stepCount === 1 ? "" : "s"}
          </span>
        )}
        {workflow.isOwner === false ? (
          <span className="text-[9px] text-muted-foreground bg-muted px-1 py-px rounded shrink-0 ml-auto">
            {workflow.accessLevel === "org" ? "team" : "shared"}
          </span>
        ) : null}
      </Link>
      {isMobile && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDetailPress();
          }}
          className="flex items-center justify-center w-10 h-full shrink-0 text-muted-foreground/40 active:text-muted-foreground"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
