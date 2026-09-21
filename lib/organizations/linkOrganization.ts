// lib/organizations/linkOrganization.ts
//
// THE ONE PLACE THAT DECIDES WHAT A LINK'S `?org=<uuid>` MEANS.
//
// THE DEFECT (lane TAILS-3, measured 2026-09-21)
// ----------------------------------------------
// A notification's deep link carried no organization. A person arriving cold —
// from an email, a text, or the notifications screen in a fresh session —
// landed on "Select an organization first" instead of the thing the link
// named. The records were there all along ("41 shown / 41 loaded") the moment
// the organization was set by hand. The server half now stamps every deep link
// the platform emits with `?org=<organization uuid>` (the convention already
// used by the `/hr` routes, `_CARRIES_EMPLOYER` in aidream's notification
// service). This module is the client half.
//
// 🚨 THIS IS NOT A DEFAULT-ORGANIZATION RUNG, AND THE DISTINCTION IS THE WHOLE
// POINT. `scripts/check-no-default-organization.ts` exists because NOTHING may
// PICK an organization for a person out of a stored preference, a cookie, or
// their personal workspace:
//
//   "one missed org check that should have just failed turns into 50 in a
//    month and 5,000 in a year, and suddenly we don't have orgs any more, we
//    have a user and a default org, which means we just have user now."
//
// Every rung that guard deleted had the same shape: the app was asked a
// question it could not answer, and answered anyway with something it had
// lying around. A link's `org=` is the opposite shape in four ways, and all
// four must hold or this module is a default wearing a disguise:
//
//   1. IT IS STATED, NOT FOUND. The value is not read out of the person's
//      account or this browser's memory; it arrives with the navigation,
//      naming ONE organization, because the thing that emitted the link knew
//      which organization the destination is filed under.
//   2. IT IS CHECKED AGAINST MEMBERSHIP. It is honoured only when the person
//      is already a member (`memberships` below is the live list, never a
//      claim from the URL). A link cannot grant anything.
//   3. IT SUBSTITUTES NOTHING. Absent, malformed, or naming an organization
//      they do not belong to, it changes nothing at all — the ladder in
//      `resolveActiveOrgContext` runs exactly as it would have.
//   4. IT IS NEVER SILENT WHEN IT MOVES SOMEONE. A real switch is announced,
//      and a refusal is said in words (law 4).
//
// This module is PURE: no React, no Redux, no toasts, no `window`. It decides
// and writes the sentence; `organizationRefusalToast` raises it, the resolver
// applies it. That is what makes every branch below testable from a seat
// (`lib/organizations/__tests__/linkOrganization.test.ts`).

/**
 * The query key, platform-wide. The server stamps this on every deep link it
 * emits; `features/admin/users/components/OrganizationsAdminClient.tsx` has
 * read it since before this module existed. One spelling, in one place.
 */
export const LINK_ORGANIZATION_QUERY_KEY = "org";

/** Canonical UUID. A value that is not one is MALFORMED, never a lookup key. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LinkOrganizationParam =
  /** No link said anything about an organization. The ladder is untouched. */
  | { kind: "absent" }
  /** Something was said and it is not a uuid. Refused in words, never used. */
  | { kind: "malformed"; raw: string }
  /** A well-formed organization id. Still has to survive the membership check. */
  | { kind: "named"; organizationId: string };

/**
 * Read the key out of a query string, a `URLSearchParams`, or a full URL.
 * Never throws: a URL this cannot parse is `absent`, because a crash on
 * arrival is a worse answer than the ladder's own.
 */
export function readLinkOrganizationParam(
  source: string | URLSearchParams | null | undefined,
): LinkOrganizationParam {
  if (source == null) return { kind: "absent" };
  let params: URLSearchParams;
  if (source instanceof URLSearchParams) {
    params = source;
  } else {
    try {
      const q = source.includes("?") ? source.slice(source.indexOf("?")) : source;
      params = new URLSearchParams(q);
    } catch {
      return { kind: "absent" };
    }
  }
  if (!params.has(LINK_ORGANIZATION_QUERY_KEY)) return { kind: "absent" };
  const raw = (params.get(LINK_ORGANIZATION_QUERY_KEY) ?? "").trim();
  if (!UUID.test(raw)) return { kind: "malformed", raw };
  return { kind: "named", organizationId: raw };
}

export interface LinkOrganizationMembership {
  id: string;
  name: string;
}

export interface LinkOrganizationDecisionInput {
  param: LinkOrganizationParam;
  /** The person's LIVE memberships. The only authority on what they may open. */
  memberships: ReadonlyArray<LinkOrganizationMembership>;
  /** The organization they are working in right now, or null. */
  currentOrganizationId: string | null;
  currentOrganizationName?: string | null;
  /**
   * The knob `userPreferences.organization.switchOnLinkPrompt` — "switch
   * organization when a link asks". DEFAULT ON, so an omitted value is `true`.
   */
  switchWhenALinkAsks?: boolean;
  /** The account they are signed in as, for the refusal sentence. */
  signedInAs?: string | null;
}

