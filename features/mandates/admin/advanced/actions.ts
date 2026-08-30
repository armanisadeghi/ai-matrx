"use server";

// features/mandates/admin/advanced/actions.ts
//
// Server actions behind the mandate x-ray console.
//
// WHY SERVER ACTIONS AND NOT DIRECT SUPABASE: the point of this screen is to
// show the EXACT rows, including rows RLS would hide from the reader, so the
// read has to run with the service role. That is the repo's existing
// "admin-only ops" exception to the direct-to-Supabase rule, and the existing
// mechanism for it is `execute_admin_query` (a SECURITY DEFINER RPC called
// through `createAdminClient()`), already used by /administration/database.
// This module reuses that path rather than inventing a second one.
//
// 🚨 SECURITY: `/administration/**` is admin-gated in `app/(admin)/layout.tsx`,
// but a server action is callable directly by URL — the layout gate does NOT
// protect it. Every exported action below re-checks admin status itself before
// touching the admin client. Do not add an action here without that check.
//
// 🚨 SQL SAFETY: `execute_admin_query` takes a raw string; there is no
// parameterized path. Identifiers are validated with `assertSafeIdentifier`
// and values NEVER reach SQL as fragments — they are carried as ONE json
// literal and converted by Postgres itself via `jsonb_populate_record`, so
// every column type (uuid, jsonb, text[], enum, timestamptz) is handled by the
// database instead of by string building here.

import { executeSqlQuery } from "@/actions/admin/database";
import { createClient } from "@/utils/supabase/server";
import { checkIsUserAdmin } from "@/utils/supabase/userSessionData";
import {
  assertSafeIdentifier,
  sqlLiteral,
} from "@/features/administration/canonicalization/utils/sqlSafety";
import { findRelation, relationKey } from "./tables";

export type AdvancedResult<T> = { data: T; error: null } | { data: null; error: string };

export interface AdvancedColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  hasDefault: boolean;
}

export interface AdvancedPage {
  relation: string;
  columns: AdvancedColumn[];
  rows: Record<string, unknown>[];
  total: number;
  /** The exact SQL that produced `rows`. Shown on screen — this is an x-ray. */
  sql: string;
}

const MAX_PAGE_SIZE = 200;

async function requireAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Not signed in.";
  const isAdmin = await checkIsUserAdmin(supabase, user.id);
  if (!isAdmin) return "Admin access required.";
  return null;
}

/** Resolves a registry key to a validated, injection-safe qualified name. */
function qualify(relationKeyInput: string) {
  const relation = findRelation(relationKeyInput);
  if (!relation) throw new Error(`Unknown relation: ${relationKeyInput}`);
  const schema = assertSafeIdentifier(relation.schema, "schema");
  const table = assertSafeIdentifier(relation.table, "table");
  return { relation, qualified: `${schema}.${table}` };
}

/**
 * `execute_admin_query` is declared `(query text, OUT result jsonb)`, so
 * PostgREST hands back `{ result: [...] }` — NOT the array. Unwrapping is not
 * optional: an un-unwrapped payload is not an array, so it reads as "zero
 * rows" and the screen lies about an empty table. Caught in the first browser
 * load of this console, which reported "mandate.definition exposes no columns"
 * over a table with 689 rows.
 */
function rowsOf(payload: unknown): Record<string, unknown>[] {
  const unwrapped =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { result?: unknown }).result
      : payload;
  return Array.isArray(unwrapped) ? (unwrapped as Record<string, unknown>[]) : [];
}

async function runSql<T = unknown>(sql: string): Promise<AdvancedResult<T>> {
  const result = await executeSqlQuery(sql);
  if (result.error) return { data: null, error: result.error };
  return { data: result.data as T, error: null };
}

