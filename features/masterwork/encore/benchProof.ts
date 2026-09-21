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
import { serverRefusal } from "@/lib/progress/failureSentence";
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
  /**
   * 🚨 THE NAMES A PERSON READS — "Claude Opus 5", not `claude-opus-5`
   * (sixteenth cold walk, 2026-09-21, defect D: three raw model ids on the
   * screen of a residential HVAC contractor). They come from the AI catalog's
   * `common_name`, through the server's `model_name_for_person`, which never
   * returns null and never returns a routing ref: a ref the catalog cannot
   * name arrives as a plain description instead.
   *
   * Still typed nullable because an older server can still send null, and
   * `modelName` below is what every arm renders through — never `?? <the raw
   * id>`, which is exactly how the deprecated `claude-sonnet-4-5` reached an
   * Expert's screen (seventeenth cold walk, defect C).
   */
  judge_model_name: string | null;
  frontier_model_name: string | null;
  cheap_model_name: string | null;
  /**
   * 🚨 THE PRICE, BEFORE THE CLICK (the destructive-and-expensive-actions law).
   * `typical_run_cost_usd` is what one run of THIS Masterwork actually cost
   * last time; `estimated_cost_usd` is the ceiling that makes; and
   * `estimated_cost_note` says both in one plain sentence — including, when
   * the Masterwork has never been priced, that we cannot say yet and why.
   * The note is ALWAYS present. The numbers are null together.
   */
  typical_run_cost_usd: number | null;
  estimated_cost_usd: number | null;
  estimated_cost_note: string;
  /** The built Masterwork arm C will run — the product's real run path. */
  masterwork_id: string;
  masterwork_name: string;
  /**
   * How many pre-engagement sources the corpus holds — **null on the READ
   * half, and that is the point.** Assembling a Rulebook's pre-engagement
   * corpus scrapes web pages and reads uploaded documents, so counting it on
   * every load of the Encore run page would make LOOKING at a Masterwork cost
   * money and seconds, for a button nobody pressed. The real count exists only
   * once a trial starts, and arrives in the `masterwork_bench_progress` stage
   * line at stage `"corpus"` (aidream 864b37a49).
   *
   * 🚨 A NULL IS NEVER PRINTED AS ZERO. "0 sources" from an unasked question
   * is the exact lie this split exists to avoid: render a count only when this
   * is a number, and let `corpus_note` speak the rest of the time.
   */
  corpus_sources: number | null;
  /**
   * One honest sentence about that corpus — the RULE when there is no count
   * yet, the description when there is. Always rendered.
   */
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
/**
 * What a person is told when no arm name arrived. Mirrors the server's
 * `ai_catalog_manager.UNNAMED_MODEL` word for word, so the two halves of the
 * same sentence can never read differently.
 */
export const UNNAMED_MODEL = "a model our catalog has no name for yet";

/**
 * THE ONE RENDERING of an arm's model name. A routing ref is never shown to a
 * person — not as a fallback, not "temporarily", not because it is all we have
 * (seventeenth cold walk, defect C).
 */
export function modelName(name: string | null | undefined): string {
  const given = (name ?? "").trim();
  return given || UNNAMED_MODEL;
}

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

/**
 * A trial that is IN FLIGHT right now, as the server describes it. Read from
 * the `platform.masterwork_run` row, so it survives a refresh and a different
 * device — the panel is not guessing from a stream it happens to hold.
 */
export interface BenchRunningWire {
  run_id: string;
  started_at: string;
  label: string;
  elapsed_minutes: number;
  /** null = already past the typical time; the headline says so in words. */
  remaining_minutes: number | null;
  /** The server's own sentence. Rendered, never re-written here. */
  headline: string;
}

interface BenchProofResponseWire {
  rulebook_id: string;
  proof: BenchProofWire | null;
  running?: BenchRunningWire | null;
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
  /**
   * A trial running RIGHT NOW, or null.
   *
   * 🚨 A FIELD, NOT A FOURTH STATUS (production walk 4, wall W3, 2026-09-16).
   * "Is a trial running?" is independent of "is there a banked proof?" — a
   * Masterwork can hold last week's record and be back on the bench this
   * minute, and the Operator is owed both sentences. A fourth status would
   * force the screen to pick one and drop the other, which is how the panel
   * came to show a PERMISSION message to the admin who had started the trial
   * herself.
   */
  running: BenchRunningWire | null;
}

export type BenchProofState =
  | { status: "loading" }
  | ({ status: "record"; proof: BenchProofWire } & BenchRunAbility)
  | ({ status: "none"; reason: string } & BenchRunAbility)
  | ({
      status: "unavailable";
      /** The panel's lead line — it differs by WHY, and that matters. */
      headline: string;
      reason: string;
      /**
       * The trace id the server recorded this refusal under, when it gave
       * one. For a MUTED detail line under the reason, never inside it — the
       * fifteenth cold walk read a 32-hex id in the middle of this panel's
       * prose, at a non-technical Expert.
       */
      traceId?: string | null;
      /**
       * The server said retrying cannot work. The panel offers no reload
       * prompt when this is true.
       */
      retryIsPointless?: boolean;
      canRunHere: false;
    } & Omit<BenchRunAbility, "canRunHere">);

/** Said when the viewer really cannot read the Rulebook. A PERMISSION claim. */
export const CANNOT_TELL =
  "Only people who can open this Masterwork's Rulebook can see whether a bench trial exists for it.";

