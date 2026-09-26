"use client";

// OrganizationRequiredNotice — the ONE honest screen for "nothing loaded
// because no organization is selected".
//
// THE STATE THIS EXISTS FOR
// ------------------------
// Every Matrx transport fails CLOSED with no organization selected: the kernel
// (`requireOrganizationContext`) and `requireSelectedOrgId` both throw
// `OrganizationContextError("organization_context_required", …)` BEFORE any
// networking. That is right on the wire and wrong on a screen — its sentence
// ("Select an organization before sending this request.") is an instruction to
// a programmer: no remedy, no control, and a Retry button that fails
// identically forever.
//
// Boot is supposed to make this rare: `resolveActiveOrgContext` and its
// recovery twin end every boot with an explicit selection whenever the user
// belongs to ANY organization. What is left is the genuinely unresolved case
// (no memberships, or a selection cleared mid-session) — and Law 4 says that
// state is stated honestly, with the fix attached, or not shown at all.
//
// USAGE
//   if (isOrganizationRequiredError(error)) return <OrganizationRequiredNotice />;
//
// Shape knobs, all optional:
//   `what`                 — subject for the default headline ("System jobs").
//   `title` / `description`— override the copy outright for a surface whose
//                            own sentence is more specific than the default.
//   `compact`              — drop the outer frame/centering for use INSIDE an
//                            already-framed card, panel, or list.
//   `onRetry`              — re-run the load after a pick; omitted = no button.

import { Building2, LogIn } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import {
  ORGANIZATION_UNAVAILABLE_DESCRIPTION,
  ORGANIZATION_UNAVAILABLE_TITLE,
  useOrganizationRequired,
  type OrganizationState,
} from "@/features/organizations/useOrganizationRequired";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { OrganizationPickerPanel } from "@/features/organizations/components/OrganizationPickerPanel";

