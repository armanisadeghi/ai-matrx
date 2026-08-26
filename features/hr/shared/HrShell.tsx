// features/hr/shared/HrShell.tsx
//
// THE CHROME EVERY `/hr/*` PAGE STANDS IN (SPEC-UI-IA §1 / §2, §3's `shell` column).
//
// Three things, and nothing else:
//   1. THE HR CONTEXT BAR — the employer name, pinned, plus a switcher.
//      🚨 SWITCHING EMPLOYERS IS A FULL CONTEXT CHANGE: navigate to the SAME route
//      with the new `?org=`. Never merge two employers' data — HR is strictly
//      single-employer and merging headcount, timesheets or pay is a compliance
//      defect, not a feature. `hrSwitchEmployerHref` is the only builder for it.
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

import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronDown, Users } from "lucide-react";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  RouteModeNav,
  type RouteNavItem,
} from "@/features/shell/components/header/RouteModeNav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import { cn } from "@/lib/utils";

import { hrHref, hrSwitchEmployerHref } from "../routes";
import { resolveHrNav } from "./hr-nav";
import { useHrContext } from "./useHrContext";
import { isOrgSteward, useHrPersona } from "./useHrPersona";

export type HrShellProps = {
  children: ReactNode;
  /** A short page name. Rendered as a breadcrumb leaf, never as marketing copy. */
  title?: string;
  /** One line saying what a person DOES here. Optional; omitted more often than not. */
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
  const { active, employers, orgRef, isLoading } = useHrContext();
  const { persona, employmentId, all } = useHrPersona();
  const pathname = usePathname() ?? hrHref();
  const scrollRef = useRef<HTMLDivElement>(null);

  useClippedContentGuard(scrollRef, { label: "HR page body" });

  const nav = resolveHrNav({
    persona,
    capabilities: all,
    employmentId,
    org: orgRef,
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
  const employerName = activeEmployer?.name ?? (isLoading ? "" : "HR");

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
        center={navItems.length > 0 ? <RouteModeNav items={navItems} /> : null}
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
            {crumbs.length > 0 || description ? (
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
                              className="truncate rounded-sm px-0.5 hover:text-foreground hover:underline"
                            >
                              {crumb.label}
                            </Link>
                          ) : (
                            <span className="truncate text-foreground">{crumb.label}</span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </nav>
                ) : null}
                {description ? (
                  <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
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

  if (employers.length < 2) {
    return (
      <span className="flex items-center gap-1.5 px-1 text-sm font-medium text-foreground">
        <Users className="h-4 w-4 shrink-0 text-primary" />
        <span className="max-w-[110px] truncate sm:max-w-[220px]">{label}</span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-h-11 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent sm:min-h-9">
        <Users className="h-4 w-4 shrink-0 text-primary" />
        <span className="max-w-[110px] truncate sm:max-w-[220px]">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          HR shows one employer at a time.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {employers.map((employer) => {
          const ref = employer.slug?.trim() || employer.organization_id;
          const isActive = employer.organization_id === activeOrganizationId;
          return (
            <DropdownMenuItem key={employer.organization_id} asChild>
              {/* A full context change: the SAME route, a new `?org=`. */}
              <Link
                href={hrSwitchEmployerHref(pathname, ref)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-2 sm:min-h-9",
                  isActive && "font-medium",
                )}
              >
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{employer.name}</span>
                {isActive ? (
                  <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                    Showing
                  </span>
                ) : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Breadcrumb ──────────────────────────────────────────────────────────────

type HrCrumb = { label: string; href: string | null };

function stripQuery(href: string): string {
  const index = href.indexOf("?");
  return index === -1 ? href : href.slice(0, index);
}

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
  }

  if (title) crumbs.push({ label: title, href: null });

  return crumbs.length > 1 ? crumbs : [];
}
