"use client";

/**
 * KindPanel — the standard panel for a kind component's sub-sections (a
 * keyword bucket, an option card, a section of results).
 *
 * Layout is fixed so agent-authored panels come out right by construction:
 *  - compact header: icon · title (wraps, never squeezed) · count · ≤2 inline
 *    actions · an overflow menu that absorbs EVERY other control (no control
 *    row ever gets crammed);
 *  - full-width subline (a rationale, a hint) on its own line UNDER the
 *    header — never beside the title;
 *  - body;
 *  - `footer` pinned to the bottom (flex column + mt-auto) so "Add" rows
 *    line up across sibling panels in a `KindPanelGrid`.
 * Contract: `components/kind-kit/README.md`.
 */

import * as React from "react";
import { Loader2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  renderKindKitIcon,
  type KindKitIcon,
} from "@/components/kind-kit/icon-slot";

export interface KindPanelMenuItem {
  label: string;
  onSelect: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  /** Renders in the destructive colour (delete, clear, reset). */
  destructive?: boolean;
  /** Draws a separator ABOVE this item. */
  separatorBefore?: boolean;
}

export interface KindPanelProps {
  /** Header title. Wraps onto extra lines rather than truncating. */
  title: React.ReactNode;
  /** Lucide component or an already-created icon element shown before the title. */
  icon?: KindKitIcon;
  /** Count pill after the title (e.g. number of items). */
  count?: number | string;
  /** Any extra pill/badge after the count (a status, a score). */
  badge?: React.ReactNode;
  /** Shows a spinner in the header while this panel's data is still arriving. */
  streaming?: boolean;
  /**
   * At most one or two compact controls rendered inline on the right of the
   * header (a toggle, a tiny icon button). Put everything else in `menuItems`.
   */
  actions?: React.ReactNode;
  /** Controls collapsed into the header's overflow (⋯) menu. */
  menuItems?: KindPanelMenuItem[];
  /** Full-width line under the header — a rationale, a hint. Never beside the title. */
  subline?: React.ReactNode;
  /** Panel body. */
  children?: React.ReactNode;
  /** Pinned to the bottom of the panel (an "Add" row, a summary, a copy bar). */
  footer?: React.ReactNode;
  /** "card" (default): bordered card. "bare": no border/background — the host IS the chrome. */
  variant?: "card" | "bare";
  /** Tighter paddings for dense lists. */
  dense?: boolean;
  className?: string;
  /** className for the body wrapper. */
  bodyClassName?: string;
}

export function KindPanel({
  title,
  icon,
  count,
  badge,
  streaming = false,
  actions,
  menuItems,
  subline,
  children,
  footer,
  variant = "card",
  dense = false,
  className,
  bodyClassName,
}: KindPanelProps) {
  const px = dense ? "px-2.5" : "px-3";
  const menu = menuItems && menuItems.length > 0 ? menuItems : null;
  return (
    <section
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col",
        variant === "card" && "rounded-lg border border-border bg-card",
        className,
      )}
    >
      <header
        className={cn(
          "flex items-start gap-2",
          px,
          dense ? "pt-2" : "pt-3",
          variant === "bare" && "px-0",
        )}
      >
        {renderKindKitIcon(icon, "mt-0.5 h-3.5 w-3.5 shrink-0 text-primary")}
        <h3 className="min-w-0 flex-1 text-xs font-semibold uppercase leading-5 tracking-wide text-foreground break-words">
          {title}
        </h3>
        {count !== undefined && (
          <span className="mt-0.5 shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
        {badge !== undefined && (
          <span className="mt-0.5 shrink-0">{badge}</span>
        )}
        {streaming && (
          <Loader2
            aria-label="Still arriving"
            className="mt-1 h-3 w-3 shrink-0 animate-spin text-muted-foreground"
          />
        )}
        {actions && (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        )}
        {menu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="More actions"
                className="-mr-1 -mt-1 h-7 w-7 shrink-0 text-muted-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              {menu.map((item, i) => (
                <React.Fragment key={`${i}-${item.label}`}>
                  {item.separatorBefore && i > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    disabled={item.disabled}
                    onSelect={() => item.onSelect()}
                    className={cn(
                      "text-xs",
                      item.destructive &&
                        "text-destructive focus:text-destructive",
                    )}
                  >
                    {item.icon && <item.icon className="mr-2 h-3.5 w-3.5" />}
                    {item.label}
                  </DropdownMenuItem>
                </React.Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      {subline !== undefined && subline !== null && subline !== "" && (
        <div
          className={cn(
            "pt-1 text-xs leading-snug text-muted-foreground break-words",
            px,
            variant === "bare" && "px-0",
          )}
        >
          {subline}
        </div>
      )}
      <div
        className={cn(
          "min-w-0 flex-1",
          px,
          dense ? "py-1.5" : "py-2",
          variant === "bare" && "px-0",
          bodyClassName,
        )}
      >
        {children}
      </div>
      {footer !== undefined && footer !== null && (
        <div
          className={cn(
            "mt-auto border-t border-border",
            px,
            dense ? "py-1.5" : "py-2",
            variant === "bare" && "px-0",
          )}
        >
          {footer}
        </div>
      )}
    </section>
  );
}
