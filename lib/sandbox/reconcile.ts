/**
 * Reconcile Supabase `sandbox_instances` rows against the live orchestrators.
 *
 * Why this exists: the active-sandbox limit is enforced by counting rows in
 * Supabase whose status is one of {creating, starting, ready, running}. If a
 * container is destroyed out-of-band (orchestrator crash, container exit,
 * manual `docker rm`, or — historically — an in-memory orchestrator restart
 * dropping its store), the Supabase row stays "ready" forever and burns a
 * limit slot. This module asks each tier's orchestrator whether it still
 * knows about the row's `sandbox_id`; if not, the row is marked stopped.
 *
 * Server-only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import {
  resolveOrchestratorByTier,
  orchestratorJsonHeaders,
} from "@/lib/sandbox/orchestrator-routing";
import type { Database } from "@/types/database.types";
import type {
  SandboxConfig,
  SandboxProbeResponse,
  SandboxTier,
} from "@/types/sandbox";

const ACTIVE_STATUSES = ["creating", "starting", "ready", "running"] as const;
const ORCHESTRATOR_DEAD_STATUSES = new Set(["stopped", "destroyed", "error"]);

/**
 * The server-internal probe result is the same shape the FE consumes —
 * deliberately re-exported through the shared `SandboxProbeResponse` type so
 * the two sides can never drift on field names or aliveness strings.
 */
export type SandboxProbeResult = SandboxProbeResponse;

export interface ReconcileResult {
  total: number;
  reconciled: number;
  still_active: number;
  unreachable: number;
  rows: SandboxProbeResult[];
}

type SandboxRowMin = Pick<
  Database["public"]["Tables"]["sandbox_instances"]["Row"],
  "id" | "sandbox_id" | "status" | "config" | "tier"
>;

/**
 * Resolve a row's tier with the same precedence the rest of the codebase uses:
 * dedicated `tier` column first, fall back to `config.tier` for legacy rows
 * written before the column was promoted, default to `'ec2'` last.
 */
function resolveRowTier(row: SandboxRowMin): SandboxTier {
  const colTier = row.tier === "ec2" || row.tier === "hosted" ? row.tier : null;
  const cfg = row.config as SandboxConfig | null;
  const cfgTier =
    cfg?.tier === "ec2" || cfg?.tier === "hosted" ? cfg.tier : null;
  const resolved = colTier ?? cfgTier ?? null;
  if (resolved === null) {
    console.error(
      `[reconcile] sandbox row ${row.id} (sandbox_id: ${row.sandbox_id}) has no tier in column or config. ` +
        "Falling back to 'ec2' for reconciliation. Update the row to suppress this error.",
    );
    return "ec2";
  }
  return resolved;
}

/**
 * Ask the orchestrator whether `row` still exists and act on the answer.
 *
 *   - `alive`        → leave Supabase untouched
 *   - `gone`         → mutate Supabase: status='destroyed', stopped_at=now,
 *                      stop_reason='reconcile_orphan'
 *   - `unreachable`  → leave Supabase untouched (transient network blip;
 *                      retrying later is the right call)
 *
 * Returns a `SandboxProbeResult` either way so the caller can render the
 * outcome consistently (single-row probe + bulk reconcile share the type).
 *
 * `userId` is required to gate the destroy-write under Supabase RLS — the
 * caller is the one who already proved ownership.
 */
