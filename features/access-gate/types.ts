/**
 * features/access-gate/types.ts — the vocabulary for "you can't open this".
 *
 * The whole point of this feature is that the app stops guessing. Before it
 * existed, a zero-row read produced one hand-written sentence ("this was
 * deleted or is no longer accessible") that was wrong more often than right,
 * because RLS returns nothing for FOUR different situations. Those four are
 * named here, and every surface branches on the name instead of inventing copy.
 */

/** What the platform actually knows about a failed read. */
export type AccessGateStatus =
  /** Still resolving. */
  | "loading"
  /** The caller can open it — the read failing was a transient fault, not access. */
  | "ok"
  /** Signed in, real record, genuinely no access. The request flow lives here. */
  | "denied"
  /** The record was soft-deleted. Nothing to request. */
  | "deleted"
  /** No such record, or an id that never existed. */
  | "missing"
  /** Signed out. We deliberately do not say whether the record exists. */
  | "anonymous"
  /** We could not resolve anything — a real fault, shown as a real error. */
  | "error";

/** How much this caller is allowed to be told about the record. */
export type AccessDisclosure =
  /** Kind + name + owner + organization (the default, per the 2026-08-11 ruling). */
  | "full"
  /** Kind only — the entity opted out via `platform.entity_types.deny_preview`. */
  | "kind_only"
  /** Signed out: kind only, and never whether the record exists. */
  | "anonymous"
  /** Nothing at all (unregistered token, or no such row). */
  | "none";

export type AccessRequestStatus =
  | "pending"
  | "granted"
  | "declined"
  | "withdrawn"
  | "reported";

/** The level a requester is asking for. Mirrors `iam.permissions.permission_level`. */
export type RequestedLevel = "viewer" | "editor";

export interface AccessDeniedOwner {
  userId: string;
  /** Null when the person has no profile row yet — render "the owner", never a uuid. */
  displayName: string | null;
  avatarUrl: string | null;
  /**
   * Their public creator handle (`/c/{handle}`), when they have made one public.
   * The ONLY user-facing route that exists for another person — absent it, the
   * owner is rendered as identity with no link rather than as a broken door.
   */
  creatorHandle: string | null;
}

export interface AccessDeniedOrganization {
  id: string;
  name: string | null;
  /** A personal workspace: its "admins" are just the owner, so we never name it as a team. */
  isPersonal: boolean;
  /**
   * Whether the VIEWER can open the org. Usually false here — being outside it
   * is often why they're denied — and a link into a second locked door is a
   * dead end, so the UI only links when this is true.
   */
  viewerIsMember: boolean;
}

export interface AccessDeniedEntity {
  /** Canonical entity token — for the registry, never for display. */
  token: string;
  /** The pretty, human kind name: "Site", "Note", "Agent". */
  label: string;
  /** The record's own name. Absent unless disclosure is `full`. */
  title: string | null;
}

/** The nearest container the caller CAN open — the honest door back. */
export interface AccessDeniedAncestor {
  token: string;
  id: string;
  label: string;
  title: string | null;
}

export interface AccessRequestSummary {
  id: string;
  status: AccessRequestStatus;
  level: RequestedLevel;
  createdAt: string | null;
}

/** The parsed shape of `public.access_denied_context`. */
export interface AccessDeniedContext {
  status: AccessGateStatus;
  disclosure: AccessDisclosure;
  /** The caller's real access. `none` everywhere except the `ok` status. */
  level: "none" | "view" | "edit" | "admin";
  isOwner: boolean;
  entity: AccessDeniedEntity;
  owner: AccessDeniedOwner | null;
  organization: AccessDeniedOrganization | null;
  ancestor: AccessDeniedAncestor | null;
  /** The caller's own outstanding request, never anyone else's. */
  request: AccessRequestSummary | null;
  /** True only when asking can actually succeed. */
  canRequest: boolean;
}

/** One recipient of a freshly-filed request, for the DM the client then sends. */
export interface AccessRequestRecipient {
  userId: string;
  reason: "owner" | "org_admin";
  displayName: string | null;
}

export interface AccessRequestCreated {
  requestId: string;
  status: AccessRequestStatus;
  /** True when a pending request already existed — the click was a no-op. */
  already: boolean;
  level: RequestedLevel;
  entityLabel: string | null;
  entityTitle: string | null;
  recipients: AccessRequestRecipient[];
}

/** A row in either direction of `/settings/access-requests`. */
export interface AccessRequestRow {
  id: string;
  status: AccessRequestStatus;
  requestedLevel: RequestedLevel;
  message: string | null;
  createdAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  resourceType: string;
  resourceId: string;
  entityLabel: string | null;
  entityTitle: string | null;
  /** Present on the inbox side only. */
  requester: AccessDeniedOwner | null;
}
