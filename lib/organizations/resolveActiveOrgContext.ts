// lib/organizations/resolveActiveOrgContext.ts
//
// The ONE pure resolver for the user's organization context — personal org +
// the EXPLICIT active org — with no Redux dispatch and no side effects beyond
// priming the session-wide personal-org cache. It is the body that the
// `appContextPolicy` sync `remote.fetch` runs on cold-boot + stale-refresh, and
// that the back-compat `bootstrapActiveOrganization` thunk delegates to.
//
// 🚨 BOOT NO LONGER PICKS AN ORGANIZATION FOR ANYONE (Arman, 2026-09-19).
// This ladder used to have four rungs and two of them were substitutions:
//
//   a. the user's stored DEFAULT-ORG preference, read straight out of
//      `users.user_preferences`;
//   b. else their OWN PERSONAL org, "to make boot TOTAL".
//
// Both are deleted. The ruling is that a "default organization" is at most a
// per-client DISPLAY preference — the org picker may show it and nothing else
// may read it — and that nothing may PICK an organization for the user from a
// cookie, a saved preference, or their personal workspace. Rung b was
// defended here as "an explicit, visible, changeable choice made ONCE at
// bootstrap"; it is not. The person never made it. A boot that always ends
// with a selection is a boot that has quietly decided that the personal
// workspace is where your work goes, and the platform stops having
// organizations at all:
//
//   "one missed org check that should have just failed turns into 50 in a
//    month and 5,000 in a year, and suddenly we don't have orgs any more, we
//    have a user and a default org, which means we just have user now."
//
// What a null selection costs is now paid for properly, at the ONE funnel:
// `ensureOrgId` HOLDS the action, the picker opens, the person SETS an
// organization, and the action resumes with it. Refusing is no longer a dead
// end, so boot no longer has to guess to avoid one.
//
// THE RUNGS THAT REMAIN, and why each is not a substitution:
//  -1. THE LINK'S OWN ORGANIZATION — `?org=<uuid>` on the URL that brought the
//      person here (`lib/organizations/linkOrganization.ts`), added 2026-09-21
//      because a notification deep link landed people on "Select an
//      organization first" instead of the thing the link named. It sits ABOVE
//      the remembered choice because it is the NEWER and more specific fact:
//      the cookie says "where you were last", the link says "where THIS thing
//      lives". It is NOT a default and it is not a guess — it is stated with
//      the navigation, it is honoured only against the live membership list,
//      it substitutes NOTHING when absent, malformed, or not theirs, and a
//      real move is always announced. All four properties are argued at length
//      in that module's header and pinned by its tests.
//   0. this device's REMEMBERED CHOICE — the shared apex cookie
//      (`lib/organizations/activeOrgCookie.ts`), identity-keyed, written only
//      when the person themselves selected an organization on this browser
//      (`activeOrgCookieMiddleware` mirrors real changes of
//      `appContext.organization_id`). It restores what THEY set, on the
//      machine they set it on, and it is how a choice made in Workflow Studio
//      is honoured here. It is client-only by design: nothing server-side
//      reads `matrx-active-org`, and nothing may start to — a cookie the
//      server trusts is a default wearing a disguise. A stale one (no longer
//      a membership) is dropped, never used.
//   c. exactly ONE membership → that org. Nothing to choose, so nothing is
//      being chosen FOR them.
//   d. otherwise null ON PURPOSE. The UI says so with a remedy and a picker
//      (`OrganizationRequiredNotice`), and the first action that needs an
//      organization asks for one.

import { getUserOrganizations } from "@/features/organizations/service";
import { isOwnPersonalOrg } from "@/features/organizations/types";
import {
  resolvePersonalOrgId,
  primePersonalOrgId,
} from "@/lib/organizations/personalOrg";
import { activeOrgCookie } from "@/lib/organizations/activeOrgCookie";
import {
  decideLinkOrganization,
  readLinkOrganizationParam,
  type LinkOrganizationDecision,
} from "@/lib/organizations/linkOrganization";

