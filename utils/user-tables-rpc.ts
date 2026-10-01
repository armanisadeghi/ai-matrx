// utils/user-tables-rpc.ts — shape guards for the rows the data seam returns
// (`features/data-tables/service.ts`): a table in a list, a column, a page row.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isTableFieldExportRow(
  f: unknown,
): f is { field_name: string; display_name: string } {
  return (
    isRecord(f) &&
    typeof f.field_name === "string" &&
    typeof f.display_name === "string"
  );
}

export function isPaginatedDataRow(
  row: unknown,
): row is { id: string; data: Record<string, unknown> } {
  return isRecord(row) && typeof row.id === "string" && isRecord(row.data);
}

export interface UserTableListRow {
  id: string;
  table_name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  is_public: boolean;
}

export function isUserTableListRow(value: unknown): value is UserTableListRow {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.table_name === "string" &&
    (value.description === undefined ||
      typeof value.description === "string") &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string" &&
    typeof value.is_public === "boolean"
  );
}

export interface UserTableFieldRow {
  id: string;
  field_name: string;
  display_name: string;
  data_type: string;
  field_order: number;
  is_required: boolean;
}

export function isUserTableFieldRow(
  value: unknown,
): value is UserTableFieldRow {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.field_name === "string" &&
    typeof value.display_name === "string" &&
    typeof value.data_type === "string" &&
    typeof value.field_order === "number" &&
    typeof value.is_required === "boolean"
  );
}
