"use client";

// features/hr/shared/hrScope.tsx
//
// THE ONE PLACE HR LISTS SPAN EMPLOYERS (Arman, 2026-09-30 — common-docs
// /policies/access-ladder.md; the header of `useHrContext.ts`
// states the whole rule).
//
//   • A LIST a person browses reads every employer in `scope.employers` through
//     `fanOutHr` and labels each row with its employer (`HrEmployerLabel`). The
//     doors are still one-employer-per-call and still decide, per viewer, what comes
//     back — this file adds no access check and removes none.
//   • `HrOrgFilter` is the VISIBLE filter that narrows the list to one employer
//     (`?org_filter=`). It never touches the active organization.
//   • An AGGREGATE or an ACTION does not use this file: it reads `useHrContext().active`
//     and renders `HrEmployerPicker` while that is null (`HrPageState requireEmployer`).

import { Building2 } from "lucide-react";

import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import { useOrgFilterParam } from "@/lib/entity-list/orgFilterUrl";
import { cn } from "@/lib/utils";

import type {
  HrActiveEmployer,
  HrDenied,
  HrEmployer,
  HrFailed,
  HrResult,
} from "../types";
import { useHrContext } from "./useHrContext";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
/** The employer a row belongs to — the org as a column/label, never a group heading. */
export type HrRowEmployer = {
  organizationId: string;
  name: string;
  slug: string | null;
};

export function toRowEmployer(employer: HrEmployer): HrRowEmployer {
  return {
    organizationId: employer.organization_id,
    name: employer.name,
    slug: employer.slug,
  };
}

/** One in-scope employer that could not be read, for the partial-result notice. */
export type HrUnavailableEmployer = {
  employer: HrRowEmployer;
  kind: "denied" | "failed";
};

export type HrFanOut<T> = {
  parts: Array<{ employer: HrRowEmployer; data: T }>;
  /** Employers in scope whose door refused or failed — stated on the page, never dropped silently. */
  unavailable: HrUnavailableEmployer[];
};

/**
 * Call one door per employer in scope and gather the answers.
 *
 * A refusal from one employer is that employer's answer — it is not hidden behind the
 * others' rows and it is not turned into an empty list: it comes back in `unavailable`
 * and the surface names it. Only when EVERY employer refuses (or fails) does the whole
 * call refuse (or fail), carrying the first refusal/failure unchanged — so a
 * single-employer view behaves exactly as it did before.
 */
export async function fanOutHr<T>(
  employers: readonly HrRowEmployer[],
  call: (organizationId: string) => Promise<HrResult<T>>,
): Promise<HrResult<HrFanOut<T>>> {
  const answers = await Promise.all(
    employers.map(async (employer) => ({
      employer,
      result: await call(employer.organizationId),
    })),
  );

  const parts: HrFanOut<T>["parts"] = [];
  const unavailable: HrUnavailableEmployer[] = [];
  let firstDenied: HrDenied | null = null;
  let firstFailed: HrFailed | null = null;

  for (const { employer, result } of answers) {
    if (result.ok) {
      parts.push({ employer, data: result.data });
    } else if (result.kind === "denied") {
      firstDenied ??= result;
      unavailable.push({ employer, kind: "denied" });
    } else {
      firstFailed ??= result;
      unavailable.push({ employer, kind: "failed" });
    }
  }

  if (parts.length === 0) {
    if (firstFailed) return firstFailed;
    if (firstDenied) return firstDenied;
    // No employer in scope at all: an empty answer, not a refusal.
    return { ok: true, data: { parts: [], unavailable: [] } };
  }
  return { ok: true, data: { parts, unavailable } };
}

/**
 * WHERE A NEW RECORD IS SAVED. A create (new employee, new incident, new verification
 * request) needs exactly one employer:
 *   1. the one the page already resolved — the org filter's employer, or the sole one; else
 *   2. under All organizations, the ACTIVE organization through the existing org gate, when it
 *      is an employer this person does HR in; else
 *   3. none — the create surface says to pick an organization.
 * This is the only place HR reads the active organization, and only as a write target: the
 * record, once it exists, carries its own organization everywhere (lists label it, links and
 * dialogs act in it).
 */
export function useHrWriteEmployer(): {
  active: HrActiveEmployer | null;
  organizationId: string | null;
} {
  const { active, scope } = useHrContext();
  // org-filter: write-target a new record is saved into the active organization when no employer filter names one
  const { organizationId: activeOrgId } = useOrganizationRequired();

  if (active) return { active, organizationId: active.organization_id };
  const fromActiveOrg =
    (activeOrgId
      ? scope.actives.find((a) => a.organization_id === activeOrgId)
      : undefined) ?? null;
  return {
    active: fromActiveOrg,
    organizationId: fromActiveOrg?.organization_id ?? null,
  };
}

/** Stable, serializable form of the scope, for a `useHrRequest` key. */
export function scopeKey(employers: readonly HrRowEmployer[]): HrRowEmployer[] {
  return employers.map((e) => ({
    organizationId: e.organizationId,
    name: e.name,
    slug: e.slug,
  }));
}

/**
 * The visible organization filter for an HR list. Renders nothing for a person with a
 * single employer (there is nothing to choose) unless the URL already names one, in
 * which case the narrowing is shown so it can be cleared. Default: All organizations.
 */
export function HrOrgFilter({ className }: { className?: string }) {
  const { employers, scope } = useHrContext();
  const [orgFilter, setOrgFilter] = useOrgFilterParam();
  const reachable = employers.filter((e) => e.module_enabled).length;

  if (!orgFilter && reachable < 2 && scope.employers.length < 2) return null;

  return (
    <EntityOrgFilter
      orgId={orgFilter}
      onChange={setOrgFilter}
      className={className}
    />
  );
}

/**
 * Whether a list spans several employers (so it owes an Organization column), and the name of
 * the employer an `organization_id` belongs to. Reads the page's resolved scope only.
 */
export function useHrEmployerNames(): {
  spansEmployers: boolean;
  nameOf: (organizationId: string | null | undefined) => string | null;
} {
  const { scope } = useHrContext();
  return {
    spansEmployers: scope.employers.length > 1,
    nameOf: (organizationId) =>
      organizationId
        ? (scope.employers.find((e) => e.organization_id === organizationId)?.name ?? null)
        : null,
  };
}

/** The employer on a row, as a small neutral label — for cards and table cells alike. */
export function HrEmployerLabel({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      data-hr-employer-label=""
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground",
        className,
      )}
      title={name}
    >
      <Building2 className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** States, in words, which employers a merged list could not read. Null when none. */
export function HrUnavailableNotice({
  unavailable,
  className,
}: {
  unavailable: readonly HrUnavailableEmployer[];
  className?: string;
}) {
  if (unavailable.length === 0) return null;
  const names = unavailable.map((u) => u.employer.name).join(", ");
  const allDenied = unavailable.every((u) => u.kind === "denied");
  return (
    <p data-error-box
      role="status"
      className={cn(
        "rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      {allDenied ? `Not shown: ${names}` : `Could not read: ${names}`}
    <ErrorAlchemyMenu /></p>
  );
}
