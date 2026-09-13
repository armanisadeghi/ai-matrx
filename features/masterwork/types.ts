import type { Database } from "@/types/database.types";

/**
 * Rulebooks — the versioned, citable capture of one Expert's judgment.
 * DB truth: platform.rulebook (see common-docs systems/platform/vocabulary/FEATURE.md
 * § Settled — Masterwork). The generated Row type keeps the JSONB columns as
 * Json; these are the ONE set of app-level shapes for their contents — never
 * re-declare them beside a consumer.
 */

export type RulebookRow = Database["platform"]["Tables"]["rulebook"]["Row"];

export type RulebookVisibility = Database["platform"]["Enums"]["visibility"];

export type RulebookStatus = "draft" | "active" | "archived";

export type RuleSeverity = "critical" | "major" | "minor";

/** Where a distilled rule came from (every rule stays clickable back to its source). */
export interface RuleSourceRef {
  /** Page number(s) in the source document, e.g. "12" or "12-14". */
  pages?: string;
  /**
   * Real page anchors from the file Approach — the pages of the uploaded
   * document this rule was extracted from (`/masterworks/ingest-file`).
   */
  source_pages?: number[];
  /** The uploaded source file (`files.files` id) — openable at /files/f/{id}. */
  file_id?: string;
  /** The extraction template that read the document, openable in the studio. */
  page_extraction_job_id?: string;
  /** The extraction run that produced this rule. */
  page_extraction_run_id?: string;
  /** Chunk index in the ingestion run that produced this rule. */
  chunk?: number;
  /**
   * Time anchor for a rule distilled from a RECORDING (the monologue lane):
   * the seconds range of the transcript portion the rule came from. `end`
   * is null when the transcription carried no end offset.
   */
  time_range?: { start: number; end?: number | null };
  /**
   * The monologue distiller's read on how plainly the expert stated the
   * rule — "low" means an inference from an aside the Expert should confirm.
   */
  confidence?: "high" | "medium" | "low";
  /**
   * The Distillation Approach that produced this rule — a `platform.approach`
   * key (interview / source / exemplar / file / …), stamped by every lane
   * through the one shared rule builder. Additive; older rules lack it.
   */
  approach?: string;
  /** Ingestion run id (docproc / extraction run) for full traceability. */
  run_id?: string;
  /**
   * THE SOURCE IDENTITY every lane stamps (aidream
   * `services/distillation/source_identity.py`, W40) — `text:<hash>` for a
   * paste, `file:<id>`, `entity:<token>:<id>`, `conversation:<key>`, a URL.
   * It is the join between a rule and the source row it came from: the
   * Rulebook's Resources list counts the rules a pasted source produced by
   * matching this against the edge's `source_key`.
   */
  source?: string;
  /** Free-form pointer ("Chapter 6", timestamp for audio, etc.). */
  note?: string;
  /** True when the source was reverse-engineered exemplar work. */
  exemplar?: boolean;
  /** The quote could not be machine-verified verbatim — needs a human look. */
  quote_unverified?: boolean;
  /** Set by the Scout interview Approach. */
  interview?: boolean;
  conversation_id?: string;
  /**
   * THE ORACLE TAP's provenance: the exact chat message this draft was saved
   * from. A draft sitting in "Waiting on you" must be able to point back at the
   * turn it came from, not just the conversation.
   */
  message_id?: string;
  /**
   * The question the saved answer answered, when the message was a reply to a
   * user turn — the Oracle tap's whole point is that the QUESTION maps which
   * judgment is scarce.
   */
  question?: string;
  /**
   * The dump Approach's provenance for a rule distilled from an ATTACHED
   * entity (`platform.associations` role `distillation_source`): the canonical
   * token + row id of the source. Rendered as a named door via the registry.
   */
  entity?: { token: string; id: string };
  /** The dump Approach's provenance for a rule distilled from a URL source. */
  url?: string;
  /**
   * WHICH PIECE of a body of work this rule was distilled from — the canonical
   * key of the `platform.masterwork_corpus_item` row, stamped on both piece
   * paths (link and file) so it speaks the same vocabulary as a synthesized
   * rule's `pieces` citations.
   */
  corpus_piece?: string;
  /** The cross-piece synthesis pass wrote this rule. */
  synthesis?: boolean;
  /** The pieces a synthesized rule cites as proof — `corpus_piece` keys. */
  pieces?: string[];
  /**
   * The distinct pieces of this rule's own source that produced the same
   * judgment. Its length is the rule's RECURRENCE, rendered as a
   * "seen in N pieces" badge once it reaches
   * `masterwork_distillation.recurrence_badge_pieces`. A badge, never a gate:
   * a judgment stated once is a rule (`distill.py` § FREQUENCY IS NOT
   * EXISTENCE).
   */
  evidence_pieces?: string[];
  /**
   * 🚨 NEITHER EXPRESSION WINS. The OTHER ways this rule's own source stated
   * the same judgment, kept when a second piece of that source repeated it.
   * Before this, the first expression won on append order and every other one
   * was counted as a duplicate and thrown away.
   */
  quotes?: RuleKeptExpression[];
}

