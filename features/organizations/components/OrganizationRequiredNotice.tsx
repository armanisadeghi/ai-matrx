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

import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    title ?? (what ? `${what} need an organization` : "Choose an organization");

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