export const CANNOT_TELL_HEADLINE = "Bench proof: can't tell from here";
export const CHECK_FAILED_HEADLINE = "Bench proof: couldn't check just now";

/**
 * The viewer is not allowed to know. Used ONLY when the server actually said
 * so (401/403) or when there is no Rulebook to ask about.
 */
export const UNAVAILABLE: BenchProofState = {
  status: "unavailable",
  headline: CANNOT_TELL_HEADLINE,
  reason: CANNOT_TELL,
  canRunHere: false,
  form: null,
  howToRun: "",
  running: null,
};

export const ORG_REQUIRED_HEADLINE = "Bench proof: no organization selected";

/**
 * 🚨 THE STATE THE WALL WAS ACTUALLY IN (production walk 4, wall W3).
 * Every Matrx transport fails CLOSED with no organization selected — it throws
 * before any networking, with "Select an organization before sending this
 * request.", which is the production error row this wall left behind. That is
 * not a permission answer and not a bench fact; it is an unfinished session,
 * and the remedy is a picker, not a reload. The Encore page now WAITS for the
 * organization rather than asking and mis-reading the refusal, and this is the
 * sentence for the genuinely terminal case.
 */
export const ORGANIZATION_REQUIRED: BenchProofState = {
  status: "unavailable",
  headline: ORG_REQUIRED_HEADLINE,
  reason:
    "Every request is filed under one organization, and none is selected for " +
    "this session. Pick one from the avatar menu and this will answer.",
  canRunHere: false,
  form: null,
  howToRun: "",
  running: null,
};

export const ORG_UNAVAILABLE_HEADLINE =
  "Bench proof: we could not check your organization";

/**
 * 🚨 THE FOURTH STATE — THE ORGANIZATION READ ITSELF FAILED (R37, 2026-09-18).
 * `ORGANIZATION_REQUIRED` above is a claim about this person's memberships, and
 * it may only be made once they have been READ. When the read failed — an
 * aborted fetch, a thrown membership read, a degraded `current_personal_org_id()`
 * — nobody looked, so telling the admin mid-trial to pick an organization is a
 * claim nobody verified, and leaving the panel on `{ status: "loading" }` is a
 * skeleton that never resolves. This is the sentence for that state: it says
 * what happened, says plainly that picking is NOT the remedy, and names the one
 * remedy this panel does offer.
 */
export const ORGANIZATION_UNAVAILABLE: BenchProofState = {
  status: "unavailable",
  headline: ORG_UNAVAILABLE_HEADLINE,
  reason:
    "Something went wrong while reading which organization you are working in, " +
    "so the bench proof was not checked. This does not mean you need to pick " +
    "one — we simply could not check. Reload to try again.",
  canRunHere: false,
  form: null,
  howToRun: "",
  running: null,
};

/**
 * 🚨 A FAILED READ IS NOT A DENIED ONE (production walk 4, wall W3).
 * This function used to be one line — every error became `UNAVAILABLE`, whose
 * sentence is a permission claim. During an in-flight Bench trial the Encore
 * page's read came back with "Select an organization before sending this
 * request." (production error row 9ce676a8, 2026-09-17T02:58:27Z), and the
 * admin who had started that very trial was told she was not allowed to see
 * whether it existed. A timeout, a 500 and a missing org header are all
 * "we couldn't check", and none of them is "you may not know".
 */
export function checkFailed(raw: unknown): BenchProofState {
  // 🚨 THE SERVER'S SENTENCE IS NOT RENDERED RAW (fifteenth cold walk,
  // blocking C). This panel printed the aidream `build_defect` message word
  // for word at a non-technical Expert — module path
  // (`aidream.services.conversation_context.scope`) and 32-hex trace id
  // included — and then appended "reload to try again" over the top of a
  // server that had just said trying again will fail the same way. Both
  // halves are the one reading in `lib/progress/failureSentence.ts` now.
  const refusal = serverRefusal(raw, { remedy: "" });
  const detail = refusal.text.trim();
  return {
    status: "unavailable",
    headline: CHECK_FAILED_HEADLINE,
    reason: refusal.retryIsPointless
      ? detail
      : (detail ? `${detail} ` : "") +
        "This is not a permission problem — reload to try again.",
    traceId: refusal.traceId ?? null,
    retryIsPointless: refusal.retryIsPointless,
    canRunHere: false,
    form: null,
    howToRun: "",
    running: null,
  };
}

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
  const error = (result as { error?: { message?: string; status?: number } })
    .error;
  const wire = (result as { data?: BenchProofResponseWire }).data;
  if (error || !wire) {
    // Only the server saying "no" is a permission answer. Everything else —
    // 500, timeout, a missing org header, no body at all — is a failed check,
    // and says so.
    const status = error?.status;
    if (status === 401 || status === 403) return UNAVAILABLE;
    // The whole error, not just its message: the aidream envelope rides on
    // `serverDetail`, and `error: "build_defect"` is the fact that decides
    // whether a retry prompt may be shown at all.
    return checkFailed(error ?? "We couldn't reach the bench record.");
  }
  // `form` is the server's promise that a start is actually possible. If it is
  // missing we do NOT offer the door, whatever `can_run_here` said — a button
  // with no form behind it is the dead control this file refuses.
  const form = wire.form ?? null;
  const canRunHere = wire.can_run_here && form !== null;
  const running = wire.running ?? null;
  if (wire.proof) {
    return {
      status: "record",
      proof: wire.proof,
      canRunHere,
      form,
      howToRun: wire.how_to_run,
      running,
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
    running,
  };
}
