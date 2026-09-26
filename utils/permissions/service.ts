/**
 * Permission Service
 *
 * Every write operation routes through a SECURITY DEFINER RPC — no client ever
 * writes to the permissions table or resource visibility columns directly.
 *
 * Full RPC inventory:
 *   share_resource_with_user()    — grant user access (validates ownership)
 *   grant_org_availability()      — make a thing AVAILABLE to an organization as org configuration
 *                                   (surface binding, library contribution). Never a share: a share
 *                                   names a person (SHARE-PEOPLE-ONLY, 2026-09-25); the old
 *                                   share_resource_with_org refuses.
 *   update_permission_level()     — change user or org permission level (validates ownership)
 *   revoke_resource_access()      — remove a user's grant (validates ownership)
 *   revoke_resource_org_access()  — remove an organization's availability row (validates ownership)
 *   make_resource_public()        — set is_public = true on resource row (validates ownership)
 *   make_resource_private()       — set is_public = false on resource row (validates ownership)
 *   get_resource_permissions()    — list all grants with user/org details (owner-only)
 *   is_resource_owner()           — check ownership for any table
 *
 * Public-state storage is resolved by `get_share_capabilities`: it verifies the
 * physical column and classifies it as enum or boolean. Registry
 * `isPublicColumn = null` is deliberately ambiguous — it covers canonical enum
 * tables and types that do not support public visibility at all.
 *
 * Visibility model (two tiers only):
 *   - Personal: accessible only to owner + explicit user/org grants + hierarchy members
 *   - Public:  is_public = true on the resource row — readable by anyone including unauthenticated
 *   - is_public lives on the resource row, NOT the permissions table.
 *     Always read it via getResourceVisibility() — never from the permissions table.
 *   - The permissions table stores only explicit user/org grants.
 *   - check_resource_access() is the single RLS engine: evaluates all access paths
 *     (owner, assignee, direct grant, project, workspace, org hierarchy) in one query.
 */

import { supabase } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { getActiveOrgId } from "@/lib/organizations/activeOrg";
import type { Database, Json } from "@/types/database.types";
import {
  Permission,
  PermissionWithDetails,
  ResourceType,
  PermissionLevel,
  ShareWithUserOptions,
  OrgAvailabilityOptions,
  MakePublicOptions,
  UpdatePermissionOptions,
  RevokeAccessOptions,
  CheckPermissionOptions,
  PermissionCheckResult,
  ShareActionResult,
  satisfiesPermissionLevel,
  toDbPermissionLevel,
} from "./types";
import { getShareableResource, getResourceTypeLabel } from "./registry";
import { getShareCapabilities } from "./shareLinks";
import { operationFailed } from "@/utils/errors";

/**
 * Minimal query surface used by the dynamic-table helpers below. The registry
 * resolves schema/table names at RUNTIME from resource-type metadata (any of
 * dozens of resource types), so the generated `Database` type — which requires
 * literal schema/table names — cannot express this call shape statically.
 *
 * MATRX-EXCEPTION: `resolveDynamicClient` is the one sanctioned cast site for
 * this pattern in this file; every dynamic-schema table access below routes
 * through it instead of hand-rolling its own `as unknown as` interface.
 */
interface DynamicTableClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: <T>() => Promise<{ data: T | null; error: unknown }>;
      };
    };
    update: (patch: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => {
        select: (
          columns: string,
        ) => Promise<{ data: unknown[] | null; error: unknown }>;
      };
    };
  };
}

/** Resolve a client scoped to a dynamically-named schema (or the default public client). */
function resolveDynamicClient(
  schemaName: string | undefined,
): DynamicTableClient {
  const base = supabase as unknown as { schema: (s: string) => unknown };
  return (schemaName
    ? base.schema(schemaName)
    : supabase) as unknown as DynamicTableClient;
}

type RpcPermissionRow =
  Database["public"]["Functions"]["get_resource_permissions"]["Returns"][number];
type PermissionsTableRow = Database["iam"]["Tables"]["permissions"]["Row"];

function errMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "Unknown error";
}

/** Share / visibility RPCs return `Json` — narrow without assuming shape beyond optional success/error/message. */
function parseShareRpcResult(data: Json | null | undefined): {
  success: boolean;
  error?: string;
  message?: string;
} {
  if (
    data === null ||
    data === undefined ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return { success: false, error: "Invalid response" };
  }
  const o = data as Record<string, unknown>;
  const success = o.success === true;
  const err = typeof o.error === "string" ? o.error : undefined;
  const message = typeof o.message === "string" ? o.message : undefined;
  return { success, error: err, message };
}

// ============================================================================
// Resource Visibility (is_public lives on the resource row)
// ============================================================================

/**
 * The canonical visibility enum (platform.visibility). `link` is set by the
 * share-link flow, not by the visibility picker, so the picker offers the three
 * states a person actually chooses between: personal / internal / public.
 */
export type VisibilityValue = "personal" | "internal" | "link" | "public";

