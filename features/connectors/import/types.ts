/**
 * features/connectors/import/types.ts
 *
 * The `/google-import/*` contracts, as STAND-IN types.
 *
 * 🚨 These are `*Pending` stand-ins, not hand-mirrored truth. The generated
 * contract (`types/python-generated/api-types.ts`) does not carry
 * `/google-import/*` yet: regenerating it needs a live aidream checkout with DB
 * env, which this container does not have (register
 * `common-docs/projects/google-native/REGISTER.md` § Facts, 2026-09-17).
 *
 * REMEDY, for the first session that has it: run `pnpm sync-types`, then delete
 * every type in this file and import the generated operation types through
 * `lib/api/typed-client` (`apiPost`) exactly as
 * `features/crm/import/connectors/service.ts` already does for
 * `/crm/import/connectors`. The service beside this file is the only consumer,
 * so the swap is one file plus this one.
 *
 * Source of truth while they are stand-ins: `aidream/api/routers/google_import.py`
 * and the Pydantic models in `aidream/services/google_import/`.
 */

/** One row of the declared Google field → Person field map. */
export interface ContactFieldSpecPending {
  key: string;
  label: string;
  person_field: string;
  person_label: string;
  multi: boolean;
}

export interface ContactCandidatePending {
  external_id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  job_title: string;
  company: string;
  emails: string[];
  phones: string[];
  source_updated_at: string | null;
  already_imported: boolean;
  person_id: string | null;
  person_name: string | null;
  imported_at: string | null;
}

export interface ContactSearchResultPending {
  provider_key: string;
  google_account: string | null;
  contacts: ContactCandidatePending[];
  count: number;
  total_read: number;
  already_imported: number;
  truncated: boolean;
  warnings: string[];
}

/** What the write will actually do to ONE Person field. */
export type ContactFieldActionPending =
  | "create"
  | "fill"
  | "unchanged"
  | "kept_manual"
  | "added"
  | "present"
  | "excluded";

export interface ContactFieldPlanPending {
  key: string;
  label: string;
  person_field: string;
  person_label: string;
  value: string | string[] | null;
  current_value: string | string[] | null;
  action: ContactFieldActionPending;
  current_state: string;
  source_ref: string | null;
  imported_at: string | null;
}

export interface ContactImportOutcomePending {
  external_id: string;
  display_name: string;
  person_id: string | null;
  person_name: string | null;
  created: boolean;
  matched_by: string | null;
  fields: ContactFieldPlanPending[];
  written_fields: string[];
  kept_manual_fields: string[];
  contact_points_added: number;
  note: string;
}

export interface ContactImportResultPending {
  provider_key: string;
  google_account: string | null;
  dry_run: boolean;
  results: ContactImportOutcomePending[];
  warnings: string[];
}

export interface ContactFieldChoicePending {
  key: string;
  include: boolean;
  value?: string | string[] | null;
}

export interface TaskCandidatePending {
  task_id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  status: string | null;
  completed_at: string | null;
  source_updated_at: string | null;
  already_imported: boolean;
  matrx_task_id: string | null;
  imported_at: string | null;
  changes: string[];
  kept_local: string[];
}

export interface TaskListViewPending {
  task_list_id: string;
  title: string;
  tasks: TaskCandidatePending[];
  total: number;
  already_imported: number;
  importable: number;
  has_more: boolean;
  count_line: string;
}

export interface TaskListingResultPending {
  google_account: string | null;
  task_lists: TaskListViewPending[];
  total: number;
  already_imported: number;
  importable: number;
  warnings: string[];
}

export type TaskOutcomeActionPending =
  | "created"
  | "updated"
  | "unchanged"
  | "kept_local"
  | "would_create"
  | "would_update";

export interface TaskImportOutcomePending {
  task_id: string;
  title: string;
  action: TaskOutcomeActionPending;
  matrx_task_id: string | null;
  changed_fields: string[];
  kept_local_fields: string[];
  note: string;
}

export interface TaskImportResultPending {
  google_account: string | null;
  task_list_id: string;
  task_list: string;
  dry_run: boolean;
  results: TaskImportOutcomePending[];
  created: number;
  updated: number;
  unchanged: number;
  warnings: string[];
}
