#!/usr/bin/env npx tsx
/**
 * SEED THE PLATFORM'S EXAMPLE DATA TABLES
 *
 * Arman, 2026-09-14: "create a few system tables that demonstrate to users how
 * our table system can be used … show off all of the capabilities …
 * read-only defaults."
 *
 * Three datasets owned by the Matrx System organization, which every signed-in
 * user can read and only a super admin can edit. They surface in the "Examples"
 * section of /data (`public.udt_list_example_tables`).
 *
 *   1. Example: Project Tracker  — every column format at least once, a
 *      dependent choice (Team narrowed by Department), color-by, a rule, and
 *      two manual highlights.
 *   2. Example: Product Catalog  — money, margin, stock, ratings, and two
 *      color rules that flag what needs attention.
 *   3. Example: Team Directory   — the people shape, color-by on one column.
 *
 * EVERY WRITE GOES THROUGH THE PRODUCT'S OWN PATH — the same RPCs the /data UI
 * calls (`create_user_table_with_fields`, `udt_set_field_format`,
 * `udt_bulk_write`, `udt_set_table_style`, `create_user_list`) and, for the
 * shared pick list's visibility, the same direct column write
 * `utils/permissions/service.ts` → `setVisibilityColumn` performs. No direct
 * row inserts, so anything the platform would refuse a user is refused here too
 * and the refusal is printed verbatim.
 *
 * THE DEPENDENT COLUMN NEEDS A SHARED LIST. `StructuredListBinding.groupFromField`
 * (lib/field-formats/types.ts) narrows a column's options to the group its
 * controlling cell names, and groups live on a structured list's items — so the
 * script first creates ONE list, "Example: Teams by Department", and binds both
 * Team columns to it. The list is made `visibility = 'public'` because
 * `get_structured_list_for_selection` gates on exactly that; a private list would
 * leave every non-owner staring at an unavailable column.
 *
 * IDEMPOTENT. A table whose name already exists is skipped; `--reset` deletes and
 * rebuilds it. Run it twice and nothing is duplicated.
 *
 *   npx tsx scripts/seed-udt-example-tables.ts [--reset] [--only <name>]
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 * AI_ADMIN_USERNAME and AI_ADMIN_PASSWORD (this repo's .env.local / .env, then
 * ../aidream/.env). Credential VALUES are never printed.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import type {
  FieldChoice,
  FieldFormatConfig,
} from "../lib/field-formats/types";
import type {
  ColorBy,
  ColorRule,
  StyleColor,
} from "../features/data-tables/table-style";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** `iam.system_orgs` key 'system' — the Matrx System organization. */
const SYSTEM_ORG_ID = "39c38960-d30c-4840-b0c1-c9960de95582";

const SHARED_LIST_NAME = "Example: Teams by Department";

const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function info(msg: string): void {
  console.log(`${C.cyan}[INFO]${C.reset} ${msg}`);
}
function ok(msg: string): void {
  console.log(`${C.green}[ OK ]${C.reset} ${msg}`);
}
function warn(msg: string): void {
  console.log(`${C.yellow}[SKIP]${C.reset} ${msg}`);
}

/** Every failure exits here so an RPC's own message reaches the operator intact. */
function die(msg: string): never {
  console.error(`${C.red}[FAIL]${C.reset} ${msg}`);
  process.exit(1);
}

const USAGE = `
Seed the platform's example data tables (Matrx System org → the "Examples"
section of /data).

  npx tsx scripts/seed-udt-example-tables.ts [options]

Options:
  --help            Print this and exit. Touches nothing.
  --reset           Delete and rebuild an example table that already exists.
                    Without it, an existing table is left alone.
  --only <name>     Build just one table. Accepts a key or any part of its
                    name: project-tracker | product-catalog | team-directory.

Environment (this repo's .env.local / .env, then ../aidream/.env):
  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  AI_ADMIN_USERNAME, AI_ADMIN_PASSWORD

Writes go through the same RPCs the /data UI calls. Nothing is printed that
could reveal a credential.
`.trim();

// ─── Small type guards — nothing is trusted to be the shape it should be ─────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringField(v: unknown, key: string): string | null {
  if (!isRecord(v)) return null;
  const raw = v[key];
  return typeof raw === "string" ? raw : null;
}

/** `get_full_table` → the column rows we need (id + machine name). */
function parseColumns(payload: unknown): { id: string; field_name: string }[] {
  if (!isRecord(payload) || !Array.isArray(payload.columns)) {
    die("get_full_table returned an unexpected shape (no `columns` array).");
  }
  const out: { id: string; field_name: string }[] = [];
  for (const entry of payload.columns) {
    const id = stringField(entry, "id");
    const fieldName = stringField(entry, "field_name");
    if (id && fieldName) out.push({ id, field_name: fieldName });
  }
  return out;
}

/** `udt_list_example_tables` → the existing example tables. */
function parseExampleTables(payload: unknown): { id: string; table_name: string }[] {
  if (!isRecord(payload) || !Array.isArray(payload.tables)) return [];
  const out: { id: string; table_name: string }[] = [];
  for (const entry of payload.tables) {
    const id = stringField(entry, "id");
    const tableName = stringField(entry, "table_name");
    if (id && tableName) out.push({ id, table_name: tableName });
  }
  return out;
}

