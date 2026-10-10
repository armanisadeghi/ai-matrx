// features/scopes/service/scopesService.ts
//
// THE SOLE CHOKEPOINT for the scope system from frontend code.
//
// ONE READ PATH: THE RECORD STORE (lane 9 SCOPES-ON-THE-STORE, the flip, 2026-10-03; Arman's ruling
// "burn the boats"). Every read below goes through the record store's `custom.context_*` doors via
// `scopeDoors()` (`@ai-matrx/records/scopes`), in the package's shapes. A scope type is a
// custom Table (`kept_for = context`), a scope a Record, a context item a Field, a value the Record's
// document under the item's key. The old `context.*` read path and its switch
// (`custom.scope_readers_read_the_store`) are gone; `pnpm check:old-system-unreachable` keeps them gone.
//
// SCOPE ASSIGNMENTS MOVED OFF ctx_scope_assignments → platform.associations
// (DB changeover, data fully copied). A scope tag is the unified edge
//     source = (entityType, entityId)   →   target = ('scope', scopeId)
// reached ONLY through the assoc_* RPCs, whose sole chokepoint is
// `associationsService`. This file therefore no longer touches
// ctx_scope_assignments at all — every assignment read/write below delegates
// to `associationsService`. (See docs/db_rebuild/db-canonical-access-model.md.)
//
// Bulk source→scope reads use the batch `assoc_for_sources` RPC (one
// round-trip for N entities, target-filtered to 'scope' in the DB) — see
// `bulkEntityScopeIds`. Reverse (scope→members) reads use `assoc_for_targets`.
//
// Spec of record: /Users/armanisadeghi/code/common-docs/systems/data/scopes-context/STATE.md — when the Python team ships
// the proposed RPC family (get_user_scope_tree_with_projects, resolve_*,
// apply_template, etc.), the implementation of each method below swaps to
// a single supabase.rpc(...) call. Method signatures and return shapes
// stay constant — that's the whole point of the chokepoint.
//
// Mutation methods that have no safe path return a structured `internal`
// error until the corresponding door ships.

"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { readInChunks } from "@/features/scopes/service/inChunks";
import { readScopeFileText, scopeDoors, scopeRecordsClient } from "@/features/scopes/service/scopeDoors";
import { placeTableInRecordStore } from "@/features/data-tables/data-source/table-home";
import { requireUserId } from "@/utils/auth/getUserId";
import { browserAdminLaneOpen } from "@/utils/supabase/adminLane";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import { associationsService } from "@/features/scopes/service/associationsService";
import { membershipsService } from "@/features/organizations/service/membershipsService";
import { forgetMemberOrganizationRows, readMemberOrganizationRows } from "@/features/organizations/service/memberOrganizationRows";
import {
  err,
  mapPgError,
  mapPgErrorPair,
  ok,
} from "@/features/scopes/service/rpcResult";
import type {
  OrgNode,
  ProjectNode,
  ResolvedSuggestionItem,
  ResolvedSuggestionTarget,
  EntityType,
  ScopeTreeResponse,
  TaskBucketLevel,
  TaskNode,
} from "@/features/scopes/types";
import type { RecordsError, RecordsResult } from "@ai-matrx/records";
import type {
  ArchivedScopeType,
  ContextField,
  ContextValue,
  Scope,
  ScopeTypeWithScopes,
  ScopeWithType,
  SystemContextItem,
} from "@ai-matrx/records/scopes";
import type { AssociationsRpcError } from "@ai-matrx/associations";
import type { EntityTypeToken } from "@ai-matrx/associations";

type PostgrestErrorLike = { message: string; code?: string; details?: string; hint?: string };



// One denormalized scope row for tags: which entity, which scope, plus the
// scope's name and its type's singular label (sidebar grouping).
export interface EntityScopeTag {
  entity_id: string;
  scope_id: string;
  scope_name: string;
  scope_type: string;
}

export interface TableTemplateField {
  id: string;
  field_name: string;
  display_name: string;
  data_type: string;
  field_order: number;
  is_required: boolean;
}

export interface TableTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  version: number;
  fields: TableTemplateField[];
}

// ─── helpers ────────────────────────────────────────────────────────
//
// These lived here as private copies that `rpcResult.ts` was extracted FROM,
// with a standing "the two MUST stay byte-identical" note — a promise a comment
// cannot keep. They diverged the first time one side was fixed (transport
// failures logging as errors, 2026-08-11), so the fork is now deleted: this file
// consumes the one implementation like every other scopes chokepoint.

/**
 * A moved organization's table for (context item, scope), in the record store, through the
 * store's own door `custom.scope_table_provision` (GRID-PRIMITIVES G11, amended in matrx-frontend
 * 7a35711947): it answers a scope provisioned BEFORE the move with its already-moved Table, makes
 * one otherwise, and picks the organization's Home itself. The id comes back placed.
 */
/** How long one boot's organizations-and-projects read is shared after it lands (lane PAGE-BUNDLE-2). */
const SHARED_BOOT_READ_MS = 5_000;
let sharedBoot: { userId: string; at: number; read: Promise<unknown> } | null = null;

