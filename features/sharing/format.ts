/**
 * features/sharing/format.ts
 *
 * The ONE set of human summaries + rendered-view extractors for every sharing
 * surface (grant rows, the reachability summary, public state, the whole access
 * panel). Consumed by `PermissionsList`, `AccessSummaryPanel`, the share tabs,
 * and any page that composes them — never duplicated at a callsite.
 *
 * THE WHAT-I-SEE LAW (agent-copy skill): these builders return the RENDERED
 * surface converted to data, not the raw rows behind it. Where the panel shows
 * a sentence, the payload carries that same sentence verbatim — including the
 * red ones. A user copying an access surface is asking an agent "why can't this
 * person see this, and what do I change?", so denials and errors are the
 * highest-value content here, not a footnote.
 *
 * `accessReasonRows` is deliberately the SAME function `AccessSummaryPanel`
 * renders from: mirror the view's extractor, never re-derive it beside the view.
 */

import { humanLines } from "@/features/marketing/lib/copy-payloads";
import {
  describeAccessSummary,
  type AccessContainer,
  type AccessSummary,
} from "@/features/sharing/service/accessSummary";
import type { PermissionWithDetails } from "@/utils/permissions/types";

/** Location line for every sharing payload. */
export function sharingLocation(surface: string): string {
  return `AI Matrx — Sharing — ${surface}`;
}

/** `humanLines` renders label: value pairs; booleans need words. */
function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

// ---------------------------------------------------------------------------
// The page KPIs
// ---------------------------------------------------------------------------

/**
 * The numbers an access surface LEADS with — the tab counts, the public dot,
 * and (when the reachability summary is on screen) its visibility and reason
 * count. Every payload from such a surface carries these verbatim, in the body
 * AND the envelope attributes, so the agent never recomputes what the user is
 * already looking at.
 *
 * `null` means "not resolved / not rendered", which is itself information: it
 * is the difference between "nobody owns this" and "we could not find out".
 */
export interface AccessKpis {
  user_grants: number;
  org_grants: number;
  public_grants: number;
  total_grants: number;
  is_public: boolean;
  /** null while ownership is loading or failed to resolve. */
  viewer_is_owner: boolean | null;
  /** The entity's own visibility setting, when the summary is on screen. */
  visibility: string | null;
  /** True when the entity's own visibility makes it org-readable. */
  org_readable: boolean | null;
  /** How many distinct REASONS grant access (the summary's reason rows). */
  reachability_reasons: number | null;
  /** Containers that convey access (scopes, projects, data stores…). */
  container_count: number | null;
  [key: string]: string | number | boolean | null | undefined;
}

export function accessKpis(input: {
  permissions: PermissionWithDetails[];
  isPublic: boolean;
  /** null while unresolved — never coerce an unknown owner to false. */
  viewerIsOwner: boolean | null;
  /** The reachability summary, when this surface renders one. */
  summary?: AccessSummary | null;
  /** The entity type, needed to phrase the reason rows the way the UI does. */
  entityType?: string;
}): AccessKpis {
  const { permissions, isPublic, viewerIsOwner, summary, entityType } = input;
  const userGrants = permissions.filter((p) => p.grantedToUserId).length;
  const orgGrants = permissions.filter(
    (p) => p.grantedToOrganizationId,
  ).length;
  const publicGrants = permissions.filter((p) => p.isPublic).length;
  return {
    user_grants: userGrants,
    org_grants: orgGrants,
    public_grants: publicGrants,
    total_grants: permissions.length,
    is_public: isPublic,
    viewer_is_owner: viewerIsOwner,
    visibility: summary?.visibility ?? null,
    org_readable: summary ? summary.orgReadable : null,
    reachability_reasons: summary
      ? accessReasonRows(summary, entityType ?? summary.entityType).length
      : null,
    container_count: summary ? summary.containers.length : null,
  };
}

/** Identity + KPIs every sharing payload needs to be interpretable. */
export interface SharingCopyContext {
  /** Entity/resource token, e.g. "web_site". */
  resourceType: string;
  resourceId: string;
  resourceName?: string | null;
  /** Where the user is, in words — e.g. "Site access — example.com". */
  surface: string;
  /** The page's leading KPIs, mirrored verbatim into every payload. */
  kpis: AccessKpis;
}

/**
 * A sentence the surface actually RENDERED — a denial, a blocker, a warning, a
 * plain-state note. Captured verbatim; never paraphrased into the payload.
 */
export interface AccessNotice {
  tone: "error" | "warning" | "info";
  /** The exact rendered text. */
  text: string;
  /** Which part of the surface rendered it. */
  where: string;
}

