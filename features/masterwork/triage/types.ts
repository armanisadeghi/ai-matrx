/**
 * The draft-TRIAGE lane's wire shapes — the mirror of aidream's
 * `MasterworkTriageCompleteData` / `MasterworkTriageDecision`
 * (`packages/matrx-connect/matrx_connect/context/data_types.py`).
 *
 * Declared here ONCE and parsed defensively: the terminal payload arrives
 * either live (the event IS the answer) or from a durable snapshot, and a
 * surface that trusts a shape it never checked is how a run reports a clean
 * sweep it never made.
 */

export type TriageVerdict = "keep" | "retire" | "rewrite";

export interface TriageDecision {
  ruleId: string;
  name: string;
  verdict: TriageVerdict;
  reason: string;
  statement: string;
}

export interface TriageResult {
  rulebookId: string;
  rulebookVersion: number;
  draftsConsidered: number;
  retired: number;
  kept: number;
  rewritten: number;
  /** Ids the server REFUSED to retire because the Expert approved them. */
  refused: string[];
  /** Batches that could not be sorted at all — drafts nobody looked at. */
  failedBatches: number;
  draftsUnreviewed: number;
  dryRun: boolean;
  decisions: TriageDecision[];
}

const VERDICTS: readonly string[] = ["keep", "retire", "rewrite"];

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseDecision(raw: unknown): TriageDecision | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const ruleId = str(row.rule_id);
  if (!ruleId) return null;
  const verdict = str(row.verdict);
  return {
    ruleId,
    name: str(row.name),
    verdict: (VERDICTS.includes(verdict) ? verdict : "keep") as TriageVerdict,
    reason: str(row.reason),
    statement: str(row.statement),
  };
}

export function parseTriageResult(raw: unknown): TriageResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const rulebookId = str(row.rulebook_id);
  if (!rulebookId) return null;
  const decisions = Array.isArray(row.decisions)
    ? row.decisions
        .map(parseDecision)
        .filter((d): d is TriageDecision => d !== null)
    : [];
  return {
    rulebookId,
    rulebookVersion: num(row.rulebook_version),
    draftsConsidered: num(row.drafts_considered),
    retired: num(row.retired),
    kept: num(row.kept),
    rewritten: num(row.rewritten),
    refused: Array.isArray(row.refused) ? row.refused.map(str).filter(Boolean) : [],
    failedBatches: num(row.failed_batches),
    draftsUnreviewed: num(row.drafts_unreviewed),
    dryRun: row.dry_run === true,
    decisions,
  };
}

/**
 * The one sentence the Expert reads when it is over. Plain English, no jargon,
 * and it NEVER hides the two things that make a sweep dishonest: drafts nobody
 * looked at, and rules the platform refused to touch because she approved them.
 */
export function triageSummary(result: TriageResult): string {
  const parts = [
    `kept ${result.kept}`,
    `set aside ${result.retired}`,
    `rewritten ${result.rewritten}`,
  ];
  let sentence = parts.join(" · ");
  if (result.dryRun) sentence = `Preview — ${sentence}. Nothing was changed yet.`;
  if (result.draftsUnreviewed > 0) {
    sentence += ` · ${result.draftsUnreviewed} draft${
      result.draftsUnreviewed === 1 ? "" : "s"
    } could not be sorted and were left alone`;
  }
  if (result.refused.length > 0) {
    sentence += ` · ${result.refused.length} already approved by you, so they were left alone`;
  }
  return sentence;
}
