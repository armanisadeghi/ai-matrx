import type { Database } from "@/types/database.types";

/** The durable comparison row — `workflow.comparison`, read directly. */
export type ComparisonRow =
  Database["workflow"]["Tables"]["comparison"]["Row"];

/**
 * One arm's durable state inside `ComparisonRow.arms` (a jsonb ARRAY — index
 * is the arm's identity). Written only by the server; the client renders it
 * and follows `run_id` for live per-node progress.
 */
export interface ComparisonArm {
  index: number;
  label: string;
  definition_id: string;
  /** null = the CURRENT definition; a number pins that stored version. */
  version_number: number | null;
  input_overrides: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  run_id?: string;
  started_at?: string;
  finished_at?: string;
  heartbeat_at?: string;
  cost_usd?: number;
  cost_summary?: {
    total_cost_usd?: number;
    total_input_tokens?: number;
    total_output_tokens?: number;
    request_count?: number;
  };
  /** The run's WHOLE output — rendered by kind, no privileged key. */
  output?: Record<string, unknown>;
  error?: string;
  reaped_at?: string;
  settled_from_run_at?: string;
}

/** A column being configured before the comparison starts. */
export interface ArmDraft {
  /** Stable client-side id for React keys / blind shuffle. */
  draftId: string;
  label: string;
  definitionId: string | null;
  definitionName: string | null;
  /** null = current version. */
  versionNumber: number | null;
  /** Latest stored version number, for the picker's "current (vN)" copy. */
  latestVersion: number | null;
  /** This arm's explicit variation on top of the locked shared inputs. */
  inputOverrides: Record<string, unknown>;
}

export function parseArms(row: ComparisonRow): ComparisonArm[] {
  const raw = row.arms;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, i) => {
    const a = (entry ?? {}) as Record<string, unknown>;
    return {
      index: typeof a.index === "number" ? a.index : i,
      label: typeof a.label === "string" ? a.label : `Arm ${i + 1}`,
      definition_id: typeof a.definition_id === "string" ? a.definition_id : "",
      version_number:
        typeof a.version_number === "number" ? a.version_number : null,
      input_overrides:
        a.input_overrides && typeof a.input_overrides === "object"
          ? (a.input_overrides as Record<string, unknown>)
          : {},
      status:
        a.status === "running" ||
        a.status === "completed" ||
        a.status === "failed"
          ? a.status
          : "pending",
      run_id: typeof a.run_id === "string" ? a.run_id : undefined,
      started_at: typeof a.started_at === "string" ? a.started_at : undefined,
      finished_at:
        typeof a.finished_at === "string" ? a.finished_at : undefined,
      heartbeat_at:
        typeof a.heartbeat_at === "string" ? a.heartbeat_at : undefined,
      cost_usd: typeof a.cost_usd === "number" ? a.cost_usd : undefined,
      cost_summary:
        a.cost_summary && typeof a.cost_summary === "object"
          ? (a.cost_summary as ComparisonArm["cost_summary"])
          : undefined,
      output:
        a.output && typeof a.output === "object"
          ? (a.output as Record<string, unknown>)
          : undefined,
      error: typeof a.error === "string" ? a.error : undefined,
      reaped_at: typeof a.reaped_at === "string" ? a.reaped_at : undefined,
      settled_from_run_at:
        typeof a.settled_from_run_at === "string"
          ? a.settled_from_run_at
          : undefined,
    };
  });
}