export function humanNotices(notices: AccessNotice[]): string {
  if (notices.length === 0) return "No errors or blockers are shown.";
  return notices
    .map((n) => `[${n.tone.toUpperCase()}] ${n.where}: ${n.text}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Grant rows — what PermissionsList renders
// ---------------------------------------------------------------------------

export type GranteeKind = "user" | "organization" | "public";

export function granteeKind(permission: PermissionWithDetails): GranteeKind {
  if (permission.isPublic) return "public";
  if (permission.grantedToOrganization || permission.grantedToOrganizationId)
    return "organization";
  return "user";
}

/** The row's primary line, exactly as PermissionsList renders it. */
export function granteeLabel(permission: PermissionWithDetails): string {
  if (permission.isPublic) return "Everyone";
  if (permission.grantedToUser) {
    return (
      permission.grantedToUser.displayName || permission.grantedToUser.email
    );
  }
  if (permission.grantedToOrganization)
    return permission.grantedToOrganization.name;
  return "Unknown";
}

/** The row's secondary line (the email, when a display name took the first). */
export function granteeSecondaryLabel(
  permission: PermissionWithDetails,
): string | null {
  if (permission.grantedToUser?.displayName) {
    return permission.grantedToUser.email;
  }
  return null;
}

/**
 * The badge text the row shows a non-owner. Owners see a level SELECT with the
 * same value, so this doubles as the level label in both modes.
 */
export function grantLevelLabel(permission: PermissionWithDetails): string {
  if (permission.isPublic) return "Public";
  const level = permission.permissionLevel;
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function humanGrantRow(permission: PermissionWithDetails): string {
  return humanLines([
    ["Grantee", granteeLabel(permission)],
    ["Email", granteeSecondaryLabel(permission)],
    ["Grantee type", granteeKind(permission)],
    ["Level", grantLevelLabel(permission)],
    ["Grantee id", permission.grantedToUserId ?? permission.grantedToOrganizationId],
    ["Resource", `${permission.resourceType}:${permission.resourceId}`],
    ["Granted at", permission.createdAt ? String(permission.createdAt) : null],
    ["Grant id", permission.id],
  ]);
}

/** One flat row for CSV export. */
export function grantCsvRow(
  permission: PermissionWithDetails,
): Record<string, unknown> {
  return {
    grantee: granteeLabel(permission),
    grantee_email: granteeSecondaryLabel(permission) ?? "",
    grantee_type: granteeKind(permission),
    level: permission.permissionLevel,
    is_public: permission.isPublic ?? false,
    grantee_user_id: permission.grantedToUserId ?? "",
    grantee_organization_id: permission.grantedToOrganizationId ?? "",
    resource_type: permission.resourceType,
    resource_id: permission.resourceId,
    granted_at: permission.createdAt ? String(permission.createdAt) : "",
    grant_id: permission.id,
  };
}

export function grantCsvRows(
  permissions: PermissionWithDetails[],
): Array<Record<string, unknown>> {
  return permissions.map(grantCsvRow);
}

/**
 * The empty state PermissionsList renders — copied verbatim, because "no one
 * has been granted access here" is frequently the whole answer to "why can't
 * they see this?".
 */
export const NO_GRANTS_HEADLINE = "Not shared with anyone";
export const NO_GRANTS_DETAIL = "No one has been granted access here";

/**
 * A DIRECT-GRANT list can only ever say what was granted HERE. It cannot see
 * visibility, org membership, or access conveyed through a container, so every
 * payload it emits says so out loud — otherwise an agent reads "0 grants" as
 * "nobody can see it" and tells the user to grant access they already have.
 */
export const GRANT_LIST_SCOPE_NOTE =
  "This list covers DIRECT grants on this resource only. Access can also come from ownership, the resource's visibility setting, organization membership, or a container (scope, project, data store) that conveys it — see the access summary for the complete picture.";

export function humanGrantList(
  permissions: PermissionWithDetails[],
  options: { surface: string; shown?: number } = { surface: "Sharing" },
): string {
  const header = `Current access — ${permissions.length} direct grant${
    permissions.length === 1 ? "" : "s"
  } (${options.surface})`;
  if (permissions.length === 0) {
    return [
      header,
      `${NO_GRANTS_HEADLINE} — ${NO_GRANTS_DETAIL}`,
      GRANT_LIST_SCOPE_NOTE,
    ].join("\n");
  }
  const shownNote =
    options.shown != null && options.shown < permissions.length
      ? `\n(${options.shown} of ${permissions.length} rows are visible on screen; this copy covers all ${permissions.length}.)`
      : "";
  return [
    header,
    permissions
      .map((p) => `- ${humanGrantRow(p).replaceAll("\n", " · ")}`)
      .join("\n"),
    GRANT_LIST_SCOPE_NOTE + shownNote,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The reachability summary — what AccessSummaryPanel renders
// ---------------------------------------------------------------------------

/** The entity's own visibility SETTING, in the DB's true vocabulary. */
export function visibilityLabel(visibility: string): string {
  switch (visibility) {
    case "public":
      return "Public — anyone with the link";
    case "shared":
      return "Shared — specific grantees and share links";
    case "internal":
      return "Internal — readable inside the owning organization";
    case "personal":
      return "Personal — belongs to one person";
    default:
      return visibility;
  }
}

export function isPrivateSummary(summary: AccessSummary): boolean {
  return (
    !summary.isPublic &&
    !summary.orgReadable &&
    summary.directGrantCount === 0 &&
    summary.containers.length === 0
  );
}

export function containerTitle(container: AccessContainer): string {
  const kind = container.containerTypeLabel ?? container.containerType;
  return container.label ? `${container.label} (${kind})` : kind;
}

export function containerDetail(container: AccessContainer): string {
  const parts: string[] = [`grants ${container.level}`];
  if (container.orgReadable && container.organizationName) {
    parts.push(`readable by everyone in ${container.organizationName}`);
  } else if (container.memberCount > 0) {
    parts.push(
      container.memberCount === 1
        ? "1 member"
        : `${container.memberCount} members`,
    );
  }
  return parts.join(" · ");
}

/** One rendered reason row — the part users act on. */
export interface AccessReasonRow {
  /** Stable key for React + payload correlation. */
  id: string;
  kind: "organization" | "direct-grants" | "container";
  title: string;
  detail: string;
  /** Present for container reasons, so the agent can name what to detach. */
  containerType?: string;
  containerId?: string;
}

/**
 * THE reason list — rendered by `AccessSummaryPanel` AND copied by every
 * payload that includes it. One extractor, two consumers; the export can never
 * drift from the screen.
 */
export function accessReasonRows(
  summary: AccessSummary,
  entityType: string,
): AccessReasonRow[] {
  const rows: AccessReasonRow[] = [];

  if (summary.orgReadable && summary.organizationName) {
    rows.push({
      id: "org-readable",
      kind: "organization",
      title: `Everyone in ${summary.organizationName}`,
      detail: `This ${entityType.replace(/_/g, " ")} is ${summary.visibility} in that organization`,
    });
  }

  if (summary.directGrantCount > 0) {
    rows.push({
      id: "direct-grants",
      kind: "direct-grants",
      title:
        summary.directGrantCount === 1
          ? "1 direct share"
          : `${summary.directGrantCount} direct shares`,
      detail:
        summary.canManage && summary.directGrants.length > 0
          ? summary.directGrants
              .map((g) => `${g.granteeLabel ?? g.granteeType} · ${g.level}`)
              .join(", ")
          : "Open the Share tab to manage",
    });
  }

  for (const container of summary.containers) {
    rows.push({
      id: `${container.containerType}:${container.containerId}`,
      kind: "container",
      title: containerTitle(container),
      detail: containerDetail(container),
      containerType: container.containerType,
      containerId: container.containerId,
    });
  }

  return rows;
}

/** The closing line the panel renders when nothing grants access. */
export const NOTHING_ELSE_GRANTS = "Nothing else grants access to this yet.";

/** The panel's rendered error headline, verbatim. */
export const ACCESS_SUMMARY_ERROR_HEADLINE = "Couldn’t determine access";

/**
 * The reachability panel as DATA — every line it puts on screen, in order.
 * This is the payload body; the raw `AccessSummary` rides along beside it so
 * nothing is lost.
 */
export interface AccessSummaryView {
  visibility_label: string;
  headline: string;
  reasons: AccessReasonRow[];
  nothing_else_grants: string | null;
  raw: AccessSummary;
}

export function accessSummaryView(
  summary: AccessSummary,
  entityType: string,
): AccessSummaryView {
  return {
    visibility_label: visibilityLabel(summary.visibility),
    headline: describeAccessSummary(summary),
    reasons: accessReasonRows(summary, entityType),
    nothing_else_grants: isPrivateSummary(summary) ? NOTHING_ELSE_GRANTS : null,
    raw: summary,
  };
}

export function humanAccessSummary(
  summary: AccessSummary,
  entityType: string,
): string {
  const view = accessSummaryView(summary, entityType);
  return [
    `Who can see this, and why:`,
    `- Visibility: ${view.visibility_label}`,
    `- ${view.headline}`,
    view.reasons.length
      ? view.reasons
          .map((r) => `- ${r.title}${r.detail ? ` — ${r.detail}` : ""}`)
          .join("\n")
      : null,
    view.nothing_else_grants ? `- ${view.nothing_else_grants}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Reason rows as flat CSV rows. */
export function reasonCsvRows(
  rows: AccessReasonRow[],
): Array<Record<string, unknown>> {
  return rows.map((r) => ({
    kind: r.kind,
    reason: r.title,
    detail: r.detail,
    container_type: r.containerType ?? "",
    container_id: r.containerId ?? "",
  }));
}

// ---------------------------------------------------------------------------
// Public state — what PublicAccessTab renders
// ---------------------------------------------------------------------------

/**
 * The public tab as DATA. `state_sentence` / `warning_sentence` are the exact
 * strings on screen — the tab's whole job is explaining a reachability state in
 * prose, so paraphrasing it into the payload would lose the answer.
 */
export interface PublicAccessView {
  supports_public: boolean;
  is_link_shareable: boolean;
  is_public: boolean;
  type_label: string;
  public_url: string | null;
  heading: string;
  state_sentence: string;
  /** The amber "open to everyone" caveat, rendered only while public. */
  warning_sentence: string | null;
  /** The "Not open to everyone" explanation, rendered only while private. */
  private_sentence: string | null;
  /** Rendered when the type cannot be public at all. */
  unsupported_sentence: string | null;
  /** Owners get the toggle; everyone else reads a badge. */
  viewer_can_change: boolean;
}

export function humanPublicState(view: PublicAccessView): string {
  return humanLines([
    ["Heading", view.heading],
    [
      "State",
      view.is_public ? "Public — open to everyone" : "Not open to everyone",
    ],
    ["Explanation", view.state_sentence],
    ["Warning", view.warning_sentence],
    ["While private", view.private_sentence],
    ["Unavailable", view.unsupported_sentence],
    [
      "Public page URL",
      view.public_url ?? "none — this type has no public page",
    ],
    ["Type supports public visibility", yesNo(view.supports_public)],
    ["Type supports no-login share links", yesNo(view.is_link_shareable)],
    ["Viewer can change this", yesNo(view.viewer_can_change)],
    ["Item type", view.type_label],
  ]);
}

// ---------------------------------------------------------------------------
// The whole access panel
// ---------------------------------------------------------------------------

/**
 * Everything an access surface shows, as one payload body. Built by the page
 * that composes the sharing components, from LIVE state at click time.
 */
export interface AccessPanelView {
  resource: {
    type: string;
    id: string;
    name?: string | null;
  };
  kpis: AccessKpis;
  /** The tab the user is actually looking at. */
  active_tab?: string;
  /** Every error / blocker / notice rendered right now, verbatim. */
  notices: AccessNotice[];
  access_summary: AccessSummaryView | null;
  /** Present instead of `access_summary` when the summary failed to load. */
  access_summary_error: string | null;
  user_grants: PermissionWithDetails[];
  org_grants: PermissionWithDetails[];
  public_grant: PermissionWithDetails | null;
  is_public: boolean;
  scope_note: string;
}

export function humanAccessPanel(view: AccessPanelView): string {
  const k = view.kpis;
  return [
    `Access — ${view.resource.name ?? view.resource.type} (${view.resource.type}:${view.resource.id})`,
    view.active_tab ? `Tab on screen: ${view.active_tab}` : null,
    `KPIs: ${k.user_grants} user grant${k.user_grants === 1 ? "" : "s"} · ${k.org_grants} org grant${k.org_grants === 1 ? "" : "s"} · ${k.is_public ? "public" : "not public"} · owner: ${
      k.viewer_is_owner === null ? "unresolved" : k.viewer_is_owner ? "you" : "not you"
    }`,
    "",
    "ERRORS & BLOCKERS ON SCREEN:",
    humanNotices(view.notices),
    "",
    view.access_summary_error
      ? `${ACCESS_SUMMARY_ERROR_HEADLINE}: ${view.access_summary_error}`
      : view.access_summary
        ? humanAccessSummaryFromView(view.access_summary)
        : "The access summary is not on screen.",
    "",
    humanGrantList(view.user_grants, { surface: "Users tab" }),
    "",
    humanGrantList(view.org_grants, { surface: "Organizations tab" }),
    "",
    `Public: ${view.is_public ? "open to everyone" : "not open to everyone"}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function humanAccessSummaryFromView(view: AccessSummaryView): string {
  return [
    `Who can see this, and why:`,
    `- Visibility: ${view.visibility_label}`,
    `- ${view.headline}`,
    ...view.reasons.map(
      (r) => `- ${r.title}${r.detail ? ` — ${r.detail}` : ""}`,
    ),
    view.nothing_else_grants ? `- ${view.nothing_else_grants}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
