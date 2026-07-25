/**
 * features/sharing/service/accessSummary.ts
 *
 * THE honest answer to "who can actually see this, and why?" for ONE entity.
 *
 * Every list surface derives its access label from the row's own `visibility`
 * column, which is only one of the SIX ways `iam.has_access_for_base` grants
 * access: owner, visibility+org, direct grant, membership, education
 * assignment, and — the one that kept being missed — reachability through a
 * CONTAINER (a scope, project, data store…). A file marked `personal` that is
 * attached to an org-internal scope is readable by that whole org, and saying
 * "Only you" about it is a lie.
 *
 * This is deliberately ONE ENTITY AT A TIME. It walks reachability and resolves
 * container titles, so it is not something to run per row of a list. List
 * surfaces stay on cheap bulk signals and simply avoid asserting the specific
 * claim they cannot back up.
 *
 * Direct to Supabase (`public.entity_access_summary`), never through Python —
 * this is a plain DB read the browser is entitled to make.
 */

import { createClient } from "@/utils/supabase/client";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

export type AccessGranteeType = "user" | "organization";

export interface AccessDirectGrant {
  granteeType: AccessGranteeType;
  granteeId: string | null;
  granteeLabel: string | null;
  level: string;
  expiresAt: string | null;
}

export interface AccessContainer {
  containerType: string;
  containerId: string;
  /** Human label of the container kind, e.g. "Scope". */
  containerTypeLabel: string | null;
  /** The container's own name, e.g. "Web Development". */
  label: string | null;
  /** Highest permission level conveyed through this container. */
  level: string;
  depth: number;
  visibility: string | null;
  organizationId: string | null;
  organizationName: string | null;
  /** True when everyone in the container's org can read the container. */
  orgReadable: boolean;
  /** Explicit members of the container. */
  memberCount: number;
}

export interface AccessSummary {
  entityType: string;
  entityId: string;
  visibility: string;
  ownerId: string | null;
  viewerIsOwner: boolean;
  organizationId: string | null;
  organizationName: string | null;
  /** Caller has admin — only then are grantee identities populated. */
  canManage: boolean;
  isPublic: boolean;
  /** The entity's OWN visibility makes it org-readable. */
  orgReadable: boolean;
  directGrantCount: number;
  directGrants: AccessDirectGrant[];
  /** Explicit members of the entity itself. */
  memberCount: number;
  containers: AccessContainer[];
  containerCount: number;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function bool(value: unknown): boolean {
  return value === true;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseGrant(raw: unknown): AccessDirectGrant | null {
  const row = record(raw);
  if (!row) return null;
  return {
    granteeType: row.grantee_type === "organization" ? "organization" : "user",
    granteeId: str(row.grantee_id),
    granteeLabel: str(row.grantee_label),
    level: str(row.level) ?? "viewer",
    expiresAt: str(row.expires_at),
  };
}

function parseContainer(raw: unknown): AccessContainer | null {
  const row = record(raw);
  if (!row) return null;
  const containerId = str(row.container_id);
  const containerType = str(row.container_type);
  if (!containerId || !containerType) return null;
  return {
    containerType,
    containerId,
    containerTypeLabel: str(row.container_type_label),
    label: str(row.label),
    level: str(row.level) ?? "viewer",
    depth: num(row.depth),
    visibility: str(row.visibility),
    organizationId: str(row.organization_id),
    organizationName: str(row.organization_name),
    orgReadable: bool(row.org_readable),
    memberCount: num(row.member_count),
  };
}

function parseSummary(raw: unknown): AccessSummary {
  const row = record(raw);
  if (!row) {
    throw new Error("entity_access_summary returned an unexpected shape");
  }
  const grants = Array.isArray(row.direct_grants) ? row.direct_grants : [];
  const containers = Array.isArray(row.containers) ? row.containers : [];
  return {
    entityType: str(row.entity_type) ?? "",
    entityId: str(row.entity_id) ?? "",
    visibility: str(row.visibility) ?? "personal",
    ownerId: str(row.owner_id),
    viewerIsOwner: bool(row.viewer_is_owner),
    organizationId: str(row.organization_id),
    organizationName: str(row.organization_name),
    canManage: bool(row.can_manage),
    isPublic: bool(row.is_public),
    orgReadable: bool(row.org_readable),
    directGrantCount: num(row.direct_grant_count),
    directGrants: grants
      .map(parseGrant)
      .filter((g): g is AccessDirectGrant => g !== null),
    memberCount: num(row.member_count),
    containers: containers
      .map(parseContainer)
      .filter((c): c is AccessContainer => c !== null),
    containerCount: num(row.container_count),
  };
}

/** Full effective-access explanation for one entity. Throws on RPC failure. */
export async function fetchAccessSummary(
  entityType: EntityTypeToken,
  entityId: string,
): Promise<AccessSummary> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("entity_access_summary", {
    p_type: entityType,
    p_id: entityId,
  });
  if (error) throw new Error(error.message);
  return parseSummary(data);
}

/**
 * Display titles for a batch of ids of ONE entity token, resolved LIVE from the
 * owning table. Never render a denormalized association label instead — it goes
 * stale the moment the target is renamed. Ids the caller cannot view are
 * omitted by the RPC rather than leaked.
 */
export async function fetchEntityTitles(
  entityType: EntityTypeToken,
  ids: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return out;

  const supabase = createClient();
  const { data, error } = await supabase.rpc("entity_titles", {
    p_type: entityType,
    p_ids: unique,
  });
  if (error) throw new Error(error.message);
  for (const raw of Array.isArray(data) ? data : []) {
    const row = record(raw);
    const id = row ? str(row.id) : null;
    if (id) out.set(id, row ? str(row.title) : null);
  }
  return out;
}

/**
 * The honest one-line headline for an entity, given everything we know.
 * Shared by the info panel and anywhere else that must not overstate privacy.
 */
export function describeAccessSummary(summary: AccessSummary): string {
  if (summary.isPublic) return "Public — anyone with the link";

  const reasons: string[] = [];
  if (summary.orgReadable && summary.organizationName) {
    reasons.push(`everyone in ${summary.organizationName}`);
  }
  if (summary.directGrantCount > 0) {
    reasons.push(
      summary.directGrantCount === 1
        ? "1 person or org it is shared with"
        : `${summary.directGrantCount} people or orgs it is shared with`,
    );
  }
  for (const container of summary.containers) {
    const name = container.label ?? container.containerTypeLabel ?? "a container";
    if (container.orgReadable && container.organizationName) {
      reasons.push(`everyone in ${container.organizationName} (via ${name})`);
    } else if (container.memberCount > 0) {
      reasons.push(`members of ${name}`);
    } else {
      reasons.push(`anyone who can open ${name}`);
    }
  }

  if (reasons.length === 0) return "Private — only you";
  return `You, plus ${reasons.join(", ")}`;
}
