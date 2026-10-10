// features/hr/shared/HrShell.tsx
//
// THE CHROME EVERY `/hr/*` PAGE STANDS IN (SPEC-UI-IA §1 / §2, §3's `shell` column).
//
// Three things, and nothing else:
//   1. THE HR CONTEXT BAR — the employer name, pinned, plus a switcher.
//      🚨 SWITCHING EMPLOYERS IS A FULL CONTEXT CHANGE: navigate to the SAME route
//      with the new `?org_filter=`. LISTS span employers (All organizations is the
//      default); totals, pay and settings belong to exactly one, chosen here or by the
//      list's own org filter — `useHrContext`'s header states the rule.
//      `hrSwitchEmployerHref` is the only builder for it.
//   2. THE PERSONA NAV — `resolveHrNav`, which is CAPABILITY-driven. The persona
//      picks the label and the self-scoped destination ("My Timesheet"), never the
//      access decision. An item this person cannot use is ABSENT, not disabled.
//   3. A BREADCRUMB back up the route.
//
// Where the chrome lives: the shell header's center injection zone, via
// `RouteHeader` (core-route-headers skill). There is NO in-body title bar — a
// body-rendered `border-b`+`bg-card` header strip is the faux-header defect the
// whole (core) header campaign exists to kill.
//
// Layout contract: the body is `h-full overflow-hidden` and owns ONE bounded
// scroll area. `flex-1 min-h-0` only resolves when EVERY ancestor is `flex
// flex-col`, so the chain here is deliberate and the runtime `useClippedContentGuard`
// is consumed below — the static `pnpm check:scroll-chain` cannot see a wrapper
// added in somebody else's file.
//
// EMPLOYEE-ONLY NAV COLLAPSES FLAT (§2.2). `resolveHrNav().flat` is true for an
// employee whose org enables fewer than four self-service surfaces; the header nav
// is flat by construction in that case (five links, no group parent). It is
// `RouteModeNav` that decides when a LONG nav (an hr_admin's seventeen items)
// steps down to a single dropdown — measurement, never a role string.

"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Users } from "lucide-react";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  RouteModeNav,
  type RouteNavItem,
} from "@/features/shell/components/header/RouteModeNav";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import { cn } from "@/lib/utils";

import { hrHref, hrSectionHref, hrSwitchEmployerHref } from "../routes";
import { HrDisclosureClaimed, HrEmployerChoices, HrEmployerSubstitutionNotice } from "./HrStates";
import { resolveHrNav } from "./hr-nav";
import { useHrContext } from "./useHrContext";
import { isOrgSteward, useHrPersona } from "./useHrPersona";

export type HrShellProps = {
  children: ReactNode;
  /** A short page name. Rendered as a breadcrumb leaf, never as marketing copy. */
  title?: string;
  /**
   * One line saying what a person DOES here. Shown as the title's tooltip, never as a
   * line under it — the title stands alone.
   */
  description?: string;
  /** Page actions. They land in the header's right slot, never in the body. */
  actions?: ReactNode;
  /**
   * A static strip that sits ABOVE the scroll area and must not scroll away —
   * `HrSubShell`'s route-tab bar is its only intended user. Everything else
   * belongs in `children`.
   */
  subNav?: ReactNode;
};

