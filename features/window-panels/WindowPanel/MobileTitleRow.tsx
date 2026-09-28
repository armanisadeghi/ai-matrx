"use client";

/**
 * THE PHONE TITLE ROW — the one title slot every mobile window chrome uses
 * (fullscreen header, bottom-sheet drawer, utility card).
 *
 * On a phone the title is the only thing that says WHICH record this window
 * is ("Run History — Recipe Scaler"), so it gets the whole row and wraps to
 * two lines before it truncates. Window actions and the Sidebar/Content toggle
 * never share its row: they sit on `MobileWindowActionsRow` below it, which
 * renders nothing when there is nothing to put there.
 *
 * Guard: `__tests__/a-phone-window-title-gets-the-whole-row.test.tsx`.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Two lines, then an ellipsis — never a one-line `truncate`. */
export const MOBILE_WINDOW_TITLE_TEXT =
  "line-clamp-2 break-words text-sm font-medium leading-snug text-foreground";

function isTextTitle(title: ReactNode): title is string | number {
  return typeof title === "string" || typeof title === "number";
}

/**
 * The title slot's classes. A text title wraps to two lines; a RICH title (a
 * control, e.g. the Chat window's agent picker) keeps its own layout. Exported
 * for a host whose title element is fixed (the drawer's accessible
 * `DrawerTitle`) — put these classes and `data-window-mobile-title` on it.
 */
export function mobileWindowTitleClass(title: ReactNode): string {
  return isTextTitle(title)
    ? cn("min-w-0 flex-1", MOBILE_WINDOW_TITLE_TEXT)
    : "flex min-w-0 flex-1 items-center overflow-hidden text-sm font-medium";
}

/** The title slot. */
export function MobileWindowTitle({
  title,
  className,
}: {
  title: ReactNode;
  className?: string;
}) {
  if (title == null || title === "") return <div className={cn("min-w-0 flex-1", className)} />;
  return (
    <div data-window-mobile-title="" className={cn(mobileWindowTitleClass(title), className)}>
      {title}
    </div>
  );
}

/** Row 1: whatever leads (close / minimize) and the title, nothing else. */
export function MobileWindowTitleRow({
  leading,
  trailing,
  children,
  className,
}: {
  leading?: ReactNode;
  /** A close ✕ only — never window actions. */
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-window-mobile-title-row=""
      className={cn("flex min-h-11 items-center gap-1.5 py-1", className)}
    >
      {leading}
      {children}
      {trailing}
    </div>
  );
}

/** Row 2: pane toggle + window actions. Absent when both are empty. */
export function MobileWindowActionsRow({
  leading,
  actions,
  className,
}: {
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  if (!leading && !actions) return null;
  return (
    <div
      data-window-mobile-actions-row=""
      className={cn("flex min-h-10 items-center gap-1.5 pb-1", className)}
    >
      {leading}
      {actions ? <div className="ml-auto flex items-center gap-1">{actions}</div> : null}
    </div>
  );
}