export type LinkOrganizationDecision =
  /** Nothing to do. No toast, no change. */
  | { kind: "no-link" }
  /** The link names the organization they are already in. Silent no-op. */
  | { kind: "already-current"; organizationId: string }
  /** Use this organization for this session. `announcement` non-null = they moved. */
  | {
      kind: "honoured";
      organizationId: string;
      organizationName: string;
      announcement: string | null;
    }
  /** The knob is off and this would be a real switch. Offer it as a click. */
  | {
      kind: "offered";
      organizationId: string;
      organizationName: string;
      message: string;
      actionLabel: string;
    }
  /** Malformed, or not theirs. Changes nothing; says so. */
  | { kind: "refused"; reason: "malformed" | "not-a-member"; message: string };

/** What a person reads when the link's organization is not theirs to open. */
export function linkOrganizationNotAMemberMessage(
  signedInAs?: string | null,
): string {
  // 🚨 THE ORGANIZATION IS NOT NAMED HERE, EVER. They are not a member, so its
  // name and its id are both things this account may not learn — a refusal
  // that spells them turns a wrong link into a directory of other people's
  // organizations. The sentence says what happened, who they are, and the two
  // ways out, and nothing more.
  const account = signedInAs
    ? `You are signed in as ${signedInAs}.`
    : "Check which account you are signed in as.";
  return (
    `The link you followed is for an organization this account is not a member of, so nothing was opened and you were not moved. ` +
    `${account} ` +
    `Sign in with the account the link was meant for, or ask whoever sent it to give this account access.`
  );
}

/** What a person reads when `org=` is not an organization id at all. */
export function linkOrganizationMalformedMessage(raw: string): string {
  const quoted = raw.length > 0 ? ` ("${raw}")` : "";
  return (
    `The link you followed names an organization we cannot read${quoted}, so nothing was switched and you were left where you were. ` +
    `Ask whoever sent it for the link again, or pick the organization you are working in from the avatar menu.`
  );
}

/** What a person reads when a link actually moved them. Law 4: never silent. */
export function linkOrganizationSwitchAnnouncement(
  toName: string,
  fromName: string | null,
): string {
  const from = fromName ? ` You were working in ${fromName}.` : "";
  return (
    `You are now working in ${toName} because the link you followed is filed under it.${from} ` +
    `Switch back any time from the avatar menu.`
  );
}

/** What a person reads with the knob turned off and a link asking to move them. */
export function linkOrganizationOfferMessage(
  toName: string,
  fromName: string | null,
): string {
  const where = fromName ? `, and you are working in ${fromName}` : "";
  return (
    `The link you followed is for ${toName}${where}. ` +
    `"Switch organization when a link asks" is turned off in your settings, so nothing changed — switch to ${toName} to open it.`
  );
}

/**
 * The decision. One function, every branch, no side effects.
 *
 * 🚨 WHY THE KNOB GOVERNS ONLY A REAL SWITCH. The knob protects the
 * organization a person is WORKING IN from being yanked out from under them by
 * a link someone else composed. With `currentOrganizationId === null` there is
 * nothing to protect and nothing to switch away from: the alternative to
 * honouring the link is the picker, which is the very dead end this module was
 * built to end. So the knob turns a SWITCH into an offer; it never turns an
 * arrival into a refusal. This is deliberate and it is not a hidden default —
 * with no link present, a null selection stays null exactly as before.
 */
export function decideLinkOrganization(
  input: LinkOrganizationDecisionInput,
): LinkOrganizationDecision {
  const { param, memberships, currentOrganizationId } = input;
  const switchWhenALinkAsks = input.switchWhenALinkAsks ?? true;

  if (param.kind === "absent") return { kind: "no-link" };

  if (param.kind === "malformed") {
    return {
      kind: "refused",
      reason: "malformed",
      message: linkOrganizationMalformedMessage(param.raw),
    };
  }

  const match = memberships.find((o) => o.id === param.organizationId);
  if (!match) {
    return {
      kind: "refused",
      reason: "not-a-member",
      message: linkOrganizationNotAMemberMessage(input.signedInAs),
    };
  }

  if (currentOrganizationId === match.id) {
    return { kind: "already-current", organizationId: match.id };
  }

  const fromName = currentOrganizationId
    ? (input.currentOrganizationName ??
      memberships.find((o) => o.id === currentOrganizationId)?.name ??
      null)
    : null;

  if (currentOrganizationId && !switchWhenALinkAsks) {
    return {
      kind: "offered",
      organizationId: match.id,
      organizationName: match.name,
      message: linkOrganizationOfferMessage(match.name, fromName),
      actionLabel: `Switch to ${match.name}`,
    };
  }

  return {
    kind: "honoured",
    organizationId: match.id,
    organizationName: match.name,
    // Nothing to announce on a cold arrival: they were working nowhere, so
    // they were not moved. A move, however, is always announced.
    announcement: currentOrganizationId
      ? linkOrganizationSwitchAnnouncement(match.name, fromName)
      : null,
  };
}
