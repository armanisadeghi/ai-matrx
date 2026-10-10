"use client";

// features/start/widgets/frame.tsx — THE FIXED SLOT every Start widget renders in, and the shared row list.
//
// No layout shift: a slot's height is decided by (type, size) before any data arrives, and a list's
// loading skeleton draws the same row count the loaded list can hold. Async data never changes a slot.
import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@ai-matrx/design-system";
import type { StartWidgetSize } from "./types";

/** Row height of a widget list (px). */
export const WIDGET_ROW_PX = 32;
/** The header strip of a slot (px). */
export const WIDGET_HEADER_PX = 36;

const DEFAULT_SLOT_PX = 256;
const SLOT_PX_BY_TYPE: Record<string, Partial<Record<StartWidgetSize, number>>> = {
  metric: { s: 112, m: 112 },
  kpis: { l: 112 },
  page: { m: 520, l: 520 },
};

/** The slot height (px) for a widget type at a size — fixed from first paint. */
export function slotHeightPx(type: string, size: StartWidgetSize): number {
  return SLOT_PX_BY_TYPE[type]?.[size] ?? DEFAULT_SLOT_PX;
}

/** How many list rows fit a slot (the skeleton draws exactly this many). */
export function slotRows(type: string, size: StartWidgetSize): number {
  return Math.max(1, Math.floor((slotHeightPx(type, size) - WIDGET_HEADER_PX - 8) / WIDGET_ROW_PX));
}

export const SIZE_SPAN_CLASS: Record<StartWidgetSize, string> = {
  s: "col-span-1",
  m: "col-span-1 md:col-span-2",
  l: "col-span-1 md:col-span-2 lg:col-span-4",
};

export function WidgetFrame({
  type,
  size,
  icon: Icon,
  title,
  href,
  controls,
  children,
  previewing,
  editing,
}: {
  type: string;
  size: StartWidgetSize;
  icon: LucideIcon;
  title: string;
  href?: string | undefined;
  controls?: ReactNode;
  children: ReactNode;
  previewing?: boolean;
  /** Edit mode: the controls share the header row; the glyph steps aside so the title keeps its room. */
  editing?: boolean;
}) {
  return (
    <section
      data-start-slot={type}
      style={{ height: slotHeightPx(type, size) }}
      className={cn(
        SIZE_SPAN_CLASS[size],
        "flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
        previewing && "opacity-90",
      )}
    >
      <header
        data-start-slot-header
        style={{ height: WIDGET_HEADER_PX }}
        className={cn("flex shrink-0 items-center gap-2", editing ? "pl-3 pr-1" : "px-3")}
      >
        {editing ? null : <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
        {/* `title` = the tooltip, shown only where the slot is narrow enough to cut the name. */}
        {href ? (
          <Link href={href} title={title} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
            {title}
          </Link>
        ) : (
          <h2 title={title} className="min-w-0 flex-1 truncate text-sm font-medium">
            {title}
          </h2>
        )}
        {controls ? <div className="flex shrink-0 items-center">{controls}</div> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden px-1 pb-1">{children}</div>
    </section>
  );
}

export interface WidgetRow {
  key: string;
  title: string;
  href?: string | null | undefined;
  meta?: string | null | undefined;
  icon?: LucideIcon | undefined;
  tone?: "default" | "warning" | "muted";
  action?: ReactNode;
}

/** A list body: skeleton rows while loading (same count the slot holds), then up to that many rows. */
export function WidgetList({
  type,
  size,
  loading,
  error,
  rows,
  empty,
}: {
  type: string;
  size: StartWidgetSize;
  loading: boolean;
  error?: string | null | undefined;
  rows: readonly WidgetRow[];
  empty: ReactNode;
}) {
  const count = slotRows(type, size);
  if (loading) {
    return (
      <ul aria-busy="true" aria-label="Loading">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} style={{ height: WIDGET_ROW_PX }} className="flex items-center px-2">
            <span className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </li>
        ))}
      </ul>
    );
  }
  if (error) return <WidgetNotice tone="error">{error}</WidgetNotice>;
  if (rows.length === 0) return <WidgetNotice>{empty}</WidgetNotice>;
  return (
    <ul>
      {rows.slice(0, count).map((row) => {
        const Icon = row.icon;
        const inner = (
          <>
            {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                row.tone === "muted" && "text-muted-foreground",
                row.tone === "warning" && "text-warning",
              )}
            >
              {row.title}
            </span>
            {row.meta ? (
              <span
                className={cn(
                  "shrink-0 text-xs text-muted-foreground",
                  row.tone === "warning" && "text-warning",
                )}
              >
                {row.meta}
              </span>
            ) : null}
          </>
        );
        return (
          <li key={row.key} style={{ height: WIDGET_ROW_PX }} className="flex items-center gap-1">
            {row.href ? (
              <Link
                href={row.href}
                data-clickable
                className="flex h-full min-w-0 flex-1 items-center gap-2 rounded px-2 hover:bg-muted"
              >
                {inner}
              </Link>
            ) : (
              <div className="flex h-full min-w-0 flex-1 items-center gap-2 px-2">{inner}</div>
            )}
            {row.action}
          </li>
        );
      })}
    </ul>
  );
}

export function WidgetNotice({ children, tone }: { children: ReactNode; tone?: "error" }) {
  return (
    <div
      className={cn(
        "flex h-full items-center justify-center gap-2 px-3 text-center text-xs text-muted-foreground",
        tone === "error" && "text-destructive",
      )}
    >
      {tone === "error" ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
      <span className="line-clamp-2">{children}</span>
    </div>
  );
}