export interface ResourceVisibility {
  isPublic: boolean;
  /**
   * The row's actual enum value, for types whose public state is the canonical
   * `visibility` column. Null for legacy boolean-backed types, which genuinely
   * only have two states — a caller must not invent a third for them.
   */
  visibility: VisibilityValue | null;
  /**
   * WHEN MEMBERSHIP ALONE REACHES IT (SHARE-TAILS, chair ruling 2026-09-25). A record-store thing
   * with no sharing choice is the organization's default — every member reaches it at the member
   * default level — and the lane door says so. Absent/null when membership reaches nothing (the
   * owner chose "Only people I share it with", or the organization shows members nothing by
   * default), and for every type outside the record store.
   */
  organizationDefault?: {
    level: string;
    organizationName: string;
    /** The organization whose default it is — its own availability row IS this default. */
    organizationId?: string;
  } | null;
  /**
   * WHO CAN SEE THIS (lane SHARE-LANE-CONTROL, VERIFIER-23 item 3). The owner's lane choice, as the
   * record store's lane door names it in every state. Present only for kinds whose lane has a door
   * (the record store); absent everywhere else, so no control is drawn that could not work.
   */
  whoCanSee?: WhoCanSee | null;
  /**
   * The thing's OWN organization, read off its row (never the active one). Null when its table
   * names none or the read could not say. The Share dialog compares it with the viewer's
   * personal workspace (`personalHome`).
   */
  homeOrganizationId?: string | null;
}

/** The three lanes the Share dialog's "Who can see this" control offers. */
export type LaneChoice = "mine" | "organization" | "world";

export interface WhoCanSee {
  /** Which door reads and writes it: the record store's lane doors, or the row's visibility column. */
  source: "store" | "visibility";
  choice: LaneChoice;
  /** The object's OWN organization (never the active one). Null when the door names none. */
  organizationId: string | null;
  organizationName: string | null;
  /** What the organization's member default grants on it, whichever lane is chosen. */
  memberDefaultLevel: string | null;
  /** Organization members reach it right now through the member default. */
  membersReachNow: boolean;
  /** "Anyone with the link" is offered only when the world lane would accept it. */
  worldOffered: boolean;
}

/** Lane → visibility for kinds whose lane IS their row's canonical visibility column. */
export function laneOfVisibility(v: VisibilityValue | null): LaneChoice | null {
  if (v === "personal") return "mine";
  if (v === "internal") return "organization";
  if (v === "link" || v === "public") return "world";
  return null;
}

/**
 * THE ONE WRITER OF THE RECORD STORE'S LANE. `custom.share_lane_set` needs the object's own
 * organization (the lane door names it) and Admin on the thing; it moves the lane and the
 * record's visibility together, and named people are untouched by it.
 */