/** The org subset of appContext this resolver produces. */
export interface ResolvedOrgContext {
  organization_id: string | null;
  organization_name: string | null;
  personal_organization_id: string | null;
  /**
   * What the link's `?org=` meant, when a link said anything. Present so the
   * caller can SAY it — a refused link and an announced switch both have to
   * reach the person in words (law 4), and this resolver is pure. Undefined
   * when no link named an organization.
   */
  link?: LinkOrganizationDecision;
  /**
   * 🚨 WHY A NULL SELECTION MAY NOT BE AN ANSWER (R37, 2026-09-18).
   *
   * Non-null here means the rungs were DEGRADED — we could not READ what the
   * person belongs to — so a null selection must be shown as "we could not
   * check" with a retry, never as "choose one". On 2026-09-18 a member of
   * THIRTEEN organizations was told to pick one, disabled, for 24 seconds,
   * after a single failed read.
   *
   * 🚨 IT IS NO LONGER SET BY A FAILED PERSONAL-ORG READ (2026-09-19). It was,
   * because the selection ladder had a personal-org rung that the RPC could
   * silently skip. That rung is gone: the surviving rungs (this device's
   * remembered choice, and a sole membership) both read ONLY the membership
   * list, so a failed `current_personal_org_id()` no longer degrades the
   * selection at all — it degrades `personal_organization_id`, which is
   * identity metadata, not scope. Leaving it wired to the personal read would
   * now do the opposite harm: it would dress an HONEST "choose your
   * organization" up as "we could not check", and the person would press Try
   * again forever on a question only they can answer.
   */
  unreadableReason?: string | null;
}

/**
 * Resolve the user's org context (personal + active). Pure read — never
 * dispatches. Primes the personal-org session cache as a side benefit so
 * downstream `ensureOrgId(undefined)` callsites resolve with zero round-trips.
 * Returns null only when the user has no orgs at all AND no personal org.
 */
export interface ResolveActiveOrgContextOptions {
  /**
   * The raw `?org=` value from the URL that brought the person here, or the
   * whole query string / `URLSearchParams` to read it out of. Omit it and this
   * resolver behaves exactly as it did before the rung existed.
   */
  linkOrganizationId?: string | URLSearchParams | null;
  /**
   * The knob `userPreferences.organization.switchOnLinkPrompt` — "switch
   * organization when a link asks". DEFAULT ON.
   */
  switchWhenALinkAsks?: boolean;
  /** The account they are signed in as, for the refusal sentence. */
  signedInAs?: string | null;
}

