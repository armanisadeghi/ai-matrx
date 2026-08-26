"use client";

// features/hr/people/profile/ProfileTabBar.tsx
//
// 🚨 THE TAB BAR IS `profile.tabs`, RENDERED. Nothing is added, nothing is
// filtered, nothing is disabled.
//
// The server built that array per viewer kind, which is exactly what makes the
// sensitivity rule mechanical: a tab whose every field is inaccessible never
// reaches the client, so it cannot be rendered greyed by accident. A hardcoded
// tab list filtered client-side is the review failure this file exists to make
// impossible — the ONLY local knowledge here is the LABEL for a segment, and an
// unknown segment gets a humanised fallback rather than being dropped.
//
// CUSTOM TABS render at the END, after Notes, as `c/<tabKey>` (§7.4). They are
// already at the end of the server's array; this file does not re-sort.
//
// Tabs are ROUTES, so each is a real `<Link>` — deep-linkable, new-tab-able, and
// keyboard-reachable. A `<button>` that swaps local state would break all three.

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { HR_PROFILE_TAB_LABELS, type HrProfileTab } from "../../constants";
import { hrEmployeeCustomTabHref, hrEmployeeHref, type HrOrgRef } from "../../routes";

function isBuiltInTab(segment: string): segment is HrProfileTab {
  return segment in HR_PROFILE_TAB_LABELS;
}

/** `c/expenses` → `Expenses`. A custom tab's admin label is not on this payload. */
function humanise(segment: string): string {
  const key = segment.startsWith("c/") ? segment.slice(2) : segment;
  return key
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function profileTabLabel(segment: string): string {
  return isBuiltInTab(segment) ? HR_PROFILE_TAB_LABELS[segment] : humanise(segment);
}

export function profileTabHref(
  employeeId: string,
  segment: string,
  org: HrOrgRef,
): string {
  return segment.startsWith("c/")
    ? hrEmployeeCustomTabHref(employeeId, segment.slice(2), org)
    : hrEmployeeHref(employeeId, segment, { org });
}

export function ProfileTabBar({
  employeeId,
  tabs,
  org,
  className,
}: {
  employeeId: string;
  /** VERBATIM `profile.tabs`. */
  tabs: readonly string[];
  org: HrOrgRef;
  className?: string;
}) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Employee record"
      className={cn(
        "flex min-w-0 items-center gap-1 overflow-x-auto border-b border-border px-2 py-1 sm:px-3",
        className,
      )}
    >
      {tabs.map((segment) => {
        const href = profileTabHref(employeeId, segment, org);
        const path = href.split("?")[0];
        const active = pathname === path;
        return (
          <Link
            key={segment}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors sm:min-h-8",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {profileTabLabel(segment)}
          </Link>
        );
      })}
    </nav>
  );
}
