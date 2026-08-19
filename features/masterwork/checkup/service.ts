import { saveRules } from "../service";
import { nextRuleId } from "../ruleIds";
import type { Rulebook, RulebookRule } from "../types";
import {
  chosenProposal,
  dismissalFingerprint,
  type CheckupDismissal,
  type CheckupDisposition,
  type CheckupFinding,
  type RulebookCheckupMemory,
} from "./types";

/**
 * Applying a Final Checkup. Two halves, deliberately separated:
 *
 *   1. `projectCheckup` — PURE. Decisions in, the next rules + the next
 *      checkup memory out. Every rule it touches is auditable without a
 *      database, and the receipt it returns is what the Expert reads back.
 *   2. `applyCheckup` — ONE write, through the Rulebook's existing
 *      `saveRules` compare-and-swap. No second write path, no per-finding
 *      save storm, and a concurrent edit surfaces as a real conflict.
 *
 * THE RETIREMENT INVARIANT: a `remove` finding RETIRES its rule
 * (`retired: true`). It is never deleted — the rule keeps its id so past audit
 * verdicts that cite it still resolve.
 */

/** How many dismissals we keep. Old refusals stop being informative. */
const MAX_REMEMBERED_DISMISSALS = 200;

export interface CheckupReceiptEntry {
  findingId: string;
  kind: CheckupFinding["kind"];
  /** The rule id this decision landed on — the door back to the change. */
  ruleId: string;
  ruleName: string;
  byAi: boolean;
}

export interface CheckupProjection {
  rules: RulebookRule[];
  metadata: Record<string, unknown>;
  applied: CheckupReceiptEntry[];
  dismissed: number;
  /**
   * Findings whose target rule is gone (someone retired or replaced it while
   * the checkup was open). Stated, never silently skipped.
   */
  stale: CheckupFinding[];
}

/**
 * Project a set of decisions onto the Rulebook. Approved findings change
 * rules; dismissed findings become memory so the next checkup does not ask
 * again. Findings with no decision are left entirely alone — the Expert can
 * come back to them.
 */
export function projectCheckup(opts: {
  rulebook: Rulebook;
  findings: CheckupFinding[];
  dispositions: Record<string, CheckupDisposition>;
  runId: string | null;
}): CheckupProjection {
  const { rulebook, findings, dispositions, runId } = opts;
  const rules = rulebook.rules.map((r) => ({ ...r }));
  const byId = new Map(rules.map((r) => [r.id, r]));
  const usedIds = new Set(rules.map((r) => r.id));
  const applied: CheckupReceiptEntry[] = [];
  const stale: CheckupFinding[] = [];
  const newDismissals: CheckupDismissal[] = [];
  const now = new Date().toISOString();

  for (const finding of findings) {
    const disposition = dispositions[finding.id];
    if (!disposition) continue;

    if (disposition.decision === "dismiss") {
      newDismissals.push({
        kind: finding.kind,
        ...(finding.target_rule_id
          ? { target_rule_id: finding.target_rule_id }
          : {}),
        ...(finding.proposed?.name
          ? { proposed_name: finding.proposed.name }
          : {}),
        ...(disposition.note?.trim() ? { note: disposition.note.trim() } : {}),
        at: now,
      });
      continue;
    }

    const proposal = chosenProposal(finding, disposition);
    const byAi = disposition.byAi === true;

    if (finding.kind === "add") {
      if (!proposal) continue;
      const id = nextRuleId(proposal.name, usedIds);
      usedIds.add(id);
      const rule: RulebookRule = {
        id,
        name: proposal.name,
        section: proposal.section,
        statement: proposal.statement,
        severity: proposal.severity,
        // The Expert approved it HERE — that is the human-first act, so it
        // lands live, not as another draft they must approve twice.
        draft: false,
        ...(proposal.rationale ? { rationale: proposal.rationale } : {}),
        ...(proposal.detection ? { detection: proposal.detection } : {}),
        // THE ANTI-MISLEADING LAW: the connection to a sibling rule is part of
        // the proposal, not decoration. Dropping it here is what made the
        // Relationship Auditor's findings land as statement-only edits.
        ...(proposal.relates_to?.length
          ? { relates_to: proposal.relates_to }
          : {}),
        // Their own words are the citation for a rule they never wrote down.
        ...(finding.evidence ? { quote: finding.evidence } : {}),
        source_ref: {
          approach: "checkup",
          note: "your final checkup",
          ...(finding.evidence_ref?.conversation_id
            ? { conversation_id: finding.evidence_ref.conversation_id }
            : {}),
          ...(finding.evidence_ref?.file_id
            ? { file_id: finding.evidence_ref.file_id }
            : {}),
          ...(finding.evidence_ref?.time_range
            ? { time_range: finding.evidence_ref.time_range }
            : {}),
        },
      };
      rules.push(rule);
      byId.set(id, rule);
      applied.push({
        findingId: finding.id,
        kind: "add",
        ruleId: id,
        ruleName: rule.name,
        byAi,
      });
      continue;
    }

    const target = finding.target_rule_id
      ? byId.get(finding.target_rule_id)
      : undefined;
    if (!target) {
      stale.push(finding);
      continue;
    }

    if (finding.kind === "remove") {
      target.retired = true;
      applied.push({
        findingId: finding.id,
        kind: "remove",
        ruleId: target.id,
        ruleName: target.name,
        byAi,
      });
      continue;
    }

    // modify — the id never changes (audits cite it), everything else can.
    if (!proposal) continue;
    target.name = proposal.name;
    target.statement = proposal.statement;
    target.severity = proposal.severity;
    target.section = proposal.section;
    if (proposal.rationale !== undefined) target.rationale = proposal.rationale;
    if (proposal.detection !== undefined) target.detection = proposal.detection;
    // A `modify` that carries relations REPLACES them (the auditor proposes the
    // rule's whole connection set); one that carries none leaves the rule's
    // existing relations untouched — a statement edit is not a de-linking.
    if (proposal.relates_to?.length) target.relates_to = proposal.relates_to;
    // The Expert just ruled on this rule: it is approved and carries no open
    // review state (same rule as approving a draft in the rule list).
    target.draft = false;
    delete target.rejected;
    delete target.feedback;
    applied.push({
      findingId: finding.id,
      kind: "modify",
      ruleId: target.id,
      ruleName: target.name,
      byAi,
    });
  }

  const metadata = {
    ...((rulebook.metadata ?? {}) as Record<string, unknown>),
  };
  const previous = readCheckupMemory(rulebook);
  const merged = new Map<string, CheckupDismissal>();
  for (const entry of previous.dismissed ?? []) {
    merged.set(dismissalFingerprint(entry), entry);
  }
  for (const entry of newDismissals) {
    merged.set(dismissalFingerprint(entry), entry);
  }
  const dismissed = [...merged.values()].slice(-MAX_REMEMBERED_DISMISSALS);
  const nextMemory: RulebookCheckupMemory = {
    last_run_at: now,
    ...(runId ? { last_run_id: runId } : {}),
    last_applied: applied.length,
    ...(dismissed.length > 0 ? { dismissed } : {}),
  };
  metadata.checkup = nextMemory;

  return {
    rules,
    metadata,
    applied,
    dismissed: newDismissals.length,
    stale,
  };
}