export async function resolveActiveOrgContext(
  userId: string,
  options: ResolveActiveOrgContextOptions = {},
): Promise<ResolvedOrgContext | null> {
  // Authoritative personal org id (auto-provisioned at signup). Falls back to
  // the org-list heuristic only if the RPC is unavailable. This is IDENTITY
  // metadata — "which workspace is this person's own" — and since 2026-09-19
  // it names no rung of the selection ladder, so failing to read it can no
  // longer make a selection unreadable.
  let personalOrgId: string | null = null;
  let personalOrgUnreadable = false;
  try {
    personalOrgId = await resolvePersonalOrgId();
  } catch (e) {
    personalOrgUnreadable = true;
    console.warn(
      "[resolveActiveOrgContext] current_personal_org_id() failed; falling back to the org-list heuristic for personal-org IDENTITY only",
      e,
    );
  }

  const orgs = await getUserOrganizations();

  // No memberships at all — still surface the personal org if we have one.
  if (!orgs || orgs.length === 0) {
    if (!personalOrgId) {
      // No memberships AND no personal org. With nothing to belong to there is
      // nothing to select and nothing to ask about; the caller renders the
      // honest "you belong to no organization" notice. The personal read
      // failing changes only whether we can NAME their own workspace, so it is
      // reported as unreadable rather than as a settled answer.
      return personalOrgUnreadable
        ? {
            organization_id: null,
            organization_name: null,
            personal_organization_id: null,
            unreadableReason:
              "the personal-organization read failed, so this account's own workspace could not be named",
          }
        : null;
    }
    primePersonalOrgId(personalOrgId);
    return {
      organization_id: null,
      organization_name: null,
      personal_organization_id: personalOrgId,
      unreadableReason: null,
    };
  }

  // Fallback for the rare case where the RPC above failed. It may ONLY ever
  // resolve an org the user actually OWNS (`created_by`), which is exactly what
  // `iam.personal_org_id()` keys on — so the fallback can differ from the
  // server in availability, never in answer.
  //
  // The previous heuristic was `orgs.find(o => o.isPersonal) ?? orgs[0]`, and
  // both halves could hand back the WRONG org: `isPersonal` matches a
  // membership in someone ELSE's personal workspace, and `orgs[0]` is simply
  // whichever org sorted first. This value becomes `personal_organization_id`,
  // which `getActiveOrgId()` uses as the never-null org for WRITES — so a wrong
  // answer here silently files the user's rows into another person's org. A
  // membership in another account's personal org exists live today, so this was
  // reachable, not theoretical. Null (→ the loud nudge path) is the only
  // acceptable alternative to the right answer.
  const ownedPersonalOrg = orgs.find((o) =>
    isOwnPersonalOrg(o, userId),
  );
  const resolvedPersonalId = personalOrgId ?? ownedPersonalOrg?.id ?? null;
  primePersonalOrgId(resolvedPersonalId);

  // THE LADDER BELOW THE LINK, computed first. The link's decision needs to
  // know where the person WOULD be working, because the difference between "we
  // moved you" (announce it) and "you were already there" (say nothing) is
  // exactly that comparison. So rungs 0 and c run first and the link rung is
  // applied on top; nothing about their behaviour changes when no link speaks.
  let laddered: { id: string; name: string } | null = null;

  // 0. THIS DEVICE'S REMEMBERED CHOICE (the shared apex cookie) — if still a
  //    membership. It restores an organization the person themselves selected
  //    on this browser; a stale one is dropped so it cannot shadow rung c.
  const storedOrgId = activeOrgCookie.read(userId);
  if (storedOrgId) {
    const match = orgs.find((o) => o.id === storedOrgId);
    if (match) {
      laddered = { id: match.id, name: match.name };
    } else {
      activeOrgCookie.clear();
    }
  }

  // c. Exactly ONE membership → that org. Auto-selecting the only option is
  //    not choosing for anybody; there is nothing to choose.
  if (!laddered && orgs.length === 1) {
    laddered = { id: orgs[0].id, name: orgs[0].name };
  }

  // -1. THE LINK'S OWN ORGANIZATION. Decided in one pure place so every branch
  //     — honoured, already-current, offered, refused — is the same one the
  //     seat-level tests exercise. `decideLinkOrganization` checks it against
  //     `orgs`, which is the LIVE membership list: a link can open an
  //     organization, never grant one.
  const linkParam =
    typeof options.linkOrganizationId === "string"
      ? options.linkOrganizationId.includes("=")
        ? readLinkOrganizationParam(options.linkOrganizationId)
        : ({ kind: "named", organizationId: options.linkOrganizationId } as const)
      : readLinkOrganizationParam(options.linkOrganizationId ?? null);
  // A bare id that is not a uuid must still be judged, not trusted.
  const param =
    linkParam.kind === "named" &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      linkParam.organizationId,
    )
      ? ({ kind: "malformed", raw: linkParam.organizationId } as const)
      : linkParam;

  const linkInput = {
    param,
    memberships: orgs.map((o) => ({ id: o.id, name: o.name })),
    currentOrganizationId: laddered?.id ?? null,
    currentOrganizationName: laddered?.name ?? null,
    switchWhenALinkAsks: options.switchWhenALinkAsks,
    signedInAs: options.signedInAs,
  };
  let link = decideLinkOrganization(linkInput);
  // A SHARE ADMITS, and a refusal toast over the table it opened is a lie
  // (VERIFIER-15 H4). Asked only when the link already failed the membership
  // check, so every ordinary boot is unchanged.
  if (link.kind === "refused" && link.reason === "not-a-member" && param.kind === "named") {
    const { admittedToOrganizationByAShare } = await import(
      "@/lib/organizations/linkOrganizationAdmission"
    );
    if (await admittedToOrganizationByAShare(param.organizationId)) {
      link = decideLinkOrganization({ ...linkInput, admittedByAShare: true });
    }
  }

  if (link.kind === "honoured") {
    return {
      organization_id: link.organizationId,
      organization_name: link.organizationName,
      personal_organization_id: resolvedPersonalId,
      link,
    };
  }

  // Every other link outcome changes NOTHING about the selection — refused,
  // offered, and already-current all leave the ladder's own answer standing.
  // That is rule 3 of the module header: the link substitutes nothing.
  if (laddered) {
    return {
      organization_id: laddered.id,
      organization_name: laddered.name,
      personal_organization_id: resolvedPersonalId,
      ...(link.kind === "no-link" ? {} : { link }),
    };
  }

  // d. Genuinely unresolved: the person belongs to several organizations and
  //    has not told THIS device which one they are working in. That is a real
  //    answer, not a gap to be filled: the header shows the picker, and the
  //    first action that needs an organization holds and asks (`ensureOrgId`).
  return {
    organization_id: null,
    organization_name: null,
    personal_organization_id: resolvedPersonalId,
    ...(link.kind === "no-link" ? {} : { link }),
    // A real answer, read from a real membership list: they belong to several
    // organizations and have not said which one this device is working in.
    // Never "unreadable" — that would hide the one question only they can
    // answer behind a Try again button.
    unreadableReason: null,
  };
}