/** `udt_bulk_write` → the row ids, in the order the operations were sent. */
function parseWrittenRowIds(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    die("udt_bulk_write returned an unexpected shape (no `results` array).");
  }
  const ids: string[] = [];
  for (const slot of payload.results) {
    if (isRecord(slot) && typeof slot.error === "string") {
      die(`udt_bulk_write refused a row: ${slot.error}`);
    }
    const id = stringField(slot, "id");
    if (!id) die("udt_bulk_write returned a row without an id.");
    ids.push(id);
  }
  return ids;
}

// ─── Credentials ────────────────────────────────────────────────────────────

type Creds = { url: string; key: string; email: string; password: string };

const WANTED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "AI_ADMIN_USERNAME",
  "AI_ADMIN_PASSWORD",
] as const;

function loadCreds(): Creds {
  const env: Record<string, string> = {};
  for (const k of WANTED) {
    const fromProcess = process.env[k];
    if (fromProcess) env[k] = fromProcess;
  }

  const files = [
    resolve(ROOT, ".env.local"),
    resolve(ROOT, ".env"),
    resolve(ROOT, "..", "aidream", ".env"),
  ];
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (!m) continue;
      const [, k, raw] = m;
      if ((WANTED as readonly string[]).includes(k) && !env[k]) {
        env[k] = (raw ?? "").replace(/^['"]|['"]$/g, "");
      }
    }
  }

  const missing = WANTED.filter((k) => !env[k]);
  if (missing.length > 0) {
    die(
      `Missing ${missing.join(", ")} — looked in the environment, ` +
        `${ROOT}/.env.local, ${ROOT}/.env and ../aidream/.env.`,
    );
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    email: env.AI_ADMIN_USERNAME,
    password: env.AI_ADMIN_PASSWORD,
  };
}

// ─── Dates, so the examples never read as stale ──────────────────────────────

const NOW = Date.now();
const DAY_MS = 86_400_000;

/** ISO date (YYYY-MM-DD) `n` days from now; negative for the past. */
function dateIn(days: number): string {
  return new Date(NOW + days * DAY_MS).toISOString().slice(0, 10);
}

/** Full ISO timestamp `n` hours from now; negative for the past. */
function timeIn(hours: number): string {
  return new Date(NOW + hours * 3_600_000).toISOString();
}

// ─── The shared pick list that makes the dependent columns work ──────────────

type ListItem = { Label: string; Group: string; "Help Text"?: string };

const TEAM_ITEMS: ListItem[] = [
  { Label: "Platform", Group: "Engineering", "Help Text": "Core services and APIs" },
  { Label: "Data", Group: "Engineering", "Help Text": "Pipelines, warehouse, reporting" },
  { Label: "Mobile", Group: "Engineering", "Help Text": "iOS and Android clients" },
  { Label: "Product Design", Group: "Design", "Help Text": "Product surfaces and flows" },
  { Label: "Brand", Group: "Design", "Help Text": "Identity, campaigns, collateral" },
  { Label: "Support", Group: "Operations", "Help Text": "Customer support and success" },
  { Label: "Facilities", Group: "Operations", "Help Text": "Sites, equipment, safety" },
  { Label: "Content", Group: "Marketing", "Help Text": "Articles, guides, video" },
  { Label: "Growth", Group: "Marketing", "Help Text": "Acquisition and lifecycle" },
];

const DEPARTMENT_CHOICES: FieldChoice[] = [
  { value: "Engineering", color: "blue" },
  { value: "Design", color: "violet" },
  { value: "Operations", color: "amber" },
  { value: "Marketing", color: "teal" },
];

// ─── Table specs ────────────────────────────────────────────────────────────

type FieldDataType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "datetime"
  | "json"
  | "array";

type FieldSpec = {
  field_name: string;
  display_name: string;
  data_type: FieldDataType;
  /** Omitted for a plain column that needs no display format. */
  format?: FieldFormatConfig;
};

type StyleSpec = {
  colorBy?: ColorBy;
  rules?: ColorRule[];
  /** Manual highlights keyed by ROW INDEX, resolved to row ids after the insert. */
  rowHighlights?: { rowIndex: number; color: StyleColor }[];
  cellHighlights?: { rowIndex: number; fieldName: string; color: StyleColor }[];
};

type TableSpec = {
  key: string;
  tableName: string;
  description: string;
  fields: FieldSpec[];
  rows: Record<string, unknown>[];
  style: StyleSpec;
  /** Field names whose choice format binds to the shared team list. */
  dependentTeamFields?: { fieldName: string; controlledBy: string }[];
};

