import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { writeOne, writeOneRow } from "@/utils/supabase/writeOne";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { sklActions } from "./slice";
import { extractErrorMessage } from "@/utils/errors";
import {
  rowToShortcutCategory,
  rowToSklRenderDefinition,
  sklRenderDefinitionToInsert,
  sklRenderDefinitionToUpdate,
} from "./converters";
import type { Scope } from "../../types";
import type { SklRenderDefinition } from "./types";

import { getClaimsUser } from "@/utils/supabase/claimsUser";
// NOTE — May 2026: skill-definition + category thunks moved to
// `features/skills/redux/skillsThunks.ts` (Supabase direct + Python
// admin endpoints). Render-blocks + resources stay here until they
// migrate.

// ─── Scope filter builder ────────────────────────────────────────────────────

interface ScopedQueryArgs {
  scope: Scope;
  scopeId: string | null;
}

/**
 * The scope filter on a Supabase select against platform.categories / skill.render_definition.
 *
 * READS IGNORE THE ACTIVE ORGANIZATION (law: common-docs/policies/access-ladder.md).
 * The window's "Organization" view scope resolves to the ACTIVE organization for WRITES
 * (`stampScopeForWrite` — where a new block is filed); it must never narrow what is listed, or
 * definitions in the person's other organizations vanish. So no scope narrows a read: RLS plus
 * `deleted_at IS NULL` / dimension='shortcut' are the whole boundary, exactly as for every list.
 * (user_id / project_id / task_id live in the metadata jsonb and were never filterable here.)
 */
function applyScopeFilter<Q extends { eq: Function; is: Function }>(
  query: Q,
  _args: ScopedQueryArgs | void,
  _userId: string | null,
): Q {
  return query;
}

/**
 * Stamp scope fields onto a write payload so the row is created in the caller's
 * current scope. Belt-and-suspenders: RLS would catch cross-scope writes too,
 * but enforcing here means the UI can't accidentally write with the wrong
 * ownership even if the draft object was built from stale state.
 */
interface ScopeStampInput {
  user_id?: string | null;
  organization_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
}

async function stampScopeForWrite<T extends ScopeStampInput>(
  payload: T,
  args: ScopedQueryArgs,
): Promise<T & { organization_id: string }> {
  const { data: userData } = await getClaimsUser(supabase);
  const userId = userData?.user?.id ?? null;
  const stamped: T & { organization_id: string } = {
    ...payload,
    organization_id: payload.organization_id ?? "",
  };
  if (args.scope === "user") {
    stamped.user_id = userId;
    stamped.project_id = null;
    stamped.task_id = null;
  } else if (args.scope === "organization") {
    stamped.user_id = userId;
    stamped.organization_id = args.scopeId ?? "";
    stamped.project_id = null;
    stamped.task_id = null;
  } else if (args.scope === "project") {
    stamped.user_id = userId;
    stamped.project_id = args.scopeId;
    stamped.task_id = null;
  } else if (args.scope === "task") {
    stamped.user_id = userId;
    stamped.task_id = args.scopeId;
  }
  // organization_id is NOT NULL on canonical tables — never stamp a null org.
  // User-scoped rows live in the user's personal org; org-scoped rows keep the
  // chosen org; project/task-scoped rows fall back to the personal org until
  // scope-adoption assigns the scope's org.
  if (!stamped.organization_id) {
    // org-filter: write-target writes into the organization the person is working in; no list reads it
    stamped.organization_id = await ensureOrgId(undefined);
  }
  return stamped;
}

// ─── Render Definitions ─────────────────────────────────────────────────────

export const fetchRenderDefinitions = createAsyncThunk(
  "skl/fetchRenderDefinitions",
  // Reads span everything the person can see; the scope args are accepted and ignored.
  async (args: ScopedQueryArgs | void, { dispatch }) => {
    dispatch(sklActions.renderDefinitionsLoading());
    try {
      const { data: userData } = await getClaimsUser(supabase);
      const userId = userData?.user?.id ?? null;
      let query = supabase
        .schema("skill")
        .from("render_definition")
        .select("*")
        .is("deleted_at", null)
        // VIEW LAW: scope applied immediately below via applyScopeFilter (user/org/task)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      query = applyScopeFilter(query, args, userId);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []).map(rowToSklRenderDefinition);
      dispatch(sklActions.renderDefinitionsReceived(rows));
      return rows;
    } catch (err) {
      const msg = extractErrorMessage(err);
      dispatch(sklActions.renderDefinitionsError(msg));
      throw err;
    }
  },
);

