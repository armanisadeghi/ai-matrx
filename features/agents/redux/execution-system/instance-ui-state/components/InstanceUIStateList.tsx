"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  MessageSquare,
  Copy,
  Check,
  LayoutDashboard,
} from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectUIStateInstancesByAgent,
  selectAllUIStateConversationIds,
  selectInstanceTitle,
} from "../instance-ui-state.selectors";
import type { InstanceAgentGroup } from "../instance-ui-state.selectors";

// ─── Copy helper ──────────────────────────────────────────────────────────────

function useCopyText(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return { copied, copy };
}

// ─── Single instance row ──────────────────────────────────────────────────────
// Compact single-line: icon · title (or short UUID) · copy-on-hover

function InstanceRow({
  conversationId,
  isSelected,
  onSelect,
}: {
  conversationId: string;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const title = useAppSelector(selectInstanceTitle(conversationId));
  const { copied, copy } = useCopyText(conversationId);
  const shortId = conversationId.slice(0, 8) + "…";
  const label = title ?? shortId;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(conversationId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(conversationId);
      }}
      className={cn(
        "flex items-center gap-1.5 w-full px-2 py-1.5 text-left transition-colors border-l-2 group cursor-pointer select-none",
        isSelected
          ? "border-primary bg-primary/8"
          : "border-transparent hover:bg-muted/40",
      )}
    >
      <MessageSquare
        className={cn(
          "h-3 w-3 shrink-0",
          isSelected ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span
        className={cn(
          "text-xs flex-1 min-w-0 truncate",
          isSelected ? "text-primary font-medium" : "text-foreground",
        )}
      >
        {label}
      </span>
      {title && (
        <span className="text-[11px] font-mono text-muted-foreground/50 shrink-0 hidden group-hover:inline">
          {shortId}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          copy();
        }}
        className="opacity-0 group-hover:opacity-100 h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-all shrink-0"
        title="Copy conversation ID"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

// ─── Agent group ──────────────────────────────────────────────────────────────

function AgentGroup({
  group,
  selectedIds,
  onSelect,
  defaultOpen,
}: {
  group: InstanceAgentGroup;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasActive = group.conversationIds.some((id) => selectedIds.has(id));
  const { copied, copy } = useCopyText(group.agentId ?? "");

  const displayName =
    group.agentName ??
    (group.agentId ? group.agentId.slice(0, 8) + "…" : "Unassigned");
  const isUnassigned = group.agentId === null;

  return (
    <div>
      {/* Agent header — div avoids nested <button> (copy button lives inside) */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 hover:bg-muted/40 cursor-pointer select-none transition-colors group"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <Cpu
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            isUnassigned
              ? "text-muted-foreground/40"
              : hasActive
                ? "text-primary"
                : "text-muted-foreground",
          )}
        />
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wide flex-1 min-w-0 truncate",
            isUnassigned
              ? "text-muted-foreground/60 italic"
              : hasActive
                ? "text-primary"
                : "text-muted-foreground",
          )}
        >
          {displayName}
        </span>
        <span className="text-[10px] text-muted-foreground/50 shrink-0 ml-1">
          {group.conversationIds.length}
        </span>
        {group.agentId && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              copy();
            }}
            className="opacity-0 group-hover:opacity-100 h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-all shrink-0 ml-0.5"
            title="Copy agent ID"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        )}
      </div>

      {/* Instances */}
      {open && (
        <div className="pl-2">
          {group.conversationIds.map((convId) => (
            <InstanceRow
              key={convId}
              conversationId={convId}
              isSelected={selectedIds.has(convId)}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main list component ──────────────────────────────────────────────────────

interface InstanceUIStateListProps {
  /** All open tab IDs — used to highlight every open instance */
  openTabIds: string[];
  /** The currently active tab (highlighted with primary color) */
  selectedConversationId: string | null;
  onSelect: (conversationId: string) => void;
  className?: string;
}

export function InstanceUIStateList({
  openTabIds,
  selectedConversationId,
  onSelect,
  className,
}: InstanceUIStateListProps) {
  const groups = useAppSelector(selectUIStateInstancesByAgent);
  const allIds = useAppSelector(selectAllUIStateConversationIds);
  const openSet = new Set(openTabIds);

  const totalCount = allIds.length;

  if (totalCount === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center py-10 px-3 text-center gap-2",
          className,
        )}
      >
        <LayoutDashboard className="h-6 w-6 text-muted-foreground opacity-25" />
        {/* read-gate-exempt: lists in-browser execution instances held in the store this session; there is no read that can fail */}
        <p className="text-xs text-muted-foreground">No active instances</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col min-h-0 h-full", className)}>
      {/* Header */}
      <div className="px-2 py-1 border-b border-border/50 shrink-0 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Instances
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {totalCount}
        </span>
      </div>

      {/* Scrollable tree */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {groups.map((group, i) => (
          <AgentGroup
            key={group.agentId ?? "__unassigned__"}
            group={group}
            selectedIds={openSet}
            onSelect={onSelect}
            defaultOpen={i === 0}
          />
        ))}
      </div>
    </div>
  );
}