// Industry: internal software company (project tracker + staff directory for
// "Meridian Software", meridiansoftware.com — invented, matches no real company).
function buildProjectTracker(): TableSpec {
  const fields: FieldSpec[] = [
    { field_name: "project", display_name: "Project", data_type: "string", format: { id: "text" } },
    {
      field_name: "summary",
      display_name: "Summary",
      data_type: "string",
      format: { id: "long_text" },
    },
    {
      field_name: "notes",
      display_name: "Notes",
      data_type: "string",
      format: { id: "markdown" },
    },
    {
      field_name: "status",
      display_name: "Status",
      data_type: "string",
      format: {
        id: "choice",
        options: {
          choices: [
            { value: "Planned", color: "slate" },
            { value: "In progress", color: "blue" },
            { value: "Blocked", color: "red" },
            { value: "Done", color: "green" },
          ],
        },
      },
    },
    {
      field_name: "labels",
      display_name: "Labels",
      data_type: "array",
      format: {
        id: "multi_choice",
        options: {
          choices: [
            { value: "Customer facing", color: "blue" },
            { value: "Revenue", color: "green" },
            { value: "Compliance", color: "amber" },
            { value: "Internal tooling", color: "slate" },
          ],
        },
      },
    },
    {
      field_name: "department",
      display_name: "Department",
      data_type: "string",
      format: { id: "choice", options: { choices: DEPARTMENT_CHOICES } },
    },
    // Team's format is written later — it binds to the shared list.
    { field_name: "team", display_name: "Team", data_type: "string" },
    {
      field_name: "owner_email",
      display_name: "Owner email",
      data_type: "string",
      format: { id: "email" },
    },
    {
      field_name: "owner_phone",
      display_name: "Owner phone",
      data_type: "string",
      format: { id: "phone" },
    },
    {
      field_name: "spec_url",
      display_name: "Specification",
      data_type: "string",
      format: { id: "url" },
    },
    {
      field_name: "accent",
      display_name: "Accent",
      data_type: "string",
      format: { id: "color" },
    },
    {
      field_name: "story_points",
      display_name: "Story points",
      data_type: "number",
      format: { id: "number" },
    },
    {
      field_name: "velocity",
      display_name: "Velocity",
      data_type: "number",
      format: { id: "decimal", options: { precision: 1 } },
    },
    {
      field_name: "budget",
      display_name: "Budget",
      data_type: "number",
      format: { id: "currency", options: { currency: "USD", precision: 0 } },
    },
    // A FORMULA column: stores nothing, computed in the browser from the two
    // columns above it. This is the showcase's proof that a table can carry
    // a calculated value without anyone typing it.
    {
      field_name: "budget_per_point",
      display_name: "Budget per point",
      data_type: "string",
      format: {
        id: "formula",
        options: {
          formula: {
            expression: "{Budget} / {Story points}",
            resultFormat: "currency",
          },
          currency: "USD",
          precision: 0,
        },
      },
    },
    {
      field_name: "complete",
      display_name: "Complete",
      data_type: "number",
      format: { id: "percent", options: { percentScale: "whole" } },
    },
    {
      field_name: "time_logged",
      display_name: "Time logged",
      data_type: "number",
      format: { id: "duration", options: { durationUnit: "hours" } },
    },
    {
      field_name: "open_issues",
      display_name: "Open issues",
      data_type: "integer",
      format: { id: "integer" },
    },
    {
      field_name: "health",
      display_name: "Health",
      data_type: "integer",
      format: { id: "rating", options: { ratingMax: 5 } },
    },
    {
      field_name: "assets_size",
      display_name: "Assets",
      data_type: "integer",
      format: { id: "file_size" },
    },
    {
      field_name: "on_track",
      display_name: "On track",
      data_type: "boolean",
      format: { id: "boolean" },
    },
    {
      field_name: "due_date",
      display_name: "Due date",
      data_type: "date",
      format: { id: "date" },
    },
    {
      field_name: "kickoff_at",
      display_name: "Kickoff",
      data_type: "datetime",
      format: { id: "datetime" },
    },
    {
      field_name: "last_update",
      display_name: "Last update",
      data_type: "datetime",
      format: { id: "relative_time" },
    },
    {
      field_name: "config",
      display_name: "Config",
      data_type: "json",
      format: { id: "json" },
    },
    {
      field_name: "milestones",
      display_name: "Milestones",
      data_type: "array",
      format: { id: "array" },
    },
    { field_name: "tags", display_name: "Tags", data_type: "array", format: { id: "tags" } },
  ];

  const rows: Record<string, unknown>[] = [
    {
      project: "Client portal redesign",
      summary:
        "Rebuild the signed-in client portal so account managers can self-serve reports instead of emailing for them.",
      notes: "## Scope\n- New dashboard\n- Saved report views\n- Export to spreadsheet",
      status: "In progress",
      labels: ["Customer facing", "Revenue"],
      department: "Engineering",
      team: "Platform",
      owner_email: "portal.lead@meridiansoftware.com",
      owner_phone: "+1 (415) 555-0142",
      spec_url: "https://meridiansoftware.com/specs/client-portal-redesign",
      accent: "#2563eb",
      story_points: 34,
      velocity: 8.5,
      budget: 84000,
      complete: 62,
      time_logged: 214,
      open_issues: 11,
      health: 4,
      assets_size: 52428800,
      on_track: true,
      due_date: dateIn(38),
      kickoff_at: timeIn(-24 * 46),
      last_update: timeIn(-5),
      config: { environment: "staging", feature_flag: "portal_v2", reviewers: 2 },
      milestones: ["Discovery", "Design review", "Beta", "General availability"],
      tags: ["portal", "reporting"],
    },
    {
      project: "Billing migration",
      summary:
        "Move invoicing off the legacy processor and reconcile two years of historical invoices.",
      notes: "## Risk\nReconciliation must finish before the quarter closes.",
      status: "Blocked",
      labels: ["Revenue", "Compliance"],
      department: "Engineering",
      team: "Data",
      owner_email: "billing.lead@meridiansoftware.com",
      owner_phone: "+1 (415) 555-0198",
      spec_url: "https://meridiansoftware.com/specs/billing-migration",
      accent: "#dc2626",
      story_points: 55,
      velocity: 4.2,
      budget: 126500,
      complete: 41,
      time_logged: 388,
      open_issues: 23,
      health: 2,
      assets_size: 184549376,
      on_track: false,
      due_date: dateIn(12),
      kickoff_at: timeIn(-24 * 120),
      last_update: timeIn(-31),
      config: { environment: "production", dual_write: true, cutover_window: "weekend" },
      milestones: ["Dual write", "Backfill", "Cutover"],
      tags: ["billing", "migration", "finance"],
    },
    {
      project: "Mobile onboarding",
      summary: "Cut first-run setup from eleven screens to four on both mobile clients.",
      notes: "Measured against completion rate, not screen count.",
      status: "In progress",
      labels: ["Customer facing"],
      department: "Engineering",
      team: "Mobile",
      owner_email: "mobile.lead@meridiansoftware.com",
      owner_phone: "+1 (415) 555-0173",
      spec_url: "https://meridiansoftware.com/specs/mobile-onboarding",
      accent: "#0d9488",
      story_points: 21,
      velocity: 6.8,
      budget: 38000,
      complete: 74,
      time_logged: 142,
      open_issues: 5,
      health: 4,
      assets_size: 12582912,
      on_track: true,
      due_date: dateIn(21),
      kickoff_at: timeIn(-24 * 60),
      last_update: timeIn(-2),
      config: { environment: "staging", platforms: ["ios", "android"] },
      milestones: ["Flow rewrite", "Usability test", "Staged rollout"],
      tags: ["mobile", "onboarding"],
    },
    {
      project: "Design system v2",
      summary: "One component library across web and mobile, with tokens for both themes.",
      notes: "Shipped. Adoption tracked per surface.",
      status: "Done",
      labels: ["Internal tooling"],
      department: "Design",
      team: "Product Design",
      owner_email: "design.systems@meridiansoftware.com",
      owner_phone: "+1 (415) 555-0110",
      spec_url: "https://meridiansoftware.com/specs/design-system-v2",
      accent: "#7c3aed",
      story_points: 44,
      velocity: 9.1,
      budget: 61000,
      complete: 100,
      time_logged: 460,
      open_issues: 0,
      health: 5,
      assets_size: 268435456,
      on_track: true,
      due_date: dateIn(-14),
      kickoff_at: timeIn(-24 * 210),
      last_update: timeIn(-24 * 16),
      config: { environment: "production", themes: ["light", "dark"] },
      milestones: ["Token audit", "Component rewrite", "Adoption"],
      tags: ["design-system", "tokens"],
    },
    {
      project: "Brand refresh",
      summary: "New identity for the product family, from logotype through sales collateral.",
      notes: "Waiting on the naming decision before layout work starts.",
      status: "Planned",
      labels: ["Customer facing"],
      department: "Design",
      team: "Brand",
      owner_email: "brand.lead@meridiansoftware.com",
      owner_phone: "+1 (415) 555-0126",
      spec_url: "https://meridiansoftware.com/specs/brand-refresh",
      accent: "#f59e0b",
      story_points: 13,
      velocity: 0,
      budget: 27500,
      complete: 0,
      time_logged: 18,
      open_issues: 2,
      health: 3,
      assets_size: 4194304,
      on_track: true,
      due_date: dateIn(96),
      kickoff_at: timeIn(24 * 10),
      last_update: timeIn(-24 * 4),
      config: { environment: "concept", deliverables: 6 },
      milestones: ["Naming", "Identity", "Collateral"],
      tags: ["brand"],
    },
    {
      project: "Support playbooks",
      summary: "Written, searchable resolution paths for the twenty most common support cases.",
      notes: "Each playbook needs one owner and a review date.",
      status: "In progress",
      labels: ["Internal tooling"],
      department: "Operations",
      team: "Support",
      owner_email: "support.ops@meridiansoftware.com",
      owner_phone: "+1 (415) 555-0155",
      spec_url: "https://meridiansoftware.com/specs/support-playbooks",
      accent: "#16a34a",
      story_points: 18,
      velocity: 5.4,
      budget: 14200,
      complete: 55,
      time_logged: 96,
      open_issues: 7,
      health: 4,
      assets_size: 2097152,
      on_track: true,
      due_date: dateIn(30),
      kickoff_at: timeIn(-24 * 35),
      last_update: timeIn(-9),
      config: { environment: "production", playbooks_written: 11 },
      milestones: ["Case census", "Drafting", "Review"],
      tags: ["support", "documentation"],
    },
    {
      project: "Warehouse move",
      summary: "Relocate fulfilment to the new site with no more than one day of downtime.",
      notes: "Lease starts before the move window opens.",
      status: "Planned",
      labels: ["Compliance"],
      department: "Operations",
      team: "Facilities",
      owner_email: "facilities@meridiansoftware.com",
      owner_phone: "+1 (415) 555-0187",
      spec_url: "https://meridiansoftware.com/specs/warehouse-move",
      accent: "#64748b",
      story_points: 29,
      velocity: 0,
      budget: 240000,
      complete: 5,
      time_logged: 40,
      open_issues: 4,
      health: 3,
      assets_size: 1048576,
      on_track: true,
      due_date: dateIn(140),
      kickoff_at: timeIn(24 * 21),
      last_update: timeIn(-24 * 7),
      config: { environment: "planning", sites: 2, downtime_target_hours: 24 },
      milestones: ["Site prep", "Inventory transfer", "Cutover"],
      tags: ["logistics", "facilities"],
    },
    {
      project: "Content hub launch",
      summary: "A single home for guides and case studies, replacing four scattered pages.",
      notes: "Redirects from the retired pages were verified before launch.",
      status: "Done",
      labels: ["Customer facing", "Revenue"],
      department: "Marketing",
      team: "Content",
      owner_email: "content.lead@meridiansoftware.com",
      owner_phone: "+1 (415) 555-0134",
      spec_url: "https://meridiansoftware.com/specs/content-hub",
      accent: "#0ea5e9",
      story_points: 26,
      velocity: 7.7,
      budget: 46800,
      complete: 100,
      time_logged: 205,
      open_issues: 1,
      health: 5,
      assets_size: 94371840,
      on_track: true,
      due_date: dateIn(-5),
      kickoff_at: timeIn(-24 * 88),
      last_update: timeIn(-24 * 3),
      config: { environment: "production", pages_migrated: 42, redirects: 17 },
      milestones: ["Information architecture", "Migration", "Launch"],
      tags: ["content", "seo"],
    },
  ];

  return {
    key: "project-tracker",
    tableName: "Example: Project Tracker",
    description:
      "A project plan that uses every kind of column the table system offers — money, percentages, ratings, dates, checkboxes, links, tags, colour-coded status and a calculated column. Colours are set by the Status column, over-budget projects are flagged automatically, Budget per point is a formula worked out from Budget and Story points, and the Team column only offers the teams that belong to the department you picked.",
    fields,
    rows,
    style: {
      colorBy: { field: "status", target: "row" },
      rules: [
        {
          id: "budget-over-50k",
          field: "budget",
          op: "gt",
          value: "50000",
          color: "amber",
          target: "cell",
        },
      ],
      rowHighlights: [{ rowIndex: 0, color: "teal" }],
      cellHighlights: [{ rowIndex: 0, fieldName: "health", color: "violet" }],
    },
    dependentTeamFields: [{ fieldName: "team", controlledBy: "department" }],
  };
}