export async function setStoreLane(
  organizationId: string,
  subjectId: string,
  choice: LaneChoice,
): Promise<ShareActionResult> {
  const door = choice === "world" ? "community" : choice;
  const { data, error } = await (
    supabase as unknown as {
      schema(name: string): {
        rpc(
          fn: string,
          args: Record<string, unknown>,
        ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
      };
    }
  )
    .schema("custom")
    .rpc("share_lane_set", {
      p_organization_id: organizationId,
      p_subject_id: subjectId,
      p_choice: door,
    });
  if (error) return { success: false, error: errMessage(error) };
  const said = (data as { message?: unknown } | null)?.message;
  return {
    success: true,
    ...(typeof said === "string" ? { message: said } : {}),
  };
}

/**
 * Direct write of a verified enum-visibility resource row.
 *
 * Publishing is an EDIT-level action, deliberately — anyone with edit access or
 * better may change visibility, not just the creator. In real companies the
 * publisher is the approver at the end of the line, not whoever clicked "new"
 * first (Arman, 2026-08-14). Do NOT re-gate this on ownership; see
 * common-docs/systems/platform/access/SHARE_LEVELS.md.
 *
 * So a zero-row result here does NOT mean "you're not the owner" — under RLS it
 * means the row is invisible to this user, deleted, or gone. Never assert a
 * permission reason from an empty result. A genuine refusal (e.g. the
 * governance-column guard on a per-type governed field) arrives as a real
 * Postgres error carrying its own user-facing message, handled below.
 */
async function setVisibilityColumn(
  resourceType: ResourceType,
  resourceId: string,
  column: "visibility" | "card_visibility",
  visibility: "personal" | "internal" | "link" | "public",
): Promise<ShareActionResult> {
  const entry = getShareableResource(resourceType);
  if (!entry) {
    throw new Error(
      `Unknown shareable resource token: ${resourceType}. Bare table names are not accepted.`,
    );
  }
  const scoped = resolveDynamicClient(entry.schemaName);
  const { data, error } = await scoped
    .from(entry.tableName)
    .update({ [column]: visibility })
    .eq(entry.idColumn, resourceId)
    .select("id");
  if (error) {
    // A real DB refusal already carries a message written for a human — pass it
    // through rather than replacing it with a guess about why.
    return { success: false, error: errMessage(error) };
  }
  if (!data || data.length === 0) {
    return {
      success: false,
      error: "Couldn't update this item — it may have been deleted or moved.",
    };
  }
  return { success: true };
}

/**
 * Fetch the verified public-state column directly from the resource row.
 * Single cheap query — safe to call from list-item components like ShareButton.
 *
 * The capability RPC names the actual physical enum/boolean column. Returns
 * `{ isPublic: false }` without a row query when the type does not support
 * public visibility; real capability/query failures remain errors.
 */
export async function getResourceVisibility(
  resourceType: ResourceType,
  resourceId: string,
): Promise<ResourceVisibility> {
  const entry = getShareableResource(resourceType);
  if (!entry) {
    throw new Error(
      `Unknown shareable resource token: ${resourceType}. Bare table names are not accepted.`,
    );
  }
  // A RESOURCE WHOSE TABLE NO CLIENT MAY READ ANSWERS THROUGH ITS DOOR.
  // `getShareCapabilities` discovers the PHYSICAL column that holds the public state, and for
  // the record store it finds one — `custom.record.visibility` really exists. But
  // `authenticated` holds no SELECT on `custom.record` (DOOR-N-1a, permanently), so the direct
  // read below was refused and the dialog rendered "We couldn't check this item's public
  // visibility" on every record. The store answers the same question through a door, from
  // `iam.content_lane` — which is where VIS-N-4's lanes actually live, so this is also the
  // answer the Access tab beside it gives, rather than a second one off a different column.
  if (entry.schemaName === "custom") {
    const { data, error } = await supabase.rpc("store_door_lane", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
    });
    if (error)
      throw operationFailed("check this item's public visibility", error);
    const row = (data ?? {}) as Record<string, unknown>;
    if (row.found !== true) {
      throw operationFailed(
        "check this item's public visibility",
        new Error("That record is not here any more."),
      );
    }
    const orgDefault = row.organization_default as
      { level?: unknown; organization_name?: unknown } | null | undefined;
    const organizationDefault =
      orgDefault && typeof orgDefault.level === "string"
        ? {
            level: orgDefault.level,
            organizationName:
              typeof orgDefault.organization_name === "string"
                ? orgDefault.organization_name
                : "this organization",
            ...(typeof (orgDefault as { organization_id?: unknown })
              .organization_id === "string"
              ? {
                  organizationId: (orgDefault as { organization_id: string })
                    .organization_id,
                }
              : {}),
          }
        : null;
    const laneWord = typeof row.lane === "string" ? row.lane : null;
    const choice: LaneChoice | null =
      laneWord === "mine" || laneWord === "organization"
        ? laneWord
        : laneWord === "world"
          ? "world"
          : null;
    const whoCanSee: WhoCanSee | null = choice
      ? {
          source: "store",
          choice,
          organizationId:
            typeof row.organization_id === "string"
              ? row.organization_id
              : null,
          organizationName:
            typeof row.organization_name === "string"
              ? row.organization_name
              : (organizationDefault?.organizationName ?? null),
          memberDefaultLevel:
            typeof row.member_default_level === "string"
              ? row.member_default_level
              : (organizationDefault?.level ?? null),
          membersReachNow: organizationDefault !== null,
          worldOffered: row.world_open === true || choice === "world",
        }
      : null;
    return {
      isPublic: row.is_public === true,
      visibility: row.is_public === true ? "public" : null,
      organizationDefault,
      whoCanSee,
      homeOrganizationId:
        typeof row.organization_id === "string" ? row.organization_id : null,
    };
  }

  const capabilities = await getShareCapabilities(resourceType);
  if (!capabilities.publicState) {
    return { isPublic: false, visibility: null };
  }

  const client = resolveDynamicClient(entry.schemaName);
  const columns = capabilities.organizationColumn
    ? `${capabilities.publicState.column},${capabilities.organizationColumn}`
    : capabilities.publicState.column;
  const { data, error } = await client
    .from(entry.tableName)
    .select(columns)
    .eq(entry.idColumn, resourceId)
    .maybeSingle<Record<string, boolean | string | null>>();

  if (error || !data) {
    throw operationFailed("check this item's public visibility", error);
  }
  const home = capabilities.organizationColumn
    ? data[capabilities.organizationColumn]
    : null;
  const homeOrganizationId = typeof home === "string" ? home : null;
  const value = data[capabilities.publicState.column];
  if (capabilities.publicState.kind === "enum") {
    const enumValue = isVisibilityValue(value) ? value : null;
    // WHO CAN SEE THIS for a kind whose REACH is its row's `visibility` enum (a site, a note):
    // personal is the owner and the people named, internal is every member of its organization.
    // A kind whose public state is `card_visibility` (an agent, a workflow) is NOT drawn: that
    // column says who sees the public card, not who may open the thing (measured 2026-09-25: 516
    // agents are internal with a public card), so a lane control on it would lie.
    const choice =
      capabilities.publicState.column === "visibility"
        ? laneOfVisibility(enumValue)
        : null;
    return {
      isPublic: value === "public",
      visibility: enumValue,
      homeOrganizationId,
      ...(choice
        ? {
            whoCanSee: {
              source: "visibility" as const,
              choice,
              organizationId: null,
              organizationName: null,
              memberDefaultLevel: null,
              membersReachNow: choice === "organization",
              // "Anyone with the link" is the world lane's own act (iam.publish_to_world), which
              // only the record store has; for these kinds "Anyone" lives on the Public tab.
              worldOffered: false,
            },
          }
        : {}),
    };
  }
  return { isPublic: value === true, visibility: null, homeOrganizationId };
}

