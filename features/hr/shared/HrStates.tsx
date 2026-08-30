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
//     defect. The code lives BEHIND the "Error reference" disclosure — never in the
//     body, never as the message. `Technical reference: 22P02` was printed as flat
//     body text until D11, so a mistyped URL ended in a bare SQLSTATE.
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

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  ClipboardCheck,
  RefreshCw,
  ShieldOff,
  UserCog,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

import { HR_ORG_PARAM } from "../constants";
import { HrAccessDenied } from "./HrAccessDenied";
import {
  hrHref,
  hrMeHref,
  hrOrgSettingsPeopleHref,
  hrSettingsHref,
  hrSwitchEmployerHref,
} from "../routes";
import { isHrDenied, isHrFailed, type HrResult } from "../types";
import {
  isHrModuleOff,
  needsHrActivation,
  useHrContext,
  type HrContextValue,
} from "./useHrContext";
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
            {/* This error state can render before employer context exists. */}
            <Link href={hrHref(null)}>Back to HR</Link>
          </Button>
        </div>
        {/*
          🚨 THE MACHINE TOKEN GOES IN THE DISCLOSURE, NOT THE BODY — the same
          affordance as "Record reference" (`HrDecisionPanel`), "Refusal
          reference" (`HrRefusalNotice`) and "Consent reference"
          (`VerificationRowActions`). This printed `Technical reference: 22P02`
          as flat body text, so a mistyped URL ended with a bare SQLSTATE staring
          at whoever followed the link. The sentence above already says what
          happened in words; the code is for whoever has to trace it afterwards.

          "Error reference", NOT "Record reference": the siblings' labels each
          promise their own contents, and this one holds the failure's own code,
          not the address of a record.
        */}
        {code ? (
          <details className="pt-0.5">
            <summary className="cursor-pointer text-[0.6875rem] text-muted-foreground">
              Error reference
            </summary>
            <p className="mt-1 break-words font-mono text-[0.6875rem] text-muted-foreground">
              {code}
            </p>
          </details>
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
 *
 * 🚨 THIS NO LONGER DRAWS ITS OWN SCREEN. Owner ruling, 2026-08-30: a person who
 * lands somewhere they have no authority for gets the PLATFORM'S one refusal
 * surface — same look, same doors, same request-access affordance — everywhere
 * in the product. HR keeps the half only HR can know: the sentence. The frame is
 * `features/access-gate`, reached through the single wrapper `HrAccessDenied`;
 * this component is now the HR-context adapter in front of it (persona home
 * door, and the one requestable class) and nothing else.
 *
 * `employerRef` is the ONLY way a request-access button appears on an HR
 * refusal. Read the header of `HrAccessDenied.tsx` before adding a second one.
 */
export function HrNoAccess({
  personaHomeHref,
  sentence,
  employerRef,
  className,
}: {
  personaHomeHref?: string;
  sentence?: string;
  /**
   * The employer a link named that this person has no standing in (uuid or
   * slug). Present ⇒ the refusal is requestable against that ORGANIZATION.
   * Leave unset — the default, absolute, is the safe answer for every HR record
   * refusal, and the §5 subject-exclusion veto depends on it.
   */
  employerRef?: string | null;
  className?: string;
}) {
  const { persona, orgRef } = useHrContext();
  const fallbackHref =
    personaHomeHref ?? (persona === "employee" ? hrMeHref(orgRef) : hrHref(orgRef));
  const fallbackLabel = persona === "employee" ? "Go to My Info" : "Go to HR home";

  return (
    <div className={cn("w-full min-w-0", className)}>
      <HrAccessDenied
        sentence={sentence?.trim() || "This part of HR isn't yours here."}
        fallbackHref={fallbackHref}
        fallbackLabel={fallbackLabel}
        employerRef={employerRef}
      />
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
  // The picker is itself the pre-employer-context state.
  const pathname = usePathname() ?? hrHref(null);
  const askedEmployerRef =
    useSearchParams()?.get(HR_ORG_PARAM)?.trim() || null;

  if (isLoading) return <HrLoading variant="cards" rows={3} className={className} />;

  const choosable = employers.filter(
    (employer) => employer.module_enabled || isOrgSteward(employer.org_role),
  );

  if (choosable.length === 0) {
    /*
      🚨 A LINK NAMED AN EMPLOYER AND THIS PERSON HAS NO STANDING IN IT.
      This is the SMS-deep-link landing (owner, 2026-08-30), and there is
      nothing to pick — offering a chooser with no choices is the dead end the
      canonical refusal exists to kill. So it becomes the platform's denial
      about that ORGANIZATION, with the request-access click that reaches its
      owners and admins. With no `?org=` there is nothing to name and nothing to
      ask for, so the plain page stands.
    */
    if (askedEmployerRef) {
      return (
        <div className={cn("w-full min-w-0", className)}>
          <HrAccessDenied
            sentence="You don't work here as far as HR is concerned, so there's nothing in this employer's HR for you to open."
            fallbackHref={hrHref(null)}
            fallbackLabel="Back to HR"
            employerRef={askedEmployerRef}
          />
        </div>
      );
    }

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

// ── 4b. The employer we opened is not the one you asked for ─────────────────

/**
 * 🚨 LAW B IS STATED EXACTLY ONCE PER PAGE, AND NEVER ZERO TIMES.
 *
 * The disclosure used to live in `HrShell` alone, and thirteen `/hr/*` pages do not
 * mount `HrShell` — `/hr/tasks`, `/hr/tasks/[instanceId]` (the route every HR
 * notification deep-links to) and the whole `/hr/me/*` family. So on exactly the
 * surfaces an outside link lands somebody on, HR could open a different employer in
 * silence. Proven live on 2026-08-29: `/hr?org=<unreachable>` said so; the same
 * `?org=` on `/hr/tasks/<instance>` said nothing and rendered another employer's
 * pay change.
 *
 * So the notice now hangs off `HrPageState` — the ordered state machine EVERY HR
 * surface already runs through — and the chromes that state it above the page
 * (`HrShell`, the two task surfaces) CLAIM it through this context so the nested
 * `HrPageState` inside them stands down. Outermost renderer wins. Never render
 * `HrEmployerSubstitutionNotice` without claiming, and never claim without
 * rendering it.
 */
const HrDisclosureClaimedContext = createContext(false);

/**
 * Wrap a subtree whose chrome has ALREADY stated the substitution, so the
 * `HrPageState` inside it does not state it a second time.
 */
export function HrDisclosureClaimed({ children }: { children: ReactNode }) {
  return (
    <HrDisclosureClaimedContext.Provider value={true}>
      {children}
    </HrDisclosureClaimedContext.Provider>
  );
}

/** True when an ancestor chrome already stated the substitution. */
export function useHrDisclosureClaimed(): boolean {
  return useContext(HrDisclosureClaimedContext);
}


/**
 * 🚨 NO EMPLOYER IS EVER SUBSTITUTED IN SILENCE (`useHrContext` law B).
 *
 * `useHrContextResolver` legitimately rescues a person whose asked-for employer
 * cannot do HR — without it, a multi-employer admin whose global active org is her
 * personal workspace lands in an empty HR with no way in. But an unannounced swap is
 * the same defect as a link that quietly changes employer, which is the one thing
 * every URL rule in `routes.ts` exists to prevent. So the rescue always says so.
 *
 * NOT a modal, NOT a toast, and NOT dismissible: it is a statement of which employer
 * this page is showing, and it must still be true the moment somebody looks up.
 */
/**
 * The rescue landed nowhere: `?org=` named an employer this person cannot do HR
 * in, and the employer they were rescued into has HR off or unfinished — so the
 * substitution bought them nothing and `HrPageState` refuses about the ASKED-FOR
 * employer instead, through the canonical access-denied primitive.
 *
 * ONE predicate, consulted by the state machine that renders the refusal AND by
 * the substitution notice that must stand down for it. Two copies of this
 * condition would drift into a page that says both things or neither.
 */
export function hrRescueLandedNowhere(context: HrContextValue): boolean {
  return (
    context.substitution?.reason === "unavailable" &&
    Boolean(context.active) &&
    (isHrModuleOff(context) || needsHrActivation(context))
  );
}

/**
 * The rescue-landed-nowhere refusal, for the surfaces that do NOT run
 * `HrPageState` — `/hr/tasks` and `/hr/tasks/[instanceId]`, the exact routes
 * every HR notification and SMS deep-links to, and the ones with no `HrShell`
 * above them.
 *
 * 🚨 THIS IS NOT OPTIONAL ON THOSE ROUTES. `HrEmployerSubstitutionNotice` stands
 * down when the rescue landed nowhere because THIS refusal says it better; a
 * surface that suppresses the notice and renders neither shows an empty inbox
 * for an employer the person never asked about, which reads as "nothing is
 * waiting on you" — the one lie an approval inbox must never tell.
 *
 * Returns null in every ordinary case, so it costs nothing.
 */
export function useHrRescueRefusal(personaHomeHref?: string): ReactNode {
  const context = useHrContext();
  const askedEmployerRef =
    useSearchParams()?.get(HR_ORG_PARAM)?.trim() || null;

  if (!hrRescueLandedNowhere(context) || !askedEmployerRef) return null;

  return (
    <HrNoAccess
      personaHomeHref={personaHomeHref}
      sentence="You don't work here as far as HR is concerned, so there's nothing in this employer's HR for you to open."
      employerRef={askedEmployerRef}
    />
  );
}

export function HrEmployerSubstitutionNotice({
  className,
}: { className?: string } = {}) {
  const context = useHrContext();
  const { substitution } = context;
  if (!substitution) return null;

  /*
    🚨 LAW B IS NOT BROKEN HERE — IT IS SATISFIED HARDER.
    The law is that no employer is ever substituted in SILENCE. When the rescue
    landed nowhere, nothing is substituted at all: the page below is the
    canonical refusal, and it names the asked-for employer out loud. Saying "so
    this is your Workspace" above a page that refuses about Castellano & Reyes
    would be two different answers to one question, and the banner's is false.
  */
  if (hrRescueLandedNowhere(context)) return null;

  const { askedName, askedRef, reason, openedName } = substitution;

  const sentence =
    reason === "module-off"
      ? `${askedName ?? "The employer you asked for"} doesn't have HR turned on, so this is ${openedName}.`
      : `That link named an employer you can't do HR in, so this is ${openedName}.`;

  return (
    <div
      role="status"
      data-hr-employer-substitution={reason}
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100",
        className,
      )}
    >
      <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{sentence}</span>
      {/* The way back is a real door: `?org=` is honored now, so a module-off
          employer opens its enable door instead of bouncing back to here. */}
      {askedRef ? (
        <Link
          href={hrHref(askedRef)}
          className="shrink-0 font-medium underline underline-offset-2 hover:no-underline"
        >
          Open {askedName ?? "it"} anyway
        </Link>
      ) : null}
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
  const disclosureClaimed = useHrDisclosureClaimed();
  // What the link ASKED for, not what resolved — the whole point of the
  // no-standing case is that nothing resolved.
  const askedEmployerRef =
    useSearchParams()?.get(HR_ORG_PARAM)?.trim() || null;

  if (context.isLoading) return <HrLoading variant={variant} rows={rows} />;

  if (context.error) {
    // A refusal at the CONTEXT level means this person has no HR standing at all
    // — that is the no-access state, not an error state.
    if (context.error.kind === "denied") {
      /*
        🚨 THE SMS-DEEP-LINK CASE (owner, 2026-08-30 — he hit it on his phone).
        A refusal at the CONTEXT level means this person has no HR standing in
        this employer AT ALL — not that a record is hidden from them. That is
        the one HR refusal where asking is a real option, so it names the
        employer the link asked for and carries the canonical Request-access
        click through to that organization's owners and admins.

        Every OTHER HR refusal below stays absolute. See `HrAccessDenied.tsx`.
      */
      return (
        <HrNoAccess
          personaHomeHref={personaHomeHref}
          sentence={noAccessSentence}
          employerRef={askedEmployerRef}
        />
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

  /*
    🚨 THE SMS-DEEP-LINK LANDING (owner, on his phone, 2026-08-30).

    `?org=` named an employer this person cannot do HR in, so
    `useHrContextResolver` rescued them into an employer they CAN use — and the
    rescue landed on one with HR switched off or never set up. The result was a
    page about the WRONG ORGANIZATION offering to turn HR on there, which
    answers a question nobody asked, and gives the person no way at all to reach
    the employer the link was actually about.

    That is landing on a page you have no authority for, so it gets the
    platform's one refusal surface: the asked-for employer named honestly, and
    the canonical Request-access click through to that organization's owners and
    admins.

    NARROW ON PURPOSE. The rescue is a real kindness for a multi-employer person
    whose active org happens to be personal — she still gets her HR plus the
    substitution notice (law B). This fires only where the rescue produced
    NOTHING USABLE, which is the case where the notice was the whole page.
  */
  if (hrRescueLandedNowhere(context) && askedEmployerRef) {
    return (
      <HrNoAccess
        personaHomeHref={personaHomeHref}
        sentence="You don't work here as far as HR is concerned, so there's nothing in this employer's HR for you to open."
        employerRef={askedEmployerRef}
      />
    );
  }

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

  /*
    🚨 STATE 9 IS NOT JUST "THE PAGE" — IT IS THE PAGE, PLUS WHICH EMPLOYER IT IS.
    Every other state above says out loud what the HR context turned out to be; the
    granted page that opened a DIFFERENT employer than the link asked for was the one
    that said nothing. `HrEmployerSubstitutionNotice` renders null in the ordinary
    case, so this adds ZERO DOM unless an employer really was swapped.
  */
  if (disclosureClaimed) return <>{children}</>;
  return (
    <HrDisclosureClaimed>
      <HrEmployerSubstitutionNotice className="mx-4 mt-3 sm:mx-6" />
      {children}
    </HrDisclosureClaimed>
  );
}
