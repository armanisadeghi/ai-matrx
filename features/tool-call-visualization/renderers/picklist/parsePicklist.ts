import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { resultAsObject, getArg } from "../_shared";

/**
 * Normalize the `picklist` tool result across its actions. The dominant case is
 * `create` -> { list_id, list_name, item_count, already_existed, message }; the
 * `get` action nests the row under `list`. Anything with a resolvable list id
 * gets the rich list render; the rest fall back to the message.
 */
export interface PicklistSummary {
  listId: string | null;
  listName: string | null;
  itemCount: number | null;
  alreadyExisted: boolean;
  message: string | null;
}

const asStr = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

export function parsePicklist(entry: ToolLifecycleEntry): PicklistSummary {
  const r = resultAsObject(entry) ?? {};
  const list = (
    r.list && typeof r.list === "object" ? r.list : {}
  ) as Record<string, unknown>;

  const listId = asStr(r.list_id) ?? asStr(list.id) ?? asStr(list.list_id);
  const listName =
    asStr(r.list_name) ??
    asStr(list.name) ??
    asStr(list.list_name) ??
    asStr(getArg<string>(entry, "picklist_name"));
  const itemCount =
    typeof r.item_count === "number"
      ? r.item_count
      : typeof list.item_count === "number"
        ? (list.item_count as number)
        : null;

  return {
    listId,
    listName,
    itemCount,
    alreadyExisted: r.already_existed === true,
    message: asStr(r.message),
  };
}
