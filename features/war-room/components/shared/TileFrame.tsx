"use client";

// features/war-room/components/shared/TileFrame.tsx
//
// Presentational tile chrome shared by WarRoomTile + NewTile: border, header
// row (title + pin/hide/expand controls), optional tab bar, and body. Dumb and
// prop-driven so any pinnable/hideable card surface can reuse it.

import { Pin, PinOff, EyeOff, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TileFrameProps {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onHide?: () => void;
  onExpand?: () => void;
  onDelete?: () => void;
  featured?: boolean;
  /** Highlight when this tile is the focused one. */
  active?: boolean;
  tabBar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function TileFrame({
  title,
  icon,
  isPinned,
  onTogglePin,
  onHide,
  onExpand,
  onDelete,
  featured,
  active,
  tabBar,
  children,
  className,
}: TileFrameProps) {
  return (
    <div
      className={cn(
        "group/tile @container flex flex-col h-full min-h-0 overflow-hidden rounded-xl border bg-card transition-colors",
        active
          ? "border-primary/50 shadow-[var(--elevation-2)]"
          : "border-border hover:border-primary/30",
        featured && "shadow-[var(--elevation-1)]",
        className,
      )}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center gap-1.5 px-2.5 h-9 border-b border-border/70">
        {isPinned ? (
          <Pin className="size-3.5 text-primary shrink-0 fill-primary/20" />
        ) : icon ? (
          <span className="shrink-0 text-muted-foreground">{icon}</span>
        ) : null}
        <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0">
          {title}
        </span>

        {/* Controls — appear on hover; pin persists visible when active */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover/tile:opacity-100 focus-within:opacity-100 transition-opacity">
          {onTogglePin ? (
            <TileIconButton
              onClick={onTogglePin}
              label={isPinned ? "Unpin" : "Pin"}
            >
              {isPinned ? (
                <PinOff className="size-3.5" />
              ) : (
                <Pin className="size-3.5" />
              )}
            </TileIconButton>
          ) : null}
          {onExpand ? (
            <TileIconButton onClick={onExpand} label="Expand">
              <Maximize2 className="size-3.5" />
            </TileIconButton>
          ) : null}
          {onHide ? (
            <TileIconButton onClick={onHide} label="Hide">
              <EyeOff className="size-3.5" />
            </TileIconButton>
          ) : null}
          {onDelete ? (
            <TileIconButton onClick={onDelete} label="Remove" destructive>
              <X className="size-3.5" />
            </TileIconButton>
          ) : null}
        </div>
      </div>

      {tabBar ? <div className="shrink-0">{tabBar}</div> : null}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function TileIconButton({
  onClick,
  label,
  destructive,
  children,
}: {
  onClick: () => void;
  label: string;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className={cn(
        "grid place-items-center size-6 rounded-md text-muted-foreground transition-colors",
        destructive
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
