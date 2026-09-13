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

/** What the Expert DID at this step. A closed vocabulary. */
export const RULE_ACTION_KINDS = [
  "ask",
  "test",
  "treat",
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
  test: "Test",
  treat: "Treat",
  refer: "Refer",
  wait: "Wait",
  commit: "Commit",
};

/**
 * The one-line explanation the Expert picks from in the rule form — the SAME
 * vocabulary as `RULE_ACTION_KIND_LABELS`, keyed by the same values, never a
 * second list of moves. A label names the move; a hint says what it means to
 * someone who has never read our docs.
 */
export const RULE_ACTION_KIND_HINTS: Record<RuleActionKind, string> = {
  ask: "get more information from the person",
  test: "run a check or a measurement",
  treat: "act on the situation itself",
  refer: "hand it to someone else",
  wait: "deliberately do nothing yet, and re-look",
  commit: "settle on the answer and proceed",
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
   * 🚨 THE DECISION HALF (W58, 2026-09-12) — see `RULE_POLICY_KIND` above.
   * `"policy"` means this rule is a judgment made under uncertainty, not a
   * standing commandment: "given what is known at this point, do this ONE
   * thing next, at this cost and this risk". The five fields below carry it.
   * Absent on an ordinary rule, and absent on every rule written before
   * 2026-09-12 — absence means "a standing commandment".
   *
   * Deliberately NOT in `RULE_CONTENT_FIELDS`: that list is the prose fields a
   * manual edit compares, and these are set through the `rulebook` tool's
   * `update_rule`, one field at a time.
   *
   * The stored values are plain strings because the SERVER owns the
   * vocabularies; read them through `ruleActionKind` / `rulePolicyLevel`,
   * which return a value only when it is one the server would have kept.
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
 * 🚨 THE ONE RULE-FORM FIELD SET (W58, 2026-09-12). Every field the rule form
 * owns — the prose, the classifications, AND the decision shape — lives in this
 * ONE shape, and every consumer (the editor's form state, its persisted draft,
 * the Add-rule window, the context menu's text replacement) derives from it.
 *
 * The wall it closes: the decision fields were added beside the prose fields as
 * a second, parallel set of state. They were absent from the draft snapshot,
 * from the draft restore, and from the open/reset effect, so Cancel-then-reopen
 * kept a cancelled toggle and a later Save silently converted or stripped a
 * policy rule (Bugbot, c016fe96). A field that rides this set cannot be
 * forgotten by one consumer and remembered by another.
 *
 * The decision fields speak the ONE vocabulary — `RuleActionKind` and
 * `RulePolicyLevel`, mirrored from the server — never a second one.
 */
export interface RuleFieldValues {
  name: string;
  statement: string;
  rationale: string;
  detection: string;
  quote: string;
  severity: RuleSeverity;
  section: string;
  /** `true` reveals the decision fields; they are carried on the rule itself
   * (`kind: "policy"`) — see `policyRulePatch`, the ONE storage mapping. */
  isPolicy: boolean;
  precondition: string;
  nextAction: string;
  actionKind: RuleActionKind;
  cost: RulePolicyLevel;
  risk: RulePolicyLevel;
}

/** Every key of the form set — the enumeration `mergeRuleFieldValues` walks, so
 * a new field reaches every consumer by being added to `RuleFieldValues`. */
export const RULE_FIELD_KEYS = [
  "name",
  "statement",
  "rationale",
  "detection",
  "quote",
  "severity",
  "section",
  "isPolicy",
  "precondition",
  "nextAction",
  "actionKind",
  "cost",
  "risk",
] as const satisfies ReadonlyArray<keyof RuleFieldValues>;

/**
 * The form's TEXT fields, keyed by the DOM id suffix `RuleFields` renders them
 * under (`${idPrefix}-<suffix>`). The editor's context-menu replacement derives
 * its accepted targets from here rather than hand-listing ids, so a new text
 * field can never be replaceable in the form but unknown to the menu.
 */
export const RULE_FIELD_ELEMENT_IDS = {
  name: "name",
  statement: "statement",
  rationale: "rationale",
  detection: "detection",
  quote: "quote",
  precondition: "precondition",
  "next-action": "nextAction",
} as const satisfies Record<string, keyof RuleFieldValues>;

export type RuleTextField = (typeof RULE_FIELD_ELEMENT_IDS)[keyof typeof RULE_FIELD_ELEMENT_IDS];

/**
 * Which form field a focused element edits, or null when the focus is not on
 * one. `idPrefix` matches `RuleFields`' own prop.
 */
export function ruleFieldForElementId(
  elementId: string | null | undefined,
  idPrefix = "rule",
): RuleTextField | null {
  if (!elementId || !elementId.startsWith(`${idPrefix}-`)) return null;
  const suffix = elementId.slice(idPrefix.length + 1);
  return (
    (RULE_FIELD_ELEMENT_IDS as Record<string, RuleTextField | undefined>)[
      suffix
    ] ?? null
  );
}

/** The decision-field defaults of an ordinary (non-policy) rule. */
export const POLICY_FIELD_DEFAULTS = {
  isPolicy: false,
  precondition: "",
  nextAction: "",
  actionKind: "ask",
  cost: "low",
  risk: "low",
} as const satisfies Pick<
  RuleFieldValues,
  "isPolicy" | "precondition" | "nextAction" | "actionKind" | "cost" | "risk"
>;

/**
 * THE ONE derivation of form values from a saved rule — what the editor shows
 * when nothing is staged, and what a Cancel returns to. A rule with no policy
 * shape reads as the ordinary defaults; a policy rule reads its own.
 */
export function ruleFieldValues(
  rule: RulebookRule | undefined,
  opts: { defaultSection: string },
): RuleFieldValues {
  return {
    name: rule?.name ?? "",
    statement: rule?.statement ?? "",
    rationale: rule?.rationale ?? "",
    detection: rule?.detection ?? "",
    quote: rule?.quote ?? "",
    severity: rule?.severity ?? "major",
    section: rule?.section ?? opts.defaultSection,
    isPolicy: rule ? isPolicyRule(rule) : false,
    precondition: rule?.precondition ?? "",
    nextAction: rule?.next_action ?? "",
    actionKind:
      (rule ? ruleActionKind(rule) : null) ?? POLICY_FIELD_DEFAULTS.actionKind,
    cost: rulePolicyLevel(rule?.cost) ?? POLICY_FIELD_DEFAULTS.cost,
    risk: rulePolicyLevel(rule?.risk) ?? POLICY_FIELD_DEFAULTS.risk,
  };
}

/**
 * Lay a staged or persisted draft over the saved values. Only keys the draft
 * actually carries win — an older draft written before a field existed leaves
 * that field on the saved rule instead of blanking it.
 */
export function mergeRuleFieldValues(
  base: RuleFieldValues,
  patch: Partial<RuleFieldValues> | null | undefined,
): RuleFieldValues {
  if (!patch) return { ...base };
  const next = { ...base };
  for (const key of RULE_FIELD_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    // Each key's value type is its own; the enumeration is the guarantee.
    (next as Record<string, unknown>)[key] = value;
  }
  return next;
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
  // The policy shape is CONTENT, not structure: changing the next action is
  // changing the rule, so it resolves a rejection exactly like a statement
  // edit does. (`relates_to` stays out — it is structural.)
  "kind",
  "precondition",
  "next_action",
  "action_kind",
  "cost",
  "risk",
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

/**
 * What the Expert said this Rulebook is FOR, from her own intake answer
 * (`metadata.intake.goal`). Tolerant read: an older Rulebook whose intake never
 * asked, or was never answered, has none, and an empty string is the honest
 * answer — never a placeholder sentence nobody said.
 */
export function intakeGoal(rulebook: Rulebook): string {
  const meta = rulebook.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return "";
  const intake = (meta as Record<string, unknown>).intake;
  if (!intake || typeof intake !== "object" || Array.isArray(intake)) return "";
  const goal = (intake as Record<string, unknown>).goal;
  return typeof goal === "string" ? goal.trim() : "";
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
