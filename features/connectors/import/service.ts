/**
 * features/connectors/import/service.ts
 *
 * Client half of `/google-import/*` — the two import panels' only door to the
 * server. Read-only toward Google: nothing here can change a contact or a task
 * in the person's Google account.
 *
 * It calls `postJson`/`getJson` with the `*Pending` stand-in types from
 * `./types` rather than `lib/api/typed-client`, because the generated contract
 * does not carry these paths yet — see the header of `./types.ts` for why and
 * for the one-file swap that removes this exception.
 */

import { getJson, postJson } from "@/lib/python-client";
import type {
  ContactFieldChoicePending,
  ContactFieldSpecPending,
  ContactImportResultPending,
  ContactSearchResultPending,
  TaskImportResultPending,
  TaskListingResultPending,
} from "./types";

const CONTACT_FIELDS_PATH = "/google-import/contacts/fields";
const CONTACT_SEARCH_PATH = "/google-import/contacts/search";
const CONTACT_IMPORT_PATH = "/google-import/contacts/import";
const TASK_LIST_PATH = "/google-import/tasks/list";
const TASK_IMPORT_PATH = "/google-import/tasks/import";
const OTHER_CONTACTS_PREVIEW_PATH = "/google-integrations/other-contacts/preview";
const OTHER_CONTACTS_REVIEW_PATH = "/google-integrations/other-contacts/review";
const OTHER_CONTACTS_IMPORT_PATH = "/google-integrations/other-contacts/import";
const OTHER_CONTACTS_ADMISSION_PATH = "/google-integrations/other-contacts/admission";

export interface OtherContactsAdmissionPending {
  eligible: boolean;
  admission_error: string | null;
  message: string;
}

/** Server-derived gate for the unlinked, non-consent Other Contacts reviewer. */
export async function getOtherContactsAdmission(
  signal?: AbortSignal,
): Promise<OtherContactsAdmissionPending> {
  const { data } = await getJson<OtherContactsAdmissionPending>(
    OTHER_CONTACTS_ADMISSION_PATH,
    { signal },
  );
  return data;
}

export interface OtherContactPreviewPending {
  resource_name: string;
  display_name: string;
  emails: string[];
  phones: string[];
  source: "google_other_contacts";
}

export interface OtherContactsPreviewPending {
  contacts: OtherContactPreviewPending[];
  next_page_token: string | null;
  source: "google_other_contacts";
  access_mode: "internal_test_read_only";
}

export interface OtherContactTargetPending {
  person_id: string | null;
  person_name: string | null;
  create_new: boolean;
  matched_by: string | null;
}

export interface OtherContactsReviewPending {
  fingerprint: string;
  target: OtherContactTargetPending;
  receipt: string;
  result: ContactImportResultPending;
}

export interface OtherContactsPreviewArgs {
  connectionId: string;
  pageToken?: string | null;
  signal?: AbortSignal;
}

/** One bounded page from the exact personal connection the reviewer selected. */
export async function previewOtherContacts(
  args: OtherContactsPreviewArgs,
): Promise<OtherContactsPreviewPending> {
  const { data } = await postJson<OtherContactsPreviewPending>(
    OTHER_CONTACTS_PREVIEW_PATH,
    {
      connection_id: args.connectionId,
      page_token: args.pageToken ?? null,
      page_size: 50,
    },
    { signal: args.signal },
  );
  return data;
}

export interface OtherContactsReviewArgs {
  organizationId: string;
  connectionId: string;
  resourceName: string;
  fields: ContactFieldChoicePending[];
  signal?: AbortSignal;
}

/** Freshly reads the one selection and returns the CRM match/mapping review. */
export async function reviewOtherContact(
  args: OtherContactsReviewArgs,
): Promise<OtherContactsReviewPending> {
  const { data } = await postJson<OtherContactsReviewPending>(
    OTHER_CONTACTS_REVIEW_PATH,
    {
      organization_id: args.organizationId,
      connection_id: args.connectionId,
      resource_name: args.resourceName,
      fields: args.fields,
    },
    { organizationId: args.organizationId, signal: args.signal },
  );
  return data;
}

