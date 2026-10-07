// features/scopes/service/scopesService.ts
//
// THE SOLE CHOKEPOINT for the scope system from frontend code.
//
// ONE READ PATH: THE RECORD STORE (lane 9 SCOPES-ON-THE-STORE, the flip, 2026-10-03; Arman's ruling
// "burn the boats"). Every read below goes through the record store's `custom.context_*` doors via
// `storeScopeReads.ts`, decoded by `storeScopeAdapter.ts` into the same node types. A scope type is a
// store Table (`kept_for = context`), a scope a Record, a context item a Field, a value the Record's
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
import {
  callContextDoor,
  contextDoorQuery,
  readArchivedScopeTypes,
  readContextItems,
  readContextValues,
  readScopeTree,
  readScopeTypes,
  readScopesById,
  readTypeScopesPage,
} from "@/features/scopes/service/storeScopeReads";
import { oldTypeSlug, scopeTypeDisplayFromStore } from "@/features/scopes/service/storeScopeAdapter";
import { placeTableInRecordStore } from "@/features/data-tables/data-source/table-home";
import { requireUserId } from "@/utils/auth/getUserId";
import { browserAdminLaneOpen } from "@/utils/supabase/adminLane";
import { runWithSessionRetry } from "@/lib/supabase/authRetry";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import { associationsService } from "@/features/scopes/service/associationsService";
import { membershipsService } from "@/features/organizations/service/membershipsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import {
  err,
  mapPgError,
  mapPgErrorPair,
  ok,
} from "@/features/scopes/service/rpcResult";
import type {
  ArchivedScopeTypeRow,
  ContextItemRow,
  ContextItemValue,
  ContextTemplate,
  OrgNode,
  ProjectNode,
  ReferencingContextValue,
  ResolvedSuggestionItem,
  ResolvedSuggestionTarget,
  ResolvedSuggestionValue,
  EntityType,
  ScopeRow,
  ScopeTreeResponse,
  ScopeTypeNode,
  ScopeTypeRow,
  ScopesRpcResult,
  ScopeWithType,
  TaskBucketLevel,
  TaskNode,
  TemplateScopeTypeDetail,
} from "@/features/scopes/types";
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
async function provisionScopeTableInTheStore(
  organizationId: string,
  userId: string,
  contextItemId: string,
  scopeId: string,
): Promise<{ ok: true; tableId: string } | { ok: false; code: "not_found" | "internal"; message: string }> {
  const made = await (supabase as unknown as SupabaseClient).schema("custom").rpc("scope_table_provision", {
    p_organization_id: organizationId,
    p_item_id: contextItemId,
    p_scope_id: scopeId,
  });
  if (made.error || typeof made.data !== "string") {
    return {
      ok: false,
      code: "internal",
      message: made.error
        ? `${made.error.message}${made.error.hint ? ` ${made.error.hint}` : ""}`
        : "The record store made no table for this scope.",
    };
  }
  placeTableInRecordStore(made.data, { organizationId, userId });
  return { ok: true, tableId: made.data };
}

// ─── service ────────────────────────────────────────────────────────