/** One kept second expression of a rule — see `RuleSourceRef.quotes`. */
export interface RuleKeptExpression {
  statement: string;
  quote?: string;
  detection?: string;
  /** Which piece of the source said it this way. */
  piece?: string;
  chunk?: number;
  source_pages?: number[];
  step?: number;
}

/**
 * THE RELATIONSHIP VOCABULARY — six kinds, and only six. Mirrors
 * `aidream/services/distillation/distill.py::RELATION_KINDS`; keep them
 * byte-identical.
 */
export const RULE_RELATION_KINDS = [
  "refines",
  "depends_on",
  "exception_to",
  "contrast_with",
  "disagrees_with",
  "agrees_with",
] as const;

export type RuleRelationKind = (typeof RULE_RELATION_KINDS)[number];

/** How the connection reads to the Expert, in their language — never jargon. */
export const RULE_RELATION_LABELS: Record<RuleRelationKind, string> = {
  refines: "Narrows down",
  depends_on: "Only applies after",
  exception_to: "Is the exception to",
  contrast_with: "Easy to confuse with",
  disagrees_with: "Disagrees with",
  agrees_with: "Agrees with",
};

/**
 * One documented connection from this rule to a SIBLING rule.
 *
 * 🚨 THE ANTI-MISLEADING LAW (Arman, 2026-08-18, after reading all 28 rules of
 * the SEO Rulebook by hand): a rule that silently refines, qualifies, depends
 * on, or contradicts another rule — and presents itself as standalone — is a
 * CORRECTNESS defect, not a style nit.
 *
 * This is the SECOND half of the fix, never the first: the connecting aspect
 * must ALSO be carried concisely inside `statement`, so the rule is not
 * misleading anywhere `relates_to` is not rendered (a printed Masterwork, an
 * audit verdict, an export). This object makes the connection machine-readable
 * and gives the UI a door to the sibling.
 */
export interface RuleRelation {
  /** The sibling rule's `id` — guaranteed to exist in this Rulebook: the
   * server drops an unresolvable reference rather than write a dead link. */
  rule_id: string;
  kind: RuleRelationKind;
  /** One short clause naming WHAT connects them — the link's label. */
  note?: string;
  /**
   * 🚨 `disagrees_with` only — THE RETAINED DISAGREEMENT (2026-09-12, Arman's
   * expertise mandate: "Surface, retain, and make navigable divergent
   * approaches, dissent, and controversy… without collapsing them into
   * consensus").
   *
   * The Expert's own plain words for what separates the two positions ("on a
   * client site the first one; on our own site the second"). ABSENT is a real
   * and final answer, never a gap to fill in: it means they said both simply
   * hold. Neither position is a defect and neither is waiting to be resolved.
   */
  condition?: string;
}

/**
 * One position this rule USED to state, kept when a machine or a tool rewrote
 * its `statement` (`rulebook_writes.push_rule_history` on the server). The
 * Expert's own edits are not history entries — the Rulebook row's version
 * history already holds those.
 *
 * Why it exists (interview lane, trial 2, 2026-09-12): the Scout caught a real
 * cross-turn contradiction and resolved it by rewriting the rule in place to
 * carry "the real line". Nothing recorded that the Expert had ever held the
 * earlier one.
 */
export interface RuleHistoryEntry {
  /** The words that were replaced — verbatim. */
  statement: string;
  rationale?: string;
  changed_at: string;
  /** The tool or lane that rewrote it, with the acting user. */
  changed_by: string;
  /** Why, in one clause. */
  reason?: string;
}

