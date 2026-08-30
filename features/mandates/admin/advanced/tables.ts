// features/mandates/admin/advanced/tables.ts
//
// THE X-RAY REGISTRY — the exact relations the advanced console exposes.
//
// This is Arman's x-ray view of the mandate cutover: raw rows, every column,
// no product framing. It exists because the admin database console
// (/administration/database/*) is SQL-FIRST — it has a function editor, an
// enum editor and a SQL textarea, but NO table/row browser for any schema (its
// own surface manifest says so). So "browse + edit + insert + delete a
// mandate.binding row" had no screen anywhere in the product.
//
// Nothing here is a second source of truth: the column list is read LIVE from
// information_schema at request time (see actions.ts), so a migration that adds
// a column shows it on the next load with no code change. Only the relation
// list and the write posture are declared here.

export interface AdvancedRelation {
  /** Postgres schema. Validated as an identifier before it reaches SQL. */
  schema: string;
  /** Postgres relation name. Validated as an identifier before it reaches SQL. */
  table: string;
  /** Tab label. */
  label: string;
  /** One line: what this relation actually holds. */
  blurb: string;
  /**
   * Primary key column used to address a single row for update/delete.
   * A relation with no addressable key is read-only here.
   */
  pk: string | null;
  /** Base tables take writes; views take writes only where a trigger accepts them. */
  writable: boolean;
  /** True when the relation carries `deleted_at` (soft delete is then offered). */
  softDeletes: boolean;
  /** Columns shown first in the grid; the rest follow in ordinal order. */
  lead: readonly string[];
}

export const ADVANCED_RELATIONS: readonly AdvancedRelation[] = [
  {
    schema: "mandate",
    table: "definition",
    label: "mandate.definition",
    blurb:
      "The job record itself. The frozen triad (goal / output_kind / input contract) plus the SYSTEM rung of the binding ladder — default_holder_type, default_holder_id, default_holder_version_id.",
    pk: "id",
    writable: true,
    softDeletes: true,
    lead: [
      "mandate_key",
      "label",
      "origin",
      "goal",
      "output_kind",
      "input_source",
      "provision_key",
      "default_holder_type",
      "default_holder_id",
      "is_enabled",
    ],
  },
  {
    schema: "mandate",
    table: "binding",
    label: "mandate.binding",
    blurb:
      "The ORG and USER rungs of the ladder. principal_type = 'org' | 'user'; there is no 'system' row — the system rung lives in mandate.definition.default_holder_*.",
    pk: "id",
    writable: true,
    softDeletes: true,
    lead: [
      "mandate_id",
      "principal_type",
      "organization_id",
      "subject_user_id",
      "holder_type",
      "holder_id",
      "holder_version_id",
      "is_enabled",
    ],
  },
  {
    schema: "mandate",
    table: "provision",
    label: "mandate.provision",
    blurb:
      "What a code position OFFERS a mandate: offered_values is the full offer a binding's consumption_map draws from.",
    pk: "id",
    writable: true,
    softDeletes: true,
    lead: [
      "provision_key",
      "label",
      "derived_input_kind",
      "code_path",
      "is_enabled",
      "offered_values",
    ],
  },
  {
    schema: "mandate",
    table: "treatment",
    label: "mandate.treatment",
    blurb:
      "The optional pre-made UI a mandate offers (tier widget / document / custom). Absence means default UI — an empty treatment table is not a deficiency.",
    pk: "id",
    writable: true,
    softDeletes: true,
    lead: [
      "mandate_id",
      "tier",
      "name",
      "is_default",
      "audience",
      "is_enabled",
      "config",
    ],
  },
  {
    schema: "mandate",
    table: "vw_shortcut",
    label: "mandate.vw_shortcut",
    blurb:
      "The shortcut compat view in the exact old agent.shortcut shape. SHORTCUT_STORAGE_CUTOVER is ON, so this is the live serving surface for every shortcut. It carries INSTEAD OF triggers, so writes here are real writes into mandate.*.",
    pk: "id",
    writable: true,
    softDeletes: true,
    lead: [
      "label",
      "mandate_key",
      "mandate_id",
      "agent_id",
      "surface_name",
      "display_mode",
      "auto_run",
      "is_active",
    ],
  },
  {
    schema: "mandate",
    table: "shortcut_key_map",
    label: "mandate.shortcut_key_map",
    blurb:
      "The old-shortcut-id → mandate identity map produced by the 6.6 migration. Read-only: it is a derivation, not a record.",
    pk: null,
    writable: false,
    softDeletes: false,
    lead: [],
  },
  {
    schema: "app",
    table: "definition",
    label: "app.definition",
    blurb:
      "Every agent app. APP_MANDATE_CUTOVER is ON, so mandate_id is the column that decides which agent an app actually runs — agent_id is no longer the serving source.",
    pk: "id",
    writable: true,
    softDeletes: true,
    lead: ["slug", "name", "mandate_id", "agent_id", "status", "organization_id"],
  },
];

export function findRelation(key: string): AdvancedRelation | undefined {
  return ADVANCED_RELATIONS.find((r) => relationKey(r) === key);
}

export function relationKey(r: AdvancedRelation): string {
  return `${r.schema}.${r.table}`;
}

export const DEFAULT_RELATION_KEY = relationKey(ADVANCED_RELATIONS[0]);
