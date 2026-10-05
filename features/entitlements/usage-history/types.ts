import type { Database, Json } from "@/types/database.types";

type UsageLedgerRow = Database["billing"]["Tables"]["usage_ledger"]["Row"];

export const USAGE_HISTORY_PAGE_SIZE = 20;

export type UsageHistoryRange = "7d" | "30d" | "90d" | "all";
export type UsageHistoryActivity = "all" | "executions";

export interface UsageHistoryQuery {
  range: UsageHistoryRange;
  activity: UsageHistoryActivity;
  page: number;
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
  page: number;
  hasNextPage: boolean;
}

type UsageMetadata = {
  execution_type?: unknown;
  status?: unknown;
};

function metadataRecord(value: Json): UsageMetadata {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UsageMetadata
    : {};
}

function readableValue(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
    activity: readableValue(metadata.execution_type),
    outcome: readableValue(metadata.status),
  };
}