/**
 * 🚨 THE POLICY RULE SHAPE (W58, 2026-09-12) — the DECISION half of a rule.
 *
 * A case that unfolds in time does not teach a static commandment; it teaches a
 * judgment: *given what is known at this moment, do X, and here is what it
 * costs and risks.* The distillers write this half onto rules
 * (`aidream/services/distillation/distill.py`), and until 2026-09-12 no
 * frontend surface declared it or rendered it — 592 live rules carried an
 * if → then that every screen hid. Law 4: a screen never lies by omission.
 *
 * Both vocabularies MIRROR the server byte-for-byte
 * (`distill.py::ACTION_KINDS` / `POLICY_LEVELS`); the guard in
 * `features/masterwork/__tests__/policy-rule-surface.test.tsx` parses that file
 * and fails the moment either list drifts. An unknown value is a value the
 * server would have dropped: render nothing for it rather than invent a label.
 */
export const RULE_POLICY_KIND = "policy" as const;

/**
 * What the Expert DID at this step — and what a practitioner's NEXT move is.
 * ONE closed vocabulary for both halves (2026-09-13): this list used to be
 * declared twice in this file, six values for the flat decision half and nine
 * for the structured move half. The nine are a superset, so one list serves
 * both and no rule can be readable through one half and not the other.
 */
export const RULE_ACTION_KINDS = [
  "ask",
  "examine",
  "test",
  "image",
  "treat",
  "observe",
  "refer",
  "wait",
  "commit",
] as const;

export type RuleActionKind = (typeof RULE_ACTION_KINDS)[number];

/** Cost and risk both speak this three-value ladder. */
export const RULE_POLICY_LEVELS = ["low", "medium", "high"] as const;

export type RulePolicyLevel = (typeof RULE_POLICY_LEVELS)[number];

/** How the chosen move reads to the Expert, in their language — never jargon. */
export const RULE_ACTION_KIND_LABELS: Record<RuleActionKind, string> = {
  ask: "Ask",
  examine: "Examine",
  test: "Test",
  image: "Image",
  treat: "Treat",
  observe: "Watch and wait",
  refer: "Refer",
  wait: "Wait",
  commit: "Commit to an answer",
};

export const RULE_POLICY_LEVEL_LABELS: Record<RulePolicyLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** A rule that teaches a decision rather than a standing commandment. */
export function isPolicyRule(rule: RulebookRule): boolean {
  return rule.kind === RULE_POLICY_KIND;
}

/** The value only when the server's own vocabulary contains it. */
export function ruleActionKind(rule: RulebookRule): RuleActionKind | null {
  const value = rule.action_kind;
  return value && (RULE_ACTION_KINDS as readonly string[]).includes(value)
    ? (value as RuleActionKind)
    : null;
}

export function rulePolicyLevel(value: string | undefined): RulePolicyLevel | null {
  return value && (RULE_POLICY_LEVELS as readonly string[]).includes(value)
    ? (value as RulePolicyLevel)
    : null;
}

/** How soon the next action has to happen. */
export const RULE_ACTION_URGENCIES = ["now", "hours", "days", "weeks"] as const;

export type RuleActionUrgency = (typeof RULE_ACTION_URGENCIES)[number];

export const RULE_ACTION_URGENCY_LABELS: Record<RuleActionUrgency, string> = {
  now: "right now",
  hours: "within hours",
  days: "within days",
  weeks: "within weeks",
};

/**
 * WHAT HAD TO BE TRUE for this step to fire — the known set at the moment of
 * decision, what was still unknown, and (for an elicitation move) the state
 * the counterparty is in. Optional: a static rule carries none, and absence
 * means exactly that.
 *
 * 🚨 Lives at `rule.move.when`, never at `rule.precondition` — that key is the
 * flat string 592 live rules carry. Mirrors `distill.py::MoveWhen`.
 */
export interface RuleMoveWhen {
  /** The situation in one plain sentence — what the card prints after "When:". */
  summary: string;
  /** Facts that must already be known. */
  known?: string[];
  /** Facts that are still open at this moment — the reason the next step exists. */
  unknown?: string[];
  /** The counterparty's state this move is for ("guarded", "ambivalent"). */
  counterparty_state?: string[];
}

