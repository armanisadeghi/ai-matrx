// features/hr/shared/HrStates.tsx
//
// THE FOUR UNIVERSAL STATES EVERY HR PAGE IMPLEMENTS BEFORE ITS OWN
// (SPEC-EMPLOYEES §2 "Universal states", SPEC-UI-IA §1 / §4.2).
//
// A page that hand-rolls any of these is a review failure — not because the code
// would be longer, but because every hand-rolled version has so far broken one of
// the four rules below:
//
//  1. LOADING is a skeleton IN THE REAL LAYOUT. Never a spinner over an empty page,
//     never a layout shift on arrival, never the words "Loading…".
//  2. ERROR names the failed operation IN WORDS, says what the actor does next, and
//     offers a retry. A raw Postgres code or a bare "something went wrong" is a
//     defect. The code may appear as a secondary technical reference, never as the
//     message.
//  3. NO-ACCESS renders the persona's nearest legitimate surface with ONE sentence.
//     Never a permission wall over a real layout, and NEVER a hint that the record
//     exists — "not reachable" and "does not exist" must read identically, because
//     the server deliberately refuses to distinguish them (service.ts).
//  4. NO-EMPLOYER renders the employer picker AS THE PAGE. A chooser is a legitimate
//     page state; a blocked page is not. It is never a modal.
//
// Plus the two module-level states, which are ABSENT-not-disabled all the way down:
//  • MODULE OFF   → an owner/admin gets ONE enable door; everyone else gets a plain
//                   "HR is not enabled here" page with no door they cannot open.
//  • EMPTY ORG    → HR is on but nobody ran the activation wizard, so the activation
//                   door IS the page (SPEC-EMPLOYEES §2.1: an org with no employer
//                   profile has no other legitimate first screen).
//
// `<HrPageState>` runs all of them in order so no page re-implements the sequence.

"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  ClipboardCheck,
  Compass,
  RefreshCw,
  ShieldOff,
  UserCog,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import {
  hrHref,
  hrMeHref,
  hrOrgSettingsPeopleHref,
  hrSettingsHref,
  hrSwitchEmployerHref,
} from "../routes";
import { isHrDenied, isHrFailed, type HrResult } from "../types";
import { isHrModuleOff, needsHrActivation, useHrContext } from "./useHrContext";
import { isOrgSteward } from "./useHrPersona";

// ── 1. Loading ──────────────────────────────────────────────────────────────

export type HrLoadingVariant = "table" | "profile" | "cards" | "panel";

/**
 * A skeleton shaped like the surface that is coming, so the page does not jump
 * when the data lands. Pick the variant that matches the real layout — a `table`
 * skeleton over a profile page is the layout shift this component exists to stop.
 */
