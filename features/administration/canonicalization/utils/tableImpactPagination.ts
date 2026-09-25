import type { TableImpactPage, TableImpactRow } from "../types";
import { isJsonObject, type JsonObject } from "@/types/json";
import { errorMessageFrom, readJsonObject } from "./apiClient";

const TABLE_IMPACT_ROUTE = "/api/admin/canonicalization/table-impact";

type TableImpactFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "statusText" | "json">>;

function isTableImpactRow(value: unknown): value is TableImpactRow {
  if (!isJsonObject(value)) return false;
  return (
    (typeof value.function_sig === "string" || value.function_sig === null) &&
    (typeof value.dependency === "string" || value.dependency === null) &&
    (typeof value.currently_broken === "boolean" ||
      value.currently_broken === null) &&
    (value.referenced_columns === null ||
      (Array.isArray(value.referenced_columns) &&
        value.referenced_columns.every((column) => typeof column === "string")))
  );
}

function parsePage(value: JsonObject): TableImpactPage {
  if (!Array.isArray(value.rows)) {
    throw new Error("Preflight returned an invalid dependency list");
  }
  const rows = value.rows.map((row) => {
    if (!isTableImpactRow(row)) {
      throw new Error("Preflight returned an invalid dependency list");
    }
    return row;
  });
  if (
    typeof value.total !== "number" ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0
  ) {
    throw new Error("Preflight returned an invalid dependency count");
  }
  if (typeof value.fingerprint !== "string" || !/^[a-f0-9]{32}$/.test(value.fingerprint)) {
    throw new Error("Preflight returned an invalid snapshot fingerprint");
  }
  if (
    value.nextOffset !== null &&
    (typeof value.nextOffset !== "number" ||
      !Number.isSafeInteger(value.nextOffset) ||
      value.nextOffset < 0)
  ) {
    throw new Error("Preflight returned an invalid continuation");
  }
  return { rows, total: value.total, fingerprint: value.fingerprint, nextOffset: value.nextOffset };
}

/** Reads every counted, ordered page; an incomplete or changing result is an error, never a partial preflight. */
export async function fetchAllTableImpactRows(
  input: {
    schema: string;
    table: string;
  },
  request: TableImpactFetch = fetch,
): Promise<{ rows: TableImpactRow[]; total: number }> {
  let offset = 0;
  let expectedTotal: number | null = null;
  let expectedFingerprint: string | null = null;
  const allRows: TableImpactRow[] = [];

  while (true) {
    const res = await request(TABLE_IMPACT_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, offset }),
    });
    const data = await readJsonObject(res);
    if (!res.ok) throw new Error(errorMessageFrom(data, res));
    const page = parsePage(data);
    if (expectedTotal === null) expectedTotal = page.total;
    if (expectedFingerprint === null) expectedFingerprint = page.fingerprint;
    if (page.total !== expectedTotal) {
      throw new Error(
        "Preflight changed while its dependency list was being read; retry it",
      );
    }
    if (page.fingerprint !== expectedFingerprint) {
      throw new Error(
        "Preflight changed while its dependency list was being read; retry it",
      );
    }

    allRows.push(...page.rows);
    if (allRows.length > expectedTotal) {
      throw new Error("Preflight returned more rows than its dependency count");
    }
    if (page.nextOffset === null) {
      if (allRows.length !== expectedTotal) {
        throw new Error(
          "Preflight ended before its complete dependency list was read; retry it",
        );
      }
      return { rows: allRows, total: expectedTotal };
    }
    if (page.nextOffset !== offset + page.rows.length) {
      throw new Error("Preflight returned an invalid dependency continuation");
    }
    offset = page.nextOffset;
  }
}