/**
 * WHAT TO DO NEXT — the step the rule prescribes, with what it buys and what
 * it costs. `cost` and `risk` are 1–5; anything outside that is not rendered
 * as a number rather than silently clamped to a lie.
 *
 * 🚨 Lives at `rule.move.next`, never at `rule.next_action` — that key is the
 * flat string. The flat `cost` / `risk` beside it speak `RULE_POLICY_LEVELS`
 * (low/medium/high); these two speak the 1–5 ladder. Mirrors
 * `distill.py::MoveNext`.
 */
export interface RuleMoveNext {
  kind: RuleActionKind;
  /** The thing to do — "lumbar puncture (CT first if focal signs)". */
  target: string;
  /** What this step buys you — "excludes the worst thing first". */
  buys?: string;
  /** 1–5. */
  cost?: number;
  /** 1–5. */
  risk?: number;
  urgency?: RuleActionUrgency;
}

/** Tolerant reads — a malformed half never renders as a confident half. */
export function parseRuleMoveWhen(value: unknown): RuleMoveWhen | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const summary =
    typeof rec.summary === "string" && rec.summary.trim()
      ? rec.summary.trim()
      : "";
  if (!summary) return null;
  const list = (raw: unknown): string[] =>
    Array.isArray(raw)
      ? raw.flatMap((item) =>
          typeof item === "string" && item.trim() ? [item.trim()] : [],
        )
      : [];
  const known = list(rec.known);
  const unknown = list(rec.unknown);
  const counterparty_state = list(rec.counterparty_state);
  return {
    summary,
    ...(known.length ? { known } : {}),
    ...(unknown.length ? { unknown } : {}),
    ...(counterparty_state.length ? { counterparty_state } : {}),
  };
}

export function parseRuleMoveNext(value: unknown): RuleMoveNext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const kind = RULE_ACTION_KINDS.find((k) => k === rec.kind);
  const target =
    typeof rec.target === "string" && rec.target.trim()
      ? rec.target.trim()
      : "";
  // A next action with no verb or no object is not an instruction — render
  // nothing rather than "Next: —".
  if (!kind || !target) return null;
  const scale = (raw: unknown): number | undefined =>
    typeof raw === "number" && Number.isFinite(raw) && raw >= 1 && raw <= 5
      ? Math.round(raw)
      : undefined;
  const urgency = RULE_ACTION_URGENCIES.find((u) => u === rec.urgency);
  const cost = scale(rec.cost);
  const risk = scale(rec.risk);
  return {
    kind,
    target,
    ...(typeof rec.buys === "string" && rec.buys.trim()
      ? { buys: rec.buys.trim() }
      : {}),
    ...(cost === undefined ? {} : { cost }),
    ...(risk === undefined ? {} : { risk }),
    ...(urgency ? { urgency } : {}),
  };
}

/**
 * THE MOVE — a rule body that is a STEP rather than a standing statement.
 *
 * `when` and `next` are what the frontend renders today (`RuleMove`); `ask`,
 * `rules_in`, `rules_out`, `information_value`, `frame` and `order` are the
 * elicitation half the distillers write (`distill.py::Move`) and no surface
 * reads yet — they are declared so a reader of this file sees the whole shape
 * and the next surface does not have to rediscover it.
 */
export interface RuleMove {
  when?: RuleMoveWhen;
  next?: RuleMoveNext;
  ask?: string;
  rules_in?: { answer_class?: string; settles?: string }[];
  rules_out?: { answer_class?: string; settles?: string }[];
  information_value?: string;
  frame?: string;
  order?: number;
}

/**
 * The MOVE fields as the rule FORM holds them: plain strings, one list item
 * per line. A form that held the structured objects directly would throw away
 * a half-typed line on every keystroke; these convert at the edges through the
 * two functions below, which are the ONE conversion — never re-derive it.
 */
export interface RuleMoveFieldValues {
  preconditionSummary: string;
  /** One fact per line. */
  preconditionKnown: string;
  /** One still-open question per line. */
  preconditionUnknown: string;
  nextActionKind: RuleActionKind | "";
  nextActionTarget: string;
  nextActionBuys: string;
  /** "" or "1".."5". */
  nextActionCost: string;
  nextActionRisk: string;
  nextActionUrgency: RuleActionUrgency | "";
}

