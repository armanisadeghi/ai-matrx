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

/** Start a trial (streaming). Same `as keyof paths` caveat as the read above. */
export const BENCH_RUN_PATH =
  "/masterworks/{rulebook_id}/bench/runs" as keyof paths;

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

/**
 * THE DOOR'S OWN FORM, written by the server. Present exactly when
 * `can_run_here` is true; null otherwise. Every sentence in it (`*_source`,
 * `corpus_note`, `durable_note`) is the SERVER's, because the only honest
 * answer to "where did that number come from" and "what happens if I refresh"
 * is the one the thing that resolved it wrote.
 */
export interface BenchRunFormWire {
  /** Prefill for the budget field. */
  budget_multiple: number;
  /** Human sentence: where that number came from. */
  budget_multiple_source: string;
  /** Shown, never editable — these are the trial's declared conditions. */
  judge_model: string;
  frontier_model: string;
  cheap_model: string;
  /** The built Masterwork arm C will run — the product's real run path. */
  masterwork_id: string;
  masterwork_name: string;
  /** Pre-engagement sources found on the Rulebook, and one honest sentence. */
  corpus_sources: number;
  corpus_note: string;
  /**
   * False = the run is FILES-ONLY: no `platform.masterwork_run` row, no
   * `masterwork_run` receipt event, and therefore nothing to rejoin after a
   * refresh. `durable_note` is the sentence that says so, and the screen shows
   * it BEFORE the start button — a person is owed that before they spend.
   */
  durable: boolean;
  durable_note: string;
}

/** One finished arm, streamed the moment it lands (`masterwork_bench_arm`). */
export interface BenchArmWire {
  arm: string;
  label: string;
  ran: boolean;
  /** "" when the arm was fine. Never null — the server writes a string. */
  error: string;
  cost_usd: number;
  seconds: number;
  model: string;
  note: string;
}

/** The TERMINAL event of a live trial (`masterwork_bench_verdict`). */
export interface BenchVerdictWire {
  trial_id: string;
  passed: boolean;
  void: boolean;
  /** The panel was not calibrated. NOT a pass, NOT a fail, NOT a void. */
  not_scored: boolean;
  void_reason: string;
  not_scored_reason: string;
  /** "ceiling" | "quality" | "efficiency", or null when none is claimed. */
  win_claimed: string | null;
  win_rationale: string;
  arm: string;
  budget_multiple: number | null;
  panel_winner: string | null;
  panel_votes: number;
  gt_in_pool: boolean;
  gt_won: boolean;
  c_cost_usd: number | null;
  c_seconds: number | null;
  total_cost_usd: number | null;
  record_path: string | null;
  report_path: string | null;
  row_id: string | null;
  stored: boolean;
  storage_note: string;
  /** The server's own sentence. Rendered, never re-written. */
  headline: string;
}

/**
 * Narrow the terminal event. A verdict with no trial id is not a verdict, and
 * `useDurableRun` turns a null here into a loud "incomplete result" rather
 * than a screen that quietly shows nothing.
 */
export function parseBenchVerdict(raw: unknown): BenchVerdictWire | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.trial_id !== "string" || !d.trial_id) return null;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    trial_id: d.trial_id,
    passed: d.passed === true,
    void: d.void === true,
    not_scored: d.not_scored === true,
    void_reason: str(d.void_reason),
    not_scored_reason: str(d.not_scored_reason),
    win_claimed: typeof d.win_claimed === "string" ? d.win_claimed : null,
    win_rationale: str(d.win_rationale),
    arm: str(d.arm),
    budget_multiple: num(d.budget_multiple),
    panel_winner: typeof d.panel_winner === "string" ? d.panel_winner : null,
    panel_votes: num(d.panel_votes) ?? 0,
    gt_in_pool: d.gt_in_pool === true,
    gt_won: d.gt_won === true,
    c_cost_usd: num(d.c_cost_usd),
    c_seconds: num(d.c_seconds),
    total_cost_usd: num(d.total_cost_usd),
    record_path: typeof d.record_path === "string" ? d.record_path : null,
    report_path: typeof d.report_path === "string" ? d.report_path : null,
    row_id: typeof d.row_id === "string" ? d.row_id : null,
    stored: d.stored === true,
    storage_note: str(d.storage_note),
    headline: str(d.headline),
  };
}

