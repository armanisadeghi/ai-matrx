"use client";

import { Fragment, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, ArrowRight } from "lucide-react";
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
 * The polished, collapsible entity-card header: a glossy glyph tile · name · a
 * small subtitle (that swaps to a primary ACTION on hover) · and a single
 * "Open in ▾" dropdown hiding every action. Clicking the header smoothly
 * collapses/expands the content body.
 *
 * Collapse is CONTROLLED by the shell for card-chrome tools (`expanded` +
 * `onToggleExpanded` — opens on completion, auto-collapses when the next thing
 * in the turn starts), and falls back to internal state when used standalone.
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
  hoverAction,
  children,
  className,
  expanded,
  onToggleExpanded,
}: {
  icon: LucideIcon;
  accent?: ToolAccent;
  title: string;
  subtitle?: string | null;
  actions?: EntityAction[];
  actionLabel?: string;
  /**
   * The action the subtitle morphs into on hover. Defaults to the "Open in
   * window" action found in `actions` — a placeholder for per-tool custom
   * hover actions later.
   */
  hoverAction?: EntityAction;
  children?: React.ReactNode;
  className?: string;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  const hasBody = Boolean(children);
  const controlled = onToggleExpanded != null;
  const [internalOpen, setInternalOpen] = useState(true);
  const open = !hasBody ? true : controlled ? expanded ?? true : internalOpen;
  const toggle = controlled
    ? onToggleExpanded!
    : () => setInternalOpen((o) => !o);
  const collapsible = hasBody;

  const hoverAct =
    hoverAction ?? actions.find((a) => a.onSelect && /window/i.test(a.label));

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      <div
        className={cn(
          "group/eh flex items-center gap-3 px-3 py-2.5 transition-colors",
          collapsible && "cursor-pointer hover:bg-muted/50",
        )}
        onClick={collapsible ? toggle : undefined}
        role={collapsible ? "button" : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={
          collapsible
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
                }
              }
            : undefined
        }
      >
        <ToolGlyph icon={icon} accent={accent} size="lg" />

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight text-foreground">
            {title}
          </div>
          {subtitle || hoverAct ? (
            <div className="relative mt-0.5 h-4 text-xs leading-tight">
              {subtitle ? (
                <span
                  className={cn(
                    "absolute inset-0 truncate text-muted-foreground transition-opacity",
                    hoverAct && "group-hover/eh:opacity-0",
                  )}
                >
                  {subtitle}
                </span>
              ) : null}
              {hoverAct ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    hoverAct.onSelect?.();
                  }}
                  className="absolute inset-0 flex w-full items-center gap-1 truncate text-left font-medium text-primary opacity-0 transition-opacity pointer-events-none hover:underline group-hover/eh:pointer-events-auto group-hover/eh:opacity-100"
                >
                  {hoverAct.icon ? <hoverAct.icon className="h-3 w-3 shrink-0" /> : null}
                  <span className="truncate">{hoverAct.label}</span>
                  <ArrowRight className="h-3 w-3 shrink-0" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {collapsible ? (
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground/60 transition-all opacity-0 group-hover/eh:opacity-100",
              !open && "-rotate-90",
            )}
          />
        ) : null}

        {actions.length ? (
          <div onClick={(e) => e.stopPropagation()}>
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
          </div>
        ) : null}
      </div>

      {hasBody ? (
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-in-out",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className="border-t border-border">{children}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
