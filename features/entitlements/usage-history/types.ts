import type { Database, Json } from "@/types/database.types";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";

type UsageLedgerRow = Database["billing"]["Tables"]["usage_ledger"]["Row"];

export const USAGE_HISTORY_PAGE_SIZE = 20;

export type UsageHistoryRange = "7d" | "30d" | "90d" | "all";
export type UsageHistoryActivity = "all" | "executions";

export interface UsageHistoryQuery {
  range: UsageHistoryRange;
  activity: UsageHistoryActivity;
  /** UI position only; data pagination is strictly cursor-based. */
  page: number;
  /** A fixed upper bound prevents rows created during pagination entering later pages. */
  snapshotAt: string | null;
  /** The final row from the preceding page, used for descending keyset pagination. */
  cursor: UsageHistoryCursor | null;
}

export interface UsageHistoryCursor {
  createdAt: string;
  id: string;
}

export interface UsageHistoryEntry {
  id: string;
  createdAt: string;
  quantity: number | null;
  activity: string | null;
  outcome: string | null;
}

export interface UsageHistoryPage {
  entries: UsageHistoryEntry[];
  snapshotAt: string;
  nextCursor: UsageHistoryCursor | null;
}

type UsageMetadata = {
  execution_type?: unknown;
  /** User-safe category written by the server for hard-cost rows ("SMS", "Web search"); never a vendor. */
  activity?: unknown;
  link_kind?: unknown;
  status?: unknown;
};

function metadataRecord(value: Json): UsageMetadata {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UsageMetadata
    : {};
}

function displayMetadataValue(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return humanizeIdentifier(value.trim()) || null;
}

function plainLabel(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Maps the small, user-safe portion of a ledger row. Metadata payloads are
 * deliberately not exposed: the history is about the recorded accounting
 * event, not the input or output that caused it.
 */
export function toUsageHistoryEntry(row: Pick<UsageLedgerRow, "id" | "created_at" | "quantity" | "metadata">): UsageHistoryEntry {
  const metadata = metadataRecord(row.metadata);
  return {
    id: row.id,
    createdAt: row.created_at,
    quantity: typeof row.quantity === "number" && Number.isFinite(row.quantity)
      ? row.quantity
      : null,
    activity:
      plainLabel(metadata.activity) ??
      (metadata.link_kind === "external_api" ? "Connected service" : null) ??
      displayMetadataValue(metadata.execution_type),
    outcome: displayMetadataValue(metadata.status),
  };
}
