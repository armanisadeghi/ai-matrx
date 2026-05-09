"use client";

import React from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FloatingSelectionToolbarAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  running?: boolean;
  tone?: "default" | "destructive";
  title?: string;
}

interface FloatingSelectionToolbarProps {
  selectedCount: number;
  actions?: FloatingSelectionToolbarAction[];
  children?: React.ReactNode;
  note?: React.ReactNode;
  onClear: () => void;
  className?: string;
}

export function FloatingSelectionToolbar({
  selectedCount,
  actions = [],
  children,
  note,
  onClear,
  className,
}: FloatingSelectionToolbarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto fixed bottom-4 left-1/2 z-50 -translate-x-1/2",
        "flex max-w-[min(95vw,56rem)] items-center gap-2 rounded-full border border-border",
        "bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur",
        "max-md:bottom-24 max-md:left-3 max-md:right-3 max-md:max-w-none max-md:translate-x-0",
        "max-md:justify-between max-md:gap-1 max-md:overflow-x-auto max-md:px-2",
        className,
      )}
      role="toolbar"
      aria-label="Selection actions"
    >
      <span className="shrink-0 px-2 text-sm font-medium tabular-nums">
        {selectedCount} selected
      </span>
      <span className="h-5 w-px shrink-0 bg-border" />

      {actions.map((action) => (
        <FloatingSelectionToolbarButton key={action.id} {...action} />
      ))}

      {children}

      <span className="h-5 w-px shrink-0 bg-border" />
      <button
        type="button"
        onClick={onClear}
        className="flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground max-md:w-9 max-md:justify-center max-md:px-0"
        aria-label="Clear selection"
      >
        <X className="h-3.5 w-3.5" />
        <span className="max-md:hidden">Cancel</span>
      </button>

      {note ? (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
          {note}
        </div>
      ) : null}
    </div>
  );
}

export function FloatingSelectionToolbarButton({
  label,
  icon,
  onClick,
  running,
  disabled,
  tone = "default",
  title,
}: FloatingSelectionToolbarAction) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
        "max-md:w-9 max-md:justify-center max-md:px-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        tone === "destructive"
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-accent",
      )}
    >
      {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      <span className="max-md:hidden">{label}</span>
    </button>
  );
}