const VISIBILITY_VALUES = ["personal", "internal", "link", "public"] as const;

function isVisibilityValue(value: unknown): value is VisibilityValue {
  return (
    typeof value === "string" &&
    (VISIBILITY_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Set a resource's canonical visibility — the three-state answer to "who can
 * reach this", as opposed to makePublic()'s two-state one.
 *
 * Enum-backed types ONLY. A legacy boolean type has no `internal` to move to,
 * so this refuses rather than silently mapping internal onto "not public" —
 * which would tell the user their team can see something when nobody can.
 *
 * Reuses the same setVisibilityColumn writer makePublic() uses; this is a third
 * caller of one path, never a second path.
 */
export async function setResourceVisibility(
  resourceType: ResourceType,
  resourceId: string,
  visibility: VisibilityValue,
): Promise<ShareActionResult> {
  try {
    const capabilities = await getShareCapabilities(resourceType);
    if (capabilities.publicState?.kind !== "enum") {
      return {
        success: false,
        error:
          "This item type only supports public or private — it has no organization-level visibility.",
      };
    }
    return await setVisibilityColumn(
      resourceType,
      resourceId,
      capabilities.publicState.column,
      visibility,
    );
  } catch (error: unknown) {
    console.error("setResourceVisibility error:", error);
    return {
      success: false,
      error: errMessage(error) || "Failed to update visibility",
    };
  }
}

// ============================================================================
// Share — all routes through SECURITY DEFINER RPCs
// ============================================================================

/**
 * Grant a user access to a resource.
 * RPC validates: authenticated, valid level, resource exists, caller is owner, no duplicate.
 */
export async function shareWithUser(
  options: ShareWithUserOptions,
): Promise<ShareActionResult> {
  try {
    const {
      resourceType,
      resourceId,
      userId,
      permissionLevel,
      resourceName,
      organizationId,
    } = options;

    const { data, error } = await supabase.rpc("share_resource_with_user", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_target_user_id: userId,
      // Narrowed at the write boundary: the code ladder is wider than the
      // database enum, so a level Postgres cannot store is refused here by
      // name with the remedy, not swallowed into an opaque enum error.
      p_permission_level: toDbPermissionLevel(permissionLevel),
    });

    if (error) throw error;
    const parsed = parseShareRpcResult(data);
    if (!parsed.success)
      return {
        success: false,
        error: parsed.error || "Failed to share with user",
      };

    // Fire-and-forget notifications — failure doesn't affect the grant.
    void getClaimsUser(supabase).then(({ data: { user } }) => {
      if (!user) return;
      const resourceLabel = getResourceTypeLabel(resourceType);

      // (1) Email (respects the recipient's preferences server-side).
      fetch("/api/sharing/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientUserId: userId,
          resourceType,
          resourceId,
        }),
      }).catch((err) => console.error("Sharing notification failed:", err));

      // (2) In-app DM with a clickable resource card. Lazy import keeps the
      // messaging service out of the permissions bundle.
      //
      // 🚨 THE DM IS FILED IN THE SHARED OBJECT'S ORGANIZATION (ACCESS-FIX-18, VERIFIER-18
      // H4). Unnamed, the messaging door fell back to the active organization and, with
      // none picked, raised the organization gate over the Share dialog — "Which workspace
      // is this for?" with 44 organizations, for a table that names its own — and the pick
      // closed the Share dialog with it. The share has already landed here; a notification
      // is never a reason to ask anything.
      const dmOrganizationId =
        organizationId ??
        // object-org-exempt: a share dialog opened with no object organization (a non-record resource) files its notification where the person works, and never prompts
        getActiveOrgId();
      if (!dmOrganizationId) {
        console.warn(
          "[sharing] The in-app message about this share was not sent: the dialog was opened " +
            "without the shared object's organization and none is picked. The share itself and " +
            "its email notification are unaffected. Remedy: pass organizationId to <ShareModal>.",
        );
        return;
      }
      import("@/features/messaging/service/sendDirectActionMessage")
        .then(({ sendDirectActionMessage }) =>
          sendDirectActionMessage({
            recipientId: userId,
            organizationId: dmOrganizationId,
            content: `${user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Someone"} shared a ${resourceLabel} with you`,
            actionData: {
              kind: "resource_shared",
              version: 1,
              payload: {
                resource_type: resourceType,
                resource_id: resourceId,
                resource_title: resourceName || resourceLabel,
                resource_label: resourceLabel,
                permission_level: permissionLevel,
                sharer_name:
                  user.user_metadata?.full_name ||
                  user.user_metadata?.name ||
                  user.email ||
                  "Someone",
              },
            },
          }),
        )
        .catch((err) => console.error("Sharing DM failed:", err));
    });

    return {
      success: true,
      message: parsed.message || "Successfully shared with user",
    };
  } catch (error: unknown) {
    console.error("shareWithUser error:", error);
    return {
      success: false,
      error: errMessage(error) || "Failed to share with user",
    };
  }
}

