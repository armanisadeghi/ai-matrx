// features/scopes/service/scopesService.ts
//
// THE SOLE CHOKEPOINT for all ctx_* Supabase access from frontend code.
//
// Every read and write of ctx_scope_types, ctx_scopes, ctx_context_items,
// ctx_context_item_values, ctx_templates, ctx_template_scope_types,
// ctx_template_context_items, ctx_context_access_log goes through this file.
// No other file is allowed to query these tables. ESLint rule
// `no-restricted-syntax` enforces the chokepoint at the lint boundary; the
// boy-scout rule applies if you find a violation.
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
// Spec: features/scopes/docs/RPC_CONTRACTS.md — when the Python team ships
// the proposed RPC family (get_user_scope_tree_with_projects, resolve_*,
// apply_template, etc.), the implementation of each method below swaps to
// a single supabase.rpc(...) call. Method signatures and return shapes
// stay constant — that's the whole point of the chokepoint.
//
// For now, the read methods query ctx_* tables directly. Mutation methods
// that have no safe direct-query path return a structured `internal` error
// until the Python team ships the corresponding RPC.

"use client";

import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { requireUserId } from "@/utils/auth/getUserId";
import { associationsService } from "@/features/scopes/service/associationsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type {
  ContextItemRow,
  ContextItemValue,
  ContextTemplate,
  OrgNode,
  ProjectNode,
  ResolvedSuggestionItem,
  ResolvedSuggestionTarget,
  ResolvedSuggestionValue,
  EntityType,
  ScopeNode,
  ScopeTreeResponse,
  ScopeTypeNode,
  ScopesRpcError,
  ScopesRpcResult,
  ScopeWithType,
  SetContextValuePayload,
  SetContextValueResult,
  TaskBucketLevel,
  TaskNode,
} from "@/features/scopes/types";

// One denormalized scope row for tags: which entity, which scope, plus the
// scope's name and its type's singular label (sidebar grouping).
export interface EntityScopeTag {
  entity_id: string;
  scope_id: string;
  scope_name: string;
  scope_type: string;
}

// ─── helpers ────────────────────────────────────────────────────────

function err(
  code: ScopesRpcError["code"],
  message: string,
  detail?: unknown,
): { ok: false; error: ScopesRpcError } {
  return { ok: false, error: { code, message, detail } };
}

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

function mapPgError(e: unknown): ScopesRpcError {
  // Loud before lossy: the friendly mapping below discards the PG error
  // code / constraint / hint that production debugging needs. Log the raw
  // error with full context HERE — the single funnel every ctx_* failure
  // passes through — so "my scope didn't save" is diagnosable from the
  // console instead of vanishing into a generic message.
  console.error("[scopesService] supabase error", e);
  if (e && typeof e === "object" && "code" in e) {
    const code = String((e as { code: string }).code);
    if (code === "PGRST116") return { code: "not_found", message: "Not found" };
    if (code === "42501")
      return { code: "forbidden_org", message: "Permission denied" };
  }
  const message =
    e instanceof Error ? e.message : "Unexpected error talking to Supabase";
  return { code: "internal", message, detail: e };
}

// ─── service ────────────────────────────────────────────────────────