/** What the Expert already said no to — read by this surface AND by aidream. */
export function readCheckupMemory(rulebook: Rulebook): RulebookCheckupMemory {
  const meta = (rulebook.metadata ?? {}) as Record<string, unknown>;
  const raw = meta.checkup;
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  return {
    ...(typeof record.last_run_at === "string"
      ? { last_run_at: record.last_run_at }
      : {}),
    ...(typeof record.last_run_id === "string"
      ? { last_run_id: record.last_run_id }
      : {}),
    ...(typeof record.last_applied === "number"
      ? { last_applied: record.last_applied }
      : {}),
    ...(Array.isArray(record.dismissed)
      ? { dismissed: record.dismissed as CheckupDismissal[] }
      : {}),
  };
}

export interface CheckupApplyOutcome {
  rulebook: Rulebook;
  applied: CheckupReceiptEntry[];
  dismissed: number;
  stale: CheckupFinding[];
  /** The rules as they were BEFORE — what an Undo restores. */
  previousRules: RulebookRule[];
}

/**
 * Write the Expert's decisions. ONE compare-and-swap on the version they were
 * looking at: if the Scout (or another tab) saved first, this raises the
 * Rulebook's own readable conflict message instead of silently overwriting
 * their work.
 */
export async function applyCheckup(opts: {
  rulebook: Rulebook;
  findings: CheckupFinding[];
  dispositions: Record<string, CheckupDisposition>;
  runId: string | null;
}): Promise<CheckupApplyOutcome> {
  const projection = projectCheckup(opts);
  const saved = await saveRules({
    rulebookId: opts.rulebook.id,
    expectedVersion: opts.rulebook.version,
    rules: projection.rules,
    metadata: projection.metadata,
  });
  return {
    rulebook: saved,
    applied: projection.applied,
    dismissed: projection.dismissed,
    stale: projection.stale,
    previousRules: opts.rulebook.rules,
  };
}

/**
 * Undo the checkup just applied — put the rules back exactly as they were.
 * A real action on a real version, not a local rewind: it is another save, so
 * the version log shows both the change and the undo.
 */
export async function undoCheckup(opts: {
  rulebook: Rulebook;
  previousRules: RulebookRule[];
}): Promise<Rulebook> {
  return saveRules({
    rulebookId: opts.rulebook.id,
    expectedVersion: opts.rulebook.version,
    rules: opts.previousRules,
  });
}
