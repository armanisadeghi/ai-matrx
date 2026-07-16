"use client";

/**
 * ToolResultCard — THE canonical card for "known pretty data" tool results.
 * One template, consumed everywhere (owner rule: STOP reinventing this).
 *
 * The grammar (designed with the owner on ArtifactResultBar, 2026-07-14):
 *   • ONE full-width header: tinted icon (text color only, no chip), title,
 *     quiet sub-line. Clicking ANYWHERE on it toggles the body — except the
 *     dropdown.
 *   • The header is the sheet's letterhead: collapsed it's a full pill;
 *     expanded it squares its bottom and the body attaches seamlessly.
 *   • "Open" on the right is a bordered rounded-xl dropdown (down chevron)
 *     carrying ALL destinations: any tool-specific items first, then the
 *     canonical pair every tool gets — Window Panel · Tool Admin.
 *
 * Registered with `chrome: "card"`, the shell renders this INSTEAD of its
 * folded line — so there is never a duplicate icon/label line above the card.
 * The shell hands down `expanded` / `onToggleExpanded` (live opens and stays
 * open; persisted mounts collapsed; user click sticks for the session).
 */

import React from "react";
import {
  ChevronDown,
  PanelRightOpen,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface ToolResultCardMenuItem {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

export interface ToolResultCardProps {
  icon: LucideIcon;
  /** Tint for the icon — TEXT color classes only (house rule: no chip bg). */
  iconClassName?: string;
  title: string;
  sub?: string | null;
  /** Body shown beneath the header when expanded. */
  children?: React.ReactNode;
  /** Collapse state; when undefined the card manages its own (default open). */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  /** Tool-specific dropdown items — rendered BEFORE the canonical pair. */
  menuItems?: ToolResultCardMenuItem[];
  /** Canonical destinations (the shell provides these). */
  onOpenWindowPanel?: () => void;
  onOpenOverlay?: () => void;
  className?: string;
}

export function ToolResultCard({
  icon: Icon,
  iconClassName = "text-primary",
  title,
  sub,
  children,
  expanded,
  onToggleExpanded,
  menuItems,
  onOpenWindowPanel,
  onOpenOverlay,
  className,
}: ToolResultCardProps) {
  // Standalone usage (no shell state handed down) manages its own toggle.
  const [selfOpen, setSelfOpen] = React.useState(true);
  const isOpen = expanded ?? selfOpen;
  const toggle = onToggleExpanded ?? (() => setSelfOpen((v) => !v));

  const hasBody = children !== undefined && children !== null && children !== false;
  const showBody = hasBody && isOpen;
  const hasMenu =
    (menuItems && menuItems.length > 0) || onOpenWindowPanel || onOpenOverlay;

  return (
    <div className={cn("w-full", className)}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 border border-border/50 bg-card px-4 py-2.5 text-left transition-colors hover:bg-accent/30",
          showBody ? "rounded-t-xl border-b-0" : "rounded-xl",
        )}
      >
        <Icon className={cn("size-[18px] shrink-0", iconClassName)} strokeWidth={2.25} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{title}</span>
          {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
        </span>

        {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-border/70 bg-background/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                aria-label="Open options"
              >
                <PanelRightOpen className="size-3.5" />
                Open
                <ChevronDown className="size-3" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {menuItems?.map((item) => (
                <DropdownMenuItem key={item.label} onClick={item.onClick}>
                  <item.icon className="size-4" />
                  {item.label}
                </DropdownMenuItem>
              ))}
              {menuItems && menuItems.length > 0 && (onOpenWindowPanel || onOpenOverlay) && (
                <DropdownMenuSeparator />
              )}
              {onOpenWindowPanel && (
                <DropdownMenuItem onClick={onOpenWindowPanel}>
                  <PanelRightOpen className="size-4" />
                  Window Panel
                </DropdownMenuItem>
              )}
              {onOpenOverlay && (
                <DropdownMenuItem onClick={onOpenOverlay}>
                  <Wrench className="size-4" />
                  Tool Admin
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {showBody && (
        <div className="overflow-hidden rounded-b-xl border border-t-0 border-border/50 bg-card">
          {children}
        </div>
      )}
    </div>
  );
}

export default ToolResultCard;
