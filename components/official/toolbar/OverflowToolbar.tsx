"use client";

/**
 * OverflowToolbar — a horizontal row of consistent, compact action buttons
 * that collapses the buttons that don't fit into a single "more" (…) menu.
 *
 *   ┌───────────────────────────────────────────────┐
 *   │ [leading]  [Btn] [Btn] [Btn]            [ … ]  │
 *   └───────────────────────────────────────────────┘
 *
 * Design rules (the primitive enforces them so callers can't drift):
 *   - Every button is the same height (h-7), padding, text size, icon size.
 *   - `hideLabel` renders an icon-only button with a tooltip — use it for
 *     "obvious" actions (Find, Source, …).
 *   - `tone: "primary"` colors a button without changing its size, so the
 *     primary action is NOT visually larger than the rest.
 *   - When the row is too narrow, the LAST actions collapse into the overflow
 *     menu first. Order your actions most-important-first.
 *
 * Measurement is done with a hidden "ghost" row (always renders every action
 * + the kebab) read via a ResizeObserver, so the visible row never reflows
 * mid-frame.
 */

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type {
  ItemMenuConfig,
  ItemMenuEntry,
} from "@/components/official/item/types";

export type ToolbarActionTone = "default" | "primary" | "destructive";

export interface ToolbarAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Click handler. Ignored when `href` is set. */
  onSelect?: () => void;
  /** Renders an anchor instead of a button. */
  href?: string;
  target?: "_blank";
  disabled?: boolean;
  /** Swaps the icon for a spinner and (optionally) shows `runningLabel`. */
  running?: boolean;
  runningLabel?: string;
  tone?: ToolbarActionTone;
  /** Icon-only button (tooltip carries the label). For obvious actions. */
  hideLabel?: boolean;
  /** Drop the action entirely. */
  hidden?: boolean;
}

export interface OverflowToolbarProps {
  actions: ToolbarAction[];
  /**
   * Optional element pinned at the start of the row — never collapsed, never
   * measured into the action budget except as a fixed prefix (e.g. a surface
   * switcher / context chip cluster).
   */
  leading?: React.ReactNode;
  /** Accessible label for the overflow trigger. */
  overflowAriaLabel?: string;
  className?: string;
}

const GAP_PX = 6; // gap-1.5

// ── Button ──────────────────────────────────────────────────────────────────

const TONE: Record<ToolbarActionTone, string> = {
  default: "border border-border bg-background hover:bg-accent text-foreground",
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  destructive:
    "border border-destructive/40 text-destructive hover:bg-destructive/10",
};

