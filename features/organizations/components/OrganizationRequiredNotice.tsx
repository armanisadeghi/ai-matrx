"use client";

/**
 * OrganizationRequiredNotice — the ONE "no organization selected yet" surface
 * for a mount-time fetch, everywhere except lulu-pricing (which predates
 * this and carries its own local copy — consolidate onto this the next time
 * that file is touched).
 *
 * THE PROBLEM THIS EXISTS FOR
 * ---------------------------
 * `lib/python-client.ts` / `lib/api/typed-client.ts` (`apiGet`/`apiPost`) are
 * DELIBERATELY non-interactive: a mount-time fetch with no organization
 * selected throws `OrganizationContextError` synchronously, before any
 * network call, rather than popping an unexplained picker dialog. That is
 * correct for background/poll traffic, but it means every feature that
 * fetches on mount from a `(core)` route (which only soft-nudges for an
 * organization via the header's "Choose org" button — it never hard-blocks)
 * is responsible for handling that error itself. Most weren't: the error
 * fell through to generic error-card handling, which shows the raw
 * `OrganizationContextError` message with a "Retry" button that fails
 * identically forever, since retrying without an organization can't
 * succeed. Found and fixed first on `app/(dev)/demos/lulu-pricing`.
 *
 * THE FIX
 * -------
 * A calm, honest, non-destructive state — never a red "error" card — with
 * the real organization picker (`OrganizationPickerPanel`) inline, so
 * resolving it is one click, not a dead end or a trip to another screen.
 *
 * USAGE
 * -----
 *   if (isOrganizationRequiredError(error)) {
 *     return <OrganizationRequiredNotice />;
 *   }
 *   // ...existing generic error handling
 *
 * Pass `compact` inside a card/widget that shouldn't take over the whole
 * page (a sidebar panel, a chunk list) — it drops the icon and outer frame.
 */

import { Building2 } from "lucide-react";
import { OrganizationContextError } from "@/lib/api/organization-context";
import { OrganizationPickerPanel } from "./OrganizationPickerPanel";

/** True for the specific "nothing was selected" case — not a mismatch or invalid-id error. */
export function isOrganizationRequiredError(error: unknown): boolean {
  return (
    error instanceof OrganizationContextError &&
    error.code === "organization_context_required"
  );
}

export interface OrganizationRequiredNoticeProps {
  title?: string;
  description?: string;
  /** Drop the icon/outer frame for use inside an already-framed card or panel. */
  compact?: boolean;
}

export function OrganizationRequiredNotice({
  title = "Choose an organization to continue",
  description = "This needs to know which organization to work in. Pick one below and it picks up automatically.",
  compact = false,
}: OrganizationRequiredNoticeProps) {
  const picker = (
    <div className="rounded-md border border-border bg-card">
      <OrganizationPickerPanel />
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-2 p-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        {picker}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4">
      <div className="flex items-start gap-3">
        <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          {picker}
        </div>
      </div>
    </div>
  );
}
