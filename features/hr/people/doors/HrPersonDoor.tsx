"use client";

// features/hr/people/doors/HrPersonDoor.tsx
//
// EVERY RENDERED IDENTITY IS A DOOR WITH FOUR OPENERS (SPEC-UI-IA §4.5, LAW 1):
// Open · New tab · Peek · Window.
//
// 🚨 WHY THIS IS NOT `<EntityRef>`. The platform's Door Law primitive resolves
// route + peek + new tab from two registries: `features/scopes/registry/
// entityRegistry.ts` (route + icon) and `features/organizations/peek/kinds-list.ts`
// (peek kinds). NEITHER carries an `hr_employee` token today — verified by grep,
// 2026-08-26 — and both files belong to lanes outside `features/hr/people/**`, so
// this lane cannot register it without editing someone else's file mid-flight.
//
// The correct end state is an `hr_employee` token in the entity registry plus an
// `hr_employee` peek kind, after which this component collapses to a thin
// `<EntityRef>` wrapper. That dependency is recorded in the lane report. Until
// then the doors exist HERE rather than not existing at all, because a person's
// name rendered as a `<span>` is the exact defect the Door Law names.
//
// The peek deliberately does NOT re-fetch. Every caller already holds the row it
// is naming (a directory row, a chart node, a header), so a quick look costs one
// popover and zero round trips — and a peek that spins is not a quick look.

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  ExternalLink,
  Eye,
  MapPin,
  PanelRight,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import DataRowWindow from "@/components/official/matrx-data-table/DataRowWindow.dynamic";
import { cn } from "@/lib/utils";

import { hrEmployeeHref, type HrOrgRef } from "../../routes";
import { HrWorkerClassChip } from "../shared/HrWorkerClassChip";
import { HrStatusChip } from "../shared/HrStatusChip";

/**
 * The minimum a caller must know to name a person. Everything beyond
 * `employeeId` + `displayName` is optional and simply does not render when the
 * caller does not hold it — the sensitivity rule applies to a peek exactly as it
 * applies to a field.
 */
export type HrPersonRef = {
  employeeId: string;
  displayName: string;
  jobTitle?: string | null;
  department?: string | null;
  location?: string | null;
  managerName?: string | null;
  managerEmployeeId?: string | null;
  workerClass?: string | null;
  status?: string | null;
  employeeNumber?: string | null;
  workEmail?: string | null;
  /** `row_basis` from the directory — a future hire's job columns are INCOMING. */
  rowBasis?: string | null;
  hireDate?: string | null;
};

function personHref(person: HrPersonRef, org: HrOrgRef, tab?: string | null) {
  return hrEmployeeHref(person.employeeId, tab ?? null, { org });
}

// ── The peek body ───────────────────────────────────────────────────────────

function PeekLine({
  icon: Icon,
  children,
}: {
  icon: typeof Building2;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words text-foreground">{children}</span>
    </div>
  );
}

