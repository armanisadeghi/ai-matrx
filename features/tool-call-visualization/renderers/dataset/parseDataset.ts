import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { resultAsObject, getArg } from "../_shared";

/**
 * Parse the `dataset` and `usertable_create` tool results.
 * - `dataset` → { dataset_id, metadata: {dataset_name, description, row_count}, fields: [...] }
 * - `usertable_create` → { table_id, table_name, description, row_count }
 *   (NOTE: this tool is currently backend-broken and may put an error string in
 *   `table_id`; the UUID guard below drops it so we render a summary, not a dead link.)
 */
export interface ParsedDatasetField {
  name: string;
  type: string | null;
}

export interface ParsedDataset {
  id: string | null;
  name: string | null;
  description: string | null;
  rowCount: number | null;
  fields: ParsedDatasetField[];
}

const asStr = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;
const asNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseDataset(entry: ToolLifecycleEntry): ParsedDataset {
  const r = resultAsObject(entry) ?? {};
  const meta = (
    r.metadata && typeof r.metadata === "object" ? r.metadata : {}
  ) as Record<string, unknown>;

  const rawId =
    asStr(r.dataset_id) ??
    asStr(meta.dataset_id) ??
    asStr(r.table_id) ??
    asStr(getArg<string>(entry, "dataset_id"));
  const id = rawId && UUID_RE.test(rawId) ? rawId : null;

  const fields: ParsedDatasetField[] = Array.isArray(r.fields)
    ? r.fields
        .map((f) => {
          const o = (f ?? {}) as Record<string, unknown>;
          return {
            name: asStr(o.field_name) ?? asStr(o.display_name) ?? "",
            type: asStr(o.data_type),
          };
        })
        .filter((f) => f.name)
    : [];

  return {
    id,
    name:
      asStr(meta.dataset_name) ?? asStr(r.dataset_name) ?? asStr(r.table_name),
    description: asStr(meta.description) ?? asStr(r.description),
    rowCount: asNum(meta.row_count) ?? asNum(r.row_count),
    fields,
  };
}