export async function probeAndReconcileSandboxRow(
  supabase: SupabaseClient<Database>,
  row: SandboxRowMin,
  userId: string,
): Promise<SandboxProbeResult> {
  const tier = resolveRowTier(row);
  const target = resolveOrchestratorByTier(tier);

  let aliveness: SandboxProbeResult["aliveness"] = "unreachable";
  let httpStatus = 0;

  try {
    const resp = await fetch(`${target.url}/sandboxes/${row.sandbox_id}`, {
      method: "GET",
      headers: orchestratorJsonHeaders(target),
      signal: AbortSignal.timeout(5_000),
    });
    httpStatus = resp.status;
    if (resp.status === 404) {
      aliveness = "gone";
    } else if (resp.ok) {
      const body = (await resp.json().catch(() => ({}))) as { status?: string };
      // MATRX-EXCEPTION: `?? ""` is a Set-membership sentinel — an absent
      // status never matches ORCHESTRATOR_DEAD_STATUSES, correctly falling
      // through to "alive" (the same as the response carrying no status at all).
      aliveness = ORCHESTRATOR_DEAD_STATUSES.has(body.status ?? "")
        ? "gone"
        : "alive";
    }
  } catch {
    aliveness = "unreachable";
  }

  if (aliveness === "alive") {
    return {
      id: row.id,
      sandbox_id: row.sandbox_id,
      tier,
      aliveness,
      http_status: httpStatus,
      prior_status: row.status,
      new_status: row.status,
      reason: `orchestrator returned http=${httpStatus} (alive)`,
    };
  }
  if (aliveness === "unreachable") {
    return {
      id: row.id,
      sandbox_id: row.sandbox_id,
      tier,
      aliveness,
      http_status: httpStatus,
      prior_status: row.status,
      new_status: row.status,
      reason: `orchestrator unreachable (http=${httpStatus})`,
    };
  }

  // 'gone' — mark the row destroyed so it stops counting against the active
  // limit and stops appearing as a connect target.
  const { error: updateErr } = await supabase
    .from("sandbox_instances")
    .update({
      status: "destroyed",
      stopped_at: new Date().toISOString(),
      stop_reason: "reconcile_orphan",
    })
    .eq("id", row.id)
    .eq("user_id", userId);

  if (updateErr) {
    console.error("[reconcile] update failed:", updateErr);
    return {
      id: row.id,
      sandbox_id: row.sandbox_id,
      tier,
      aliveness,
      http_status: httpStatus,
      prior_status: row.status,
      new_status: row.status,
      reason: `update failed: ${updateErr.message}`,
    };
  }

  return {
    id: row.id,
    sandbox_id: row.sandbox_id,
    tier,
    aliveness,
    http_status: httpStatus,
    prior_status: row.status,
    new_status: "destroyed",
    reason: `orchestrator returned http=${httpStatus} (gone)`,
  };
}

/**
 * Reconcile every active sandbox row owned by `userId` against the live
 * orchestrators. Returns a summary; mutates Supabase in place.
 *
 * Network-call cost: one HTTP call per active row, in parallel. With the
 * 5-row cap this is at most 5 concurrent calls — fine.
 */
export async function reconcileUserSandboxes(
  userId: string,
): Promise<ReconcileResult> {
  const supabase = await createClient();

  // Pull `tier` (column) AND `config` so the helper can resolve the row's
  // tier with the same precedence as the rest of the codebase.
  const { data: rows, error } = await supabase
    .from("sandbox_instances")
    .select("id, sandbox_id, status, config, tier")
    .eq("user_id", userId)
    .in("status", [...ACTIVE_STATUSES])
    .is("deleted_at", null);

  if (error || !rows || rows.length === 0) {
    return {
      total: 0,
      reconciled: 0,
      still_active: 0,
      unreachable: 0,
      rows: [],
    };
  }

  // Run every row in parallel (capped at 5 by the active-sandbox limit).
  const results = await Promise.all(
    rows.map((row) => probeAndReconcileSandboxRow(supabase, row, userId)),
  );

  let reconciled = 0;
  let stillActive = 0;
  let unreachable = 0;
  const summary: SandboxProbeResult[] = [];
  for (const r of results) {
    if (r.aliveness === "alive") {
      stillActive += 1;
      continue;
    }
    if (r.aliveness === "unreachable") {
      unreachable += 1;
    } else if (r.new_status === "destroyed") {
      reconciled += 1;
    }
    summary.push(r);
  }

  return {
    total: rows.length,
    reconciled,
    still_active: stillActive,
    unreachable,
    rows: summary,
  };
}
