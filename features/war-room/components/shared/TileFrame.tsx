"use client";

// features/war-room/components/shared/TileFrame.tsx
//
// Tile chrome: a single compact header (editable title + inline tab icons +
// context slot + a "…" options menu) over the body. Pin/hide/expand/delete live
// in the options menu; a pin dot marks pinned tiles. Dumb + prop-driven.

import {
  Pin,
  PinOff,
  EyeOff,
  Maximize2,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { EditableTitle } from "./EditableTitle";

export interface TileFrameProps {
  title: string;
  onRename?: (next: string) => void;
  /** Inline tab switcher (icon-only) rendered in the header. */
  tabsSlot?: React.ReactNode;
  /** Always-visible control slot (the context picker). */
  contextSlot?: React.ReactNode;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onHide?: () => void;
  onExpand?: () => void;
  onDelete?: () => void;
  featured?: boolean;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function TileFrame({
  title,
  onRename,
  tabsSlot,
  contextSlot,
  isPinned,
  onTogglePin,
  onHide,
  onExpand,
  onDelete,
  featured,
  active,
  children,
  className,
}: TileFrameProps) {
  const hasMenu = onTogglePin || onHide || onExpand || onDelete;

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
      {/* Header — single row: pin dot · title · tabs · context · ⋯ */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 h-9 border-b border-border/70">
        {isPinned ? (
          <Pin className="size-3.5 shrink-0 text-primary fill-primary/20" />
        ) : null}

        {onRename ? (
          <EditableTitle
            value={title}
            onSave={onRename}
            className="flex-1 text-xs font-medium"
            inputClassName="flex-1 text-xs font-medium"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-xs font-medium text-foreground">
            {title}
          </span>
        )}

        {tabsSlot}
        {contextSlot ? <div className="shrink-0">{contextSlot}</div> : null}

        {hasMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label="Tile options"
                className="grid place-items-center size-6 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {onTogglePin ? (
                <DropdownMenuItem onClick={onTogglePin}>
                  {isPinned ? (
                    <PinOff className="size-3.5" />
                  ) : (
                    <Pin className="size-3.5" />
                  )}
                  {isPinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
              ) : null}
              {onExpand ? (
                <DropdownMenuItem onClick={onExpand}>
                  <Maximize2 className="size-3.5" />
                  Expand
                </DropdownMenuItem>
              ) : null}
              {onHide ? (
                <DropdownMenuItem onClick={onHide}>
                  <EyeOff className="size-3.5" />
                  Hide
                </DropdownMenuItem>
              ) : null}
              {onDelete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    Remove
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
