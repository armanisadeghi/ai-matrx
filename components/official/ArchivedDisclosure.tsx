"use client";

/**
 * components/official/ArchivedDisclosure.tsx
 *
 * THE ARCHIVED-ITEMS LAW, card-list half.
 * (`../common-docs/policies/archived-items.md`, Arman 2026-09-09.)
 *
 * Every list over an entity that can be archived carries an archive control,
 * it defaults to HIDING archived rows, and revealing them is one or two
 * clicks — on the surface itself.
 *
 * There are exactly TWO allowed implementations of that control, and this is
 * one of them:
 *
 *   • Table / browse surfaces built on `lib/entity-list` use the shared
 *     "Archived" radio (Active / Archived / All) in the Filters & Sort panel,
 *     which is a real server-side RPC parameter. Prefer that whenever the
 *     surface is (or can be) an `<EntityListPage>`.
 *   • Card lists, panels and pickers that are NOT entity-list shaped use THIS
 *     component: a one-click "Archived (N)" disclosure, hidden by default,
 *     rendering the archived rows in place underneath.
 *
 * Never invent a third pattern. The disclosure was proven first in Transcript
 * Studio (`features/transcript-studio/components/scribe/RecordingCardList.tsx`,
 * which now consumes this component instead of its own copy).
 *
 * Two shapes, one primitive:
 *
 *   <ArchivedDisclosure count={n} open={open} onOpenChange={setOpen}>
 *     …archived rows…
 *   </ArchivedDisclosure>
 *
 * renders the button AND the revealed block. Omit `children` when the caller
 * merges the archived rows into an existing table/grid itself (the button is
 * then the whole control) — see `features/hr/settings/fields/HrFieldsPanel.tsx`.
 *
 * The count is ALWAYS the true number of archived rows the surface holds. A
 * screen never lies: when there is nothing archived the control renders
 * nothing at all rather than an empty promise. A surface whose archive view is
 * a SERVER request (the rows below the button are the archived page itself,
 * not children of it) passes `keepWhileOpen` so the revealed view never loses
 * its way back.
 *
 * `countLabel` exists for the one case a bare integer cannot tell the truth: a
 * server-side count that hit its cap (render `"12+"`), or a count that has not
 * landed yet (pass `null` and no parenthetical is printed at all).
 */

import type { ReactNode } from "react";
import { Archive, ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ArchivedDisclosureProps {
  /** True number of archived rows this surface holds. 0 renders nothing. */
  count: number;
  /** Whether archived rows are currently revealed. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The archived rows. Omit when the host merges them into its own list and
   * only needs the toggle.
   */
  children?: ReactNode;
  /** Noun for the rows, so the button reads in the surface's own words. */
  label?: string;
  /**
   * Override the parenthetical. A string replaces the number (`"12+"` for a
   * capped server count); `null` prints no parenthetical at all, for a count
   * that has not arrived yet. Omit it and the honest `count` is printed.
   */
  countLabel?: string | null;
  /**
   * Keep the control rendered while `open` even at `count === 0`. For surfaces
   * where opening SWITCHES the list to the archive (a server-side filter)
   * rather than nesting rows inside this component: without it the way back
   * would vanish the moment the count read zero or had not landed.
   */
  keepWhileOpen?: boolean;
  className?: string;
  contentClassName?: string;
}

export function ArchivedDisclosure({
  count,
  open,
  onOpenChange,
  children,
  label = "Archived",
  countLabel,
  keepWhileOpen = false,
  className,
  contentClassName,
}: ArchivedDisclosureProps) {
  // Nothing archived: an empty promise, so render nothing — unless this
  // surface's open state IS the archive view, whose way back must never vanish.
  if (count <= 0 && !(open && keepWhileOpen)) return null;

  const parenthetical =
    countLabel === undefined ? String(count) : countLabel;

  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-accent active:bg-accent"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <Archive className="h-4 w-4 shrink-0" />
        <span className="truncate">
          {parenthetical === null ? label : `${label} (${parenthetical})`}
        </span>
      </button>
      {open && children ? (
        <div className={cn("mt-1", contentClassName)}>{children}</div>
      ) : null}
    </div>
  );
}

export default ArchivedDisclosure;
