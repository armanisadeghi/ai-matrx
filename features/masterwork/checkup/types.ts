import type { RuleSeverity, RulebookRule } from "../types";

/**
 * THE FINAL CHECKUP — the contract between this surface and aidream's
 * `POST /masterworks/checkup` (services/masterwork_checkup/).
 *
 * The Expert presses "Final checkup" when they feel done. The server runs
 * several auditors IN PARALLEL over everything the Expert ever said (their
 * interviews, their uploaded sources, their own edits) against the whole
 * Rulebook, and streams FINDINGS as each one lands:
 *
 *   - `add`    — something they clearly believe that no rule says
 *   - `modify` — a rule that says less (or worse) than they actually meant
 *   - `remove` — a rule they have since contradicted, or that duplicates another
 *
 * This is deliberately NOT a word diff. Arman: "I don't wanna make you start
 * thinking we're worried about one or two words changing." Every finding is
 * judged on SUBSTANCE — the proposed rule as a real rule, the reason in the
 * Expert's own terms, and their own VERBATIM words as the evidence.
 */

export type CheckupFindingKind = "add" | "modify" | "remove";

/** A rule the checkup proposes — the same shape a real rule has, unsaved. */
export interface CheckupProposedRule {
  name: string;
  statement: string;
  rationale?: string;
  detection?: string;
  severity: RuleSeverity;
  section: string;
}

/** Where in the Expert's own history the evidence quote came from. */
export interface CheckupEvidenceRef {
  conversation_id?: string;
  message_id?: string;
  file_id?: string;
  /** Seconds range for a recording. */
  time_range?: { start: number; end?: number | null };
}

export interface CheckupFinding {
  id: string;
  kind: CheckupFindingKind;
  /** The rule this is about — required for `modify` / `remove`. */
  target_rule_id?: string;
  /** What we propose it should say — required for `add` / `modify`. */
  proposed?: CheckupProposedRule;
  /**
   * When the auditor genuinely saw more than one good answer. The Expert picks
   * one; `proposed` is the auditor's own recommendation and stays option 1.
   */
  alternatives?: CheckupProposedRule[];
  /** Why, in the Expert's own terms — never model jargon. */
  reason: string;
  /** VERBATIM quote of what the Expert said. Never paraphrased. */
  evidence: string;
  evidence_ref?: CheckupEvidenceRef;
  /** 0-1. Rendered honestly: a low-confidence suggestion LOOKS low-confidence. */
  confidence: number;
  source: string;
}

/** The terminal document of a checkup run (also what the durable row stores). */
export interface CheckupResult {
  findings: CheckupFinding[];
  /** Optional server sentence for "we looked at all of it and found nothing". */
  summary?: string;
}

/** What the Expert decided about one finding, before anything is written. */
export type CheckupDecision = "approve" | "dismiss";

/**
 * One finding's disposition while the Expert works. `alternativeIndex` is which
 * option they picked (-1 = the auditor's own `proposed`); `edited` is their
 * hand-corrected version of it (ProTextarea — they can dictate it); `note` is
 * why they dismissed it, which is what teaches the next checkup.
 */
export interface CheckupDisposition {
  decision: CheckupDecision;
  /** Set when "Approve with AI" made this call rather than the Expert. */
  byAi?: boolean;
  alternativeIndex?: number;
  edited?: CheckupProposedRule;
  note?: string;
}

/**
 * The record of a checkup the Expert finished, kept on
 * `platform.rulebook.metadata.checkup` so the same suggestion is not proposed
 * forever. Approved findings need no memory — they CHANGED the Rulebook, so
 * the auditors no longer see the gap. A DISMISSAL is the fact that has nowhere
 * else to live, and it is fingerprinted (not by the run-scoped finding id,
 * which never repeats) so a later run can recognise the same suggestion.
 *
 * aidream's checkup service reads this to suppress what the Expert already
 * said no to; this surface is its only writer.
 */
export interface CheckupDismissal {
  kind: CheckupFindingKind;
  /** The rule the dismissed finding was about (modify / remove). */
  target_rule_id?: string;
  /** The proposed rule's name (add) — the stable handle for a suggestion. */
  proposed_name?: string;
  /** The Expert's reason, when they gave one. */
  note?: string;
  at: string;
}

export interface RulebookCheckupMemory {
  last_run_at?: string;
  last_run_id?: string;
  /** How many findings the Expert accepted on the last checkup. */
  last_applied?: number;
  dismissed?: CheckupDismissal[];
}

/** The fingerprint a dismissal is matched by, for suppression and dedupe. */
export function dismissalFingerprint(
  entry: Pick<CheckupDismissal, "kind" | "target_rule_id" | "proposed_name">,
): string {
  return `${entry.kind}:${entry.target_rule_id ?? ""}:${(entry.proposed_name ?? "").trim().toLowerCase()}`;
}

