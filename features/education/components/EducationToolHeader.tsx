"use client";

// features/education/components/EducationToolHeader.tsx
//
// The shared shell-header identity for every Education TOOL home route
// (/education/flashcards, /education/tutor, /education/memory, ...). Injects
// back-to-hub + the tool title into the shell header's left slot via
// RouteHeader, and keeps the Education section nav (center) and the page's
// intelligence mark (right) that `EducationHeader` shows on every other
// education route — a tool home used to drop both, so the section nav vanished
// on the list and came back on its detail and New pages. Tool homes
// must never render an in-body title bar or title/description prose block —
// this component IS the page identity (core-route-headers doctrine).
//
// ACTIONS (page-pass 2026-09-27, /education/flashcards): the flashcards home
// drew EIGHT unlabeled glass icons beside a seven-icon section nav — fifteen
// glyphs nobody could read, and at 800px the nav collapsed into a clipped
// "Menu" stub that ran into them. Now:
//   - an action marked `primary` is a LABELLED button (one or two per page);
//   - every other action is an icon with a tooltip and an accessible name,
//     ON the header at every width — RouteHeader folds the lowest-priority
//     ones into its own "…" only when the real row width runs out (a fixed
//     "More" menu on desktop hid every secondary action; reverted 2026-09-27);
//   - navigation is a real link (`href`), so it opens in a new tab, prefetches,
//     and shows the route's loading state at once.
// On a phone RouteHeader moves the actions into the shell's ⋮ sheet, which
// prints each one's name — so there they are handed over one by one.

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import { TapTargetButton } from "@ai-matrx/design-system/tap-target";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import LucideIcon from "@/features/shell/components/header/variants/shared/LucideIcon";
import {
  EDUCATION_NAV_FALLBACK_LABEL,
  EDUCATION_NAV_ITEMS,
} from "./EducationHeader";

/** One page-level action of an education tool. */
export interface EducationToolAction {
  /** Lucide icon name, e.g. "CalendarClock". */
  icon: string;
  /** What it does, in the reader's words — the button text or menu item. */
  label: string;
  /** Navigation: a real link (new tab, prefetch, the route's loading state). */
  href?: string;
  /** Anything that is not navigation (an export, a download). */
  onPress?: () => void;
  /** Shown as a labelled button beside the menu. One or two per page. */
  primary?: boolean;
  /** True while the action runs (e.g. "Exporting…"): shown, not pressable. */
  disabled?: boolean;
}

function ActionIcon({ name }: { name: string }) {
  return <LucideIcon name={name} size={16} />;
}

/** A labelled (or, with `iconOnly`, tooltip-named) action button. */
function ActionButton({
  action,
  iconOnly = false,
}: {
  action: EducationToolAction;
  iconOnly?: boolean;
}) {
  return (
    <TapTargetButton
      icon={<ActionIcon name={action.icon} />}
      {...(iconOnly ? {} : { label: action.label })}
      ariaLabel={action.label}
      {...(iconOnly ? { tooltip: action.label } : {})}
      disabled={action.disabled}
      {...(action.href && !action.disabled
        ? { href: action.href }
        : { onClick: action.onPress })}
    />
  );
}

export function EducationToolHeader({
  title,
  actions,
  right,
}: {
  /** The tool name — one short `text-sm` title, nothing more. */
  title: string;
  /**
   * The tool's page-level actions. Mark the one or two a person comes here
   * for `primary`; the rest go into one labelled "More" menu.
   */
  actions?: EducationToolAction[];
  /** Unused since the phone sheet is the shell's own ⋮ (kept so callers compile). */
  sheetTitle?: string;
  /** Escape hatch for a bespoke right-slot node (tap buttons self-space). */
  right?: React.ReactNode;
}) {
  const list = actions ?? [];
  const primary = list.filter((a) => a.primary);
  const secondary = list.filter((a) => !a.primary);

  // Every action stays ON the header at every width, lowest priority first
  // (RouteHeader folds from the left into its own "…" only when the row does
  // not fit, and keeps the last action visible). Primary actions carry their
  // label on desktop; the rest are icons with a tooltip and accessible name.
  // On 2026-09-27 a phone-style "More" menu was applied at every width and
  // desktop lost every secondary action behind it — never again: the fold is
  // RouteHeader's job, driven by real width, not a fixed count.
  const actionNodes = [
    ...secondary.map((action) => (
      <ActionButton key={action.label} action={action} iconOnly />
    )),
    // A primary is the bare labelled TapTargetButton (not the ActionButton
    // wrapper) so RouteHeader can see its label: on a phone RouteHeader draws
    // it icon-only, and in the server HTML it draws both forms chosen by the
    // phone breakpoint — the first paint already matches (no JS switch here).
    ...primary.map((action) => (
      <TapTargetButton
        key={action.label}
        icon={<ActionIcon name={action.icon} />}
        label={action.label}
        ariaLabel={action.label}
        disabled={action.disabled}
        {...(action.href && !action.disabled
          ? { href: action.href }
          : { onClick: action.onPress })}
      />
    )),
  ];

  return (
    <RouteHeader
      left={
        <div className="flex min-w-0 items-center">
          <ChevronLeftTapButton
            href="/education"
            variant="transparent"
            ariaLabel="Back to Education"
          />
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {title}
          </span>
        </div>
      }
      center={
        <RouteModeNav
          items={EDUCATION_NAV_ITEMS}
          fallbackLabel={EDUCATION_NAV_FALLBACK_LABEL}
        />
      }
      right={
        <>
          {right}
          {actionNodes}
        </>
      }
    />
  );
}
