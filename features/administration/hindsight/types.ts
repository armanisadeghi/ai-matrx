/**
 * features/administration/hindsight/types.ts
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
export type Replay = components["schemas"]["ReplayOut"];
export type ToolSubject = components["schemas"]["ToolSubjectOut"];
export type HindsightCosts = components["schemas"]["HindsightCostsOut"];
export type EnrollRequest = components["schemas"]["EnrollRequest"];
export type EnrollmentUpdateRequest =
  components["schemas"]["EnrollmentUpdateRequest"];
export type ReviewRunResult = components["schemas"]["ReviewRunResult"];
export type ReplayRunResult = components["schemas"]["ReplayRunResult"];
export type DrainResult = components["schemas"]["DrainResult"];
export type ReviewThread = components["schemas"]["ReviewThreadOut"];
export type ThreadMessage = components["schemas"]["ThreadMessageOut"];
export type DiscussResult = components["schemas"]["DiscussOut"];

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
  return raw
    // ANSI colour codes, with or without the surviving ESC byte.
    .replace(/\u001b?\[\d{1,3}m/g, "")
    .replace(/-{4,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function replayFailureReason(replay: Replay): string {
  const message = replay.error?.["message"];
  if (typeof message !== "string") return "failed before it produced a result";
  const cleaned = cleanFailureText(message);
  return cleaned || "failed before it produced a result";
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