export const scopesService = {
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
  async getScopeTree(): Promise<ScopesRpcResult<ScopeTreeResponse>> {
    try {
      const userId = requireUserId();

      // NOTE: `organization_members` has a permissive SELECT RLS policy
      // (`true`) so any member of an org can read every other member row
      // for that org. We MUST filter by user_id explicitly — without
      // this, the join below produces one row per (user, org) member
      // pair, duplicating each org in the result.
      const orgsP = supabase
        .from("organization_members")
        .select(
          `role,
           organizations!inner ( id, name, slug, is_personal )`,
        )
        .eq("user_id", userId)
        .returns<
          Array<{
            role: string;
            organizations: {
              id: string;
              name: string;
              slug: string;
              is_personal: boolean | null;
            };
          }>
        >();

      const scopeTypesP = supabase
        .from("ctx_scope_types")
        .select(
          `id, organization_id, label_singular, label_plural, icon, color,
           max_assignments_per_entity, sort_order, parent_type_id,
           default_variable_keys`,
        )
        .order("sort_order", { ascending: true });

      const scopesP = supabase
        .from("ctx_scopes")
        .select(
          `id, scope_type_id, organization_id, name, description,
           parent_scope_id, settings`,
        )
        .order("name", { ascending: true });

      const projectsP = workspaceDb(supabase)
        .from("projects")
        .select("id, organization_id, name, slug")
        .order("name", { ascending: true });

      const [orgsRes, scopeTypesRes, scopesRes, projectsRes] =
        await Promise.all([orgsP, scopeTypesP, scopesP, projectsP]);

      if (orgsRes.error) return err(...mapPgErrorPair(orgsRes.error));
      if (scopeTypesRes.error)
        return err(...mapPgErrorPair(scopeTypesRes.error));
      if (scopesRes.error) return err(...mapPgErrorPair(scopesRes.error));
      if (projectsRes.error) return err(...mapPgErrorPair(projectsRes.error));

      // Index scopes by scope_type_id for fast nesting.
      const scopesByType = new Map<string, ScopeNode[]>();
      for (const s of scopesRes.data ?? []) {
        const list = scopesByType.get(s.scope_type_id) ?? [];
        list.push(s as ScopeNode);
        scopesByType.set(s.scope_type_id, list);
      }

      // Build per-project scope_id list from the unified association edge:
      // every edge INCOMING to one of these scopes whose source is a project.
      // (`assoc_for_targets` is the batch-by-target read; we filter the
      // project sources client-side.)
      const projectScopes = new Map<string, string[]>();
      const scopeIds = (scopesRes.data ?? []).map((s) => s.id);
      if (scopeIds.length > 0) {
        const assocRes = await associationsService.listForTargets(
          "scope",
          scopeIds,
        );
        if (isScopesRpcErr(assocRes)) return assocRes;
        for (const edge of assocRes.data.edges) {
          if (edge.sourceType !== "project") continue;
          const list = projectScopes.get(edge.sourceId) ?? [];
          list.push(edge.targetId);
          projectScopes.set(edge.sourceId, list);
        }
      }

      // Group scope_types and projects per org.
      const scopeTypesByOrg = new Map<string, ScopeTypeNode[]>();
      for (const t of scopeTypesRes.data ?? []) {
        const node: ScopeTypeNode = {
          ...t,
          scopes: scopesByType.get(t.id) ?? [],
        };
        const list = scopeTypesByOrg.get(t.organization_id) ?? [];
        list.push(node);
        scopeTypesByOrg.set(t.organization_id, list);
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

      const organizations: OrgNode[] = (orgsRes.data ?? []).map((row) => ({
        id: row.organizations.id,
        name: row.organizations.name,
        slug: row.organizations.slug,
        is_personal: !!row.organizations.is_personal,
        // organization_members.role is NOT NULL — no fallback needed.
        role: row.role as OrgNode["role"],
        scope_types: scopeTypesByOrg.get(row.organizations.id) ?? [],
        projects: projectsByOrg.get(row.organizations.id) ?? [],
      }));

      // Stable ordering: personal first, then alpha.
      organizations.sort((a, b) => {
        if (a.is_personal !== b.is_personal) return a.is_personal ? -1 : 1;
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
        const { data, error } = await workspaceDb(supabase)
          .from("tasks")
          .select("id")
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

      const { data: taskRows, error: taskErr } = await workspaceDb(supabase)
        .from("tasks")
        .select("id, title, status, project_id, organization_id, updated_at")
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

      const { data: projectRows, error: projErr } = await workspaceDb(supabase)
        .from("projects")
        .select("id, organization_id, name, slug")
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
      const { data, error } = await supabase
        .from("ctx_context_items")
        .select("*")
        .eq("scope_type_id", scopeTypeId)
        .eq("is_active", true);
      if (error) return err(...mapPgErrorPair(error));
      return ok({ items: data ?? [] });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  async listContextValues(
    scopeId: string,
  ): Promise<ScopesRpcResult<{ values: ContextItemValue[] }>> {
    try {
      requireUserId();
      const { data, error } = await supabase
        .from("ctx_context_item_values")
        .select(
          `context_item_id, id, version, is_current,
           value_text, value_number, value_boolean, value_date, value_json,
           value_document_url, value_document_size_bytes,
           value_reference_id, value_reference_type,
           source_type, authored_by, created_at`,
        )
        .eq("scope_id", scopeId)
        .eq("is_current", true);
      if (error) return err(...mapPgErrorPair(error));
      return ok({ values: (data ?? []) as ContextItemValue[] });
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

      const { data: scope, error: scopeErr } = await supabase
        .from("ctx_scopes")
        .select("id, slug, name, description, scope_type_id, organization_id")
        .eq("id", args.scopeId)
        .single();
      if (scopeErr) return err(...mapPgErrorPair(scopeErr));
      if (!scope) return err("not_found", "Scope not found");

      const scopeTypeP = supabase
        .from("ctx_scope_types")
        .select("id, slug, label_singular, label_plural, icon, color")
        .eq("id", scope.scope_type_id)
        .single();

      const orgP = supabase
        .from("organizations")
        .select("id, name, slug, is_personal")
        .eq("id", scope.organization_id)
        .single();

      const itemsP = supabase
        .from("ctx_context_items")
        .select("id, slug, key, display_name, value_type, sort_order")
        .eq("scope_type_id", scope.scope_type_id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      const valuesP = supabase
        .from("ctx_context_item_values")
        .select(
          "context_item_id, value_text, value_number, value_boolean, value_json, source_type, version, created_at",
        )
        .eq("scope_id", args.scopeId)
        .eq("is_current", true);

      const [scopeTypeRes, orgRes, itemsRes, valuesRes] = await Promise.all([
        scopeTypeP,
        orgP,
        itemsP,
        valuesP,
      ]);

      if (scopeTypeRes.error) return err(...mapPgErrorPair(scopeTypeRes.error));
      if (orgRes.error) return err(...mapPgErrorPair(orgRes.error));
      if (itemsRes.error) return err(...mapPgErrorPair(itemsRes.error));
      if (valuesRes.error) return err(...mapPgErrorPair(valuesRes.error));

      const valuesByItem = new Map<string, ResolvedSuggestionValue>();
      for (const v of valuesRes.data ?? []) {
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
          is_personal: !!orgRes.data.is_personal,
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
          name: scope.name,
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
      const query = supabase
        .from("ctx_templates")
        .select(
          `id, key, name, description, category, icon, is_active, sort_order,
           ctx_template_scope_types ( id, ctx_template_context_items ( id ) )`,
        )
        .order("sort_order", { ascending: true });

      const { data, error } = activeOnly
        ? await query.eq("is_active", true)
        : await query;
      if (error) return err(...mapPgErrorPair(error));

      const templates: ContextTemplate[] = (data ?? []).map((row) => {
        const scopeTypes = (row.ctx_template_scope_types ?? []) as Array<{
          id: string;
          ctx_template_context_items: Array<{ id: string }>;
        }>;
        const scope_type_count = scopeTypes.length;
        const context_item_count = scopeTypes.reduce(
          (acc, st) => acc + (st.ctx_template_context_items?.length ?? 0),
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
          sort_order: row.sort_order ?? 0,
          scope_type_count,
          context_item_count,
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

  async getEntityScopes(
    entityType: EntityType,
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
  //  ctx_scopes / ctx_scope_types themselves (this file owns those tables).
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
  //  READ — ALL TAGS FOR AN ENTITY TYPE, DENORMALIZED (sidebar grouping)
  //
  //  Every scope tag across every entity of `entityType`, flattened with
  //  scope name + type label. Powers list/sidebar grouping (e.g. the notes
  //  "by scope" view). Reads all visible scopes (RLS-scoped) for their
  //  display fields, then folds the INCOMING `scope` edges from sources of
  //  this type via `assoc_for_targets`. One scopes query + one assoc RPC.
  // ──────────────────────────────────────────────────────────────────

  async listEntityScopeTags(
    entityType: EntityType,
  ): Promise<ScopesRpcResult<{ tags: EntityScopeTag[] }>> {
    try {
      requireUserId();
      const disp = await fetchScopeDisplays(null);
      if (isScopesRpcErr(disp)) return disp;

      const byId = new Map(disp.data.map((s) => [s.id, s]));
      const scopeIds = disp.data.map((s) => s.id);
      if (scopeIds.length === 0) return ok({ tags: [] });

      const assoc = await associationsService.listForTargets("scope", scopeIds);
      if (isScopesRpcErr(assoc)) return assoc;

      const tags: EntityScopeTag[] = assoc.data.edges
        .filter((e) => e.sourceType === entityType)
        .map((e) => {
          const s = byId.get(e.targetId);
          return {
            entity_id: e.sourceId,
            scope_id: e.targetId,
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
    entityType: EntityType,
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
    // Workspace-schema table names (project/task moved to `workspace`). Consumed
    // below via `workspaceDb(supabase).from(table)`.
    const ENTITY_ORG_TABLE: Partial<Record<EntityType, string>> = {
      project: "projects",
      task: "tasks",
    };
    try {
      const table = ENTITY_ORG_TABLE[entityType];
      if (!table || scopeIds.length === 0) return ok({ organization_id: null });

      // The org of the first assigned scope (scopes carry organization_id).
      const { data: scopeRow, error: sErr } = await supabase
        .from("ctx_scopes")
        .select("organization_id")
        .eq("id", scopeIds[0])
        .maybeSingle();
      if (sErr) return err(...mapPgErrorPair(sErr));
      const orgId =
        (scopeRow as { organization_id?: string | null } | null)
          ?.organization_id ?? null;
      if (!orgId) return ok({ organization_id: null });

      // Adopt ONLY when the container currently has no org (DB-enforced).
      // project/task live in the `workspace` schema — reach them via workspaceDb.
      const { data: updated, error: uErr } = await workspaceDb(supabase)
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
  //  WRITE — placeholders for Phase 4+ mutation paths.
  //  Each returns `internal` until the corresponding RPC ships and the
  //  implementation here is filled in. Surface stays constant.
  // ──────────────────────────────────────────────────────────────────

  createScopeType: notYetImplemented("create_scope_type"),
  updateScopeType: notYetImplemented("update_scope_type"),
  deleteScopeType: notYetImplemented("delete_scope_type"),

  createScope: notYetImplemented("create_scope"),
  updateScope: notYetImplemented("update_scope"),
  deleteScope: notYetImplemented("delete_scope"),

  createContextItem: notYetImplemented("create_context_item"),
  updateContextItem: notYetImplemented("update_context_item"),
  deleteContextItem: notYetImplemented("delete_context_item"),

  /**
   * Write a value into a scope cell via the `set_context_value` SECURITY
   * DEFINER RPC — the only sanctioned mutation path for
   * `ctx_context_item_values` (atomic version-flip-then-insert, scope
   * write-access checked inside the function). `auth.uid()` is the live user
   * when called from the FE, so we never pass `acting_user_id`. Defaults
   * `source_type` to `ai_enriched` (the RPC also defaults it, but we make the
   * common KG-suggestion intent explicit).
   */
  async setContextValue(
    payload: SetContextValuePayload,
  ): Promise<ScopesRpcResult<SetContextValueResult>> {
    try {
      requireUserId();
      const { data, error } = await supabase.rpc("set_context_value", {
        p_payload: {
          source_type: "ai_enriched",
          ...payload,
        } as never,
      });
      if (error) return err(...mapPgErrorPair(error));

      // `set_context_value` returns `Json` (i.e. `unknown`) in the generated
      // types, so decode through a single optional-field shape rather than a
      // discriminated union (the latter doesn't narrow off an `unknown` cast).
      const envelope = data as {
        ok?: boolean;
        data?: SetContextValueResult;
        error?: { code?: string; message?: string };
      } | null;

      if (!envelope || typeof envelope !== "object") {
        return err("internal", "set_context_value returned no result");
      }
      if (!envelope.ok) {
        const code = envelope.error?.code;
        const mapped: ScopesRpcError["code"] =
          code === "unauthorized"
            ? "unauthorized"
            : code === "forbidden_org"
              ? "forbidden_org"
              : code === "not_found"
                ? "not_found"
                : code === "invalid_argument"
                  ? "invalid_argument"
                  : "internal";
        return err(mapped, envelope.error?.message ?? "Could not set value");
      }
      return ok(envelope.data as SetContextValueResult);
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  revertContextValue: notYetImplemented("revert_context_value"),
  deleteContextValue: notYetImplemented("delete_context_value"),

  applyTemplate: notYetImplemented("apply_template"),
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
// The one place ctx_scopes ⋈ ctx_scope_types is read for presentation. Pass
// scope ids to resolve a specific set, or `null` for every scope the caller
// can see (RLS-scoped). Used by getEntityScopeDetails / listEntityScopeTags.

async function fetchScopeDisplays(
  scopeIds: string[] | null,
): Promise<ScopesRpcResult<ScopeWithType[]>> {
  if (scopeIds && scopeIds.length === 0) return ok([]);
  const base = supabase
    .from("ctx_scopes")
    .select(
      "id, name, scope_type:ctx_scope_types(id, label_singular, label_plural, icon, color)",
    );
  const { data, error } = scopeIds ? await base.in("id", scopeIds) : await base;
  if (error) return err(...mapPgErrorPair(error));
  return ok((data ?? []) as unknown as ScopeWithType[]);
}

// ─── internal: paired return for err() to satisfy TS tuple unpacking ────

function mapPgErrorPair(e: unknown): [ScopesRpcError["code"], string, unknown] {
  const mapped = mapPgError(e);
  return [mapped.code, mapped.message, mapped.detail];
}

function notYetImplemented(name: string) {
  return async (..._args: unknown[]): Promise<ScopesRpcResult<never>> =>
    err(
      "internal",
      `scopesService.${name} is not yet implemented — waiting on the Python RPC. See features/scopes/docs/RPC_CONTRACTS.md.`,
    );
}