export function HrLoading({
  variant = "panel",
  rows = 6,
  className,
}: {
  variant?: HrLoadingVariant;
  rows?: number;
  className?: string;
}) {
  const count = Math.max(1, Math.min(rows, 24));

  return (
    <div
      className={cn("w-full min-w-0 p-4 sm:p-6", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading this HR view.</span>
      {variant === "table" ? <TableSkeleton rows={count} /> : null}
      {variant === "profile" ? <ProfileSkeleton rows={count} /> : null}
      {variant === "cards" ? <CardsSkeleton rows={count} /> : null}
      {variant === "panel" ? <PanelSkeleton rows={count} /> : null}
    </div>
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full max-w-xs" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center gap-4 border-b border-border bg-muted/40 px-3 py-2.5">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="hidden h-3.5 w-28 sm:block" />
          <Skeleton className="hidden h-3.5 w-24 md:block" />
          <Skeleton className="ml-auto h-3.5 w-16" />
        </div>
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-border px-3 py-3 last:border-b-0"
          >
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40 max-w-full" />
              <Skeleton className="h-3 w-24 max-w-full" />
            </div>
            <Skeleton className="hidden h-3.5 w-24 md:block" />
            <Skeleton className="h-3.5 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-56 max-w-full" />
          <Skeleton className="h-3.5 w-72 max-w-full" />
          <Skeleton className="h-3.5 w-40 max-w-full" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-36 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CardsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="space-y-3 rounded-lg border border-border bg-card p-4"
        >
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-48" />
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-3.5 w-32 shrink-0" />
            <Skeleton className="h-3.5 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 2. Error ────────────────────────────────────────────────────────────────

/**
 * Turn anything a caller can hold into a sentence a human can act on.
 *
 * `HrResult` failures already carry a phrased message (service.ts writes it), so
 * the common path is a pass-through. Everything else gets a sentence built AROUND
 * the operation, never the raw text alone — "column x does not exist" is not an
 * answer to "what failed?".
 */
function asHrRefusal(error: unknown): HrResult<unknown> | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { ok?: unknown; kind?: unknown };
  if (candidate.ok !== false) return null;
  if (candidate.kind !== "denied" && candidate.kind !== "failed") return null;
  return error as HrResult<unknown>;
}

export function hrErrorSentence(error: unknown, operation: string): string {
  const failedAt = operation.trim() || "This HR view";

  const refusal = asHrRefusal(error);
  if (refusal) {
    if (isHrFailed(refusal)) return refusal.message;
    if (isHrDenied(refusal)) {
      return refusal.detail?.trim() || `${failedAt} is not available to you here.`;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return `${failedAt} did not finish. ${error.message.trim()}`;
  }

  if (typeof error === "string" && error.trim()) {
    return `${failedAt} did not finish. ${error.trim()}`;
  }

  return `${failedAt} did not finish, and the server did not say why.`;
}

function hrErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

/**
 * The failed operation in words, the actor's next move, and a retry.
 *
 * `operation` is a phrase this component puts in a sentence — "The employee
 * directory", "Cancelling this scheduled change". Never a function name.
 */
export function HrError({
  operation,
  error,
  onRetry,
  nextStep,
  className,
}: {
  operation: string;
  error: unknown;
  onRetry?: () => void;
  nextStep?: string;
  className?: string;
}) {
  const sentence = hrErrorSentence(error, operation);
  const code = hrErrorCode(error);

  return (
    <div className={cn("w-full min-w-0 p-4 sm:p-6", className)} role="alert">
      <div className="mx-auto flex max-w-xl flex-col items-start gap-3 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-semibold text-foreground">{sentence}</h2>
            <p className="text-sm text-muted-foreground">
              {nextStep?.trim() ||
                "Try again. If it keeps happening, nothing was changed — send this screen to whoever runs HR here."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onRetry ? (
            <Button
              type="button"
              size="sm"
              onClick={onRetry}
              className="min-h-11 sm:min-h-9"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          ) : null}
          <Button
            asChild
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-9"
          >
            <Link href={hrHref()}>Back to HR</Link>
          </Button>
        </div>
        {code ? (
          <p className="text-[0.6875rem] text-muted-foreground">
            Technical reference: {code}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ── 3. No access ────────────────────────────────────────────────────────────

/**
 * 🚨 NEVER A PERMISSION WALL, AND NEVER A LEAK.
 *
 * The sentence must read the same whether the record is unreachable or does not
 * exist. Anything that says "you do not have permission to view THIS EMPLOYEE"
 * has already disclosed that the employee exists.
 *
 * The route is separately ABSENT from the nav (`resolveHrNav`), so a person only
 * lands here by typing a URL or following a stale link.
 */
export function HrNoAccess({
  personaHomeHref,
  sentence,
  className,
}: {
  personaHomeHref?: string;
  sentence?: string;
  className?: string;
}) {
  const { persona, orgRef } = useHrContext();
  const fallbackHref =
    personaHomeHref ?? (persona === "employee" ? hrMeHref(orgRef) : hrHref(orgRef));
  const fallbackLabel = persona === "employee" ? "Go to My Info" : "Go to HR home";

  return (
    <div className={cn("w-full min-w-0 p-4 sm:p-6", className)}>
      <div className="mx-auto flex max-w-xl flex-col items-start gap-3 rounded-lg border border-border bg-card p-4 sm:p-6">
        <Compass className="h-5 w-5 shrink-0 text-muted-foreground" />
        <p className="text-sm text-foreground">
          {sentence?.trim() || "This part of HR isn't yours here."}
        </p>
        <Button asChild size="sm" className="min-h-11 sm:min-h-9">
          <Link href={fallbackHref}>{fallbackLabel}</Link>
        </Button>
      </div>
    </div>
  );
}

// ── 4. No employer — the picker AS THE PAGE ─────────────────────────────────

/**
 * SPEC-UI-IA §1 rule 4. A chooser is a legitimate page state; a blocked page is
 * not. This is never a modal and never a dropdown-on-an-empty-shell.
 *
 * The list is `hr_my_context().employers`, which the server already limits to
 * employers this person can do HR in — plus an employer whose module is OFF when
 * they are its owner/admin, because they are the only one who can turn it on.
 * Switching is a full context change: the SAME route with a new `?org=`.
 */
export function HrEmployerPicker({ className }: { className?: string } = {}) {
  const { employers, isLoading } = useHrContext();
  const pathname = usePathname() ?? hrHref();

  if (isLoading) return <HrLoading variant="cards" rows={3} className={className} />;

  const choosable = employers.filter(
    (employer) => employer.module_enabled || isOrgSteward(employer.org_role),
  );

  if (choosable.length === 0) {
    return (
      <div className={cn("w-full min-w-0 p-4 sm:p-6", className)}>
        <div className="mx-auto flex max-w-xl flex-col items-start gap-3 rounded-lg border border-border bg-card p-4 sm:p-6">
          <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            No employer here uses HR yet
          </h2>
          <p className="text-sm text-muted-foreground">
            HR belongs to one employer at a time. An owner or admin of an
            organization turns it on in that organization&apos;s settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full min-w-0 p-4 sm:p-6", className)}>
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">
            Which employer?
          </h2>
          <p className="text-sm text-muted-foreground">
            HR is per employer — headcount, timesheets and pay never mix across
            organizations. Pick one and this page opens for it.
          </p>
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {choosable.map((employer) => {
            const ref = employer.slug?.trim() || employer.organization_id;
            return (
              <li key={employer.organization_id}>
                <Link
                  href={hrSwitchEmployerHref(pathname, ref)}
                  className="flex min-h-[3.25rem] w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-accent"
                >
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {employer.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {employer.module_enabled
                        ? employer.is_activated
                          ? "HR is set up"
                          : "HR is on — setup not finished"
                        : "HR is off — you can turn it on"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ── Module-level states — ABSENT, NOT DISABLED ──────────────────────────────

/**
 * HR is switched off for this employer. An owner/admin gets ONE door — the org's
 * People settings, where the toggle lives. Everyone else gets a plain page with
 * no control they cannot use: a disabled enable-button would be a taunt.
 */
export function HrModuleOff({
  organizationId,
  canEnable,
  className,
}: {
  organizationId: string;
  canEnable: boolean;
  className?: string;
}) {
  return (
    <div className={cn("w-full min-w-0 p-4 sm:p-6", className)}>
      <div className="mx-auto flex max-w-xl flex-col items-start gap-3 rounded-lg border border-border bg-card p-4 sm:p-6">
        <ShieldOff className="h-5 w-5 shrink-0 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          HR isn&apos;t turned on for this organization
        </h2>
        <p className="text-sm text-muted-foreground">
          {canEnable
            ? "You can turn it on in this organization's settings. Nothing is created until you finish setup."
            : "An owner or admin of this organization turns it on."}
        </p>
        {canEnable ? (
          <Button asChild size="sm" className="min-h-11 sm:min-h-9">
            <Link href={hrOrgSettingsPeopleHref(organizationId)}>
              <UserCog className="mr-2 h-4 w-4" />
              Turn on HR
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * HR is ON but this employer has no `hr.employer_profile` — nobody ran §2.4's
 * activation wizard. The activation door IS the page: an org with no employer
 * profile has no other legitimate first screen (SPEC-EMPLOYEES §2.1).
 *
 * 🚨 STUB SEAM — the wizard itself is `features/hr/settings/activation/
 * HrActivationWizard.tsx`, owned by the settings lane and NOT PRESENT YET
 * (checked 2026-08-26). Until it lands this renders the door only. When it
 * lands, replace the `<Link>` below with ONE `next/dynamic` edge rendered behind
 * this same `canActivate` condition — one boundary, at the edge, conditionally
 * rendered (code-splitting skill, Method A). Do not add a second boundary.
 */
export function HrEmptyOrg({
  organizationId,
  canActivate,
  className,
}: {
  organizationId: string;
  canActivate: boolean;
  className?: string;
}) {
  return (
    <div className={cn("w-full min-w-0 p-4 sm:p-6", className)}>
      <div className="mx-auto flex max-w-xl flex-col items-start gap-3 rounded-lg border border-border bg-card p-4 sm:p-6">
        <ClipboardCheck className="h-5 w-5 shrink-0 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          {canActivate ? "Set up HR for this employer" : "HR isn't set up here yet"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {canActivate
            ? "Tell us who the employer of record is, where people work, and who runs HR. It takes three steps and you can change all of it later."
            : "Whoever owns this organization finishes setup before anyone can be added."}
        </p>
        {canActivate ? (
          <Button asChild size="sm" className="min-h-11 sm:min-h-9">
            <Link href={hrSettingsHref("employer", { org: organizationId })}>
              Set up HR
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ── The one wrapper that runs them in order ─────────────────────────────────

/**
 * Run every universal state in the ONE correct order so no page re-implements it.
 *
 * Order, and why:
 *   1. employer context still resolving  → skeleton (never a flash of the picker)
 *   2. employer context failed           → error with a retry
 *   3. no employer resolved              → the picker AS THE PAGE
 *   4. module off                        → the enable door (or a plain page)
 *   5. module on, never activated        → the activation door
 *   6. the page's own load               → skeleton in the real layout
 *   7. the page's own failure            → error in words
 *   8. the page's own refusal            → the nearest legitimate surface
 *   9. the page
 *
 * `granted` is the page's OWN access answer (`HrResult.ok === false && kind ===
 * "denied"`). Leave it undefined when the page has no per-record gate.
 */
export function HrPageState({
  loading = false,
  error = null,
  granted,
  children,
  operation = "This HR view",
  onRetry,
  nextStep,
  variant = "panel",
  rows = 6,
  personaHomeHref,
  noAccessSentence,
  /** Set false for a surface that legitimately renders with no employer (rare). */
  requireEmployer = true,
}: {
  loading?: boolean;
  error?: unknown;
  granted?: boolean;
  children: ReactNode;
  operation?: string;
  onRetry?: () => void;
  nextStep?: string;
  variant?: HrLoadingVariant;
  rows?: number;
  personaHomeHref?: string;
  noAccessSentence?: string;
  requireEmployer?: boolean;
}) {
  const context = useHrContext();

  if (context.isLoading) return <HrLoading variant={variant} rows={rows} />;

  if (context.error) {
    // A refusal at the CONTEXT level means this person has no HR standing at all
    // — that is the no-access state, not an error state.
    if (context.error.kind === "denied") {
      return (
        <HrNoAccess personaHomeHref={personaHomeHref} sentence={noAccessSentence} />
      );
    }
    return (
      <HrError
        operation="Your HR employers"
        error={context.error}
        onRetry={context.refresh}
        nextStep={nextStep}
      />
    );
  }

  if (requireEmployer && !context.active) return <HrEmployerPicker />;

  if (context.active && isHrModuleOff(context)) {
    return (
      <HrModuleOff
        organizationId={context.active.organization_id}
        canEnable={isOrgSteward(context.active.org_role)}
      />
    );
  }

  if (context.active && needsHrActivation(context)) {
    return (
      <HrEmptyOrg
        organizationId={context.active.organization_id}
        canActivate={context.active.can_activate}
      />
    );
  }

  if (loading) return <HrLoading variant={variant} rows={rows} />;

  if (error) {
    return (
      <HrError
        operation={operation}
        error={error}
        onRetry={onRetry}
        nextStep={nextStep}
      />
    );
  }

  if (granted === false) {
    return (
      <HrNoAccess personaHomeHref={personaHomeHref} sentence={noAccessSentence} />
    );
  }

  return <>{children}</>;
}