/**
 * Make a thing AVAILABLE to an organization, as organization configuration: an agent bound to
 * the organization's surface, or an item contributed to its library (with moderation). Everyone
 * in the organization, including people who join later, can use it.
 *
 * 🚨 THIS IS NOT SHARING (chair ruling 2026-09-25, owner ruling 2026-09-23 "access is personal").
 * A share names a person; the store refuses an organization at every share door with
 * "Shares name a person, not an organization." This door is the only writer of an organization
 * grantee, and the row it writes carries `granted_via = 'availability'`.
 * RPC validates: authenticated, resource exists, caller holds Admin on it, caller is a member of
 * the target organization, the organization's module config (members may add, needs approval).
 */
export async function grantOrgAvailability(
  options: OrgAvailabilityOptions,
): Promise<ShareActionResult> {
  try {
    const { resourceType, resourceId, organizationId, permissionLevel } =
      options;

    const { data, error } = await supabase.rpc("grant_org_availability", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_target_org_id: organizationId,
      // omit → server applies the org module's default_permission.
      p_permission_level: permissionLevel
        ? toDbPermissionLevel(permissionLevel)
        : permissionLevel,
    });

    if (error) throw error;
    const parsed = parseShareRpcResult(data);
    if (!parsed.success)
      return {
        success: false,
        error:
          parsed.error || "Could not make this available to the organization",
      };

    return {
      success: true,
      message: parsed.message || "Available to everyone in the organization",
    };
  } catch (error: unknown) {
    console.error("grantOrgAvailability error:", error);
    return {
      success: false,
      error:
        errMessage(error) ||
        "Could not make this available to the organization",
    };
  }
}

/**
 * Ensure an organization has the requested availability row.
 *
 * The availability door reports an existing row instead of inserting a duplicate. Composition
 * workflows (surface binding) need idempotent "ensure" semantics, so the translation of that
 * answer lives here instead of in each caller.
 */
export async function ensureOrgAvailability(
  options: OrgAvailabilityOptions,
): Promise<ShareActionResult> {
  const result = await grantOrgAvailability(options);
  if (!result.success && result.error === "Organization already has access") {
    return {
      success: true,
      message: "Organization already has access",
    };
  }
  return result;
}

/**
 * Make a resource readable by unauthenticated users.
 * Sets is_public = true on the resource row. RPC validates ownership.
 * The permissions table is NOT written to — is_public on the resource row is the source of truth.
 */
export async function makePublic(
  options: MakePublicOptions,
): Promise<ShareActionResult> {
  try {
    const { resourceType, resourceId } = options;
    const capabilities = await getShareCapabilities(resourceType);

    if (!capabilities.publicState) {
      return {
        success: false,
        error: "Public visibility is not available for this item type.",
      };
    }

    // Enum resources write the exact capability-reported column directly.
    // The boolean RPC only handles a verified legacy boolean public flag.
    if (capabilities.publicState.kind === "enum") {
      const res = await setVisibilityColumn(
        resourceType,
        resourceId,
        capabilities.publicState.column,
        "public",
      );
      if (!res.success) {
        return { success: false, error: res.error || "Failed to make public" };
      }
      return { success: true, message: "Resource is now public" };
    }

    const { data, error } = await supabase.rpc("make_resource_public", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
    });

    if (error) throw error;
    const parsed = parseShareRpcResult(data);
    if (!parsed.success)
      return { success: false, error: parsed.error || "Failed to make public" };

    return { success: true, message: "Resource is now public" };
  } catch (error: unknown) {
    console.error("makePublic error:", error);
    return {
      success: false,
      error: errMessage(error) || "Failed to make public",
    };
  }
}

/**
 * Restrict a resource to explicit grants only.
 * Sets is_public = false on the resource row. RPC validates ownership.
 */
export async function makePrivate(
  resourceType: ResourceType,
  resourceId: string,
): Promise<ShareActionResult> {
  try {
    const capabilities = await getShareCapabilities(resourceType);
    if (!capabilities.publicState) {
      return {
        success: false,
        error: "Public visibility is not available for this item type.",
      };
    }

    if (capabilities.publicState.kind === "enum") {
      const res = await setVisibilityColumn(
        resourceType,
        resourceId,
        capabilities.publicState.column,
        "personal",
      );
      if (!res.success) {
        return {
          success: false,
          error: res.error || "Failed to make personal",
        };
      }
      return { success: true, message: "Resource is now personal" };
    }

    const { data, error } = await supabase.rpc("make_resource_private", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
    });

    if (error) throw error;
    const parsed = parseShareRpcResult(data);
    if (!parsed.success)
      return {
        success: false,
        error: parsed.error || "Failed to make private",
      };

    return { success: true, message: "Resource is now private" };
  } catch (error: unknown) {
    console.error("makePrivate error:", error);
    return {
      success: false,
      error: errMessage(error) || "Failed to make private",
    };
  }
}

