"use client";

import { Fragment } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ToolAccent } from "../../types";
import { ToolGlyph } from "./ToolGlyph";

/**
 * The polished entity-card header: a glossy glyph tile · name · small subtitle ·
 * and a single "Open in ▾" dropdown that hides every action (open in window,
 * new tab, copy, …). This is the canonical chrome for a tool that creates/loads
 * an entity — it replaces the old inline button pair so the card reads clean.
 */
export interface EntityAction {
  label: string;
  icon?: LucideIcon;
  /** Imperative action (open window, copy, …). */
  onSelect?: () => void;
  /** Link action — opens in a new tab. Takes precedence over onSelect. */
  href?: string;
  /** Draw a separator above this item. */
  separatorBefore?: boolean;
}

export function EntityCard({
  icon,
  accent,
  title,
  subtitle,
  actions = [],
  actionLabel = "Open in",
  children,
  className,
}: {
  icon: LucideIcon;
  accent?: ToolAccent;
  title: string;
  subtitle?: string | null;
  actions?: EntityAction[];
  actionLabel?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <ToolGlyph icon={icon} accent={accent} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight text-foreground">
            {title}
          </div>
          {subtitle ? (
            <div className="truncate text-xs leading-tight text-muted-foreground">
              {subtitle}
            </div>
          ) : null}
        </div>

        {actions.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
                {actionLabel}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {actions.map((a, i) => {
                const Icon = a.icon;
                const inner = (
                  <>
                    {Icon ? <Icon className="h-4 w-4 opacity-80" /> : null}
                    {a.label}
                  </>
                );
                const item = a.href ? (
                  <DropdownMenuItem key={`i-${i}`} asChild className="gap-2">
                    <a href={a.href} target="_blank" rel="noopener noreferrer">
                      {inner}
                    </a>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    key={`i-${i}`}
                    className="gap-2"
                    onSelect={a.onSelect}
                  >
                    {inner}
                  </DropdownMenuItem>
                );
                return a.separatorBefore ? (
                  <Fragment key={`f-${i}`}>
                    <DropdownMenuSeparator />
                    {item}
                  </Fragment>
                ) : (
                  item
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {children ? <div className="border-t border-border">{children}</div> : null}
    </div>
  );
}