export const EMPTY_RULE_MOVE_FIELDS: RuleMoveFieldValues = {
  preconditionSummary: "",
  preconditionKnown: "",
  preconditionUnknown: "",
  nextActionKind: "",
  nextActionTarget: "",
  nextActionBuys: "",
  nextActionCost: "",
  nextActionRisk: "",
  nextActionUrgency: "",
};

export function ruleMoveFieldsFromRule(
  rule: Pick<RulebookRule, "move"> | undefined,
): RuleMoveFieldValues {
  const pre = rule?.move?.when;
  const next = rule?.move?.next;
  return {
    preconditionSummary: pre?.summary ?? "",
    preconditionKnown: (pre?.known ?? []).join("\n"),
    preconditionUnknown: (pre?.unknown ?? []).join("\n"),
    nextActionKind: next?.kind ?? "",
    nextActionTarget: next?.target ?? "",
    nextActionBuys: next?.buys ?? "",
    nextActionCost: next?.cost === undefined ? "" : String(next.cost),
    nextActionRisk: next?.risk === undefined ? "" : String(next.risk),
    nextActionUrgency: next?.urgency ?? "",
  };
}

/**
 * Form values → `rule.move`. Each half is emitted only when
 * it is genuinely there: a precondition needs its summary, a next action needs
 * both a kind and a target. Half-filled is the same as absent — never a rule
 * that prints "Next: —".
 */
export function ruleMoveFromFields(values: RuleMoveFieldValues): {
  move?: RuleMove;
} {
  const lines = (raw: string): string[] =>
    raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  const precondition = parseRuleMoveWhen({
    summary: values.preconditionSummary,
    known: lines(values.preconditionKnown),
    unknown: lines(values.preconditionUnknown),
  });
  const next_action = parseRuleMoveNext({
    kind: values.nextActionKind,
    target: values.nextActionTarget,
    buys: values.nextActionBuys,
    cost: values.nextActionCost ? Number(values.nextActionCost) : undefined,
    risk: values.nextActionRisk ? Number(values.nextActionRisk) : undefined,
    urgency: values.nextActionUrgency || undefined,
  });
  const move: RuleMove = {
    ...(precondition ? { when: precondition } : {}),
    ...(next_action ? { next: next_action } : {}),
  };
  return Object.keys(move).length ? { move } : {};
}