// Industry: office furniture retailer — "Fairmount Office Supply",
// fairmountofficesupply.com (invented, matches no real company).
function buildProductCatalog(): TableSpec {
  const fields: FieldSpec[] = [
    { field_name: "product", display_name: "Product", data_type: "string", format: { id: "text" } },
    { field_name: "sku", display_name: "SKU", data_type: "string", format: { id: "text" } },
    {
      field_name: "price",
      display_name: "Price",
      data_type: "number",
      format: { id: "currency", options: { currency: "USD", precision: 2 } },
    },
    {
      field_name: "margin",
      display_name: "Margin",
      data_type: "number",
      format: { id: "percent", options: { percentScale: "whole" } },
    },
    {
      field_name: "stock",
      display_name: "Stock",
      data_type: "integer",
      format: { id: "integer" },
    },
    {
      field_name: "rating",
      display_name: "Rating",
      data_type: "integer",
      format: { id: "rating", options: { ratingMax: 5 } },
    },
    {
      field_name: "product_url",
      display_name: "Product page",
      data_type: "string",
      format: { id: "url" },
    },
    {
      field_name: "categories",
      display_name: "Categories",
      data_type: "array",
      format: {
        id: "multi_choice",
        options: {
          choices: [
            { value: "Office", color: "blue" },
            { value: "Storage", color: "slate" },
            { value: "Lighting", color: "amber" },
            { value: "Seating", color: "violet" },
            { value: "Accessories", color: "teal" },
          ],
        },
      },
    },
    {
      field_name: "in_stock",
      display_name: "In stock",
      data_type: "boolean",
      format: { id: "boolean" },
    },
    { field_name: "tags", display_name: "Tags", data_type: "array", format: { id: "tags" } },
  ];

  const rows: Record<string, unknown>[] = [
    {
      product: "Standing desk, 60 inch",
      sku: "DSK-6000",
      price: 749.0,
      margin: 34,
      stock: 42,
      rating: 5,
      product_url: "https://fairmountofficesupply.com/products/standing-desk-60",
      categories: ["Office"],
      in_stock: true,
      tags: ["adjustable", "bestseller"],
    },
    {
      product: "Task chair, mesh back",
      sku: "CHR-2200",
      price: 419.5,
      margin: 41,
      stock: 8,
      rating: 4,
      product_url: "https://fairmountofficesupply.com/products/task-chair-mesh",
      categories: ["Seating", "Office"],
      in_stock: true,
      tags: ["ergonomic"],
    },
    {
      product: "Monitor arm, dual",
      sku: "ARM-1120",
      price: 189.0,
      margin: 52,
      stock: 130,
      rating: 4,
      product_url: "https://fairmountofficesupply.com/products/monitor-arm-dual",
      categories: ["Accessories", "Office"],
      in_stock: true,
      tags: ["vesa"],
    },
    {
      product: "Filing cabinet, three drawer",
      sku: "STO-3300",
      price: 265.0,
      margin: 28,
      stock: 0,
      rating: 3,
      product_url: "https://fairmountofficesupply.com/products/filing-cabinet-3",
      categories: ["Storage"],
      in_stock: false,
      tags: ["lockable"],
    },
    {
      product: "Desk lamp, warm dimmable",
      sku: "LGT-0450",
      price: 78.0,
      margin: 61,
      stock: 6,
      rating: 5,
      product_url: "https://fairmountofficesupply.com/products/desk-lamp-warm",
      categories: ["Lighting", "Accessories"],
      in_stock: true,
      tags: ["dimmable", "usb-c"],
    },
    {
      product: "Bookshelf, five tier",
      sku: "STO-5150",
      price: 329.0,
      margin: 30,
      stock: 24,
      rating: 4,
      product_url: "https://fairmountofficesupply.com/products/bookshelf-5",
      categories: ["Storage"],
      in_stock: true,
      tags: ["oak"],
    },
    {
      product: "Conference table, eight seat",
      sku: "TBL-8800",
      price: 2450.0,
      margin: 22,
      stock: 3,
      rating: 4,
      product_url: "https://fairmountofficesupply.com/products/conference-table-8",
      categories: ["Office", "Seating"],
      in_stock: true,
      tags: ["made-to-order"],
    },
    {
      product: "Acoustic panel set",
      sku: "ACC-0710",
      price: 145.0,
      margin: 48,
      stock: 0,
      rating: 3,
      product_url: "https://fairmountofficesupply.com/products/acoustic-panels",
      categories: ["Accessories"],
      in_stock: false,
      tags: ["sound"],
    },
  ];

  return {
    key: "product-catalog",
    tableName: "Example: Product Catalog",
    description:
      "A price list showing how numbers behave: money, profit margins as percentages, whole-number stock counts and star ratings. Rows turn red when stock runs low and grey when an item is no longer in stock, so problems stand out without anyone sorting the table.",
    fields,
    rows,
    style: {
      rules: [
        { id: "stock-low", field: "stock", op: "lt", value: "10", color: "red", target: "row" },
        {
          id: "out-of-stock",
          field: "in_stock",
          op: "is_false",
          color: "slate",
          target: "row",
        },
      ],
    },
  };
}

