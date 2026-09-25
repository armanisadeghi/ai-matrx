/**
 * requestAccess — THE "you can't do this here, ask someone who can" primitive.
 *
 * Owner ruling (Arman, 2026-09-25): a control the viewer cannot use is ABSENT;
 * where they would plausibly want it, they get one generic way to ask — a note
 * plus the context we already know. No new message store:
 *
 *   owner = an organization → `setting_access_request_create` — the durable
 *           `iam.access_requests` row (inbox at /settings/access-requests) plus
 *           an actionable DM to that org's owners/admins.
 *   owner = the system      → a `users.user_feedback` item (the platform team's
 *           queue), because nobody in an organization can change it.
 *
 * This module is pure routing + context text so it is testable without React.
 */

import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import type { JsonObject } from "@/types/json";

/** Who can say yes. The system org id is treated as `system`. */
export type RequestAccessOwner =
  | "system"
  | {
      organizationId: string;
      /** Shown in the dialog ("Goes to Acme admins"). */
      organizationName?: string | null;
      /** Slug or id used in the admins' "Open setting" link. Defaults to the id. */
      organizationSlugOrId?: string | null;
    };

export interface RequestAccessTarget {
  /** What the person wants to do, as a short verb phrase: "Edit goal". */
  action: string;
  /** The thing it applies to. */
  resource: {
    /** Plain kind word: "Mandate", "Site". */
    kind: string;
    name: string;
    /** Canonical entity token, when there is one. */
    type?: string | null;
    id?: string | null;
  };
  owner: RequestAccessOwner;
  /**
   * Org owners only: where an admin makes this change. Must live under
   * `/organizations/<org>/settings` (the ledger's link rule); anything else
   * falls back to the organization's settings home.
   */
  manageHref?: string | null;
}

export type ResolvedOwner =
  | { kind: "system" }
  | {
      kind: "organization";
      organizationId: string;
      organizationName: string | null;
      organizationSlugOrId: string;
    };

export function resolveRequestOwner(owner: RequestAccessOwner): ResolvedOwner {
  if (
    owner === "system" ||
    owner.organizationId.toLowerCase() === SYSTEM_ORGANIZATION_ID.toLowerCase()
  ) {
    return { kind: "system" };
  }
  return {
    kind: "organization",
    organizationId: owner.organizationId,
    organizationName: owner.organizationName ?? null,
    organizationSlugOrId: owner.organizationSlugOrId || owner.organizationId,
  };
}

/** "Goes to Acme admins" / "Goes to the platform team". */
export function destinationLabel(owner: ResolvedOwner): string {
  if (owner.kind === "system") return "the platform team";
  return owner.organizationName
    ? `${owner.organizationName} admins`
    : "your organization's admins";
}

export interface RequestContext {
  pageUrl: string;
  requesterName: string | null;
  requesterEmail: string | null;
}

/** The context lines shown in the dialog and carried with the request. */
export function contextLines(
  target: RequestAccessTarget,
  context: RequestContext,
): Array<[label: string, value: string]> {
  const who = [context.requesterName, context.requesterEmail]
    .filter(Boolean)
    .join(" · ");
  return [
    ["Wants to", target.action],
    ["On", `${target.resource.kind} “${target.resource.name}”`],
    ["Page", context.pageUrl],
    ...(who ? ([["Asked by", who]] as Array<[string, string]>) : []),
  ];
}

/** One short title for the request: "Edit goal — Mandate “Call summary”". */
export function requestTitle(target: RequestAccessTarget): string {
  const title = `${target.action} — ${target.resource.kind} “${target.resource.name}”`;
  return title.length > 160 ? `${title.slice(0, 157)}…` : title;
}

/** The full text: note first (the human part), then the context. */
export function requestBody(
  target: RequestAccessTarget,
  context: RequestContext,
  note: string,
): string {
  const trimmed = note.trim();
  const lines = contextLines(target, context).map(
    ([label, value]) => `${label}: ${value}`,
  );
  if (target.resource.type && target.resource.id) {
    lines.push(`Record: ${target.resource.type} ${target.resource.id}`);
  }
  return [trimmed || null, lines.join("\n")].filter(Boolean).join("\n\n");
}

const ORG_SETTINGS_HREF = /^\/organizations\/[^/]+\/settings/;

/** The admins' door. Honors the ledger rule, never invents a deeper route. */
export function orgManageHref(
  target: RequestAccessTarget,
  owner: Extract<ResolvedOwner, { kind: "organization" }>,
): string {
  const href = target.manageHref?.trim();
  if (href && ORG_SETTINGS_HREF.test(href) && href.length <= 1000) return href;
  return `/organizations/${encodeURIComponent(owner.organizationSlugOrId)}/settings`;
}

/** Stable per (resource, action) so a repeat ask is a no-op, not a second DM. */
export function orgSettingKey(target: RequestAccessTarget): string {
  const key = [
    "request",
    target.resource.type || target.resource.kind.toLowerCase(),
    target.resource.id || target.resource.name,
    target.action.toLowerCase(),
  ].join(":");
  return key.length > 200 ? key.slice(0, 200) : key;
}

export function orgActionPayload(
  target: RequestAccessTarget,
  owner: Extract<ResolvedOwner, { kind: "organization" }>,
): JsonObject {
  return {
    organization_id: owner.organizationId,
    action: target.action,
    resource_kind: target.resource.kind,
    resource_name: target.resource.name,
    resource_type: target.resource.type ?? null,
    resource_id: target.resource.id ?? null,
  };
}

/** `users.user_feedback.metadata` for a system-owned ask. */
export function feedbackMetadata(
  target: RequestAccessTarget,
  context: RequestContext,
): JsonObject {
  return {
    kind: "access_request",
    action: target.action,
    resource_kind: target.resource.kind,
    resource_name: target.resource.name,
    resource_type: target.resource.type ?? null,
    resource_id: target.resource.id ?? null,
    page_url: context.pageUrl,
  };
}