/** One rule of the Rulebook. `id` is the citable handle every audit verdict points at. */
export interface RulebookRule {
  id: string;
  name: string;
  /** Section code — key into Rulebook.sections. */
  section: string;
  /** The faithful imperative — what the Expert demands. */
  statement: string;
  /** Why the rule exists, in the Expert's reasoning. */
  rationale?: string;
  /** Verbatim contiguous span of the source (machine-verified at ingestion). */
  quote?: string;
  /** How a violation is recognized — what the auditor applies. */
  detection?: string;
  severity: RuleSeverity;
  /** Optional chapter/locator carried from Distillation. */
  chapter?: string;
  /** Retired rules stay in the Rulebook for citation history but are excluded from built Masterworks. */
  retired?: boolean;
  /** Drafts (from ingestion or the Scout) awaiting the Expert's approval. */
  draft?: boolean;
  /**
   * The Expert rejected this rule; `feedback` carries their reason. The Scout
   * clears it next turn — rewrite per the feedback (re-queues as a fresh
   * draft) or withdraw the rule. Rejected rules never power a Build.
   */
  rejected?: boolean;
  /**
   * Transient review note from the Expert — the reason on a rejected rule, or
   * a request-changes note on any rule. It is review state, never part of the
   * rule: the Scout applying it consumes it, and approval clears it.
   */
  feedback?: string;
  /**
   * 🚨 HOW THIS RULE WAS REVIEWED — the honest record of what a person
   * actually read before it was approved (Google Docs suggestion mode's
   * record of who accepted, applied to a review queue).
   *
   * The incident it closes (2026-09-12, live): Newsroom Desk, 416 rules, zero
   * drafts — Approve-all had fired on the whole pile, and the result was
   * indistinguishable on screen from 416 real decisions. `mode: "read"` is one
   * rule the Expert opened and approved; `mode: "sampled"` is a bulk approve,
   * and it carries how many of the selection were actually read so the rule
   * can say "approved in bulk, 12 of 416 read" on its own face. Absent means
   * nobody has approved it through this surface yet.
   */
  reviewed?: RuleReview;
  /**
   * Who last ruled on this rule and when — stamped by the ONE write path on
   * every approve, reject and edit, never by a caller.
   */
  ruled_by?: string;
  ruled_at?: string;
  /** Back-reference to the source location this rule was distilled from. */
  source_ref?: RuleSourceRef;
  /**
   * Documented connections to sibling rules — see `RuleRelation`. Additive and
   * optional; a genuinely standalone rule has none. Deliberately NOT in
   * `RULE_CONTENT_FIELDS`: that list is the string fields a manual edit
   * compares, and relations are structural, not prose.
   */
  relates_to?: RuleRelation[];
  /**
   * 🚨 THE MOVE (trial 7 + W70) — the machine-readable body of a rule that is
   * a STEP rather than a standing statement: when it fires (`when`, including
   * what is still unknown and the counterparty's state) and what to do next
   * (`next`). Trial 7 built these as top-level `precondition` / `next_action`
   * OBJECTS; 592 live rules already carried those two keys as STRINGS, so the
   * structured halves moved in here on 2026-09-13 and the flat strings below
   * stayed. Mirrors `distill.py::Move`. Rendered by `RuleMove`, never by
   * `RuleDecision`.
   */
  move?: RuleMove;
  /**
   * 🚨 THE DECISION HALF (W58, 2026-09-12) — see `RULE_POLICY_KIND` above.
   * `"policy"` means this rule is a judgment made under uncertainty; the five
   * fields below carry it. Absent on an ordinary rule, and absent on every rule
   * written before 2026-09-12 — absence means "a standing commandment".
   * Deliberately NOT in `RULE_CONTENT_FIELDS`: that list is the prose fields a
   * manual edit compares, and these are set through the `rulebook` tool's
   * `update_rule`, one field at a time.
   */
  kind?: string;
  /** What is known at the point this judgment applies — the "if". */
  precondition?: string;
  /** The ONE next move chosen at that point — the "then". */
  next_action?: string;
  /** One of `RULE_ACTION_KINDS`. */
  action_kind?: string;
  /** Cost OF THE ACTION — one of `RULE_POLICY_LEVELS`. */
  cost?: string;
  /** Risk OF THE ACTION — one of `RULE_POLICY_LEVELS`. */
  risk?: string;
  /**
   * The positions this rule used to state, oldest first — see
   * `RuleHistoryEntry`. Absent on every rule no machine has ever rewritten.
   */
  history?: RuleHistoryEntry[];
  /**
   * Who settled the coherence question this rule was part of, and when —
   * stamped on BOTH rules when the Expert rules on a tension, so a reader of
   * either rule alone can see that a human decided this. Absent means nobody
   * has.
   */
  settled_by?: string;
  settled_at?: string;
}

/**
 * How a rule was reviewed before it was approved. `sample_size` and `of` are
 * present only on `"sampled"`.
 */
export interface RuleReview {
  mode: "read" | "sampled";
  sample_size?: number;
  of?: number;
  by?: string;
  at?: string;
}

/**
 * The one review state of a rule — precedence
 * retired > rejected > draft > approved.
 *
 * 🚨 There is no `evidence` state any more. For a few hours a rule read from
 * ONE piece of a body of work sat here as `"evidence"`, below `draft`, hidden
 * from the queue and the counters until it recurred. Frequency is not
 * existence: a judgment stated once is a rule, and volume is answered by the
 * default view, sections, and a bulk approve that records what was read.
 */
export type RuleState = "approved" | "draft" | "rejected" | "retired";

export function ruleState(rule: RulebookRule): RuleState {
  if (rule.retired === true) return "retired";
  if (rule.rejected === true) return "rejected";
  if (rule.draft === true) return "draft";
  return "approved";
}

/**
 * How many distinct pieces of this rule's own source produced it. The
 * recurrence BADGE's number — it gates nothing.
 */
export function recurrencePieces(rule: RulebookRule): number {
  return new Set(rule.source_ref?.evidence_pieces ?? []).size;
}

/** The ids this rule is documented as disagreeing with. */
export function disagreesWith(rule: RulebookRule): string[] {
  return (rule.relates_to ?? [])
    .filter((r) => r.kind === "disagrees_with")
    .map((r) => r.rule_id);
}

/** The source identity this rule was read from — "" when it carries none. */
export function ruleSource(rule: RulebookRule): string {
  return rule.source_ref?.source ?? "";
}