function buildTeamDirectory(): TableSpec {
  const fields: FieldSpec[] = [
    {
      field_name: "full_name",
      display_name: "Name",
      data_type: "string",
      format: { id: "text" },
    },
    {
      field_name: "work_email",
      display_name: "Work email",
      data_type: "string",
      format: { id: "email" },
    },
    {
      field_name: "work_phone",
      display_name: "Work phone",
      data_type: "string",
      format: { id: "phone" },
    },
    {
      field_name: "department",
      display_name: "Department",
      data_type: "string",
      format: { id: "choice", options: { choices: DEPARTMENT_CHOICES } },
    },
    // Team's format binds to the shared list — written after the table exists.
    { field_name: "team", display_name: "Team", data_type: "string" },
    {
      field_name: "start_date",
      display_name: "Start date",
      data_type: "date",
      format: { id: "date" },
    },
    {
      field_name: "last_active",
      display_name: "Last active",
      data_type: "datetime",
      format: { id: "relative_time" },
    },
    {
      field_name: "remote",
      display_name: "Remote",
      data_type: "boolean",
      format: { id: "boolean" },
    },
    {
      field_name: "onboarding",
      display_name: "Onboarding",
      data_type: "number",
      format: { id: "percent", options: { percentScale: "whole" } },
    },
    {
      field_name: "skills",
      display_name: "Skills",
      data_type: "array",
      format: { id: "array" },
    },
  ];

  const rows: Record<string, unknown>[] = [
    {
      full_name: "A. Okafor",
      work_email: "a.okafor@meridiansoftware.com",
      work_phone: "+1 (312) 555-0118",
      department: "Engineering",
      team: "Platform",
      start_date: dateIn(-24 * 30),
      last_active: timeIn(-3),
      remote: true,
      onboarding: 100,
      skills: ["API design", "Postgres", "Code review"],
    },
    {
      full_name: "B. Lindqvist",
      work_email: "b.lindqvist@meridiansoftware.com",
      work_phone: "+1 (312) 555-0164",
      department: "Engineering",
      team: "Data",
      start_date: dateIn(-410),
      last_active: timeIn(-27),
      remote: false,
      onboarding: 100,
      skills: ["Pipelines", "Reporting"],
    },
    {
      full_name: "C. Moreau",
      work_email: "c.moreau@meridiansoftware.com",
      work_phone: "+1 (312) 555-0192",
      department: "Design",
      team: "Product Design",
      start_date: dateIn(-96),
      last_active: timeIn(-8),
      remote: true,
      onboarding: 85,
      skills: ["Prototyping", "Usability testing"],
    },
    {
      full_name: "D. Haruna",
      work_email: "d.haruna@meridiansoftware.com",
      work_phone: "+1 (312) 555-0146",
      department: "Design",
      team: "Brand",
      start_date: dateIn(-31),
      last_active: timeIn(-1),
      remote: false,
      onboarding: 45,
      skills: ["Illustration", "Motion"],
    },
    {
      full_name: "E. Vasquez",
      work_email: "e.vasquez@meridiansoftware.com",
      work_phone: "+1 (312) 555-0107",
      department: "Operations",
      team: "Support",
      start_date: dateIn(-620),
      last_active: timeIn(-4),
      remote: true,
      onboarding: 100,
      skills: ["Escalations", "Documentation"],
    },
    {
      full_name: "F. Nakamura",
      work_email: "f.nakamura@meridiansoftware.com",
      work_phone: "+1 (312) 555-0159",
      department: "Operations",
      team: "Facilities",
      start_date: dateIn(-210),
      last_active: timeIn(-52),
      remote: false,
      onboarding: 100,
      skills: ["Vendor management", "Safety"],
    },
    {
      full_name: "G. Abara",
      work_email: "g.abara@meridiansoftware.com",
      work_phone: "+1 (312) 555-0171",
      department: "Marketing",
      team: "Content",
      start_date: dateIn(-14),
      last_active: timeIn(-2),
      remote: true,
      onboarding: 30,
      skills: ["Editing", "Interviews"],
    },
    {
      full_name: "H. Petrov",
      work_email: "h.petrov@meridiansoftware.com",
      work_phone: "+1 (312) 555-0183",
      department: "Marketing",
      team: "Growth",
      start_date: dateIn(-300),
      last_active: timeIn(-19),
      remote: true,
      onboarding: 100,
      skills: ["Lifecycle email", "Experiment design"],
    },
  ];

  return {
    key: "team-directory",
    tableName: "Example: Team Directory",
    description:
      "A staff list showing email, phone, start dates and a 'last active' column that reads as plain English like 'three hours ago'. Only the Department column is tinted, and the Team column offers just the teams inside whichever department the row names.",
    fields,
    rows,
    style: { colorBy: { field: "department", target: "cell" } },
    dependentTeamFields: [{ fieldName: "team", controlledBy: "department" }],
  };
}

