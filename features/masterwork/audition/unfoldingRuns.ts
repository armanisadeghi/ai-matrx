/**
 * THE UNFOLDING AUDITION — the client's reading of mode `unfolding`.
 *
 * Contract: `common-docs/systems/masterwork/unfolding-case-contract.md` §4.
 * Server half: `POST /masterworks/audition` with `mode: "unfolding"`, terminal
 * event `masterwork_audition_unfolding_verdict`, result row
 * `platform.masterwork_run` (`operation = "audition_unfolding"`).
 *
 * Two jobs, both pure-ish and both kept OUT of the dialog: parse the verdict
 * (so a shape the server changed fails in ONE place, loudly, instead of
 * rendering a table of blanks), and read the past unfolding scores.
 *
 * `listAuditionRuns` next door reads the TEXT-vs-reference audition; this
 * reads the unfolding one. They are different operations with different result
 * shapes — one reader would have to guess which, so there are two.
 */

import { operationFailed } from "@/utils/errors";
import { supabase } from "@/utils/supabase/client";

export const UNFOLDING_AUDITION_EVENT =
  "masterwork_audition_unfolding_verdict";
export const UNFOLDING_AUDITION_OPERATION = "audition_unfolding";

/** The judge's enum verdicts — never free text, per §4. */
export type DiagnosisVerdict = "match" | "partial" | "miss";
export type DangerousBranchVerdict = "none" | "considered" | "committed";

export interface UnfoldingArm {
  /** "desk" (a Masterwork under the oracle) or "vanilla" (told everything). */
  arm: string;
  /** Which desk this arm is, when it is one. */
  masterworkId: string | null;
  masterworkName: string | null;
  diagnosis: DiagnosisVerdict | null;
  dangerousBranch: DangerousBranchVerdict | null;
  /** The branch the judge named, when it named one. */
  branchNamed: string | null;
  /** Mechanical, from the ledger — never asked of the judge. */
  steps: number | null;
  cost: number | null;
  risk: number | null;
}

export interface UnfoldingCaseResult {
  caseItemId: string | null;
  label: string | null;
  arms: UnfoldingArm[];
}

export interface UnfoldingVerdict {
  cases: UnfoldingCaseResult[];
  /** 0-100, match 1 / partial 0.5 / miss 0. */
  diagnosisScore: number | null;
  /** 0-100, none 1 / considered 0.5 / committed 0. */
  safetyScore: number | null;
  /** The headline: did the desk beat the model that was told everything? */
  deskBeatsVanilla: boolean | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function diagnosisOf(value: unknown): DiagnosisVerdict | null {
  return value === "match" || value === "partial" || value === "miss"
    ? value
    : null;
}

function branchOf(value: unknown): DangerousBranchVerdict | null {
  return value === "none" || value === "considered" || value === "committed"
    ? value
    : null;
}

function readArm(raw: unknown): UnfoldingArm | null {
  if (!isRecord(raw)) return null;
  const arm = text(raw.arm);
  if (!arm) return null;
  return {
    arm,
    masterworkId: text(raw.masterwork_id),
    masterworkName: text(raw.masterwork_name),
    diagnosis: diagnosisOf(raw.diagnosis),
    dangerousBranch: branchOf(raw.dangerous_branch),
    branchNamed: text(raw.branch_named),
    steps: num(raw.steps),
    cost: num(raw.cost),
    risk: num(raw.risk),
  };
}

function readCases(raw: unknown): UnfoldingCaseResult[] {
  if (!Array.isArray(raw)) return [];
  const out: UnfoldingCaseResult[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const arms = Array.isArray(entry.arms)
      ? entry.arms.map(readArm).filter((a): a is UnfoldingArm => a !== null)
      : [];
    out.push({
      caseItemId: text(entry.case_item_id),
      label: text(entry.label),
      arms,
    });
  }
  return out;
}

/**
 * Parse the terminal verdict. Returns null — which the durable-run primitive
 * treats as a LOUD rejection — when the payload is neither the live event nor
 * the stored table it settles into: a run that answered something else must
 * not be drawn as an empty scoreboard.
 *
 * TWO LAWFUL SHAPES, one reader. The live terminal event carries its own
 * `type`; the durable row's `result` column stores the table WITHOUT it
 * (`{cases, diagnosis_score, safety_score, desk_beats_vanilla}` — exactly what
 * `listUnfoldingAuditions` below reads back). Requiring the discriminator
 * therefore refused every REJOINED or snapshot-settled run as a failure
 * (Bugbot, PR #222, 2026-09-12) — a run that finished perfectly came back as
 * "the server returned an incomplete result" after a reload. So an untyped
 * payload is accepted when it carries the table itself; a payload carrying a
 * DIFFERENT `type` is still somebody else's event and is still refused.
 */
export function parseUnfoldingVerdict(raw: unknown): UnfoldingVerdict | null {
  if (!isRecord(raw)) return null;
  const type = raw.type;
  if (type !== undefined && type !== null && type !== UNFOLDING_AUDITION_EVENT) {
    return null;
  }
  if (type === undefined || type === null) {
    // The stored shape has to prove itself some other way: the per-case table
    // AND at least one field only this verdict emits.
    const hasHeadline =
      "desk_beats_vanilla" in raw ||
      "diagnosis_score" in raw ||
      "safety_score" in raw;
    if (!Array.isArray(raw.cases) || !hasHeadline) return null;
  }
  const cases = readCases(raw.cases);
  if (cases.length === 0) return null;
  return {
    cases,
    diagnosisScore: num(raw.diagnosis_score),
    safetyScore: num(raw.safety_score),
    deskBeatsVanilla:
      typeof raw.desk_beats_vanilla === "boolean"
        ? raw.desk_beats_vanilla
        : null,
  };
}

/** One past unfolding audition, for the history strip. */
export interface UnfoldingRunSummary {
  id: string;
  startedAt: string;
  /** The judge's averaged diagnosis score, 0-100. */
  qualityScore: number | null;
  deskBeatsVanilla: boolean | null;
  caseCount: number;
}

export async function listUnfoldingAuditions(
  rulebookId: string,
  limit = 20,
): Promise<UnfoldingRunSummary[]> {
  const { data, error } = await supabase
    .schema("platform")
    .from("masterwork_run")
    .select("id, started_at, quality_score, result")
    .eq("rulebook_id", rulebookId)
    .eq("operation", UNFOLDING_AUDITION_OPERATION)
    .eq("status", "completed")
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw operationFailed("load the unfolding audition history", error);
  return (data ?? []).map((row) => {
    const result = (row.result ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      startedAt: row.started_at,
      qualityScore: row.quality_score,
      deskBeatsVanilla:
        typeof result.desk_beats_vanilla === "boolean"
          ? result.desk_beats_vanilla
          : null,
      caseCount: Array.isArray(result.cases) ? result.cases.length : 0,
    };
  });
}
