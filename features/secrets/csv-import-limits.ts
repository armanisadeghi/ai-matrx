import { fetchKnobIndex } from "@/lib/scoped-config/service";

import type { CsvImportLimits } from "./csv-import";

const KEYS = [
  "max_file_bytes",
  "max_records",
  "max_columns",
  "max_cell_bytes",
  "max_fields",
  "max_plaintext_field_bytes",
  "max_request_body_bytes",
] as const;

/** The import is intentionally unavailable until the scoped knob authority is live. */
export async function fetchCsvImportLimits(
  organizationId: string,
  userId: string,
): Promise<CsvImportLimits> {
  const knobs = await fetchKnobIndex({
    organizationId,
    userId,
    featurePrefix: "vault.import",
  });
  const values = Object.fromEntries(
    knobs.map((knob) => [knob.key, knob.effective_value]),
  );
  const parsed = KEYS.map((key) => Number(values[key]));
  if (parsed.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new Error(
      "Vault import is not configured for this organization yet.",
    );
  }
  return {
    maxFileBytes: parsed[0],
    maxRecords: parsed[1],
    maxColumns: parsed[2],
    maxCellBytes: parsed[3],
    maxFields: parsed[4],
    maxPlaintextFieldBytes: parsed[5],
    maxRequestBodyBytes: parsed[6],
  };
}

export async function fetchBitwardenJsonImportLimits(
  organizationId: string,
  userId: string,
): Promise<CsvImportLimits & { maxJsonDepth: number; jsonWorkerTimeoutMs: number }> {
  const base = await fetchCsvImportLimits(organizationId, userId);
  const knobs = await fetchKnobIndex({ organizationId, userId, featurePrefix: "vault.import" });
  const values = Object.fromEntries(knobs.map((knob) => [knob.key, knob.effective_value]));
  const maxJsonDepth = Number(values.json_max_depth);
  const jsonWorkerTimeoutMs = Number(values.json_worker_timeout_ms);
  if (![maxJsonDepth, jsonWorkerTimeoutMs].every((value) => Number.isSafeInteger(value) && value > 0)) throw new Error("Bitwarden JSON import is not configured for this organization yet.");
  return { ...base, maxJsonDepth, jsonWorkerTimeoutMs };
}
