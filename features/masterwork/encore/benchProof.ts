// features/masterwork/encore/benchProof.ts
//
// THE PROOF, read from the server. `GET /masterworks/{rulebook_id}/bench`
// (aidream `services/masterworks/bench_proof.py`) answers one question: is
// there a logged five-arm Bench trial behind this Masterwork's Rulebook?
//
// It is a SERVER read, not a Supabase read, on purpose: a Bench trial is not a
// row anyone can select yet. `bench_trial` is not in the
// `platform.masterwork_run.operation` vocabulary (admitting it needs a
// migration, which is Arman's to authorise), so today the record is the files
// the Bench wrote plus its own index, and only the server can see those. The
// day the row exists the same endpoint returns it and this file does not change.
//
// Three answers, and the screen renders all three: a record, an honest "none
// yet", or "can't tell from here" when the viewer cannot read that Rulebook.
// There is no fourth state where the page says nothing.

import { callApi } from "@/lib/api/call-api";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import type { paths } from "@/types/python-generated/api-types";

/**
 * Becomes a plain `satisfies keyof paths` once `pnpm sync-types` picks the
 * route up from a deployed server — the EXPERT_CORPUS_PATH precedent.
 */
export const BENCH_PROOF_PATH = "/masterworks/{rulebook_id}/bench" as keyof paths;

/** One finished Bench trial, exactly as the server describes it. */
export interface BenchProofWire {
  /** The record's id. A win claim without one is impossible by construction. */
  record_id: string;
  trial_id: string;
  subject: string;
  domain: string;
  finished_at: string;
  passed: boolean;
  void: boolean;
  void_reason: string;
  /** "ceiling" | "quality" | "efficiency", or null when the trial claims none. */
  win_claimed: string | null;
  win_rationale: string;
  /** The arm the claim was made against, and the budget ceiling it ran to. */
  arm: string;
  budget_multiple: number | null;
  panel_winner: string | null;
  gt_in_pool: boolean;
  gt_won: boolean;
  panel_votes: number;
  c_cost_usd: number | null;
  c_seconds: number | null;
  spec_sha256: string | null;
  corpus_sha256: string | null;
  record_path: string | null;
  report_path: string | null;
  /** "database" | "file index" — what the server actually read. */
  source: string;
  /** The server's own sentence. Never re-written here. */
  headline: string;
}

interface BenchProofResponseWire {
  rulebook_id: string;
  proof: BenchProofWire | null;
  reason: string | null;
  can_run_here: boolean;
  how_to_run: string;
  searched: string[];
}

export type BenchProofState =
  | { status: "loading" }
  | { status: "record"; proof: BenchProofWire; canRunHere: boolean }
  | { status: "none"; reason: string; canRunHere: boolean }
  | { status: "unavailable"; reason: string; canRunHere: false };

/** Said when the viewer cannot read the Rulebook, or the server cannot answer. */
const CANNOT_TELL =
  "Only people who can open this Masterwork's Rulebook can see whether a bench trial exists for it.";

/**
 * The Bench answer for one Rulebook. Never throws into a page: a failure is one
 * of the three honest states, because "we don't know" and "there is no proof"
 * are different sentences and the Operator is owed the right one.
 */
export async function getBenchProof(
  rulebookId: string,
): Promise<BenchProofState> {
  const store = getStoreSingleton();
  if (!store) return { status: "unavailable", reason: CANNOT_TELL, canRunHere: false };

  const result = await store.dispatch(
    callApi({
      path: BENCH_PROOF_PATH,
      method: "GET",
      pathParams: { rulebook_id: rulebookId } as never,
    }),
  );
  const error = (result as { error?: { message?: string } }).error;
  const wire = (result as { data?: BenchProofResponseWire }).data;
  if (error || !wire) {
    return { status: "unavailable", reason: CANNOT_TELL, canRunHere: false };
  }
  if (wire.proof) {
    return {
      status: "record",
      proof: wire.proof,
      canRunHere: wire.can_run_here,
    };
  }
  return {
    status: "none",
    // The server's own two sentences: what proof is, and where it runs. The UI
    // does not invent a third, and does not show a button that cannot work.
    reason: [wire.reason, wire.can_run_here ? null : wire.how_to_run]
      .filter(Boolean)
      .join(" "),
    canRunHere: wire.can_run_here,
  };
}
