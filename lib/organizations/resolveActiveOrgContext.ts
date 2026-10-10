// lib/organizations/resolveActiveOrgContext.ts
//
// THE LOAD LADDER — the ONE pure resolver for the active organization, with no
// Redux dispatch and no side effects. `appContextPolicy.remote.fetch` runs it on
// every load (and on refresh, to confirm the held organization is still theirs).
//
// 🚨 ONE ACTIVE ORGANIZATION, SET ONCE WHEN THE APP LOADS, NEVER NONE (Arman,
// 2026-10-07; organizations VISION §10, STATE rules 11–14):
//
//   "Active Org is set ONCE at the top of the app. Active Org can never be none.
//    Active org should set to your last active org or a db fallback FOR THE UI
//    ONLY!! The UI (Sidebar) allows for you to see and change your active org.
//    from then on, all requests use the ONE SINGLE active org and that's it."
//
// THE RUNGS, each kept only if it is a CURRENT membership:
//   0. this tab's HELD organization (refreshes only) — a tab keeps the
//      organization it loaded with until the person switches in that tab;
//   1. the LINK's own organization (`?org=`) — `lib/organizations/linkOrganization.ts`;
//   2. the account's LAST ACTIVE organization (`last_active_organization_id`);
//   3. the account's START-UP organization setting (`startup_organization_id`);
//   4. their FIRST organization — the oldest active membership.
// Zero memberships → null (the shell shows "create an organization"). A failed
// read THROWS, and the caller shows the honest retry state — never a guess.
//
// This module is the ONLY reader of the two account columns
// (`accountOrganizationChoices.ts`); nothing else may read them to decide where
// anything acts.

import { resolveActiveOrganizationLazily } from "@ai-matrx/data/organizations";
import { isRecordsErr } from "@ai-matrx/records";
import { getUserOrganizations } from "@/features/organizations/service";
import { membershipsService } from "@/features/organizations/service/membershipsService";
import { readAccountOrganizationChoices } from "@/lib/organizations/accountOrganizationChoices";
import {
  classifyLinkOrganizationValue,
  decideLinkOrganization,
  readLinkOrganizationParam,
  type LinkOrganizationDecision,
} from "@/lib/organizations/linkOrganization";

/** The org subset of appContext this resolver produces. */
export interface ResolvedOrgContext {
  organization_id: string | null;
  organization_name: string | null;
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
   * The rungs (this device's remembered choice, and a sole membership) read
   * ONLY the membership list, so an HONEST "choose your organization" is never
   * dressed up as "we could not check".
   */
  unreadableReason?: string | null;
}

/**
 * Resolve the user's active org context. Pure read — never dispatches.
 * Returns null only when the user has no organizations at all.
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
  /**
   * The organization THIS TAB already resolved (a refresh, never a load). It
   * stays while it is still a membership; the account's last active — which
   * another tab may have moved — never pulls an open tab elsewhere.
   */
  heldOrganizationId?: string | null;
}

export async function resolveActiveOrgContext(
  userId: string,
  options: ResolveActiveOrgContextOptions = {},
): Promise<ResolvedOrgContext | null> {
  const orgs = await getUserOrganizations();

  // No memberships at all. With nothing to belong to there is nothing to
  // select and nothing to ask about; the caller renders the honest "you belong
  // to no organization" notice.
  if (!orgs || orgs.length === 0) return null;

  // THE LADDER BELOW THE LINK, computed first. The link's decision needs to
  // know where the person WOULD be working, because "we moved you" (announce
  // it) and "you were already there" (say nothing) is exactly that comparison.
  // The rungs themselves are the platform's ONE ladder (@ai-matrx/data/organizations,
  // shared with Matrx 2): held → last active → start-up → first, each kept only while
  // it is a current membership. The account is read only when no held organization
  // answers; the oldest membership only when nothing else does.
  const resolved = await resolveActiveOrganizationLazily({
    memberships: orgs,
    held: options.heldOrganizationId ?? null,
    readAccount: () => readAccountOrganizationChoices(userId),
    first: () => firstOrganization(orgs),
  });
  const laddered = resolved
    ? { id: resolved.organization.id, name: resolved.organization.name }
    : null;

  // -1. THE LINK'S OWN ORGANIZATION. Decided in one pure place so every branch
  //     — honoured, already-current, offered, refused — is the same one the
  //     seat-level tests exercise. `decideLinkOrganization` checks it against
  //     `orgs`, which is the LIVE membership list: a link can open an
  //     organization, never grant one.
  // A bare value is classified by the ONE rule (uuid, address, or malformed) —
  // judged, never trusted.
  const param =
    typeof options.linkOrganizationId === "string"
      ? options.linkOrganizationId.includes("=")
        ? readLinkOrganizationParam(options.linkOrganizationId)
        : classifyLinkOrganizationValue(options.linkOrganizationId)
      : readLinkOrganizationParam(options.linkOrganizationId ?? null);

  const linkInput = {
    param,
    memberships: orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug })),
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
      ...(link.kind === "no-link" ? {} : { link }),
    };
  }

  // Unreachable while the person has a membership (rung 4 always answers);
  // kept total so a future rung change cannot invent an organization.
  return {
    organization_id: null,
    organization_name: null,
    ...(link.kind === "no-link" ? {} : { link }),
    unreadableReason: "no organization could be chosen from your memberships",
  };
}

/**
 * Rung 4: the oldest ACTIVE membership among the organizations the person can
 * open (archived organizations are already left out of `orgs`).
 */
async function firstOrganization<T extends { id: string; name: string }>(
  orgs: ReadonlyArray<T>,
): Promise<T | null> {
  const result = await membershipsService.forUser("organization");
  if (isRecordsErr(result)) throw new Error(result.error.message);
  const live = new Map(orgs.map((o) => [o.id, o]));
  const oldest = result.data.memberships
    .filter((m) => m.status === "active" && live.has(m.containerId))
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt))[0];
  return oldest ? (live.get(oldest.containerId) ?? null) : (orgs[0] ?? null);
}
