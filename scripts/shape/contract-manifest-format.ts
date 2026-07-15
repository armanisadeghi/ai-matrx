/**
 * The checked-in snapshot format for the aidream generated-contract inventory
 * (scripts/shape/content-ir-contract-manifest.json).
 *
 * Written ONLY by scripts/shape/refresh-contract-manifest.ts (which shells to
 * aidream's `scripts/sync_content_ir_contracts.py --json`); read by the
 * content-vocab crosswalk generator and the shape doctor CLI. Pure types +
 * a guarded reader — no fs side effects at import time.
 */

/** One publisher manifest entry (the fields we persist — slim + stable). */
export interface ContractManifestEntry {
  kind: string;
  family: string;
  direction: string;
  source_id: string;
  source_name: string;
  label: string;
  version: number;
  fingerprint: string;
}

export interface ContractManifestSnapshot {
  _generated: string;
  generated_for: string;
  source: string;
  families: Record<string, number>;
  contracts: ContractManifestEntry[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse + validate a snapshot document; throws a descriptive Error on any shape problem. */
export function parseContractManifestSnapshot(jsonText: string): ContractManifestSnapshot {
  const parsed: unknown = JSON.parse(jsonText);
  if (!isRecord(parsed)) throw new Error("snapshot root is not an object");
  const { generated_for, source, families, contracts, _generated } = parsed;
  if (typeof _generated !== "string") throw new Error(`snapshot "_generated" missing`);
  if (typeof generated_for !== "string") throw new Error(`snapshot "generated_for" missing`);
  if (typeof source !== "string") throw new Error(`snapshot "source" missing`);
  if (!isRecord(families)) throw new Error(`snapshot "families" is not an object`);
  if (!Array.isArray(contracts)) throw new Error(`snapshot "contracts" is not an array`);
  const familyCounts: Record<string, number> = {};
  for (const [k, v] of Object.entries(families)) {
    if (typeof v !== "number") throw new Error(`snapshot families.${k} is not a number`);
    familyCounts[k] = v;
  }
  const entries: ContractManifestEntry[] = contracts.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`contracts[${i}] is not an object`);
    const str = (field: string): string => {
      const v = entry[field];
      if (typeof v !== "string") throw new Error(`contracts[${i}].${field} is not a string`);
      return v;
    };
    if (typeof entry.version !== "number") throw new Error(`contracts[${i}].version is not a number`);
    return {
      kind: str("kind"),
      family: str("family"),
      direction: str("direction"),
      source_id: str("source_id"),
      source_name: str("source_name"),
      label: str("label"),
      version: entry.version,
      fingerprint: str("fingerprint"),
    };
  });
  if (entries.length === 0) throw new Error("snapshot has zero contracts");
  return { _generated, generated_for, source, families: familyCounts, contracts: entries };
}