// The recogniser's ONE home is `lib/organizations/organizationRequiredError`.
// It is re-exported here because this component and that predicate are always
// used together and ~20 call sites already import the pair from this path —
// one definition, two import paths, never two implementations.
export { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";

export interface OrganizationRequiredNoticeProps {
  /** What could not be loaded, e.g. "System jobs". Used in the default headline. */
  what?: string;
  /** Override the headline outright. */
  title?: string;
  /** Override the explanatory sentence outright. */
  description?: string;
  /** Drop the icon/outer frame for use inside an already-framed card or panel. */
  compact?: boolean;
  /** Re-run the load after the user picks. Omitted → no retry button. */
  onRetry?: () => void;
  className?: string;
}

/**
 * `what` as it reads INSIDE a sentence: the first letter lowered unless the
 * first word is an acronym ("CRM contacts" stays "CRM contacts").
 */
export function subjectInSentence(what: string): string {
  const trimmed = what.trim();
  if (/^[A-Z]{2}/.test(trimmed)) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

/**
 * 🚨 THE HEADLINE NEVER HAS TO AGREE IN NUMBER WITH ITS SUBJECT.
 *
 * It used to be `${what} need an organization`, which is right for "Tasks"
 * and wrong for every singular subject a caller passes — cold walk 22 read
 * "Your agenda need an organization" on the dashboard, and the census found
 * "This meeting", "Scanner health", "This site's tracking" and "a new
 * education note" in the same shape. Guessing number from the last word fails
 * on "people" and on subjects with a trailing clause, so the sentence is built
 * so that number never matters: the subject is the object of "for".
 */
export function organizationNeededFor(what: string): string {
  return `An organization is needed for ${subjectInSentence(what)}`;
}

const DEFAULT_DESCRIPTION =
  "Nothing was loaded because no organization is selected for this session. " +
  "Every request is filed under one organization, so pick the one you are " +
  "working in — you can switch any time from the avatar menu.";

export function OrganizationRequiredNotice({
  what,
  title,
  description = DEFAULT_DESCRIPTION,
  compact = false,
  onRetry,
  className,
}: OrganizationRequiredNoticeProps) {
  const headline =
    title ?? (what ? organizationNeededFor(what) : "Choose an organization");

  const picker = (
    <div className="w-full rounded-md border border-border p-1 text-left">
      <OrganizationPickerPanel />
    </div>
  );

  const retry = onRetry ? (
    <Button size="sm" variant="outline" onClick={onRetry}>
      Try again
    </Button>
  ) : null;

  if (compact) {
    return (
      <div
        className={className}
        role="status"
        data-testid="organization-required-notice"
      >
        <div className="space-y-2 p-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{headline}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          {picker}
          {retry}
        </div>
      </div>
    );
  }

  return (
    <div
      className={className}
      role="status"
      data-testid="organization-required-notice"
    >
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-6 text-center">
        <Building2
          className="h-6 w-6 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <h3 className="text-sm font-semibold text-foreground">{headline}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
        {picker}
        {retry}
      </div>
    </div>
  );
}

/**
 * WHAT A SIGNED-OUT READER IS ACTUALLY TOLD.
 *
 * Measured (VERIFIER-10 F11): a digest's own deep link, opened in a clean
 * browser, answered "Data records need an organization … pick the one you are
 * working in" with Sign In / Sign Up in the header directly above it. The link
 * DID carry its organization — `platform.link_carries_its_organization` stamps
 * `?org=<uuid>` onto every in-app notice link and the live rows show it — and
 * `resolveActiveOrgContext` honours that as the rung above the remembered
 * choice. None of that can run for somebody the platform has never met. So the
 * sentence names the real state, says the link will still work, and the control
 * is the one that fixes it.
 *
 * The link is deliberately relative and built from the CURRENT address, so
 * signing in returns the person to the exact thing they were sent — including
 * its `?org=`, which is what makes the organization rung fire on the way back.
 */
function SignInFirstNotice({
  what,
  compact,
  className,
}: {
  what?: string | undefined;
  compact: boolean;
  className?: string | undefined;
}) {
  const headline = what ? `Sign in to open ${what.toLowerCase()}` : "Sign in to open this";
  const sentence =
    "You are not signed in, so nothing was loaded. This link knows which " +
    "organization it belongs to and will open the right thing as soon as we " +
    "know who you are — nothing here is missing and you have not lost the link.";
  const href =
    typeof window === "undefined"
      ? "/login"
      : `/login?returnUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  const body = (
    <>
      <h3 className="text-sm font-semibold text-foreground">{headline}</h3>
      <p className={compact ? "mt-1 text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>
        {sentence}
      </p>
      <Button asChild size="sm">
        <a href={href}>Sign in</a>
      </Button>
    </>
  );
  return (
    <div
      className={className}
      role="status"
      data-testid="organization-signed-out-notice"
    >
      {compact ? (
        <div className="space-y-2 p-3">{body}</div>
      ) : (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-6 text-center">
          <LogIn className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          {body}
        </div>
      )}
    </div>
  );
}

// ─── The states, in ONE component ───────────────────────────────────────────

/**
 * 🚨 THE THIRD STATE IS NOT THE REFUSAL, AND IT IS NOT AN EMPTY SCREEN.
 * (VERIFY-R7-FIX-WAVE NEW-1, 2026-09-18.)
 *
 * `OrganizationRequiredNotice` above is the TERMINAL state: boot settled and
 * there is nothing selected. A surface that renders it off a bare
 * `!organizationId` shows it while boot is still resolving too — which is how
 * the Tasks import control told a person with an organization to "Select an
 * organization" from 4.0s to 17.4s after load, disabled, while the memberships
 * read had not even been issued.
 *
 * So the states are not a surface's business to spell. Pass the discriminant
 * from `useOrganizationRequired` and this component picks:
 *
 *   `resolving`   → a labelled waiting state that says what is being checked
 *                   (never the refusal, never nothing);
 *   `required`    → the honest terminal refusal with the picker;
 *   `unavailable` → we could not READ the memberships, so we say that, and
 *                   offer Retry (R37, 2026-09-18);
 *   `ready`       → nothing — the caller renders its own content.
 *
 * 🚨 THE FOURTH STATE NEEDS NO SURFACE EDIT. Every surface already passing
 * `state` from `useOrganizationRequired` inherits the new screen here — that is
 * the whole point of the states living in one component. A surface that spells
 * its own refusal instead is what `pnpm check:org-three-states` refuses.
 */
export function OrganizationContextNotice({
  state,
  what,
  title,
  description,
  compact = false,
  onRetry,
  className,
}: OrganizationRequiredNoticeProps & { state: OrganizationState }) {
  if (state === "ready") return null;
  // 🚨 THE FIFTH STATE, FIRST (FIX-10C, VERIFIER-10 F11, 2026-09-22). A person
  // who is not signed in is not a person with no organization, and the picker
  // this file draws under the organization sentence is empty for them and
  // always will be. Every surface that already passes `state` inherits this one
  // too — that is the whole point of the states living in one component.
  if (state === "signed_out") {
    return (
      <SignInFirstNotice
        what={what}
        compact={compact}
        className={className}
      />
    );
  }
  if (state === "unavailable") {
    return (
      <OrganizationUnavailableNotice
        compact={compact}
        onRetry={onRetry}
        className={className}
      />
    );
  }
  if (state === "resolving") {
    return (
      <div
        className={className}
        role="status"
        aria-busy="true"
        data-testid="organization-resolving-notice"
      >
        <div
          className={
            compact
              ? "space-y-2 p-3"
              : "mx-auto flex max-w-md flex-col items-center gap-3 p-6 text-center"
          }
        >
          <p className="text-sm text-muted-foreground">
            {what
              ? `Checking which organization to use for ${subjectInSentence(what)}…`
              : "Checking which organization you are working in…"}
          </p>
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }
  return (
    <OrganizationRequiredNotice
      what={what}
      title={title}
      description={description}
      compact={compact}
      onRetry={onRetry}
      className={className}
    />
  );
}

/**
 * THE FOURTH STATE'S SCREEN — "we could not check", with Retry.
 *
 * Deliberately NO picker: a picker is the remedy for "you have not chosen one",
 * and this state does not know whether the person has anything to choose from.
 * Offering it here would restate the refusal in furniture after the sentence
 * refused to say it.
 *
 * The retry comes from the platform gate itself when the caller gives none, so
 * a surface inherits a working button without knowing this state exists. It is
 * a separate component precisely so that hook runs ONLY in this state.
 */
function OrganizationUnavailableNotice({
  compact,
  onRetry,
  className,
}: {
  compact: boolean;
  onRetry?: () => void;
  className?: string;
}) {
  const { retry } = useOrganizationRequired();
  const onClick = onRetry ?? retry;
  return (
    <div
      className={className}
      role="status"
      data-testid="organization-unavailable-notice"
    >
      {/* Through the ONE error primitive: this refusal is shown on every page
          that needs an organization (73 of them), and each one must carry the
          Alchemy Menu with the failed read (RC-B12 round 5). */}
      <ErrorNotice
        size={compact ? "compact" : "default"}
        title={ORGANIZATION_UNAVAILABLE_TITLE}
        message={ORGANIZATION_UNAVAILABLE_DESCRIPTION}
        operation="Check which organization you are working in"
        className={compact ? "m-3" : "mx-auto my-6 max-w-md"}
        actions={
          <Button size="sm" variant="outline" onClick={onClick}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