/** Narrow one arm row. An arm with no letter is not a row worth showing. */
export function parseBenchArm(raw: Record<string, unknown>): BenchArmWire | null {
  if (typeof raw.arm !== "string" || !raw.arm) return null;
  const num = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    arm: raw.arm,
    label: str(raw.label),
    ran: raw.ran !== false,
    error: str(raw.error),
    cost_usd: num(raw.cost_usd),
    seconds: num(raw.seconds),
    model: str(raw.model),
    note: str(raw.note),
  };
}

interface BenchProofResponseWire {
  rulebook_id: string;
  proof: BenchProofWire | null;
  reason: string | null;
  can_run_here: boolean;
  /**
   * When `can_run_here` is false this carries the REASON, server-written. It is
   * shown verbatim beside the door, because "you cannot run it" without "why"
   * is exactly the dead control this whole surface exists to refuse.
   */
  how_to_run: string;
  searched: string[];
  /** Present exactly when `can_run_here` is true. */
  form?: BenchRunFormWire | null;
}

/**
 * What every non-loading answer carries besides its own shape: whether the
 * Bench can be STARTED from here, the form to start it with (non-null exactly
 * when it can), and the server's sentence for when it cannot.
 */
interface BenchRunAbility {
  canRunHere: boolean;
  /** Non-null exactly when `canRunHere` is true. */
  form: BenchRunFormWire | null;
  /** The server's own reason/where-it-runs sentence. */
  howToRun: string;
}

export type BenchProofState =
  | { status: "loading" }
  | ({ status: "record"; proof: BenchProofWire } & BenchRunAbility)
  | ({ status: "none"; reason: string } & BenchRunAbility)
  | ({ status: "unavailable"; reason: string; canRunHere: false } & Omit<
      BenchRunAbility,
      "canRunHere"
    >);

/** Said when the viewer cannot read the Rulebook, or the server cannot answer. */
export const CANNOT_TELL =
  "Only people who can open this Masterwork's Rulebook can see whether a bench trial exists for it.";

/** The one "can't tell from here" value — never a hand-built copy of it. */
export const UNAVAILABLE: BenchProofState = {
  status: "unavailable",
  reason: CANNOT_TELL,
  canRunHere: false,
  form: null,
  howToRun: "",
};

/**
 * The Bench answer for one Rulebook. Never throws into a page: a failure is one
 * of the three honest states, because "we don't know" and "there is no proof"
 * are different sentences and the Operator is owed the right one.
 */
export async function getBenchProof(
  rulebookId: string,
): Promise<BenchProofState> {
  const store = getStoreSingleton();
  if (!store) return UNAVAILABLE;

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
    return UNAVAILABLE;
  }
  // `form` is the server's promise that a start is actually possible. If it is
  // missing we do NOT offer the door, whatever `can_run_here` said — a button
  // with no form behind it is the dead control this file refuses.
  const form = wire.form ?? null;
  const canRunHere = wire.can_run_here && form !== null;
  if (wire.proof) {
    return {
      status: "record",
      proof: wire.proof,
      canRunHere,
      form,
      howToRun: wire.how_to_run,
    };
  }
  return {
    status: "none",
    // The server's own two sentences: what proof is, and where it runs. The UI
    // does not invent a third, and does not show a button that cannot work.
    reason: [wire.reason, canRunHere ? null : wire.how_to_run]
      .filter(Boolean)
      .join(" "),
    canRunHere,
    form,
    howToRun: wire.how_to_run,
  };
}
