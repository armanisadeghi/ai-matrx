"use client";

/**
 * Context slot tile — same E3 stacked layout + adaptive chrome as
 * ResourceAttachmentTile, with per-type context gradients.
 */

import { createElement, forwardRef, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import { RESOURCE_ATTACHMENT_TILE_SHELL_ADAPTIVE } from "@/features/agents/components/messages-display/user/resourceAttachmentTile.theme";
import { resolveContextSlotTileTheme } from "./contextSlotTile.theme";

export interface ContextSlotTileProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  typeLabel: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  themeKey: string;
  /** Extra detail for hover — defaults to title. */
  tooltip?: string;
}

export const ContextSlotTile = forwardRef<
  HTMLButtonElement,
  ContextSlotTileProps
>(function ContextSlotTile(
  {
    typeLabel,
    title,
    icon: Icon,
    themeKey,
    className,
    tooltip,
    type = "button",
    ...props
  },
  ref,
) {
  const theme = resolveContextSlotTileTheme(themeKey);

  return (
    <button
      ref={ref}
      type={type}
      title={tooltip ?? title}
      className={cn(
        RESOURCE_ATTACHMENT_TILE_SHELL_ADAPTIVE,
        "w-[7.5rem] flex flex-col text-left min-w-0 px-1.5 py-1 gap-0.5 shrink-0",
        theme.surface,
        className,
      )}
      {...props}
    >
      <span className="flex items-center gap-1 min-w-0 w-full">
        <span className="h-[1.125rem] w-[1.125rem] shrink-0 flex items-center justify-center">
          {createElement(Icon, {
            className: cn("h-3.5 w-3.5 shrink-0", theme.icon),
          })}
        </span>
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[9px] font-semibold leading-none text-muted-foreground uppercase tracking-wide">
          {typeLabel}
        </span>
      </span>
      <span className="block w-full min-w-0 truncate whitespace-nowrap text-[10px] leading-none text-foreground font-medium">
        {title}
      </span>
    </button>
  );
});
