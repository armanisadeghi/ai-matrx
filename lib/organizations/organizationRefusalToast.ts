// lib/organizations/organizationRefusalToast.ts
//
// THE ONE WAY AN ORGANIZATION REFUSAL REACHES A PERSON FROM ACTION CODE.
//
// `OrganizationRequiredNotice` is the honest screen for a LOAD that returned
// nothing. It has no answer for the other half of the class: an ACT — save,
// create, share, publish, flush — made from a thunk, a service, a writer, or a
// hook with nowhere to render. Those sites used to be safe because `ensureOrgId`
// silently filed the row in the person's personal organization. On 2026-09-17
// that fallback was deleted and `ensureOrgId` started THROWING, which turned a
// silent misfile into a silent LOSS: `HtmlPreviewBridge` caught the new refusal
// into `console.error`, opened the page anyway, and never wrote the
// `chat.artifact` row — the screen said success and nothing was saved.
//
// Law 4: nothing fails silently, and every stand-in announces itself with a
// remedy. So an act that cannot proceed says so, in the person's words, with
// the fix attached — "pick yours from the avatar menu" — and the surface does
// NOT pretend it worked.
//
// USAGE — two shapes, pick by whether you already have a try/catch:
//
//   catch (err) {
//     if (presentOrganizationRefusal(err, { act: "saved" })) return;
//     …your other error handling…
//   }
//
//   await withOrganizationRefusalShown("created", async () => { … });
//
// Both raise the toast through `@/lib/toast`, so the refusal is also visible
// in the admin Error Inspector — a bare `sonner` import would be invisible to
// it.
//
// Law: common-docs/policies/context-is-carried-never-rebuilt.md — the
// organization is READ below the boundary, never invented. This module is what
// makes that refusal honest instead of mute.

import { toast } from "@/lib/toast";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";

/** The remedy sentence, in one place. ~20 surfaces had hand-copied it. */
export const ORGANIZATION_REQUIRED_REMEDY =
  "Every record is filed under one organization, so pick the one you are working in from the avatar menu and try again.";

export interface OrganizationRefusalOptions {
  /**
   * What did NOT happen, as a past participle: "saved", "created", "shared",
   * "published". Read as "Nothing was <act> …" with no subject, and as
   * "<subject> was NOT <act> …" with one. Defaults to "saved".
   */
  act?: string;
  /**
   * Name the thing, e.g. "This page". Omit it and the sentence speaks of
   * "Nothing".
   */
  subject?: string;
}

/**
 * The sentence a person reads. Exported so a surface can render it inline.
 *
 * 🚨 THE NEGATION IS THE HELPER'S JOB, NOT THE CALLER'S (2026-09-18). The first
 * cut built the sentence as `${subject} was ${act}`, which is honest for the
 * subject-less default ("Nothing was saved …") and a LIE for every caller that
 * named its subject: "This record was opened because no organization is
 * selected.", "This document was refreshed because …", "This canvas was shared
 * because …", "This file's edit history was saved because …". Nine call sites
 * across five features, every one of them announcing the very act it is
 * refusing — a screen that lies (law 4), from the module written to stop that.
 *
 * So the contract makes the lie impossible to construct rather than asking
 * callers to remember a "not": a named subject ALWAYS renders "was not <act>",
 * and there is no way to pass the affirmative in. `act` stays a bare past
 * participle at every call site — a caller that writes "not saved" itself would
 * produce "was not not saved", which `check:org-refusal-honesty`'s twin unit
 * test in lib/organizations/__tests__ refuses.
 */
export function organizationRefusalMessage(
  options: OrganizationRefusalOptions = {},
): string {
  const act = options.act ?? "saved";
  const refusal = options.subject
    ? `${options.subject} was not ${act}`
    : `Nothing was ${act}`;
  return `${refusal} because no organization is selected. ${ORGANIZATION_REQUIRED_REMEDY}`;
}

/**
 * Show the refusal if that is what `error` is. Returns true when it handled
 * the error (so the caller returns), false when the error is something else
 * and the caller's own handling should run.
 */
export function presentOrganizationRefusal(
  error: unknown,
  options: OrganizationRefusalOptions = {},
): boolean {
  if (!isOrganizationRequiredError(error)) return false;
  toast.error("Choose an organization first", {
    description: organizationRefusalMessage(options),
  });
  return true;
}

/**
 * Run `work`; if it refuses for want of an organization, show the person the
 * refusal and RETHROW. Rethrowing is deliberate: the caller's own failure path
 * (a rejected thunk, an unchanged screen) must still run, because the one
 * thing this must never do is let the surface carry on as though the act
 * succeeded.
 */
export async function withOrganizationRefusalShown<T>(
  act: string,
  work: () => Promise<T>,
  options: Omit<OrganizationRefusalOptions, "act"> = {},
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    presentOrganizationRefusal(error, { ...options, act });
    throw error;
  }
}
