// lib/scheduler-client/types.ts
//
// Wire types for the sch_* tables. These are auto-generated from the DB
// schema by `pnpm update-supabase-types`; we re-export the Row/Insert/Update
// triplets through stable names and add a handful of literal unions that
// mirror the CHECK constraints in the migrations.
//
// Mirrors packages/matrx-scheduler/matrx_scheduler/models.py in the aidream
// repo — keep both in lockstep with the DB.

import type { Database, Json } from "@/types/database.types";

// ── sch_task ───────────────────────────────────────────────────────────────

export type SchTaskRow = Database["public"]["Tables"]["sch_task"]["Row"];
export type SchTaskInsert = Database["public"]["Tables"]["sch_task"]["Insert"];
export type SchTaskUpdate = Database["public"]["Tables"]["sch_task"]["Update"];

// ── sch_run ────────────────────────────────────────────────────────────────

export type SchRunRow = Database["public"]["Tables"]["sch_run"]["Row"];
export type SchRunInsert = Database["public"]["Tables"]["sch_run"]["Insert"];
export type SchRunUpdate = Database["public"]["Tables"]["sch_run"]["Update"];

// ── sch_trigger ────────────────────────────────────────────────────────────

export type SchTriggerRow = Database["public"]["Tables"]["sch_trigger"]["Row"];
export type SchTriggerInsert =
    Database["public"]["Tables"]["sch_trigger"]["Insert"];
export type SchTriggerUpdate =
    Database["public"]["Tables"]["sch_trigger"]["Update"];

// ── sch_agent_task ─────────────────────────────────────────────────────────

export type SchAgentTaskRow =
    Database["public"]["Tables"]["sch_agent_task"]["Row"];
export type SchAgentTaskInsert =
    Database["public"]["Tables"]["sch_agent_task"]["Insert"];
export type SchAgentTaskUpdate =
    Database["public"]["Tables"]["sch_agent_task"]["Update"];

// ── Literal unions (the generator emits these as plain `string`) ──────────
//
// These mirror the CHECK constraints in 2026_05_10_sch_v0.sql and the
// matching Literals in packages/matrx-scheduler/matrx_scheduler/models.py.

/** Run status — matches sch_run_status_chk. */
export type RunStatus =
    | "queued"
    | "claimed"
    | "running"
    | "success"
    | "failed"
    | "cancelled"
    | "skipped";

/** Trigger type — matches sch_trigger_type_chk. */
export type TriggerType =
    | "one-shot"
    | "interval"
    | "cron"
    | "heartbeat"
    | "context-match"
    | "event"
    | "manual"
    | "dependency";

/** Agent task auth mode — matches sch_agent_task_auth_mode_chk. */
export type AgentAuthMode = "ask" | "auto";

/**
 * sch_run.output_ref polymorphic pointer.
 *
 * Stored as `Json | null` on the DB row, but every consumer narrows to
 * `{ kind, id }`. Unknown kinds fall through to the default branch in
 * renderers — they're not removed in case the producer added a new kind
 * faster than the consumer was rebuilt.
 */
export type OutputRefKind = "conversation" | "capture" | "workflow_run";

export interface OutputRef {
    kind: OutputRefKind | (string & {});
    id: string;
    [extra: string]: Json | undefined;
}

// Re-export Json for downstream callers that need to type-annotate
// jsonb values without dragging in the full database.types module.
export type { Json };