export const scopesService = {
  /** Organization-scoped immutable schemas available for per-scope table values. */
  async listTableTemplates(
    organizationId: string,
  ): Promise<ScopesRpcResult<TableTemplate[]>> {
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
  ): Promise<ScopesRpcResult<{ datasetId: string }>> {
    try {
      const userId = requireUserId();

      // The scope table lives in the record store; the store's own door (`custom.scope_table_provision`)
      // answers it in the scope's own organization. The id comes back PLACED, so the caller's next read
      // or write (the list-change engine's `getCompleteTable` / `bulkWrite`) reaches it.
      // Where the scope lives: from the scope itself, through the store's door.
      const scopeRes = await readScopesById([scopeId]);
      if (!scopeRes.ok) return scopeRes;
      const organizationId: string | undefined = scopeRes.data[0]?.organization_id;
      if (!organizationId) {
        return err("not_found", "That scope could not be read, so no table was provisioned for it.");
      }
      const provisioned = await provisionScopeTableInTheStore(organizationId, userId, contextItemId, scopeId);
      if (!provisioned.ok) return err(provisioned.code, provisioned.message);
      return ok({ datasetId: provisioned.tableId });
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
  ): Promise<ScopesRpcResult<ScopeTreeResponse>> {
    // SKELETON (lane SCOPES-TREE-PAGED): the same organizations and projects, and the scope types
    // WITHOUT their scopes (`scopes: []`) — the first paint. The scopes come per type
    // (`readTypeScopesPage`) or with the whole tree later.
    const skeleton = opts.shape === "skeleton";
    try {
      requireUserId();

      // The current user's org memberships via the canonical membership RPC
      // (iam.memberships); org identity is resolved from the public
      // organizations table below (no cross-schema embed).
      const orgMembersRes = await membershipsService.forUser("organization");
      if (isScopesRpcErr(orgMembersRes)) return orgMembersRes;
      const roleByOrgId = new Map<string, string>();
      for (const m of orgMembersRes.data.memberships) {
        roleByOrgId.set(m.containerId, m.role);
      }
      const orgIds = [...roleByOrgId.keys()];

      // READ IN CHUNKS (lane FINISH-THE-SWITCH, 2026-10-05): a person in ~1000 organizations put every
      // id in ONE GET url (~38 KB) and the gateway answered 400 — /scopes said "Couldn't load your
      // scopes". Each read below sends at most IN_CHUNK ids (`inChunks.ts`).
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
      // `settings` carries the `test_fixture` classification and `created_by` says whose
      // organization it is — the org picker hides fixtures behind the archived-items disclosure and
      // draws the person's own first (VERIFIER-8 MEDIUM-3). `archived_at` is read so an ARCHIVED
      // organization never appears in a "which one am I working in" list; the organizations page's
      // own archive disclosure is where those live.
      const orgsP = readInChunks(orgIds, (chunk) =>
        supabase
          .schema("iam")
          .from("organizations")
          .select("id, name, abbreviation, logo_url, slug, settings, created_by, archived_at")
          .in("id", chunk) as unknown as PromiseLike<{ data: OrgRow[] | null; error: PostgrestErrorLike | null }>,
      );

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
      if (orgsRes.error) return err(...mapPgErrorPair(orgsRes.error));
      if (projectsRes.error) return err(...mapPgErrorPair(projectsRes.error));

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
          ? readScopeTypes(liveOrgIds, false)
          : readScopeTree(liveOrgIds),
        bulkEntityScopeIds("project", projectIds),
      ]);
      if (isScopesRpcErr(treeRes)) return treeRes;
      const treeTypes: ScopeTypeNode[] = treeRes.data.types;

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
      if (isScopesRpcErr(projectScopesRes)) return projectScopesRes;
      const projectScopes = new Map<string, string[]>(
        Object.entries(projectScopesRes.data),
      );

      // Group scope_types and projects per org.
      const scopeTypesByOrg = new Map<string, ScopeTypeNode[]>();
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
  ): Promise<ScopesRpcResult<{ organization: OrgNode | null }>> {
    try {
      requireUserId();
      if (!browserAdminLaneOpen()) {
        return err(
          "forbidden_org",
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
        readScopeTree([organizationId]).then((r) => (isScopesRpcErr(r) ? r : ok(r.data.types))),
      ]);
      if (orgRes.error) return err(...mapPgErrorPair(orgRes.error));
      if (isScopesRpcErr(treeRes)) return treeRes;
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

  /**
   * Every ACTIVE System Context Item (`context.system_context_item`) — the
   * platform's global public facts, readable by any signed-in user. Cached on
   * the tree's catalogs under `SYSTEM_ITEMS_KEY`
   * (`features/scopes/redux/contextItemCatalog.ts`).
   */
  async listSystemContextItems(): Promise<
    ScopesRpcResult<{
      items: {
        id: string;
        key: string;
        display_name: string;
        description: string | null;
        item_class: string;
        value_type: string;
        sensitivity: string;
        sort_order: number | null;
      }[];
    }>
  > {
    try {
      requireUserId();
      // VIEW LAW: system context items are intentionally global public facts with no owner or scope dimension.
      // Read through the store's door (reference data that stays in place; lane SCOPES-READS-WEB).
      const { data: answer, error } = await runWithSessionRetry(() => contextDoorQuery("context_system_items"));
      if (error) return err(...mapPgErrorPair(error));
      const data = (Array.isArray(answer) ? answer : []) as Array<{
        id: string;
        key: string;
        display_name: string;
        description: string | null;
        item_class: string;
        value_type: string;
        sensitivity: string;
        sort_order: number | null;
      }>;
      return ok({ items: data ?? [] });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  READ — TASKS PER LEVEL
  // ──────────────────────────────────────────────────────────────────

  async listScopeTasks(
    level: TaskBucketLevel,
    id: string,
  ): Promise<ScopesRpcResult<{ tasks: TaskNode[] }>> {
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
        if (isScopesRpcErr(res)) return res;
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
      if (isScopesRpcErr(tagsRes)) return tagsRes;

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
  ): Promise<ScopesRpcResult<{ projects: ProjectNode[] }>> {
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
      if (isScopesRpcErr(tagsRes)) return tagsRes;

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

  // ──────────────────────────────────────────────────────────────────
  //  READ — CONTEXT ITEMS + VALUES (sidecar)
  // ──────────────────────────────────────────────────────────────────

  async listContextItems(
    scopeTypeId: string,
  ): Promise<ScopesRpcResult<{ items: ContextItemRow[] }>> {
    try {
      requireUserId();
      // The type's Fields, from the store (lane SCOPES-READS-WEB).
      const res = await readContextItems([scopeTypeId]);
      if (!res.ok) return res;
      return ok({ items: res.data });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** Batched variant for multi-type surfaces (the /scopes hub tables):
   *  one round-trip for every type's active item catalog. */
  async listContextItemsForTypes(
    scopeTypeIds: string[],
  ): Promise<ScopesRpcResult<{ items: ContextItemRow[] }>> {
    try {
      requireUserId();
      if (scopeTypeIds.length === 0) return ok({ items: [] });
      // Every item of every listed type, from the store, in batches (lane SCOPES-READS-WEB).
      const res = await readContextItems(scopeTypeIds);
      if (!res.ok) return res;
      return ok({ items: res.data });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** Batched variant for multi-scope surfaces (the /scopes hub tables):
   *  one round-trip for the CURRENT cells of every listed scope. Rows carry
   *  `scope_id` so callers can regroup. */
  async listContextValuesForScopes(
    scopeIds: string[],
  ): Promise<
    ScopesRpcResult<{ values: (ContextItemValue & { scope_id: string })[] }>
  > {
    try {
      requireUserId();
      if (scopeIds.length === 0) return ok({ values: [] });
      // IN BATCHES, EACH READ WHOLE (lane HANDOVER, 2026-09-27; lane SCOPES-READS-WEB): the store's
      // values door answers at most 200 scopes a call, so `readContextValues` asks 100 at a time
      // (in the request body — no address to overflow) and returns every current value.
      const res = await readContextValues(scopeIds);
      if (!res.ok) return res;
      return ok({ values: res.data });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  async listContextValues(
    scopeId: string,
  ): Promise<ScopesRpcResult<{ values: ContextItemValue[] }>> {
    try {
      requireUserId();
      const res = await readContextValues([scopeId]);
      if (!res.ok) return res;
      return ok({ values: res.data.map(({ scope_id: _scope, ...v }) => v as ContextItemValue) });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ─── The context inspector's drill-down (lane CONTEXT-INSPECTOR-GUIDED) ───
  // Organization → scope type → scope → context item: each read takes only the
  // previous choice. RLS decides what the signed-in person may see.

  /** Every live scope type of one organization, in the organization's order. */
  async listScopeTypesForOrganization(
    organizationId: string,
  ): Promise<
    ScopesRpcResult<{
      types: Pick<ScopeTypeRow, "id" | "label_singular" | "label_plural" | "slug" | "parent_type_id" | "sort_order">[];
    }>
  > {
    try {
      requireUserId();
      // The types only (lane SCOPES-TREE-PAGED): this list never needed the scopes.
      const res = await readScopeTypes([organizationId], false);
      if (!res.ok) return res;
      const types = res.data.types
        .map((t) => ({
          id: t.id,
          label_singular: t.label_singular,
          label_plural: t.label_plural,
          slug: t.slug ?? "",
          parent_type_id: t.parent_type_id,
          sort_order: t.sort_order,
        }))
        .sort((a, b) => a.sort_order - b.sort_order || a.label_plural.localeCompare(b.label_plural));
      return ok({ types });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** Every live scope of one type in one organization — at any depth, by name. */
  async listScopesOfType(
    organizationId: string,
    scopeTypeId: string,
  ): Promise<
    ScopesRpcResult<{
      scopes: Pick<ScopeRow, "id" | "name" | "parent_scope_id" | "scope_type_id">[];
    }>
  > {
    try {
      requireUserId();
      // This one type's scopes, every page (lane SCOPES-TREE-PAGED), never the organization's whole tree.
      const all = [];
      let offset: number | null = 0;
      while (offset !== null) {
        const page = await readTypeScopesPage(scopeTypeId, offset, 1000);
        if (!page.ok) return page;
        all.push(...page.data.scopes.filter((s) => s.organization_id === organizationId));
        offset = page.data.nextOffset;
      }
      const scopes = all
        .map((s) => ({ id: s.id, name: s.name, parent_scope_id: s.parent_scope_id, scope_type_id: s.scope_type_id }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return ok({ scopes });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /** Where one scope lives — its organization and type — read from the scope itself. */
  async getScopeHome(
    scopeId: string,
  ): Promise<
    ScopesRpcResult<{
      scope: Pick<ScopeRow, "id" | "name" | "organization_id" | "scope_type_id"> | null;
    }>
  > {
    try {
      requireUserId();
      const res = await readScopesById([scopeId]);
      if (!res.ok) return res;
      const row = res.data[0];
      return ok({
        scope: row
          ? { id: row.id, name: row.name ?? "", organization_id: row.organization_id, scope_type_id: row.scope_type_id }
          : null,
      });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  /**
   * ONE cell (scope x context item) plus the two names that head it.
   *
   * The chokepoint's answer for the `@context_value` reference chip
   * (`features/matrx-envelope/referenceResolvers.ts`), which until 2026-09-11
   * read `context_item_values` / `scopes` / `context_items` directly — the
   * only place in the frontend that read a CELL outside this service, and a
   * silent-break class (a wrong schema rendered a label instead of a value
   * with no error at all).
   *
   * Missing scope or item names are NOT an error: the caller heads the chip
   * with whatever it got. Only a failed VALUE read is reported.
   */
  async resolveContextCell(args: {
    scopeId: string;
    contextItemId: string;
  }): Promise<
    ScopesRpcResult<{
      scopeName: string | null;
      itemName: string | null;
      value: ContextItemValue | null;
    }>
  > {
    try {
      requireUserId();
      const [valueRes, scopeRes] = await Promise.all([
        readContextValues([args.scopeId]),
        readScopesById([args.scopeId]),
      ]);
      if (!valueRes.ok) return valueRes;
      const scope = scopeRes.ok ? scopeRes.data[0] : undefined;
      const itemRes = scope ? await readContextItems([scope.scope_type_id]) : null;
      const item = itemRes?.ok ? itemRes.data.find((i) => i.id === args.contextItemId) : undefined;
      const value = valueRes.data.find((v) => v.context_item_id === args.contextItemId);
      return ok({
        scopeName: scope?.name ?? null,
        itemName: item?.display_name ?? null,
        value: value ? (({ scope_id: _scope, ...v }) => v as ContextItemValue)(value) : null,
      });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
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
  }): Promise<ScopesRpcResult<ResolvedSuggestionTarget>> {
    try {
      requireUserId();


      // The scope, its type, its items and their current values — from the store (lane SCOPES-READS-WEB).
      const scopeRes = await readScopesById([args.scopeId]);
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
        readContextItems([scope.scope_type_id]),
        readContextValues([args.scopeId]),
      ]);

      if (orgRes.error) return err(...mapPgErrorPair(orgRes.error));
      if (!itemsStore.ok) return itemsStore;
      if (!valuesStore.ok) return valuesStore;
      const scopeType = scope.scope_type ? scopeTypeDisplayFromStore(scope.scope_type) : null;
      if (!scopeType) return err("not_found", "That scope's type could not be read.");
      const scopeTypeRes = {
        data: { ...scopeType, slug: oldTypeSlug(scope.scope_type?.slug ?? null) },
      };
      const itemsRes = {
        data: [...itemsStore.data]
          .filter((it) => it.is_active)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      };

      const valuesByItem = new Map<string, ResolvedSuggestionValue>();
      for (const v of valuesStore.data) {
        valuesByItem.set(v.context_item_id, {
          value_text: v.value_text ?? null,
          value_number: v.value_number ?? null,
          value_boolean: v.value_boolean ?? null,
          value_json: v.value_json ?? null,
          source_type: v.source_type ?? null,
          version: v.version ?? null,
          created_at: v.created_at ?? null,
        });
      }

      const items: ResolvedSuggestionItem[] = (itemsRes.data ?? []).map(
        (it) => ({
          id: it.id,
          slug: it.slug ?? null,
          key: it.key,
          display_name: it.display_name,
          value_type: it.value_type,
          sort_order: it.sort_order ?? 0,
          current: valuesByItem.get(it.id) ?? null,
        }),
      );

      const targetItem = args.contextItemId
        ? (items.find((it) => it.id === args.contextItemId) ?? null)
        : null;

      return ok({
        org: {
          id: orgRes.data.id,
          name: orgRes.data.name,
          slug: orgRes.data.slug,
        },
        scope_type: {
          id: scopeTypeRes.data.id,
          slug: scopeTypeRes.data.slug ?? null,
          label_singular: scopeTypeRes.data.label_singular,
          label_plural: scopeTypeRes.data.label_plural,
          icon: scopeTypeRes.data.icon ?? null,
          color: scopeTypeRes.data.color ?? null,
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
    ScopesRpcResult<{
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
      if (isScopesRpcErr(res)) return res;

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
  //  READ — TEMPLATES (read-only catalog)
  // ──────────────────────────────────────────────────────────────────

  async listTemplates(
    activeOnly = true,
  ): Promise<ScopesRpcResult<{ templates: ContextTemplate[] }>> {
    try {
      // VIEW LAW: public catalog by design — templates are a read-only, platform-wide catalog (see header above).
      // Read through the store's own templates door (reference data; lane SCOPES-READS-WEB). The door
      // answers the ACTIVE templates — the only ones any caller asks for (no caller passes false today).
      const res = await callContextDoor<StoreTemplateRow[]>("context_templates");
      if (!res.ok) return res;
      const data = (res.data ?? [])
        .filter((row) => !activeOnly || row.is_active !== false)
        .map((row) => ({
          ...row,
          template_scope_types: (row.scope_types ?? []).map((st) => ({
            ...st,
            template_context_items: st.fields ?? [],
          })),
        }))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      const templates: ContextTemplate[] = (data ?? []).map((row) => {
        const scopeTypes = row.template_scope_types ?? [];
        const labelById = new Map(
          scopeTypes.map((st) => [st.id, st.label_singular]),
        );
        const scope_types: TemplateScopeTypeDetail[] = scopeTypes
          .map((st) => ({
            id: st.id,
            key: st.key,
            icon: st.icon ?? "",
            label_singular: st.label_singular,
            label_plural: st.label_plural,
            sort_order: st.sort_order ?? 0,
            max_assignments_per_entity: st.max_assignments_per_entity ?? null,
            parent_template_type_id: st.parent_template_type_id ?? null,
            parent_type_label: st.parent_template_type_id
              ? (labelById.get(st.parent_template_type_id) ?? null)
              : null,
            fields: [...(st.template_context_items ?? [])]
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((f) => ({ key: f.key, display_name: f.display_name })),
          }))
          .sort((a, b) => a.sort_order - b.sort_order);
        const context_item_count = scope_types.reduce(
          (acc, st) => acc + st.fields.length,
          0,
        );
        return {
          id: row.id,
          key: row.key,
          name: row.name,
          description: row.description ?? "",
          category: row.category ?? "",
          icon: row.icon ?? "",
          is_active: !!row.is_active,
          audience: row.audience === "individual" ? "individual" : "organization",
          sort_order: row.sort_order ?? 0,
          scope_type_count: scope_types.length,
          context_item_count,
          scope_types,
        };
      });

      return ok({ templates });
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
  ): Promise<ScopesRpcResult<Array<{ id: string; name: string; type: string }>>> {
    try {
      requireUserId();
      const wanted = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
      if (wanted.length === 0) return ok([]);
      // The organization's live scopes, from the store's tree door; a name matches case-insensitively.
      const res = await readScopeTree([organizationId]);
      if (!res.ok) return res;
      const wantedLower = new Set(wanted.map((n) => n.toLowerCase()));
      const out: Array<{ id: string; name: string; type: string }> = [];
      for (const t of res.data.types) {
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
  ): Promise<ScopesRpcResult<{ scope_ids: string[] }>> {
    try {
      requireUserId();
      // A scope tag is an OUTGOING edge entity → ('scope', scopeId).
      const res = await associationsService.listForEntity(entityType, entityId);
      if (isScopesRpcErr(res)) return res;
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
  ): Promise<ScopesRpcResult<{ byEntity: Record<string, string[]> }>> {
    try {
      requireUserId();
      const res = await bulkEntityScopeIds(entityType, entityIds);
      if (isScopesRpcErr(res)) return res;
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
  ): Promise<ScopesRpcResult<{ scopes: ScopeWithType[] }>> {
    try {
      requireUserId();
      const assoc = await associationsService.listForEntity(
        entityType,
        entityId,
      );
      if (isScopesRpcErr(assoc)) return assoc;
      const ids = assoc.data.edges
        .filter((e) => e.direction === "outgoing" && e.otherType === "scope")
        .map((e) => e.otherId);
      if (ids.length === 0) return ok({ scopes: [] });

      const disp = await fetchScopeDisplays(ids);
      if (isScopesRpcErr(disp)) return disp;
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
  ): Promise<ScopesRpcResult<{ tags: EntityScopeTag[] }>> {
    try {
      requireUserId();
      const byEntity = await bulkEntityScopeIds(entityType, entityIds);
      if (isScopesRpcErr(byEntity)) return byEntity;

      const pairs = Object.entries(byEntity.data).flatMap(([entityId, scopeIds]) =>
        scopeIds.map((scopeId) => ({ entityId, scopeId })),
      );
      if (pairs.length === 0) return ok({ tags: [] });

      const disp = await fetchScopeDisplays(
        Array.from(new Set(pairs.map((p) => p.scopeId))),
      );
      if (isScopesRpcErr(disp)) return disp;
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

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — ENTITY ASSIGNMENTS (M2M tagging)
  //
  //  Set-semantics on the unified association edge via `assoc_set_targets`:
  //  one transaction that makes the entity's `scope` edges exactly equal
  //  `scopeIds` (adds missing, removes extras), org-checked inside the RPC.
  //  Replaced the legacy `set_entity_scopes` RPC (which wrote the dropped
  //  `ctx_scope_assignments` table). `assoc_set_targets` returns void, so we
  //  echo the deduped input as the authoritative post-state — it is exactly
  //  what the transaction just made true.
  //
  //  NOTE: the old RPC also enforced `max_assignments_per_entity`; the assoc
  //  layer does not. If that cap must hold, it belongs in `assoc_add`/
  //  `assoc_set_targets`, not re-implemented here.
  // ──────────────────────────────────────────────────────────────────

  async setEntityScopes(
    entityType: EntityTypeToken,
    entityId: string,
    scopeIds: string[],
  ): Promise<ScopesRpcResult<{ scope_ids: string[] }>> {
    try {
      requireUserId();
      const target = Array.from(new Set(scopeIds));

      const res = await associationsService.setTargets({
        sourceType: entityType,
        sourceId: entityId,
        targetType: "scope",
        targetIds: target,
      });
      if (isScopesRpcErr(res)) return res;

      return ok({ scope_ids: target });
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
  ): Promise<ScopesRpcResult<{ organization_id: string | null }>> {
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
      const scopeRes = await readScopesById([scopeIds[0]!]);
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
  ): Promise<ScopesRpcResult<{ types: ArchivedScopeTypeRow[] }>> {
    try {
      requireUserId();
      // The archived scope types and what each removal took with it, from the store's archive
      // (lane SCOPES-READS-WEB), so the disclosure states the consequence of a restore.
      const res = await readArchivedScopeTypes(orgId);
      if (!res.ok) return res;
      return ok({ types: res.data });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // updateContextItem retired (lane SCOPES-OLD-WRITERS, 2026-09-29): a context field is edited only
  // through the store's scope door, scopeStore.updateContextItem (custom.context_item_write), which
  // decides the RPC-or-column split from the patch exactly as this method did.

  // Value history operations — their RPCs do not exist yet; the surface
  // stays constant so callers compile today and light up when they ship.
  revertContextValue: notYetImplemented("revert_context_value"),
  deleteContextValue: notYetImplemented("delete_context_value"),

  /**
   * Reverse lookup over the `context_value_refs` index — every CURRENT
   * reference cell (across every org the caller belongs to) whose fence
   * contains an item of `refType` pointing at `refKey` (a file id, scope id,
   * URL, etc.). E.g. "which matters have this PDF as their QME Report?" via
   * `listReferencingValues("file", fileId)`. Backed by the
   * `list_context_value_refs` SECURITY DEFINER RPC (membership-checked
   * inside the function, so this never touches `context.context_value_refs`
   * directly).
   */
  async listReferencingValues(
    refType: string,
    refKey: string,
  ): Promise<ScopesRpcResult<ReferencingContextValue[]>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("list_context_value_refs", {
        p_ref_type: refType,
        p_ref_key: refKey,
      });
      if (error) return err(...mapPgErrorPair(error));
      const rows = Array.isArray(data) ? data : [];
      return ok(rows as unknown as ReferencingContextValue[]);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },
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
): Promise<ScopesRpcResult<Record<string, string[]>>> {
  const ids = Array.from(new Set(entityIds));
  if (ids.length === 0) return ok({});

  const res = await associationsService.listForSources(
    entityType,
    ids,
    "scope",
  );
  if (isScopesRpcErr(res)) return res;

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

async function fetchScopeDisplays(
  scopeIds: string[],
): Promise<ScopesRpcResult<ScopeWithType[]>> {
  if (scopeIds.length === 0) return ok([]);
  // By id, each scope in the organization it lives in, from the store (lane SCOPES-READS-WEB). A
  // removed scope, or one this person may not open, is absent — no tag anybody can still be shown.
  const res = await readScopesById(scopeIds);
  if (!res.ok) return res;
  return ok(
    res.data.map((row) => ({
      id: row.id,
      name: row.name ?? "",
      scope_type: row.scope_type ? scopeTypeDisplayFromStore(row.scope_type) : null,
    })),
  );
}

/** One template as the store's templates door answers it (the shape `listTemplates` maps). */
type StoreTemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string | null;
  icon: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  audience: string | null;
  scope_types?: Array<{
    id: string;
    key: string;
    icon: string | null;
    label_singular: string;
    label_plural: string;
    sort_order: number | null;
    max_assignments_per_entity: number | null;
    parent_template_type_id: string | null;
    fields?: Array<{ id: string; key: string; display_name: string; sort_order: number | null }>;
  }>;
};

function notYetImplemented(name: string) {
  return async (..._args: unknown[]): Promise<ScopesRpcResult<never>> =>
    err(
      "internal",
      `scopesService.${name} is not yet implemented — waiting on the Python RPC. See /Users/armanisadeghi/code/common-docs/systems/scopes-context/HANDOFF.md.`,
    );
}