export function HrShell({
  children,
  title,
  description,
  actions,
  subNav,
}: HrShellProps) {
  const { active, employers, orgRef, isLoading, scope } = useHrContext();
  const { persona, employmentId, all } = useHrPersona();
  // No pathname exists only before an employer context can be resolved.
  const pathname = usePathname() ?? hrHref(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useClippedContentGuard(scrollRef, { label: "HR page body" });

  const nav = resolveHrNav({
    persona,
    capabilities: all,
    employmentId,
    org: orgRef,
    /*
      The whole payload, once. Every per-person rule — the worker class, and the
      §2.8 override enrolment that is leave's designed per-person exception
      (hr_l5_30) — is derived from this INSIDE the resolver, so the two callers
      cannot disagree about which rules they applied.
    */
    active,
  });

  const navItems: RouteNavItem[] = nav.items.map((item) => ({
    name: item.label,
    href: item.href,
    icon: item.icon,
    exact: item.exact,
    description: item.description,
  }));

  const activeEmployer = active
    ? employers.find((e) => e.organization_id === active.organization_id) ?? null
    : null;
  // Under All organizations there is no single employer to name — say so, never pick one.
  const employerName =
    activeEmployer?.name ??
    (isLoading ? "" : scope.mode === "all" && scope.employers.length > 1 ? "All organizations" : "HR");

  const crumbs = buildCrumbs({
    pathname,
    orgRef,
    navLabel: nav.items.find((item) =>
      item.exact ? pathname === stripQuery(item.href) : pathname.startsWith(stripQuery(item.href)),
    ),
    title,
  });

  return (
    <>
      <RouteHeader
        left={
          <EmployerSwitcher
            employerName={employerName}
            pathname={pathname}
            employers={employers.filter(
              (employer) =>
                employer.module_enabled || isOrgSteward(employer.org_role),
            )}
            activeOrganizationId={active?.organization_id ?? null}
          />
        }
        center={
          // With no employer open there is nothing to navigate within, and a
          // persona-less nav would differ from the same route once one is chosen.
          (active || scope.actives.length > 0) && navItems.length > 0 ? (
            // A page with its own labeled tab bar (`subNav`) keeps the HR section
            // switch as ONE labeled dropdown — never a second row of icons.
            <RouteModeNav items={navItems} maxVariant={subNav ? "menu" : "full"} />
          ) : null
        }
        right={actions}
      />
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden bg-textured"
        data-hr-shell
        data-hr-nav-flat={nav.flat ? "true" : "false"}
      >
        {subNav ? (
          <div className="shrink-0 pt-[var(--shell-header-h)]">{subNav}</div>
        ) : null}
        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
        >
          <div className={cn(subNav ? null : "pt-[var(--shell-header-h)]")}>
            {/*
              🚨 The employer we opened is not always the one that was asked for —
              `useHrContext` law B. When it is not, the page says so HERE, above
              everything, with the way back. Never let the switcher label be the only
              evidence that HR changed employers on somebody.
            */}
            <div className="px-4 pt-3 empty:hidden sm:px-6">
              <HrEmployerSubstitutionNotice />
            </div>
            {crumbs.length > 0 ? (
              <div className="px-4 pt-3 sm:px-6">
                {crumbs.length > 0 ? (
                  <nav aria-label="Breadcrumb" className="min-w-0">
                    <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                      {crumbs.map((crumb, index) => (
                        <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                          {index > 0 ? <span aria-hidden="true">/</span> : null}
                          {crumb.href ? (
                            <Link
                              href={crumb.href}
                              className="inline-flex min-h-8 max-w-full items-center truncate rounded-sm px-1 hover:text-foreground hover:underline pointer-coarse:min-h-11"
                            >
                              {crumb.label}
                            </Link>
                          ) : (
                            // The page's one-line purpose rides the title as a tooltip —
                            // never a line under it (page-pass core 3: the title stands alone).
                            index === crumbs.length - 1 ? (
                              // The page's title IS the breadcrumb leaf: one h1, never a
                              // second heading in the body.
                              <h1
                                className="truncate text-sm font-semibold text-foreground"
                                title={description}
                              >
                                {crumb.label}
                              </h1>
                            ) : (
                              <span className="truncate text-foreground">{crumb.label}</span>
                            )
                          )}
                        </li>
                      ))}
                    </ol>
                  </nav>
                ) : null}
              </div>
            ) : null}
          </div>
          {/*
            The shell states the substitution above, so it CLAIMS the disclosure —
            otherwise the `HrPageState` inside the page would state it a second time.
            See `HrDisclosureClaimed` in `HrStates`.
          */}
          <div className="flex min-h-0 flex-1 flex-col">
            <HrDisclosureClaimed>{children}</HrDisclosureClaimed>
          </div>
        </div>
      </div>
    </>
  );
}

// ── The employer context bar ────────────────────────────────────────────────

/**
 * The pinned employer, and the ONE control that changes it.
 *
 * With a single reachable employer there is no switcher at all — a dropdown whose
 * only item is the thing already selected is a control that does nothing.
 */
function EmployerSwitcher({
  employerName,
  pathname,
  employers,
  activeOrganizationId,
}: {
  employerName: string;
  pathname: string;
  employers: ReturnType<typeof useHrContext>["employers"];
  activeOrganizationId: string | null;
}) {
  const label = employerName || "HR";
  const [open, setOpen] = useState(false);

  if (employers.length < 2) {
    return (
      <span className="flex items-center gap-1.5 px-1 text-sm font-medium text-foreground">
        <Users className="h-4 w-4 shrink-0 text-primary" />
        <span className="max-w-[110px] truncate sm:max-w-[220px]">{label}</span>
      </span>
    );
  }

  // The ONE employer list (`HrEmployerChoices`) — search, what each click
  // does, HR-off folded — never a 150-row dropdown (page-pass, 2026-09-27).
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-h-11 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent sm:min-h-9"
          aria-label={`Employer: ${label}. Change employer`}
        >
          <Users className="h-4 w-4 shrink-0 text-primary" />
          <span className="max-w-[110px] truncate sm:max-w-[220px]">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      {/* Fixed width: the list searches as you type. */}
      <PopoverContent
        /* sizing: fixed — a steady-width list of people; the width is the layout */
        align="start"
        className="matrx-touch-targets w-80 p-1"
      >
        {activeOrganizationId ? (
          <Link
            href={hrSwitchEmployerHref(pathname, null)}
            onClick={() => setOpen(false)}
            className="mx-1 mb-1 flex min-h-9 items-center rounded-md px-2 text-sm text-foreground hover:bg-accent"
          >
            All organizations
          </Link>
        ) : null}
        <HrEmployerChoices
          employers={employers}
          activeOrganizationId={activeOrganizationId}
          pathname={pathname}
          onChosen={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

// ── Breadcrumb ──────────────────────────────────────────────────────────────

type HrCrumb = { label: string; href: string | null };

function stripQuery(href: string): string {
  const index = href.indexOf("?");
  return index === -1 ? href : href.slice(0, index);
}

/** Section names for breadcrumbs when no persona nav item matches the path. */
const HR_SECTION_LABELS: Record<string, string> = {
  settings: "Settings",
  people: "People",
  time: "Time",
  leave: "Leave",
  compliance: "Compliance",
  reports: "Reports",
};

function buildCrumbs({
  pathname,
  orgRef,
  navLabel,
  title,
}: {
  pathname: string;
  orgRef: string | null;
  navLabel: { label: string; href: string } | undefined;
  title?: string;
}): HrCrumb[] {
  // The HR home is not a crumb of itself.
  if (pathname === "/hr" && !title) return [];

  const crumbs: HrCrumb[] = [{ label: "HR", href: hrHref(orgRef) }];

  if (navLabel && stripQuery(navLabel.href) !== "/hr") {
    crumbs.push({
      label: navLabel.label,
      href: title ? navLabel.href : null,
    });
  } else if (!navLabel && title) {
    // No nav item matched (e.g. no employer open yet, so no persona nav): name the
    // section from the path so the same route always shows the same breadcrumb.
    const section = pathname.split("/")[2];
    const label = section ? HR_SECTION_LABELS[section] : undefined;
    if (label) crumbs.push({ label, href: hrSectionHref(section, orgRef) });
  }

  if (title) crumbs.push({ label: title, href: null });

  return crumbs.length > 1 ? crumbs : [];
}