/** Share one read of the caller's organizations and projects between the boot's tree reads. */
function sharedScopeBootRead<T>(read: () => Promise<T>): Promise<T> {
  const userId = requireUserId();
  const held = sharedBoot;
  if (held && held.userId === userId && (held.at === 0 || Date.now() - held.at < SHARED_BOOT_READ_MS)) {
    return held.read as Promise<T>;
  }
  const entry: { userId: string; at: number; read: Promise<unknown> } = { userId, at: 0, read: Promise.resolve() };
  const promise = read().then(
    (value) => {
      // A failed read is never shared past its own flight.
      if (value && typeof value === "object" && (value as { read?: unknown }).read === false) {
        if (sharedBoot === entry) sharedBoot = null;
      } else entry.at = Date.now();
      return value;
    },
    (thrown: unknown) => {
      if (sharedBoot === entry) sharedBoot = null;
      throw thrown;
    },
  );
  entry.read = promise;
  sharedBoot = entry;
  return promise;
}

/** A refresh, or a write that changed her organizations or projects: the next tree read asks again. */
export function forgetSharedScopeBootRead(): void {
  sharedBoot = null;
  forgetMemberOrganizationRows();
}

async function provisionScopeTableInTheStore(
  organizationId: string,
  userId: string,
  contextItemId: string,
  scopeId: string,
): Promise<RecordsResult<string>> {
  const made = await scopeRecordsClient().scopeTableProvision({ item_id: contextItemId, scope_id: scopeId });
  if (!made.ok) return made;
  placeTableInRecordStore(made.data, { organizationId, userId });
  return made;
}

/** An associations answer's refusal in the records vocabulary (one error vocabulary on the web). */
function fromAssociations(e: AssociationsRpcError): RecordsError {
  const code: RecordsError["code"] =
    e.code === "not_found" || e.code === "invalid_argument"
      ? e.code
      : e.code === "unauthorized" || e.code === "forbidden_org" || e.code === "forbidden_role"
        ? "door"
        : e.code === "demanded_schema_violation"
          ? "door_absent"
          : e.code === "version_conflict"
            ? "stale_write"
            : "internal";
  return { code, message: e.message, hint: e.hint, detail: e.detail };
}

