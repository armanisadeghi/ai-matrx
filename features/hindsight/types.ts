/**
 * features/hindsight/types.ts
 *
 * Every shape here is DERIVED from the generated OpenAPI contract
 * (`pnpm sync-types`), never hand-mirrored — a backend rename turns each
 * drifted callsite into a compile error instead of a runtime surprise.
 */
import type { components } from "@/types/python-generated/api-types";

export type Enrollment = components["schemas"]["EnrollmentOut"];
export type EnrollmentDetail = components["schemas"]["EnrollmentDetailOut"];
export type EnrollmentSpend = components["schemas"]["EnrollmentSpend"];
export type Review = components["schemas"]["ReviewOut"];
export type ReviewDetail = components["schemas"]["ReviewDetailOut"];
export type Finding = components["schemas"]["FindingOut"];
export type FindingProposal = components["schemas"]["FindingProposalOut"];
export type FindingDecision = components["schemas"]["FindingDecisionOut"];
export type FindingRevert = components["schemas"]["FindingRevertOut"];
export type Replay = components["schemas"]["ReplayOut"];
export type RegressionCase = components["schemas"]["RegressionCaseOut"];
export type ToolSubject = components["schemas"]["ToolSubjectOut"];
export type HindsightCosts = components["schemas"]["HindsightCostsOut"];
export type EnrollRequest =
  components["schemas"]["aidream__services__hindsight__enrollment__EnrollRequest"];
export type EnrollmentUpdateRequest =
  components["schemas"]["EnrollmentUpdateRequest"];
export type ReviewRunResult = components["schemas"]["ReviewRunResult"];
export type ReplayRunResult = components["schemas"]["ReplayRunResult"];
export type DrainResult = components["schemas"]["DrainResult"];
export type ReviewThread = components["schemas"]["ReviewThreadOut"];
export type ThreadMessage = components["schemas"]["ThreadMessageOut"];
export type DiscussResult = components["schemas"]["DiscussOut"];
// What the next review WOULD read; `unsettled_count > 0` is the warning that
// "Review now" excludes the subject's newest activity (the settle window).
export type PendingExamples = components["schemas"]["PendingExamplesOut"];
export type PendingExample = components["schemas"]["PendingExampleOut"];

// Internal Affairs (C-19) — the change-history + effectiveness substrate.
export type ChangeHistoryRow = components["schemas"]["ChangeHistoryRow"];
export type ChangeHistory = components["schemas"]["ChangeHistoryOut"];
export type FindingEffectiveness =
  components["schemas"]["FindingEffectivenessRow"];
export type ChangeRole = ChangeHistoryRow["change_role"];
export type ActorTier = NonNullable<ChangeHistoryRow["actor_tier"]>;
export type UnitToken = ChangeHistoryRow["unit_token"];

export type SubjectKind = Enrollment["subject_kind"];
export type Lever = Finding["lever"];
export type Verdict = NonNullable<Replay["verdict"]>;

/**
 * A replay only spent money — and only has a comparison to show — when it
 * actually ran. Anything else renders as "did not run", never as `$0.000`,
 * which reads as "free" instead of "never happened".
 */
export function replayRan(replay: Replay): boolean {
  return replay.status === "completed";
}

/**
 * A replay dispatched to the mirror queue (`pending`) or currently executing
 * (`processing`) has not failed and has not run — it is IN FLIGHT. Rendering
 * it as "did not run" (red, with a failure reason) tells the user their replay
 * broke when it is simply waiting for the mirror worker.
 */
export function replayInFlight(replay: Replay): boolean {
  return replay.status === "pending" || replay.status === "processing";
}

/** Money Hindsight SPENT on this replay. Only meaningful when it ran. */
export function replaySpend(replay: Replay): number | null {
  const cost = replay.metrics?.["cost"];
  return typeof cost === "number" ? cost : null;
}

/**
 * What the ORIGINAL historical run cost — the baseline the replay is measured
 * against. This is NOT a charge and never counts toward Hindsight spend.
 */