// ============================================================================
// Revoke — all routes through SECURITY DEFINER RPCs
// ============================================================================

/**
 * Remove a user's explicit access grant.
 * RPC validates ownership before deleting.
 */
export async function revokeUserAccess(
  resourceType: ResourceType,
  resourceId: string,
  userId: string,
): Promise<ShareActionResult> {
  try {
    const { data, error } = await supabase.rpc("revoke_resource_access", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_target_user_id: userId,
    });

    if (error) throw error;
    const parsed = parseShareRpcResult(data);
    if (!parsed.success)
      return {
        success: false,
        error: parsed.error || "Failed to revoke access",
      };

    return { success: true, message: "Access revoked" };
  } catch (error: unknown) {
    console.error("revokeUserAccess error:", error);
    return {
      success: false,
      error: errMessage(error) || "Failed to revoke user access",
    };
  }
}

/**
 * Remove an organization's explicit access grant.
 * RPC validates ownership before deleting.
 */
export async function revokeOrgAccess(
  resourceType: ResourceType,
  resourceId: string,
  organizationId: string,
): Promise<ShareActionResult> {
  try {
    const { data, error } = await supabase.rpc("revoke_resource_org_access", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_target_org_id: organizationId,
    });

    if (error) throw error;
    const parsed = parseShareRpcResult(data);
    if (!parsed.success)
      return {
        success: false,
        error: parsed.error || "Failed to revoke org access",
      };

    return { success: true, message: "Organization access revoked" };
  } catch (error: unknown) {
    console.error("revokeOrgAccess error:", error);
    return {
      success: false,
      error: errMessage(error) || "Failed to revoke org access",
    };
  }
}

/**
 * Remove public access — alias for makePrivate.
 */
export async function revokePublicAccess(
  resourceType: ResourceType,
  resourceId: string,
): Promise<ShareActionResult> {
  return makePrivate(resourceType, resourceId);
}

/**
 * Generic dispatcher — routes to the correct revoke function.
 */
export async function revokeAccess(
  options: RevokeAccessOptions,
): Promise<ShareActionResult> {
  const { resourceType, resourceId, userId, organizationId, isPublic } =
    options;

  if (userId) return revokeUserAccess(resourceType, resourceId, userId);
  if (organizationId)
    return revokeOrgAccess(resourceType, resourceId, organizationId);
  if (isPublic) return revokePublicAccess(resourceType, resourceId);

  return {
    success: false,
    error: "Must specify userId, organizationId, or isPublic",
  };
}

// ============================================================================
// Update — routes through SECURITY DEFINER RPC
// ============================================================================

/**
 * Change the permission level for an existing user or org grant.
 * RPC validates ownership before updating.
 */
export async function updatePermissionLevel(
  options: UpdatePermissionOptions,
): Promise<ShareActionResult> {
  try {
    const { resourceType, resourceId, userId, organizationId, newLevel } =
      options;

    if (!userId && !organizationId) {
      return { success: false, error: "Must specify userId or organizationId" };
    }

    const { data, error } = await supabase.rpc("update_permission_level", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_target_user_id: userId,
      p_target_org_id: organizationId,
      p_new_level: newLevel,
    });

    if (error) throw error;
    const parsed = parseShareRpcResult(data);
    if (!parsed.success)
      return {
        success: false,
        error: parsed.error || "Failed to update permission level",
      };

    return {
      success: true,
      message: parsed.message || "Permission level updated",
    };
  } catch (error: unknown) {
    console.error("updatePermissionLevel error:", error);
    return {
      success: false,
      error: errMessage(error) || "Failed to update permission level",
    };
  }
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * List all grants for a resource (owner-only).
 * Uses get_resource_permissions() SECURITY DEFINER RPC — includes resolved
 * user/org display names. Returns empty for non-owners (RPC silently returns nothing).
 *
 * NOTE: Does not include is_public state — use getResourceVisibility() for that.
 */
export async function listPermissions(
  resourceType: ResourceType,
  resourceId: string,
): Promise<PermissionWithDetails[]> {
  try {
    const { data, error } = await supabase.rpc("get_resource_permissions", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
    });

    if (error) throw error;

    return (data || []).map(transformPermissionFromRpcRow);
  } catch (error: unknown) {
    console.error("listPermissions error:", error);
    return [];
  }
}

/** Alias kept for compatibility */
export const getResourcePermissions = listPermissions;

/**
 * Check if the current user is the owner of a resource.
 * Reads owner_column directly from the resource row — single index scan, no
 * RPC round-trip required.
 *
 * Uses the registry to find the canonical table name, id column, and owner
 * column so tables like flashcard_sets (set_id, not id) work correctly the
 * day they're added to the registry — without a code change here.
 */