export function findingFingerprint(finding: CheckupFinding): string {
  return dismissalFingerprint({
    kind: finding.kind,
    ...(finding.target_rule_id ? { target_rule_id: finding.target_rule_id } : {}),
    ...(finding.proposed?.name ? { proposed_name: finding.proposed.name } : {}),
  });
}

const KINDS = new Set<CheckupFindingKind>(["add", "modify", "remove"]);
const SEVERITIES = new Set<RuleSeverity>(["critical", "major", "minor"]);

function parseProposed(raw: unknown): CheckupProposedRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || typeof r.statement !== "string") return null;
  const severity = SEVERITIES.has(r.severity as RuleSeverity)
    ? (r.severity as RuleSeverity)
    : "major";
  return {
    name: r.name,
    statement: r.statement,
    severity,
    section: typeof r.section === "string" && r.section ? r.section : "G",
    ...(typeof r.rationale === "string" ? { rationale: r.rationale } : {}),
    ...(typeof r.detection === "string" ? { detection: r.detection } : {}),
  };
}

/**
 * Narrow one wire finding. A malformed finding is DROPPED rather than rendered
 * half-built — the Expert must never be asked to approve something we cannot
 * describe. Returns null so the caller can count and report the drop.
 */
export function parseFinding(raw: unknown): CheckupFinding | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (!KINDS.has(r.kind as CheckupFindingKind)) return null;
  const kind = r.kind as CheckupFindingKind;
  const proposed = parseProposed(r.proposed);
  const targetRuleId =
    typeof r.target_rule_id === "string" ? r.target_rule_id : undefined;
  // A finding we could not act on is not a finding.
  if ((kind === "add" || kind === "modify") && !proposed) return null;
  if ((kind === "modify" || kind === "remove") && !targetRuleId) return null;
  const alternatives = Array.isArray(r.alternatives)
    ? r.alternatives.map(parseProposed).filter((p): p is CheckupProposedRule => p !== null)
    : [];
  const confidence =
    typeof r.confidence === "number" && Number.isFinite(r.confidence)
      ? Math.min(1, Math.max(0, r.confidence))
      : 0.5;
  const evidenceRef =
    r.evidence_ref && typeof r.evidence_ref === "object"
      ? (r.evidence_ref as CheckupEvidenceRef)
      : undefined;
  return {
    id: r.id,
    kind,
    ...(targetRuleId ? { target_rule_id: targetRuleId } : {}),
    ...(proposed ? { proposed } : {}),
    ...(alternatives.length > 0 ? { alternatives } : {}),
    reason: typeof r.reason === "string" ? r.reason : "",
    evidence: typeof r.evidence === "string" ? r.evidence : "",
    ...(evidenceRef ? { evidence_ref: evidenceRef } : {}),
    confidence,
    source: typeof r.source === "string" ? r.source : "checkup_auditor",
  };
}

/** Narrow the terminal document. Returns null (loudly) when it is unusable. */
export function parseCheckupResult(raw: unknown): CheckupResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.findings)) return null;
  return {
    findings: r.findings
      .map(parseFinding)
      .filter((f): f is CheckupFinding => f !== null),
    ...(typeof r.summary === "string" ? { summary: r.summary } : {}),
  };
}

/** The proposal the Expert actually chose for a finding (option or their edit). */
export function chosenProposal(
  finding: CheckupFinding,
  disposition: CheckupDisposition | undefined,
): CheckupProposedRule | undefined {
  if (disposition?.edited) return disposition.edited;
  const index = disposition?.alternativeIndex ?? -1;
  if (index >= 0 && finding.alternatives?.[index]) {
    return finding.alternatives[index];
  }
  return finding.proposed;
}

/** How a finding reads in one line, in Expert language. */
export const CHECKUP_KIND_LABELS: Record<CheckupFindingKind, string> = {
  add: "Missing rule",
  modify: "Says less than you meant",
  remove: "No longer holds",
};

export const CHECKUP_KIND_VERBS: Record<CheckupFindingKind, string> = {
  add: "Add this rule",
  modify: "Change this rule",
  remove: "Retire this rule",
};

/**
 * Confidence bands, so the UI can never render a guess as a certainty.
 * "Approve with AI" only ever reaches `sure`.
 */
export type ConfidenceBand = "sure" | "likely" | "unsure";

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.8) return "sure";
  if (confidence >= 0.55) return "likely";
  return "unsure";
}

export const CONFIDENCE_LABELS: Record<ConfidenceBand, string> = {
  sure: "We're confident",
  likely: "Worth a look",
  unsure: "We're guessing — check this one",
};

/** The rule a `modify` / `remove` finding points at, if it is still there. */
export function targetRule(
  rules: RulebookRule[],
  finding: CheckupFinding,
): RulebookRule | undefined {
  if (!finding.target_rule_id) return undefined;
  return rules.find((r) => r.id === finding.target_rule_id);
}
