"use client";

// NavItemTooltip — the ONE way an icon-only header-nav item gets its name.
//
// When a sub-route nav collapses its labels to icons (RouteModeNav's "icons"
// variant, or a mode controller hiding labels below a breakpoint), the item's
// name must stay instantly discoverable WITHOUT any layout shift. The
// professional pattern — what VS Code's activity bar, Slack's rail, and the
// macOS dock all do — is a fast styled tooltip anchored below the item:
//
//   - `NavTooltipProvider` wraps the pill once. It tunes Radix so the first
//     tooltip opens quickly (150ms) and moving between siblings shows the next
//     name INSTANTLY (skipDelayDuration) — scanning the strip reads like a
//     hover-label, not a slow browser title.
//   - `NavItemTooltip` wraps each icon-only item. Pass `contentClassName`
//     (e.g. "xl:hidden") when the label is CSS-hidden below a breakpoint so
//     the tooltip only appears while the label is actually invisible.
//
// Never use the native `title=` attribute on a header nav item — it is slow,
// unstyled, and doubles up with this tooltip.

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function NavTooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={600}>
      {children}
    </TooltipProvider>
  );
}

interface NavItemTooltipProps {
  /** The item's full name — what the hidden label would have said. */
  label: string;
  /**
   * Gate the tooltip to the range where the label is hidden, e.g. "xl:hidden"
   * for a `hidden xl:inline` label. Omit when the item is always icon-only.
   */
  contentClassName?: string;
  /** Skip the tooltip entirely (e.g. the active item still shows its label). */
  disabled?: boolean;
  children: React.ReactNode;
}

export function NavItemTooltip({
  label,
  contentClassName,
  disabled,
  children,
}: NavItemTooltipProps) {
  if (disabled) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="bottom"
        sideOffset={6}
        className={cn("px-2 py-1 font-medium", contentClassName)}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
