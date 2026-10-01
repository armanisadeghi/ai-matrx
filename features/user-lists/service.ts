/**
 * User Lists service — every pick list lives in the record store as a Table of choices
 * (one Record per choice, same ids). Reads go through THE LIST INDEX and the list doors that
 * answer from the store; a choice is written through the records client, in the list's own
 * organization and the person's own seat.
 */
import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";

import { createClient, supabase } from "@/utils/supabase/client";
import type {
  UserList,
  UserListWithItems,
  CreateListInput,
  UpdateListInput,
  StructuredListForSelection,
} from "./types";
import { accessiblePickLists } from "./where-lists-live";

// ─── Index ────────────────────────────────────────────────────────────────────

/** Every pick list the signed-in person may open, across all their organizations. */
export async function getAccessibleLists(): Promise<UserList[]> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) return [];
  return accessiblePickLists(supabase, userId);
}

// ─── Detail ────────────────────────────────────────────────────────────────────

export async function getListWithItems(
  listId: string,
): Promise<UserListWithItems | null> {
  const { data, error } = await supabase.rpc("get_user_list_with_items", {
    p_list_id: listId,
  });
  if (error) throw new Error(`Failed to load list: ${error.message}`);
  return (data as unknown as UserListWithItems) ?? null;
}

/**
 * Label-only read path for CONSUMERS (chat / agent apps / widgets). Returns
 * labels / help_text / groups / icons but NEVER the secret item `description`.
 * Backed by the get_structured_list_for_selection RPC (SECURITY DEFINER) so it
 * works even for a private list bound to an agent the caller is running. Use this
 * — never getListWithItems — anywhere a non-owner can see the result.
 */
export async function getStructuredListForSelection(
  listId: string,
): Promise<StructuredListForSelection | null> {
  const { data, error } = await supabase.rpc("get_structured_list_for_selection", {
    p_list_id: listId,
  });
  if (error) throw new Error(`Failed to load picklist: ${error.message}`);
  return (data as unknown as StructuredListForSelection) ?? null;
}

// ─── Create ────────────────────────────────────────────────────────────────────

/**
 * A new pick list, born in the record store — a Table of choices marked as a pick list, one Record
 * per item — through the store's one pick-list birth door, `custom.pick_list_create`. Answers
 * `{ list_id, list_name, address, organization_id, items, ... }`.
 */
export async function createList(input: CreateListInput) {
  const { data, error } = await supabase
    .schema("custom" as never)
    .rpc("pick_list_create" as never, {
      // object-org-exempt: a NEW list has no organization of its own yet; it is born where the person chose to make it
      p_organization_id: input.p_organization_id,
      p_list_name: input.p_list_name,
      p_description: input.p_description ?? null,
      p_items: (input.p_items ?? []).map((item) => ({
        label: item.Label,
        ...(item.Description ? { description: item.Description } : {}),
        ...(item["Help Text"] ? { help_text: item["Help Text"] } : {}),
        ...(item.Group ? { group_name: item.Group } : {}),
      })),
    } as never);
  if (error) throw new Error(`Failed to create list: ${error.message}`);
  return data as { list_id?: string } | null;
}

// ─── Update ────────────────────────────────────────────────────────────────────

/** Rename / re-describe a list (and, with `p_items`, rewrite its choices) through `update_user_list`. */
export async function updateList(input: UpdateListInput) {
  const { data, error } = await supabase.rpc("update_user_list", {
    p_list_id: input.p_list_id,
    p_list_name: input.p_list_name,
    p_description: input.p_description,
    p_is_public: input.p_is_public,
    p_public_read: input.p_public_read,
    p_items: input.p_items !== undefined ? input.p_items : null,
  });
  if (error) throw new Error(`Failed to update list: ${error.message}`);
  return data;
}

// ─── Choices (Records of the list's Table) ────────────────────────────────────

/** The records client for one list: its own organization, the person's own seat. */
async function recordsClientForList(listId: string): Promise<RecordsClient> {
  const list = await getListWithItems(listId);
  if (!list?.organization_id) {
    throw new Error("This list could not be opened, so nothing was written to it.");
  }
  const { data: session } = await supabase.auth.getSession();
  return createRecordsClient({
    dataSource: recordsDataSource(createClient()),
    actor: personActor(session.session?.user?.id ?? null),
    organizationId: list.organization_id,
  });
}

export interface NewChoice {
  label: string;
  description?: string;
  helpText?: string;
  groupName?: string;
}

/** Add choices to a list — one Record each in the list's Table, in order. */
export async function addChoices(listId: string, choices: NewChoice[]): Promise<void> {
  const client = await recordsClientForList(listId);
  for (const choice of choices) {
    const written = await client.recordWrite({
      table_id: listId,
      data: {
        name: choice.label,
        ...(choice.description ? { description: choice.description } : {}),
        ...(choice.helpText ? { help_text: choice.helpText } : {}),
        ...(choice.groupName ? { group_name: choice.groupName } : {}),
      },
    });
    if (!written.ok) throw new Error(`Failed to add "${choice.label}": ${written.error.message}`);
  }
}

/** Change one choice. Absent = leave alone; null = clear. */
export async function updateChoice(
  listId: string,
  choiceId: string,
  patch: {
    label?: string;
    description?: string | null;
    helpText?: string | null;
    groupName?: string | null;
  },
): Promise<void> {
  const client = await recordsClientForList(listId);
  const fields: Record<string, unknown> = {};
  if (patch.label !== undefined) fields.name = patch.label;
  if (patch.description !== undefined) fields.description = patch.description;
  if (patch.helpText !== undefined) fields.help_text = patch.helpText;
  if (patch.groupName !== undefined) fields.group_name = patch.groupName;
  const updated = await client.recordUpdate({ record_id: choiceId, patch: fields });
  if (!updated.ok) throw new Error(`Failed to update the choice: ${updated.error.message}`);
}