export const createRenderDefinition = createAsyncThunk(
  "skl/createRenderDefinition",
  async (
    args: {
      draft: Partial<SklRenderDefinition> &
        Pick<
          SklRenderDefinition,
          "blockId" | "label" | "iconName" | "template"
        >;
      scope: Scope;
      scopeId: string | null;
    },
    { dispatch },
  ) => {
    const payload = sklRenderDefinitionToInsert(args.draft);
    const stamped = await stampScopeForWrite(payload, {
      scope: args.scope,
      scopeId: args.scopeId,
    });
    const { data, error } = await supabase
      .schema("skill")
      .from("render_definition")
      .insert(stamped)
      .select()
      .single();
    if (error) throw error;
    const row = rowToSklRenderDefinition(data);
    dispatch(sklActions.renderDefinitionUpserted(row));
    return row;
  },
);

export const updateRenderDefinition = createAsyncThunk(
  "skl/updateRenderDefinition",
  async (
    args: { id: string; patch: Partial<SklRenderDefinition> },
    { dispatch },
  ) => {
    const payload = sklRenderDefinitionToUpdate(args.patch);
    const { data, error } = await writeOneRow(
      supabase
        .schema("skill")
        .from("render_definition")
        .update(payload)
        .eq("id", args.id)
        .select(),
      { action: "update", noun: "render definition" },
    );
    if (error) throw error;
    const row = rowToSklRenderDefinition(data);
    dispatch(sklActions.renderDefinitionUpserted(row));
    return row;
  },
);

export const deleteRenderDefinition = createAsyncThunk(
  "skl/deleteRenderDefinition",
  async (args: { id: string }, { dispatch }) => {
    // Soft delete, never a hard one (owner ruling 2026-09-20; db-rules §8):
    // `fetchRenderDefinitions` already filters `deleted_at`.
    await writeOne(
      supabase
        .schema("skill").from("render_definition")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", args.id)
        .is("deleted_at", null)
        .select("id, deleted_at"),
      {
        action: "delete",
        noun: "render block",
        alreadyDone: {
          reread: () =>
            supabase
              .schema("skill").from("render_definition")
              .select("id, deleted_at")
              .eq("id", args.id)
              .maybeSingle(),
          isDone: (row) => row.deleted_at != null,
        },
      },
    );
    dispatch(sklActions.renderDefinitionRemoved(args.id));
    return args.id;
  },
);

// ─── Render-block categories (shortcut_categories) ─────────────────────────

export const fetchRenderBlockCategories = createAsyncThunk(
  "skl/fetchRenderBlockCategories",
  // Reads span everything the person can see; the scope args are accepted and ignored.
  async (args: ScopedQueryArgs | void, { dispatch }) => {
    dispatch(sklActions.renderBlockCategoriesLoading());
    try {
      const { data: userData } = await getClaimsUser(supabase);
      const userId = userData?.user?.id ?? null;
      let query = supabase
        .schema("platform")
        .from("categories")
        // user_id / project_id / task_id moved into metadata in platform.categories;
        // they are not top-level columns. Scope filtering below falls back to
        // organization_id (the only surviving top-level scope column). The metadata
        // equivalents are not used for scoping at query time — RLS + dimension filter
        // is sufficient for this read.
        // Plain select("*") — the aliased json (`->>`) select triggered a
        // TS2589 (excessively-deep inference) after the schema regen. The raw
        // platform.categories row is mapped by rowToShortcutCategory instead
        // (name→label, metadata.description, position→sort_order, …).
        .select("*")
        .eq("dimension", "shortcut")
        .order("position", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      query = applyScopeFilter(query, args, userId);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []).map(rowToShortcutCategory);
      dispatch(sklActions.renderBlockCategoriesReceived(rows));
      return rows;
    } catch (err) {
      const msg = extractErrorMessage(err);
      dispatch(sklActions.renderBlockCategoriesError(msg));
      throw err;
    }
  },
);

// ─── Resources ──────────────────────────────────────────────────────────────
// Retired 2026-07-06: the bespoke skill.resource table is gone. A skill's
// resources are now code_files/notes attached via platform.associations —
// managed in features/skills/redux/skillsThunks.ts (createSkillResourceThunk
// et al.). No thunks here read skill.resource anymore.
