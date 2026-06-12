"use client";

/**
 * E3 stacked-rows attachment tile — adaptive light/dark chrome, transparent icon.
 * Canonical chip for agent input bar + sent user messages (+ dev gallery).
 */

import { createElement, type ComponentType } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveResourceAttachmentTileTheme,
  resourceAttachmentTileAdaptiveSurface,
  RESOURCE_ATTACHMENT_TILE_SHELL_ADAPTIVE,
} from "./resourceAttachmentTile.theme";

export interface ResourceAttachmentTileProps {
  /** Short type label, e.g. "Note", "Task". */
  typeLabel: string;
  /** Display title — truncated on one line. */
  title: string;
  icon: ComponentType<{ className?: string }>;
  /** Block type or demo id for theme lookup. */
  themeKey: string;
  onClick?: () => void;
  /** Input bar: small remove control in the tile corner. */
  onRemove?: () => void;
  pending?: boolean;
  error?: boolean;
  className?: string;
}

export function ResourceAttachmentTile({
  typeLabel,
  title,
  icon: Icon,
  themeKey,
  onClick,
  onRemove,
  pending = false,
  error = false,
  className,
}: ResourceAttachmentTileProps) {
  const theme = resolveResourceAttachmentTileTheme(themeKey);

  return (
    <div className="relative inline-flex shrink-0">
      <button
        type="button"
        title={title}
        onClick={onClick}
        className={cn(
          RESOURCE_ATTACHMENT_TILE_SHELL_ADAPTIVE,
          "w-[7.5rem] flex flex-col text-left min-w-0 px-1.5 py-1 gap-0.5",
          onRemove && "pr-4",
          resourceAttachmentTileAdaptiveSurface(theme),
          error && "ring-1 ring-destructive/50",
          className,
        )}
      >
        <span className="flex items-center gap-1 min-w-0 w-full">
          <span className="h-[1.125rem] w-[1.125rem] shrink-0 flex items-center justify-center">
            {pending ? (
              <Loader2
                className={cn("h-3.5 w-3.5 shrink-0 animate-spin", theme.icon)}
              />
            ) : error ? (
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
            ) : (
              createElement(Icon, {
                className: cn("h-3.5 w-3.5 shrink-0", theme.icon),
              })
            )}
          </span>
          <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[9px] font-semibold leading-none text-muted-foreground uppercase tracking-wide">
            {typeLabel}
          </span>
        </span>
        <span className="block w-full min-w-0 truncate whitespace-nowrap text-[10px] leading-none text-foreground font-medium">
          {title}
        </span>
      </button>

      {onRemove ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Remove ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }
          }}
          className={cn(
            "absolute top-0.5 right-0.5 z-10 inline-flex items-center justify-center rounded-full",
            "p-0.5 text-muted-foreground/80 hover:bg-black/10 hover:text-foreground",
            "dark:hover:bg-white/10 transition-colors",
          )}
        >
          <X className="h-2.5 w-2.5" />
        </span>
      ) : null}
    </div>
  );
}
