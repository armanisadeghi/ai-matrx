// features/scopes/service/scopesService.ts
//
// THE SOLE CHOKEPOINT for all ctx_* Supabase access from frontend code.
//
// Every read and write of ctx_scope_types, ctx_scopes, ctx_context_items,
// ctx_context_item_values, ctx_scope_assignments, ctx_templates,
// ctx_template_scope_types, ctx_template_context_items, ctx_context_access_log
// goes through this file. No other file is allowed to query these tables.
// ESLint rule `no-restricted-syntax` enforces the chokepoint at the lint
// boundary; the boy-scout rule applies if you find a violation.
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
import { requireUserId } from "@/utils/auth/getUserId";
import type {
  ContextItemRow,
  ContextItemValue,
  ContextTemplate,
  OrgNode,
  ProjectNode,
  ScopeAssignmentEntityType,
  ScopeNode,
  ScopeTreeResponse,
  ScopeTypeNode,
  ScopesRpcError,
  ScopesRpcResult,
  TaskBucketLevel,
  TaskNode,
} from "@/features/scopes/types";

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
   * Personal projects (organization_id IS NULL) are not yet synthesised
   * into a virtual Personal org here — that contract belongs to the
   * future `get_user_scope_tree_with_projects` RPC. The legacy
   * `hierarchyService.fetchFullContext()` continues to handle the
   * pseudo-org sentinel until Phase 5 removes it.
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

      const projectsP = supabase
        .from("ctx_projects")
        .select("id, organization_id, name, slug")
        .order("name", { ascending: true });

      const assignmentsP = supabase
        .from("ctx_scope_assignments")
        .select("entity_id, entity_type, scope_id")
        .eq("entity_type", "project");

      const [orgsRes, scopeTypesRes, scopesRes, projectsRes, assignmentsRes] =
        await Promise.all([
          orgsP,
          scopeTypesP,
          scopesP,
          projectsP,
          assignmentsP,
        ]);

      if (orgsRes.error) return err(...mapPgErrorPair(orgsRes.error));
      if (scopeTypesRes.error)
        return err(...mapPgErrorPair(scopeTypesRes.error));
      if (scopesRes.error) return err(...mapPgErrorPair(scopesRes.error));
      if (projectsRes.error) return err(...mapPgErrorPair(projectsRes.error));
      if (assignmentsRes.error)
        return err(...mapPgErrorPair(assignmentsRes.error));

      // Index scopes by scope_type_id for fast nesting.
      const scopesByType = new Map<string, ScopeNode[]>();
      for (const s of scopesRes.data ?? []) {
        const list = scopesByType.get(s.scope_type_id) ?? [];
        list.push(s as ScopeNode);
        scopesByType.set(s.scope_type_id, list);
      }

      // Build per-project scope_id list.
      const projectScopes = new Map<string, string[]>();
      for (const a of assignmentsRes.data ?? []) {
        const list = projectScopes.get(a.entity_id) ?? [];
        list.push(a.scope_id);
        projectScopes.set(a.entity_id, list);
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
        if (!p.organization_id) continue; // personal projects: future Personal pseudo-org
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
        role: (row.role as OrgNode["role"]) ?? "viewer",
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
        const { data, error } = await supabase
          .from("ctx_tasks")
          .select("id")
          .eq("project_id", id);
        if (error) return err(...mapPgErrorPair(error));
        taskIds = (data ?? []).map((row) => row.id);
      } else if (level === "scope") {
        const { data, error } = await supabase
          .from("ctx_scope_assignments")
          .select("entity_id")
          .eq("entity_type", "task")
          .eq("scope_id", id);
        if (error) return err(...mapPgErrorPair(error));
        taskIds = (data ?? []).map((row) => row.entity_id);
      } else {
        // org-level: tasks belonging to projects under this org, OR tasks
        // tagged directly with no project. Defer to future RPC for correctness.
        return ok({ tasks: [] });
      }

      if (taskIds.length === 0) return ok({ tasks: [] });

      const { data: taskRows, error: taskErr } = await supabase
        .from("ctx_tasks")
        .select("id, title, status, project_id, organization_id, updated_at")
        .in("id", taskIds);
      if (taskErr) return err(...mapPgErrorPair(taskErr));

      const { data: tagRows, error: tagErr } = await supabase
        .from("ctx_scope_assignments")
        .select("entity_id, scope_id")
        .eq("entity_type", "task")
        .in("entity_id", taskIds);
      if (tagErr) return err(...mapPgErrorPair(tagErr));

      const tagsByEntity = new Map<string, string[]>();
      for (const row of tagRows ?? []) {
        const list = tagsByEntity.get(row.entity_id) ?? [];
        list.push(row.scope_id);
        tagsByEntity.set(row.entity_id, list);
      }

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

      const { data: projectRows, error: projErr } = await supabase
        .from("ctx_projects")
        .select("id, organization_id, name, slug")
        .eq("organization_id", orgId);
      if (projErr) return err(...mapPgErrorPair(projErr));

      const ids = (projectRows ?? []).map((r) => r.id);
      if (ids.length === 0) return ok({ projects: [] });

      const { data: tagRows, error: tagErr } = await supabase
        .from("ctx_scope_assignments")
        .select("entity_id")
        .eq("entity_type", "project")
        .in("entity_id", ids);
      if (tagErr) return err(...mapPgErrorPair(tagErr));

      const tagged = new Set((tagRows ?? []).map((r) => r.entity_id));
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
           value_text, value_number, value_boolean, value_json,
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
  //  READ — ENTITIES BY SCOPE (reverse direction)
  //
  //  Given a set of scope_ids, return the entity ids that are tagged
  //  with ANY (`match_all: false`) or ALL (`match_all: true`) of them.
  //  Used by sidebar/list filters in notes, tasks, agents, etc. — when
  //  the user selects active scopes globally and wants the surrounding
  //  list filtered to just the entities tagged with those scopes.
  //
  //  Eventually swaps to a single `list_entities_by_scopes` RPC; today
  //  the chokepoint reads `ctx_scope_assignments` directly so consumers
  //  can be migrated off the legacy slice immediately. The legacy
  //  scopeAssignmentsSlice talks to a `list_entities_by_scopes` SQL
  //  function that does ANY/ALL filtering with one round-trip; once
  //  that ships everywhere we replace the inline filter below with
  //  `supabase.rpc("list_entities_by_scopes", ...)`.
  // ──────────────────────────────────────────────────────────────────

  async listEntitiesByScopes(args: {
    scope_ids: string[];
    entity_type?: ScopeAssignmentEntityType;
    match_all?: boolean;
  }): Promise<
    ScopesRpcResult<{
      entities: Array<{
        entity_type: ScopeAssignmentEntityType;
        entity_id: string;
      }>;
    }>
  > {
    try {
      requireUserId();
      if (args.scope_ids.length === 0) return ok({ entities: [] });

      const query = supabase
        .from("ctx_scope_assignments")
        .select("entity_type, entity_id, scope_id")
        .in("scope_id", args.scope_ids);
      const { data, error } = args.entity_type
        ? await query.eq("entity_type", args.entity_type)
        : await query;
      if (error) return err(...mapPgErrorPair(error));

      // Fold rows into a map: { [entityKey]: Set<scope_id> }.
      const matches = new Map<
        string,
        {
          entity_type: ScopeAssignmentEntityType;
          entity_id: string;
          hits: Set<string>;
        }
      >();
      for (const row of data ?? []) {
        const key = `${row.entity_type}:${row.entity_id}`;
        const entry = matches.get(key);
        if (entry) {
          entry.hits.add(row.scope_id);
        } else {
          matches.set(key, {
            entity_type: row.entity_type as ScopeAssignmentEntityType,
            entity_id: row.entity_id,
            hits: new Set([row.scope_id]),
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
    entityType: ScopeAssignmentEntityType,
    entityId: string,
  ): Promise<ScopesRpcResult<{ scope_ids: string[] }>> {
    try {
      requireUserId();
      const { data, error } = await supabase
        .from("ctx_scope_assignments")
        .select("scope_id")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);
      if (error) return err(...mapPgErrorPair(error));
      return ok({ scope_ids: (data ?? []).map((r) => r.scope_id) });
    } catch (e) {
      return { ok: false, error: mapPgError(e) };
    }
  },

  // ──────────────────────────────────────────────────────────────────
  //  WRITE — ENTITY ASSIGNMENTS (M2M tagging)
  //
  //  This is the ONE mutation Phase 1 wires up because every entity-tagging
  //  consumer in Phases 2-5 depends on it. Set-semantics: replaces the
  //  entity's assignment list atomically with the input.
  // ──────────────────────────────────────────────────────────────────

  async setEntityScopes(
    entityType: ScopeAssignmentEntityType,
    entityId: string,
    scopeIds: string[],
  ): Promise<ScopesRpcResult<{ scope_ids: string[] }>> {
    try {
      const userId = requireUserId();
      const target = Array.from(new Set(scopeIds));

      const { data: existingRows, error: readErr } = await supabase
        .from("ctx_scope_assignments")
        .select("scope_id")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);
      if (readErr) return err(...mapPgErrorPair(readErr));

      const existing = new Set((existingRows ?? []).map((r) => r.scope_id));
      const targetSet = new Set(target);
      const toAdd = target.filter((s) => !existing.has(s));
      const toRemove = (existingRows ?? [])
        .map((r) => r.scope_id)
        .filter((s) => !targetSet.has(s));

      if (toAdd.length > 0) {
        const { error: insErr } = await supabase
          .from("ctx_scope_assignments")
          .insert(
            toAdd.map((scope_id) => ({
              entity_type: entityType,
              entity_id: entityId,
              scope_id,
              created_by: userId,
            })),
          );
        if (insErr) return err(...mapPgErrorPair(insErr));
      }

      if (toRemove.length > 0) {
        const { error: delErr } = await supabase
          .from("ctx_scope_assignments")
          .delete()
          .eq("entity_type", entityType)
          .eq("entity_id", entityId)
          .in("scope_id", toRemove);
        if (delErr) return err(...mapPgErrorPair(delErr));
      }

      return ok({ scope_ids: target });
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

  setContextValue: notYetImplemented("set_context_value"),
  revertContextValue: notYetImplemented("revert_context_value"),
  deleteContextValue: notYetImplemented("delete_context_value"),

  applyTemplate: notYetImplemented("apply_template"),
};

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