/**
 * The rules only ONE source holds: every rule whose statement no other source
 * in this Rulebook also states. These plus the disagreements are what a large
 * Rulebook opens on — the judgments nobody else corroborated are exactly the
 * ones a bulk approve must not swallow.
 */
export function heldByOneSourceOnly(
  rules: readonly RulebookRule[],
): Set<string> {
  const sourcesByStatement = new Map<string, Set<string>>();
  for (const rule of rules) {
    const key = rule.statement.trim().toLowerCase();
    const set = sourcesByStatement.get(key) ?? new Set<string>();
    set.add(ruleSource(rule));
    sourcesByStatement.set(key, set);
  }
  return new Set(
    rules
      .filter(
        (rule) =>
          (sourcesByStatement.get(rule.statement.trim().toLowerCase())?.size ??
            1) <= 1,
      )
      .map((rule) => rule.id),
  );
}

/**
 * 🚨 THE ONE STAMP. Every approve, reject and edit that goes through the write
 * path carries who ruled and when — and, on an approval, what they actually
 * read. A caller never writes these fields itself.
 */
export function stampRuled(
  rule: RulebookRule,
  by: string | null,
  reviewed?: RuleReview,
): RulebookRule {
  const at = new Date().toISOString();
  return {
    ...rule,
    ...(by ? { ruled_by: by } : {}),
    ruled_at: at,
    ...(reviewed ? { reviewed: { ...reviewed, ...(by ? { by } : {}), at } } : {}),
  };
}

/** The fields an edit can change — the content of a rule, as opposed to its review state. */
export const RULE_CONTENT_FIELDS = [
  "name",
  "statement",
  "rationale",
  "detection",
  "quote",
  "severity",
  "section",
] as const;

function contentChanged(prev: RulebookRule, next: RulebookRule): boolean {
  return RULE_CONTENT_FIELDS.some(
    (field) => (prev[field] ?? "") !== (next[field] ?? ""),
  );
}

/**
 * SAVING AN EDIT IS NOT APPROVING (Arman, 2026-08-17: "save rule is actually
 * approving even though it shouldn't approve. You're updating the data, not
 * approving it."). The ONE merge for a manual edit-save — the full matrix is
 * documented in FEATURE.md § The review-verb matrix:
 *
 * - `draft` / approved status is PRESERVED exactly. A draft the Expert
 *   corrected is still a draft awaiting the explicit Approve button; an
 *   approved rule they touched stays approved.
 * - `rejected` + `feedback` survive an edit that changes NOTHING — but a
 *   content-changing edit RESOLVES them: those flags are messages to the
 *   Scout about the OLD text, and the Expert's own hand supersedes the note
 *   they wrote for the agent. A resolved rejected rule returns to the
 *   Expert's own draft queue (still not approved — save is never approve).
 */
export function applyManualRuleEdit(
  prev: RulebookRule,
  edited: RulebookRule,
): RulebookRule {
  if (!contentChanged(prev, edited)) return { ...prev, ...edited };
  const merged = { ...prev, ...edited };
  delete merged.rejected;
  delete merged.feedback;
  return merged;
}

export interface RulebookSectionDef {
  label: string;
}

/** Section code → definition, e.g. { U: { label: "Elementary Rules of Usage" } } */
export type RulebookSections = Record<string, RulebookSectionDef>;

export interface RulebookSource {
  title?: string;
  author?: string;
  year?: number | string;
  provenance_url?: string;
  license?: string;
  note?: string;
}

/**
 * A URL staged for the dump Approach — durable on
 * `rulebook.metadata.dump_url_sources` (guarded CAS writes only; see
 * `writeDumpUrlSources` in service.ts). The scrape-on-add preview is honest UI
 * only: the SERVER re-fetches every URL through the policy-enforcing scraper
 * at run time, so nothing but the address and a display title is stored here.
 */
export interface DumpUrlSource {
  url: string;
  title?: string;
  added_at: string;
}

/** The staged dump URLs off a Rulebook's metadata (tolerant read). */
export function dumpUrlSources(rulebook: Rulebook): DumpUrlSource[] {
  const meta = rulebook.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
  const raw = (meta as Record<string, unknown>).dump_url_sources;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const rec = item as Record<string, unknown>;
    if (typeof rec.url !== "string" || !rec.url.trim()) return [];
    return [
      {
        url: rec.url,
        ...(typeof rec.title === "string" && rec.title.trim()
          ? { title: rec.title }
          : {}),
        added_at:
          typeof rec.added_at === "string" ? rec.added_at : new Date(0).toISOString(),
      },
    ];
  });
}

