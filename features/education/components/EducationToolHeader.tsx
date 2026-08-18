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

export function EducationToolHeader({
  title,
  right,
}: {
  /** The tool name — one short `text-sm` title, nothing more. */
  title: string;
  /** Optional page-scoped header actions (tap buttons self-space). */
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
      right={right}
    />
  );
}