export interface OwnershipResolution {
  /** True only when the ownership read SUCCEEDED and the caller owns the row. */
  isOwner: boolean;
  /**
   * Non-null when ownership could NOT be determined (unknown resource type,
   * failed read, no session). `isOwner: false` with a non-null `error` means
   * "unknown", never "not the owner" — UIs must not present it as a denial.
   */
  error: string | null;
}

/**
 * Resolve whether the current user owns a resource, distinguishing
 * "not the owner" from "could not determine".
 *
 * LOUD RECOVERY: every failure path returns a message instead of a bare
 * `false`. A silent `false` here is what renders the canonical ShareModal as a
 * dead, empty dialog for a user who actually owns the row — the whole class of
 * bug this function exists to make impossible.
 *
 * Reads owner_column directly from the resource row — single index scan, no
 * RPC round-trip required. Uses the registry to find the canonical table name,
 * id column, and owner column so tables like flashcard_sets (set_id, not id)
 * work correctly the day they're added to the registry.
 */
export async function resolveResourceOwnership(
  resourceType: ResourceType,
  resourceId: string,
): Promise<OwnershipResolution> {
  if (!resourceType || !resourceId) {
    return {
      isOwner: false,
      error: "Missing resource type or id — cannot resolve ownership.",
    };
  }

  try {
    const entry = getShareableResource(resourceType);
    if (!entry) {
      return {
        isOwner: false,
        error: `Unknown shareable resource type "${resourceType}". Register it in shareable_resource_registry.`,
      };
    }

    // The registry is authoritative for the owner column (canonical tables use
    // `created_by`; file satellites `owner_id`; udt/legacy `user_id`). Read it
    // directly — no per-type override.
    const ownerColumn = entry.ownerColumn;

    // `tableName` is the physical table; `schemaName` its (non-public) schema.
    const tableName = entry.tableName;
    const client = resolveDynamicClient(entry.schemaName);
    const [
      { data: row, error: rowError },
      {
        data: { user },
        error: userError,
      },
    ] = await Promise.all([
      client
        .from(tableName)
        .select(ownerColumn)
        .eq(entry.idColumn, resourceId)
        .maybeSingle<Record<string, string | null>>(),
      getClaimsUser(supabase),
    ]);

    if (rowError) {
      const message = errMessage(rowError);
      console.error(
        `[permissions] Ownership read failed for ${resourceType}:${resourceId} ` +
          `(${entry.schemaName ?? "public"}.${tableName}.${ownerColumn}): ${message}`,
      );
      return {
        isOwner: false,
        error: `Could not read ${entry.displayLabel}: ${message}`,
      };
    }

    if (userError || !user) {
      return {
        isOwner: false,
        error: "No signed-in user — cannot resolve ownership.",
      };
    }

    if (!row) {
      return {
        isOwner: false,
        error: `${entry.displayLabel} not found, or you do not have access to it.`,
      };
    }

    return { isOwner: row[ownerColumn] === user.id, error: null };
  } catch (error) {
    const message = errMessage(error);
    console.error(
      `[permissions] Ownership check threw for ${resourceType}:${resourceId}: ${message}`,
    );
    return { isOwner: false, error: message };
  }
}

/**
 * "MAY I DECIDE WHO ELSE SEES THIS?" — the question a share dialog actually has.
 *
 * `resolveResourceOwnership` above answers a NARROWER one: am I the row's
 * `created_by`. VIS-17's one ladder says `admin` on a thing means "can change it
 * and decide who else may", so gating the dialog on ownership made `admin` a
 * level that could not do the one thing its own definition names — and for the
 * record store it could not even be ASKED, because `custom.record` carries no
 * client SELECT grant and the direct read above returns "Could not read Record".
 *
 * So this asks the database's own predicate (`public.may_manage_sharing`, lane
 * SHARE 2026-09-19), which is the same one the six sharing RPCs enforce. The
 * screen and the door cannot disagree, because there is one answer.
 *
 * A failure is reported as "could not determine", never as a denial — the
 * distinction the dialog needs to tell a stranger from a broken read.
 */
export async function resolveSharingAuthority(
  resourceType: ResourceType,
  resourceId: string,
): Promise<OwnershipResolution> {
  if (!resourceType || !resourceId) {
    return {
      isOwner: false,
      error: "Missing resource type or id — cannot resolve who may share this.",
    };
  }
  try {
    const { data, error } = await supabase.rpc("may_manage_sharing", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
    });
    if (error) throw error;
    return { isOwner: data === true, error: null };
  } catch (error: unknown) {
    const message = errMessage(error);
    console.error(
      `[permissions] may_manage_sharing failed for ${resourceType}:${resourceId}: ${message}`,
    );
    return { isOwner: false, error: message };
  }
}

/**
 * Boolean convenience wrapper over {@link resolveResourceOwnership}.
 *
 * Prefer `resolveResourceOwnership` anywhere the difference between "not the
 * owner" and "could not determine" changes what the user sees.
 */