/** The parsed Rulebook — Row with its JSONB columns given their real shapes. */
export interface Rulebook
  extends Omit<RulebookRow, "rules" | "sections" | "source"> {
  rules: RulebookRule[];
  sections: RulebookSections;
  source: RulebookSource;
}

/** Narrow list-row projection for the /masterwork list page. */
export interface RulebookListRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  source: RulebookSource;
  version: number;
  status: RulebookStatus;
  visibility: RulebookVisibility;
  rule_count: number;
  created_by: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * A Masterwork (the workflow projection) built from a Rulebook — read from
 * workflow.definition metadata stamps.
 *
 * Lifecycle: every Build lands as a DRAFT. The Expert releases it from the
 * Studio (`metadata.released_at` gets stamped); only a released Masterwork
 * appears on /masterwork/encore, where an Operator runs it. Un-release clears the stamp.
 */
export interface Masterwork {
  id: string;
  name: string;
  description: string | null;
  masterwork_kind: string | null;
  built_from_rulebook: string | null;
  rulebook_version: number | null;
  /**
   * WHAT THIS SYSTEM MAKES, in the Expert's own words — the answer they typed
   * into "What does it hand you when it's done?" at build time, stamped onto
   * the definition by the builder. Arman, 2026-08-24, staring at a freshly
   * built system: "no custom inputs, nothing that tells me I've now created a
   * workflow for keywords." The builder knew and threw it away; now every
   * surface that shows a Masterwork can say what it makes.
   */
  deliverable: string | null;
  /** Approved rules it was built from — the "checked against N rules" line. */
  rule_count: number | null;
  /** generate only: how many drafts it writes before picking a winner. */
  variant_count: number | null;
  /**
   * The run button's words, designed with the intake by the builder
   * ("Find my keywords"). Null = the button shows its icon alone rather than
   * inventing a verb (Arman, 2026-08-25).
   */
  submit_label: string | null;
  /** When the Expert released it to Operators; null = draft (Studio-only). */
  released_at: string | null;
  /**
   * True for the Rulebook's Understudy — the crude one-agent system that runs
   * from minute one and is rebuilt free on every rules save. Never releasable;
   * rendered on the Rulebook page, not in the built-Masterworks list.
   */
  understudy: boolean;
  /**
   * Understudy only — WHEN this stand-in was last rebuilt from the Rulebook,
   * and WHAT it was rebuilt from. Stamped by aidream's understudy builder into
   * the workflow row's metadata on every rebuild. The card shows both, because
   * a stand-in silently two hours behind the rules is the same lie as a stale
   * cache: on 2026-09-12 an Expert approved 88 rules and tested a stand-in
   * that had seen none of them. Null on a row built before the stamp existed.
   */
  understudy_refreshed_at: string | null;
  /** Understudy only — the rule counts baked into the running stand-in. */
  understudy_rules: { approved: number; unconfirmed: number } | null;
  /**
   * THE ARCHIVED-ITEMS LAW (`common-docs/policies/archived-items.md`, Arman
   * 2026-09-09). `workflow.definition.is_archived` — carried on EVERY
   * Masterwork read so no surface downstream can mistake an archived system
   * for a live one. Archived ≠ deleted: it stays reachable, one click away,
   * behind the surface's `ArchivedDisclosure`.
   */
  is_archived: boolean;
  /** workflow.definition row version — the CAS token for release writes. */
  version: number;
  created_at: string;
  updated_at: string;
  visibility: string;
}

export function parseRulebook(row: RulebookRow): Rulebook {
  return {
    ...row,
    rules: Array.isArray(row.rules)
      ? (row.rules as unknown as RulebookRule[])
      : [],
    sections:
      row.sections && typeof row.sections === "object" && !Array.isArray(row.sections)
        ? (row.sections as unknown as RulebookSections)
        : {},
    source:
      row.source && typeof row.source === "object" && !Array.isArray(row.source)
        ? (row.source as unknown as RulebookSource)
        : {},
  };
}

export const SEVERITY_LABELS: Record<RuleSeverity, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
};

export const STATUS_LABELS: Record<RulebookStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};