export interface OtherContactsImportArgs extends OtherContactsReviewArgs {
  receipt: string;
  target: OtherContactTargetPending;
}

/** Applies only the exact, unexpired review receipt returned above. */
export async function importOtherContact(
  args: OtherContactsImportArgs,
): Promise<ContactImportResultPending> {
  const { data } = await postJson<ContactImportResultPending>(
    OTHER_CONTACTS_IMPORT_PATH,
    {
      organization_id: args.organizationId,
      connection_id: args.connectionId,
      resource_name: args.resourceName,
      review_receipt: args.receipt,
      fields: args.fields,
      target: args.target,
    },
    { organizationId: args.organizationId, signal: args.signal },
  );
  return data;
}

export async function fetchContactFieldSpecs(
  organizationId: string,
  signal?: AbortSignal,
): Promise<ContactFieldSpecPending[]> {
  const { data } = await getJson<ContactFieldSpecPending[]>(CONTACT_FIELDS_PATH, {
    // ONE explicit organization per call. Without this the transport stamps
    // `X-Organization-Id` from the Redux selection, which is NOT necessarily
    // the org the panel is writing into (a CRM list scoped to another org, or
    // the personal fallback) — a header/body disagreement the server refuses.
    organizationId,
    signal,
  });
  return data;
}

export interface ContactSearchArgs {
  organizationId: string;
  query?: string;
  limit?: number;
  googleAccount?: string | null;
  signal?: AbortSignal;
}

export async function searchGoogleContacts(
  args: ContactSearchArgs,
): Promise<ContactSearchResultPending> {
  const { data } = await postJson<ContactSearchResultPending>(
    CONTACT_SEARCH_PATH,
    {
      organization_id: args.organizationId,
      query: args.query?.trim() || null,
      limit: args.limit ?? 50,
      google_account: args.googleAccount ?? null,
    },
    { organizationId: args.organizationId, signal: args.signal },
  );
  return data;
}

export interface ContactImportArgs {
  organizationId: string;
  contacts: { externalId: string; fields?: ContactFieldChoicePending[] }[];
  dryRun: boolean;
  googleAccount?: string | null;
  signal?: AbortSignal;
}

/**
 * Preview (`dryRun`) or apply. The SAME call is "Import from Google Contacts"
 * and "Update from Google": on a Person that already exists the plan IS the
 * diff, and a value edited here comes back `kept_manual`.
 */
export async function importGoogleContacts(
  args: ContactImportArgs,
): Promise<ContactImportResultPending> {
  const { data } = await postJson<ContactImportResultPending>(
    CONTACT_IMPORT_PATH,
    {
      organization_id: args.organizationId,
      google_account: args.googleAccount ?? null,
      dry_run: args.dryRun,
      contacts: args.contacts.map((contact) => ({
        external_id: contact.externalId,
        fields: contact.fields ?? [],
      })),
    },
    { organizationId: args.organizationId, signal: args.signal },
  );
  return data;
}

export interface TaskListingArgs {
  organizationId: string;
  googleAccount?: string | null;
  signal?: AbortSignal;
}

export async function listGoogleTasks(
  args: TaskListingArgs,
): Promise<TaskListingResultPending> {
  const { data } = await postJson<TaskListingResultPending>(
    TASK_LIST_PATH,
    {
      organization_id: args.organizationId,
      google_account: args.googleAccount ?? null,
    },
    { organizationId: args.organizationId, signal: args.signal },
  );
  return data;
}

export interface TaskImportArgs {
  organizationId: string;
  taskListId: string;
  taskIds: string[];
  projectId?: string | null;
  dryRun: boolean;
  googleAccount?: string | null;
  signal?: AbortSignal;
}

export async function importGoogleTasks(
  args: TaskImportArgs,
): Promise<TaskImportResultPending> {
  const { data } = await postJson<TaskImportResultPending>(
    TASK_IMPORT_PATH,
    {
      organization_id: args.organizationId,
      google_account: args.googleAccount ?? null,
      task_list_id: args.taskListId,
      task_ids: args.taskIds,
      project_id: args.projectId ?? null,
      dry_run: args.dryRun,
    },
    { organizationId: args.organizationId, signal: args.signal },
  );
  return data;
}
