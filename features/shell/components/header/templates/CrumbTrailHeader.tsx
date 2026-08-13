"use client";

// CrumbTrailHeader — the ORG/SCOPES-PATTERN header as a drop-in template.
// Generic version of the scope family's breadcrumb row (the best drill-down
// nav in the app): every level is clickable, every level can expose its
// SIBLINGS via a tiny chevron dropdown, actions stay tap targets on the right.
//
//   <CrumbTrailHeader
//     backHref="/cms"
//     trail={[
//       { label: "Content", href: "/cms" },
//       { label: site.name, href: `/cms/${site.id}`, options: siblingSites },
//       { label: "Settings" },
//     ]}
//     right={<PlusTapButton … />}
//   />
//
// Mobile: the trail collapses to the LAST crumb (+ its dropdown) so the row
// never overflows. The full-fidelity scope implementation (drawer, org root,
// "view all" links) remains `features/scope-system/components/ScopeBreadcrumb.tsx`;
// migrate it onto this template when touched.

import { Fragment } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface CrumbOption {
  label: string;
  href: string;
  active?: boolean;
}

export interface Crumb {
  label: string;
  /** Where clicking the crumb's text navigates. Omit on the current level. */
  href?: string;
  /** Sibling links shown in the crumb's chevron dropdown. */
  options?: CrumbOption[];
  /** Optional heading above the options list (e.g. "Sites"). */
  optionsLabel?: string;
}

export interface CrumbTrailHeaderProps {
  /** Back tap-target destination. Defaults to the first crumb's href. */
  backHref?: string;
  trail: Crumb[];
  /** Right-slot tap-target actions. */
  right?: React.ReactNode;
  /** Yield to any page-specific header mounted deeper in the route tree. */
  fallback?: boolean;
}

function CrumbOptions({ crumb }: { crumb: Crumb }) {
  if (!crumb.options || crumb.options.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Switch ${crumb.optionsLabel ?? crumb.label}`}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground hover:bg-accent/60"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[12rem] max-w-[20rem]"
      >
        {crumb.optionsLabel && (
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {crumb.optionsLabel}
          </DropdownMenuLabel>
        )}
        <div className="max-h-[60dvh] overflow-y-auto">
          {crumb.options.map((opt) => (
            <DropdownMenuItem
              key={opt.href}
              asChild
              className={cn(opt.active && "bg-accent/60")}
            >
              <Link href={opt.href} className="flex items-center gap-2">
                <Check
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    opt.active ? "opacity-100 text-primary" : "opacity-0",
                  )}
                />
                <span className="truncate">{opt.label}</span>
              </Link>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CrumbNode({ crumb, isLast }: { crumb: Crumb; isLast: boolean }) {
  const text = isLast ? (
    <span className="truncate max-w-[12rem] text-sm font-medium text-foreground">
      {crumb.label}
    </span>
  ) : crumb.href ? (
    <Link
      href={crumb.href}
      className="truncate max-w-[12rem] text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-2 transition-colors"
    >
      {crumb.label}
    </Link>
  ) : (
    <span className="truncate max-w-[12rem] text-sm text-muted-foreground">
      {crumb.label}
    </span>
  );

  return (
    <span className="flex min-w-0 items-center gap-0.5">
      {text}
      <CrumbOptions crumb={crumb} />
    </span>
  );
}

export function CrumbTrailHeader({
  backHref,
  trail,
  right,
  fallback = false,
}: CrumbTrailHeaderProps) {
  if (trail.length === 0) return null;
  const last = trail[trail.length - 1];
  const back = backHref ?? trail[0]?.href ?? "/";

  return (
    <RouteHeader
      fallback={fallback}
      left={
        <>
          <ChevronLeftTapButton href={back} ariaLabel="Back" />
          {/* Desktop: full trail */}
          <nav
            aria-label="Breadcrumb"
            className="hidden sm:flex min-w-0 items-center gap-1"
          >
            {trail.map((crumb, i) => (
              <Fragment key={`${crumb.label}-${i}`}>
                {i > 0 && (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                )}
                <CrumbNode crumb={crumb} isLast={i === trail.length - 1} />
              </Fragment>
            ))}
          </nav>
          {/* Mobile: last crumb only */}
          <nav
            aria-label="Breadcrumb"
            className="flex sm:hidden min-w-0 items-center"
          >
            <CrumbNode crumb={last} isLast />
          </nav>
        </>
      }
      right={right}
    />
  );
}
