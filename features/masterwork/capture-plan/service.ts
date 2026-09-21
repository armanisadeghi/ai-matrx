// features/masterwork/capture-plan/service.ts
//
// Reading and writing the Capture Plan on `platform.rulebook.metadata`, and the
// one call the browser cannot make itself.
//
// 🚨 METADATA ONLY, AND `version` IS NEVER BUMPED — the same rule and the same
// reason as the Prediction Ledger beside it. `version` is the RULES version a
// built Masterwork drifts against; scheduling a session is not a change to the
// rules, and bumping it would make a freshly built Masterwork read "needs
// rebuild" the moment somebody made a plan. The column stays the compare-and-
// swap token: we guard ON it without moving it.
//
// Direct supabase-js for the plan itself, per platform doctrine. The ONE server
// call is the reminder reconcile, because addressing a person, resolving their
// channel preferences and rendering a template are the notification spine's job
// and no feature builds its own notifier.

import { supabase } from "@/utils/supabase/client";
import { guardedUpdate } from "@ai-matrx/data/db";
import { doorCas } from "@/lib/db/door-cas";
import { callApi } from "@/lib/api/call-api";
import type { AppStore } from "@/lib/redux/store";
import { operationFailed } from "@/utils/errors";
import type { paths } from "@/types/python-generated/api-types";
import { parseRulebook, type Rulebook, type RulebookRow } from "../types";
import { plannableMethod } from "./methods";
import {
  CAPTURE_PLAN_SCHEMA,
  readCapturePlan,
  type CapturePlanState,
  type PlanSession,
} from "./types";

const rulebookTable = () => supabase.schema("platform").from("rulebook");

/** How many times a write re-reads and re-applies before giving up. */
const MAX_ATTEMPTS = 3;

/**
 * Served by `aidream/aidream/services/capture_plan/reminders.py`.
 *
 * Cast pending the OpenAPI type sync — the precedent the probe, unfolding and
 * prediction lanes all set. Until `pnpm sync-types` runs on a machine with
 * database access, a wrong path fails LOUDLY with the real HTTP error rather
 * than quietly.
 */
export const REMINDER_PATH = "/masterworks/capture-plan/reminders" as keyof paths;

export type PlanWriteResult =
  | { status: "saved"; rulebook: Rulebook; state: CapturePlanState }
  /** The row moved under us on every attempt — the caller reloads and says so. */
  | { status: "conflict" }
  | { status: "not_found" };

/** The plan as it stands on a Rulebook already in hand. No round trip. */
export function planOf(rulebook: Pick<Rulebook, "metadata">): CapturePlanState {
  return readCapturePlan(rulebook.metadata);
}

/**
 * THE ONE WRITE. Every plan change goes through here: read the row, transform
 * the plan state, compare-and-swap on the version we read. The transform runs
 * again on every retry against the FRESH state, so two tabs never lose one
 * another's session — the loser of a race re-applies its own change to the
 * winner's state rather than overwriting it.
 */
export async function mutatePlan(
  rulebookId: string,
  transform: (state: CapturePlanState) => CapturePlanState,
): Promise<PlanWriteResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { data, error } = await rulebookTable()
      .select("*")
      .eq("id", rulebookId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw operationFailed("save your capture plan", error);
    if (!data) return { status: "not_found" };

    const row = data as RulebookRow;
    const next = transform(readCapturePlan(row.metadata));
    const result = await guardedUpdate<RulebookRow>({
      expectedVersion: row.version,
      // No `nextVersion` in the patch — see the header.
      // THE DOOR, and it removes the read-modify-write this block was built on:
      // only the ONE metadata key this feature owns is sent, and `rulebook_save`
      // MERGES it, so a sibling key written between the read above and this write
      // can no longer be lost. The CAS is unchanged — it lives inside the door now,
      // and answers NULL on a miss exactly as guardedUpdate already reads.
      applyUpdate: ({ expectedVersion }) =>
        doorCas<RulebookRow>(
          supabase.rpc("rulebook_save", {
            p_rulebook_id: rulebookId,
            p_expected_version: expectedVersion,
            p_metadata_patch: {
              capture_plan: { ...next, schema: CAPTURE_PLAN_SCHEMA },
            } as never,
          }),
        ),
      fetchCurrent: () =>
        rulebookTable()
          .select("*")
          .eq("id", rulebookId)
          .is("deleted_at", null)
          .maybeSingle(),
    });
    if (result.status === "saved") {
      return { status: "saved", rulebook: parseRulebook(result.row), state: next };
    }
    if (result.status === "not_found") return { status: "not_found" };
    // conflict → loop, re-read, re-apply the same transform to the new state.
  }
  return { status: "conflict" };
}

export interface ReminderOutcome {
  queued: number;
  superseded: number;
  /** The server's own words when something could not be queued. Never invented. */
  problem: string | null;
}

/**
 * Bring the standing reminders into agreement with the plan.
 *
 * Called after EVERY plan change — create, complete, skip, stop. It is a
 * reconcile, so calling it twice changes nothing the second time, and a plan
 * with no scheduled sessions withdraws the lot.
 *
 * A reminder problem is never allowed to break a plan: this returns the
 * server's sentence and the plan page prints it. The plan itself is already
 * saved by the time this runs.
 */
export async function reconcileReminders(
  store: AppStore,
  args: {
  rulebookId: string;
  rulebookName: string;
  planId: string;
  sessions: readonly PlanSession[];
  channel: string;
  leadMinutes: number;
  /** Only sessions due inside this window get a reminder queued now. */
  horizonHours: number;
  },
): Promise<ReminderOutcome> {
  const body = {
    rulebook_id: args.rulebookId,
    rulebook_name: args.rulebookName,
    plan_id: args.planId,
    channel: args.channel,
    lead_minutes: args.leadMinutes,
    sessions: args.sessions
      .filter(
        (s) =>
          s.status === "scheduled" &&
          new Date(s.dueAt).getTime() <=
            Date.now() + Math.max(1, args.horizonHours) * 3_600_000,
      )
      .map((s) => ({
        session_id: s.id,
        method: s.method,
        ask: plannableMethod(s.method)?.ask ?? "Your next capture session is ready.",
        minutes: s.plannedMinutes,
        due_at: s.dueAt,
      })),
  };
  try {
    // 🚨 `callApi` resolves to `{ data, error }`, never the body itself.
    const response = await store.dispatch(
      callApi({ path: REMINDER_PATH, method: "POST", body: body as never }),
    );
    const failed = (response as { error?: { message?: string } }).error;
    if (failed) {
      return {
        queued: 0,
        superseded: 0,
        problem:
          failed.message ??
          "The plan is saved, but the reminders could not be set up. Open this page whenever you like — every session is listed here.",
      };
    }
    const payload =
      (response as {
        data?: { queued?: number; superseded?: number; problem?: string | null };
      }).data ?? {};
    return {
      queued: Number(payload.queued ?? 0),
      superseded: Number(payload.superseded ?? 0),
      problem: payload.problem ?? null,
    };
  } catch (error) {
    return {
      queued: 0,
      superseded: 0,
      problem:
        error instanceof Error
          ? `The plan is saved, but the reminders could not be set up: ${error.message}`
          : "The plan is saved, but the reminders could not be set up.",
    };
  }
}

/** Re-read the plan from the database (after a lane wrote rules). */
export async function fetchPlan(rulebookId: string): Promise<CapturePlanState> {
  const { data, error } = await rulebookTable()
    .select("metadata")
    .eq("id", rulebookId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw operationFailed("read your capture plan", error);
  return readCapturePlan((data as { metadata: unknown } | null)?.metadata);
}
