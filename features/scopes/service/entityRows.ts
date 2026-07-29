// features/scopes/service/entityRows.ts
//
// Generic CREATE + RENAME for a registered entity's backing row, keyed by
// token — the WRITE-side sibling of associationCandidates (list) and
// entityTitles (display). The registry supplies everything: schema/table from
// the generated metadata, `titleColumn` for the name, `ownerColumn`/`orgColumn`
// by convention. NO per-entity code; a token with a `titleColumn` is creatable
// and renamable here.
//
// Tables with NOT NULL columns the registry can't know about take them via
// `extraColumns` (or the caller uses its feature's own create service and only
// leans on `renameEntityRow`). Both writes go DIRECT to Postgres via
// supabase-js (CLAUDE.md data-flow rule) and are RLS-gated.
//
// On success both functions prime the shared entity-title cache so every
// title-resolving surface (AssociationList, pickers, cards) sees the new name.

import { supabase } from "@/utils/supabase/client";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { primeEntityTitle } from "@/features/scopes/service/entityTitles";
import { requireUserId } from "@/utils/auth/getUserId";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

export type EntityRowResult =
  | { ok: true; data: { id: string; title: string } }
  | { ok: false; error: string };

export interface CreateEntityRowArgs {
  /** The new row's human name — written to the registry `titleColumn`. */
  title: string;
  /** Org to stamp (skipped when the token has no org column). */
  orgId?: string | null;
  /** Required NOT NULL columns the registry conventions can't know about. */
  extraColumns?: Record<string, unknown>;
}

function dbFor(schema: string) {
  // Dynamic schema/table write — same cast pattern as associationCandidates:
  // the schema is a runtime registry value, so cast to a known literal.
  return (
    schema && schema !== "public"
      ? supabase.schema(schema as "files")
      : supabase
  ) as typeof supabase;
}

function requireTitleColumn(
  token: EntityTypeToken,
  op: string,
): { ok: true; titleColumn: string } | { ok: false; error: string } {
  const info = getEntityInfo(token);
  if (!info.titleColumn) {
    const error =
      `Entity "${token}" has no title_column in platform.entity_types — ` +
      `add one in features/scopes/registry/entityRegistry.ts before ${op}`;
    console.error(`[entityRows] ${error}`);
    return { ok: false, error };
  }
  return { ok: true, titleColumn: info.titleColumn };
}

/**
 * Insert one row of `token`'s backing table named `title`, owned by the
 * current user (when the table has an owner column). Returns the new row's
 * id + title. The caller wires associations afterwards (`linkCreated` /
 * `useContainerLinks.attach`) — this layer never writes edges.
 */
export async function createEntityRow(
  token: EntityTypeToken,
  args: CreateEntityRowArgs,
): Promise<EntityRowResult> {
  const gate = requireTitleColumn(token, "creating rows");
  if (!gate.ok) return gate;
  const info = getEntityInfo(token);
  const title = args.title.trim();
  if (!title) return { ok: false, error: "Name is required" };

  try {
    const userId = requireUserId();
    const row: Record<string, unknown> = {
      [gate.titleColumn]: title,
      ...(info.ownerColumn ? { [info.ownerColumn]: userId } : {}),
      ...(info.orgColumn && args.orgId ? { [info.orgColumn]: args.orgId } : {}),
      ...(args.extraColumns ?? {}),
    };
    const { data, error } = await dbFor(info.schema)
      .from(info.table as never)
      .insert(row as never)
      .select("id")
      .single();
    if (error) {
      console.error("[createEntityRow] insert failed", { token, error });
      return { ok: false, error: error.message };
    }
    const id = String((data as { id: unknown }).id);
    primeEntityTitle(token, id, title);
    return { ok: true, data: { id, title } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create";
    console.error("[createEntityRow] exception", { token, err });
    return { ok: false, error: msg };
  }
}

/** Update the registry `titleColumn` of one row of `token`'s backing table. */
export async function renameEntityRow(
  token: EntityTypeToken,
  id: string,
  title: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = requireTitleColumn(token, "renaming rows");
  if (!gate.ok) return gate;
  const info = getEntityInfo(token);
  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "Name is required" };

  try {
    const { error } = await dbFor(info.schema)
      .from(info.table as never)
      .update({ [gate.titleColumn]: trimmed } as never)
      .eq("id" as never, id as never);
    if (error) {
      console.error("[renameEntityRow] update failed", { token, id, error });
      return { ok: false, error: error.message };
    }
    primeEntityTitle(token, id, trimmed);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to rename";
    console.error("[renameEntityRow] exception", { token, id, err });
    return { ok: false, error: msg };
  }
}
