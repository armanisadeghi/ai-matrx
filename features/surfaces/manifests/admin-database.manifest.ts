/**
 * Surface manifest — Database admin (`matrx-admin/database`).
 *
 * ADMIN SURFACE. Drives `/administration/database/**` — the super-admin
 * database console. `/administration/database` itself is a HUB LANDING (a
 * card grid over `features/administration/database-hub/database-tools.ts`);
 * the data-bearing child is the SQL workbench at
 * `/administration/database/database-admin`, which runs arbitrary read
 * queries against the live Supabase project through the
 * `execute_admin_query` RPC.
 *
 * What an agent bound here may safely do: read the admin's SQL text, the
 * shape of the result it got back, its recent query history, and the catalogue
 * of database tools available on the hub — and from that, WRITE and EXPLAIN
 * SQL, diagnose an error message, or propose a next query. It must NOT assume
 * a query it proposes has been executed: execution is the admin pressing Run.
 * Nothing on this surface is a write path.
 *
 * SECURITY: this manifest declares NO secrets, API keys, tokens, connection
 * strings, or credential material. Specifically, no Supabase URL, service-role
 * key, database password, or DSN is declared or emitted — the emitters place
 * only the admin's own SQL text, result rows, and timings in the scope. If a
 * credential ever needs representing here it is a presence boolean (e.g.
 * `has_api_key`), never a value. Note that `query_result_json` carries
 * whatever the admin's query returned; it is `autoContext: false` precisely so
 * arbitrary DB rows never flow into an agent's context unless an author binds
 * them deliberately.
 *
 * Emitters (real, wired):
 *   - Hub catalogue → `features/administration/database-hub/DatabaseHubLanding.tsx`
 *   - Query state   → `app/(admin)/administration/database/components/enhanced-sql-editor.tsx`
 *
 * Deliberately NOT declared (nothing emits them): a schema/table/column
 * browser with a selected table and row sample does not exist as page state on
 * this route — table and column listings are only reachable as SQL SNIPPETS
 * the admin runs, and the schema visualizer's overview payload lives in a
 * separate React Query cache under `/administration/database/schema-visualizer`.
 * Declaring `selected_table` / `table_columns` / `row_sample` today would
 * promise values no emitter supplies.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_DATABASE_SURFACE_NAME = "matrx-admin/database";

const groups: SurfaceValueGroup[] = [
  {
    key: "console",
    label: "Database console",
    sortOrder: 100,
    description:
      "Which part of the database admin the user is in, and the tools the hub offers.",
  },
  {
    key: "query_editor",
    label: "Query editor",
    sortOrder: 200,
    description:
      "The SQL the admin has written and the editor options in force when they run it.",
  },
  {
    key: "query_result",
    label: "Query result",
    sortOrder: 300,
    description:
      "What came back from the last execution: rows, shape, timing, and any error.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Database console ──────────────────────────────────────────────────
  {
    name: "console_section",
    label: "Console section",
    description:
      '"hub" when the admin is on the /administration/database landing grid, "sql_workbench" when they are in the SQL editor. Always present — each emitter declares which one it is.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 14,
    sortOrder: 100,
    group: "console",
  },
  {
    name: "default_schema",
    label: "Default schema",
    description:
      'The schema the console UI defaults to when it needs one (currently "public"). A display default only — the underlying fetches are schema-agnostic. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 110,
    group: "console",
  },
  {
    name: "database_tool_pages",
    label: "Database tools",
    description:
      "Catalogue of the database admin tool pages the hub links to — one entry per tool with its title, href, and section. Absent in the SQL workbench, which does not load the hub catalogue.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2200,
    autoContext: false,
    sortOrder: 120,
    group: "console",
  },
  {
    name: "database_tool_count",
    label: "Database tool count",
    description:
      "Number of tool pages in the hub catalogue. Absent in the SQL workbench.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 130,
    group: "console",
  },

  // ── Query editor ──────────────────────────────────────────────────────
  {
    name: "sql_query",
    label: "SQL query",
    description:
      "The exact SQL text currently in the editor — what the admin is about to run, or just ran. Empty when the editor is untouched; absent on the hub landing.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 200,
    group: "query_editor",
  },
  {
    name: "sql_query_length",
    label: "SQL length",
    description:
      "Character length of the SQL in the editor. Absent on the hub landing.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 205,
    group: "query_editor",
  },
  {
    name: "use_cache",
    label: "Cache enabled",
    description:
      "Whether the workbench will serve the next run from its in-memory query cache instead of hitting the database. Absent on the hub landing.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 210,
    group: "query_editor",
  },
  {
    name: "query_history",
    label: "Recent queries",
    description:
      "The admin's last ten submitted queries, newest first, each with its ISO timestamp. Bindable rather than auto-context — SQL text adds up fast. Absent on the hub landing; empty array before the first run.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 220,
    group: "query_editor",
  },
  {
    name: "is_query_running",
    label: "Query running",
    description:
      "True while an execution is in flight. Absent on the hub landing.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 230,
    group: "query_editor",
  },

  // ── Query result ──────────────────────────────────────────────────────
  {
    name: "query_row_count",
    label: "Row count",
    description:
      "Number of rows the last execution returned. Absent when nothing has been run yet, or when the last run errored.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "query_result",
  },
  {
    name: "query_result_columns",
    label: "Result columns",
    description:
      "Column names of the last result set, taken from the first returned row. Absent when nothing has been run, the run errored, or the result was not a row array.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 310,
    group: "query_result",
  },
  {
    name: "query_result_sample",
    label: "Result sample",
    description:
      "The first few rows of the last result set, for shape inspection. Bindable, not auto-context — these are live database rows and must only reach an agent when an author deliberately wires them. Absent when nothing has been run or the run errored.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 320,
    group: "query_result",
  },
  {
    name: "query_result_json",
    label: "Full result",
    description:
      "The complete payload returned by the last execution. Potentially very large and, like the sample, live database content — bindable only, never auto-context. Absent when nothing has been run or the run errored.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 20000,
    autoContext: false,
    sortOrder: 330,
    group: "query_result",
  },
  {
    name: "query_execution_ms",
    label: "Execution time (ms)",
    description:
      "Wall-clock milliseconds the last execution took, measured client-side. Absent when nothing has been run or the run errored.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 340,
    group: "query_result",
  },
  {
    name: "query_error",
    label: "Query error",
    description:
      "The error message from the last failed execution — the single most useful value to bind for a SQL-debugging agent. Absent when the last run succeeded or nothing has been run.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 350,
    group: "query_result",
  },
  {
    name: "query_timed_out",
    label: "Query timed out",
    description:
      "True when the last execution was aborted by the workbench timeout rather than returning or erroring normally. Absent on the hub landing.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 360,
    group: "query_result",
  },
];

export const adminDatabaseManifest: SurfaceManifest = {
  surfaceName: ADMIN_DATABASE_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Hub-catalogue and SQL-workbench emitters are wired and real. The route has no schema/table browser page state (selected table, columns, row sample), so those values are deliberately undeclared; the schema visualizer, sql-functions, enums, relationships, canonicalization and workbench sub-routes have no emitter yet.",
  label: "Database Admin",
  urlPattern: "/administration/database",
  intro: `<surface_intro>
This is an ADMIN surface: the super-admin database console at /administration/database.

/administration/database itself is a hub — a grid of links to database tools (schema visualizer, SQL functions, enums, relationships, canonicalization, data integrity, workbench). The data-bearing page is the SQL workbench, where a super-admin writes read-only SQL and runs it against the live Supabase project.

How to read the values: console_section tells you which one you are on — "hub" or "sql_workbench". On the hub, database_tool_pages is the catalogue and the query_* values are absent. In the workbench, sql_query is what the admin has written, and the query_* result values describe the LAST execution (they are all absent before the first run, and query_error replaces them when a run fails).

What you may safely do: read the SQL and the result shape, then write, correct, explain, or optimise SQL and diagnose errors. You never execute anything — running a query is the admin pressing Run. Treat result rows as live production data: summarise them, do not republish them.

There are no credentials in this scope. No connection string, database password, service key, or API token is emitted here, and you should never ask for one.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** One entry in the hub's database-tool catalogue. */
export interface AdminDatabaseToolEntry {
  title: string;
  href: string;
  section?: string;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminDatabaseScope(values: {
  // alwaysAvailable: true → required
  console_section: "hub" | "sql_workbench";
  default_schema: string;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  database_tool_pages?: AdminDatabaseToolEntry[];
  database_tool_count?: number;
  sql_query?: string;
  sql_query_length?: number;
  use_cache?: boolean;
  query_history?: { query: string; timestamp: string }[];
  is_query_running?: boolean;
  query_row_count?: number;
  query_result_columns?: string[];
  query_result_sample?: unknown[];
  query_result_json?: unknown;
  query_execution_ms?: number;
  query_error?: string;
  query_timed_out?: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
