"use client";

import Link from "next/link";
import { Star, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";

export interface AgentRowProps {
  agent: AgentDefinitionRecord;
  isActive: boolean;
  isHovered: boolean;
  isMobile: boolean;
  /** Row href. Defaults to `/agents/[id]`. */
  href?: string;
  onClick: () => void;
  onHover: () => void;
  onHoverEnd: () => void;
  onDetailPress: () => void;
}

export function AgentRow({
  agent,
  isActive,
  isHovered,
  isMobile,
  href,
  onClick,
  onHover,
  onHoverEnd,
  onDetailPress,
}: AgentRowProps) {
  const rowHref = href ?? `/agents/${agent.id}`;

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
        {agent.isFavorite && (
          <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
        )}
        <span
          className={cn(
            "text-[13px] font-medium truncate",
            isActive ? "text-primary" : "text-foreground",
          )}
        >
          {agent.name || "Untitled"}
        </span>
        {agent.isOwner === false && (
          <span className="text-[9px] text-muted-foreground bg-muted px-1 py-px rounded shrink-0 ml-auto">
            shared
          </span>
        )}
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
