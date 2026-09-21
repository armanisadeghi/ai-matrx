// features/masterwork/prediction/service.ts
//
// Reading and writing the Prediction Ledger on `platform.rulebook.metadata`.
//
// 🚨 METADATA ONLY, AND `version` IS NEVER BUMPED. `version` is the RULES
// version a built Masterwork drifts against; recording a call on an open case
// is not a change to the rules. Bumping it here would make a freshly built
// Masterwork read "needs rebuild" the moment the Expert made a prediction —
// exactly the defect `writeDumpUrlSources` was fixed for on 2026-09-10. The
// column is still the compare-and-swap token: we guard ON it without moving it.
//
// Direct supabase-js, per platform doctrine — there is no Python hop for a
// pure UI↔DB write. Distillation (the one thing the client cannot do) is the
// only part that goes to the server.

import { supabase } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { guardedUpdate } from "@ai-matrx/data/db";
import { operationFailed } from "@/utils/errors";
import { parseRulebook, type Rulebook, type RulebookRow } from "../types";
import {
  PREDICTION_LEDGER_SCHEMA,
  readLedger,
  type PredictionEntry,
} from "./scoring";

const rulebookTable = () => supabase.schema("platform").from("rulebook");

/** How many times a write re-reads and re-applies before giving up. */
const MAX_ATTEMPTS = 3;

export type LedgerWriteResult =
  | { status: "saved"; rulebook: Rulebook; entries: PredictionEntry[] }
  /** The row moved under us on every attempt — the caller reloads and says so. */
  | { status: "conflict" }
  | { status: "not_found" };

/** The ledger as it stands on a Rulebook already in hand. No round trip. */
export function ledgerOf(rulebook: Pick<Rulebook, "metadata">) {
  return readLedger(rulebook.metadata);
}

/** Re-read the ledger from the database (after a server distillation run). */
export async function fetchLedger(
  rulebookId: string,
): Promise<PredictionEntry[]> {
  const { data, error } = await rulebookTable()
    .select("metadata")
    .eq("id", rulebookId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw operationFailed("read your prediction ledger", error);
  return readLedger((data as { metadata: unknown } | null)?.metadata).entries;
}

/**
 * THE ONE WRITE. Every append and every resolve goes through here: read the
 * row, transform the entry list, compare-and-swap on the version we read. The
 * transform runs again on every retry against the FRESH list, so two tabs
 * recording different calls never lose one — the loser of a CAS race re-applies
 * its own change to the winner's list rather than overwriting it.
 */
async function mutateLedger(
  rulebookId: string,
  transform: (entries: PredictionEntry[]) => PredictionEntry[],
): Promise<LedgerWriteResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { data, error } = await rulebookTable()
      .select("*")
      .eq("id", rulebookId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw operationFailed("save your prediction", error);
    if (!data) return { status: "not_found" };

    const row = data as RulebookRow;
    const baseMeta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const current = readLedger(row.metadata);
    const entries = transform(current.entries);
    const metadata = {
      ...baseMeta,
      prediction_ledger: {
        schema: PREDICTION_LEDGER_SCHEMA,
        entries,
      },
    };

    const result = await guardedUpdate<RulebookRow>({
      expectedVersion: row.version,
      // No `nextVersion` in the patch — see the header. The guard is the
      // `.eq("version", expectedVersion)` filter, which still refuses a write
      // over a row someone else moved.
      applyUpdate: ({ expectedVersion }) =>
        rulebookTable()
          .update({ metadata } as never)
          .eq("id", rulebookId)
          .eq("version", expectedVersion)
          .is("deleted_at", null)
          .select("*")
          .maybeSingle(),
      fetchCurrent: () =>
        rulebookTable()
          .select("*")
          .eq("id", rulebookId)
          .is("deleted_at", null)
          .maybeSingle(),
    });
    if (result.status === "saved") {
      return {
        status: "saved",
        rulebook: parseRulebook(result.row),
        entries,
      };
    }
    if (result.status === "not_found") return { status: "not_found" };
    // conflict → loop, re-read, re-apply the same transform to the new list.
  }
  return { status: "conflict" };
}

export interface NewPrediction {
  caseLabel: string;
  prediction: string;
  confidence: number;
  why: string;
  dueAt: string;
  capturedBy: "voice" | "typed";
}

/** Record a new call. Returns the entry as it was stored. */
export async function appendPrediction(
  rulebookId: string,
  input: NewPrediction,
): Promise<LedgerWriteResult & { entry?: PredictionEntry }> {
  const createdBy = (await getClaimsUser(supabase)).data.user?.id ?? "";
  const entry: PredictionEntry = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pred-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    case_label: input.caseLabel.trim(),
    prediction: input.prediction.trim(),
    confidence: input.confidence,
    why: input.why.trim(),
    due_at: input.dueAt,
    captured_by: input.capturedBy,
    created_at: new Date().toISOString(),
    created_by: createdBy,
    outcome: null,
    outcome_note: "",
    resolved_at: null,
    distilled_run_id: null,
  };
  const result = await mutateLedger(rulebookId, (entries) => [
    ...entries,
    entry,
  ]);
  return result.status === "saved" ? { ...result, entry } : result;
}

/** Enter the outcome of one open call. Scoring is derived, never stored. */
export async function resolvePrediction(
  rulebookId: string,
  entryId: string,
  outcome: boolean,
  note: string,
): Promise<LedgerWriteResult> {
  const resolvedAt = new Date().toISOString();
  return mutateLedger(rulebookId, (entries) =>
    entries.map((entry) =>
      entry.id === entryId
        ? {
            ...entry,
            outcome,
            outcome_note: note.trim(),
            resolved_at: resolvedAt,
          }
        : entry,
    ),
  );
}
