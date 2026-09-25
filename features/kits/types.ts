// features/kits/types.ts — the kit manifest and the install record.
//
// A kit is DATA, not code: one `public.catalog_entries` row (app 'matrx', kind 'kit')
// whose `payload` is a `KitManifest`. Contract:
// common-docs/projects/data-kits/PLAN.md § P2 (+ the owner's binding contract change,
// 2026-09-25: the binding written onto a forked agent is the server's merge-field
// declaration, snake_case).

/** A column, in the words `@ai-matrx/records` `declareTable` takes (NewFieldSpec). */
export interface KitFieldSpec {
  key: string;
  label: string;
  /** A field type word the store accepts (`text`, `long_text`, `number`, `single_select`, `entity_reference` …). */
  type: string;
  sort?: number;
  required?: boolean;
  multi?: boolean;
  config?: Record<string, unknown>;
  options?: string[];
  /** An `entity_reference` column: the platform record kinds it may point at (e.g. `ai_model`). */
  allowedTypes?: string[];
  unit?: string;
  kind?: "date" | "datetime";
  /** A relation to ANOTHER table of this kit, by its manifest key — resolved at install. */
  relation_table_key?: string;
  /** Free-form help text shown in the preview. */
  description?: string;
}

export interface KitTable {
  key: string;
  name: string;
  description: string;
  icon?: string;
  fields: KitFieldSpec[];
  /** Seed values keyed by field key. Entity refs as `{token, id}`; a row of another kit table as `{table_key, record_index}`. */
  records: Record<string, unknown>[];
}

/**
 * THE BINDING, AS A MANIFEST CARRIES IT. The installed shape (`MergeFieldBinding`)
 * with the two ids replaced by kit-local handles the installer resolves.
 */
export interface KitBinding extends Omit<MergeFieldBinding, "table_id" | "record_id"> {
  table_key: string;
  record_index?: number;
}

/**
 * THE BINDING WRITTEN ONTO THE FORKED AGENT's `variable_definitions[i].binding` —
 * the server's merge-field declaration (owner contract change, 2026-09-25).
 */
export interface MergeFieldBinding {
  kind: "merge_field";
  source: "record";
  semantic_type: "collection" | "reference" | "value";
  table_id: string;
  record_id?: string;
  field_key?: string;
  match?: Record<string, unknown>;
  limit?: number;
  sort?: { field: string; dir: "asc" | "desc" };
  transform?: { name: string; template?: string; join?: string; max?: number };
  missing?: string;
  override_policy?: string;
}

export interface KitAgent {
  key: string;
  source_agent_id: string;
  name: string;
  description: string;
  bindings: { variable: string; binding: KitBinding }[];
  try_it?: { user_input?: string; variables?: Record<string, string> };
}

export interface KitWorkflow {
  key: string;
  name: string;
  description: string;
  /** `{{table:<key>}}` / `{{agent:<key>}}` placeholders are resolved at install. */
  definition: unknown;
}

export type KitHighlightKind = "table" | "agent" | "workflow" | "binding";

export interface KitGuideStep {
  title: string;
  body: string;
  highlight?: { kind: KitHighlightKind; key: string };
}

export interface KitManifest {
  schema_version?: number;
  version: number;
  key: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  icon: string;
  accent?: string;
  teaches: string[];
  tables: KitTable[];
  agents: KitAgent[];
  workflows: KitWorkflow[];
  guide: KitGuideStep[];
}

/** A kit as the gallery reads it: the manifest plus its catalog row facts. */
export interface KitEntry {
  key: string;
  sortOrder: number;
  manifest: KitManifest;
  /** The organization that publishes it (the platform's system org for platform kits). */
  organizationId: string | null;
  createdBy: string | null;
}

// ─── the install record ─────────────────────────────────────────────────────

export type KitInstallStatus = "installing" | "installed" | "failed" | "removed";

/**
 * EVERY ID AN INSTALL CREATED, recorded before the next step starts — a re-run
 * RESUMES from these ids and never matches anything by name, so a person's own
 * same-named table is never adopted.
 */
export interface KitInstallSteps {
  tables?: Record<string, string>;
  records?: Record<string, string[]>;
  agents?: Record<string, string>;
  bindings?: Record<string, boolean>;
  workflows?: Record<string, string>;
}

export interface KitInstallRecord {
  /** The install record's own id — also the install id stamped onto what it made. */
  id: string;
  kit_key: string;
  kit_version: number;
  organization_id: string;
  status: KitInstallStatus;
  steps: KitInstallSteps;
  /** The last failure, in the sentence the failing door gave. */
  error?: string | null;
  /** Where the install ledger lives (its table), so a screen can open it. */
  ledger_table_id: string;
}

// ─── the live stepper ───────────────────────────────────────────────────────

export type InstallStepState = "pending" | "running" | "done" | "failed" | "skipped";

export interface InstallStepLink {
  label: string;
  href: string;
}

export interface InstallStepView {
  id: string;
  label: string;
  state: InstallStepState;
  detail?: string;
  links?: InstallStepLink[];
}

/** What the preview door answers (PLAN.md § P1), read defensively. */
export interface BindingPreview {
  text: string;
  /** False when `text` is a named absence (see `absent_reason`). */
  present: boolean;
  row_count: number | null;
  /** Rows that matched before the cap. */
  total_rows: number | null;
  truncated: boolean;
  absent_reason: string | null;
  /** Cap, template and freshness notes — shown, never only traced. */
  notes: string[];
  /** Field keys masked for this reader — named, never shown. */
  withheld: string[];
  trace: unknown;
}