export const scopesService = {
  /** Organization-scoped immutable schemas available for per-scope table values. */
  async listTableTemplates(
    organizationId: string,
  ): Promise<RecordsResult<TableTemplate[]>> {
    try {
      requireUserId();
      // Table templates are templates (custom.template, templateKind table) since 2026-10-07.
      const { data, error } = await supabase.schema("custom").rpc("table_templates" as never, {
        p_org_id: organizationId,
      } as never);
      if (error) return err(...mapPgErrorPair(error));
      return ok((Array.isArray(data) ? data : []) as TableTemplate[]);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /**
   * THIS SCOPE'S COPY OF A TEMPLATE-BACKED TABLE — the table id, creating it on first ask, in the
   * record store (`custom.scope_table_provision`, GRID-PRIMITIVES G11), which is idempotent and
   * records the scope's context value as a table reference so the agent receives the table.
   */
  async provisionScopeDataset(
    contextItemId: string,
    scopeId: string,
  ): Promise<RecordsResult<{ datasetId: string }>> {
    try {
      const userId = requireUserId();

      // The scope table lives in the record store; the store's own door (`custom.scope_table_provision`)
      // answers it in the scope's own organization. The id comes back PLACED, so the caller's next read
      // or write (the list-change engine's `getCompleteTable` / `bulkWrite`) reaches it.
      // Where the scope lives: from the scope itself, through the store's door.
      const scopeRes = await scopeDoors().scopes([scopeId]);
      if (!scopeRes.ok) return scopeRes;
      const organizationId: string | undefined = scopeRes.data[0]?.organization_id;
      if (!organizationId) {
        return err("not_found", "That scope could not be read, so no table was provisioned for it.");
      }
      const provisioned = await provisionScopeTableInTheStore(organizationId, userId, contextItemId, scopeId);
      if (!provisioned.ok) return provisioned;
      return ok({ datasetId: provisioned.data });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },
  // ──────────────────────────────────────────────────────────────────
  //  READ — TREE
  // ──────────────────────────────────────────────────────────────────

  /**
   * The boot fetch. One round-trip equivalent in the future RPC. For now,
   * three parallel queries: orgs+role, scope_types+scopes, projects.
   *
   * Projects are grouped by their real organization_id, including the user's
   * personal organization. Unscoped project rows are invalid under the current
   * tenancy contract.
   */
  async getScopeTree(
    opts: { shape?: "whole" | "skeleton" } = {},
  ): Promise<RecordsResult<ScopeTreeResponse>> {
    // SKELETON (lane SCOPES-TREE-PAGED): the same organizations and projects, and the scope types
    // WITHOUT their scopes (`scopes: []`) — the first paint. The scopes come per type
    // (`readTypeScopesPage`) or with the whole tree later.
    const skeleton = opts.shape === "skeleton";
    try {
      requireUserId();

      // The current user's org memberships via the canonical membership RPC
      // (iam.memberships); org identity is resolved from the public
      // organizations table below (no cross-schema embed).
      // ONE READ OF HER ORGANIZATIONS AND PROJECTS PER BOOT (lane PAGE-BUNDLE-2): the skeleton and the
      // whole tree both start here, a moment apart, and each read the same organizations and projects
      // (2 × chunks × 2 tables per page load). They now share one read while it is in flight and for
      // SHARED_BOOT_READ_MS after; a `refresh` asks again (`forgetSharedScopeBootRead`).
      const boot = await sharedScopeBootRead(async () => {
        // Her memberships and organization rows: the ONE shared read (`memberOrganizationRows.ts`).
        const member = await readMemberOrganizationRows();
        if (!member.ok) {
          return { read: false as const, failed: err(...mapPgErrorPair(member.error)) };
        }
        const roleByOrgId = member.roleByOrgId;
        const orgIds = [...roleByOrgId.keys()];
        type OrgRow = {
          id: string;
          name: string;
          abbreviation: string;
          logo_url: string | null;
          slug: string;
          settings: unknown;
          created_by: string | null;
          archived_at: string | null;
        };
        const orgsP = Promise.resolve({ data: member.rows as unknown as OrgRow[], error: null as PostgrestErrorLike | null });

        // VIEW LAW: org-scoped — restricted to orgIds (see orgsP above).
        const projectsP = readInChunks(orgIds, (chunk) =>
          projectsDb(supabase)
            .from("projects")
            .select("id, organization_id, name, slug")
            .in("organization_id", chunk)
            .is("deleted_at", null) as unknown as PromiseLike<{
            data: Array<{ id: string; organization_id: string; name: string; slug: string }> | null;
            error: PostgrestErrorLike | null;
          }>,
        ).then((res) => ({
          ...res,
          data: res.data ? [...res.data].sort((a, b) => a.name.localeCompare(b.name)) : res.data,
        }));

        const [orgsRes, projectsRes] = await Promise.all([orgsP, projectsP]);
        if (orgsRes.error) return { read: false as const, failed: err(...mapPgErrorPair(orgsRes.error)) };
        if (projectsRes.error) return { read: false as const, failed: err(...mapPgErrorPair(projectsRes.error)) };
        return { read: true as const, roleByOrgId, orgsRes, projectsRes };
      });
      if (!boot.read) return boot.failed;
      const { roleByOrgId, orgsRes, projectsRes } = boot;

      // THE SCOPE TYPES AND SCOPES, FROM THE STORE (lane SCOPES-READS-WEB): one call of
      // `custom.context_tree` for the LIVE organizations of the caller's memberships — the door
      // decides each one it is named and refuses an organization the caller cannot reach, so an
      // archived organization (closed, never a place to work) is not named. The door answers the
      // live working set only (the F6 rule: a removed type or scope never reaches a picker) and
      // every scope, however many (no 1000-row page cap: one answer, not a paged table read).
      const liveOrgIds = (orgsRes.data ?? [])
        .filter((row) => !("archived_at" in row) || !row.archived_at)
        .map((row) => row.id);
      // Beside it, in parallel: the project → scope edges of these projects (see below).
      const projectIds = (projectsRes.data ?? []).map((p) => p.id);
      const [treeRes, projectScopesRes] = await Promise.all([
        skeleton
          ? scopeDoors().types(liveOrgIds).then((r): RecordsResult<ScopeTypeWithScopes[]> =>
              r.ok ? ok(r.data.types.map((t) => ({ ...t, scopes: [] }))) : r,
            )
          : scopeDoors().tree(liveOrgIds),
        bulkEntityScopeIds("project", projectIds),
      ]);
      if (!treeRes.ok) return treeRes;
      const treeTypes: ScopeTypeWithScopes[] = treeRes.data;

      // Per-project scope_id list, read from the SOURCE side: the project →
      // scope edges of these projects, and nothing else.
      //
      // NEVER from the target side (2026-09-27, rpc/assoc_for_targets 500 =
      // Postgres 57014 statement timeout on every right-click menu mount):
      // `assoc_for_targets('scope', <every scope>)` returned every edge INTO
      // every scope from every source type (transcripts, agents, workflows …),
      // row-checked each one, paged the whole set-returning function twice,
      // and kept only the project edges — 3–4 s per page against an 8 s limit,
      // for zero project edges (the project-tagged scopes sat past the 1000-row
      // cap). The source-side read answers the same question from the ~30
      // projects in ~60 ms. Guard: scope-tree-reads-project-tags-from-the-source-side.test.ts.
      if (!projectScopesRes.ok) return projectScopesRes;
      const projectScopes = new Map<string, string[]>(
        Object.entries(projectScopesRes.data),
      );

      // Group scope_types and projects per org.
      const scopeTypesByOrg = new Map<string, ScopeTypeWithScopes[]>();
      for (const node of treeTypes) {
        const list = scopeTypesByOrg.get(node.organization_id) ?? [];
        list.push(node);
        scopeTypesByOrg.set(node.organization_id, list);
      }

      const projectsByOrg = new Map<string, ProjectNode[]>();
      for (const p of projectsRes.data ?? []) {
        if (!p.organization_id) continue;
        const list = projectsByOrg.get(p.organization_id) ?? [];
        list.push({
          id: p.id,
          organization_id: p.organization_id,
          name: p.name,
          slug: p.slug,
          scope_ids: projectScopes.get(p.id) ?? [],
        });
        projectsByOrg.set(p.organization_id, list);
      }

      const viewerId = requireUserId();
      const organizations: OrgNode[] = (orgsRes.data ?? [])
        // An archived organization is closed. It must not be offered as a
        // place to work; it is reached through the organizations page's
        // archive disclosure and restored there.
        .filter((row) => !("archived_at" in row) || !row.archived_at)
        .map((row) => ({
          id: row.id,
          name: row.name,
          abbreviation: row.abbreviation,
          logo_url: row.logo_url ?? null,
          slug: row.slug,
          // The stored classification, never a guess from the name.
          is_test_fixture:
            !!row.settings &&
            typeof row.settings === "object" &&
            "test_fixture" in (row.settings as Record<string, unknown>),
          created_by: row.created_by ?? null,
          is_own: !!row.created_by && row.created_by === viewerId,
          role: (roleByOrgId.get(row.id) ?? "member") as OrgNode["role"],
          scope_types: scopeTypesByOrg.get(row.id) ?? [],
          projects: projectsByOrg.get(row.id) ?? [],
        }));

      // Stable ordering: personal first, then alpha.
      organizations.sort((a, b) => {
        return a.name.localeCompare(b.name);
      });

      return ok({
        organizations,
        fetched_at: new Date().toISOString(),
      });
    } catch (e) {
      const mapped = mapPgError(e);
      return { ok: false, error: mapped };
    }
  },

  /**
   * THE ADMIN LANE arm of the tree loader (`ensureScopeTree({
   * adminOrganizationId })`). One organization's tree — its live scope types,
   * scopes and projects — for the platform-admin scope console under
   * `/administration/**`, where the admin is usually NOT a member. The reads
   * are the same direct RLS reads as `getScopeTree`, filtered by the ONE
   * requested organization instead of the person's memberships; the database's
   * platform-admin arm (`is_platform_admin()`, true only on a request carrying
   * the admin-lane header the browser client stamps on `/administration/**`)
   * is what lets them see a non-member organization. Refused outright off the
   * admin section: a user page never loads another organization's tree.
   */
  async getOrganizationTreeForAdmin(
    organizationId: string,
  ): Promise<RecordsResult<{ organization: OrgNode | null }>> {
    try {
      requireUserId();
      if (!browserAdminLaneOpen()) {
        return err(
          "door",
          "This organization's scopes open from Administration only.",
        );
      }
      const orgP = supabase
        .schema("iam")
        .from("organizations")
        .select("id, name, abbreviation, slug, settings, created_by, archived_at")
        .eq("id", organizationId)
        .maybeSingle();
      // VIEW LAW: org-scoped — the ONE organization the admin console names. The
      // store's tree door decides: its admin-lane arm (public.is_platform_admin(),
      // true only on a request carrying the admin-lane header) reads a non-member
      // organization for the console, exactly as the old tables' platform-admin
      // policies did (lane SCOPES-READS-WEB).
      const [orgRes, treeRes] = await Promise.all([
        orgP,
        scopeDoors().tree([organizationId]),
      ]);
      if (orgRes.error) return err(...mapPgErrorPair(orgRes.error));
      if (!treeRes.ok) return treeRes;
      const row = orgRes.data;
      if (!row) return ok({ organization: null });

      const viewerId = requireUserId();
      const organization: OrgNode = {
        id: row.id,
        name: row.name,
        abbreviation: row.abbreviation,
        slug: row.slug,
        is_test_fixture:
          !!row.settings &&
          typeof row.settings === "object" &&
          "test_fixture" in (row.settings as Record<string, unknown>),
        created_by: row.created_by ?? null,
        is_own: !!row.created_by && row.created_by === viewerId,
        // The console acts with the platform-admin arm, not a membership role.
        role: "admin",
        admin_lane: true,
        scope_types: treeRes.data,
        // The scope console does not show projects; an admin-lane org carries none.
        projects: [],
      };
      return ok({ organization });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /**
   * The full workspace hierarchy (`get_user_full_context`: organizations,
   * projects, tasks, scope tags) for `agent-context/redux/hierarchyThunks`.
   * It reads the scope system inside its body (the record store, since the
   * flip), so it is reached only through this door. Returns the raw PostgREST answer because the caller owns an
   * abort-on-timeout and an empty-state reading of specific error codes.
   */
  async fetchUserFullContext(signal: AbortSignal) {
    return supabase.rpc("get_user_full_context").abortSignal(signal);
  },

  /** Every active System Context Item — the platform's global public facts. */
  async listSystemContextItems(): Promise<RecordsResult<{ items: SystemContextItem[] }>> {
    requireUserId();
    const res = await scopeDoors().systemItems();
    return res.ok ? ok({ items: res.data }) : res;
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — TASKS PER LEVEL
  // ──────────────────────────────────────────────────────────────────

  async listScopeTasks(
    level: TaskBucketLevel,
    id: string,
  ): Promise<RecordsResult<{ tasks: TaskNode[] }>> {
    try {
      requireUserId();

      let taskIds: string[];
      if (level === "project") {
        const { data, error } = await projectsDb(supabase)
          .from("tasks")
          .select("id")
          .is("deleted_at", null)
          .eq("project_id", id);
        if (error) return err(...mapPgErrorPair(error));
        taskIds = (data ?? []).map((row) => row.id);
      } else if (level === "scope") {
        // Tasks tagged with this scope = edges INCOMING to ('scope', id)
        // whose source is a task.
        const res = await associationsService.listForTargets("scope", [id]);
        if (!res.ok) return { ok: false, error: fromAssociations(res.error) };
        taskIds = res.data.edges
          .filter((e) => e.sourceType === "task")
          .map((e) => e.sourceId);
      } else {
        // org-level: tasks belonging to projects under this org, OR tasks
        // tagged directly with no project. Defer to future RPC for correctness.
        return ok({ tasks: [] });
      }

      if (taskIds.length === 0) return ok({ tasks: [] });

      const { data: taskRows, error: taskErr } = await projectsDb(supabase)
        .from("tasks")
        .select("id, title, status, project_id, organization_id, updated_at")
        .is("deleted_at", null)
        .in("id", taskIds);
      if (taskErr) return err(...mapPgErrorPair(taskErr));

      const tagsRes = await bulkEntityScopeIds("task", taskIds);
      if (!tagsRes.ok) return tagsRes;

      const tagsByEntity = new Map<string, string[]>(
        Object.entries(tagsRes.data),
      );

      const tasks: TaskNode[] = (taskRows ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status as string,
        project_id: row.project_id ?? null,
        organization_id: row.organization_id ?? null,
        scope_ids: tagsByEntity.get(row.id) ?? [],
        updated_at: row.updated_at ?? new Date().toISOString(),
      }));

      return ok({ tasks });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  async listOrphanProjects(
    orgId: string,
  ): Promise<RecordsResult<{ projects: ProjectNode[] }>> {
    try {
      requireUserId();

      const { data: projectRows, error: projErr } = await projectsDb(supabase)
        .from("projects")
        .select("id, organization_id, name, slug")
        .is("deleted_at", null)
        .eq("organization_id", orgId);
      if (projErr) return err(...mapPgErrorPair(projErr));

      const ids = (projectRows ?? []).map((r) => r.id);
      if (ids.length === 0) return ok({ projects: [] });

      // A project is "orphan" when it carries NO scope tag. Read per-project
      // scope edges through the unified association edge.
      const tagsRes = await bulkEntityScopeIds("project", ids);
      if (!tagsRes.ok) return tagsRes;

      const tagged = new Set(
        ids.filter((id) => (tagsRes.data[id] ?? []).length > 0),
      );
      const orphans = (projectRows ?? [])
        .filter((p) => !tagged.has(p.id))
        .map<ProjectNode>((p) => ({
          id: p.id,
          organization_id: p.organization_id,
          name: p.name,
          slug: p.slug,
          scope_ids: [],
        }));

      return ok({ projects: orphans });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** A scope type's context fields. */
  async listContextItems(scopeTypeId: string): Promise<RecordsResult<{ items: ContextField[] }>> {
    requireUserId();
    const res = await scopeDoors().fields([scopeTypeId]);
    return res.ok ? ok({ items: res.data }) : res;
  },

  /** Several scope types' context fields in one read. */
  async listContextItemsForTypes(scopeTypeIds: string[]): Promise<RecordsResult<{ items: ContextField[] }>> {
    requireUserId();
    if (scopeTypeIds.length === 0) return ok({ items: [] });
    const res = await scopeDoors().fields(scopeTypeIds);
    return res.ok ? ok({ items: res.data }) : res;
  },

  /** Several scopes' values (each carries its `scope_id`); a text kept as a file is opened whole. */
  async listContextValuesForScopes(scopeIds: string[]): Promise<RecordsResult<{ values: ContextValue[] }>> {
    requireUserId();
    if (scopeIds.length === 0) return ok({ values: [] });
    const res = await scopeDoors().values(scopeIds, { readFileText: readScopeFileText });
    return res.ok ? ok({ values: res.data }) : res;
  },

  /** One scope's values. */
  async listContextValues(scopeId: string): Promise<RecordsResult<{ values: ContextValue[] }>> {
    return scopesService.listContextValuesForScopes([scopeId]);
  },

  /** Where a scope lives: its organization and type. `scope: null` = not found or not visible. */
  async getScopeHome(
    scopeId: string,
  ): Promise<RecordsResult<{ scope: Pick<Scope, "id" | "name" | "organization_id" | "scope_type_id"> | null }>> {
    requireUserId();
    const res = await scopeDoors().scopes([scopeId]);
    if (!res.ok) return res;
    const row = res.data[0];
    return ok({
      scope: row ? { id: row.id, name: row.name, organization_id: row.organization_id, scope_type_id: row.scope_type_id } : null,
    });
  },

  /** A (scope, field) cell with the scope's and field's names (a reference chip's preview). */
  async resolveContextCell(args: {
    scopeId: string;
    contextItemId: string;
  }): Promise<RecordsResult<{ scopeName: string | null; itemName: string | null; value: ContextValue | null }>> {
    requireUserId();
    const doors = scopeDoors();
    const [valueRes, scopeRes] = await Promise.all([
      doors.values([args.scopeId], { readFileText: readScopeFileText }),
      doors.scopes([args.scopeId]),
    ]);
    if (!valueRes.ok) return valueRes;
    const scope = scopeRes.ok ? scopeRes.data[0] : undefined;
    const fieldRes = scope ? await doors.fields([scope.scope_type_id]) : null;
    const field = fieldRes?.ok ? fieldRes.data.find((f) => f.id === args.contextItemId) : undefined;
    return ok({
      scopeName: scope?.name ?? null,
      itemName: field?.label ?? null,
      value: valueRes.data.find((v) => v.field_id === args.contextItemId) ?? null,
    });
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — SUGGESTION TARGET RESOLUTION
  //
  //  Given a KG suggestion's target (`scope_id` + the proposed
  //  `context_item_id`), resolve the FULL human-readable picture the
  //  decision UI needs: the org / scope-type / scope / item path, every
  //  context item defined on that scope type, and the CURRENT value for
  //  each item on this scope (so the UI can show what a suggestion would
  //  overwrite). Read-only; one logical "resolve" RPC's worth of joins.
  // ──────────────────────────────────────────────────────────────────

  async resolveSuggestionTarget(args: {
    scopeId: string;
    contextItemId: string | null;
  }): Promise<RecordsResult<ResolvedSuggestionTarget>> {
    try {
      requireUserId();


      // The scope, its type, its items and their current values — from the store (lane SCOPES-READS-WEB).
      const scopeRes = await scopeDoors().scopes([args.scopeId]);
      if (!scopeRes.ok) return scopeRes;
      const scope = scopeRes.data[0];
      if (!scope)
        return err(
          "not_found",
          recordUnavailable({
            entity: "scope",
            reason: "unknown",
            recordId: args.scopeId,
            token: "scope",
            relation: "scopes",
          }).message,
        );

      const orgP = supabase
        .schema("iam")
        .from("organizations")
        .select("id, name, slug")
        .eq("id", scope.organization_id)
        .single();

      const [orgRes, itemsStore, valuesStore] = await Promise.all([
        orgP,
        scopeDoors().fields([scope.scope_type_id]),
        scopeDoors().values([args.scopeId], { readFileText: readScopeFileText }),
      ]);

      if (orgRes.error) return err(...mapPgErrorPair(orgRes.error));
      if (!itemsStore.ok) return itemsStore;
      if (!valuesStore.ok) return valuesStore;
      const scopeType = scope.scope_type;
      if (!scopeType) return err("not_found", "That scope's type could not be read.");
      const valueByField = new Map(valuesStore.data.map((v) => [v.field_id, v]));
      const items: ResolvedSuggestionItem[] = [...itemsStore.data]
        .filter((f) => f.status !== "archived")
        .sort((a, b) => a.sort - b.sort)
        .map((field) => ({ field, current: valueByField.get(field.id) ?? null }));
      const targetItem = args.contextItemId
        ? (items.find((it) => it.field.id === args.contextItemId) ?? null)
        : null;

      return ok({
        org: {
          id: orgRes.data.id,
          name: orgRes.data.name,
          slug: orgRes.data.slug,
        },
        scope_type: {
          id: scopeType.id,
          slug: scopeType.slug,
          label_singular: scopeType.label_singular,
          label_plural: scopeType.label_plural,
          icon: scopeType.icon,
          color: scopeType.color,
        },
        scope: {
          id: scope.id,
          slug: scope.slug ?? null,
          name: scope.name ?? "",
          description: scope.description ?? null,
        },
        target_item: targetItem,
        items,
      });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — ENTITIES BY SCOPE (reverse direction)
  //
  //  Given a set of scope_ids, return the entity ids that are tagged
  //  with ANY (`match_all: false`) or ALL (`match_all: true`) of them.
  //  Used by sidebar/list filters in notes, tasks, agents, etc. — when
  //  the user selects active scopes globally and wants the surrounding
  //  list filtered to just the entities tagged with those scopes.
  //
  //  Reads the unified association edge via `assoc_for_targets('scope', …)`
  //  (one round-trip: every edge incoming to those scopes), then does the
  //  ANY/ALL fold client-side. A future `list_entities_by_scopes`-style RPC
  //  could push the ANY/ALL filter into the DB, but the assoc batch read is
  //  already a single round-trip.
  // ──────────────────────────────────────────────────────────────────

  async listEntitiesByScopes(args: {
    scope_ids: string[];
    entity_type?: EntityType;
    match_all?: boolean;
  }): Promise<
    RecordsResult<{
      entities: Array<{
        entity_type: EntityType;
        entity_id: string;
      }>;
    }>
  > {
    try {
      requireUserId();
      if (args.scope_ids.length === 0) return ok({ entities: [] });

      // Members of these scopes = every edge INCOMING to ('scope', scopeId).
      // The edge source IS the tagged entity; `targetId` is the scope it hit.
      const res = await associationsService.listForTargets(
        "scope",
        args.scope_ids,
      );
      if (!res.ok) return { ok: false, error: fromAssociations(res.error) };

      // Fold edges into a map: { [entityKey]: Set<scope_id> }.
      const matches = new Map<
        string,
        {
          entity_type: EntityType;
          entity_id: string;
          hits: Set<string>;
        }
      >();
      for (const edge of res.data.edges) {
        if (args.entity_type && edge.sourceType !== args.entity_type) continue;
        const key = `${edge.sourceType}:${edge.sourceId}`;
        const entry = matches.get(key);
        if (entry) {
          entry.hits.add(edge.targetId);
        } else {
          matches.set(key, {
            entity_type: edge.sourceType as EntityType,
            entity_id: edge.sourceId,
            hits: new Set([edge.targetId]),
          });
        }
      }

      const matchAll = args.match_all ?? false;
      const needed = args.scope_ids.length;
      const entities = Array.from(matches.values())
        .filter((entry) =>
          matchAll ? entry.hits.size === needed : entry.hits.size > 0,
        )
        .map((entry) => ({
          entity_type: entry.entity_type,
          entity_id: entry.entity_id,
        }));

      return ok({ entities });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },


  // ──────────────────────────────────────────────────────────────────
  //  READ — ENTITY ASSIGNMENTS (M2M tags on a single entity)
  //
  //  Returns the scope_ids associated with `${entityType}:${entityId}`.
  //  Used by Surface B components to populate their initial selection.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Live scopes in one organization whose names match `names` exactly
   * (case-insensitive), with their type label. For agent write targets that
   * tag a record by scope NAME: an unmatched or ambiguous name is the
   * caller's refusal to make, never a guess.
   */
  async findScopesByName(
    organizationId: string,
    names: string[],
  ): Promise<RecordsResult<Array<{ id: string; name: string; type: string }>>> {
    try {
      requireUserId();
      const wanted = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
      if (wanted.length === 0) return ok([]);
      // The organization's live scopes, from the store's tree door; a name matches case-insensitively.
      const res = await scopeDoors().tree([organizationId]);
      if (!res.ok) return res;
      const wantedLower = new Set(wanted.map((n) => n.toLowerCase()));
      const out: Array<{ id: string; name: string; type: string }> = [];
      for (const t of res.data) {
        for (const sc of t.scopes) {
          if (wantedLower.has(sc.name.trim().toLowerCase())) {
            out.push({ id: sc.id, name: sc.name, type: t.label_singular });
          }
        }
      }
      return ok(out);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  async getEntityScopes(
    entityType: EntityTypeToken,
    entityId: string,
  ): Promise<RecordsResult<{ scope_ids: string[] }>> {
    try {
      requireUserId();
      // A scope tag is an OUTGOING edge entity → ('scope', scopeId).
      const res = await associationsService.listForEntity(entityType, entityId);
      if (!res.ok) return { ok: false, error: fromAssociations(res.error) };
      const scope_ids = res.data.edges
        .filter((e) => e.direction === "outgoing" && e.otherType === "scope")
        .map((e) => e.otherId);
      return ok({ scope_ids });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /**
   * Bulk read: scope assignments for MANY entities of one type in ONE query.
   * Built for list surfaces (file tables, note lists) that show per-row
   * context status — N visible rows must never mean N requests.
   */
  async getEntityScopesBulk(
    entityType: EntityType,
    entityIds: string[],
  ): Promise<RecordsResult<{ byEntity: Record<string, string[]> }>> {
    try {
      requireUserId();
      const res = await bulkEntityScopeIds(entityType, entityIds);
      if (!res.ok) return res;
      return ok({ byEntity: res.data });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — ENTITY ASSIGNMENTS, DENORMALIZED (scope + type for display)
  //
  //  The display counterpart of `getEntityScopes`: returns each assigned
  //  scope joined to its type's presentation fields, so read-only surfaces
  //  (AssignedScopesDisplay) render `Type: Scope` chains without joining
  //  context.scopes / context.scope_types themselves (this file owns those tables).
  // ──────────────────────────────────────────────────────────────────

  async getEntityScopeDetails(
    entityType: EntityType,
    entityId: string,
  ): Promise<RecordsResult<{ scopes: ScopeWithType[] }>> {
    try {
      requireUserId();
      const assoc = await associationsService.listForEntity(
        entityType,
        entityId,
      );
      if (!assoc.ok) return { ok: false, error: fromAssociations(assoc.error) };
      const ids = assoc.data.edges
        .filter((e) => e.direction === "outgoing" && e.otherType === "scope")
        .map((e) => e.otherId);
      if (ids.length === 0) return ok({ scopes: [] });

      const disp = await fetchScopeDisplays(ids);
      if (!disp.ok) return disp;
      return ok({ scopes: disp.data });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — ALL TAGS FOR A SET OF ENTITIES, DENORMALIZED (sidebar grouping)
  //
  //  Every scope tag on the given entities of `entityType`, flattened with
  //  scope name + type label. Powers list/sidebar grouping (e.g. the notes
  //  "by scope" view). Reads the entities' OUTGOING `scope` edges from the
  //  SOURCE side, then resolves display fields for exactly the scopes hit.
  //
  //  NEVER from the target side (2026-09-27, /notes/<id> answered
  //  rpc/assoc_for_targets 500 = Postgres 57014 statement timeout on every
  //  load): `assoc_for_targets('scope', <every visible scope>)` returned every
  //  edge INTO every scope from every source type — 3,491 scopes and ~6,500
  //  edges for admin@admin.com, 19 s — only to keep the 27 note edges. And the
  //  "every visible scope" read was a bare select capped at 1000 rows, so tags
  //  on scopes past row 1000 were dropped. The source-side read answers the
  //  same question from the person's ~150 notes in ~1 s.
  //  Guard: entity-scope-tags-read-from-the-source-side.test.ts.
  // ──────────────────────────────────────────────────────────────────

  async listEntityScopeTags(
    entityType: EntityType,
    entityIds: string[],
  ): Promise<RecordsResult<{ tags: EntityScopeTag[] }>> {
    try {
      requireUserId();
      const byEntity = await bulkEntityScopeIds(entityType, entityIds);
      if (!byEntity.ok) return byEntity;

      const pairs = Object.entries(byEntity.data).flatMap(([entityId, scopeIds]) =>
        scopeIds.map((scopeId) => ({ entityId, scopeId })),
      );
      if (pairs.length === 0) return ok({ tags: [] });

      const disp = await fetchScopeDisplays(
        Array.from(new Set(pairs.map((p) => p.scopeId))),
      );
      if (!disp.ok) return disp;
      const byId = new Map(disp.data.map((s) => [s.id, s]));

      // A tag whose scope is not a live, readable scope (removed, or not
      // visible to this person) is not a tag anybody can be shown.
      const tags: EntityScopeTag[] = pairs
        .filter((p) => byId.has(p.scopeId))
        .map((p) => {
          const s = byId.get(p.scopeId);
          return {
            entity_id: p.entityId,
            scope_id: p.scopeId,
            scope_name: s?.name ?? "",
            scope_type: s?.scope_type?.label_singular ?? "",
          };
        });
      return ok({ tags });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },


  /**
   * An org-less container adopts the org of its first assigned scope.
   *
   * Rule (user-defined): a project/task with NO organization inherits the org
   * of a scope it's tagged with; a project/task that ALREADY has an org is
   * never changed. The "never overwrite" half is enforced at the DB with an
   * `organization_id IS NULL` predicate on the UPDATE — so this is safe to call
   * unconditionally; if the entity already has an org, zero rows change.
   *
   * Only entity types that own an `organization_id` column participate.
   * NOTE: this writes an entity column, not appContextSlice — it does NOT
   * violate the Surface A/B global-context invariant.
   */
  async adoptEntityOrgFromScopes(
    entityType: EntityType,
    entityId: string,
    scopeIds: string[],
  ): Promise<RecordsResult<{ organization_id: string | null }>> {
    // Projects-schema table names (project/task live in `projects`). Consumed
    // below via `projectsDb(supabase).from(table)`.
    const ENTITY_ORG_TABLE: Partial<Record<EntityType, string>> = {
      project: "projects",
      task: "tasks",
    };
    try {
      const table = ENTITY_ORG_TABLE[entityType];
      if (!table || scopeIds.length === 0) return ok({ organization_id: null });

      // The org of the first assigned scope (scopes carry organization_id), from the store's door.
      const scopeRes = await scopeDoors().scopes([scopeIds[0]!]);
      if (!scopeRes.ok) return scopeRes;
      const orgId: string | null = scopeRes.data[0]?.organization_id ?? null;
      if (!orgId) return ok({ organization_id: null });

      // Adopt ONLY when the container currently has no org (DB-enforced).
      // project/task live in the `projects` schema — reach them via projectsDb.
      const { data: updated, error: uErr } = await projectsDb(supabase)
        .from(table as never)
        .update({ organization_id: orgId } as never)
        .eq("id", entityId)
        .is("organization_id", null)
        .select("id");
      if (uErr) return err(...mapPgErrorPair(uErr));

      const didUpdate = Array.isArray(updated) && updated.length > 0;
      return ok({ organization_id: didUpdate ? orgId : null });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — the sanctioned SECURITY DEFINER mutation family (C17 HYBRID
  //  ruling, 2026-08-29: reads stay direct RLS table reads; writes go
  //  through these RPCs). Every function checks org access INSIDE
  //  (iam.has_org_access / has_org_admin / owner-admin membership) and
  //  the create paths take an explicit org — nothing here assigns one.
  // ──────────────────────────────────────────────────────────────────

  // ──────────────────────────────────────────────────────────────────
  //  READ — ARCHIVED SCOPE TYPES (THE ARCHIVED-ITEMS LAW's reveal half)
  // ──────────────────────────────────────────────────────────────────

  /**
   * The org's REMOVED scope types, newest first, with the live counts of what
   * went with each one.
   *
   * The boot tree (`getScopeTree`) is the live working set and never carries
   * these rows — that is what the F6 defect was: no filter there at all, so a
   * deleted type stayed on the scopes page as an openable card. The archive is
   * a SEPARATE, on-demand read so the reveal is one click on the surface
   * (`ArchivedDisclosure`) without widening the cache every picker shares.
   */
  async listArchivedScopeTypes(
    orgId: string,
  ): Promise<RecordsResult<{ types: ArchivedScopeType[] }>> {
    try {
      requireUserId();
      // The archived scope types and what each removal took with it, from the store's archive
      // (lane SCOPES-READS-WEB), so the disclosure states the consequence of a restore.
      const res = await scopeDoors().archivedTypes(orgId);
      if (!res.ok) return res;
      return ok({ types: res.data });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // updateContextItem retired (lane SCOPES-OLD-WRITERS, 2026-09-29): a context field is edited only
  // through the store's scope door, scopeStore.updateContextItem (custom.context_item_write), which
  // decides the RPC-or-column split from the patch exactly as this method did.

};

// ─── internal: bulk source→scope read over the association edge ─────────
//
// Maps each entity to its scope tags (OUTGOING edges to ('scope', …)) in ONE
// round-trip via `assoc_for_sources` (batch-by-source, target-filtered to
// 'scope' in the DB). Every requested id is present in the result map (empty
// array when untagged) so callers can rely on the key existing.

async function bulkEntityScopeIds(
  entityType: EntityType,
  entityIds: string[],
): Promise<RecordsResult<Record<string, string[]>>> {
  const ids = Array.from(new Set(entityIds));
  if (ids.length === 0) return ok({});

  const res = await associationsService.listForSources(
    entityType,
    ids,
    "scope",
  );
  if (!res.ok) return { ok: false, error: fromAssociations(res.error) };

  const byEntity: Record<string, string[]> = {};
  for (const id of ids) byEntity[id] = [];
  for (const edge of res.data.edges) {
    (byEntity[edge.sourceId] ??= []).push(edge.targetId);
  }
  return ok(byEntity);
}

// ─── internal: scope display rows (scope joined to its type) ────────────
//
// The one place a scope is read with its type for presentation (the store's
// `custom.context_scopes` door). Used by getEntityScopeDetails / listEntityScopeTags.

async function fetchScopeDisplays(scopeIds: string[]): Promise<RecordsResult<ScopeWithType[]>> {
  if (scopeIds.length === 0) return ok([]);
  return scopeDoors().scopes(scopeIds);
}
