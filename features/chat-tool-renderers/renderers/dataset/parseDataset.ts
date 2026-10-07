import type { ToolLifecycleEntry } from "@ai-matrx/chat/agents/types/request.types";
import { resultAsObject, getArg } from "@ai-matrx/chat/tool-call-visualization/renderers/_shared";
import { isUuidShape } from "@ai-matrx/kit/uuid";

/**
 * Parse the `dataset` tool results.
 * - `dataset` → { dataset_id, metadata: {dataset_name, description, row_count}, fields: [...] }
 *   (The UUID guard below drops a non-id so we render a summary, not a dead link.)
 */
export interface ParsedDatasetField {
  name: string;
  type: string | null;
  displayName: string | null;
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

export function parseDataset(entry: ToolLifecycleEntry): ParsedDataset {
  const r = resultAsObject(entry) ?? {};
  const meta = (
    r.metadata && typeof r.metadata === "object" ? r.metadata : {}
  ) as Record<string, unknown>;

  const rawId =
    asStr(r.table_id) ??
    asStr(meta.table_id) ??
    asStr(getArg<string>(entry, "table_id")) ??
    // Results and calls saved before 2026-10-07 say dataset_id.
    asStr(r.dataset_id) ??
    asStr(meta.dataset_id) ??
    asStr(getArg<string>(entry, "dataset_id"));
  const id = rawId && isUuidShape(rawId) ? rawId : null;

  const fields: ParsedDatasetField[] = Array.isArray(r.fields)
    ? r.fields
        .map((f) => {
          const o = (f ?? {}) as Record<string, unknown>;
          return {
            name: asStr(o.field_name) ?? asStr(o.display_name) ?? "",
            type: asStr(o.data_type),
            displayName: asStr(o.display_name),
          };
        })
        .filter((f) => f.name)
    : [];

  return {
    id,
    name:
      asStr(meta.table_name) ?? asStr(r.table_name) ?? asStr(meta.dataset_name) ?? asStr(r.dataset_name),
    description: asStr(meta.description) ?? asStr(r.description),
    rowCount: asNum(meta.row_count) ?? asNum(r.row_count),
    fields,
  };
}