export async function advancedListRows(input: {
  relation: string;
  limit?: number;
  offset?: number;
  /** Substring match applied to the whole row cast to text. */
  search?: string;
  /** Soft-deleted rows are hidden by default; this is Arman's switch to see them. */
  includeDeleted?: boolean;
}): Promise<AdvancedResult<AdvancedPage>> {
  const denied = await requireAdmin();
  if (denied) return { data: null, error: denied };

  let qualified: string;
  let relation: ReturnType<typeof findRelation>;
  try {
    const q = qualify(input.relation);
    qualified = q.qualified;
    relation = q.relation;
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
  if (!relation) return { data: null, error: `Unknown relation: ${input.relation}` };

  const limit = Math.min(Math.max(input.limit ?? 50, 1), MAX_PAGE_SIZE);
  const offset = Math.max(input.offset ?? 0, 0);

  const columnsSql = `
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = ${sqlLiteral(relation.schema)}
      AND table_name = ${sqlLiteral(relation.table)}
    ORDER BY ordinal_position`;
  const columnsResult = await runSql(columnsSql);
  if (columnsResult.error) return { data: null, error: columnsResult.error };
  const columns: AdvancedColumn[] = rowsOf(columnsResult.data).map((c) => ({
    name: String(c.column_name),
    dataType:
      String(c.data_type) === "USER-DEFINED"
        ? String(c.udt_name)
        : String(c.data_type),
    nullable: String(c.is_nullable) === "YES",
    hasDefault: c.column_default !== null,
  }));
  if (columns.length === 0) {
    return { data: null, error: `${qualified} exposes no columns to this role.` };
  }

  const where: string[] = [];
  if (relation.softDeletes && !input.includeDeleted) {
    where.push("deleted_at IS NULL");
  }
  const search = (input.search ?? "").trim();
  if (search) {
    // The whole row as text — the honest x-ray search: it matches a uuid, a
    // key fragment, or a value buried in a jsonb column, with one rule.
    where.push(`(t.*)::text ILIKE ${sqlLiteral(`%${search}%`)}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const orderSql = columns.some((c) => c.name === "updated_at")
    ? "ORDER BY updated_at DESC NULLS LAST"
    : columns.some((c) => c.name === "created_at")
      ? "ORDER BY created_at DESC NULLS LAST"
      : "";

  const listSql =
    `SELECT to_jsonb(t) AS row FROM ${qualified} t ${whereSql} ${orderSql} ` +
    `LIMIT ${limit} OFFSET ${offset}`;
  const countSql = `SELECT count(*)::bigint AS n FROM ${qualified} t ${whereSql}`;

  const [listResult, countResult] = await Promise.all([
    runSql(listSql),
    runSql(countSql),
  ]);
  if (listResult.error) return { data: null, error: listResult.error };
  if (countResult.error) return { data: null, error: countResult.error };

  const rows = rowsOf(listResult.data).map(
    (wrapper) => (wrapper.row ?? {}) as Record<string, unknown>,
  );
  const total = Number(rowsOf(countResult.data)[0]?.n ?? rows.length);

  return {
    data: { relation: relationKey(relation), columns, rows, total, sql: listSql },
    error: null,
  };
}

/** Builds `SET (a, b) = (SELECT a, b FROM jsonb_populate_record(...))`. */
function assignmentFromJson(qualified: string, patch: Record<string, unknown>) {
  const keys = Object.keys(patch).map((k) => assertSafeIdentifier(k, "column"));
  if (keys.length === 0) throw new Error("Nothing to write — no columns supplied.");
  const list = keys.join(", ");
  const literal = sqlLiteral(JSON.stringify(patch));
  return `(${list}) = (SELECT ${list} FROM jsonb_populate_record(NULL::${qualified}, ${literal}::jsonb))`;
}

export async function advancedUpdateRow(input: {
  relation: string;
  id: string;
  patch: Record<string, unknown>;
}): Promise<AdvancedResult<Record<string, unknown>>> {
  const denied = await requireAdmin();
  if (denied) return { data: null, error: denied };
  try {
    const { relation, qualified } = qualify(input.relation);
    if (!relation.writable || !relation.pk) {
      return { data: null, error: `${qualified} is read-only in this console.` };
    }
    const pk = assertSafeIdentifier(relation.pk, "primary key");
    const sql =
      `UPDATE ${qualified} AS t SET ${assignmentFromJson(qualified, input.patch)} ` +
      `WHERE t.${pk} = ${sqlLiteral(input.id)}::uuid RETURNING to_jsonb(t) AS row`;
    const result = await runSql(sql);
    if (result.error) return { data: null, error: result.error };
    const row = rowsOf(result.data)[0]?.row as Record<string, unknown> | undefined;
    if (!row) return { data: null, error: "No row matched that id — nothing was written." };
    return { data: row, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function advancedInsertRow(input: {
  relation: string;
  values: Record<string, unknown>;
}): Promise<AdvancedResult<Record<string, unknown>>> {
  const denied = await requireAdmin();
  if (denied) return { data: null, error: denied };
  try {
    const { relation, qualified } = qualify(input.relation);
    if (!relation.writable) {
      return { data: null, error: `${qualified} is read-only in this console.` };
    }
    const keys = Object.keys(input.values).map((k) => assertSafeIdentifier(k, "column"));
    if (keys.length === 0) return { data: null, error: "Supply at least one column." };
    const list = keys.join(", ");
    const literal = sqlLiteral(JSON.stringify(input.values));
    // Only the supplied columns are named, so every other column keeps its
    // database default — an insert here is a real insert, not a null carpet.
    const sql =
      `INSERT INTO ${qualified} AS t (${list}) ` +
      `SELECT ${list} FROM jsonb_populate_record(NULL::${qualified}, ${literal}::jsonb) ` +
      `RETURNING to_jsonb(t) AS row`;
    const result = await runSql(sql);
    if (result.error) return { data: null, error: result.error };
    const row = rowsOf(result.data)[0]?.row as Record<string, unknown> | undefined;
    if (!row) return { data: null, error: "The insert returned no row." };
    return { data: row, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function advancedDeleteRow(input: {
  relation: string;
  id: string;
  /** Soft = set deleted_at (the platform's normal delete). Hard = DELETE. */
  mode: "soft" | "hard";
}): Promise<AdvancedResult<{ mode: "soft" | "hard"; sql: string }>> {
  const denied = await requireAdmin();
  if (denied) return { data: null, error: denied };
  try {
    const { relation, qualified } = qualify(input.relation);
    if (!relation.writable || !relation.pk) {
      return { data: null, error: `${qualified} is read-only in this console.` };
    }
    if (input.mode === "soft" && !relation.softDeletes) {
      return { data: null, error: `${qualified} has no deleted_at — use a hard delete.` };
    }
    const pk = assertSafeIdentifier(relation.pk, "primary key");
    const idLit = `${sqlLiteral(input.id)}::uuid`;
    const sql =
      input.mode === "soft"
        ? `UPDATE ${qualified} AS t SET deleted_at = now() WHERE t.${pk} = ${idLit} RETURNING t.${pk}`
        : `DELETE FROM ${qualified} AS t WHERE t.${pk} = ${idLit} RETURNING t.${pk}`;
    const result = await runSql(sql);
    if (result.error) return { data: null, error: result.error };
    if (rowsOf(result.data).length === 0) {
      return { data: null, error: "No row matched that id — nothing was deleted." };
    }
    return { data: { mode: input.mode, sql }, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}
