import type { Json } from "@/types/database.types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Shared envelope for many `user_*` table RPCs (`success` + optional `error`). */
function unwrapSuccessEnvelope(
  data: Json | null | undefined,
): Record<string, unknown> {
  if (!isRecord(data) || typeof data.success !== "boolean") {
    throw new Error("Invalid user-table RPC response shape");
  }
  if (!data.success) {
    const msg = data.error;
    throw new Error(typeof msg === "string" ? msg : "Request failed");
  }
  return data;
}

export function unwrapGetUserTables(data: Json | null | undefined): unknown[] {
  const p = unwrapSuccessEnvelope(data);
  return Array.isArray(p.tables) ? p.tables : [];
}

export interface UnwrappedUserTableComplete {
  table: Record<string, unknown>;
  fields: unknown[];
  data: unknown[];
}

export function unwrapGetUserTableComplete(
  data: Json | null | undefined,
): UnwrappedUserTableComplete {
  const p = unwrapSuccessEnvelope(data);
  if (!isRecord(p.table)) {
    throw new Error("get_user_table_complete: missing table object");
  }
  return {
    table: p.table,
    fields: Array.isArray(p.fields) ? p.fields : [],
    data: Array.isArray(p.data) ? p.data : [],
  };
}

export function unwrapGetUserTableDataPaginatedRows(
  data: Json | null | undefined,
): unknown[] {
  const p = unwrapSuccessEnvelope(data);
  return Array.isArray(p.data) ? p.data : [];
}

export function unwrapUserTableMutation(data: Json | null | undefined): void {
  unwrapSuccessEnvelope(data);
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
