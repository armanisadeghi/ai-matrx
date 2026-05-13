"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Star,
  Tag,
  Folder,
  Users,
  Clock,
  Globe,
  ExternalLink,
  Rocket,
  CircleCheck,
} from "lucide-react";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  AgentSneakPeekContent,
  AgentSneakPeekCopyMenu,
} from "../AgentSneakPeekModal";
import { Button } from "@/components/ui/button";

export interface AgentDetailCardProps {
  agent: AgentDefinitionRecord;
  onSelect: () => void;
}

export function AgentDetailCard({ agent, onSelect }: AgentDetailCardProps) {
  const [peekOpen, setPeekOpen] = useState(false);
  const updatedDate = agent.updatedAt ? new Date(agent.updatedAt) : null;
  const createdDate = agent.createdAt ? new Date(agent.createdAt) : null;

  const formatDate = (d: Date | null) => {
    if (!d) return null;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"></div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground leading-tight truncate">
              {agent.name || "Untitled"}
            </h3>
            {agent.isFavorite && (
              <div className="flex items-center gap-1 mt-0.5">
                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                <span className="text-[11px] text-amber-600 dark:text-amber-400">
                  Favorite
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="h-px bg-border mx-3" />

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {agent.description && (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Description
            </p>
            <p className="text-xs text-foreground/80 leading-relaxed">
              {agent.description}
            </p>
          </div>
        )}

        {agent.category && (
          <div className="flex items-center gap-2">
            <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-foreground/80">{agent.category}</span>
          </div>
        )}

        {agent.tags && agent.tags.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-[11px] font-medium text-muted-foreground">
                Tags
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {agent.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center h-5 px-1.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {agent.accessLevel && (
          <div className="flex items-center gap-2">
            {agent.isOwner === false ? (
              <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            ) : (
              <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
            <div className="flex flex-col">
              <span className="text-xs text-foreground/80 capitalize">
                {agent.accessLevel === "owner"
                  ? "You own this"
                  : `Shared \u2014 ${agent.accessLevel}`}
              </span>
              {agent.sharedByEmail && (
                <span className="text-[10px] text-muted-foreground">
                  by {agent.sharedByEmail}
                </span>
              )}
            </div>
          </div>
        )}

        {agent.modelId && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground/80 font-mono truncate">
              {agent.modelId}
            </span>
          </div>
        )}

        {(updatedDate || createdDate) && (
          <div className="pt-1 space-y-1">
            {updatedDate && (
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-[11px] text-muted-foreground">
                  Updated {formatDate(updatedDate)}
                </span>
              </div>
            )}
            {createdDate && (
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                <span className="text-[11px] text-muted-foreground/70">
                  Created {formatDate(createdDate)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="h-px bg-border mx-3 mt-auto" />
      <div className="px-3 py-2 shrink-0 flex items-center gap-1.5">
        <button
          onClick={onSelect}
          className="flex-1 h-7 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 active:bg-primary/80 transition-colors"
        >
          Select
        </button>
        <HoverCard
          open={peekOpen}
          onOpenChange={setPeekOpen}
          openDelay={200}
          closeDelay={120}
        >
          <HoverCardTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              title="Sneak Peek — hover to preview"
              className="flex items-center justify-center h-7 w-7 rounded-md border border-border bg-background text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors shrink-0"
            >
              <Rocket className="w-3.5 h-3.5" />
            </button>
          </HoverCardTrigger>
          <HoverCardContent
            side="right"
            align="end"
            sideOffset={12}
            avoidCollisions
            collisionPadding={8}
            className="w-[420px] max-h-[70vh] p-4 bg-card border border-border flex flex-col gap-3"
          >
            <div className="text-sm font-semibold text-foreground pr-2 shrink-0">
              {agent.name || "Untitled"}
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 -mr-2 pr-2">
              <AgentSneakPeekContent agentId={agent.id} active={peekOpen} />
            </div>
            <div className="border-t border-border pt-3 flex items-center gap-2 shrink-0">
              <AgentSneakPeekCopyMenu agentId={agent.id} />
              <Button
                size="sm"
                className="ml-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  setPeekOpen(false);
                  onSelect();
                }}
              >
                <CircleCheck />
                Select Agent
              </Button>
            </div>
          </HoverCardContent>
        </HoverCard>
        <Link
          href={`/agents/${agent.id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open in new tab"
          className="flex items-center justify-center h-7 w-7 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