export async function isResourceOwner(
  resourceType: ResourceType,
  resourceId: string,
): Promise<boolean> {
  const { isOwner } = await resolveResourceOwnership(resourceType, resourceId);
  return isOwner;
}

/**
 * Get all resources explicitly shared with the current user.
 * Reads from the permissions table — reflects direct grants only,
 * not hierarchy-inherited access (project/workspace/org membership).
 */
export async function getSharedWithMe(
  resourceType?: ResourceType,
): Promise<Permission[]> {
  try {
    const {
      data: { user },
      error: userError,
    } = await getClaimsUser(supabase);
    if (userError || !user) return [];

    let query = supabase
      .schema("iam")
      .from("permissions")
      .select("*")
      .eq("granted_to_user_id", user.id);

    if (resourceType) query = query.eq("resource_type", resourceType);

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });
    if (error) throw error;

    return (data || []).map(transformPermissionFromTableRow);
  } catch (error) {
    console.error("getSharedWithMe error:", error);
    return [];
  }
}

/**
 * Check if current user has a specific permission level on a resource.
 * Used for client-side gating — not a substitute for RLS.
 */
export async function checkPermission(
  options: CheckPermissionOptions,
): Promise<PermissionCheckResult> {
  try {
    const { resourceType, resourceId, requiredLevel = "viewer" } = options;

    const {
      data: { user },
      error: userError,
    } = await getClaimsUser(supabase);
    if (userError || !user)
      return { hasAccess: false, isOwner: false, reason: "Not authenticated" };

    const permissions = await listPermissions(resourceType, resourceId);

    const userPermission = permissions.find(
      (p) => p.grantedToUserId === user.id,
    );
    if (userPermission) {
      const hasAccess = satisfiesPermissionLevel(
        userPermission.permissionLevel,
        requiredLevel,
      );
      return {
        hasAccess,
        level: userPermission.permissionLevel,
        isOwner: false,
        reason: hasAccess
          ? "Direct user permission"
          : "Insufficient permission level",
      };
    }

    return {
      hasAccess: false,
      isOwner: false,
      reason: "No direct permission found",
    };
  } catch (error) {
    console.error("checkPermission error:", error);
    return {
      hasAccess: false,
      isOwner: false,
      reason: "Error checking permission",
    };
  }
}

/**
 * Batch grant access to multiple users in parallel.
 */
export async function batchShareWithUsers(
  resourceType: ResourceType,
  resourceId: string,
  userIds: string[],
  permissionLevel: PermissionLevel,
): Promise<ShareActionResult[]> {
  return Promise.all(
    userIds.map((userId) =>
      shareWithUser({ resourceType, resourceId, userId, permissionLevel }),
    ),
  );
}

// ============================================================================
// Internal Helpers
// ============================================================================

function parseNestedUser(
  j: Json,
): PermissionWithDetails["grantedToUser"] | undefined {
  if (
    j === null ||
    j === undefined ||
    typeof j !== "object" ||
    Array.isArray(j)
  )
    return undefined;
  const o = j as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.email !== "string") return undefined;
  return {
    id: o.id,
    email: o.email,
    displayName: typeof o.displayName === "string" ? o.displayName : undefined,
    avatarUrl: typeof o.avatarUrl === "string" ? o.avatarUrl : undefined,
  };
}

function parseNestedOrg(
  j: Json,
): PermissionWithDetails["grantedToOrganization"] | undefined {
  if (
    j === null ||
    j === undefined ||
    typeof j !== "object" ||
    Array.isArray(j)
  )
    return undefined;
  const o = j as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    typeof o.name !== "string" ||
    typeof o.slug !== "string"
  )
    return undefined;
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    logoUrl: typeof o.logoUrl === "string" ? o.logoUrl : undefined,
  };
}

function transformPermissionFromRpcRow(
  row: RpcPermissionRow,
): PermissionWithDetails {
  return {
    id: row.id,
    resourceType: row.resource_type as ResourceType,
    resourceId: row.resource_id,
    grantedToUserId: row.granted_to_user_id || undefined,
    grantedToOrganizationId: row.granted_to_organization_id || undefined,
    isPublic: row.is_public,
    permissionLevel: row.permission_level as PermissionLevel,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
    createdBy: undefined,
    grantedToUser: parseNestedUser(row.granted_to_user),
    grantedToOrganization: parseNestedOrg(row.granted_to_organization),
  };
}

function transformPermissionFromTableRow(row: PermissionsTableRow): Permission {
  return {
    id: row.id,
    resourceType: row.resource_type as ResourceType,
    resourceId: row.resource_id,
    grantedToUserId: row.granted_to_user_id,
    grantedToOrganizationId: row.granted_to_organization_id,
    isPublic: row.is_public ?? undefined,
    permissionLevel: row.permission_level as PermissionLevel,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
    createdBy: row.created_by ?? undefined,
  };
}

// Legacy getTableName() removed — the registry (utils/permissions/registry.ts)
// is the single source of truth. Use getShareableResource() / resolveTableName()
// from './registry' if you need the canonical table name on the client.