const SPECS: TableSpec[] = [
  buildProjectTracker(),
  buildProductCatalog(),
  buildTeamDirectory(),
];

// ─── The Supabase client and one narrow RPC helper ───────────────────────────

/**
 * The client is built HERE and its type taken from this factory, so `Client`
 * is exactly what `createClient` returns for these options — the two must not
 * be inferred separately or every call site disagrees about the schema type.
 *
 * Deliberately UNTYPED against `types/database.types.ts`: two of the RPCs this
 * script calls (`udt_set_table_style`, `udt_list_example_tables`) ship in the
 * migration that lands alongside it, so the generated types do not know them
 * yet. Shapes are narrowed by the guards above instead.
 */
function makeClient(creds: Creds) {
  return createClient(creds.url, creds.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Client = ReturnType<typeof makeClient>;

/**
 * Every RPC goes through here so a database refusal reaches the operator with
 * the database's own words and the script stops instead of half-building a
 * table nobody will trust.
 */
async function rpc(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    die(`${name} failed: ${error.message}${error.hint ? ` (hint: ${error.hint})` : ""}`);
  }
  return data as unknown;
}

// ─── The shared pick list ───────────────────────────────────────────────────

/**
 * Find or create "Example: Teams by Department" and return its id.
 *
 * Reused rather than rebuilt on `--reset`: both example tables point at it by
 * id, and recreating it would strand any table not being rebuilt in the same
 * run on a list that no longer exists.
 */
async function ensureTeamList(client: Client, userId: string): Promise<string> {
  const { data, error } = await client
    .schema("workbench")
    .from("udt_structured_lists")
    .select("id,list_name,visibility")
    .eq("list_name", SHARED_LIST_NAME)
    .is("deleted_at", null)
    .limit(1);
  if (error) die(`Could not look up the shared pick list: ${error.message}`);

  const existing = Array.isArray(data) ? data[0] : undefined;
  const existingId = stringField(existing, "id");
  if (existingId) {
    info(`Shared pick list "${SHARED_LIST_NAME}" already exists.`);
    await makeListReadableByEveryone(client, existingId);
    return existingId;
  }

  const created = await rpc(client, "create_user_list", {
    p_list_name: SHARED_LIST_NAME,
    p_description:
      "The teams inside each department. Bound to the Team column of the example tables so it only offers the teams that belong to the department on that row.",
    p_user_id: userId,
    p_is_public: true,
    p_authenticated_read: true,
    p_public_read: true,
    p_items: TEAM_ITEMS,
  });
  const listId = stringField(created, "list_id");
  if (!listId) die("create_user_list returned no list_id.");
  await makeListReadableByEveryone(client, listId);
  ok(`Created the shared pick list "${SHARED_LIST_NAME}" with ${TEAM_ITEMS.length} teams.`);
  return listId;
}

/**
 * `get_structured_list_for_selection` gates on `visibility = 'public'` (or
 * ownership, or a grant), so an example list left private would render every
 * Team column "unavailable" for everyone but the seeding admin. This is the
 * same column write the share dialog performs (`setVisibilityColumn`).
 */
async function makeListReadableByEveryone(client: Client, listId: string): Promise<void> {
  const { data, error } = await client
    .schema("workbench")
    .from("udt_structured_lists")
    .update({ visibility: "public" })
    .eq("id", listId)
    .select("id");
  if (error) {
    die(
      `Could not make the shared pick list readable by every signed-in user: ${error.message}. ` +
        `Without this the Team column is unavailable to everyone but the seeding admin.`,
    );
  }
  if (!Array.isArray(data) || data.length === 0) {
    die(
      `The shared pick list ${listId} accepted no visibility change — it may have been deleted.`,
    );
  }
}

// ─── Building one table ─────────────────────────────────────────────────────

type BuildResult = { tableId: string; rowCount: number; fieldCount: number };

async function buildTable(
  client: Client,
  spec: TableSpec,
  teamListId: string,
): Promise<BuildResult> {
  const created = await rpc(client, "create_user_table_with_fields", {
    p_table_name: spec.tableName,
    p_description: spec.description,
    p_is_public: false,
    p_organization_id: SYSTEM_ORG_ID,
    p_fields: spec.fields.map((f, index) => ({
      field_name: f.field_name,
      display_name: f.display_name,
      data_type: f.data_type,
      field_order: index,
      is_required: false,
    })),
  });
  const tableId = typeof created === "string" ? created : stringField(created, "id");
  if (!tableId) {
    die(`create_user_table_with_fields returned no table id for "${spec.tableName}".`);
  }

  // Learn the real field ids — formats are written by id, not by name.
  const full = await rpc(client, "get_full_table", { ref: { table_id: tableId } });
  const columns = parseColumns(full);
  const idByName = new Map(columns.map((c) => [c.field_name, c.id]));

  for (const field of spec.fields) {
    if (!field.format) continue;
    const fieldId = idByName.get(field.field_name);
    if (!fieldId) {
      die(`"${spec.tableName}" has no column named ${field.field_name} after creation.`);
    }
    await rpc(client, "udt_set_field_format", {
      p_table_id: tableId,
      p_field_id: fieldId,
      p_format: field.format,
    });
  }

  // The dependent column: its options come from the shared list, narrowed to
  // the group named by the controlling column's cell.
  for (const dependent of spec.dependentTeamFields ?? []) {
    const fieldId = idByName.get(dependent.fieldName);
    if (!fieldId) {
      die(`"${spec.tableName}" has no column named ${dependent.fieldName}.`);
    }
    const format: FieldFormatConfig = {
      id: "choice",
      options: {
        structuredList: {
          listId: teamListId,
          groupFromField: dependent.controlledBy,
        },
      },
    };
    await rpc(client, "udt_set_field_format", {
      p_table_id: tableId,
      p_field_id: fieldId,
      p_format: format,
    });
  }

  // ONE call for every row — one transaction, so a table is never half-seeded.
  const written = await rpc(client, "udt_bulk_write", {
    p_table_id: tableId,
    p_operations: spec.rows.map((data) => ({ op: "insert", data })),
  });
  const rowIds = parseWrittenRowIds(written);
  if (rowIds.length !== spec.rows.length) {
    die(
      `"${spec.tableName}": sent ${spec.rows.length} rows but the database returned ${rowIds.length}.`,
    );
  }

  await applyStyle(client, tableId, spec, rowIds);

  return { tableId, rowCount: rowIds.length, fieldCount: spec.fields.length };
}

async function applyStyle(
  client: Client,
  tableId: string,
  spec: TableSpec,
  rowIds: string[],
): Promise<void> {
  const setPath = async (path: string[], value: unknown): Promise<void> => {
    await rpc(client, "udt_set_table_style", {
      p_table_id: tableId,
      p_path: path,
      p_value: value,
    });
  };

  if (spec.style.colorBy) await setPath(["colorBy"], spec.style.colorBy);
  if (spec.style.rules && spec.style.rules.length > 0) {
    await setPath(["rules"], spec.style.rules);
  }
  for (const highlight of spec.style.rowHighlights ?? []) {
    const rowId = rowIds[highlight.rowIndex];
    if (!rowId) die(`"${spec.tableName}" has no row at index ${highlight.rowIndex}.`);
    await setPath(["rows", rowId], highlight.color);
  }
  for (const highlight of spec.style.cellHighlights ?? []) {
    const rowId = rowIds[highlight.rowIndex];
    if (!rowId) die(`"${spec.tableName}" has no row at index ${highlight.rowIndex}.`);
    await setPath(["cells", rowId, highlight.fieldName], highlight.color);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { reset: boolean; only: string | null } {
  let only: string | null = null;
  const reset = argv.includes("--reset");
  const onlyIndex = argv.indexOf("--only");
  if (onlyIndex !== -1) {
    const value = argv[onlyIndex + 1];
    if (!value || value.startsWith("--")) {
      die("--only needs a name, e.g. --only project-tracker");
    }
    only = value.toLowerCase();
  }
  return { reset, only };
}

function matchesOnly(spec: TableSpec, only: string | null): boolean {
  if (!only) return true;
  return (
    spec.key === only ||
    spec.key.includes(only) ||
    spec.tableName.toLowerCase().includes(only)
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }

  const { reset, only } = parseArgs(argv);
  const selected = SPECS.filter((s) => matchesOnly(s, only));
  if (selected.length === 0) {
    die(
      `--only ${only} matched nothing. Known tables: ${SPECS.map((s) => s.key).join(", ")}.`,
    );
  }

  const creds = loadCreds();
  const client = makeClient(creds);

  const { data: auth, error: authError } = await client.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (authError) die(`Sign-in failed: ${authError.message}`);
  const userId = auth.user?.id;
  if (!userId) die("Sign-in returned no user.");
  info(`Signed in as ${creds.email}.`);
  info(`Seeding into the Matrx System organization ${SYSTEM_ORG_ID}.`);

  const existing = parseExampleTables(await rpc(client, "udt_list_example_tables", {}));
  const existingByName = new Map(existing.map((t) => [t.table_name, t.id]));

  const teamListId = await ensureTeamList(client, userId);

  for (const spec of selected) {
    const already = existingByName.get(spec.tableName);
    if (already && !reset) {
      warn(`"${spec.tableName}" exists, skipping — pass --reset to rebuild it. /data/${already}`);
      continue;
    }
    if (already && reset) {
      await rpc(client, "delete_user_table", { p_table_id: already });
      info(`Deleted the existing "${spec.tableName}" (${already}).`);
    }

    const result = await buildTable(client, spec, teamListId);
    ok(
      `"${spec.tableName}" — ${result.fieldCount} columns, ${result.rowCount} rows. ` +
        `/data/${result.tableId}`,
    );
  }

  await client.auth.signOut({ scope: "local" });
}

main().catch((err: unknown) => {
  die(err instanceof Error ? err.message : String(err));
});
