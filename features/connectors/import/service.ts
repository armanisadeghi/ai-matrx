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