export function replayBaseline(replay: Replay): number | null {
  const cost = replay.original_metrics?.["cost"];
  return typeof cost === "number" ? cost : null;
}

export function replayJudgeReasoning(replay: Replay): string | null {
  const reasoning = replay.judge?.["reasoning"];
  return typeof reasoning === "string" ? reasoning : null;
}

/**
 * Backend failures arrive as raw operator output — ANSI colour codes and the
 * ORM's banner rules. Rendered verbatim they read as garbage (`[91m ------`),
 * so strip the terminal formatting and keep the sentence.
 */
export function cleanFailureText(raw: string): string {
  return (
    raw
      // ANSI colour codes, with or without the surviving ESC byte.
      .replace(/\u001b?\[\d{1,3}m/g, "")
      .replace(/-{4,}/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function replayFailureReason(replay: Replay): string {
  const message = replay.error?.["message"];
  if (typeof message !== "string") return "failed before it produced a result";
  const cleaned = cleanFailureText(message);
  return cleaned || "failed before it produced a result";
}

/**
 * One evidence element rendered as a line.
 *
 * `hindsight.finding.evidence` carries TWO shapes on purpose: the reviewer
 * agent writes sentences, and a human drill-down walk (D-40) writes typed hop
 * objects — `{hop, unit_kind, unit_id, answer, note?}` plus a fault element
 * and a `{snapshot_ids}` element. Rendering an object with template
 * interpolation would print `[object Object]` at the exact moment a human is
 * reading the evidence for their own walk, so each shape gets a sentence.
 */
export function evidenceLine(
  item: NonNullable<Finding["evidence"]>[number],
): string {
  if (typeof item === "string") return item;
  if (typeof item.hop === "number") {
    const verdict =
      item.answer === "input_wrong"
        ? "its inputs were wrong"
        : "its inputs were fine";
    const note =
      typeof item.note === "string" && item.note ? ` — ${item.note}` : "";
    return `Step ${item.hop + 1}: ${String(item.unit_kind)} ${String(item.unit_id)} — ${verdict}${note}`;
  }
  if (item.fault_unit_id) {
    return `Fault localized to ${String(item.fault_unit_kind)} ${String(item.fault_unit_id)}`;
  }
  if (Array.isArray(item.snapshot_ids)) {
    return `Recorded calls pinned as evidence: ${item.snapshot_ids.join(", ")}`;
  }
  if (item.wf_run_id) {
    return `Workflow run ${String(item.wf_run_id)}, step ${String(item.node_id)}`;
  }
  return JSON.stringify(item);
}

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Reviewer evidence cites real conversations by raw id. A bare UUID is a dead
 * end with extra steps, so split the line into text + openable ids.
 */
export function splitEvidenceIds(
  line: string,
): Array<{ text: string; id?: string }> {
  const parts: Array<{ text: string; id?: string }> = [];
  let cursor = 0;
  for (const match of line.matchAll(UUID_RE)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push({ text: line.slice(cursor, start) });
    parts.push({ text: match[0], id: match[0] });
    cursor = start + match[0].length;
  }
  if (cursor < line.length) parts.push({ text: line.slice(cursor) });
  return parts.length > 0 ? parts : [{ text: line }];
}

/**
 * A `version_from` the view INFERRED from the previous version row, rather than
 * one recorded at apply/revert time. Correct whenever no version promote
 * intervened — and wrong when one did, because `agx_promote_version` rolls the
 * live definition back without writing a version row. Rendering an inferred
 * number identically to a recorded one turns a guess into an audit claim, so
 * every surface that shows `version_from` must show this too.
 */
export function versionFromIsInferred(row: ChangeHistoryRow): boolean {
  return row.version_from_confidence === "inferred";
}

/**
 * A NULL rate or cost is NO SIGNAL, never zero. `revert_rate === null` means
 * nothing has been applied yet; `revert_rate === 0` means things were applied
 * and none were undone. Collapsing the two destroys the only number that says
 * "stop trusting this lever on this unit".
 */
export function hasSignal(value: number | null | undefined): value is number {
  return typeof value === "number";
}