function ToolbarButton({
  action,
  enableTooltip = false,
}: {
  action: ToolbarAction;
  /** Wrap icon-only buttons in a styled tooltip. Off for the ghost row. */
  enableTooltip?: boolean;
}) {
  const tone = action.tone ?? "default";
  const Icon = action.running ? Loader2 : action.icon;
  const showLabel =
    !action.hideLabel || (action.running && action.runningLabel);
  const text =
    action.running && action.runningLabel ? action.runningLabel : action.label;

  const className = cn(
    "inline-flex items-center gap-1 h-7 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap",
    "disabled:opacity-50 disabled:pointer-events-none",
    action.hideLabel && !action.running ? "w-7 justify-center px-0" : "px-2",
    TONE[tone],
  );

  const inner = (
    <>
      <Icon
        className={cn("w-3.5 h-3.5 shrink-0", action.running && "animate-spin")}
      />
      {showLabel && <span>{text}</span>}
    </>
  );

  const control =
    action.href && !action.disabled ? (
      <a
        href={action.href}
        target={action.target}
        rel={action.target === "_blank" ? "noopener noreferrer" : undefined}
        className={className}
        aria-label={action.label}
      >
        {inner}
      </a>
    ) : (
      <button
        type="button"
        onClick={action.onSelect}
        disabled={action.disabled}
        className={className}
        aria-label={action.label}
      >
        {inner}
      </button>
    );

  // Icon-only buttons need a styled tooltip to be discoverable — the label
  // lives nowhere else on screen. Labeled buttons are self-describing.
  if (enableTooltip && action.hideLabel) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{control}</TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {action.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return control;
}

function OverflowTrigger({ ariaLabel }: { ariaLabel: string }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="menu"
      title="More actions"
      className={cn(
        "inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors",
        "border border-border bg-background hover:bg-accent text-foreground",
      )}
    >
      <MoreHorizontal className="w-3.5 h-3.5" />
    </button>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────

function actionToMenuEntry(action: ToolbarAction): ItemMenuEntry {
  if (action.href) {
    return {
      id: action.id,
      kind: "link",
      label: action.label,
      icon: action.icon,
      href: action.href,
      target: action.target,
      disabled: action.disabled,
    };
  }
  return {
    id: action.id,
    label: action.label,
    icon: action.icon,
    disabled: action.disabled || action.running,
    tone: action.tone === "destructive" ? "destructive" : "default",
    onSelect: () => action.onSelect?.(),
  };
}

export function OverflowToolbar({
  actions,
  leading,
  overflowAriaLabel = "More actions",
  className,
}: OverflowToolbarProps) {
  const visibleActions = useMemo(
    () => actions.filter((a) => !a.hidden),
    [actions],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  // The leading slot renders ONCE (in the visible row) — it may host a
  // stateful/data-fetching component, so we never duplicate it into the ghost.
  // Its width is read directly off this ref instead.
  const leadingRef = useRef<HTMLSpanElement>(null);
  const [visibleCount, setVisibleCount] = useState(visibleActions.length);

  // Re-measure whenever the rendered text/state of any action changes (label,
  // icon-only mode, or running label all change a button's width).
  const signature = visibleActions
    .map(
      (a) =>
        `${a.id}:${a.hideLabel ? 1 : 0}:${a.running ? 1 : 0}:${a.runningLabel ?? ""}:${a.label}`,
    )
    .join("|");

  useLayoutEffect(() => {
    const container = containerRef.current;
    const ghost = ghostRef.current;
    if (!container || !ghost) return undefined;

    const compute = () => {
      const available = container.clientWidth;
      const n = visibleActions.length;
      const children = Array.from(ghost.children) as HTMLElement[];
      const hasLeading = leading != null;
      const leadingW = hasLeading ? (leadingRef.current?.offsetWidth ?? 0) : 0;
      const itemW = (i: number) => children[i]?.offsetWidth ?? 0;
      const kebabW = children[n]?.offsetWidth ?? 28;

      // Width consumed by the always-present leading slot.
      const base = leadingW + (hasLeading && n > 0 ? GAP_PX : 0);

      // Does everything fit with no kebab?
      let totalAll = base;
      for (let i = 0; i < n; i++) totalAll += itemW(i) + (i > 0 ? GAP_PX : 0);
      if (totalAll <= available) {
        setVisibleCount(n);
        return;
      }

      // Otherwise fit as many as possible while reserving room for the kebab.
      let used = base;
      let count = 0;
      for (let i = 0; i < n; i++) {
        const add = itemW(i) + (count > 0 ? GAP_PX : 0);
        if (used + add + GAP_PX + kebabW <= available) {
          used += add;
          count += 1;
        } else break;
      }
      setVisibleCount(count);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, leading != null]);

  const shown = visibleActions.slice(0, visibleCount);
  const hidden = visibleActions.slice(visibleCount);

  const overflowConfig: ItemMenuConfig = useMemo(
    () => ({
      sections: [{ id: "overflow", items: hidden.map(actionToMenuEntry) }],
    }),
    [hidden],
  );

  return (
    <div ref={containerRef} className={cn("relative min-w-0", className)}>
      {/* Ghost measuring row — every action button + kebab, never visible.
          The leading slot is intentionally NOT duplicated here (it may be a
          stateful/fetching component); its width is read off `leadingRef`. */}
      <div
        ref={ghostRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 flex items-center gap-1.5 opacity-0"
      >
        {visibleActions.map((a) => (
          <ToolbarButton key={a.id} action={a} />
        ))}
        <OverflowTrigger ariaLabel={overflowAriaLabel} />
      </div>

      {/* Visible row — right-aligned cluster that collapses overflow. */}
      <div className="flex items-center justify-end gap-1.5">
        {leading != null && (
          <span ref={leadingRef} className="shrink-0">
            {leading}
          </span>
        )}
        {shown.map((a) => (
          <ToolbarButton key={a.id} action={a} enableTooltip />
        ))}
        {hidden.length > 0 && (
          <ItemMenu config={overflowConfig} align="end">
            <OverflowTrigger ariaLabel={overflowAriaLabel} />
          </ItemMenu>
        )}
      </div>
    </div>
  );
}