export function HrPersonSummary({
  person,
  org,
}: {
  person: HrPersonRef;
  org: HrOrgRef;
}) {
  const startsLater =
    person.rowBasis === "upcoming" && Boolean(person.hireDate);

  return (
    <div className="space-y-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {person.displayName}
          </span>
          <HrStatusChip status={person.status} />
          <HrWorkerClassChip workerClass={person.workerClass} />
        </div>
        {person.employeeNumber ? (
          <div className="font-mono text-[0.6875rem] text-muted-foreground">
            {person.employeeNumber}
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        {person.jobTitle ? (
          <PeekLine icon={UserRound}>
            {person.jobTitle}
            {startsLater ? (
              <span className="ml-1 text-muted-foreground">
                (starts {person.hireDate})
              </span>
            ) : null}
          </PeekLine>
        ) : null}
        {person.department ? (
          <PeekLine icon={Building2}>{person.department}</PeekLine>
        ) : null}
        {person.location ? (
          <PeekLine icon={MapPin}>{person.location}</PeekLine>
        ) : null}
        {person.managerName ? (
          <PeekLine icon={UserRound}>
            {person.managerEmployeeId ? (
              <Link
                href={hrEmployeeHref(person.managerEmployeeId, "job", { org })}
                className="underline underline-offset-2 hover:text-primary"
              >
                {person.managerName}
              </Link>
            ) : (
              person.managerName
            )}
          </PeekLine>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button asChild size="sm" variant="secondary" className="h-8">
          <Link href={personHref(person, org)}>Open profile</Link>
        </Button>
        <Button asChild size="sm" variant="ghost" className="h-8">
          <Link href={personHref(person, org, "job")}>Job &amp; reporting</Link>
        </Button>
      </div>
    </div>
  );
}

// ── The door ────────────────────────────────────────────────────────────────

export function HrPersonDoor({
  person,
  org,
  tab,
  className,
  showControls = true,
  /** Set inside a panel/window the viewer would lose by navigating in place. */
  openInNewTab = false,
}: {
  person: HrPersonRef;
  org: HrOrgRef;
  tab?: string | null;
  className?: string;
  showControls?: boolean;
  openInNewTab?: boolean;
}) {
  const [windowOpen, setWindowOpen] = useState(false);
  const href = personHref(person, org, tab);

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <Link
        href={href}
        target={openInNewTab ? "_blank" : undefined}
        rel={openInNewTab ? "noopener noreferrer" : undefined}
        className="min-w-0 truncate text-sm font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
      >
        {person.displayName}
      </Link>

      {showControls ? (
        <span className="inline-flex shrink-0 items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Quick look at ${person.displayName}`}
                title={`Quick look at ${person.displayName}`}
                className="h-11 w-11 lg:h-5 lg:w-5"
                onClick={(event) => event.stopPropagation()}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-80 max-w-[calc(100vw-2rem)]"
              onClick={(event) => event.stopPropagation()}
            >
              <HrPersonSummary person={person} org={org} />
            </PopoverContent>
          </Popover>

          {openInNewTab ? null : (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-11 w-11 lg:h-5 lg:w-5"
            >
              <Link
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${person.displayName} in a new tab`}
                title={`Open ${person.displayName} in a new tab`}
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Open ${person.displayName} in a window`}
            title={`Open ${person.displayName} in a window`}
            className="h-11 w-11 lg:h-5 lg:w-5"
            onClick={(event) => {
              event.stopPropagation();
              setWindowOpen(true);
            }}
          >
            <PanelRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </span>
      ) : null}

      {windowOpen ? (
        <DataRowWindow
          isOpen={windowOpen}
          onClose={() => setWindowOpen(false)}
          title={person.displayName}
          windowId={`hr-person-${person.employeeId}`}
          width={420}
          height={420}
        >
          <div className="p-3">
            <HrPersonSummary person={person} org={org} />
          </div>
        </DataRowWindow>
      ) : null}
    </span>
  );
}

// ── Structure doors (§4.5) ──────────────────────────────────────────────────

/**
 * A department, location or job title. All three open the structure panel
 * focused on the row (`/hr/settings/structure?focus=<id>`), which is a real
 * route — so these are plain links, not promises.
 */
export function HrStructureDoor({
  id,
  label,
  href,
  className,
}: {
  id: string | null | undefined;
  label: string | null | undefined;
  href: string;
  className?: string;
}) {
  if (!label) return null;
  if (!id) {
    return <span className={cn("text-sm", className)}>{label}</span>;
  }
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-0.5 text-sm text-foreground underline-offset-2 hover:text-primary hover:underline",
        className,
      )}
    >
      {label}
      <ArrowUpRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
    </Link>
  );
}

/**
 * A COUNT IS A DOOR (§4.5). `12 direct reports` opens the directory filtered to
 * those people; it never renders as inert text.
 */
export function HrCountDoor({
  count,
  href,
  singular,
  plural,
  className,
}: {
  count: number;
  href: string;
  singular: string;
  plural: string;
  className?: string;
}) {
  const label = `${count} ${count === 1 ? singular : plural}`;
  if (count === 0) {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 text-sm text-foreground underline-offset-2 hover:text-primary hover:underline",
        className,
      )}
    >
      <Badge variant="secondary" className="px-1.5 py-0 text-[0.6875rem]">
        {count}
      </Badge>
      {count === 1 ? singular : plural}
    </Link>
  );
}
