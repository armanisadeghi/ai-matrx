"use client";

// lib/organizations/linkOrganizationSession.ts
//
// THE SIDE-EFFECTING HALF of `lib/organizations/linkOrganization.ts`: reading
// the knob out of the live store, and SAYING the decision to the person.
//
// The decision module is pure on purpose (every branch is testable from a
// seat); this module is where it touches the app. It is deliberately tiny and
// deliberately separate, so that a change to the sentence or the toast can
// never quietly change the DECISION.
//
// 🚨 THE ANNOUNCEMENT USES THE EXISTING REFUSAL PRIMITIVE, NOT A NEW PATTERN.
// `organizationRefusalToast` is already the one way an organization refusal
// reaches a person from code with nowhere to render, and it raises through
// `@/lib/toast` so the message is visible in the admin Error Inspector. A
// second, parallel "org link" notification pattern would be exactly the
// parallel layer this codebase keeps deleting.

import { getStoreSingleton } from "@/lib/redux/store-singleton";
import {
  LINK_ORGANIZATION_QUERY_KEY,
  readLinkOrganizationParam,
  type LinkOrganizationDecision,
} from "@/lib/organizations/linkOrganization";

/**
 * The knob `userPreferences.organization.switchWhenALinkAsks` — "switch
 * organization when a link asks", DEFAULT ON.
 *
 * 🚨 WHY AN UNHYDRATED STORE READS `true` AND THAT IS NOT A GUESS. This runs
 * during boot, so the preferences slice may still hold its declared defaults —
 * and the declared default IS `true` (`lib/redux/preferences/
 * defaultUserPreferences.ts`). Reading `true` before hydration therefore
 * agrees with the knob, not with a convenience. A person who turned it off and
 * follows a link in a cold tab could in principle be switched once before
 * their preferences land; that is the ONLY failure mode here, it is announced
 * out loud like every other switch, and it is reversible from the avatar menu.
 * The alternative — assuming OFF — would put the "Select an organization
 * first" dead end back for everybody on every cold boot.
 */
export function readSwitchWhenALinkAsks(): boolean {
  try {
    const state = getStoreSingleton()?.getState() as
      | { userPreferences?: { organization?: { switchWhenALinkAsks?: unknown } } }
      | undefined;
    const value = state?.userPreferences?.organization?.switchWhenALinkAsks;
    return value === undefined ? true : value === true;
  } catch {
    return true;
  }
}

/** The `?org=` on the URL that brought this page up, or null off the browser. */
export function readLinkOrganizationFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const param = readLinkOrganizationParam(window.location.search);
  if (param.kind === "absent") return null;
  // A malformed value is handed on DELIBERATELY: it has to be refused in
  // words, and swallowing it here would make it vanish silently instead.
  return param.kind === "malformed"
    ? (new URLSearchParams(window.location.search).get(
        LINK_ORGANIZATION_QUERY_KEY,
      ) ?? "")
    : param.organizationId;
}

/**
 * ONE DECISION PER LINK VALUE PER SESSION.
 *
 * Two paths can see the same `?org=`: the boot reconciliation
 * (`appContextPolicy.remote.fetch`, which runs on a cold boot) and the
 * in-session watcher (`LinkOrganizationWatcher`, which catches a link followed
 * while the app is already warm and a client-side navigation that the boot
 * fetch never re-runs for). Whichever gets there first claims the value; the
 * other says nothing, so nobody reads the same announcement twice.
 *
 * Keyed by the raw value, so a SECOND, different link later in the same
 * session is still decided and still announced.
 */
const claimed = new Set<string>();

export function claimLinkOrganizationDecision(raw: string | null): boolean {
  if (raw === null) return false;
  if (claimed.has(raw)) return false;
  claimed.add(raw);
  return true;
}

/** Tests and in-place auth swaps only. */
export function resetLinkOrganizationClaims(): void {
  claimed.clear();
}

/** The account this session is signed in as, for the refusal sentence. */
export function readSignedInAs(): string | null {
  try {
    const state = getStoreSingleton()?.getState() as
      | { userAuth?: { email?: unknown } }
      | undefined;
    const email = state?.userAuth?.email;
    return typeof email === "string" && email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

/**
 * Say a link decision out loud. No-ops for the two silent outcomes — no link,
 * and a link naming the organization they are already working in (rule 3: no
 * toast, no churn).
 *
 * `onSwitch` is what the OFFERED branch's button does; omit it and the offer
 * is still stated in words, without the shortcut.
 */
export async function announceLinkOrganizationDecision(
  decision: LinkOrganizationDecision | undefined,
  onSwitch?: (organizationId: string, organizationName: string) => void,
): Promise<void> {
  if (!decision) return;
  const { toast } = await import("@/lib/toast");
  switch (decision.kind) {
    case "no-link":
    case "already-current":
    // A share let them in; the page they opened says whose table it is.
    case "admitted":
      return;
    case "honoured":
      if (!decision.announcement) return; // cold arrival: nobody was moved
      toast.success(`Now in ${decision.organizationName}`, {
        description: decision.announcement,
      });
      return;
    case "offered":
      toast.warning("This link is for another organization", {
        description: decision.message,
        ...(onSwitch
          ? {
              action: {
                label: decision.actionLabel,
                onClick: () =>
                  onSwitch(decision.organizationId, decision.organizationName),
              },
            }
          : {}),
      });
      return;
    case "refused":
      toast.error(
        decision.reason === "not-a-member"
          ? "This link is for an organization you are not a member of"
          : "This link's organization could not be read",
        { description: decision.message },
      );
      return;
  }
}
