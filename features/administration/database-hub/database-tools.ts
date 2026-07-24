import type { ModulePage } from "@/components/matrx/navigation/types";

export const DATABASE_MODULE_NAME = "Database Administration";
export const DATABASE_MODULE_HOME = "/administration/database";

/** UI default only — list filters and create forms start here; fetches stay schema-agnostic. */
export const DEFAULT_DATABASE_SCHEMA = "public";

export type DatabaseToolSection =
  "legacy" | "sql" | "canonicalization" | "schema";

export interface DatabaseToolPage extends ModulePage {
  section: DatabaseToolSection;
  /** When true, title gets a "Dup" suffix in nav + hub cards. */
  isDuplicate?: boolean;
  /** Short note on how this duplicate differs from its primary sibling. */
  duplicateNote?: string;
}

export const DATABASE_TOOL_SECTIONS: {
  id: DatabaseToolSection;
  label: string;
  description: string;
}[] = [
  {
    id: "legacy",
    label: "Legacy dashboard",
    description:
      "Original tabbed dashboard — functions list, permissions catalog, and a basic SQL editor in one view.",
  },
  {
    id: "sql",
    label: "SQL & schema objects",
    description:
      "Dedicated tools for queries, notebooks, function CRUD, and enum management.",
  },
  {
    id: "canonicalization",
    label: "Canonicalization",
    description:
      "Live gate, audit snapshots, and certify/verify workflow for the DB schema transition.",
  },
  {
    id: "schema",
    label: "Schema visualization",
    description: "Interactive ER diagrams of the live database schema.",
  },
];

/** Single registry for every Database-category admin tool (16 entries). */
export const databaseToolPages: DatabaseToolPage[] = [
  // ── Legacy dashboard ──────────────────────────────────────────────
  {
    title: "Admin Dashboard",
    path: "/administration/database/database-admin",
    relative: false,
    description:
      "Tabbed legacy view: functions browser, permissions catalog, and basic SQL editor.",
    section: "legacy",
  },
  {
    title: "Functions",
    path: "/administration/database/database-admin?tab=functions",
    relative: false,
    description:
      "Read-only functions list with detail drawer. Same RPC as SQL Functions but no CRUD.",
    section: "legacy",
    isDuplicate: true,
    duplicateNote:
      "Uses get_database_functions RPC (read-only). Primary: SQL Functions page with full CRUD.",
  },
  {
    title: "Permissions",
    path: "/administration/database/database-admin?tab=permissions",
    relative: false,
    description:
      "Browse database object permissions by role via get_database_permissions RPC.",
    section: "legacy",
  },
  {
    title: "SQL Query",
    path: "/administration/database/database-admin?tab=sql",
    relative: false,
    description:
      "Basic textarea SQL editor with JsonInspector results. No cache, cancel, or timeout.",
    section: "legacy",
    isDuplicate: true,
    duplicateNote:
      "Uses execute_admin_query RPC. Primary: Enhanced SQL Editor with cache + cancel + timeout.",
  },

  // ── SQL tools (under /administration/database/*) ──────────────────
  {
    title: "SQL Editor",
    path: "/administration/database/sql-queries",
    relative: false,
    description:
      "Enhanced SQL editor with query cache, cancel, and timeout handling.",
    section: "sql",
  },
  {
    title: "Workbench",
    path: "/administration/database/workbench",
    relative: false,
    description:
      "Multi-query notebook with shared variables and merged result sets.",
    section: "sql",
  },
  {
    title: "SQL Functions",
    path: "/administration/database/sql-functions",
    relative: false,
    description:
      "Browse, search, create, edit, and delete SQL functions (full CRUD).",
    section: "sql",
  },
  {
    title: "Enums",
    path: "/administration/database/enums",
    relative: false,
    description: "Manage database enum types and their values.",
    section: "sql",
  },

  // ── Canonicalization (8 pages) ────────────────────────────────────
  {
    title: "Overview",
    path: "/administration/database/canonicalization",
    relative: false,
    description:
      "Certification gate summary with quick links to every canonicalization tool.",
    section: "canonicalization",
  },
  {
    title: "Summary",
    path: "/administration/database/canonicalization/summary",
    relative: false,
    description:
      "Certification summary and overall canonicalization gate status.",
    section: "canonicalization",
  },
  {
    title: "Findings",
    path: "/administration/database/canonicalization/findings",
    relative: false,
    description: "Every FAIL/WARN finding from the canonicalization audit.",
    section: "canonicalization",
  },
  {
    title: "Broken Functions",
    path: "/administration/database/canonicalization/broken-functions",
    relative: false,
    description: "SQL functions that fail canonicalization checks.",
    section: "canonicalization",
  },
  {
    title: "Candidates",
    path: "/administration/database/canonicalization/candidates",
    relative: false,
    description:
      "Migration candidates: M2M tables, unregistered relations, stale shims.",
    section: "canonicalization",
  },
  {
    title: "Function Deps",
    path: "/administration/database/canonicalization/function-deps",
    relative: false,
    description: "Dependency graph for SQL functions under review.",
    section: "canonicalization",
  },
  {
    title: "Table Impact",
    path: "/administration/database/canonicalization/table-impact",
    relative: false,
    description: "Per-table preflight impact before certifying a migration.",
    section: "canonicalization",
  },
  {
    title: "Verify",
    path: "/administration/database/canonicalization/verify",
    relative: false,
    description: "Verify and certify individual tables or functions.",
    section: "canonicalization",
  },

  // ── Schema visualizers ──────────────────────────────────────────────
  {
    title: "Schema Visualizer",
    path: "/administration/database/schema-visualizer",
    relative: false,
    description:
      "ReactFlow diagram of the full schema via /api/schema-overview. Standalone, no entity system.",
    section: "schema",
  },
  {
    title: "Schema Visualizer",
    path: "/administration/database/schema-visualizer-enhanced",
    relative: false,
    description:
      "SchemaVisualizerLayout with filtering, details panel, and enhanced navigation.",
    section: "schema",
    isDuplicate: true,
    duplicateNote:
      "Same schema data source; enhanced layout adds filtering + detail side panel.",
  },
];

/** SQL sub-routes that share the /administration/database layout tab bar. */
export const databaseSqlSubPages = databaseToolPages.filter(
  (p) => p.section === "sql",
);

export function databaseToolLabel(page: DatabaseToolPage): string {
  return page.isDuplicate ? `${page.title} Dup` : page.title;
}

export function isActiveDatabaseToolPath(
  currentPath: string,
  pagePath: string,
  currentSearch = "",
): boolean {
  const [pathOnly, pageSearch = ""] = pagePath.split("?");
  const pathMatches =
    currentPath === pathOnly ||
    (pathOnly !== DATABASE_MODULE_HOME &&
      currentPath.startsWith(pathOnly + "/"));

  if (!pathMatches) return false;

  if (pageSearch) {
    const expected = new URLSearchParams(pageSearch);
    const actual = new URLSearchParams(
      currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch,
    );
    for (const [key, value] of expected.entries()) {
      if (actual.get(key) !== value) return false;
    }
    return true;
  }

  // Path-only match: for database-admin, don't highlight base when a tab is set
  if (
    pathOnly === "/administration/database/database-admin" &&
    currentSearch.includes("tab=")
  ) {
    return false;
  }

  return currentPath === pathOnly;
}
