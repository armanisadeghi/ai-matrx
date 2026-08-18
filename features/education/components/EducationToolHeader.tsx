"use client";

// features/education/components/EducationToolHeader.tsx
//
// The shared shell-header identity for every Education TOOL home route
// (/education/flashcards, /education/tutor, /education/memory, ...). Injects
// back-to-hub + the tool title into the shell header center via RouteHeader,
// replacing the education section-nav fallback the layout mounts. Tool homes
// must never render an in-body title bar or title/description prose block —
// this component IS the page identity (core-route-headers doctrine).

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import HeaderActions from "@/features/shell/components/header/variants/shared/HeaderActions";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";

export function EducationToolHeader({
  title,
  actions,
  sheetTitle,
  right,
}: {
  /** The tool name — one short `text-sm` title, nothing more. */
  title: string;
  /**
   * The tool's page-level actions. Rendered through `HeaderActions`, so they
   * are inline glass icons on `lg+` (overflowing into a glass dropdown past
   * three) and ONE `…` opening a bottom sheet below `lg` — a desktop action
   * may never simply vanish on mobile (core-route-headers mobile doctrine).
   */
  actions?: HeaderAction[];
  /** Title shown on the mobile bottom sheet. */
  sheetTitle?: string;
  /** Escape hatch for a bespoke right-slot node (tap buttons self-space). */
  right?: React.ReactNode;
}) {
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
      right={
        <>
          {right}
          {actions?.length ? (
            <HeaderActions actions={actions} sheetTitle={sheetTitle ?? title} />
          ) : null}
        </>
      }
    />
  );
}
