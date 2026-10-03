/**
 * features/connectors/import/types.ts
 *
 * Contact-import stand-ins plus canonical generated Tasks aliases.
 *
 * 🚨 The Contact `*Pending` shapes remain stand-ins. Tasks listing/import and
 * reviewed write shapes come from `@ai-matrx/agents/generated/api-types`.
 *
 * REMEDY when the remaining Contact paths are generated: delete those local
 * Contact shapes and import the operation types through `lib/api/typed-client` exactly as
 * `features/crm/import/connectors/service.ts` already does for
 * `/crm/import/connectors`. The service beside this file is the only consumer,
 * so the swap is one file plus this one.
 *
 * Source of truth while they are stand-ins: `aidream/api/routers/google_import.py`
 * and the Pydantic models in `aidream/services/google_import/`. Re-synced
 * 2026-09-17 against that checkout, which had grown `explanation`, the
 * `unrecorded` state, and multi-match resolution (`match_state`,
 * `choice_required`, `candidates`) since these types were written — a stand-in
 * that lags the server renders labels for actions the server no longer sends.
 *
 * 🚨 EVERY FIELD THE SERVER ADDED IS OPTIONAL HERE ON PURPOSE: the DEPLOYED
 * image can be older than the checkout, so a panel that required `explanation`
 * would render empty sentences against the live server.
 */

import type { components } from "@ai-matrx/agents/generated/api-types";

/** One row of the declared Google field → Person field map. */
export interface ContactFieldSpecPending {
  key: string;
  label: string;
  person_field: string;
  person_label: string;
  multi: boolean;
}

/** What the resolver says this Google contact would do here. */
export type ContactMatchStatePending =
  | "new"
  | "imported"
  | "matched"
  | "choice_required";

/** One existing Person a Google contact resolves to — enough to open it. */
export interface PersonCandidatePending {
  person_id: string;
  person_name: string;
  matched_by: string;
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
  match_state?: ContactMatchStatePending;
  matched_by?: string | null;
  candidates?: PersonCandidatePending[];
}

export interface ContactSearchResultPending {
  provider_key: string;
  google_account: string | null;
  /** Exact connection that supplied these rows; absent in older test fixtures. */
  connection_id?: import("@ai-matrx/agents/generated/api-types").components["schemas"]["ContactSearchResult"]["connection_id"];
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
  /** Differs, with NO record of what the import wrote — kept, NOT called an edit. */
  | "unrecorded"
  /**
   * The organization's `reimport_policy` is `ask`: Google disagrees with a
   * value this import did not write, and NOTHING is written until a person
   * picks a side. Mirrors aidream `services/google_import/contacts.py`'s
   * `FieldAction` (added 2026-09-17, lane B-15's `ask` reimport policy).
   */
  | "conflict"
  /** Nothing is decided until the person says which Person this is. */
  | "choice_required"
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
  /** The SERVER's sentence for this row — true in every branch. */
  explanation?: string;
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
  /** Values with no provenance stamp: kept as they are, and NOT called edits. */
  unrecorded_fields?: string[];
  /**
   * 🚨 FIELDS THE PLAN PROMISED AND THE ROW REFUSED — locked on the Person
   * between the review and the save (aidream lane B-10, `refused_fields`). Empty
   * on every ordinary import, and never silent when it is not: the outcome card
   * names each one by LABEL with the remedy.
   */
  refused_fields?: string[];
  /** The reviewed Person changed before apply, so this contact was not written. */
  target_moved?: string | null;
  contact_points_added: number;
  /** True when this contact matched more than one Person — nothing was written. */
  choice_required?: boolean;
  candidates?: PersonCandidatePending[];
  note: string;
}

export interface ContactImportResultPending {
  provider_key: string;
  google_account: string | null;
  dry_run: boolean;
  results: ContactImportOutcomePending[];
  /** How many contacts were refused because they matched several People. */
  choice_required?: number;
  warnings: string[];
}

export interface ContactFieldChoicePending {
  key: string;
  include: boolean;
  value?: string | string[] | null;
  /**
   * 🚨 THE PERSON'S EXPLICIT "take Google's value here" over a value this import
   * did not write (`kept_manual` / `unrecorded`). Nothing else overwrites one:
   * the server's `_explicit_choice` is `include && (override_manual || value is
   * not None)`, so before this existed a tick with nothing retyped was sent and
   * silently discarded while the row said "will replace yours" (aidream lane
   * B-10, `/projects/google-native/VERIFY-B1-B2-R2.md` N1). Built in one place:
   * `./contract.ts` → `contactFieldChoice`.
   */
  override_manual?: boolean;
}

export type TaskCandidatePending = components["schemas"]["TaskCandidate"];
export type TaskListViewPending = components["schemas"]["TaskListView"];
export type TaskListingResultPending = components["schemas"]["TaskListingResult"];
export type TaskOutcomeActionPending = components["schemas"]["TaskImportOutcome"]["action"];
export type TaskImportOutcomePending = components["schemas"]["TaskImportOutcome"];
export type TaskImportResultPending = components["schemas"]["TaskImportResult"];
